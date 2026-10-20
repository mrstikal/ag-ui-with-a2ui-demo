import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  LOG_A2UI_EVENT_TOOL_NAME,
  parseForwardedActionText,
} from "@arb/shared";

export { LOG_A2UI_EVENT_TOOL_NAME } from "@arb/shared";

export interface ForwardedA2UIAction {
  name: string;
  surfaceId?: string;
  sourceComponentId?: string;
  context: Record<string, unknown>;
}

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

  return parseForwardedActionText(content);
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
