import { describe, expect, it } from "vitest";
import { validateA2UIComponents } from "@ag-ui/a2ui-toolkit";
import { CATALOG_ID, inlineCatalogSchema, toValidationCatalog } from "@arb/shared";
import { buildFixtureSurface } from "./fixture.js";

describe("Stage 0 fixture", () => {
  it("builds a catalog-validated operations envelope", () => {
    const fixture = buildFixtureSurface("surface-test");
    const parsed = JSON.parse(fixture.envelope) as {
      a2ui_operations: Array<Record<string, unknown>>;
    };

    expect(parsed.a2ui_operations).toHaveLength(3);
    expect(parsed.a2ui_operations[0]).toEqual({
      version: "v0.9",
      createSurface: {
        surfaceId: "surface-test",
        catalogId: CATALOG_ID,
      },
    });
    expect(parsed.a2ui_operations[1]).toHaveProperty("updateComponents");
    expect(parsed.a2ui_operations[2]).toHaveProperty("updateDataModel");
  });

  it("rejects a component that is not in the host catalog", () => {
    const fixture = buildFixtureSurface("surface-test");
    const components = [
      ...fixture.components,
      { id: "bad", component: "Image", src: "https://example.test/x.png" },
    ];

    const result = validateA2UIComponents({
      components,
      data: fixture.data,
      catalog: toValidationCatalog(inlineCatalogSchema),
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.message).join(" ")).toContain(
      "Image",
    );
  });
});
