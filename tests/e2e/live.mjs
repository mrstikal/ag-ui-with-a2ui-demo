import { randomUUID } from "node:crypto";
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

const modelId = process.env.MODEL_ID?.trim();
const apiKey = process.env.MODEL_API_KEY?.trim();

if (!modelId || !apiKey) {
  console.error(
    "[e2e] BLOCKED: the live model gate requires MODEL_ID and MODEL_API_KEY. " +
      "Fixture results are not accepted as live evidence. Configure both and rerun npm run test:e2e:live.",
  );
  process.exit(2);
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
      MODEL_BASE_URL: process.env.MODEL_BASE_URL,
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
        content:
          "Create a request form for a login bug. Call generate_a2ui with /draft/title and /draft/details bindings and a Review request action.",
      },
    ],
    forwardedProps: { a2uiCatalogAvailable: true },
  });

  const types = events.map((event) => event.type);
  assert(!types.includes("RUN_ERROR"), "live run must not emit RUN_ERROR");
  assert(types.includes("RUN_STARTED"), "live run must start");
  assert(types.includes("RUN_FINISHED"), "live run must finish");

  const contentChunks = events.filter(
    (event) => event.type === "TEXT_MESSAGE_CONTENT",
  );
  assert(
    contentChunks.length > 1,
    "live model must stream more than one TEXT_MESSAGE_CONTENT chunk",
  );

  const toolNames = events
    .filter((event) => event.type === "TOOL_CALL_START")
    .map((event) => event.toolCallName);
  assert(
    toolNames.includes("generate_a2ui"),
    "live planner must call generate_a2ui",
  );
  assert(
    !toolNames.includes("render_a2ui"),
    "render_a2ui must not be exposed to the planner",
  );

  const activity = events
    .filter((event) => event.type === "ACTIVITY_SNAPSHOT")
    .at(-1);
  assert(activity, "live run must emit an A2UI activity");
  const operations = activity.content?.a2ui_operations ?? [];
  assert(operations.length > 0, "live activity must carry A2UI operations");
  assert(
    operations.some((operation) => operation.createSurface),
    "live activity must create a surface",
  );

  const liveState = events.some(
    (event) =>
      event.type === "STATE_SNAPSHOT" && event.snapshot?.mode === "live",
  );
  assert(liveState, "live run must report mode=live in state");

  console.info("[e2e] live PASS: model streaming, generate_a2ui, activity, state");
  console.info(`[e2e] thread=${threadId}`);
  console.info(`[e2e] text=${textOf(events).slice(0, 200)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    stopAll();
  });
