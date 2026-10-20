import { randomUUID } from "node:crypto";
import {
  AGENT_URL,
  BRIDGE_URL,
  assert,
  ensureService,
  runAgent,
  stopAll,
  textOf,
} from "./harness.mjs";

const CATALOG_ID = "arb://catalog/request-builder.v1";
const PUBLISH_TOOL = "publish_fixture_operations";
const REVIEW_ACTION = "reviewRequest";
const DISCARD_ACTION = "discardSurface";

function a2uiOperations(events) {
  const activity = events
    .filter(
      (event) =>
        event.type === "ACTIVITY_SNAPSHOT" &&
        event.activityType === "a2ui-surface",
    )
    .at(-1);
  assert(activity, "run must emit an a2ui-surface activity");
  return {
    activity,
    operations: Array.isArray(activity.content?.a2ui_operations)
      ? activity.content.a2ui_operations
      : [],
  };
}

function operationKinds(operations) {
  return operations.map(
    (operation) =>
      Object.keys(operation).find((key) => key !== "version") ?? "unknown",
  );
}

function surfaceIdOf(operations) {
  for (const operation of operations) {
    const surfaceId =
      operation.createSurface?.surfaceId ??
      operation.updateComponents?.surfaceId ??
      operation.updateDataModel?.surfaceId ??
      operation.deleteSurface?.surfaceId;
    if (typeof surfaceId === "string") {
      return surfaceId;
    }
  }
  return undefined;
}

function componentsOf(operations) {
  const operation = operations.find((entry) => entry.updateComponents);
  return Array.isArray(operation?.updateComponents?.components)
    ? operation.updateComponents.components
    : [];
}

function dataOf(operations) {
  const operation = operations.find(
    (entry) => entry.updateDataModel?.path === "/",
  );
  return operation?.updateDataModel?.value ?? {};
}

function draftPaths(components) {
  const paths = new Set();
  for (const component of components) {
    if (component.component === "TextField" || component.component === "ChoicePicker") {
      const path = component.value?.path;
      if (typeof path === "string" && path.startsWith("/draft/")) {
        paths.add(path);
      }
    }
  }
  return paths;
}

function actionOf(components, componentId) {
  const component = components.find((entry) => entry.id === componentId);
  assert(component, `fixture must include component ${componentId}`);
  const event = component.action?.event;
  assert(event && typeof event.name === "string", `${componentId} must use action.event`);
  assert(
    event.context &&
      typeof event.context === "object" &&
      !Array.isArray(event.context),
    `${componentId} must include an object context`,
  );
  return event;
}

function buildResolvedContext(actionContext, values, revision) {
  const context = {};
  for (const [key, value] of Object.entries(actionContext)) {
    assert(
      value && typeof value === "object" && typeof value.path === "string",
      `action context ${key} must be a {path} object`,
    );
    if (value.path === "/meta/revision") {
      context[key] = revision;
      continue;
    }
    assert(
      value.path.startsWith("/draft/"),
      `action context ${key} must target a draft path, got ${value.path}`,
    );
    const fieldKey = value.path.slice("/draft/".length);
    assert(
      Object.prototype.hasOwnProperty.call(values, fieldKey),
      `test values must include field ${fieldKey}`,
    );
    context[key] = values[fieldKey];
  }
  return context;
}

function baseBody(threadId, userMessage) {
  return {
    threadId,
    protocolVersion: "1.0",
    tools: [],
    context: [],
    state: {},
    messages: [userMessage],
    forwardedProps: { a2uiCatalogAvailable: true },
  };
}

