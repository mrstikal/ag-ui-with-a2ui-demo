import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage, ToolMessage } from "@langchain/core/messages";

export const LOG_A2UI_EVENT_TOOL_NAME = "log_a2ui_event";

export interface ForwardedA2UIAction {
  name: string;
  surfaceId?: string;
  sourceComponentId?: string;
  context: Record<string, unknown>;
}

const ACTION_PATTERN =
  /^User performed action "([^"]+)" on surface "([^"]+)"(?: \(component: ([^)]+)\))?\. Context: (.*)$/s;

export function findLastA2UIAction(
  messages: BaseMessage[],
): ForwardedA2UIAction | null {
  const toolMessage = findA2UIActionToolMessage(messages);
  if (!toolMessage) {
    return null;
  }

  const content =
    typeof toolMessage.content === "string"
      ? toolMessage.content
      : JSON.stringify(toolMessage.content);
  const match = ACTION_PATTERN.exec(content);
  if (!match) {
    return null;
  }

  let context: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(match[4] ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      context = parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return {
    name: match[1] ?? "",
    surfaceId: match[2],
    ...(match[3]
      ? { sourceComponentId: match[3].replace(/^"|"$/g, "") }
      : {}),
    context,
  };
}

export function hasUnparsedA2UIAction(messages: BaseMessage[]): boolean {
  return (
    findA2UIActionToolMessage(messages) !== null &&
    findLastA2UIAction(messages) === null
  );
}

function findA2UIActionToolMessage(
  messages: BaseMessage[],
): ToolMessage | null {
  const last = messages.at(-1);
  if (!last || last.type !== "tool") {
    return null;
  }
  const toolMessage = last as ToolMessage;

  const matchedCall = findToolCallName(messages, toolMessage.tool_call_id);
  if (matchedCall?.name !== LOG_A2UI_EVENT_TOOL_NAME) {
    return null;
  }

  return toolMessage;
}

function findToolCallName(
  messages: BaseMessage[],
  toolCallId: string,
): { name: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.type !== "ai") {
      continue;
    }
    const toolCalls = (message as AIMessage).tool_calls;
    if (!Array.isArray(toolCalls)) {
      continue;
    }
    const call = toolCalls.find((entry) => entry.id === toolCallId);
    if (call) {
      return { name: call.name };
    }
  }
  return null;
}

export function isPromptMessage(message: BaseMessage | undefined): boolean {
  return message !== undefined && message.type === "human";
}

export function readContextValue(
  context: Record<string, unknown>,
  key: string,
): string | null {
  const value = context[key];
  return typeof value === "string" ? value : null;
}
