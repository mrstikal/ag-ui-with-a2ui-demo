import type { Message } from "@ag-ui/core";

export const MAX_CLIENT_HISTORY_MESSAGES = 40;
export const MAX_CLIENT_HISTORY_CHARS = 32_000;
export const MAX_CLIENT_TAIL_MESSAGES = 8;

function messageChars(message: Message): number {
  const content = (message as { content?: unknown }).content;
  const contentChars =
    typeof content === "string"
      ? content.length
      : JSON.stringify(content ?? "").length;
  const toolCalls = (message as { toolCalls?: unknown }).toolCalls;
  const toolChars =
    toolCalls === undefined ? 0 : JSON.stringify(toolCalls).length;
  return contentChars + toolChars;
}

function roleOf(message: Message): string | undefined {
  return (message as { role?: string }).role;
}

function isActivity(message: Message): boolean {
  return roleOf(message) === "activity";
}

function isUser(message: Message): boolean {
  return roleOf(message) === "user";
}

function isTool(message: Message): boolean {
  return roleOf(message) === "tool";
}

function hasToolCalls(message: Message): boolean {
  const toolCalls = (message as { toolCalls?: unknown }).toolCalls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
}

function lastIndex(
  messages: Message[],
  predicate: (message: Message) => boolean,
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && predicate(message)) {
      return index;
    }
  }
  return -1;
}

function tailGroupSize(messages: Message[]): number {
  const lastUser = lastIndex(messages, isUser);
  if (lastUser >= 0) {
    return messages.length - lastUser;
  }
  const lastToolCall = lastIndex(
    messages,
    (message) => roleOf(message) === "assistant" && hasToolCalls(message),
  );
  return lastToolCall >= 0 ? messages.length - lastToolCall : 1;
}

function boundedTailSize(messages: Message[]): number {
  let size = Math.min(tailGroupSize(messages), MAX_CLIENT_TAIL_MESSAGES);
  let boundary = messages.length - size;
  while (boundary > 0 && isTool(messages[boundary] as Message)) {
    boundary -= 1;
    size += 1;
  }
  return size;
}

function trimConversation(messages: Message[]): Message[] {
  const total = messages.reduce(
    (sum, message) => sum + messageChars(message),
    0,
  );
  if (messages.length <= MAX_CLIENT_HISTORY_MESSAGES && total <= MAX_CLIENT_HISTORY_CHARS) {
    return messages;
  }

  let start = Math.max(0, messages.length - MAX_CLIENT_HISTORY_MESSAGES);
  while (start < messages.length && isTool(messages[start] as Message)) {
    start += 1;
  }
  let kept = messages.slice(start);
  let keptChars = kept.reduce(
    (sum, message) => sum + messageChars(message),
    0,
  );
  const minimumKept = boundedTailSize(kept);

  while (kept.length > minimumKept && keptChars > MAX_CLIENT_HISTORY_CHARS) {
    const nextUser = kept.findIndex(
      (message, index) => index > 0 && isUser(message),
    );
    const available = kept.length - minimumKept;
    const dropCount = Math.min(nextUser > 0 ? nextUser : 1, available);
    keptChars -= kept
      .slice(0, dropCount)
      .reduce((sum, message) => sum + messageChars(message), 0);
    kept = kept.slice(dropCount);
    while (kept.length > minimumKept && isTool(kept[0] as Message)) {
      keptChars -= messageChars(kept[0] as Message);
      kept = kept.slice(1);
    }
  }

  return kept;
}

export function trimClientMessages(messages: Message[]): Message[] {
  const latestActivityByType = new Map<string, Message>();
  for (const message of messages) {
    if (isActivity(message)) {
      const activityType =
        (message as { activityType?: unknown }).activityType;
      latestActivityByType.set(
        typeof activityType === "string" ? activityType : "activity",
        message,
      );
    }
  }

  const conversation = messages.filter((message) => !isActivity(message));
  const trimmed = trimConversation(conversation);
  const keep = new Set<Message>([
    ...latestActivityByType.values(),
    ...trimmed,
  ]);
  if (keep.size === messages.length) {
    return messages;
  }
  return messages.filter((message) => keep.has(message));
}
