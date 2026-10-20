import { describe, expect, it } from "vitest";
import { findLastA2UIAction, hasUnparsedA2UIAction } from "./action.js";

const toolCall = {
  type: "ai",
  tool_calls: [{ id: "call-action", name: "log_a2ui_event" }],
};

describe("forwarded A2UI action parsing", () => {
  it("parses the installed middleware format without quoted component IDs", () => {
    const messages = [
      toolCall,
      {
        type: "tool",
        tool_call_id: "call-action",
        content:
          'User performed action "reviewRequest" on surface "surface-1" (component: review). Context: {"title":"Login fails on Safari","revision":0}',
      },
    ];

    expect(findLastA2UIAction(messages as never)).toEqual({
      name: "reviewRequest",
      surfaceId: "surface-1",
      sourceComponentId: "review",
      context: { title: "Login fails on Safari", revision: 0 },
    });
    expect(hasUnparsedA2UIAction(messages as never)).toBe(false);
  });

  it("detects an unparseable log_a2ui_event result", () => {
    const messages = [
      toolCall,
      {
        type: "tool",
        tool_call_id: "call-action",
        content: "User performed action in an unexpected format",
      },
    ];

    expect(findLastA2UIAction(messages as never)).toBeNull();
    expect(hasUnparsedA2UIAction(messages as never)).toBe(true);
  });
});
