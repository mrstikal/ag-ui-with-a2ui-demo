import type { BaseEvent } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import {
  boundJson,
  classifyEvent,
  describeEvent,
} from "./inspector.js";

const asEvent = (value: Record<string, unknown>): BaseEvent =>
  value as unknown as BaseEvent;

describe("inspector redaction", () => {
  it("classifies state snapshots separately from A2UI activities", () => {
    expect(
      classifyEvent(asEvent({ type: "STATE_SNAPSHOT", snapshot: {} })),
    ).toBe("state");
    expect(
      classifyEvent(
        asEvent({
          type: "ACTIVITY_SNAPSHOT",
          activityType: "a2ui-surface",
          content: {},
        }),
      ),
    ).toBe("a2ui");
    expect(
      classifyEvent(
        asEvent({ type: "ACTIVITY_SNAPSHOT", activityType: "other", content: {} }),
      ),
    ).toBe("activity");
    expect(classifyEvent(asEvent({ type: "RAW", event: {} }))).toBe("raw");
  });

  it("never exposes messages, prompts, or tool payloads in state snapshots", () => {
    const description = describeEvent(
      asEvent({
        type: "STATE_SNAPSHOT",
        snapshot: {
          status: "editing",
          revision: 1,
          surfaceId: "surface-1",
          summary: 'draft "SECRET TITLE"',
          category: "bug",
          mode: "fixture",
          messages: [{ role: "user", content: "SECRET PROMPT" }],
          tools: [{ name: "generate_a2ui" }],
        },
      }),
    );

    expect(description.payload).toEqual({
      status: "editing",
      revision: 1,
      surfaceId: "surface-1",
      category: "bug",
      summary: 'draft "SECRET TITLE"',
      mode: "fixture",
    });
    expect(JSON.stringify(description.payload)).not.toContain("SECRET PROMPT");
    expect(description.payload).not.toHaveProperty("messages");
    expect(description.payload).not.toHaveProperty("tools");
  });

  it("reduces text and message snapshots to lengths and roles", () => {
    const text = describeEvent(
      asEvent({ type: "TEXT_MESSAGE_CONTENT", delta: "SECRET PROMPT" }),
    );
    expect(text.payload).toEqual({ messageId: undefined, deltaLength: 13 });
    expect(text.summary).not.toContain("SECRET");

    const messages = describeEvent(
      asEvent({
        type: "MESSAGES_SNAPSHOT",
        messages: [
          { role: "user", content: "SECRET PROMPT" },
          { role: "assistant", content: "SECRET ANSWER" },
        ],
      }),
    );
    expect(messages.payload).toEqual({
      count: 2,
      roles: ["user", "assistant"],
    });
    expect(JSON.stringify(messages.payload)).not.toContain("SECRET");
  });

  it("extracts forwarded action evidence from the message snapshot", () => {
    const description = describeEvent(
      asEvent({
        type: "MESSAGES_SNAPSHOT",
        messages: [
          { role: "user", content: "SECRET PROMPT" },
          {
            role: "assistant",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: { name: "log_a2ui_event", arguments: "{}" },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-1",
            content:
              'User performed action "reviewRequest" on surface "surface-1" (component: review). Context: {"title":"Login fails","revision":0}',
          },
        ],
      }),
    );

    expect(description.action).toEqual({
      name: "reviewRequest",
      surfaceId: "surface-1",
      sourceComponentId: "review",
      context: { title: "Login fails", revision: 0 },
    });
    expect(description.payload).toEqual({
      count: 3,
      roles: ["user", "assistant", "tool"],
    });
    expect(JSON.stringify(description.payload)).not.toContain("Login");
    expect(JSON.stringify(description.payload)).not.toContain("SECRET");
  });

  it("rejects action-shaped content without a log_a2ui_event tool call", () => {
    const description = describeEvent(
      asEvent({
        type: "MESSAGES_SNAPSHOT",
        messages: [
          {
            role: "assistant",
            toolCalls: [
              {
                id: "call-other",
                type: "function",
                function: { name: "build_stage0_fixture", arguments: "{}" },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-other",
            content:
              'User performed action "reviewRequest" on surface "surface-1" (component: review). Context: {"title":"Login fails","revision":0}',
          },
        ],
      }),
    );

    expect(description.action).toBeUndefined();
    expect(JSON.stringify(description.payload)).not.toContain("Login fails");
  });

  it("shows A2UI operation kinds and surface IDs, not components", () => {
    const description = describeEvent(
      asEvent({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-1",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: { surfaceId: "surface-1", catalogId: "catalog" },
            },
            {
              version: "v0.9",
              updateComponents: {
                surfaceId: "surface-1",
                components: [
                  { id: "title", component: "Text", text: "SECRET TITLE" },
                ],
              },
            },
          ],
        },
      }),
    );

    expect(description.family).toBe("a2ui");
    expect(description.payload).toEqual({
      activityType: "a2ui-surface",
      messageId: "a2ui-surface-1",
      operations: ["createSurface", "updateComponents"],
      surfaceIds: ["surface-1"],
    });
    expect(JSON.stringify(description.payload)).not.toContain("SECRET");
  });

  it("captures forwarded action evidence without exposing raw tool content", () => {
    const description = describeEvent(
      asEvent({
        type: "TOOL_CALL_RESULT",
        toolCallId: "call-1",
        content:
          'User performed action "reviewRequest" on surface "surface-1" (component: review). Context: {"title":"Login fails","revision":0}',
      }),
      "log_a2ui_event",
    );

    expect(description.action).toEqual({
      name: "reviewRequest",
      surfaceId: "surface-1",
      sourceComponentId: "review",
      context: { title: "Login fails", revision: 0 },
    });
    expect(description.payload).toEqual({
      toolCallId: "call-1",
      actionName: "reviewRequest",
      surfaceId: "surface-1",
      sourceComponentId: "review",
    });
    expect(description.summary).toContain("forwarded action");
  });

  it("bounds JSON payloads", () => {
    const text = boundJson({ value: "x".repeat(5000) }, 200);
    expect(text.length).toBeLessThanOrEqual(260);
    expect(text).toContain("[truncated]");
  });
});