async function startFixture(prompt) {
  const threadId = randomUUID();
  const userMessage = {
    id: randomUUID(),
    role: "user",
    content: prompt,
  };
  const events = await runAgent({
    ...baseBody(threadId, userMessage),
    runId: randomUUID(),
  });
  const types = events.map((event) => event.type);
  for (const required of [
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "TOOL_CALL_START",
    "TOOL_CALL_RESULT",
    "ACTIVITY_SNAPSHOT",
    "STATE_SNAPSHOT",
    "RUN_FINISHED",
  ]) {
    assert(types.includes(required), `initial run must include ${required}`);
  }
  assert(!types.includes("RUN_ERROR"), "initial run must not emit RUN_ERROR");
  const plannerTools = events
    .filter((event) => event.type === "TOOL_CALL_START")
    .map((event) => event.toolCallName);
  assert(plannerTools.includes(PUBLISH_TOOL), "fixture publish tool must be called");
  assert(
    !plannerTools.includes("render_a2ui") &&
      !plannerTools.includes("generate_a2ui"),
    "fixture mode must not expose A2UI generator tools",
  );

  const { activity, operations } = a2uiOperations(events);
  assert(
    operationKinds(operations).join(",") ===
      "createSurface,updateComponents,updateDataModel",
    "fixture create must emit createSurface, updateComponents, updateDataModel",
  );
  const surfaceId = surfaceIdOf(operations);
  assert(typeof surfaceId === "string", "createSurface must carry a surface ID");
  assert(
    operations[0]?.createSurface?.catalogId === CATALOG_ID,
    "createSurface catalog ID must match the shared catalog",
  );
  assert(
    operations.every((operation) => surfaceIdOf([operation]) === surfaceId),
    "all create operations must target the same surface",
  );

  const components = componentsOf(operations);
  const data = dataOf(operations);
  const fields = draftPaths(components);
  assert(fields.size > 0, "fixture must bind draft fields");
  for (const fieldPath of fields) {
    const fieldKey = fieldPath.slice("/draft/".length);
    assert(
      Object.prototype.hasOwnProperty.call(data.draft ?? {}, fieldKey),
      `fixture data must initialize ${fieldPath}`,
    );
  }
  assert(
    fields.has("/draft/title") && fields.has("/draft/details"),
    "fixture must bind canonical /draft/title and /draft/details",
  );

  const review = actionOf(components, "review");
  assert(review.name === REVIEW_ACTION, "review button must use reviewRequest");
  assert(
    actionOf(components, "discard").name === DISCARD_ACTION,
    "discard button must use discardSurface",
  );
  const reviewPaths = new Set(
    Object.values(review.context)
      .map((value) => value.path)
      .filter((path) => typeof path === "string"),
  );
  for (const fieldPath of fields) {
    assert(reviewPaths.has(fieldPath), `review context must include ${fieldPath}`);
  }
  assert(reviewPaths.has("/meta/revision"), "review context must include revision");

  const stateSnapshot = events
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  assert(
    stateSnapshot?.surfaceId === surfaceId,
    "STATE_SNAPSHOT must include the surface ID",
  );
  assert(stateSnapshot?.mode === "fixture", "agent must report fixture mode");
  assert(stateSnapshot?.status === "editing", "new fixture must start editing");
  assert(stateSnapshot?.revision === 0, "new fixture must start at revision 0");
  const messagesSnapshot = events
    .filter((event) => event.type === "MESSAGES_SNAPSHOT")
    .at(-1)?.messages;
  assert(Array.isArray(messagesSnapshot), "initial run must emit messages snapshot");
  assert(
    textOf(events).includes("FIXTURE - NO LIVE MODEL"),
    "fixture text must be visibly labeled",
  );

  return {
    threadId,
    events,
    surfaceId,
    activityMessageId: activity.messageId,
    stateSnapshot,
    messagesSnapshot,
    components,
    data,
    fields,
    review,
    discard: actionOf(components, "discard"),
  };
}

async function runAction(fixture, action, context) {
  return runAgent({
    ...baseBody(fixture.threadId, {
      id: randomUUID(),
      role: "user",
      content: "",
    }),
    state: fixture.stateSnapshot ?? {},
    messages: fixture.messagesSnapshot ?? [],
    runId: randomUUID(),
    forwardedProps: {
      a2uiCatalogAvailable: true,
      a2uiAction: {
        userAction: {
          name: action,
          surfaceId: fixture.surfaceId,
          sourceComponentId: action === REVIEW_ACTION ? "review" : "discard",
          context,
          timestamp: new Date().toISOString(),
        },
      },
    },
  });
}

function assertNoRunError(events, label) {
  assert(
    !events.some((event) => event.type === "RUN_ERROR"),
    `${label} run must not emit RUN_ERROR`,
  );
}

