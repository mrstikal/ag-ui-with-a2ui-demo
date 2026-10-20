import type { BaseEvent } from "@ag-ui/core";
import {
  extractOperations,
  operationKind,
  operationSurfaceId,
  surfaceIdForThread,
} from "@arb/shared";
import type { MiddlewareFunction } from "@ag-ui/client";
import { filter, map } from "rxjs";

const A2UI_ACTIVITY_TYPE = "a2ui-surface";
const GENERATE_TOOL_NAME = "generate_a2ui";

export interface StabilizeOptions {
  threadId?: string;
  rewriteSurfaceIds?: boolean;
}

export interface StableMiddlewareOptions {
  live?: boolean;
}

function rewriteOperationSurfaceIds(
  operations: Array<Record<string, unknown>>,
  surfaceId: string,
): void {
  for (const operation of operations) {
    const kind = operationKind(operation);
    const body = operation[kind];
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if ("surfaceId" in record) {
        record.surfaceId = surfaceId;
      }
    }
  }
}

export function stabilizeA2UIActivity(
  event: BaseEvent,
  options: StabilizeOptions = {},
): BaseEvent {
  if (
    event.type !== "ACTIVITY_SNAPSHOT" ||
    event.activityType !== A2UI_ACTIVITY_TYPE
  ) {
    return event;
  }

  const content =
    typeof event.content === "object" && event.content !== null
      ? (event.content as Record<string, unknown>)
      : {};
  const operations = extractOperations(content);
  let surfaceId = operations
    .map(operationSurfaceId)
    .find((value): value is string => Boolean(value));

  if (options.rewriteSurfaceIds && options.threadId) {
    const target = surfaceIdForThread(options.threadId);
    rewriteOperationSurfaceIds(operations, target);
    if (typeof content.surfaceId === "string") {
      content.surfaceId = target;
    }
    surfaceId = target;
  } else if (!surfaceId && typeof content.surfaceId === "string") {
    surfaceId = content.surfaceId;
  }

  if (!surfaceId) {
    return event;
  }

  const messageId = `a2ui-surface-${surfaceId}`;
  if (event.messageId === messageId) {
    return event;
  }
  return { ...event, messageId };
}

export function createStableA2UIActivityMiddleware(
  options: StableMiddlewareOptions = {},
): MiddlewareFunction {
  const live = options.live ?? process.env.AGENT_MODE === "live";
  return (input, next) => {
    let pendingGenerations = 0;
    const generateToolCalls = new Set<string>();
    return next.run(input).pipe(
      map((event: BaseEvent): BaseEvent | null => {
        const toolCallId =
          "toolCallId" in event && typeof event.toolCallId === "string"
            ? event.toolCallId
            : undefined;
        if (
          event.type === "TOOL_CALL_START" &&
          event.toolCallName === GENERATE_TOOL_NAME &&
          toolCallId
        ) {
          pendingGenerations += 1;
          generateToolCalls.add(toolCallId);
          return event;
        }
        if (
          event.type === "TOOL_CALL_RESULT" &&
          toolCallId &&
          generateToolCalls.has(toolCallId)
        ) {
          pendingGenerations = Math.max(0, pendingGenerations - 1);
          generateToolCalls.delete(toolCallId);
          return event;
        }
        if (
          event.type === "ACTIVITY_SNAPSHOT" &&
          event.activityType === A2UI_ACTIVITY_TYPE
        ) {
          const operations = extractOperations(event.content);
          if (live && operations.length > 0) {
            if (!input.threadId || pendingGenerations > 0) {
              return null;
            }
            const target = surfaceIdForThread(input.threadId);
            const surfaces = operations
              .map(operationSurfaceId)
              .filter((value): value is string => Boolean(value));
            if (surfaces.some((surface) => surface !== target)) {
              return null;
            }
          }
          return stabilizeA2UIActivity(event, {
            threadId: input.threadId,
            rewriteSurfaceIds: live,
          });
        }
        return event;
      }),
      filter((event): event is BaseEvent => event !== null),
    );
  };
}

export const stableA2UIActivityMiddleware =
  createStableA2UIActivityMiddleware();
