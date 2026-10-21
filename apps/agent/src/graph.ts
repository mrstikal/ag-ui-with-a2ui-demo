import { randomUUID } from "node:crypto";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import {
  AIMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import {
  END,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  ACTION_EVIDENCE_EVENT,
  ACTION_REVIEW_REQUEST,
  ACTION_SUBMIT_DEMO_REQUEST,
  LIMITS,
  SUBMIT_BUTTON_ID,
  redactActionContext,
} from "@arb/shared";
import { z } from "zod";
import {
  findLastA2UIAction,
  hasUnparsedA2UIAction,
  type ForwardedA2UIAction,
} from "./action.js";
import { surfaceIdForThread } from "./ids.js";
import {
  APPLY_CHANGES_TOOL_NAME,
  createApplyChangesTool,
  createLiveGenerateTool,
  parseLiveToolResult,
} from "./live.js";
import {
  applyChangePlan,
  applyReviewAction,
  applySubmitAction,
  createSurfaceState,
  type RequestChange,
  type RequestActionResult,
  type SurfaceState,
} from "./request.js";
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
import { plannerSurfaceContext } from "./planner.js";
import {
  RequestInputSchema,
  RequestOutputSchema,
  RequestState,
  resolveAgentMode,
  type RequestStateType,
} from "./state.js";

const TEXT_MESSAGE_EVENT = "manually_emit_message";
const MAX_PROMPT_LENGTH = LIMITS.maxPromptLength;

async function emitTextMessage(text: string): Promise<void> {
  await dispatchCustomEvent(TEXT_MESSAGE_EVENT, {
    message_id: `fixture-message-${randomUUID()}`,
    message: text,
  });
}

function assistantText(text: string): AIMessage {
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

function rejection(
  message: string,
  summary: string,
  extraMessages: BaseMessage[] = [],
) {
  return {
    messages: [...extraMessages, assistantText(message)],
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
  const compactPair = compactActionPair(state, action);
  await dispatchCustomEvent(ACTION_EVIDENCE_EVENT, {
    name: action.name,
    surfaceId: action.surfaceId,
    sourceComponentId: action.sourceComponentId,
    context: redactActionContext(action.context),
    contextRedacted: true,
  });
  const expectedSurfaceId = makeSurfaceId(config);
  if (
    state.surfaceId !== expectedSurfaceId ||
    action.surfaceId !== expectedSurfaceId
  ) {
    const text = `Rejected action for an unknown surface. Expected ${expectedSurfaceId}.`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: surface mismatch", compactPair);
  }

  if (
    action.name !== REVIEW_ACTION_NAME &&
    action.name !== DISCARD_ACTION_NAME
  ) {
    const text = `Rejected unknown action "${action.name}".`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: unknown name", compactPair);
  }

  const expectedSource =
    action.name === REVIEW_ACTION_NAME ? "review" : "discard";
  if (action.sourceComponentId !== expectedSource) {
    const text = `Rejected action "${action.name}" from unexpected component "${String(
      action.sourceComponentId,
    )}".`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: source component mismatch", compactPair);
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
    return rejection(text, "Rejected action: malformed revision", compactPair);
  }
  if (revision !== state.revision) {
    const text = `Rejected stale action: surface revision ${String(
      revision,
    )} does not match graph revision ${String(state.revision)}.`;
    await emitTextMessage(text);
    return rejection(text, "Rejected action: stale revision", compactPair);
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
      return rejection(result.text, result.summary, compactPair);
    }
    const problem = validateActionEnvelope(result.envelope, expectedSurfaceId);
    if (problem) {
      const text = `Rejected discard action: ${problem}`;
      await emitTextMessage(text);
      return rejection(
        text,
        "Rejected action: invalid deleteSurface",
        compactPair,
      );
    }
    console.info(
      `[agent] fixture action ${action.name}: ${describeEnvelopeOperations(
        result.envelope,
      ).join(", ")}`,
    );
    await emitTextMessage(result.text);
    return {
      messages: [
        ...compactPair,
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
    return rejection(text, "Rejected action: invalid update", compactPair);
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
    return rejection(result.text, result.summary, compactPair);
  }
  return {
    messages: [
      ...compactPair,
      toolCallMessage(result.text, expectedSurfaceId, result.envelope),
    ],
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
    return rejection(
      text,
      "Rejected action: unparseable payload",
      compactActionPair(state, null),
    );
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
      messages: [assistantText(text)],
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

function isErrorPayload(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);
    return (
      Boolean(parsed) &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { error?: unknown }).error === "string"
    );
  } catch {
    return false;
  }
}

export async function fixtureRespondNode(state: RequestStateType) {
  let lastTool: ToolMessage | undefined;
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.type === "tool" && message.name === PUBLISH_TOOL_NAME) {
      lastTool = message as ToolMessage;
      break;
    }
  }
  const content = messageText(lastTool);
  const failed =
    lastTool !== undefined &&
    (lastTool.status === "error" || isErrorPayload(content));

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
    messages: [assistantText(text)],
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

  return new StateGraph(RequestState, {
    input: RequestInputSchema,
    output: RequestOutputSchema,
  })
    .addNode("plan", fixturePlanNode)
    .addNode("tools", new ToolNode([publishTool]))
    .addNode("respond", fixtureRespondNode)
    .addEdge(START, "plan")
    .addConditionalEdges("plan", routeFixturePlan, ["tools", END])
    .addEdge("tools", "respond")
    .addEdge("respond", END)
    .compile();
}

const PUBLISH_REQUEST_TOOL_NAME = "publish_request_operations";
const MAX_CONTEXT_KEYS = 32;

function lastToolMessage(
  state: RequestStateType,
  name: string,
): ToolMessage | undefined {
  const last = state.messages.at(-1);
  return last?.type === "tool" && last.name === name
    ? (last as ToolMessage)
    : undefined;
}

function publicSurfaceState(
  surface: SurfaceState,
  summary: string,
): Record<string, unknown> {
  return {
    surface,
    status: surface.status,
    revision: surface.revision,
    surfaceId: surface.surfaceId,
    category: surface.category,
    summary: summary.slice(0, 160),
    mode: "live" as const,
  };
}

async function liveReject(
  state: RequestStateType,
  text: string,
  summary: string,
  extraMessages: BaseMessage[] = [],
): Promise<Record<string, unknown>> {
  await emitTextMessage(text);
  return {
    messages: [...extraMessages, assistantText(text)],
    status: state.surface?.status ?? state.status,
    revision: state.surface?.revision ?? state.revision,
    surfaceId: state.surface?.surfaceId ?? state.surfaceId,
    category: state.surface?.category ?? state.category,
    summary: summary.slice(0, 160),
    mode: "live" as const,
  };
}

function compactToolMessage(
  message: ToolMessage,
  content: string,
): ToolMessage {
  return new ToolMessage({
    id: message.id,
    content,
    tool_call_id: message.tool_call_id,
    name: message.name,
    status: message.status,
  });
}

function compactActionPair(
  state: RequestStateType,
  action: ForwardedA2UIAction | null,
): BaseMessage[] {
  const last = state.messages.at(-1);
  if (!last || last.type !== "tool") {
    return [];
  }
  const toolMessage = last as ToolMessage;
  const aiMessage = findToolCallMessage(
    state.messages,
    toolMessage.tool_call_id,
  );
  const compactAi = aiMessage
    ? compactToolCallArgs(aiMessage, toolMessage.tool_call_id, {
        name: action?.name ?? "log_a2ui_event",
        surfaceId: action?.surfaceId ?? null,
        sourceComponentId: action?.sourceComponentId ?? null,
        revision: action?.context.revision ?? null,
      })
    : null;
  const compactResult = compactToolMessage(
    toolMessage,
    JSON.stringify({
      ok: Boolean(action),
      action: action?.name ?? "unparseable",
      surfaceId: action?.surfaceId ?? null,
    }),
  );
  return [...(compactAi ? [compactAi] : []), compactResult];
}

function findToolCallMessage(
  messages: BaseMessage[],
  toolCallId: string,
): AIMessage | undefined {
  return messages.find(
    (message): message is AIMessage =>
      message.type === "ai" &&
      Boolean(
        (message as AIMessage).tool_calls?.some(
          (call) => call.id === toolCallId,
        ),
      ),
  );
}

function compactToolCallArgs(
  message: BaseMessage,
  toolCallId: string,
  args: Record<string, unknown>,
): AIMessage | null {
  if (message.type !== "ai") {
    return null;
  }
  const ai = message as AIMessage;
  if (!ai.tool_calls?.some((call) => call.id === toolCallId)) {
    return null;
  }
  return new AIMessage({
    id: ai.id,
    content: ai.content,
    additional_kwargs: ai.additional_kwargs,
    response_metadata: ai.response_metadata,
    tool_calls: ai.tool_calls.map((call) =>
      call.id === toolCallId ? { ...call, args } : call,
    ),
  });
}

function publishRequestMessage(
  text: string,
  surfaceId: string,
  envelope: string,
): AIMessage {
  return new AIMessage({
    content: text,
    response_metadata: { finish_reason: "stop" },
    tool_calls: [
      {
        id: `call_publish_${randomUUID()}`,
        name: PUBLISH_REQUEST_TOOL_NAME,
        args: { surfaceId, envelope },
      },
    ],
  });
}

async function liveActionNode(
  state: RequestStateType,
  config: LangGraphRunnableConfig,
): Promise<Record<string, unknown>> {
  const action = findLastA2UIAction(state.messages);
  const compactPair = compactActionPair(state, action);
  if (action) {
    await dispatchCustomEvent(ACTION_EVIDENCE_EVENT, {
      name: action.name,
      surfaceId: action.surfaceId,
      sourceComponentId: action.sourceComponentId,
      context: redactActionContext(action.context),
      contextRedacted: true,
    });
  }
  if (!action) {
    return liveReject(
      state,
      "Rejected action: the forwarded A2UI action could not be parsed. The form is unchanged.",
      "Rejected malformed A2UI action",
      compactPair,
    );
  }

  const surface = state.surface;
  if (!surface) {
    return liveReject(
      state,
      "Rejected action: no request form exists on this thread. Use New request to create one.",
      "Rejected action without a surface",
      compactPair,
    );
  }

  const expectedSurfaceId = makeSurfaceId(config);
  if (
    action.surfaceId !== expectedSurfaceId ||
    surface.surfaceId !== expectedSurfaceId
  ) {
    return liveReject(
      state,
      "Rejected action: the action does not belong to this thread's form. The form is unchanged.",
      "Rejected action surface mismatch",
      compactPair,
    );
  }

  if (Object.keys(action.context).length > MAX_CONTEXT_KEYS) {
    return liveReject(
      state,
      "Rejected action: the resolved context is too large. The form is unchanged.",
      "Rejected action context too large",
      compactPair,
    );
  }

  let result: RequestActionResult;
  try {
    if (action.name === ACTION_REVIEW_REQUEST) {
      if (action.sourceComponentId !== surface.reviewButtonId) {
        return liveReject(
          state,
          "Rejected review: the action did not come from the current Review request control. The form is unchanged.",
          "Rejected review source mismatch",
          compactPair,
        );
      }
      result = applyReviewAction(surface, action.context);
    } else if (action.name === ACTION_SUBMIT_DEMO_REQUEST) {
      if (action.sourceComponentId !== SUBMIT_BUTTON_ID) {
        return liveReject(
          state,
          "Rejected submit: the action did not come from the current Submit demo request control. Nothing was sent.",
          "Rejected submit source mismatch",
          compactPair,
        );
      }
      result = applySubmitAction(surface, action.context);
    } else {
      return liveReject(
        state,
        `Rejected action: '${action.name}' is not supported by this app. The form is unchanged.`,
        "Rejected unsupported A2UI action",
        compactPair,
      );
    }
  } catch (error) {
    return liveReject(
      state,
      `Action could not be applied: ${
        error instanceof Error ? error.message : "unknown host error"
      }. The form is unchanged.`,
      "Rejected action: host error",
      compactPair,
    );
  }

  console.info(
    `[a2ui] action=${action.name} source=${action.sourceComponentId} ` +
      `review=${surface.reviewButtonId} status=${surface.status} ` +
      `revision=${String(surface.revision)} painted=${String(result.painted)} ` +
      `summary=${result.summary}`,
  );
  if (!result.painted) {
    await emitTextMessage(result.text);
    return {
      messages: [...compactPair, assistantText(result.text)],
      status: surface.status,
      revision: surface.revision,
      surfaceId: surface.surfaceId,
      category: surface.category,
      summary: result.summary,
      mode: "live" as const,
    };
  }

  const problem = validateActionEnvelope(result.envelope, expectedSurfaceId);
  if (problem) {
    return liveReject(
      state,
      `Action update rejected before paint: ${problem}. The form is unchanged.`,
      "Rejected action update before paint",
      compactPair,
    );
  }

  await emitTextMessage(result.text);
  return {
    ...publicSurfaceState(result.surface, result.summary),
    messages: [
      ...compactPair,
      publishRequestMessage(result.text, expectedSurfaceId, result.envelope),
    ],
  };
}

function parseChangePlan(value: unknown): RequestChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const plan = value as {
    addFields?: unknown;
    setValues?: unknown;
  };
  if (!Array.isArray(plan.addFields)) {
    return null;
  }
  if (!plan.setValues || typeof plan.setValues !== "object" || Array.isArray(plan.setValues)) {
    return null;
  }
  return plan as RequestChange;
}

