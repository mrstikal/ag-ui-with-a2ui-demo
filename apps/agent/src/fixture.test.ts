import { describe, expect, it } from "vitest";
import {
  ACTION_DISCARD_SURFACE,
  ACTION_REVIEW_REQUEST,
  CATALOG_ID,
} from "@arb/shared";
import {
  buildFixtureSurface,
  fixtureForKind,
  planDiscardAction,
  planReviewAction,
  selectFixtureKind,
  validatePublishEnvelope,
} from "./fixture.js";

function operationsOf(envelope: string): Array<Record<string, unknown>> {
  return (JSON.parse(envelope) as { a2ui_operations: Array<Record<string, unknown>> })
    .a2ui_operations;
}

function operationKinds(envelope: string): string[] {
  return operationsOf(envelope).map(
    (operation) =>
      Object.keys(operation).find((key) => key !== "version") ?? "unknown",
  );
}

function reviewAction(
  surface: ReturnType<typeof buildFixtureSurface>,
): Record<string, unknown> {
  const review = surface.components.find((entry) => entry.id === "review");
  if (!review) {
    throw new Error("fixture review button missing");
  }
  return review.action as Record<string, unknown>;
}

describe("Stage 2 fixture pipeline", () => {
  it.each(["bug", "feature", "meeting"] as const)(
    "builds a protocol-valid %s surface through catalog validation",
    (kind) => {
      const surface = buildFixtureSurface("surface-test", kind);
      const operations = operationsOf(surface.envelope);

      expect(operations).toHaveLength(3);
      expect(operations[0]).toEqual({
        version: "v0.9",
        createSurface: {
          surfaceId: "surface-test",
          catalogId: CATALOG_ID,
        },
      });
      expect(operations[1]).toHaveProperty("updateComponents");
      expect(operations[2]).toHaveProperty("updateDataModel");
      expect(Object.keys(surface.fields)).toEqual(
        expect.arrayContaining(["title", "details"]),
      );
      expect(surface.data).toMatchObject({
        draft: expect.objectContaining({ title: "", details: "" }),
        meta: { revision: 0, status: "editing" },
      });
      expect(validatePublishEnvelope(surface.envelope, "surface-test")).toEqual([]);
    },
  );

  it("selects the matching fixed fixture from each example prompt", () => {
    expect(
      selectFixtureKind("I found a login bug. Help me report it."),
    ).toBe("bug");
    expect(
      selectFixtureKind("I want to propose a new dashboard feature."),
    ).toBe("feature");
    expect(
      selectFixtureKind("I need to arrange a project review meeting."),
    ).toBe("meeting");
    expect(selectFixtureKind("Please help me with a custom request.")).toBe(
      "other",
    );
  });

  it("binds every editable field into the review action context", () => {
    const surface = buildFixtureSurface("surface-test", "meeting");
    const event = (
      reviewAction(surface).event as {
        name: string;
        context: Record<string, { path: string }>;
      }
    );

    expect(event.name).toBe(ACTION_REVIEW_REQUEST);
    const fieldPaths = new Set(
      Object.entries(event.context)
        .filter(([key]) => key !== "revision")
        .map(([, value]) => value.path),
    );
    for (const key of Object.keys(surface.fields)) {
      expect(fieldPaths.has(`/draft/${key}`)).toBe(true);
    }
    expect(event.context.revision?.path).toBe("/meta/revision");
    expect(
      Object.keys(event.context).sort(),
    ).toEqual([...Object.keys(surface.fields), "revision"].sort());
  });

  it("updates the same surface with path-scoped host data on valid review", () => {
    const surface = buildFixtureSurface("surface-test", "bug");
    const result = planReviewAction(
      fixtureForKind("bug"),
      "surface-test",
      0,
      {
        title: "Login fails on Safari",
        details: "Open the login page and submit valid credentials.",
        expected: "The dashboard appears.",
        actual: "The page reloads without a session.",
        severity: ["high"],
        revision: 0,
      },
    );

    expect(result.painted).toBe(true);
    expect(result.surfaceId).toBe("surface-test");
    expect(result.status).toBe("review");
    expect(result.revision).toBe(1);
    expect(operationKinds(result.envelope)).toEqual([
      "updateComponents",
      "updateDataModel",
      "updateDataModel",
      "updateDataModel",
    ]);
    const dataUpdates = operationsOf(result.envelope).filter(
      (operation) =>
        operation.updateDataModel !== undefined,
    );
    expect(
      dataUpdates.map(
        (operation) =>
          (operation.updateDataModel as { path: string }).path,
      ),
    ).toEqual(["/errors", "/meta/status", "/meta/revision"]);
    expect(
      dataUpdates.some(
        (operation) =>
          (operation.updateDataModel as { value: unknown }).value === 1,
      ),
    ).toBe(true);
    expect(result.text).toContain("Review saved at revision 1");
    expect(result.text).not.toContain("Demo only");
  });

  it("keeps editing and emits an in-surface validation update for blank required fields", () => {
    const surface = buildFixtureSurface("surface-test", "feature");
    const result = planReviewAction(
      fixtureForKind("feature"),
      "surface-test",
      0,
      {
        title: "",
        details: "",
        outcome: "",
        priority: [],
        revision: 0,
      },
    );

    expect(result.painted).toBe(true);
    expect(result.status).toBe("editing");
    expect(result.revision).toBe(0);
    expect(operationKinds(result.envelope)).toEqual([
      "updateComponents",
      "updateDataModel",
      "updateDataModel",
    ]);
    const updates = operationsOf(result.envelope);
    const componentsOperation = updates.find(
      (operation) => operation.updateComponents !== undefined,
    );
    const components = (
      componentsOperation?.updateComponents as {
        components: Array<Record<string, unknown>>;
      }
    ).components;
    expect(components.some((component) => component.id === "host_validation")).toBe(
      true,
    );
    const errorUpdate = updates.find(
      (operation) =>
        (operation.updateDataModel as { path?: string } | undefined)?.path ===
        "/errors",
    );
    expect(errorUpdate).toBeDefined();
    expect(
      JSON.stringify(
        (errorUpdate?.updateDataModel as { value: unknown }).value,
      ),
    ).toContain("required");
    expect(
      updates.some(
        (operation) =>
          (operation.updateDataModel as { path?: string } | undefined)?.path ===
          "/meta/revision",
      ),
    ).toBe(false);
    expect(result.text).toContain("Validation failed");
    expect(result.text).toContain("same surface");
    expect(surface.fields).toHaveProperty("priority");
    expect(surface.definition.kind).toBe("feature");
  });

  it("rejects unknown context keys without publishing operations", () => {
    const result = planReviewAction(
      fixtureForKind("bug"),
      "surface-test",
      0,
      {
        title: "Login fails",
        details: "Steps",
        expected: "",
        actual: "",
        severity: ["high"],
        revision: 0,
        injected: "not allowed",
      },
    );

    expect(result.painted).toBe(false);
    expect(result.envelope).toBe("");
    expect(result.text).toContain("unexpected context keys");
    expect(result.revision).toBe(0);
  });

  it("emits a validated deleteSurface operation for discard", () => {
    const result = planDiscardAction(
      "surface-test",
      fixtureForKind("meeting"),
      0,
      { revision: 0 },
    );

    expect(result.painted).toBe(true);
    expect(result.surfaceId).toBeNull();
    expect(result.status).toBe("editing");
    expect(operationKinds(result.envelope)).toEqual(["deleteSurface"]);
    expect(validatePublishEnvelope(result.envelope, "surface-test")).toEqual([]);
    expect(result.text).toContain("Discarded");
  });

  it("blocks an invalid generation envelope before it can paint", () => {
    const surface = buildFixtureSurface("surface-test", "bug");
    const envelope = JSON.parse(surface.envelope) as {
      a2ui_operations: Array<Record<string, unknown>>;
    };
    const update = envelope.a2ui_operations[1]?.updateComponents as {
      components: Array<Record<string, unknown>>;
    };
    update.components.push({
      id: "injected",
      component: "Image",
      url: "https://example.test/injected.png",
    });

    const errors = validatePublishEnvelope(
      JSON.stringify(envelope),
      "surface-test",
    );

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("Image");
  });

  it("declares the fixture action names and host-only controls", () => {
    const surface = buildFixtureSurface("surface-test", "bug");
    const ids = new Set(surface.components.map((component) => component.id));

    expect(ids.has("host_validation")).toBe(true);
    expect(ids.has("host_status")).toBe(true);
    expect(ids.has("review")).toBe(true);
    expect(ids.has("discard")).toBe(true);
    expect(ACTION_DISCARD_SURFACE).toBe("discardSurface");
    expect(ACTION_REVIEW_REQUEST).toBe("reviewRequest");
    expect(Object.keys(surface.fields).length).toBeGreaterThan(0);
  });
});
