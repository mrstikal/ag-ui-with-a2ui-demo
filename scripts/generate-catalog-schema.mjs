import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createCatalog,
  extractCatalogComponentSchemas,
  filterCatalog,
} from "@copilotkit/a2ui-renderer";
import { ALLOWED_COMPONENTS, CATALOG_ID } from "../packages/shared/src/constants.ts";

const full = createCatalog(
  {},
  {},
  { catalogId: CATALOG_ID, includeBasicCatalog: true },
);
const catalog = filterCatalog(full, (name) => ALLOWED_COMPONENTS.includes(name));
const schema = extractCatalogComponentSchemas(catalog);

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/shared/src/catalog-schema.json",
);
writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Wrote ${out} with ${Object.keys(schema.components).length} components`);
