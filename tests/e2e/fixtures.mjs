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
const FIXTURE_TOOL = "build_stage0_fixture";
const REVIEW_ACTION = "reviewRequest";

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

  const threadId = randomUUID();
  const userMessage = {
    id: randomUUID(),
    role: "user",
    content: "I found a login bug. Help me report it.",
  };
  const baseBody = {
    threadId,
    protocolVersion: "1.0",
    tools: [],
    context: [],
    state: {},
    messages: [userMessage],
    forwardedProps: { a2uiCatalogAvailable: true },
  };

  const initial = await runAgent({
    ...baseBody,
    runId: randomUUID(),
  });

  const initialTypes = initial.map((event) => event.type);
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
    assert(initialTypes.includes(required), `initial run must include ${required}`);
  }
  assert(!initialTypes.includes("RUN_ERROR"), "initial run must not emit RUN_ERROR");
  assert(
    initial.some(
      (event) =>
        event.type === "STATE_SNAPSHOT" && event.snapshot?.mode === "fixture",
    ),
    "agent must report fixture mode in its state",
  );

  const plannerTools = initial
    .filter((event) => event.type === "TOOL_CALL_START")
    .map((event) => event.toolCallName);
  assert(plannerTools.includes(FIXTURE_TOOL), "fixture tool must be called");
  assert(
    !plannerTools.includes("render_a2ui"),
    "render_a2ui must not be exposed to the planner",
  );
  assert(
    !plannerTools.includes("generate_a2ui"),
    "fixture mode must not call the live A2UI generation tool",
  );

  const activity = initial
    .filter((event) => event.type === "ACTIVITY_SNAPSHOT")
    .at(-1);
  assert(activity, "initial run must emit ACTIVITY_SNAPSHOT");
  assert(
    activity.activityType === "a2ui-surface",
    "activity type must be a2ui-surface",
  );
  assert(
    typeof activity.messageId === "string" &&
      activity.messageId.startsWith("a2ui-surface-"),
    "activity message identity must be stable",
  );
  const operations = activity.content?.a2ui_operations ?? [];
  assert(operations.length === 3, "activity must carry three A2UI operations");
  const surfaceId = operations[0]?.createSurface?.surfaceId;
  assert(typeof surfaceId === "string", "createSurface must carry a surface ID");
  assert(
    operations[0]?.createSurface?.catalogId === CATALOG_ID,
    "createSurface catalog ID must match the shared catalog",
  );
  assert(
    operations.some((operation) => operation.updateComponents),
    "activity must include updateComponents",
  );
  assert(
    operations.some((operation) => operation.updateDataModel),
    "activity must include updateDataModel",
  );

  const stateHasSurface = initial.some(
    (event) =>
      event.type === "STATE_SNAPSHOT" && event.snapshot?.surfaceId === surfaceId,
  );
  assert(stateHasSurface, "STATE_SNAPSHOT must include the surface ID");
  assert(
    textOf(initial).includes("Stage 0 fixture mode"),
    "fixture text must be streamed",
  );

  const stateSnapshot = initial
    .filter((event) => event.type === "STATE_SNAPSHOT")
    .at(-1)?.snapshot;
  const messagesSnapshot = initial
    .filter((event) => event.type === "MESSAGES_SNAPSHOT")
    .at(-1)?.messages;

  const action = await runAgent({
    ...baseBody,
    state: stateSnapshot ?? {},
    messages: messagesSnapshot ?? [userMessage],
    runId: randomUUID(),
    forwardedProps: {
      a2uiCatalogAvailable: true,
      a2uiAction: {
        userAction: {
          name: REVIEW_ACTION,
          surfaceId,
          sourceComponentId: "review",
          context: { title: "Login fails on Safari", revision: 0 },
          timestamp: new Date().toISOString(),
        },
      },
    },
  });

  const actionTypes = action.map((event) => event.type);
  assert(!actionTypes.includes("RUN_ERROR"), "action run must not emit RUN_ERROR");
  const actionKeepsSurface = action.some(
    (event) =>
      event.type === "STATE_SNAPSHOT" && event.snapshot?.surfaceId === surfaceId,
  );
  assert(actionKeepsSurface, "action run must keep the same surface ID");
  const actionText = textOf(action);
  assert(
    actionText.includes('Resolved title: "Login fails on Safari"'),
    "action text must include the resolved title",
  );
  assert(
    actionText.includes("reached log_a2ui_event"),
    "action must reach the graph-side log_a2ui_event path",
  );
  const reviewed = action.some(
    (event) =>
      event.type === "STATE_SNAPSHOT" &&
      event.snapshot?.status === "review" &&
      event.snapshot?.revision === 1,
  );
  assert(reviewed, "action must advance state to review/revision 1");
  assert(
    actionText.includes("Graph revision is now 1"),
    "action response must include the trusted revision",
  );

  const threadState = await fetch(`${AGENT_URL}/threads/${threadId}/state`).then(
    (response) => response.json(),
  );
  const messages = threadState.values?.messages ?? [];
  const actionCall = messages
    .flatMap((message) =>
      Array.isArray(message.tool_calls) ? message.tool_calls : [],
    )
    .find((call) => call.name === "log_a2ui_event");
  assert(
    actionCall && typeof actionCall.id === "string",
    "LangGraph checkpoint must retain the log_a2ui_event tool call",
  );
  const actionResult = messages.find(
    (message) =>
      message.type === "tool" && message.tool_call_id === actionCall.id,
  );
  assert(
    actionResult &&
      typeof actionResult.content === "string" &&
      actionResult.content.includes("Login fails on Safari"),
    "LangGraph checkpoint must pair the action tool call with its resolved result",
  );

  console.info("[e2e] fixture PASS: text, tool result, activity, state, action round trip");
  console.info(`[e2e] thread=${threadId} surface=${surfaceId}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    stopAll();
  });
