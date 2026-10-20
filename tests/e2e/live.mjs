import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  AGENT_URL,
  BRIDGE_URL,
  assert,
  ensureService,
  isUp,
  runAgent,
  stopAll,
  textOf,
} from "./harness.mjs";

const CATALOG_ID = "arb://catalog/request-builder.v1";
const REVIEW_ACTION = "reviewRequest";
const SUBMIT_ACTION = "submitDemoRequest";
const APPLY_TOOL = "apply_request_changes";
const SIMULATION_NOTICE = "Demo only - nothing was sent.";

const modelId = process.env.MODEL_ID?.trim();
const apiKey = process.env.MODEL_API_KEY?.trim();

if (!modelId || !apiKey) {
  console.error(
    "[e2e] BLOCKED: the live model gate requires MODEL_ID and MODEL_API_KEY. " +
      "Fixture results are not accepted as live evidence. Configure both and rerun npm run test:e2e:live.",
  );
  process.exit(2);
}

const CASES = [
  {
    label: "bug",
    prompt:
      "I found a login bug where Safari users are signed out. Create a bug request form.",
  },
  {
    label: "feature",
    prompt:
      "I want to propose a new dashboard feature for weekly team metrics. Create a feature request form.",
  },
  {
    label: "meeting",
    prompt:
      "I need to arrange a project review meeting with invented attendees. Create a meeting request form.",
  },
  {
    label: "custom",
    prompt:
      "Create a request form for ordering a new laptop and tracking its approval.",
  },
];

function surfaceIdFor(threadId) {
  return `surface-${threadId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}`;
}

function finalActivity(events) {
  return events
    .filter(
      (event) =>
        event.type === "ACTIVITY_SNAPSHOT" &&
        event.activityType === "a2ui-surface" &&
        Array.isArray(event.content?.a2ui_operations),
    )
    .at(-1);
}

function operationKind(operation) {
  return Object.keys(operation).find((key) => key !== "version") ?? "unknown";
}

function draftPath(component) {
  return component?.value?.path;
}

function readPath(root, path) {
  if (!path || path === "/") {
    return root;
  }
  return path
    .split("/")
    .filter(Boolean)
    .reduce(
      (value, part) =>
        value && typeof value === "object" ? value[part] : undefined,
      root,
    );
}

function setPath(root, path, value) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return value;
  }
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
  return root;
}

function operationsOf(activity) {
  return Array.isArray(activity?.content?.a2ui_operations)
    ? activity.content.a2ui_operations
    : [];
}

function applyActivity(surface, activity) {
  for (const operation of operationsOf(activity)) {
    if (operation.createSurface) {
      surface.surfaceId = operation.createSurface.surfaceId;
      surface.components = [];
      surface.data = {};
      continue;
    }
    if (operation.updateComponents) {
      surface.components = operation.updateComponents.components;
      continue;
    }
    if (operation.updateDataModel) {
      const path = operation.updateDataModel.path ?? "/";
      if (path === "/") {
        surface.data =
          operation.updateDataModel.value && typeof operation.updateDataModel.value === "object"
            ? operation.updateDataModel.value
            : {};
      } else {
        setPath(surface.data, path, operation.updateDataModel.value);
      }
    }
  }
  return surface;
}

function dataPaths(activity) {
  return operationsOf(activity)
    .filter((operation) => operation.updateDataModel)
    .map((operation) => operation.updateDataModel.path ?? "/");
}

function assertSameSurface(activity, surfaceId, label) {
  const operations = operationsOf(activity);
  assert(
    operations.every((operation) => !operation.createSurface),
    `${label} must not create another surface`,
  );
  assert(
    operations.every(
      (operation) =>
        operation.updateComponents?.surfaceId === surfaceId ||
        operation.updateDataModel?.surfaceId === surfaceId,
    ),
    `${label} must update only surface ${surfaceId}`,
  );
}

