import { AIMessageChunk } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { describe, expect, it } from "vitest";
import {
  CATALOG_ID,
  createSurfaceOperation,
  operationSurfaceId,
  operationsEnvelope,
  updateComponentsOperation,
  updateDataModelOperation,
} from "@arb/shared";
import {
  LIVE_DESIGN_GUIDELINES,
  generationGuidelines,
} from "./catalog.js";
import {
  draftSurfaceIdForThread,
  surfaceIdForThread,
} from "./ids.js";
import { buildFixtureSurface } from "./fixture.js";
import {
  createLiveGenerateTool,
  envelopeFromToolResult,
  liveHostErrorEnvelope,
  normalizeLiveEnvelope,
  parseLiveToolResult,
} from "./live.js";

function liveParts() {
  const surface = buildFixtureSurface("model-generated", "bug");
  const omitted = new Set([
    "discard",
    "discard_label",
    "host_validation",
    "host_status",
  ]);
  const components = surface.components
    .filter(
      (component) =>
        typeof component.id !== "string" || !omitted.has(component.id),
    )
    .map((component) => {
      if (component.id !== "root") {
        return component;
      }
      const children = Array.isArray(component.children)
        ? component.children.filter(
            (child) => typeof child !== "string" || !omitted.has(child),
          )
        : [];
      return { ...component, children };
    });
  const data = {
    draft: { ...(surface.data.draft as Record<string, unknown>) },
    meta: { revision: 0, status: "editing" },
  };
  return { components, data };
}

function liveEnvelope(
  surfaceId = "model-generated",
  catalogId = CATALOG_ID,
): string {
  const { components, data } = liveParts();
  return operationsEnvelope([
    createSurfaceOperation(surfaceId, catalogId),
    updateComponentsOperation(surfaceId, components),
    updateDataModelOperation(surfaceId, "/", data),
  ]);
}

function staticRenderModel(args: Record<string, unknown>) {
  return new FakeStreamingChatModel({
    sleep: 0,
    chunks: [
      new AIMessageChunk({
        content: "",
        tool_calls: [
          {
            id: "call_render",
            name: "render_a2ui",
            args,
            type: "tool_call",
          },
        ],
      }),
    ],
  });
}

function toolConfig() {
  return {
    configurable: { thread_id: "thread-tool" },
    state: {
      messages: [],
      "ag-ui": { context: [] },
    },
  };
}

