import { describe, expect, it } from "vitest";
import {
  CATALOG_ID,
  componentBindingPaths,
  componentTypes,
  createSurfaceOperation,
  deleteSurfaceOperation,
  initializeDataModel,
  operationsEnvelope,
  updateComponentsOperation,
  updateDataModelOperation,
  validateComponentTree,
  validateDataModel,
  validateOperationEnvelope,
} from "./index.js";

function components(): Array<Record<string, unknown>> {
  return [
    {
      id: "root",
      component: "Column",
      children: [
        "heading",
        "title",
        "details",
        "severity",
        "host_validation",
        "review_label",
        "review",
        "discard_label",
        "discard",
      ],
    },
    { id: "heading", component: "Text", text: "Bug report", variant: "h3" },
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
      variant: "longText",
      value: { path: "/draft/details" },
    },
    {
      id: "severity",
      component: "ChoicePicker",
      label: "Severity",
      variant: "mutuallyExclusive",
      options: [
        { label: "Low", value: "low" },
        { label: "High", value: "high" },
      ],
      value: { path: "/draft/severity" },
    },
    {
      id: "host_validation",
      component: "Text",
      text: { path: "/errors/summary" },
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
            severity: { path: "/draft/severity" },
            revision: { path: "/meta/revision" },
          },
        },
      },
    },
    { id: "discard_label", component: "Text", text: "Discard demo form" },
    {
      id: "discard",
      component: "Button",
      child: "discard_label",
      action: {
        event: {
          name: "discardSurface",
          context: { revision: { path: "/meta/revision" } },
        },
      },
    },
  ];
}

function data(): Record<string, unknown> {
  return {
    draft: { title: "", details: "", severity: [] },
    meta: { revision: 0, status: "editing" },
    errors: { summary: "", fields: {} },
  };
}

function envelope(): string {
  return operationsEnvelope([
    createSurfaceOperation("surface-1"),
    updateComponentsOperation("surface-1", components()),
    updateDataModelOperation("surface-1", "/", data()),
  ]);
}