function assertPublicState(snapshot, label) {
  assert(snapshot, `${label} must emit a final STATE_SNAPSHOT`);
  for (const key of [
    "surface",
    "surfaceState",
    "components",
    "fields",
    "values",
    "reviewedValues",
    "reviewedRevision",
    "draft",
  ]) {
    assert(
      !(key in snapshot),
      `${label} STATE_SNAPSHOT must not expose private checkpoint key '${key}'`,
    );
  }
}

function buttonFor(surface, actionName) {
  return [...surface.components]
    .reverse()
    .find(
      (component) =>
        component.component === "Button" &&
        component.action?.event?.name === actionName,
    );
}

function resolveActionContext(button, data) {
  const context = {};
  for (const [key, binding] of Object.entries(
    button.action?.event?.context ?? {},
  )) {
    context[key] =
      binding && typeof binding === "object" && typeof binding.path === "string"
        ? readPath(data, binding.path)
        : binding;
  }
  return context;
}

function buildActionRun({ surface, button, actionName, overrides = {} }) {
  const context = resolveActionContext(button, surface.data);
  return {
    userAction: {
      name: actionName,
      surfaceId: surface.surfaceId,
      sourceComponentId: button.id,
      context: { ...context, ...overrides },
      timestamp: new Date().toISOString(),
    },
  };
}

async function runAction({ threadId, surface, state, messages, actionName, overrides = {} }) {
  const button = buttonFor(surface, actionName);
  assert(button, `${actionName} requires a ${actionName} button on the surface`);
  for (const [key, value] of Object.entries(overrides)) {
    if (
      key !== "revision" &&
      surface.data.draft &&
      Object.prototype.hasOwnProperty.call(surface.data.draft, key)
    ) {
      setPath(surface.data, `/draft/${key}`, value);
    }
  }
  const { userAction } = buildActionRun({
    surface,
    button,
    actionName,
    overrides,
  });
  return runAgent({
    threadId,
    runId: randomUUID(),
    protocolVersion: "1.0",
    tools: [],
    context: [],
    state: state ?? {},
    messages,
    forwardedProps: {
      a2uiCatalogAvailable: true,
      a2uiAction: { userAction },
    },
  });
}

function messagesSnapshot(events) {
  return events
    .filter((event) => event.type === "MESSAGES_SNAPSHOT")
    .at(-1)?.messages ?? [];
}

function stateSnapshot(events) {
  return events.filter((event) => event.type === "STATE_SNAPSHOT").at(-1)?.snapshot;
}

function assertRun(events, label) {
  const types = events.map((event) => event.type);
  assert(!types.includes("RUN_ERROR"), `${label} must not emit RUN_ERROR`);
  assert(types.includes("RUN_STARTED"), `${label} must start`);
  assert(types.includes("RUN_FINISHED"), `${label} must finish`);
}

