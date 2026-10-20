import { randomUUID } from "node:crypto";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import {
  AIMessage,
  SystemMessage,
  type BaseMessage,
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
import { z } from "zod";
import {
  findLastA2UIAction,
  hasUnparsedA2UIAction,
  type ForwardedA2UIAction,
} from "./action.js";
import { surfaceIdForThread } from "./ids.js";
import {
  createLiveGenerateTool,
  parseLiveToolResult,
} from "./live.js";
import {
  DISCARD_ACTION_NAME,
  PUBLISH_TOOL_NAME,
  REVIEW_ACTION_NAME,
  buildFixtureSurface,
  describeEnvelopeOperations,
  fixtureForCategory,
  planDiscardAction,
  planReviewAction,
  selectFixtureKind,
  validatePublishEnvelope,
  type FixtureDefinition,
} from "./fixture.js";
import { SYSTEM_INSTRUCTIONS } from "./instructions.js";
import { createChatModel } from "./model.js";
import {
  RequestState,
  resolveAgentMode,
  type RequestStateType,
} from "./state.js";

const MANUALLY_EMIT_MESSAGE = "manually_emit_message";
const MAX_PROMPT_LENGTH = 1_000;

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

function messageText(message: BaseMessage | undefined): string {
  if (!message || typeof message.content !== "string") {
    return "";
  }
  return message.content;
}

function rejection(message: string, summary: string) {
  return {
    messages: [fixtureText(message)],
    summary,
    mode: "fixture" as const,
  };
}

function toolCallMessage(
  text: string,
  surfaceId: string,
  envelope: string,
): AIMessage {
  return new AIMessage({
    content: text,
    response_metadata: { finish_reason: "stop" },
    tool_calls: [
      {
        id: `call_fixture_${randomUUID()}`,
        name: PUBLISH_TOOL_NAME,
        args: { surfaceId, envelope },
      },
    ],
  });
}

function validateActionEnvelope(
  envelope: string,
  surfaceId: string,
): string | null {
  const errors = validatePublishEnvelope(envelope, surfaceId);
  return errors.length === 0 ? null : errors.join("; ");
}

async function planAction(
  state: RequestStateType,
  config: LangGraphRunnableConfig,
  action: ForwardedA2UIAction,
): Promise<Record<string, unknown>> {
  const expectedSurfaceId = makeSurfaceId(config);
  if (
    state.surfaceId !== expectedSurfaceId ||
    action.surfaceId !== expectedSurfaceId
  ) {
    const text = `Rejected action for an unknown surface. Expected ${expectedSurfaceId}.`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: surface mismatch");
  }

  if (
    action.name !== REVIEW_ACTION_NAME &&
    action.name !== DISCARD_ACTION_NAME
  ) {
    const text = `Rejected unknown action "${action.name}".`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: unknown name");
  }

  const expectedSource =
    action.name === REVIEW_ACTION_NAME ? "review" : "discard";
  if (action.sourceComponentId !== expectedSource) {
    const text = `Rejected action "${action.name}" from unexpected component "${String(
      action.sourceComponentId,
    )}".`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: source component mismatch");
  }

  const revision = action.context.revision;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0
  ) {
    const text =
      "Rejected action: resolved context must include a non-negative integer revision.";
    await emitTextMessage(text);
    return rejection(text, "Rejected action: malformed revision");
  }
  if (revision !== state.revision) {
    const text = `Rejected stale action: surface revision ${String(
      revision,
    )} does not match graph revision ${String(state.revision)}.`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: stale revision");
  }

  const definition = fixtureForCategory(state.category);
  if (action.name === DISCARD_ACTION_NAME) {
    const result = planDiscardAction(
      expectedSurfaceId,
      definition,
      state.revision,
      action.context,
    );
    if (!result.painted) {
      await emitTextMessage(result.text);
      return rejection(result.text, result.summary);
    }
    const problem = validateActionEnvelope(result.envelope, expectedSurfaceId);
    if (problem) {
      const text = `Rejected discard action: ${problem}`;
      await emitTextMessage(text);
      return rejection(text, "Rejected action: invalid deleteSurface");
    }
    console.info(
      `[agent] fixture action ${action.name}: ${describeEnvelopeOperations(
        result.envelope,
      ).join(", ")}`,
    );
    await emitTextMessage(result.text);
    return {
      messages: [
        toolCallMessage(result.text, expectedSurfaceId, result.envelope),
      ],
      status: result.status,
      revision: result.revision,
      surfaceId: result.surfaceId,
      summary: result.summary,
      mode: "fixture" as const,
    };
  }

  const result = planReviewAction(
    definition,
    expectedSurfaceId,
    state.revision,
    action.context,
  );
  const problem = result.painted
    ? validateActionEnvelope(result.envelope, expectedSurfaceId)
    : null;
  if (problem) {
    const text = `Rejected review action: ${problem}`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: invalid update");
  }

  console.info(
    `[agent] fixture action ${action.name}: ${
      result.painted
        ? describeEnvelopeOperations(result.envelope).join(", ")
        : "no operations"
    }`,
  );
  await emitTextMessage(result.text);
  if (!result.painted) {
    return rejection(result.text, result.summary);
  }
  return {
    messages: [toolCallMessage(result.text, expectedSurfaceId, result.envelope)],
    status: result.status,
    revision: result.revision,
    surfaceId: result.surfaceId,
    summary: result.summary,
    mode: "fixture" as const,
  };
}

