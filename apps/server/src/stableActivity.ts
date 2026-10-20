import type { BaseEvent } from "@ag-ui/core";
import { extractOperations, operationSurfaceId } from "@arb/shared";
import type { MiddlewareFunction } from "@ag-ui/client";
import { map } from "rxjs";

const A2UI_ACTIVITY_TYPE = "a2ui-surface";

export function stabilizeA2UIActivity(event: BaseEvent): BaseEvent {
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
  const surfaceId =
    operations
      .map(operationSurfaceId)
      .find((value): value is string => Boolean(value)) ??
    (typeof content.surfaceId === "string" ? content.surfaceId : undefined);

  if (!surfaceId) {
    return event;
  }

  const messageId = `a2ui-surface-${surfaceId}`;
  if (event.messageId === messageId) {
    return event;
  }
  return { ...event, messageId };
}

export const stableA2UIActivityMiddleware: MiddlewareFunction = (
  input,
  next,
) =>
  next
    .run(input)
    .pipe(map((event: BaseEvent) => stabilizeA2UIActivity(event)));
