import type { BaseEvent } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import {
  EMPTY_SURFACE,
  reduceSurfaceActivity,
  type SurfaceSummary,
} from "./surface.js";

function asEvent(value: Record<string, unknown>): BaseEvent {
  return value as unknown as BaseEvent;
}

function components(): Array<Record<string, unknown>> {
  return [
    {
      id: "root",
      component: "Column",
      children: ["title", "details", "review_label", "review"],
    },
    {
      id: "title",
      component: "TextField",
      label: "Title",
      value: { path: "/draft/title" },
    },
    {
      id: "details",
      component: "TextField",
      label: "Details",
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

function activity(
  operations: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): BaseEvent {
  return asEvent({
    type: "ACTIVITY_SNAPSHOT",
    activityType: "a2ui-surface",
    messageId: "a2ui-surface-surface-1",
    content: { a2ui_operations: operations, ...extra },
  });
}

function created(): SurfaceSummary {
  return reduceSurfaceActivity(
    EMPTY_SURFACE,
    activity(
      [
        {
          version: "v0.9",
          createSurface: {
            surfaceId: "surface-1",
            catalogId: "arb://catalog/request-builder.v1",
          },
        },
        {
          version: "v0.9",
          updateComponents: { surfaceId: "surface-1", components: components() },
        },
        {
          version: "v0.9",
          updateDataModel: {
            surfaceId: "surface-1",
            path: "/",
            value: {
              draft: { title: "", details: "" },
              meta: { revision: 0, status: "editing" },
            },
          },
        },
      ],
      { status: "painted" },
    ),
    "2026-10-20T18:00:00.000Z",
  );
}

describe("A2UI surface inspector", () => {
  it("summarizes catalog ID, surface ID, components, bindings, and lifecycle", () => {
    const surface = created();

    expect(surface.catalogId).toBe("arb://catalog/request-builder.v1");
    expect(surface.surfaceId).toBe("surface-1");
    expect(surface.activityMessageId).toBe("a2ui-surface-surface-1");
    expect(surface.lifecycle).toBe("painted");
    expect(surface.operations).toEqual([
      "createSurface",
      "updateComponents",
      "updateDataModel",
    ]);
    expect(surface.componentTypes).toEqual([
      "Button",
      "Column",
      "Text",
      "TextField",
    ]);
    expect(surface.bindingPaths).toEqual([
      "/draft/details",
      "/draft/title",
      "/meta/revision",
    ]);
    expect(surface.validationErrors).toEqual([]);
    expect(surface.updatedAt).toBe("2026-10-20T18:00:00.000Z");
  });

  it("applies update-only snapshots to the existing surface", () => {
    const surface = reduceSurfaceActivity(
      created(),
      activity([
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: "surface-1",
            components: [
              {
                id: "root",
                component: "Column",
                children: ["title", "details", "review_label", "review", "host_validation"],
              },
              {
                id: "title",
                component: "TextField",
                label: "Bug summary",
                value: { path: "/draft/title" },
              },
              {
                id: "details",
                component: "TextField",
                label: "Details",
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
              {
                id: "host_validation",
                component: "Text",
                text: { path: "/errors/summary" },
              },
            ],
          },
        },
        {
          version: "v0.9",
          updateDataModel: {
            surfaceId: "surface-1",
            path: "/meta/revision",
            value: 1,
          },
        },
      ]),
    );

    expect(surface.catalogId).toBe("arb://catalog/request-builder.v1");
    expect(surface.surfaceId).toBe("surface-1");
    expect(surface.operations).toEqual(["updateComponents", "updateDataModel"]);
    expect(surface.lifecycle).toBe("painted");
    expect(surface.components.length).toBeGreaterThan(0);
    expect(surface.validationErrors).toEqual([]);
  });

  it("removes the surface after a validated deleteSurface activity", () => {
    const surface = reduceSurfaceActivity(
      created(),
      activity([
        {
          version: "v0.9",
          deleteSurface: { surfaceId: "surface-1" },
        },
      ]),
    );

    expect(surface.lifecycle).toBe("deleted");
    expect(surface.surfaceId).toBe("surface-1");
    expect(surface.components).toEqual([]);
    expect(surface.componentTypes).toEqual([]);
    expect(surface.bindingPaths).toEqual([]);
    expect(surface.operations).toEqual(["deleteSurface"]);
  });

  it("shows lifecycle errors and validation errors", () => {
    const failed = reduceSurfaceActivity(
      EMPTY_SURFACE,
      asEvent({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-surface-1",
        content: {
          status: "failed",
          error: "generation failed after retries",
          errors: [{ message: "component Image is not approved" }],
        },
      }),
    );

    expect(failed.lifecycle).toBe("failed");
    expect(failed.validationErrors).toEqual([
      "generation failed after retries",
      "component Image is not approved",
    ]);

    const unknown = reduceSurfaceActivity(
      created(),
      activity([
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: "surface-1",
            components: [
              ...components(),
              {
                id: "injected",
                component: "Image",
                url: "https://example.test/injected.png",
              },
            ],
          },
        },
      ]),
    );

    expect(unknown.validationErrors.join(" ")).toContain("Image");
  });

  it("keeps the stable activity ID when a lifecycle-only snapshot arrives", () => {
    const failed = reduceSurfaceActivity(
      created(),
      asEvent({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "a2ui-surface",
        messageId: "a2ui-surface-call-lifecycle",
        content: { status: "failed", error: "retry exhausted" },
      }),
    );

    expect(failed.lifecycle).toBe("failed");
    expect(failed.activityMessageId).toBe("a2ui-surface-surface-1");
    expect(failed.validationErrors).toEqual(["retry exhausted"]);
  });

  it("ignores non-A2UI activities", () => {
    const previous = created();
    const surface = reduceSurfaceActivity(
      previous,
      asEvent({
        type: "ACTIVITY_SNAPSHOT",
        activityType: "other",
        content: {},
      }),
    );

    expect(surface).toBe(previous);
  });
});