async function liveUpdateNode(
  state: RequestStateType,
): Promise<Record<string, unknown>> {
  const surface = state.surface;
  if (!surface) {
    return liveReject(
      state,
      "Rejected update: no request form exists on this thread.",
      "Rejected update without a surface",
    );
  }

  const toolMessage = lastToolMessage(state, APPLY_CHANGES_TOOL_NAME);
  if (!toolMessage) {
    return {};
  }

  let parsed: unknown;
  const compactApply = (content: Record<string, unknown>) =>
    compactToolMessage(toolMessage, JSON.stringify(content));
  const rejectUpdate = (
    text: string,
    summary: string,
    content: Record<string, unknown>,
  ) => liveReject(state, text, summary, [compactApply(content)]);

  try {
    parsed = JSON.parse(messageText(toolMessage));
  } catch {
    return rejectUpdate(
      "The requested change could not be applied because the change intent was not valid JSON. The form is unchanged.",
      "Rejected update: invalid change JSON",
      { ok: false, error: "invalid change JSON" },
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as { ok?: unknown }).ok !== true
  ) {
    const error =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { error?: unknown }).error === "string"
        ? String((parsed as { error: string }).error)
        : "the change intent was rejected";
    return rejectUpdate(
      `The requested change could not be applied: ${error}. The form is unchanged.`,
      "Rejected update: change intent",
      { ok: false, error },
    );
  }

  const plan = parseChangePlan((parsed as { plan?: unknown }).plan);
  if (!plan) {
    return rejectUpdate(
      "The requested change could not be applied because the bounded change plan was malformed. The form is unchanged.",
      "Rejected update: malformed change plan",
      { ok: false, error: "malformed change plan" },
    );
  }

  let result: RequestActionResult;
  try {
    result = applyChangePlan(surface, plan);
  } catch (error) {
    return rejectUpdate(
      `The requested change could not be applied: ${
        error instanceof Error ? error.message : "unknown update error"
      }. The form is unchanged.`,
      "Rejected update: host apply error",
      { ok: false, error: "host apply error" },
    );
  }

  console.info(
    `[a2ui] update status=${surface.status} revision=${String(
      surface.revision,
    )} fields=${Object.keys(surface.fields).join(",")} ` +
      `painted=${String(result.painted)} summary=${result.summary}`,
  );
  if (!result.painted) {
    await emitTextMessage(result.text);
    return {
      messages: [
        compactApply({ ok: false, error: result.summary }),
        assistantText(result.text),
      ],
      status: surface.status,
      revision: surface.revision,
      surfaceId: surface.surfaceId,
      category: surface.category,
      summary: result.summary,
      mode: "live" as const,
    };
  }

  const problem = validateActionEnvelope(
    result.envelope,
    surface.surfaceId,
  );
  if (problem) {
    return rejectUpdate(
      `Update rejected before paint: ${problem}. The form is unchanged.`,
      "Rejected update before paint",
      { ok: false, error: "update failed host validation" },
    );
  }

  await emitTextMessage(result.text);
  return {
    ...publicSurfaceState(result.surface, result.summary),
    messages: [
      compactApply({ ok: true, summary: result.summary }),
      publishRequestMessage(result.text, surface.surfaceId, result.envelope),
    ],
  };
}

