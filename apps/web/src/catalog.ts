import {
  createCatalog,
  extractCatalogComponentSchemas,
  filterCatalog,
} from "@copilotkit/a2ui-renderer";
import {
  ALLOWED_COMPONENTS,
  CATALOG_ID,
  inlineCatalogSchema,
} from "@arb/shared";

const fullCatalog = createCatalog(
  {},
  {},
  { catalogId: CATALOG_ID, includeBasicCatalog: true },
);

export const catalog = filterCatalog(fullCatalog, (name) =>
  (ALLOWED_COMPONENTS as readonly string[]).includes(name),
);

const browserSchema = extractCatalogComponentSchemas(catalog);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

if (
  browserSchema.catalogId !== inlineCatalogSchema.catalogId ||
  canonicalJson(browserSchema.components) !==
    canonicalJson(inlineCatalogSchema.components)
) {
  throw new Error(
    "Browser A2UI catalog does not match the shared server catalog schema.",
  );
}