describe("Stage 3 live generation tool", () => {
  it("normalizes a model tool result before middleware publication", async () => {
    const { components, data } = liveParts();
    const model = staticRenderModel({
      surfaceId: "model-generated",
      components,
      data,
    });
    const generate = createLiveGenerateTool(model);

    const raw = await generate.invoke(
      { intent: "create" },
      toolConfig() as never,
    );
    const envelope = typeof raw === "string" ? raw : JSON.stringify(raw);
    const outcome = parseLiveToolResult(envelope);

    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.surfaceId).toBe("surface-thread-tool");
      expect(outcome.catalogId).toBe(CATALOG_ID);
      expect(outcome.components.length).toBeGreaterThan(0);
      expect(outcome.data).toMatchObject({
        meta: { revision: 0, status: "editing" },
      });
    }
  });

  it("repairs presentation-only props and forces single-select choices", () => {
    const { components, data } = liveParts();
    const title = components.find(
      (component) => component.id === "field_title",
    ) as Record<string, unknown>;
    title.placeholder = "Type a title";
    title.validationRegexp = "(a+)+$";
    const severity = components.find(
      (component) => component.id === "field_severity",
    ) as Record<string, unknown>;
    severity.variant = "multipleSelection";

    const result = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", components),
        updateDataModelOperation("model-generated", "/", data),
      ]),
      "surface-thread-1",
    );

    expect(result.valid).toBe(true);
    const repairedTitle = result.components.find(
      (component) => component.id === "field_title",
    ) as Record<string, unknown>;
    const repairedSeverity = result.components.find(
      (component) => component.id === "field_severity",
    ) as Record<string, unknown>;
    expect(repairedTitle).not.toHaveProperty("placeholder");
    expect(repairedTitle).not.toHaveProperty("validationRegexp");
    expect(repairedSeverity.variant).toBe("mutuallyExclusive");
  });

  it("fills an omitted ChoicePicker variant with mutuallyExclusive", () => {
    const { components, data } = liveParts();
    const severity = components.find(
      (component) => component.id === "field_severity",
    ) as Record<string, unknown>;
    delete severity.variant;

    const result = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", components),
        updateDataModelOperation("model-generated", "/", data),
      ]),
      "surface-thread-1",
    );

    expect(result.valid).toBe(true);
    const repairedSeverity = result.components.find(
      (component) => component.id === "field_severity",
    ) as Record<string, unknown>;
    expect(repairedSeverity.variant).toBe("mutuallyExclusive");
  });

  it("normalizes an array-shaped action context into a keyed object", () => {
    const { components, data } = liveParts();
    const review = components.find(
      (component) => component.id === "review",
    ) as {
      action: { event: { context: Record<string, { path: string }> } };
    };
    const context = review.action.event.context;
    review.action.event.context = Object.entries(context).map(([, value]) => ({
      path: value.path,
    })) as never;

    const result = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", components),
        updateDataModelOperation("model-generated", "/", data),
      ]),
      "surface-thread-1",
    );

    expect(result.valid).toBe(true);
    const normalized = (
      JSON.parse(result.envelope) as {
        a2ui_operations: Array<{
          updateComponents?: { components: Array<Record<string, unknown>> };
        }>;
      }
    ).a2ui_operations.find((operation) => operation.updateComponents)
      ?.updateComponents?.components;
    const button = normalized?.find((component) => component.id === "review") as {
      action: { event: { context: Record<string, unknown> } };
    };
    expect(Object.keys(button.action.event.context).sort()).toEqual(
      ["actual", "details", "expected", "revision", "severity", "title"].sort(),
    );
  });

  it("rejects a second create when graph state already has a surface", async () => {
    const { components, data } = liveParts();
    const model = staticRenderModel({
      surfaceId: "model-generated",
      components,
      data,
    });
    const generate = createLiveGenerateTool(model);
    const config = {
      ...toolConfig(),
      state: { ...toolConfig().state, surfaceId: "surface-thread-tool" },
    };

    const raw = await generate.invoke({ intent: "create" }, config as never);
    const envelope = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(parseLiveToolResult(envelope).kind).toBe("failure");
    expect(envelope).toContain("already exists");
    expect(envelope).not.toContain("a2ui_operations");
  });

  it("rejects update intents without creating another surface", async () => {
    const { components, data } = liveParts();
    const model = staticRenderModel({
      surfaceId: "model-generated",
      components,
      data,
    });
    const generate = createLiveGenerateTool(model);

    const raw = await generate.invoke(
      { intent: "update", target_surface_id: "surface-thread-tool" },
      toolConfig() as never,
    );
    const envelope = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(parseLiveToolResult(envelope).kind).toBe("failure");
    expect(envelope).toContain("apply_request_changes");
    expect(envelope).not.toContain("a2ui_operations");
  });

  it("returns a no-paint host error for invalid model output", async () => {
    const { components, data } = liveParts();
    const title = components.find(
      (component) => component.id === "field_title",
    ) as { value?: unknown };
    delete title.value;
    const model = staticRenderModel({
      surfaceId: "model-generated",
      components,
      data,
    });
    const generate = createLiveGenerateTool(model);

    const raw = await generate.invoke(
      { intent: "create" },
      toolConfig() as never,
    );
    const envelope = typeof raw === "string" ? raw : JSON.stringify(raw);
    const parsed = JSON.parse(envelope) as {
      a2ui_operations?: Array<Record<string, unknown>>;
      host_error: { errors: string[] };
    };

    expect(parsed.a2ui_operations).toBeUndefined();
    expect(parsed.host_error.errors.length).toBeGreaterThan(0);
    expect(parseLiveToolResult(envelope).kind).toBe("failure");
  });
});