function inspectRun(events, threadId, label) {
  const types = events.map((event) => event.type);
  assert(!types.includes("RUN_ERROR"), `${label} run must not emit RUN_ERROR`);
  assert(types.includes("RUN_STARTED"), `${label} run must start`);
  assert(types.includes("RUN_FINISHED"), `${label} run must finish`);

  const text = textOf(events);
  if (!finalActivity(events)) {
    assert(
      text.includes("A2UI generation failed"),
      `${label} run without a surface must show a clear generation error`,
    );
    throw new Error(`${label} run produced no A2UI activity; model output was rejected.`);
  }

  const chunks = events.filter((event) => event.type === "TEXT_MESSAGE_CONTENT");
  assert(
    chunks.length >= 1 &&
      types.includes("TEXT_MESSAGE_START") &&
      types.includes("TEXT_MESSAGE_END"),
    `${label} live model must stream the explanation through AG-UI text events`,
  );

  const toolStarts = events.filter(
    (event) => event.type === "TOOL_CALL_START",
  );
  const toolNames = toolStarts.map((event) => event.toolCallName);
  const firstGenerate = toolStarts.findIndex(
    (event) => event.toolCallName === "generate_a2ui",
  );
  assert(firstGenerate >= 0, `${label} planner must call generate_a2ui`);
  assert(
    !toolStarts
      .slice(0, firstGenerate)
      .some((event) => event.toolCallName === "render_a2ui"),
    `${label} render_a2ui must not be exposed to the planner before generate_a2ui`,
  );

  const activity = finalActivity(events);
  const operations = Array.isArray(activity.content?.a2ui_operations)
    ? activity.content.a2ui_operations
    : [];
  assert(
    operations.length > 0,
    `${label} activity must carry A2UI operations`,
  );
  const create = operations.find((operation) => operation.createSurface);
  const update = operations.find((operation) => operation.updateComponents);
  const dataOperation = operations.find(
    (operation) => operation.updateDataModel?.path === "/",
  );
  assert(create, `${label} activity must createSurface`);
  assert(update, `${label} activity must updateComponents`);
  assert(dataOperation, `${label} activity must initialize data`);
  assert(
    create.createSurface.catalogId === CATALOG_ID,
    `${label} createSurface catalog ID must match the shared catalog`,
  );
  const surfaceId = create.createSurface.surfaceId;
  assert(
    surfaceId === surfaceIdFor(threadId),
    `${label} surface ID must be derived from the thread`,
  );
  assert(
    operations.every(
      (operation) => operation.createSurface?.surfaceId === surfaceId ||
        operation.updateComponents?.surfaceId === surfaceId ||
        operation.updateDataModel?.surfaceId === surfaceId,
    ),
    `${label} operations must target one surface`,
  );

  const components = update.updateComponents.components;
  assert(Array.isArray(components) && components.length > 0, `${label} components must be non-empty`);
  const boundPaths = new Set(
    components
      .filter((component) => component.component === "TextField" || component.component === "ChoicePicker")
      .map(draftPath)
      .filter((path) => typeof path === "string" && path.startsWith("/draft/")),
  );
  assert(boundPaths.has("/draft/title"), `${label} must bind /draft/title`);
  assert(boundPaths.has("/draft/details"), `${label} must bind /draft/details`);

  const reviews = components.filter(
    (component) =>
      component.component === "Button" &&
      component.action?.event?.name === REVIEW_ACTION,
  );
  assert(reviews.length === 1, `${label} must have exactly one Review request action`);
  const contextPaths = new Set(
    Object.values(reviews[0].action.event.context ?? {})
      .map((value) => value?.path)
      .filter((path) => typeof path === "string"),
  );
  for (const path of boundPaths) {
    assert(contextPaths.has(path), `${label} review context must include ${path}`);
  }
  assert(contextPaths.has("/meta/revision"), `${label} review context must include revision`);

  const data = dataOperation.updateDataModel.value;
  assert(data && typeof data === "object", `${label} data model must be an object`);
  for (const path of boundPaths) {
    const key = path.slice("/draft/".length);
    assert(
      Object.prototype.hasOwnProperty.call(data.draft ?? {}, key),
      `${label} data must initialize ${path}`,
    );
  }
  assert(data.meta?.revision === 0, `${label} revision must start at 0`);
  assert(data.meta?.status === "editing", `${label} status must start editing`);

  const state = events
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  assert(state?.mode === "live", `${label} state must report live mode`);
  assert(state?.surfaceId === surfaceId, `${label} state must expose the surface ID`);
  assert(state?.revision === 0, `${label} state revision must start at 0`);
  assertPublicState(state, label);

  const messages = messagesSnapshot(events);
  const surface = { surfaceId, components, data };

  const signature = components
    .map((component) => {
      const binding = draftPath(component);
      return `${component.component}${binding ? `:${binding}` : ""}`;
    })
    .join("|");
  const trace = {
    label,
    threadId,
    modelTool: "generate_a2ui",
    activity: {
      surfaceId,
      catalogId: create.createSurface.catalogId,
      operations: operations.map(operationKind),
      componentCount: components.length,
      componentTypes: components.map((component) => component.component),
      bindingPaths: [...boundPaths].sort(),
      actionNames: components
        .filter((component) => component.component === "Button")
        .map((component) => component.action?.event?.name ?? "unknown"),
    },
    state: {
      mode: state.mode,
      status: state.status,
      revision: state.revision,
    },
  };

  return {
    signature,
    trace,
    text,
    surface,
    stateSnapshot: state,
    messages,
  };
}

