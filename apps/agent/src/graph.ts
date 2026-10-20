import { randomUUID } from "node:crypto";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import {
  AIMessage,
  SystemMessage,
  type ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import {
  END,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { CATALOG_ID } from "@arb/shared";
import {
  findLastA2UIAction,
  hasUnparsedA2UIAction,
  isPromptMessage,
  readContextValue,
} from "./action.js";
import { z } from "zod";
import { createGenerateA2UITool } from "./catalog.js";
import { buildFixtureSurface, FIXTURE_TOOL_NAME, REVIEW_ACTION_NAME } from "./fixture.js";
import { SYSTEM_INSTRUCTIONS } from "./instructions.js";
import { createChatModel } from "./model.js";
import {
  RequestState,
  resolveAgentMode,
  type RequestStateType,
} from "./state.js";

const MANUALLY_EMIT_MESSAGE = "manually_emit_message";

async function emitTextMessage(text: string): Promise<void> {
  await dispatchCustomEvent(MANUALLY_EMIT_MESSAGE, {
    message_id: `fixture-message-${randomUUID()}`,
    message: text,
  });
}

function fixtureText(text: string): AIMessage {
  return new AIMessage({
    content: text,
    response_metadata: { finish_reason: "stop" },
  });
}

export async function fixturePlanNode(
  state: RequestStateType,
  config: LangGraphRunnableConfig,
) {
  const expectedSurfaceId = makeSurfaceId(config);
  const action = findLastA2UIAction(state.messages);

  if (!action && hasUnparsedA2UIAction(state.messages)) {
    const text =
      "Rejected action: the forwarded log_a2ui_event payload could not be parsed.";
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      summary: "Rejected action: unparseable payload",
    };
  }

  if (action) {
    if (
      state.surfaceId !== expectedSurfaceId ||
      action.surfaceId !== expectedSurfaceId
    ) {
      const text = `Rejected action for an unknown surface. Expected ${expectedSurfaceId}.`;
      await emitTextMessage(text);
      return {
        messages: [fixtureText(text)],
        summary: "Rejected action: surface mismatch",
      };
    }

    if (action.name !== REVIEW_ACTION_NAME) {
      const text = `Rejected unknown action "${action.name}".`;
      await emitTextMessage(text);
      return {
        messages: [fixtureText(text)],
        summary: "Rejected action: unknown name",
      };
    }

    const title = readContextValue(action.context, "title");
    const revision = action.context.revision;
    if (
      title === null ||
      title.trim() === "" ||
      typeof revision !== "number"
    ) {
      const text =
        "Rejected action: resolved context must include a non-empty title and a numeric revision.";
      await emitTextMessage(text);
      return {
        messages: [fixtureText(text)],
        summary: "Rejected action: malformed context",
      };
    }

    if (revision !== state.revision) {
      const text = `Rejected stale action: surface revision ${revision} does not match graph revision ${state.revision}.`;
      await emitTextMessage(text);
      return {
        messages: [fixtureText(text)],
        summary: "Rejected action: stale revision",
      };
    }

    const nextRevision = state.revision + 1;
    const text =
      `Stage 0 fixture action "${action.name}" reached log_a2ui_event on ${action.surfaceId}. ` +
      `Resolved title: ${JSON.stringify(title)}. Surface revision: ${revision}. ` +
      `Graph revision is now ${nextRevision}; status is review.`;
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      status: "review" as const,
      revision: nextRevision,
      summary: `reviewRequest received (title ${JSON.stringify(title)})`,
      mode: "fixture" as const,
    };
  }

  const lastMessage = state.messages.at(-1);
  if (!isPromptMessage(lastMessage)) {
    return {};
  }

  if (state.surfaceId) {
    const text =
      "The Stage 0 fixture surface already exists on this thread. Edit the bound field and click Review request to test the action round trip.";
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      summary: "Fixture surface already present",
      mode: "fixture" as const,
    };
  }

  const surfaceId = expectedSurfaceId;
  const toolCallId = `call_fixture_${randomUUID()}`;
  const intro =
    "Stage 0 fixture mode: creating a catalog-validated A2UI surface with one bound field and one Review request action.";
  await emitTextMessage(intro);

  return {
    messages: [
      new AIMessage({
        content: intro,
        response_metadata: { finish_reason: "stop" },
        tool_calls: [
          {
            id: toolCallId,
            name: FIXTURE_TOOL_NAME,
            args: { surfaceId, catalogId: CATALOG_ID },
          },
        ],
      }),
    ],
    surfaceId,
    status: "editing" as const,
    revision: 0,
    category: "other" as const,
    summary: "Stage 0 fixture surface created",
    mode: "fixture" as const,
  };
}