describe("strict A2UI fixture schemas", () => {
  it("accepts a catalog-valid fixture tree and derives fields", () => {
    const result = validateComponentTree(components());

    expect(result.valid).toBe(true);
    expect(Object.keys(result.fields).sort()).toEqual([
      "details",
      "severity",
      "title",
    ]);
    expect(result.fields.title?.required).toBe(true);
    expect(result.fields.details?.required).toBe(true);
    expect(result.fields.severity?.kind).toBe("choice");
  });

  it("initializes every bound value", () => {
    const fields = validateComponentTree(components()).fields;
    const model = initializeDataModel(fields);

    expect(model).toEqual({
      draft: { title: "", details: "", severity: [] },
      meta: { revision: 0, status: "editing" },
      errors: { summary: "", fields: {} },
    });
    expect(validateDataModel(model, fields)).toEqual([]);
  });

  it("rejects an unknown component before it can be painted", () => {
    const tree = components();
    tree.push({ id: "image", component: "Image", url: "https://x.test/a.png" });

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "unknown_component",
    );
    const envelopeCheck = validateOperationEnvelope(
      operationsEnvelope([
        createSurfaceOperation("surface-1"),
        updateComponentsOperation("surface-1", tree),
      ]),
    );
    expect(envelopeCheck.valid).toBe(false);
  });

  it("rejects a broken child reference", () => {
    const tree = components();
    const root = tree[0] as { children: string[] };
    root.children.push("missing");

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "unresolved_child",
    );
  });

  it("rejects an unknown action name", () => {
    const tree = components();
    const review = tree.find((entry) => entry.id === "review") as {
      action: { event: { name: string } };
    };
    review.action.event.name = "sendRequestNow";

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "unknown_action",
    );
  });

  it("accepts the deterministic submit action with every field and revision", () => {
    const tree = components();
    const review = tree.find((entry) => entry.id === "review") as {
      action: { event: { name: string } };
    };
    review.action.event.name = "submitDemoRequest";

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(true);
  });

  it("rejects a malformed binding path", () => {
    const tree = components();
    const title = tree.find((entry) => entry.id === "title") as {
      value: { path: string };
    };
    title.value.path = "/draft/Bad Key";

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_binding",
    );
  });

  it("requires every field and revision in the review context", () => {
    const tree = components();
    const review = tree.find((entry) => entry.id === "review") as {
      action: { event: { context: Record<string, unknown> } };
    };
    delete review.action.event.context.details;

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_action_context",
    );
  });

  it("validates a full create/update/data envelope", () => {
    const result = validateOperationEnvelope(envelope(), {
      expectedSurfaceId: "surface-1",
    });

    expect(result.valid).toBe(true);
    expect(result.operations.map((operation) => Object.keys(operation).at(-1))).toEqual(
      ["createSurface", "updateComponents", "updateDataModel"],
    );
  });

  it("allows path-scoped host revision updates only with numeric values", () => {
    const valid = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/meta/revision", 1),
      ]),
      { expectedSurfaceId: "surface-1" },
    );
    expect(valid.valid).toBe(true);

    const invalid = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/meta/revision", "1"),
      ]),
      { expectedSurfaceId: "surface-1" },
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((error) => error.code)).toContain(
      "invalid_data_value",
    );
  });

  it("validates deleteSurface and rejects a mismatched catalog", () => {
    const deleted = validateOperationEnvelope(
      operationsEnvelope([deleteSurfaceOperation("surface-1")]),
      { expectedSurfaceId: "surface-1" },
    );
    expect(deleted.valid).toBe(true);

    const wrongCatalog = validateOperationEnvelope(
      operationsEnvelope([
        createSurfaceOperation("surface-1", "https://example.test/catalog.json"),
      ]),
    );
    expect(wrongCatalog.valid).toBe(false);
    expect(wrongCatalog.errors.map((error) => error.code)).toContain(
      "catalog_mismatch",
    );
    expect(CATALOG_ID).toBe("arb://catalog/request-builder.v1");
  });


  it("rejects unsafe markup, duplicate IDs, cycles, and unreachable nodes", () => {
    const unsafe = components();
    const heading = unsafe.find((entry) => entry.id === "heading") as {
      text: string;
    };
    heading.text = "<script>alert(1)</script>";
    expect(validateComponentTree(unsafe).errors.map((error) => error.code)).toContain(
      "unsafe_content",
    );

    const duplicate = components();
    duplicate.push({ id: "title", component: "Text", text: "duplicate" });
    expect(validateComponentTree(duplicate).errors.map((error) => error.code)).toContain(
      "duplicate_id",
    );

    const cycle = components();
    cycle.push({
      id: "loop",
      component: "Column",
      children: ["loop"],
    });
    (cycle[0] as { children: string[] }).children.push("loop");
    expect(validateComponentTree(cycle).errors.map((error) => error.code)).toContain(
      "child_cycle",
    );

    const unreachable = components();
    unreachable.push({ id: "orphan", component: "Text", text: "orphan" });
    expect(
      validateComponentTree(unreachable).errors.map((error) => error.code),
    ).toContain("unreachable_component");
  });

  it("rejects a component that reuses a host-only ID with the wrong type", () => {
    const tree = components().filter((entry) => entry.id !== "review");
    tree.push({ id: "review", component: "Text", text: "not a button" });
    const root = tree[0] as { children: string[] };
    root.children = root.children.filter((id) => id !== "review");

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "host_id_collision",
    );
  });

  it("validates root data even when no component-derived fields are known", () => {
    const unsafe = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/", {
          draft: { title: "<script>alert(1)</script>" },
          meta: { revision: 0, status: "editing" },
        }),
      ]),
    );
    expect(unsafe.valid).toBe(false);
    expect(unsafe.errors.map((error) => error.code)).toContain(
      "invalid_data_value",
    );

    const extra = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/", {
          draft: {},
          meta: { revision: 0, status: "editing" },
          injected: "not allowed",
        }),
      ]),
    );
    expect(extra.valid).toBe(false);
    expect(extra.errors.map((error) => error.code)).toContain(
      "invalid_data_model",
    );
  });

  it("bounds and sanitizes error data", () => {
    const oversized = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/errors", {
          summary: "x".repeat(5_000),
          fields: {},
        }),
      ]),
    );
    expect(oversized.valid).toBe(false);

    const markup = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/errors", {
          summary: "<script>alert(1)</script>",
          fields: {},
        }),
      ]),
    );
    expect(markup.valid).toBe(false);

    const valid = validateOperationEnvelope(
      operationsEnvelope([
        updateDataModelOperation("surface-1", "/errors", {
          summary: "Please fix the title.",
          fields: { title: "Title is required." },
        }),
      ]),
    );
    expect(valid.valid).toBe(true);
  });

  it("rejects operations that follow deleteSurface", () => {
    const result = validateOperationEnvelope(
      operationsEnvelope([
        deleteSurfaceOperation("surface-1"),
        updateComponentsOperation("surface-1", components()),
      ]),
      { expectedSurfaceId: "surface-1" },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_operation_order",
    );
  });

  it("summarizes component types and binding paths without user values", () => {
    expect(componentTypes(components())).toEqual([
      "Button",
      "ChoicePicker",
      "Column",
      "Text",
      "TextField",
    ]);
    expect(componentBindingPaths(components())).toEqual([
      "/draft/details",
      "/draft/severity",
      "/draft/title",
      "/errors/summary",
      "/meta/revision",
    ]);
  });
});