async function stageFourJourney({ threadId, initial }) {
  const surface = {
    surfaceId: initial.surface.surfaceId,
    components: structuredClone(initial.surface.components),
    data: structuredClone(initial.surface.data),
  };
  let state = initial.stateSnapshot;
  let messages = initial.messages;
  const log = [];

  const step = (name, events) => {
    assertRun(events, name);
    const snapshot = stateSnapshot(events);
    assertPublicState(snapshot, name);
    return {
      events,
      snapshot,
      activity: finalActivity(events),
      text: textOf(events),
    };
  };
  const apply = (activity) => {
    if (activity) {
      applyActivity(surface, activity);
    }
  };
  const advance = (result, name, expectedStatus, expectedRevision) => {
    assert(
      result.snapshot?.status === expectedStatus,
      `${name} must leave status ${expectedStatus}, got ${result.snapshot?.status}`,
    );
    assert(
      result.snapshot?.revision === expectedRevision,
      `${name} must leave revision ${expectedRevision}, got ${result.snapshot?.revision}`,
    );
    messages = messagesSnapshot(result.events);
    state = result.snapshot;
  };

  const invalid = step(
    "invalid review",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: REVIEW_ACTION,
      overrides: { title: "   " },
    }),
  );
  assert(
    invalid.activity,
    "invalid review must paint a same-surface validation update",
  );
  assertSameSurface(invalid.activity, surface.surfaceId, "invalid review");
  apply(invalid.activity);
  advance(invalid, "invalid review", "editing", 0);
  const invalidPaths = dataPaths(invalid.activity);
  assert(invalidPaths.includes("/errors"), "invalid review must write /errors");
  assert(
    invalidPaths.includes("/meta/status"),
    "invalid review must write /meta/status",
  );
  assert(
    !invalidPaths.includes("/meta/revision"),
    "invalid review must not advance the revision",
  );
  assert(
    !buttonFor(surface, SUBMIT_ACTION),
    "invalid review must not add a submit control",
  );
  log.push({
    step: "invalid-review",
    status: invalid.snapshot.status,
    revision: invalid.snapshot.revision,
    dataPaths: invalidPaths,
  });

  const reviewed = step(
    "valid review",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: REVIEW_ACTION,
      overrides: {
        title: "Safari sign-out",
        details: "Safari users are signed out after login.",
      },
    }),
  );
  assert(reviewed.activity, "valid review must paint a same-surface update");
  assertSameSurface(reviewed.activity, surface.surfaceId, "valid review");
  apply(reviewed.activity);
  advance(reviewed, "valid review", "review", 1);
  const submit = buttonFor(surface, SUBMIT_ACTION);
  assert(submit, "valid review must add the submit control");
  const fieldKeys = surface.components
    .filter(
      (component) =>
        component.component === "TextField" ||
        component.component === "ChoicePicker",
    )
    .map((component) => draftPath(component)?.slice("/draft/".length))
    .filter(Boolean)
    .sort();
  assert(
    JSON.stringify(Object.keys(submit.action.event.context).sort()) ===
      JSON.stringify([...fieldKeys, "revision"].sort()),
    "submit context must include every editable field plus revision",
  );
  log.push({
    step: "valid-review",
    status: reviewed.snapshot.status,
    revision: reviewed.snapshot.revision,
    actionNames: surface.components
      .filter((component) => component.component === "Button")
      .map((component) => component.action?.event?.name),
  });

  const beforeFollowDraft = structuredClone(surface.data.draft ?? {});
  const follow = step(
    "follow-up update",
    await runAgent({
      threadId,
      runId: randomUUID(),
      protocolVersion: "1.0",
      tools: [],
      context: [],
      state,
      messages: [
        ...messages,
        {
          id: randomUUID(),
          role: "user",
          content:
            "Make this a high-priority request and add a short justification. Keep the title and details.",
        },
      ],
      forwardedProps: { a2uiCatalogAvailable: true },
    }),
  );
  const followTools = follow.events
    .filter((event) => event.type === "TOOL_CALL_START")
    .map((event) => event.toolCallName);
  assert(
    followTools.includes(APPLY_TOOL),
    "follow-up must call apply_request_changes",
  );
  assert(follow.activity, "follow-up must paint a same-surface update");
  assertSameSurface(follow.activity, surface.surfaceId, "follow-up update");
  apply(follow.activity);
  const priority = surface.components.find(
    (component) => draftPath(component) === "/draft/priority",
  );
  const justification = surface.components.find(
    (component) => draftPath(component) === "/draft/justification",
  );
  assert(priority?.component === "ChoicePicker", "follow-up must add priority choice");
  assert(justification?.component === "TextField", "follow-up must add justification text");
  const updatedReview = buttonFor(surface, REVIEW_ACTION);
  assert(
    Object.prototype.hasOwnProperty.call(
      updatedReview.action.event.context,
      "priority",
    ) &&
      Object.prototype.hasOwnProperty.call(
        updatedReview.action.event.context,
        "justification",
      ),
    "review context must include the new fields",
  );
  assert(
    JSON.stringify(surface.data.draft.title ?? "") ===
      JSON.stringify(beforeFollowDraft.title ?? ""),
    "follow-up must preserve the existing title",
  );
  assert(
    JSON.stringify(surface.data.draft.details ?? "") ===
      JSON.stringify(beforeFollowDraft.details ?? ""),
    "follow-up must preserve the existing details",
  );
  assert(
    Array.isArray(surface.data.draft.priority)
      ? surface.data.draft.priority.includes("high")
      : surface.data.draft.priority === "high",
    "follow-up must set priority high",
  );
  assert(
    typeof surface.data.draft.justification === "string",
    "follow-up must bind the justification as text",
  );
  advance(follow, "follow-up update", "editing", 2);
  const followPaths = dataPaths(follow.activity);
  assert(followPaths.includes("/draft/priority"), "follow-up must write priority data");
  assert(
    followPaths.includes("/draft/justification"),
    "follow-up must write justification data",
  );
  assert(
    followPaths.includes("/meta/status") && followPaths.includes("/meta/revision"),
    "follow-up must write status and revision",
  );
  assert(
    !followPaths.includes("/draft/title") &&
      !followPaths.includes("/draft/details"),
    "follow-up must not overwrite unrelated draft values",
  );
  surface.data.draft.justification =
    "Safari loses sessions right after login, blocking the support team.";
  log.push({
    step: "follow-up-update",
    status: follow.snapshot.status,
    revision: follow.snapshot.revision,
    toolCalls: followTools,
    dataPaths: followPaths,
  });

  const stale = step(
    "stale review",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: REVIEW_ACTION,
      overrides: { revision: 1 },
    }),
  );
  assert(!stale.activity, "stale review must not paint");
  assert(stale.text.includes("stale"), "stale review must explain the mismatch");
  advance(stale, "stale review", "editing", 2);
  log.push({
    step: "stale-review",
    status: stale.snapshot.status,
    revision: stale.snapshot.revision,
    painted: Boolean(stale.activity),
  });

  const rereview = step(
    "re-review",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: REVIEW_ACTION,
      overrides: { revision: 2 },
    }),
  );
  assert(rereview.activity, "re-review must paint");
  assertSameSurface(rereview.activity, surface.surfaceId, "re-review");
  if (rereview.snapshot?.status !== "review") {
    const button = buttonFor(surface, REVIEW_ACTION);
    console.info(
      "[e2e] re-review debug " +
        JSON.stringify({
          text: rereview.text,
          snapshot: rereview.snapshot,
          errors: surface.data.errors,
          draft: surface.data.draft,
          context: button ? resolveActionContext(button, surface.data) : null,
          dataPaths: dataPaths(rereview.activity),
        }),
    );
  }
  apply(rereview.activity);
  advance(rereview, "re-review", "review", 3);
  assert(buttonFor(surface, SUBMIT_ACTION), "re-review must restore submit");
  log.push({
    step: "re-review",
    status: rereview.snapshot.status,
    revision: rereview.snapshot.revision,
  });

  const edited = step(
    "edited submit",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: SUBMIT_ACTION,
      overrides: { title: "Safari sign-out (edited after review)" },
    }),
  );
  assert(edited.activity, "edited submit must paint a same-surface correction");
  assertSameSurface(edited.activity, surface.surfaceId, "edited submit");
  apply(edited.activity);
  advance(edited, "edited submit", "editing", 4);
  assert(
    !buttonFor(surface, SUBMIT_ACTION),
    "edited submit must remove the stale submit control",
  );
  assert(
    String(surface.data.errors?.summary ?? "").includes("changed since review"),
    "edited submit must explain that review is required again",
  );
  log.push({
    step: "edited-submit",
    status: edited.snapshot.status,
    revision: edited.snapshot.revision,
    error: surface.data.errors?.summary,
  });

  const rereviewAfterEdit = step(
    "re-review after edit",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: REVIEW_ACTION,
      overrides: { revision: 4 },
    }),
  );
  assert(rereviewAfterEdit.activity, "re-review after edit must paint");
  apply(rereviewAfterEdit.activity);
  advance(rereviewAfterEdit, "re-review after edit", "review", 5);
  const finalSubmit = buttonFor(surface, SUBMIT_ACTION);
  assert(finalSubmit, "re-review after edit must restore submit");
  const finalSubmitContext = resolveActionContext(finalSubmit, surface.data);
  log.push({
    step: "re-review-after-edit",
    status: rereviewAfterEdit.snapshot.status,
    revision: rereviewAfterEdit.snapshot.revision,
  });

  const submitted = step(
    "submit",
    await runAction({
      threadId,
      surface,
      state,
      messages,
      actionName: SUBMIT_ACTION,
      overrides: { revision: 5 },
    }),
  );
  assert(submitted.activity, "submit must paint");
  assertSameSurface(submitted.activity, surface.surfaceId, "submit");
  apply(submitted.activity);
  advance(submitted, "submit", "submitted-demo", 6);
  assert(
    submitted.text.includes(SIMULATION_NOTICE),
    "submit must show the exact simulation notice",
  );
  assert(
    surface.data.meta?.status === "submitted-demo" &&
      surface.data.meta?.revision === 6,
    "submit must write final meta status and revision",
  );
  assert(
    surface.components.every((component) => component.component !== "Button"),
    "submitted surface must not keep an actionable button",
  );
  const hostStatus = surface.components.find(
    (component) => component.id === "host_status",
  );
  assert(
    hostStatus?.text === SIMULATION_NOTICE,
    "submitted surface must display the exact simulation notice",
  );
  log.push({
    step: "submit",
    status: submitted.snapshot.status,
    revision: submitted.snapshot.revision,
    text: submitted.text.slice(-200),
  });

  const doubleSubmit = step(
    "double submit",
    await runAgent({
      threadId,
      runId: randomUUID(),
      protocolVersion: "1.0",
      tools: [],
      context: [],
      state,
      messages,
      forwardedProps: {
        a2uiCatalogAvailable: true,
        a2uiAction: {
          userAction: {
            name: SUBMIT_ACTION,
            surfaceId: surface.surfaceId,
            sourceComponentId: finalSubmit.id,
            context: finalSubmitContext,
            timestamp: new Date().toISOString(),
          },
        },
      },
    }),
  );
  assert(!doubleSubmit.activity, "double submit must not paint");
  assert(
    doubleSubmit.text.includes("not in review"),
    "double submit must be rejected with a clear reason",
  );
  advance(doubleSubmit, "double submit", "submitted-demo", 6);
  log.push({
    step: "double-submit",
    status: doubleSubmit.snapshot.status,
    revision: doubleSubmit.snapshot.revision,
    painted: Boolean(doubleSubmit.activity),
  });

  return log;
}

