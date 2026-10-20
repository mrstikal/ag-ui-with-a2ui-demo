import type { BaseEvent } from "@ag-ui/core";
import {
  LOG_A2UI_EVENT_TOOL_NAME,
  parseForwardedActionText,
  type ForwardedActionPayload,
} from "@arb/shared";

export type InspectorFamily =
  | "run"
  | "text"
  | "tool"
  | "state"
  | "messages"
  | "a2ui"
  | "activity"
  | "error"
  | "raw"
  | "other";

export interface ActionEvidence extends ForwardedActionPayload {
  receivedAt: string;
  toolCallId?: string;
}

export interface InspectorDescription {
  family: InspectorFamily;
  summary: string;
  payload: Record<string, unknown>;
  action?: ForwardedActionPayload;
}

export function classifyEvent(event: BaseEvent): InspectorFamily {
  const type = String((event as unknown as Record<string, unknown>).type ?? "");
  if (type === "RUN_ERROR") return "error";
  if (type.startsWith("RUN_") || type.startsWith("STEP_")) return "run";
  if (type.startsWith("TEXT_")) return "text";
  if (type.startsWith("TOOL_CALL_")) return "tool";
  if (type === "STATE_SNAPSHOT" || type === "STATE_DELTA") return "state";
  if (type === "MESSAGES_SNAPSHOT") return "messages";
  if (type === "RAW") return "raw";
  if (type === "ACTIVITY_SNAPSHOT" || type === "ACTIVITY_DELTA") {
    const activityType = String(
      (event as unknown as Record<string, unknown>).activityType ?? "",
    );
    return activityType === "a2ui-surface" ? "a2ui" : "activity";
  }
  return "other";
}

export function describeEvent(
  event: BaseEvent,
  toolName?: string,
): InspectorDescription {
  const record = event as unknown as Record<string, unknown>;
  const type = String(record.type ?? "UNKNOWN");
  const family = classifyEvent(event);

  switch (type) {
    case "RUN_STARTED":
      return {
        family,
        summary: `run started thread=${shortId(record.threadId)}`,
        payload: {
          threadId: stringOrUndefined(record.threadId),
          runId: stringOrUndefined(record.runId),
        },
      };
    case "RUN_FINISHED":
      return {
        family,
        summary: `run finished ${shortId(record.runId)}`,
        payload: { runId: stringOrUndefined(record.runId) },
      };
    case "RUN_ERROR": {
      const message = cap(stringOrUndefined(record.message) ?? "unknown error", 300);
      return {
        family,
        summary: `error: ${cap(message, 120)}`,
        payload: {
          code: stringOrUndefined(record.code),
          message,
        },
      };
    }
    case "STEP_STARTED":
    case "STEP_FINISHED":
      return {
        family,
        summary: `${type.toLowerCase()} ${String(record.stepName ?? "")}`,
        payload: { stepName: stringOrUndefined(record.stepName) },
      };
    case "TEXT_MESSAGE_START":
      return {
        family,
        summary: `text start ${shortId(record.messageId)}`,
        payload: {
          messageId: stringOrUndefined(record.messageId),
          role: stringOrUndefined(record.role),
        },
      };
    case "TEXT_MESSAGE_CONTENT": {
      const deltaLength = textLength(record.delta);
      return {
        family,
        summary: `text content ${deltaLength} chars`,
        payload: {
          messageId: stringOrUndefined(record.messageId),
          deltaLength,
        },
      };
    }
    case "TEXT_MESSAGE_END":
      return {
        family,
        summary: `text end ${shortId(record.messageId)}`,
        payload: { messageId: stringOrUndefined(record.messageId) },
      };
    case "TOOL_CALL_START":
      return {
        family,
        summary: `tool start ${String(record.toolCallName ?? "?")}`,
        payload: {
          toolCallId: stringOrUndefined(record.toolCallId),
          toolCallName: stringOrUndefined(record.toolCallName),
        },
      };
    case "TOOL_CALL_ARGS":
      return {
        family,
        summary: `tool args ${textLength(record.delta)} chars`,
        payload: {
          toolCallId: stringOrUndefined(record.toolCallId),
          argsLength: textLength(record.delta),
        },
      };
    case "TOOL_CALL_END":
      return {
        family,
        summary: `tool end ${shortId(record.toolCallId)}`,
        payload: { toolCallId: stringOrUndefined(record.toolCallId) },
      };
    case "TOOL_CALL_RESULT": {
      const content =
        typeof record.content === "string" ? record.content : "";
      const action =
        toolName === LOG_A2UI_EVENT_TOOL_NAME && content
          ? parseForwardedActionText(content)
          : null;
      if (action) {
        return {
          family,
          summary: `forwarded action "${action.name}" on ${action.surfaceId}`,
          payload: {
            toolCallId: stringOrUndefined(record.toolCallId),
            actionName: action.name,
            surfaceId: action.surfaceId,
            sourceComponentId: action.sourceComponentId,
          },
          action,
        };
      }
      return {
        family,
        summary: `tool result ${textLength(record.content)} chars`,
        payload: {
          toolCallId: stringOrUndefined(record.toolCallId),
          contentLength: textLength(record.content),
        },
      };
    }
    case "STATE_SNAPSHOT": {
      const snapshot = objectOrEmpty(record.snapshot);
      const surfaceId = stringOrUndefined(snapshot.surfaceId);
      return {
        family,
        summary: `state ${String(snapshot.status ?? "?")}/${String(
          snapshot.revision ?? "?",
        )} surface=${shortId(surfaceId)}`,
        payload: {
          status: snapshot.status,
          revision: snapshot.revision,
          surfaceId,
          category: snapshot.category,
          summary: cap(stringOrUndefined(snapshot.summary) ?? "", 160),
          mode: snapshot.mode,
        },
      };
    }
    case "STATE_DELTA": {
      const delta = Array.isArray(record.delta) ? record.delta : [];
      return {
        family,
        summary: `state delta ${delta.length} patches`,
        payload: { patchCount: delta.length },
      };
    }
    case "MESSAGES_SNAPSHOT": {
      const messages = Array.isArray(record.messages) ? record.messages : [];
      const roles = messages
        .map((message) => {
          const entry = objectOrEmpty(message);
          return stringOrUndefined(entry.role) ?? "unknown";
        })
        .slice(0, 40);
      const action = latestForwardedAction(messages);
      return {
        family,
        summary: `messages snapshot ${messages.length}${
          action ? ` · forwarded action "${action.name}"` : ""
        }`,
        payload: { count: messages.length, roles },
        ...(action ? { action } : {}),
      };
    }
    case "ACTIVITY_SNAPSHOT":
    case "ACTIVITY_DELTA": {
      const content = objectOrEmpty(record.content);
      const operations = Array.isArray(content.a2ui_operations)
        ? content.a2ui_operations
        : [];
      const kinds = operations.map(operationKind);
      const surfaceIds = unique(
        operations
          .map(operationSurfaceId)
          .filter((value): value is string => Boolean(value)),
      );
      return {
        family,
        summary: `${String(record.activityType ?? "activity")}: ${
          kinds.length > 0 ? kinds.join(", ") : "no operations"
        }`,
        payload: {
          activityType: record.activityType,
          messageId: stringOrUndefined(record.messageId),
          operations: kinds,
          surfaceIds,
        },
      };
    }
    case "CUSTOM":
      return {
        family,
        summary: `custom ${String(record.name ?? "?")}`,
        payload: {
          name: stringOrUndefined(record.name),
          valueLength: textLength(record.value),
        },
      };
    case "RAW":
      return {
        family,
        summary: `raw event ${textLength(record.event)} chars`,
        payload: {
          source: stringOrUndefined(record.source),
          length: textLength(record.event),
        },
      };
    default:
      return {
        family,
        summary: type,
        payload: {},
      };
  }
}