describe("Stage 3 live envelope normalization", () => {
  it("extracts the envelope from a ToolMessage-shaped result", () => {
    const envelope = liveEnvelope("model-generated");
    expect(envelopeFromToolResult({ content: envelope, name: "generate_a2ui" })).toBe(
      envelope,
    );
    expect(envelopeFromToolResult(envelope)).toBe(envelope);
  });

  it("derives stable surface IDs from the thread", () => {
    expect(surfaceIdForThread("thread-1")).toBe("surface-thread-1");
    expect(draftSurfaceIdForThread("thread-1")).toBe(
      "live-draft-surface-thread-1",
    );
    expect(() => surfaceIdForThread(undefined)).toThrow(/thread ID/i);
  });

  it("rewrites operations to the thread surface and initializes host metadata", () => {
    const result = normalizeLiveEnvelope(
      liveEnvelope("model-generated"),
      "surface-thread-1",
    );

    expect(result.valid).toBe(true);
    expect(result.surfaceId).toBe("surface-thread-1");
    expect(result.data).toMatchObject({
      meta: { revision: 0, status: "editing" },
      errors: { summary: "", fields: {} },
    });
    const operations = (
      JSON.parse(result.envelope) as {
        a2ui_operations: Array<Record<string, unknown>>;
      }
    ).a2ui_operations;
    expect(operations.map(operationSurfaceId)).toEqual([
      "surface-thread-1",
      "surface-thread-1",
      "surface-thread-1",
    ]);
  });

  it("overwrites model-supplied host metadata", () => {
    const { components, data } = liveParts();
    const tampered = {
      ...data,
      meta: { revision: 9, status: "review" },
      errors: { summary: "forged", fields: { title: "forged" } },
    };
    const result = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", components),
        updateDataModelOperation("model-generated", "/", tampered),
      ]),
      "surface-thread-1",
    );

    expect(result.valid).toBe(true);
    expect(result.data).toMatchObject({
      meta: { revision: 0, status: "editing" },
      errors: { summary: "", fields: {} },
    });
  });

  it("rejects missing canonical bindings, extra actions, and the wrong catalog", () => {
    const missingDetails = liveParts();
    const title = missingDetails.components.find(
      (component) => component.id === "field_title",
    ) as { value?: unknown };
    delete title.value;
    const missing = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", missingDetails.components),
        updateDataModelOperation("model-generated", "/", missingDetails.data),
      ]),
      "surface-thread-1",
    );
    expect(missing.valid).toBe(false);
    expect(missing.errors.join(" ")).toContain("/draft/title");

    const extra = liveParts();
    const review = extra.components.find(
      (component) => component.id === "review",
    ) as { action: { event: { name: string } } };
    review.action.event.name = "submitDemoRequest";
    const extraAction = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", extra.components),
        updateDataModelOperation("model-generated", "/", extra.data),
      ]),
      "surface-thread-1",
    );
    expect(extraAction.valid).toBe(false);

    const wrongCatalog = normalizeLiveEnvelope(
      liveEnvelope("model-generated", "https://example.test/catalog.json"),
      "surface-thread-1",
    );
    expect(wrongCatalog.valid).toBe(false);
    expect(wrongCatalog.errors.join(" ")).toContain("catalogId");
  });

  it("rejects extra or scoped data operations", () => {
    const { components, data } = liveParts();
    const result = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", components),
        updateDataModelOperation("model-generated", "/", data),
        updateDataModelOperation("model-generated", "/meta/revision", 9),
      ]),
      "surface-thread-1",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("must emit exactly");
  });

  it("rejects a missing data model", () => {
    const { components } = liveParts();
    const result = normalizeLiveEnvelope(
      operationsEnvelope([
        createSurfaceOperation("model-generated"),
        updateComponentsOperation("model-generated", components),
      ]),
      "surface-thread-1",
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("data model");
  });

  it("wraps host failures as a clear error without painting", () => {
    const envelope = liveHostErrorEnvelope(["title must be present"]);
    const parsed = JSON.parse(envelope) as {
      a2ui_operations?: Array<Record<string, unknown>>;
      host_error: { errors: string[] };
    };

    expect(parsed.a2ui_operations).toBeUndefined();
    expect(parsed.host_error.errors).toContain("title must be present");

    const outcome = parseLiveToolResult(envelope);
    expect(outcome.kind).toBe("failure");
    if (outcome.kind === "failure") {
      expect(outcome.errors).toContain("title must be present");
    }
  });

  it("parses a successful final envelope", () => {
    const success = normalizeLiveEnvelope(
      liveEnvelope("model-generated"),
      "surface-thread-1",
    );
    const outcome = parseLiveToolResult(success.envelope);

    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.surfaceId).toBe("surface-thread-1");
      expect(outcome.catalogId).toBe(CATALOG_ID);
      expect(outcome.components.length).toBeGreaterThan(0);
    }
  });

  it("keeps the live guidelines on the approved catalog", () => {
    const guidelines = generationGuidelines("live-draft-surface-thread-1");
    expect(guidelines).toContain("Text, Column, Card, TextField, ChoicePicker, Button");
    expect(guidelines).toContain("Never use Title, Metric, List, Row, Divider");
    expect(guidelines).toContain("/draft/title");
    expect(guidelines).toContain("/draft/details");
    expect(guidelines).toContain("reviewRequest");
    expect(guidelines).toContain("live-draft-surface-thread-1");
    expect(LIVE_DESIGN_GUIDELINES).toBe("");
  });
});