export async function fixtureRespondNode(state: RequestStateType) {
  const lastTool = [...state.messages]
    .reverse()
    .find(
      (message) =>
        message.type === "tool" && message.name === FIXTURE_TOOL_NAME,
    ) as ToolMessage | undefined;
  const failed =
    lastTool !== undefined &&
    (lastTool.status === "error" ||
      (typeof lastTool.content === "string" &&
        lastTool.content.startsWith("Error")));

  const text = failed
    ? "The Stage 0 fixture surface could not be built. The tool result was rejected; no new surface was published."
    : "The fixture surface is ready. Edit the bound field, then click Review request to send the resolved action context back to the graph.";
  await emitTextMessage(text);
  return {
    messages: [fixtureText(text)],
    summary: failed ? "Fixture build failed" : "Fixture surface created",
  };
}

function makeSurfaceId(config: LangGraphRunnableConfig): string {
  const threadId =
    typeof config.configurable?.thread_id === "string"
      ? config.configurable.thread_id
      : randomUUID();
  const safeThread = threadId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  return `surface-${safeThread}`;
}

function routeFixturePlan(state: RequestStateType): string {
  const last = state.messages.at(-1);
  const toolCalls = last ? (last as AIMessage).tool_calls : undefined;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return "tools";
  }
  return END;
}

function createFixtureGraph() {
  const fixtureTool = tool(
    async ({ surfaceId }: { surfaceId: string }) =>
      buildFixtureSurface(surfaceId).envelope,
    {
      name: FIXTURE_TOOL_NAME,
      description:
        "Build the deterministic Stage 0 catalog-validated A2UI fixture surface.",
      schema: z.object({ surfaceId: z.string().min(1) }),
    },
  );

  return new StateGraph(RequestState)
    .addNode("plan", fixturePlanNode)
    .addNode("tools", new ToolNode([fixtureTool]))
    .addNode("respond", fixtureRespondNode)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", routeFixturePlan, ["tools", END])
    .addEdge("tools", "respond")
    .addEdge("respond", END)
    .compile();
}

function createLiveGraph() {
  const model = createChatModel();
  const tools = [createGenerateA2UITool(model)];
  const boundModel = model.bindTools(tools, { parallel_tool_calls: false });
  const toolNode = new ToolNode(tools);

  console.info(
    `[agent] live planner tools: ${tools.map((entry) => entry.name).join(", ")}`,
  );

  async function agentNode(state: RequestStateType) {
    const startedAt = Date.now();
    const response = await boundModel.invoke([
      new SystemMessage(SYSTEM_INSTRUCTIONS),
      ...state.messages,
    ]);
    const usage = response.usage_metadata;
    console.info(
      `[agent] live turn latencyMs=${Date.now() - startedAt} ` +
        `inputTokens=${usage?.input_tokens ?? "n/a"} ` +
        `outputTokens=${usage?.output_tokens ?? "n/a"}`,
    );
    return {
      messages: [response],
      mode: "live" as const,
      summary: "Live model response",
    };
  }

  return new StateGraph(RequestState)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, ["tools", END])
    .addEdge("tools", "agent")
    .compile();
}

const mode = resolveAgentMode();

export const graph = mode === "fixture" ? createFixtureGraph() : createLiveGraph();
