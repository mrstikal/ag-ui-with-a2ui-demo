import { describe, expect, it } from "vitest";
import {
  ALLOWED_COMPONENTS,
  CATALOG_ID,
  inlineCatalogSchema,
  toMiddlewareCatalog,
  toValidationCatalog,
} from "./index.js";

describe("shared catalog contract", () => {
  it("pins one catalog ID and the approved component set", () => {
    expect(inlineCatalogSchema.catalogId).toBe(CATALOG_ID);
    expect(Object.keys(inlineCatalogSchema.components).sort()).toEqual(
      [...ALLOWED_COMPONENTS].sort(),
    );
  });

  it("unwraps components for the runtime middleware gate", () => {
    const catalog = toMiddlewareCatalog(inlineCatalogSchema);

    expect(catalog.catalogId).toBe(CATALOG_ID);
    expect(catalog.components.Text).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["component", "text"]),
      properties: expect.objectContaining({
        component: { const: "Text" },
        text: expect.any(Object),
      }),
    });
    expect(catalog.components.Button).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["component", "child", "action"]),
      properties: expect.objectContaining({
        child: expect.any(Object),
        action: expect.any(Object),
      }),
    });
    expect(catalog.components.Text).not.toHaveProperty("allOf");
  });

  it("extracts required properties for toolkit validation", () => {
    const catalog = toValidationCatalog(inlineCatalogSchema);

    expect(catalog.components.Text?.required).toEqual(
      expect.arrayContaining(["component", "text"]),
    );
    expect(catalog.components.Button?.required).toEqual(
      expect.arrayContaining(["component", "child", "action"]),
    );
    expect(catalog.components.TextField?.required).toEqual(
      expect.arrayContaining(["component", "label"]),
    );
  });
});
