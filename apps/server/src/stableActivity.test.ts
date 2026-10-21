import type { BaseEvent } from "@ag-ui/core";
import { firstValueFrom, of, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  createStableA2UIActivityMiddleware,
  stabilizeA2UIActivity,
} from "./stableActivity.js";

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

  it("rewrites live surface IDs to the thread surface", () => {
    const output = stabilizeA2UIActivity(
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-call-unique-6",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "model-generated",
                catalogId: "arb://catalog/request-builder.v1",
              },
            },
            {
              version: "v0.9",
              updateDataModel: {
                surfaceId: "model-generated",
                path: "/meta/revision",
                value: 0,
              },
            },
          ],
        },
      }),
      { threadId: "thread-live", rewriteSurfaceIds: true },
    );

    expect(output.messageId).toBe("a2ui-surface-surface-thread-live");
    const content = (output as { content?: { a2ui_operations?: unknown } }).content;
    const operations = Array.isArray(content?.a2ui_operations)
      ? content.a2ui_operations
      : [];
    for (const operation of operations) {
      if (!operation || typeof operation !== "object") {
        continue;
      }
      const record = operation as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (value && typeof value === "object" && "surfaceId" in value) {
          expect((value as { surfaceId: string }).surfaceId).toBe(
            "surface-thread-live",
          );
        }
      }
    }
  });

  it("drops unvalidated live partial paint but keeps lifecycle and final activities", async () => {
    const events = [
      event({
        type: "TOOL_CALL_START",
        toolCallId: "g1",
        toolCallName: "generate_a2ui",
      }),
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-g1",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "live-draft-surface-thread-live",
                catalogId: "arb://catalog/request-builder.v1",
              },
            },
          ],
        },
      }),
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-g1",
        content: { status: "building" },
      }),
      event({ type: "TOOL_CALL_RESULT", toolCallId: "g1", content: "{}" }),
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-g1",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surface-thread-live",
                catalogId: "arb://catalog/request-builder.v1",
              },
            },
          ],
        },
      }),
      event({ type: "RUN_FINISHED", threadId: "thread-live", runId: "r1" }),
    ];
    const middleware = createStableA2UIActivityMiddleware({ live: true });
    const output = await firstValueFrom(
      middleware(
        { threadId: "thread-live", runId: "r1" } as never,
        { run: () => of(...events) } as never,
      ).pipe(toArray()),
    );

    expect(output.map((entry) => entry.type)).toEqual([
      "TOOL_CALL_START",
      "ACTIVITY_SNAPSHOT",
      "TOOL_CALL_RESULT",
      "ACTIVITY_SNAPSHOT",
      "RUN_FINISHED",
    ]);
    const activity = output.find(
      (entry) =>
        entry.type === "ACTIVITY_SNAPSHOT" &&
        entry.messageId === "a2ui-surface-surface-thread-live",
    );
    expect(activity).toBeDefined();
  });

  it("drops a nested draft-surface activity even after the tool result", async () => {
    const events = [
      event({
        type: "TOOL_CALL_START",
        toolCallId: "g1",
        toolCallName: "generate_a2ui",
      }),
      event({ type: "TOOL_CALL_RESULT", toolCallId: "g1", content: "{}" }),
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "draft-activity",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "live-draft-surface-thread-live",
                catalogId: "arb://catalog/request-builder.v1",
              },
            },
          ],
        },
      }),
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "final-activity",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surface-thread-live",
                catalogId: "arb://catalog/request-builder.v1",
              },
            },
          ],
        },
      }),
    ];
    const middleware = createStableA2UIActivityMiddleware({ live: true });
    const output = await firstValueFrom(
      middleware(
        { threadId: "thread-live" } as never,
        { run: () => of(...events) } as never,
      ).pipe(toArray()),
    );

    const activities = output.filter(
      (entry) =>
        entry.type === "ACTIVITY_SNAPSHOT" &&
        entry.activityType === "a2ui-surface",
    );
    expect(activities).toHaveLength(1);
    expect(activities[0]?.messageId).toBe("a2ui-surface-surface-thread-live");
  });

  it("normalizes AGENT_MODE when no explicit live option is given", async () => {
    const previous = process.env.AGENT_MODE;
    process.env.AGENT_MODE = " Live ";
    try {
      const middleware = createStableA2UIActivityMiddleware();
      const output = await firstValueFrom(
        middleware(
          { threadId: "thread-live" } as never,
          {
            run: () =>
              of(
                event({
                  type: "ACTIVITY_SNAPSHOT",
                  activityType: "a2ui-surface",
                  messageId: "draft-activity",
                  content: {
                    a2ui_operations: [
                      {
                        version: "v0.9",
                        createSurface: {
                          surfaceId: "live-draft-surface-thread-live",
                          catalogId: "arb://catalog/request-builder.v1",
                        },
                      },
                    ],
                  },
                }),
              ),
          } as never,
        ).pipe(toArray()),
      );

      expect(output).toHaveLength(0);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_MODE;
      } else {
        process.env.AGENT_MODE = previous;
      }
    }
  });

  it("fails closed for live operation activities without a thread ID", async () => {
    const middleware = createStableA2UIActivityMiddleware({ live: true });
    const output = await firstValueFrom(
      middleware(
        {} as never,
        {
          run: () =>
            of(
              event({
                type: "ACTIVITY_SNAPSHOT",
                activityType: "a2ui-surface",
                messageId: "no-thread",
                content: {
                  a2ui_operations: [
                    {
                      version: "v0.9",
                      createSurface: {
                        surfaceId: "live-draft-surface-unknown",
                        catalogId: "arb://catalog/request-builder.v1",
                      },
                    },
                  ],
                },
              }),
            ),
        } as never,
      ).pipe(toArray()),
    );

    expect(output).toHaveLength(0);
  });

  it("does not drop partial activities in fixture mode", async () => {
    const events = [
      event({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "partial",
        content: {
          a2ui_operations: [
            {
              version: "v0.9",
              createSurface: {
                surfaceId: "surface-thread-fixture",
                catalogId: "arb://catalog/request-builder.v1",
              },
            },
          ],
        },
      }),
    ];
    const middleware = createStableA2UIActivityMiddleware({ live: false });
    const output = await firstValueFrom(
      middleware(
        { threadId: "thread-fixture" } as never,
        { run: () => of(...events) } as never,
      ).pipe(toArray()),
    );

    expect(output).toHaveLength(1);
    expect(output[0]?.messageId).toBe("a2ui-surface-surface-thread-fixture");
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