async function liveObserveNode(
  state: RequestStateType,
  config: LangGraphRunnableConfig,
): Promise<Record<string, unknown>> {
  const generateTool = lastToolMessage(state, "generate_a2ui");
  if (generateTool) {
    const outcome = parseLiveToolResult(messageText(generateTool));
    if (outcome.kind === "failure") {
      const details =
        outcome.errors.length > 0
          ? ` Details: ${outcome.errors.slice(0, 3).join(" | ")}`
          : "";
      const text = state.surface
        ? `A2UI generation failed: ${outcome.message}.${details} The existing form is unchanged.`
        : `A2UI generation failed: ${outcome.message}.${details} No form was painted; retry with a clearer request.`;
      await emitTextMessage(text);
      return {
        messages: [
          compactToolMessage(
            generateTool,
            JSON.stringify({ ok: false, error: outcome.message }),
          ),
          assistantText(text),
        ],
        status: state.surface?.status ?? state.status,
        revision: state.surface?.revision ?? state.revision,
        surfaceId: state.surface?.surfaceId ?? state.surfaceId,
        category: state.surface?.category ?? state.category,
        summary: `Live generation failed: ${outcome.message}`.slice(0, 160),
        mode: "live" as const,
      };
    }

    const expectedSurfaceId = makeSurfaceId(config);
    const compactGenerate = () =>
      compactToolMessage(
        generateTool,
        JSON.stringify({ ok: true, surfaceId: outcome.surfaceId }),
      );
    if (outcome.surfaceId !== expectedSurfaceId) {
      return liveReject(
        state,
        `A2UI generation was rejected: surface ${outcome.surfaceId} does not match the host surface ${expectedSurfaceId}.`,
        "Live generation surface mismatch",
        [compactGenerate()],
      );
    }
    if (state.surface) {
      return liveReject(
        state,
        "A second form was rejected. The existing form is unchanged; use apply_request_changes for follow-up edits.",
        "Live second create rejected",
        [compactGenerate()],
      );
    }

    let surface: SurfaceState;
    try {
      surface = createSurfaceState({
        surfaceId: outcome.surfaceId,
        category: state.category,
        components: outcome.components,
        data: outcome.data ?? {},
      });
    } catch (error) {
      return liveReject(
        state,
        `A2UI generation was rejected after validation: ${
          error instanceof Error ? error.message : "unknown host error"
        }. No form was painted.`,
        "Live surface state rejected",
        [compactGenerate()],
      );
    }

    return {
      ...publicSurfaceState(surface, "Live A2UI surface created"),
      messages: [
        compactToolMessage(
          generateTool,
          JSON.stringify({
            ok: true,
            surfaceId: outcome.surfaceId,
            summary: "Surface created",
          }),
        ),
      ],
    };
  }

  const publishTool = lastToolMessage(state, PUBLISH_REQUEST_TOOL_NAME);
  if (publishTool && state.surface) {
    const publishCall = findToolCallMessage(
      state.messages,
      publishTool.tool_call_id,
    );
    const compactPublishCall = publishCall
      ? compactToolCallArgs(publishCall, publishTool.tool_call_id, {
          surfaceId: state.surface.surfaceId,
          published: true,
        })
      : null;
    const compactPublishTool = (content: Record<string, unknown>) =>
      compactToolMessage(publishTool, JSON.stringify(content));
    const problem = validateActionEnvelope(
      messageText(publishTool),
      state.surface.surfaceId,
    );
    if (problem) {
      console.error(
        `[a2ui] internal assertion failed after publish: ${problem}`,
      );
      await emitTextMessage(
        "The host could not confirm the published A2UI update. The server state may be ahead of the rendered surface; use New request to recover.",
      );
      return {
        messages: [
          ...(compactPublishCall ? [compactPublishCall] : []),
          compactPublishTool({
            ok: false,
            error: "final publish validation failed",
          }),
          assistantText(
            "The host could not confirm the published A2UI update. The server state may be ahead of the rendered surface; use New request to recover.",
          ),
        ],
        summary: "Final publish validation failed",
        mode: "live" as const,
      };
    }
    return {
      mode: "live" as const,
      summary:
        state.surface.status === "submitted-demo"
          ? "Demo request submitted (simulation only)"
          : "Live surface updated",
      messages: [
        ...(compactPublishCall ? [compactPublishCall] : []),
        compactPublishTool({
          ok: true,
          surfaceId: state.surface.surfaceId,
          status: state.surface.status,
          revision: state.surface.revision,
        }),
      ],
    };
  }

  return {};
}

