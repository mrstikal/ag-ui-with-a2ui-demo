import catalogSchemaJson from "./catalog-schema.json" with { type: "json" };
import { ALLOWED_COMPONENTS, CATALOG_ID } from "./constants.js";

export { LOG_A2UI_EVENT_TOOL_NAME, parseForwardedActionText } from "./action.js";
export { surfaceIdForThread } from "./ids.js";
export type { ForwardedActionPayload } from "./action.js";

export {
  ACTION_DISCARD_SURFACE,
  ACTION_EVIDENCE_EVENT,
  ACTION_REVIEW_REQUEST,
  ACTION_SUBMIT_DEMO_REQUEST,
  ALLOWED_ACTION_NAMES,
  ALLOWED_COMPONENTS,
  CATALOG_ID,
  DISCARD_BUTTON_ID,
  FIELD_KEY_PATTERN,
  HOST_COMPONENT_IDS,
  HOST_CONTROL_COMPONENT_IDS,
  HOST_STATUS_COMPONENT_ID,
  HOST_VALIDATION_COMPONENT_ID,
  LIMITS,
  REQUEST_STATUSES,
  REQUIRED_FIELD_PATHS,
  REVIEW_BUTTON_ID,
  SIMULATION_NOTICE,
  SUBMIT_BUTTON_ID,
} from "./constants.js";
export type {
  AllowedActionName,
  AllowedComponent,
  RequestStatus,
} from "./constants.js";

export {
  componentBindingPaths,
  componentTypes,
  createSurfaceOperation,
  deleteSurfaceOperation,
  deriveFieldRules,
  deriveFieldSpecs,
  extractOperations,
  initializeDataModel,
  operationKind,
  operationsEnvelope,
  operationSurfaceId,
  updateComponentsOperation,
  updateDataModelOperation,
  validateComponentTree,
  validateDataModel,
  validateOperationEnvelope,
  validateScopedDataPath,
} from "./operations.js";
export type {
  ComponentTreeValidation,
  FieldOption,
  FieldRule,
  FieldSpec,
  OperationEnvelopeValidation,
  SurfaceValidationError,
} from "./operations.js";

export interface InlineCatalogSchema {
  catalogId: string;
  components: Record<string, Record<string, unknown>>;
}

export interface ValidationCatalog {
  components: Record<
    string,
    { required: string[]; properties: Record<string, unknown> }
  >;
}

export interface MiddlewareCatalog {
  catalogId: string;
  components: Record<string, Record<string, unknown>>;
}

export const inlineCatalogSchema =
  catalogSchemaJson as unknown as InlineCatalogSchema;

if (inlineCatalogSchema.catalogId !== CATALOG_ID) {
  throw new Error(
    `Catalog schema ID ${inlineCatalogSchema.catalogId} does not match ${CATALOG_ID}`,
  );
}

const declaredComponents = Object.keys(inlineCatalogSchema.components).sort();
const expectedComponents = [...ALLOWED_COMPONENTS].sort();
if (declaredComponents.join(",") !== expectedComponents.join(",")) {
  throw new Error(
    `Catalog schema components (${declaredComponents.join(", ")}) do not match the approved set (${expectedComponents.join(", ")})`,
  );
}

export function toMiddlewareCatalog(
  schema: InlineCatalogSchema,
): MiddlewareCatalog {
  const components: MiddlewareCatalog["components"] = {};

  for (const [name, component] of Object.entries(schema.components)) {
    const allOf = Array.isArray(component.allOf) ? component.allOf : [];
    const specific =
      allOf[1] && typeof allOf[1] === "object"
        ? (allOf[1] as Record<string, unknown>)
        : component;

    components[name] = {
      type: "object",
      properties:
        specific.properties &&
        typeof specific.properties === "object" &&
        !Array.isArray(specific.properties)
          ? (specific.properties as Record<string, unknown>)
          : {},
      required: Array.isArray(specific.required)
        ? specific.required.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
      additionalProperties: false,
    };
  }

  return { catalogId: schema.catalogId, components };
}

export function toValidationCatalog(
  schema: InlineCatalogSchema,
): ValidationCatalog {
  const components: ValidationCatalog["components"] = {};

  for (const [name, component] of Object.entries(schema.components)) {
    const allOf = Array.isArray(component.allOf) ? component.allOf : [];
    const specific = allOf[1];
    const specificObject =
      specific && typeof specific === "object"
        ? (specific as {
            required?: unknown;
            properties?: unknown;
          })
        : undefined;
    const required = Array.isArray(specificObject?.required)
      ? specificObject.required.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    const properties =
      specificObject?.properties &&
      typeof specificObject.properties === "object" &&
      !Array.isArray(specificObject.properties)
        ? (specificObject.properties as Record<string, unknown>)
        : {};

    components[name] = { required, properties };
  }

  return { components };
}
