import type { BaseMessage } from "@langchain/core/messages";

export const MAX_HISTORY_MESSAGES = 40;
export const MAX_HISTORY_CHARS = 32_000;
export const MAX_TAIL_MESSAGES = 8;

function messageChars(message: BaseMessage): number {
  const content = message.content;
  const contentChars =
    typeof content === "string"
      ? content.length
      : JSON.stringify(content).length;
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  const toolChars =
    toolCalls === undefined ? 0 : JSON.stringify(toolCalls).length;
  return contentChars + toolChars;
}

function lastIndex(
  messages: BaseMessage[],
  predicate: (message: BaseMessage) => boolean,
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && predicate(message)) {
      return index;
    }
  }
  return -1;
}

function tailGroupSize(messages: BaseMessage[]): number {
  const lastHuman = lastIndex(messages, (message) => message.type === "human");
  if (lastHuman >= 0) {
    return messages.length - lastHuman;
  }
  const lastToolCall = lastIndex(messages, (message) => {
    const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
    return (
      message.type === "ai" &&
      Array.isArray(toolCalls) &&
      toolCalls.length > 0
    );
  });
  return lastToolCall >= 0 ? messages.length - lastToolCall : 1;
}

function boundedTailSize(messages: BaseMessage[]): number {
  let size = Math.min(tailGroupSize(messages), MAX_TAIL_MESSAGES);
  let boundary = messages.length - size;
  while (boundary > 0 && messages[boundary]?.type === "tool") {
    boundary -= 1;
    size += 1;
  }
  return size;
}

export function trimHistory(messages: BaseMessage[]): BaseMessage[] {
  let total = messages.reduce(
    (sum, message) => sum + messageChars(message),
    0,
  );
  if (messages.length <= MAX_HISTORY_MESSAGES && total <= MAX_HISTORY_CHARS) {
    return messages;
  }

  let start = Math.max(0, messages.length - MAX_HISTORY_MESSAGES);
  while (start < messages.length && messages[start]?.type === "tool") {
    start += 1;
  }
  let kept = messages.slice(start);
  total = kept.reduce((sum, message) => sum + messageChars(message), 0);
  const minimumKept = boundedTailSize(kept);

  while (kept.length > minimumKept && total > MAX_HISTORY_CHARS) {
    const nextHuman = kept.findIndex(
      (message, index) => index > 0 && message.type === "human",
    );
    const available = kept.length - minimumKept;
    const dropCount = Math.min(
      nextHuman > 0 ? nextHuman : 1,
      available,
    );
    total -= kept
      .slice(0, dropCount)
      .reduce((sum, message) => sum + messageChars(message), 0);
    kept = kept.slice(dropCount);
    while (kept.length > minimumKept && kept[0]?.type === "tool") {
      total -= messageChars(kept[0]);
      kept = kept.slice(1);
    }
  }

  return kept;
}