describe("host limits and field rules", () => {
  it("rejects too many components before paint", () => {
    const tree = components();
    const root = tree.find((component) => component.id === "root") as {
      children: string[];
    };
    for (let index = 0; index < 72; index += 1) {
      const id = `extra_${String(index)}`;
      root.children.push(id);
      tree.push({ id, component: "Text", text: `Note ${String(index)}` });
    }

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "too_many_components",
    );
  });

  it("rejects too many fields and still derives required canonical rules", () => {
    const tree = components();
    const root = tree.find((component) => component.id === "root") as {
      children: string[];
    };
    const review = tree.find((component) => component.id === "review") as {
      action: { event: { context: Record<string, unknown> } };
    };
    for (let index = 0; index < 11; index += 1) {
      const key = `extra_${String(index)}`;
      const id = `field_${key}`;
      root.children.push(id);
      tree.push({
        id,
        component: "TextField",
        label: `Extra ${String(index)}`,
        value: { path: `/draft/${key}` },
      });
      review.action.event.context[key] = { path: `/draft/${key}` };
    }

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain(
      "too_many_fields",
    );
    expect(result.fields.title?.required).toBe(true);
    expect(result.fields.details?.required).toBe(true);
    expect(result.fields.extra_0?.required).toBe(false);
  });

  it("rejects too many choice options and oversized labels", () => {
    const tree = components();
    const severity = tree.find((component) => component.id === "severity") as {
      options: Array<{ label: string; value: string }>;
      label: string;
    };
    severity.options = Array.from({ length: 9 }, (_, index) => ({
      label: `Option ${String(index)}`,
      value: `option_${String(index)}`,
    }));
    severity.label = "x".repeat(101);

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain("invalid_options");
    expect(codes).toContain("unsafe_content");
  });

  it("rejects a tree deeper than the layout limit", () => {
    const tree: Array<Record<string, unknown>> = [
      { id: "root", component: "Column", children: ["n1"] },
    ];
    for (let index = 1; index <= 7; index += 1) {
      tree.push({
        id: `n${String(index)}`,
        component: "Column",
        children: index === 7 ? ["leaf"] : [`n${String(index + 1)}`],
      });
    }
    tree.push({ id: "leaf", component: "Text", text: "Leaf" });

    const result = validateComponentTree(tree);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("too_deep");
  });

  it("rejects envelopes above the operation limit", () => {
    const operations = Array.from({ length: 13 }, (_, index) =>
      updateDataModelOperation("surface-1", "/meta/revision", index),
    );
    const result = validateOperationEnvelope(operationsEnvelope(operations), {
      expectedSurfaceId: "surface-1",
    });

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.message.includes("at most 12")),
    ).toBe(true);
  });
});
