import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { z } from "zod";
import { trimHistory } from "./history.js";
import type { RequestCategory, SurfaceState } from "./request.js";

export type AgentMode = "fixture" | "live";
export type RequestStatus = "editing" | "review" | "submitted-demo";
export type { RequestCategory };

export const RequestState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (previous, next) => trimHistory(messagesStateReducer(previous, next)),
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
  surface: Annotation<SurfaceState | null>({
    reducer: (_previous, next) => next,
    default: () => null,
  }),
});

export type RequestStateType = typeof RequestState.State;

export const RequestInputSchema = z.object({
  messages: z.array(z.unknown()).default([]),
});

export const RequestOutputSchema = z.object({
  status: z.enum(["editing", "review", "submitted-demo"]),
  revision: z.number().int().nonnegative(),
  surfaceId: z.string().nullable(),
  category: z.enum(["bug", "feature", "meeting", "other"]),
  summary: z.string(),
  mode: z.enum(["fixture", "live"]),
});

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