export function boundJson(value: unknown, maxChars = 2000): string {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? "null";
  } catch {
    text = '"[unserializable]"';
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... [truncated]`;
}

function latestForwardedAction(
  messages: unknown[],
): ForwardedActionPayload | null {
  const actionToolCallIds = new Set<string>();

  for (const message of messages) {
    const entry = objectOrEmpty(message);
    if (entry.role !== "assistant") {
      continue;
    }
    const toolCalls = Array.isArray(entry.toolCalls)
      ? entry.toolCalls
      : Array.isArray(entry.tool_calls)
        ? entry.tool_calls
        : [];
    for (const toolCall of toolCalls) {
      const call = objectOrEmpty(toolCall);
      const callId = stringOrUndefined(call.id);
      const callName =
        stringOrUndefined(objectOrEmpty(call.function).name) ??
        stringOrUndefined(call.name);
      if (callId && callName === LOG_A2UI_EVENT_TOOL_NAME) {
        actionToolCallIds.add(callId);
      }
    }
  }

  if (actionToolCallIds.size === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = objectOrEmpty(messages[index]);
    if (message.role !== "tool" || typeof message.content !== "string") {
      continue;
    }
    const toolCallId =
      stringOrUndefined(message.toolCallId) ??
      stringOrUndefined(message.tool_call_id);
    if (!toolCallId || !actionToolCallIds.has(toolCallId)) {
      continue;
    }
    const action = parseForwardedActionText(message.content);
    if (action) {
      return action;
    }
  }
  return null;
}

function operationKind(operation: unknown): string {
  const record = objectOrEmpty(operation);
  return (
    Object.keys(record).find((key) => key !== "version") ?? "unknown"
  );
}

function operationSurfaceId(operation: unknown): string | undefined {
  const record = objectOrEmpty(operation);
  for (const key of [
    "createSurface",
    "updateComponents",
    "updateDataModel",
    "deleteSurface",
  ]) {
    const value = objectOrEmpty(record[key]);
    const surfaceId = stringOrUndefined(value.surfaceId);
    if (surfaceId) {
      return surfaceId;
    }
  }
  return undefined;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function textLength(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return JSON.stringify(value).length;
  if (value && typeof value === "object") {
    return JSON.stringify(value).length;
  }
  return 0;
}

function cap(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function shortId(value: unknown): string {
  const text = stringOrUndefined(value);
  return text ? text.slice(0, 8) : "n/a";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