function routeStart(state: RequestStateType): string {
  if (findLastA2UIAction(state.messages) || hasUnparsedA2UIAction(state.messages)) {
    return "action";
  }
  return "agent";
}

function routeAfterAgent(state: RequestStateType): string {
  const last = state.messages.at(-1);
  const toolCalls = last ? (last as AIMessage).tool_calls : undefined;
  return Array.isArray(toolCalls) && toolCalls.length > 0 ? "tools" : END;
}

function routeAfterTools(state: RequestStateType): string {
  const last = state.messages.at(-1);
  if (last?.type === "tool" && last.name === APPLY_CHANGES_TOOL_NAME) {
    return "update";
  }
  return "observe";
}

function routeAfterUpdate(state: RequestStateType): string {
  const last = state.messages.at(-1);
  const toolCalls = last ? (last as AIMessage).tool_calls : undefined;
  return Array.isArray(toolCalls) && toolCalls.length > 0 ? "tools" : END;
}

function createLiveGraph() {
  const model = createChatModel();
  const tools = [createLiveGenerateTool(model), createApplyChangesTool()];
  const boundModel = model.bindTools(tools, { parallel_tool_calls: false });
  const publishTool = tool(
    async ({ surfaceId, envelope }: { surfaceId: string; envelope: string }) => {
      const problem = validateActionEnvelope(envelope, surfaceId);
      if (problem) {
        return JSON.stringify({
          error: `A2UI host update rejected: ${problem}`,
        });
      }
      return envelope;
    },
    {
      name: PUBLISH_REQUEST_TOOL_NAME,
      description:
        "Publish host-validated deterministic A2UI review, submit, or update operations. Internal host tool.",
      schema: z.object({
        surfaceId: z.string().min(1),
        envelope: z.string().min(1),
      }),
    },
  );
  const toolNode = new ToolNode([...tools, publishTool]);

  console.info(
    `[agent] live planner tools: ${tools.map((entry) => entry.name).join(", ")}`,
  );

  async function agentNode(state: RequestStateType) {
    const lastMessage = state.messages.at(-1);
    if (lastMessage?.type === "human" && messageText(lastMessage).length > MAX_PROMPT_LENGTH) {
      const text = `The request is longer than ${String(
        MAX_PROMPT_LENGTH,
      )} characters. Shorten it and try again.`;
      await emitTextMessage(text);
      return {
        messages: [assistantText(text)],
        summary: "Live prompt rejected: too long",
        mode: "live" as const,
      };
    }

    const startedAt = Date.now();
    const input: BaseMessage[] = [new SystemMessage(SYSTEM_INSTRUCTIONS)];
    if (state.surface) {
      input.push(new SystemMessage(plannerSurfaceContext(state.surface)));
    }
    input.push(...state.messages);
    const response = await boundModel.invoke(input);
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

  return new StateGraph(RequestState, {
    input: RequestInputSchema,
    output: RequestOutputSchema,
  })
    .addNode("agent", agentNode)
    .addNode("action", liveActionNode)
    .addNode("tools", toolNode)
    .addNode("update", liveUpdateNode)
    .addNode("observe", liveObserveNode)
    .addConditionalEdges(START, routeStart, ["agent", "action"])
    .addConditionalEdges("agent", routeAfterAgent, ["tools", END])
    .addConditionalEdges("action", routeAfterAgent, ["tools", END])
    .addConditionalEdges("tools", routeAfterTools, ["update", "observe"])
    .addConditionalEdges("update", routeAfterUpdate, ["tools", END])
    .addEdge("observe", END)
    .compile();
}

const mode = resolveAgentMode();

export const graph = mode === "fixture" ? createFixtureGraph() : createLiveGraph();

export type { FixtureDefinition };
