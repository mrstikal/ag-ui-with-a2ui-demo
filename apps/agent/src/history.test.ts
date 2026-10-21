import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_TAIL_MESSAGES,
  trimHistory,
} from "./history.js";

function alternating(count: number): BaseMessage[] {
  return Array.from({ length: count }, (_, index) =>
    index % 2 === 0
      ? new HumanMessage(`user ${String(index)}`)
      : new AIMessage(`assistant ${String(index)}`),
  );
}

describe("bounded LangGraph history", () => {
  it("leaves short histories untouched", () => {
    const messages = alternating(6);

    expect(trimHistory(messages)).toBe(messages);
  });

  it("keeps the most recent messages within the count limit", () => {
    const messages = alternating(100);

    const trimmed = trimHistory(messages);

    expect(trimmed.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
    expect(trimmed.at(-1)?.content).toBe("assistant 99");
    expect(trimmed[0]?.type).not.toBe("tool");
  });

  it("drops the oldest complete groups when the character budget is exceeded", () => {
    const messages = Array.from(
      { length: 50 },
      (_, index) => new HumanMessage(`${String(index)}:${"x".repeat(1_000)}`),
    );

    const trimmed = trimHistory(messages);

    const chars = trimmed.reduce(
      (sum, message) =>
        sum +
        (typeof message.content === "string"
          ? message.content.length
          : JSON.stringify(message.content).length),
      0,
    );
    expect(chars).toBeLessThanOrEqual(MAX_HISTORY_CHARS);
    expect(trimmed.at(-1)?.content).toContain("49:");
  });

  it("counts tool-call arguments toward the character budget", () => {
    const messages: BaseMessage[] = Array.from(
      { length: 10 },
      (_, index) =>
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: `call-${String(index)}`,
              name: "publish",
              args: { payload: "x".repeat(5_000) },
            },
          ],
        }),
    );

    const trimmed = trimHistory(messages);

    expect(trimmed.length).toBeLessThan(10);
    expect(trimmed.at(-1)).toBe(messages.at(-1));
  });

  it("keeps the final group even when it alone exceeds the character budget", () => {
    const message = new HumanMessage("x".repeat(MAX_HISTORY_CHARS + 1_000));

    expect(trimHistory([message])).toEqual([message]);
  });

  it("bounds long action chains even when one human message precedes them", () => {
    const messages: BaseMessage[] = [new HumanMessage("start")];
    for (let round = 0; round < 10; round += 1) {
      messages.push(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: `call-a-${String(round)}`,
              name: "publish",
              args: { envelope: "x".repeat(4_000) },
            },
          ],
        }),
        new ToolMessage({
          content: "y".repeat(4_000),
          tool_call_id: `call-a-${String(round)}`,
        }),
      );
    }
    messages.push(new HumanMessage("follow-up"));
    for (let round = 0; round < 9; round += 1) {
      messages.push(
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: `call-b-${String(round)}`,
              name: "publish",
              args: { envelope: "x".repeat(4_000) },
            },
          ],
        }),
        new ToolMessage({
          content: "y".repeat(4_000),
          tool_call_id: `call-b-${String(round)}`,
        }),
      );
    }

    const trimmed = trimHistory(messages);

    expect(trimmed.length).toBeLessThanOrEqual(MAX_TAIL_MESSAGES);
    expect(trimmed.at(-1)).toBe(messages.at(-1));
  });

  it("does not start with an orphaned tool result", () => {
    const messages: BaseMessage[] = [
      new HumanMessage("start"),
      new AIMessage("filler"),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-1", name: "tool", args: {} }],
      }),
      new ToolMessage({ content: "result", tool_call_id: "call-1" }),
      ...alternating(39),
    ];

    const trimmed = trimHistory(messages);

    expect(trimmed[0]?.type).not.toBe("tool");
  });

  it("keeps a retained tool call and its result together", () => {
    const messages: BaseMessage[] = [
      ...alternating(40),
      new AIMessage({
        content: "",
        tool_calls: [{ id: "call-2", name: "tool", args: {} }],
      }),
      new ToolMessage({ content: "result", tool_call_id: "call-2" }),
    ];

    const trimmed = trimHistory(messages);

    expect(trimmed.at(-2)?.type).toBe("ai");
    expect(trimmed.at(-1)?.type).toBe("tool");
  });
});