async function main() {
  await ensureService({
    name: "agent",
    url: `${AGENT_URL}/ok`,
    command: "npm run dev:agent",
    env: {
      AGENT_MODE: "live",
      MODEL_ID: modelId,
      MODEL_API_KEY: apiKey,
      ...(process.env.MODEL_BASE_URL
        ? { MODEL_BASE_URL: process.env.MODEL_BASE_URL }
        : {}),
    },
  });

  if (await isUp(`${BRIDGE_URL}/api/health`)) {
    const health = await fetch(`${BRIDGE_URL}/api/health`).then((response) =>
      response.json(),
    );
    assert(
      health.mode === "live",
      "a running bridge reports fixture mode; stop it and rerun the live gate",
    );
  }

  await ensureService({
    name: "bridge",
    url: `${BRIDGE_URL}/api/health`,
    command: "npm run dev:server",
    env: { AGENT_MODE: "live" },
  });

  const health = await fetch(`${BRIDGE_URL}/api/health`).then((response) =>
    response.json(),
  );
  assert(health.mode === "live", "bridge must report live mode");
  assert(
    Array.isArray(health.a2ui?.a2uiToolNames) &&
      health.a2ui.a2uiToolNames.length === 0,
    "bridge must disable progressive A2UI tool watching (a2uiToolNames: [])",
  );

  const traces = [];
  for (const testCase of CASES) {
    const threadId = randomUUID();
    const events = await runAgent({
      threadId,
      runId: randomUUID(),
      protocolVersion: "1.0",
      tools: [],
      context: [],
      state: {},
      messages: [
        {
          id: randomUUID(),
          role: "user",
          content: testCase.prompt,
        },
      ],
      forwardedProps: { a2uiCatalogAvailable: true },
    });
    const result = inspectRun(events, threadId, testCase.label);
    traces.push(result.trace);
    console.info(`[e2e] ${testCase.label} PASS: ${result.text.slice(0, 120)}`);

    if (testCase.label === "bug") {
      const journey = await stageFourJourney({
        threadId,
        initial: result,
      });
      traces.push({
        label: "stage4-journey",
        threadId,
        surfaceId: result.surface.surfaceId,
        steps: journey,
      });
      console.info(
        `[e2e] stage 4 journey PASS: ${journey
          .map((entry) => `${entry.step}@${entry.status}/${entry.revision}`)
          .join(" -> ")}`,
      );
    }
  }

  const surfaceTraces = traces.filter((trace) => trace.activity);
  const examples = surfaceTraces.filter((trace) => trace.label !== "custom");
  for (let first = 0; first < examples.length; first += 1) {
    for (let second = first + 1; second < examples.length; second += 1) {
      assert(
        examples[first].activity.bindingPaths.join(",") !==
          examples[second].activity.bindingPaths.join(",") ||
          examples[first].activity.componentTypes.join(",") !==
            examples[second].activity.componentTypes.join(","),
        `${examples[first].label} and ${examples[second].label} must be materially different forms`,
      );
    }
  }

  const sanitized = JSON.stringify(traces, null, 2);
  console.info(`[e2e] sanitized trace:\n${sanitized}`);
  if (process.env.LIVE_TRACE_PATH) {
    writeFileSync(process.env.LIVE_TRACE_PATH, sanitized);
    console.info(`[e2e] trace written to ${process.env.LIVE_TRACE_PATH}`);
  }
  console.info(
    `[e2e] live PASS: ${surfaceTraces.length} real model-composed surfaces, streaming, catalog-resolved activities, distinct example forms, and the deterministic Stage 4 journey`,
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
