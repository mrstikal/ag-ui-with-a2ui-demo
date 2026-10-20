import type { BaseEvent } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { stabilizeA2UIActivity } from "./stableActivity.js";

function event(value: Record<string, unknown>): BaseEvent {
  return value as unknown as BaseEvent;
}

describe("stable A2UI activity IDs", () => {
  it("rewrites createSurface activities to a surface-stable ID", () => {
    const input = event({
      type: "ACTIVITY_SNAPSHOT",
      activityType: "a2ui-surface",
      messageId: "a2ui-surface-call-unique-1",
      content: {
        a2ui_operations: [
          {
            version: "v0.9",
            createSurface: {
              surfaceId: "surface-thread-a",
              catalogId: "arb://catalog/request-builder.v1",
            },
          },
        ],
      },
    });

    const output = stabilizeA2UIActivity(input);

    expect(output).not.toBe(input);
    expect(output).toMatchObject({
      type: "ACTIVITY_SNAPSHOT",
      messageId: "a2ui-surface-surface-thread-a",
    });
  });

  it("keeps the same ID for update and delete snapshots on the same surface", () => {
    const update = stabilizeA2UIActivity(
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-call-unique-2",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              updateDataModel: {
                surfaceId: "surface-thread-a",
                path: "/meta/revision",
                value: 1,
              },
            },
          ],
        },
      }),
    );
    const deleted = stabilizeA2UIActivity(
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-call-unique-3",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              deleteSurface: { surfaceId: "surface-thread-a" },
            },
          ],
        },
      }),
    );

    expect(update.messageId).toBe("a2ui-surface-surface-thread-a");
    expect(deleted.messageId).toBe("a2ui-surface-surface-thread-a");
  });

  it("uses an explicit surfaceId on lifecycle content", () => {
    const output = stabilizeA2UIActivity(
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-call-unique-4",
        content: { status: "failed", surfaceId: "surface-thread-b" },
      }),
    );

    expect(output.messageId).toBe("a2ui-surface-surface-thread-b");
  });

  it("does not rewrite unrelated events or already-stable activities", () => {
    const other = event({ type: "TEXT_MESSAGE_START", messageId: "m1" });
    expect(stabilizeA2UIActivity(other)).toBe(other);

    const stable = event({
      type: "ACTIVITY_SNAPSHOT",
      activityType: "a2ui-surface",
      messageId: "a2ui-surface-surface-thread-a",
      content: {
        a2ui_operations: [
          {
            version: "v0.9",
            deleteSurface: { surfaceId: "surface-thread-a" },
          },
        ],
      },
    });
    expect(stabilizeA2UIActivity(stable)).toBe(stable);

    const lifecycle = event({
      type: "ACTIVITY_SNAPSHOT",
      activityType: "a2ui-surface",
      messageId: "a2ui-surface-call-unique-5",
      content: { status: "building" },
    });
    expect(stabilizeA2UIActivity(lifecycle)).toBe(lifecycle);
  });
});
