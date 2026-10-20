import { A2UIMiddleware } from "@ag-ui/a2ui-middleware";
import type { BaseEvent } from "@ag-ui/core";
import {
  CATALOG_ID,
  createSurfaceOperation,
  inlineCatalogSchema,
  operationsEnvelope,
  toMiddlewareCatalog,
  updateComponentsOperation,
  updateDataModelOperation,
} from "@arb/shared";
import { firstValueFrom, of, toArray } from "rxjs";
import { describe, expect, it } from "vitest";
import { createStableA2UIActivityMiddleware } from "./stableActivity.js";

function event(value: Record<string, unknown>): BaseEvent {
  return value as unknown as BaseEvent;
}

function activityOperations(entry: BaseEvent): Array<Record<string, unknown>> {
  const content = (
    entry as unknown as {
      content?: { a2ui_operations?: unknown };
    }
  ).content;
  return Array.isArray(content?.a2ui_operations)
    ? content.a2ui_operations.filter(
        (operation): operation is Record<string, unknown> =>
          Boolean(operation) &&
          typeof operation === "object" &&
          !Array.isArray(operation),
      )
    : [];
}

function components(): Array<Record<string, unknown>> {
  return [
    {
      id: "root",
      component: "Column",
      children: ["heading", "title", "details", "review_label", "review"],
    },
    { id: "heading", component: "Text", text: "Bug report" },
    {
      id: "title",
      component: "TextField",
      label: "Bug summary",
      value: { path: "/draft/title" },
    },
    {
      id: "details",
      component: "TextField",
      label: "Steps to reproduce",
      value: { path: "/draft/details" },
    },
    { id: "review_label", component: "Text", text: "Review request" },
    {
      id: "review",
      component: "Button",
      child: "review_label",
      action: {
        event: {
          name: "reviewRequest",
          context: {
            title: { path: "/draft/title" },
            details: { path: "/draft/details" },
            revision: { path: "/meta/revision" },
          },
        },
      },
    },
  ];
}

function finalEnvelope(surfaceId: string): string {
  return operationsEnvelope([
    createSurfaceOperation(surfaceId),
    updateComponentsOperation(surfaceId, components()),
    updateDataModelOperation(surfaceId, "/", {
      draft: { title: "", details: "" },
      meta: { revision: 0, status: "editing" },
      errors: { summary: "", fields: {} },
    }),
  ]);
}

function pipelineEvents(finalSurfaceId: string): BaseEvent[] {
  const args = JSON.stringify({
    surfaceId: "live-draft-surface-thread-live",
    components: components(),
    data: { draft: { title: "", details: "" } },
  });
  return [
    event({
      type: "TOOL_CALL_START",
      toolCallId: "g1",
      toolCallName: "generate_a2ui",
    }),
    event({
      type: "TOOL_CALL_START",
      toolCallId: "r1",
      toolCallName: "render_a2ui",
    }),
    event({ type: "TOOL_CALL_ARGS", toolCallId: "r1", delta: args }),
    event({
      type: "TOOL_CALL_RESULT",
      toolCallId: "g1",
      content: finalEnvelope(finalSurfaceId),
    }),
    event({ type: "RUN_FINISHED", threadId: "thread-live", runId: "run-1" }),
  ];
}

function input() {
  return {
    threadId: "thread-live",
    runId: "run-1",
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps: {},
  };
}

function middleware(emptyToolNames: boolean) {
  return new A2UIMiddleware({
    schema: toMiddlewareCatalog(inlineCatalogSchema),
    injectA2UITool: false,
    a2uiToolNames: emptyToolNames ? [] : undefined,
    defaultCatalogId: CATALOG_ID,
  });
}

async function runPipeline(
  emptyToolNames: boolean,
): Promise<BaseEvent[]> {
  const a2ui = middleware(emptyToolNames);
  const stable = createStableA2UIActivityMiddleware({ live: true });
  const base = {
    run: () => of(...pipelineEvents("surface-thread-live")),
  };
  const afterA2UI = a2ui.run(input() as never, base as never);
  return firstValueFrom(
    stable(input() as never, { run: () => afterA2UI } as never).pipe(toArray()),
  );
}

describe("live A2UI middleware pipeline", () => {
  it("paints the host-validated final envelope when progressive tool watching is disabled", async () => {
    const output = await runPipeline(true);
    const activities = output.filter(
      (entry) =>
        entry.type === "ACTIVITY_SNAPSHOT" &&
        entry.activityType === "a2ui-surface" &&
        activityOperations(entry).length > 0,
    );

    expect(activities).toHaveLength(1);
    expect(activities[0]?.messageId).toBe("a2ui-surface-surface-thread-live");
    const operations = activities[0]
      ? activityOperations(activities[0])
      : [];
    expect(operations.some((operation) => operation.createSurface)).toBe(true);
  });

  it("loses the final envelope when the middleware watches the nested render tool", async () => {
    const output = await runPipeline(false);
    const painted = output.filter(
      (entry) =>
        entry.type === "ACTIVITY_SNAPSHOT" &&
        entry.activityType === "a2ui-surface" &&
        activityOperations(entry).some(
          (operation) => operation.createSurface,
        ),
    );

    expect(painted).toHaveLength(0);
  });
});