async function main() {
  await ensureService({
    name: "agent",
    url: `${AGENT_URL}/ok`,
    command: "npm run dev:agent",
    env: { AGENT_MODE: "fixture" },
  });
  await ensureService({
    name: "bridge",
    url: `${BRIDGE_URL}/api/health`,
    command: "npm run dev:server",
    env: { AGENT_MODE: "fixture" },
  });

  const health = await fetch(`${BRIDGE_URL}/api/health`).then((response) =>
    response.json(),
  );
  assert(health.mode === "fixture", "bridge must report fixture mode");
  assert(health.catalogId === CATALOG_ID, "bridge catalog ID must match shared");
  assert(
    health.a2ui?.injectA2UITool === false,
    "bridge must disable the injected render_a2ui tool",
  );

  const bug = await startFixture("I found a login bug. Help me report it.");
  assert(bug.fields.has("/draft/severity"), "bug fixture must include severity");
  assert(bug.fields.has("/draft/expected"), "bug fixture must include expected behavior");
  assert(bug.fields.has("/draft/actual"), "bug fixture must include actual behavior");

  const feature = await startFixture("I want to propose a new dashboard feature.");
  assert(feature.fields.has("/draft/priority"), "feature fixture must include priority");
  assert(feature.fields.has("/draft/outcome"), "feature fixture must include outcome");
  assert(
    !feature.fields.has("/draft/severity"),
    "feature fixture must differ from the bug fixture",
  );

  const meeting = await startFixture("I need to arrange a project review meeting.");
  for (const path of [
    "/draft/attendees",
    "/draft/duration",
    "/draft/preferred_time",
  ]) {
    assert(meeting.fields.has(path), `meeting fixture must include ${path}`);
  }

  const custom = await startFixture("Please help me describe a custom request.");
  assert(custom.fields.size === 2, "custom fixture must keep canonical title/details only");
  assert(custom.data.draft?.title === "", "custom title must be initialized");
  assert(custom.data.draft?.details === "", "custom details must be initialized");

  const surfaceIds = new Set(
    [bug, feature, meeting, custom].map((fixture) => fixture.surfaceId),
  );
  assert(
    surfaceIds.size === 4,
    "each fixture thread must derive its own surface ID",
  );

  const bugValues = {
    title: "Login fails on Safari",
    details: "Open the login page and submit valid credentials.",
    expected: "The dashboard appears.",
    actual: "The page reloads without a session.",
    severity: ["high"],
  };
  const reviewed = await runAction(
    bug,
    REVIEW_ACTION,
    buildResolvedContext(bug.review.context, bugValues, 0),
  );
  assertNoRunError(reviewed, "valid review");
  const reviewActivity = a2uiOperations(reviewed);
  const reviewKinds = operationKinds(reviewActivity.operations);
  assert(
    reviewKinds.join(",") === "updateComponents,updateDataModel,updateDataModel,updateDataModel",
    "valid review must update the same surface without createSurface",
  );
  assert(
    surfaceIdOf(reviewActivity.operations) === bug.surfaceId,
    "valid review must keep the same surface ID",
  );
  assert(
    reviewActivity.activity.messageId === bug.activityMessageId,
    "valid review must reuse the stable activity message ID",
  );
  const reviewUpdates = reviewActivity.operations.filter(
    (operation) => operation.updateDataModel,
  );
  assert(
    reviewUpdates.some(
      (operation) =>
        operation.updateDataModel.path === "/meta/revision" &&
        operation.updateDataModel.value === 1,
    ),
    "valid review must path-scope /meta/revision to 1",
  );
  assert(
    reviewUpdates.some(
      (operation) =>
        operation.updateDataModel.path === "/meta/status" &&
        operation.updateDataModel.value === "review",
    ),
    "valid review must path-scope /meta/status to review",
  );
  const reviewedState = reviewed
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  assert(reviewedState?.status === "review", "state must reach review");
  assert(reviewedState?.revision === 1, "state must advance to revision 1");
  assert(
    textOf(reviewed).includes("Review saved at revision 1"),
    "review text must report the trusted revision",
  );

  const threadState = await fetch(
    `${AGENT_URL}/threads/${bug.threadId}/state`,
  ).then((response) => response.json());
  const messages = threadState.values?.messages ?? [];
  const actionCall = messages
    .flatMap((message) =>
      Array.isArray(message.tool_calls) ? message.tool_calls : [],
    )
    .find((call) => call.name === "log_a2ui_event");
  assert(
    actionCall && typeof actionCall.id === "string",
    "checkpoint must retain the log_a2ui_event tool call",
  );
  const actionResult = messages.find(
    (message) =>
      message.type === "tool" && message.tool_call_id === actionCall.id,
  );
  assert(
    actionResult &&
      typeof actionResult.content === "string" &&
      actionResult.content.includes('"action":"reviewRequest"') &&
      !actionResult.content.includes(bugValues.title) &&
      !actionResult.content.includes(JSON.stringify(bugValues.severity)),
    "checkpoint must compact the consumed action pair after validation",
  );
  assert(
    !JSON.stringify(actionCall.args ?? {}).includes(bugValues.title),
    "checkpoint must not retain resolved values in compacted action args",
  );

  const invalidValues = {
    title: "",
    details: "",
    outcome: "",
    priority: [],
  };
  const invalid = await runAction(
    feature,
    REVIEW_ACTION,
    buildResolvedContext(feature.review.context, invalidValues, 0),
  );
  assertNoRunError(invalid, "invalid review");
  const invalidActivity = a2uiOperations(invalid);
  const invalidKinds = operationKinds(invalidActivity.operations);
  assert(
    invalidKinds.includes("updateComponents") &&
      invalidKinds.includes("updateDataModel"),
    "invalid review must update the same surface with validation feedback",
  );
  assert(
    invalidKinds.filter((kind) => kind === "createSurface").length === 0,
    "invalid review must not create a second surface",
  );
  assert(
    surfaceIdOf(invalidActivity.operations) === feature.surfaceId,
    "invalid review must keep the same surface ID",
  );
  assert(
    invalidActivity.activity.messageId === feature.activityMessageId,
    "invalid review must reuse the stable activity message ID",
  );
  const invalidDataUpdates = invalidActivity.operations.filter(
    (operation) => operation.updateDataModel,
  );
  assert(
    invalidDataUpdates.some(
      (operation) => operation.updateDataModel.path === "/errors",
    ),
    "invalid review must publish path-scoped validation errors",
  );
  assert(
    invalidDataUpdates.every(
      (operation) => operation.updateDataModel.path !== "/meta/revision",
    ),
    "invalid review must not advance the revision",
  );
  const invalidState = invalid
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  assert(invalidState?.status === "editing", "invalid review must stay editing");
  assert(invalidState?.revision === 0, "invalid review must keep revision 0");
  assert(
    textOf(invalid).includes("Validation failed"),
    "invalid review text must report validation failure",
  );

  const discard = await runAction(meeting, DISCARD_ACTION, { revision: 0 });
  assertNoRunError(discard, "discard");
  const discardActivity = a2uiOperations(discard);
  assert(
    operationKinds(discardActivity.operations).join(",") === "deleteSurface",
    "discard must emit exactly one deleteSurface operation",
  );
  assert(
    surfaceIdOf(discardActivity.operations) === meeting.surfaceId,
    "deleteSurface must target the original surface ID",
  );
  assert(
    discardActivity.activity.messageId === meeting.activityMessageId,
    "deleteSurface must reuse the stable activity message ID",
  );
  const discardState = discard
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  assert(discardState?.surfaceId === null, "discard must clear the active surface");
  assert(discardState?.revision === 0, "discard must reset revision");
  assert(
    textOf(discard).includes("Discarded"),
    "discard response must report removal",
  );

  const stale = await runAction(custom, REVIEW_ACTION, {
    title: "Stale title",
    details: "Stale details",
    revision: 9,
  });
  assertNoRunError(stale, "stale review");
  assert(
    !stale.some(
      (event) =>
        event.type === "ACTIVITY_SNAPSHOT" &&
        event.activityType === "a2ui-surface",
    ),
    "stale action must not paint or update a surface",
  );
  const staleState = stale
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  assert(staleState?.revision === 0, "stale action must not mutate the revision");
  assert(
    textOf(stale).includes("Rejected stale action"),
    "stale action text must state the rejection",
  );

  console.info(
    "[e2e] Stage 2 fixture PASS: four fixed A2UI surfaces, same-surface review update, in-surface validation, deleteSurface, and stale-action rejection",
  );
  console.info(
    `[e2e] surfaces bug=${bug.surfaceId} feature=${feature.surfaceId} meeting=${meeting.surfaceId} custom=${custom.surfaceId}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    stopAll();
  });
