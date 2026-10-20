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

if (
  browserSchema.catalogId !== inlineCatalogSchema.catalogId ||
  JSON.stringify(browserSchema.components) !==
    JSON.stringify(inlineCatalogSchema.components)
) {
  throw new Error(
    "Browser A2UI catalog does not match the shared server catalog schema.",
  );
}