export async function fixturePlanNode(
  state: RequestStateType,
  config: LangGraphRunnableConfig,
) {
  const action = findLastA2UIAction(state.messages);

  if (!action && hasUnparsedA2UIAction(state.messages)) {
    const text =
      "Rejected action: the forwarded log_a2ui_event payload could not be parsed.";
    await emitTextMessage(text);
    return rejection(text, "Rejected action: unparseable payload");
  }

  if (action) {
    return planAction(state, config, action);
  }

  const lastMessage = state.messages.at(-1);
  if (lastMessage?.type !== "human") {
    return {};
  }

  if (state.surfaceId) {
    const text =
      "A fixture surface already exists on this thread. Edit the bound fields and click Review request, or discard the demo form.";
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      summary: "Fixture surface already present",
      mode: "fixture" as const,
    };
  }

  const prompt = messageText(lastMessage);
  if (prompt.length > MAX_PROMPT_LENGTH) {
    const text = `Prompt rejected: at most ${String(
      MAX_PROMPT_LENGTH,
    )} characters are allowed.`;
    await emitTextMessage(text);
    return rejection(text, "Rejected prompt: too long");
  }

  const surfaceId = makeSurfaceId(config);
  const kind = selectFixtureKind(prompt);
  let fixture: ReturnType<typeof buildFixtureSurface>;
  try {
    fixture = buildFixtureSurface(surfaceId, kind);
  } catch (error) {
    const text = `Fixture generation failed validation and painted nothing: ${
      error instanceof Error ? error.message : "unknown validation error"
    }`;
    await emitTextMessage(text);
    return rejection(text, "Fixture generation failed validation");
  }

  const intro = `FIXTURE - NO LIVE MODEL. Selected the ${fixture.definition.heading.toLowerCase()} fixture for this request. The A2UI surface is catalog-validated before publication.`;
  await emitTextMessage(intro);
  console.info(
    `[agent] fixture create ${kind}: ${describeEnvelopeOperations(
      fixture.envelope,
    ).join(", ")}`,
  );

  return {
    messages: [toolCallMessage(intro, surfaceId, fixture.envelope)],
    surfaceId,
    status: "editing" as const,
    revision: 0,
    category: fixture.definition.category,
    summary: `Stage 2 fixture surface created (${kind})`,
    mode: "fixture" as const,
  };
}

export async function fixtureRespondNode(state: RequestStateType) {
  const lastTool = [...state.messages]
    .reverse()
    .find(
      (message) =>
        message.type === "tool" && message.name === PUBLISH_TOOL_NAME,
    ) as ToolMessage | undefined;
  const content = messageText(lastTool);
  const failed =
    lastTool !== undefined &&
    (lastTool.status === "error" ||
      content.startsWith('{"error"') ||
      content.startsWith("Error"));

  let text: string;
  let summary: string;
  if (failed) {
    text =
      "The fixture operations were rejected before publication. No invalid A2UI surface was painted.";
    summary = "Fixture publication failed";
  } else if (state.surfaceId === null) {
    text =
      "The fixture surface was deleted with a validated deleteSurface operation.";
    summary = state.summary || "Fixture surface discarded";
  } else if (state.summary.startsWith("Validation failed")) {
    text =
      "Validation feedback was painted into the same surface; the revision did not advance.";
    summary = state.summary;
  } else if (state.status === "review") {
    text = `Fixture review state saved at revision ${String(
      state.revision,
    )}. Edit a bound value to test the same-surface round trip, or discard the demo form.`;
    summary = state.summary || "Fixture review saved";
  } else {
    text =
      "The fixture surface is ready. Edit the bound fields, then click Review request to send resolved values back to the graph.";
    summary = "Fixture surface created";
  }
  await emitTextMessage(text);
  return {
    messages: [fixtureText(text)],
    summary,
  };
}

