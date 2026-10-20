import { describe, expect, it } from "vitest";
import { extractCatalogComponentSchemas } from "@copilotkit/a2ui-renderer";
import { inlineCatalogSchema } from "@arb/shared";
import { catalog } from "./catalog.js";

describe("browser catalog", () => {
  it("exposes only the approved components", () => {
    expect(catalog.components.has("Text")).toBe(true);
    expect(catalog.components.has("TextField")).toBe(true);
    expect(catalog.components.has("Button")).toBe(true);
    expect(catalog.components.has("Image")).toBe(false);
    expect(catalog.components.has("Row")).toBe(false);
  });

  it("matches the shared server schema byte for byte", () => {
    expect(extractCatalogComponentSchemas(catalog)).toEqual(inlineCatalogSchema);
  });
});
