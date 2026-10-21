import type { Message } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import {
  MAX_CLIENT_HISTORY_CHARS,
  MAX_CLIENT_HISTORY_MESSAGES,
  MAX_CLIENT_TAIL_MESSAGES,
  trimClientMessages,
} from "./history.js";

function alternating(count: number): Message[] {
  return Array.from({ length: count }, (_, index) =>
    ({
      id: `message-${String(index)}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `${String(index)}:${"x".repeat(20)}`,
    }) as unknown as Message,
  );
}

function activity(
  id = "surface-activity",
  activityType = "a2ui-surface",
): Message {
  return {
    id,
    role: "activity",
    activityType,
    content: { components: ["root"] },
  } as unknown as Message;
}

describe("bounded client history", () => {
  it("leaves short histories untouched", () => {
    const messages = alternating(6);

    expect(trimClientMessages(messages)).toBe(messages);
  });

  it("keeps recent conversation messages within the count limit", () => {
    const messages = alternating(100);

    const trimmed = trimClientMessages(messages);

    expect(trimmed.length).toBeLessThanOrEqual(MAX_CLIENT_HISTORY_MESSAGES);
    expect(trimmed.at(-1)?.id).toBe("message-99");
  });

  it("always keeps the active A2UI activity message", () => {
    const surface = activity();
    const messages = [surface, ...alternating(100)];

    const trimmed = trimClientMessages(messages);

    expect(trimmed).toContain(surface);
    expect(trimmed[0]).toBe(surface);
    expect(trimmed.length).toBeLessThanOrEqual(
      MAX_CLIENT_HISTORY_MESSAGES + 1,
    );
  });

  it("keeps only the latest activity message per activity type", () => {
    const oldSurface = activity("surface-old");
    const newSurface = activity("surface-new");
    const messages = [oldSurface, newSurface, ...alternating(6)];

    const trimmed = trimClientMessages(messages);

    expect(trimmed).not.toContain(oldSurface);
    expect(trimmed).toContain(newSurface);
  });

  it("counts tool-call arguments toward the character budget", () => {
    const messages = Array.from(
      { length: 10 },
      (_, index) =>
        ({
          id: `tool-call-${String(index)}`,
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: `call-${String(index)}`,
              type: "function",
              function: {
                name: "publish",
                arguments: JSON.stringify({ payload: "x".repeat(5_000) }),
              },
            },
          ],
        }) as unknown as Message,
    );

    const trimmed = trimClientMessages(messages);

    expect(trimmed.length).toBeLessThan(10);
    expect(trimmed.at(-1)).toBe(messages.at(-1));
  });

  it("keeps the final group even when it alone exceeds the character budget", () => {
    const message = {
      id: "oversized",
      role: "user",
      content: "x".repeat(MAX_CLIENT_HISTORY_CHARS + 1_000),
    } as unknown as Message;

    expect(trimClientMessages([message])).toEqual([message]);
  });

  it("bounds long action chains even when one user message precedes them", () => {
    const messages: Message[] = [
      { id: "start", role: "user", content: "start" } as unknown as Message,
    ];
    const appendRound = (prefix: string) => {
      messages.push(
        {
          id: `${prefix}-call`,
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: `${prefix}-tool`,
              type: "function",
              function: {
                name: "publish",
                arguments: JSON.stringify({ envelope: "x".repeat(4_000) }),
              },
            },
          ],
        } as unknown as Message,
        {
          id: `${prefix}-result`,
          role: "tool",
          toolCallId: `${prefix}-tool`,
          content: "y".repeat(4_000),
        } as unknown as Message,
      );
    };
    for (let round = 0; round < 10; round += 1) {
      appendRound(`a-${String(round)}`);
    }
    messages.push({
      id: "follow-up",
      role: "user",
      content: "follow-up",
    } as unknown as Message);
    for (let round = 0; round < 9; round += 1) {
      appendRound(`b-${String(round)}`);
    }

    const trimmed = trimClientMessages(messages);

    expect(trimmed.length).toBeLessThanOrEqual(MAX_CLIENT_TAIL_MESSAGES);
    expect(trimmed.at(-1)).toBe(messages.at(-1));
  });

  it("drops old groups when the character budget is exceeded", () => {
    const messages = Array.from(
      { length: 60 },
      (_, index) =>
        ({
          id: `message-${String(index)}`,
          role: "user",
          content: `${String(index)}:${"x".repeat(1_000)}`,
        }) as unknown as Message,
    );

    const trimmed = trimClientMessages(messages);

    const chars = trimmed.reduce(
      (sum, message) =>
        sum +
        (typeof message.content === "string"
          ? message.content.length
          : JSON.stringify(message.content).length),
      0,
    );
    expect(chars).toBeLessThanOrEqual(MAX_CLIENT_HISTORY_CHARS);
    expect(trimmed.at(-1)?.id).toBe("message-59");
  });
});