function makeSurfaceId(config: LangGraphRunnableConfig): string {
  const threadId =
    typeof config.configurable?.thread_id === "string"
      ? config.configurable.thread_id
      : undefined;
  return surfaceIdForThread(threadId);
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
  const publishTool = tool(
    async ({ surfaceId, envelope }: { surfaceId: string; envelope: string }) => {
      const problem = validateActionEnvelope(envelope, surfaceId);
      if (problem) {
        return JSON.stringify({
          error: `A2UI fixture envelope rejected: ${problem}`,
        });
      }
      return envelope;
    },
    {
      name: PUBLISH_TOOL_NAME,
      description:
        "Publish deterministic, catalog-validated A2UI fixture operations.",
      schema: z.object({
        surfaceId: z.string().min(1),
        envelope: z.string().min(1),
      }),
    },
  );

  return new StateGraph(RequestState)
    .addNode("plan", fixturePlanNode)
    .addNode("tools", new ToolNode([publishTool]))
    .addNode("respond", fixtureRespondNode)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", routeFixturePlan, ["tools", END])
    .addEdge("tools", "respond")
    .addEdge("respond", END)
    .compile();
}

async function liveObserveNode(
  state: RequestStateType,
  config: LangGraphRunnableConfig,
) {
  const lastTool = [...state.messages]
    .reverse()
    .find(
      (message) =>
        message.type === "tool" && message.name === "generate_a2ui",
    ) as ToolMessage | undefined;
  if (!lastTool) {
    return {};
  }
  const outcome = parseLiveToolResult(messageText(lastTool));
  if (outcome.kind === "none") {
    return {};
  }
  if (outcome.kind === "failure") {
    const details =
      outcome.errors.length > 0
        ? ` Details: ${outcome.errors.slice(0, 3).join(" | ")}`
        : "";
    const text = state.surfaceId
      ? `A2UI generation failed: ${outcome.message}.${details} The existing form is unchanged.`
      : `A2UI generation failed: ${outcome.message}.${details} No form was painted; retry with a clearer request.`;
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      surfaceId: state.surfaceId,
      status: state.status,
      revision: state.revision,
      summary: `Live generation failed: ${outcome.message}`.slice(0, 160),
      mode: "live" as const,
    };
  }

  const threadId =
    typeof config.configurable?.thread_id === "string"
      ? config.configurable.thread_id
      : undefined;
  const expectedSurfaceId = threadId
    ? surfaceIdForThread(threadId)
    : outcome.surfaceId;
  if (outcome.surfaceId !== expectedSurfaceId) {
    const text = `A2UI generation was rejected: surface ${outcome.surfaceId} does not match the host surface ${expectedSurfaceId}.`;
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      surfaceId: state.surfaceId,
      status: state.status,
      revision: state.revision,
      summary: "Live generation surface mismatch",
      mode: "live" as const,
    };
  }

  if (state.surfaceId) {
    const text =
      "A form already exists on this thread. Stage 4 adds review and updates; use New request to build another form.";
    await emitTextMessage(text);
    return {
      messages: [fixtureText(text)],
      surfaceId: state.surfaceId,
      status: state.status,
      revision: state.revision,
      summary: "Live surface already exists",
      mode: "live" as const,
    };
  }

  return {
    surfaceId: outcome.surfaceId,
    status: "editing" as const,
    revision: 0,
    summary: "Live A2UI surface created",
    mode: "live" as const,
  };
}

function createLiveGraph() {
  const model = createChatModel();
  const tools = [createLiveGenerateTool(model)];
  const boundModel = model.bindTools(tools, { parallel_tool_calls: false });
  const toolNode = new ToolNode(tools);

  console.info(
    `[agent] live planner tools: ${tools.map((entry) => entry.name).join(", ")}`,
  );

  async function agentNode(state: RequestStateType) {
    const lastMessage = state.messages.at(-1);
    if (state.surfaceId && lastMessage?.type === "human") {
      const text =
        "A form already exists on this thread. Stage 4 adds review and updates; use New request to build another form.";
      await emitTextMessage(text);
      return {
        messages: [fixtureText(text)],
        summary: "Live surface already exists",
        mode: "live" as const,
      };
    }
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
    .addNode("observe", liveObserveNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, ["tools", END])
    .addEdge("tools", "observe")
    .addEdge("observe", END)
    .compile();
}

const mode = resolveAgentMode();

export const graph = mode === "fixture" ? createFixtureGraph() : createLiveGraph();

export type { FixtureDefinition };
