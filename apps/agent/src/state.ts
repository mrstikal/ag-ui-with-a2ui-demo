import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export type AgentMode = "fixture" | "live";
export type RequestStatus = "editing" | "review" | "submitted-demo";
export type RequestCategory = "bug" | "feature" | "meeting" | "other";

export const RequestState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  status: Annotation<RequestStatus>({
    reducer: (_previous, next) => next,
    default: () => "editing",
  }),
  revision: Annotation<number>({
    reducer: (_previous, next) => next,
    default: () => 0,
  }),
  surfaceId: Annotation<string | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
  category: Annotation<RequestCategory>({
    reducer: (_previous, next) => next,
    default: () => "other",
  }),
  summary: Annotation<string>({
    reducer: (_previous, next) => next,
    default: () => "",
  }),
  mode: Annotation<AgentMode>({
    reducer: (_previous, next) => next,
    default: () => resolveAgentMode(),
  }),
});

export type RequestStateType = typeof RequestState.State;

export function resolveAgentMode(): AgentMode {
  const raw = process.env.AGENT_MODE?.trim().toLowerCase();

  if (raw === "fixture" || raw === "live") {
    return raw;
  }

  throw new Error(
    "AGENT_MODE must be explicitly set to 'fixture' or 'live'. " +
      "Fixture mode is deterministic and visibly labeled; it is never a silent substitute for a live model.",
  );
}
