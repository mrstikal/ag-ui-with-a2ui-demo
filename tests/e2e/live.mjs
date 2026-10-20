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

  return { signature, trace, text };
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
      const stateSnapshot = events
        .filter((event) => event.type === "STATE_SNAPSHOT")
        .at(-1)?.snapshot;
      const messagesSnapshot = events
        .filter((event) => event.type === "MESSAGES_SNAPSHOT")
        .at(-1)?.messages;
      const follow = await runAgent({
        threadId,
        runId: randomUUID(),
        protocolVersion: "1.0",
        tools: [],
        context: [],
        state: stateSnapshot ?? {},
        messages: [
          ...(Array.isArray(messagesSnapshot) ? messagesSnapshot : []),
          {
            id: randomUUID(),
            role: "user",
            content: "Add a priority field to the existing form.",
          },
        ],
        forwardedProps: { a2uiCatalogAvailable: true },
      });
      const followed = follow
        .filter((event) => event.type === "STATE_SNAPSHOT")
        .at(-1)?.snapshot;
      assert(
        !follow.some(
          (event) =>
            event.type === "ACTIVITY_SNAPSHOT" &&
            event.activityType === "a2ui-surface" &&
            Array.isArray(event.content?.a2ui_operations) &&
            event.content.a2ui_operations.length > 0,
        ),
        "a follow-up prompt must not paint a second live surface",
      );
      assert(
        followed?.surfaceId === result.trace.activity.surfaceId,
        "a follow-up prompt must preserve the existing surface state",
      );
      assert(
        textOf(follow).includes("already exists"),
        "a follow-up prompt must deterministically explain the Stage 3 limit",
      );
    }
  }

  const examples = traces.filter((trace) => trace.label !== "custom");
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
    `[e2e] live PASS: ${traces.length} real model-composed surfaces, streaming, catalog-resolved activities, and distinct example forms`,
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
