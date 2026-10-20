import { GENERATE_A2UI_ARG_DESCRIPTIONS } from "@ag-ui/a2ui-toolkit";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import {
  ACTION_REVIEW_REQUEST,
  CATALOG_ID,
  componentBindingPaths,
  componentTypes,
  extractOperations,
  operationKind,
  operationSurfaceId,
  validateComponentTree,
  validateDataModel,
  validateOperationEnvelope,
  type FieldRule,
} from "@arb/shared";
import { z } from "zod";
import {
  A2UI_TOOL_SURFACE_SENTINEL,
  createGenerateA2UITool,
} from "./catalog.js";
import { draftSurfaceIdForThread, surfaceIdForThread } from "./ids.js";

const MAX_LOGGED_ERRORS = 8;
const MAX_CACHED_TOOLS = 50;

export interface LiveEnvelopeResult {
  valid: boolean;
  envelope: string;
  surfaceId: string;
  fields: Record<string, FieldRule>;
  components: Array<Record<string, unknown>>;
  data: Record<string, unknown> | null;
  errors: string[];
}

export type LiveToolOutcome =
  | {
      kind: "success";
      surfaceId: string;
      catalogId: string;
      operations: Array<Record<string, unknown>>;
      components: Array<Record<string, unknown>>;
      data: Record<string, unknown> | null;
    }
  | { kind: "failure"; message: string; errors: string[] }
  | { kind: "none" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cap(value: string, max = 500): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function safeDetail(value: string): string {
  return cap(
    value
      .replace(/[\u0000-\u001f<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    300,
  );
}

function failure(
  surfaceId: string,
  errors: string[],
): LiveEnvelopeResult {
  return {
    valid: false,
    envelope: "",
    surfaceId,
    fields: {},
    components: [],
    data: null,
    errors,
  };
}

function contextKeyForPath(path: string): string | null {
  const draft = /^\/draft\/([a-z][a-z0-9_]{0,31})$/.exec(path);
  if (draft?.[1]) {
    return draft[1];
  }
  return path === "/meta/revision" ? "revision" : null;
}

const REPAIRABLE_PRESENTATION_PROPS = [
  "placeholder",
  "helperText",
  "description",
  "hint",
] as const;

function repairLiveComponents(
  components: Array<Record<string, unknown>>,
): string[] {
  const repairs = new Set<string>();
  components.forEach((component) => {
    if (
      component.component !== "TextField" &&
      component.component !== "ChoicePicker"
    ) {
      return;
    }
    for (const property of REPAIRABLE_PRESENTATION_PROPS) {
      if (property in component) {
        delete component[property];
        repairs.add(`dropped ${property}`);
      }
    }
    if (
      component.component === "ChoicePicker" &&
      typeof component.variant === "string" &&
      component.variant !== "mutuallyExclusive"
    ) {
      component.variant = "mutuallyExclusive";
      repairs.add("forced single-select ChoicePicker");
    }
  });
  return [...repairs];
}

function normalizeActionContexts(
  components: Array<Record<string, unknown>>,
  errors: string[],
): void {
  components.forEach((component) => {
    if (component.component !== "Button") {
      return;
    }
    const action = component.action;
    const event = isRecord(action) && isRecord(action.event) ? action.event : undefined;
    if (!event || !Array.isArray(event.context)) {
      return;
    }
    const normalized: Record<string, unknown> = {};
    event.context.forEach((entry, index) => {
      if (typeof entry === "string") {
        const key = contextKeyForPath(entry);
        if (!key) {
          errors.push(`Action context[${String(index)}] path is not approved.`);
          return;
        }
        normalized[key] = { path: entry };
        return;
      }
      if (!isRecord(entry)) {
        errors.push(`Action context[${String(index)}] must be an object or path string.`);
        return;
      }
      const path = entry.path;
      if (typeof path === "string") {
        const key =
          typeof entry.key === "string" ? entry.key : contextKeyForPath(path);
        if (!key) {
          errors.push(`Action context[${String(index)}] path is not approved.`);
          return;
        }
        normalized[key] = { path };
        return;
      }
      if (typeof entry.key === "string" && "value" in entry) {
        normalized[entry.key] = entry.value;
        return;
      }
      errors.push(`Action context[${String(index)}] must be a {path} object.`);
    });
    event.context = normalized;
  });
}

function normalizeOperations(
  operations: Array<Record<string, unknown>>,
  surfaceId: string,
): void {
  for (const operation of operations) {
    const kind = operationKind(operation);
    const body = operation[kind];
    if (isRecord(body) && "surfaceId" in body) {
      body.surfaceId = surfaceId;
    }
  }
}

export function normalizeLiveEnvelope(
  envelope: string,
  surfaceId: string,
): LiveEnvelopeResult {
  const parsed = parseJson(envelope);
  if (!parsed) {
    return failure(surfaceId, ["The generation tool returned non-JSON output."]);
  }
  if (parsed.error !== undefined || parsed.code !== undefined) {
    return failure(surfaceId, [
      typeof parsed.error === "string"
        ? parsed.error
        : `Generation failed with code ${String(parsed.code)}`,
    ]);
  }
  const operations = extractOperations(parsed);
  if (operations.length === 0) {
    return failure(surfaceId, ["The generation tool returned no A2UI operations."]);
  }
  const errors: string[] = [];
  const kinds = operations.map(operationKind);
  const expectedKinds = [
    "createSurface",
    "updateComponents",
    "updateDataModel",
  ];
  if (kinds.join(",") !== expectedKinds.join(",")) {
    errors.push(
      `Live generation must emit exactly ${expectedKinds.join(", ")} in that order.`,
    );
  }
  const originalSurfaces = new Set(
    operations
      .map(operationSurfaceId)
      .filter((value): value is string => Boolean(value)),
  );
  if (originalSurfaces.size !== 1) {
    errors.push("Live generation must target exactly one original surface.");
  }
  normalizeOperations(operations, surfaceId);
  const create = operations.find((operation) => operation.createSurface);
  const update = operations.find((operation) => operation.updateComponents);
  const dataOperation = operations.find(
    (operation) =>
      isRecord(operation.updateDataModel) &&
      operation.updateDataModel.path === "/",
  );
  if (!create) {
    errors.push("Live generation must create exactly one surface.");
  }
  if (!update) {
    errors.push("Live generation must emit updateComponents.");
  }
  if (!dataOperation) {
    errors.push("Live generation must initialize the surface data model.");
  }
  const createBody = create?.createSurface;
  if (isRecord(createBody) && createBody.catalogId !== CATALOG_ID) {
    errors.push(`createSurface catalogId must be ${CATALOG_ID}.`);
  }
  const rawComponents = update?.updateComponents;
  const rawComponentList =
    isRecord(rawComponents) && Array.isArray(rawComponents.components)
      ? rawComponents.components
      : [];
  if (rawComponentList.some((component) => !isRecord(component))) {
    errors.push("Every component must be an object.");
  }
  const components = rawComponentList.filter(isRecord);
  if (components.length === 0) {
    errors.push("updateComponents must contain a non-empty component array.");
  }
  const repairs = repairLiveComponents(components);
  if (repairs.length > 0) {
    console.info(`[a2ui] live component repairs: ${repairs.join(", ")}`);
  }
  normalizeActionContexts(components, errors);
  const tree = validateComponentTree(components);
  for (const error of tree.errors) {
    errors.push(`${error.path}: ${error.message}`);
  }

  const buttons = components.filter((component) => component.component === "Button");
  const actionNames = buttons.map((component) => {
    const action = component.action;
    const event = isRecord(action) && isRecord(action.event) ? action.event : undefined;
    return typeof event?.name === "string" ? event.name : "unknown";
  });
  const reviewCount = actionNames.filter(
    (name) => name === ACTION_REVIEW_REQUEST,
  ).length;
  if (reviewCount !== 1) {
    errors.push("Live generation must include exactly one reviewRequest button.");
  }
  for (const name of actionNames) {
    if (name !== ACTION_REVIEW_REQUEST) {
      errors.push(`Live generation may not use the "${name}" action.`);
    }
  }

  const dataBody = dataOperation?.updateDataModel;
  let data =
    isRecord(dataBody) && isRecord(dataBody.value)
      ? (dataBody.value as Record<string, unknown>)
      : null;
  if (!data) {
    errors.push("The root data model must be an object.");
  } else {
    const draft = data.draft;
    if (!isRecord(draft)) {
      errors.push("The generated data model must contain a draft object.");
    } else {
      for (const key of Object.keys(tree.fields)) {
        if (!(key in draft)) {
          errors.push(`data.draft.${key} must be initialized.`);
        }
      }
    }
    data = {
      ...data,
      meta: { revision: 0, status: "editing" },
      errors: { summary: "", fields: {} },
    };
    if (isRecord(dataBody)) {
      dataBody.value = data;
    }
    for (const error of validateDataModel(data, tree.fields)) {
      errors.push(`${error.path}: ${error.message}`);
    }
  }

  const normalizedEnvelope = JSON.stringify({ a2ui_operations: operations });
  const envelopeValidation = validateOperationEnvelope(normalizedEnvelope, {
    expectedSurfaceId: surfaceId,
    fields: tree.fields,
  });
  for (const error of envelopeValidation.errors) {
    // Host data validation reports the same draft errors as validateDataModel.
    const message = `${error.path}: ${error.message}`;
    if (!errors.includes(message)) {
      errors.push(message);
    }
  }

  return {
    valid: errors.length === 0,
    envelope: errors.length === 0 ? normalizedEnvelope : "",
    surfaceId,
    fields: tree.fields,
    components,
    data,
    errors,
  };
}

export function liveFailureEnvelope(message: string): string {
  return JSON.stringify({ error: message });
}

export function liveHostErrorEnvelope(
  _surfaceId: string,
  errors: string[],
): string {
  return JSON.stringify({
    host_error: {
      code: "host_validation_failed",
      errors: errors
        .slice(0, MAX_LOGGED_ERRORS)
        .map((error) => safeDetail(error)),
    },
  });
}

export function envelopeFromToolResult(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (isRecord(raw) && typeof raw.content === "string") {
    return raw.content;
  }
  return JSON.stringify(raw);
}

export function parseLiveToolResult(content: string): LiveToolOutcome {
  const parsed = parseJson(content);
  if (!parsed) {
    return {
      kind: "failure",
      message: safeDetail(
        content || "The generation tool returned an empty result.",
      ),
      errors: [],
    };
  }
  const hostError = parsed.host_error;
  if (isRecord(hostError)) {
    const errors = Array.isArray(hostError.errors)
      ? hostError.errors
          .filter((error): error is string => typeof error === "string")
          .slice(0, MAX_LOGGED_ERRORS)
      : [];
    return {
      kind: "failure",
      message: cap(
        typeof hostError.error === "string"
          ? hostError.error
          : "The generated form failed host validation.",
      ),
      errors,
    };
  }
  if (parsed.error !== undefined || parsed.code !== undefined) {
    return {
      kind: "failure",
      message: safeDetail(
        typeof parsed.error === "string"
          ? parsed.error
          : `Generation failed with code ${String(parsed.code)}`,
      ),
      errors: [],
    };
  }
  const operations = extractOperations(parsed);
  if (operations.length === 0) {
    return {
      kind: "failure",
      message: "The generation tool returned no A2UI operations.",
      errors: [],
    };
  }
  const create = operations.find((operation) => operation.createSurface);
  const update = operations.find((operation) => operation.updateComponents);
  if (!create || !update) {
    return {
      kind: "failure",
      message: "The generation result is missing createSurface or updateComponents.",
      errors: [],
    };
  }
  const surfaceId = operationSurfaceId(create);
  const createBody = create.createSurface;
  const catalogId =
    isRecord(createBody) && typeof createBody.catalogId === "string"
      ? createBody.catalogId
      : "";
  if (!surfaceId) {
    return {
      kind: "failure",
      message: "The generation result has no surface ID.",
      errors: [],
    };
  }
  const components =
    isRecord(update.updateComponents) &&
    Array.isArray(update.updateComponents.components)
      ? update.updateComponents.components.filter(isRecord)
      : [];
  const dataOperation = operations.find(
    (operation) =>
      isRecord(operation.updateDataModel) &&
      operation.updateDataModel.path === "/",
  );
  const dataBody = dataOperation?.updateDataModel;
  const data =
    isRecord(dataBody) && isRecord(dataBody.value) ? dataBody.value : null;
  return {
    kind: "success",
    surfaceId,
    catalogId,
    operations,
    components,
    data,
  };
}

function isSdkErrorEnvelope(envelope: string): boolean {
  const parsed = parseJson(envelope);
  return Boolean(
    parsed &&
      (parsed.error !== undefined || parsed.code !== undefined) &&
      !Array.isArray(parsed.a2ui_operations),
  );
}

function readThreadId(config: unknown): string | undefined {
  if (!isRecord(config)) {
    return undefined;
  }
  const configurable = isRecord(config.configurable)
    ? config.configurable
    : undefined;
  if (typeof configurable?.thread_id === "string") {
    return configurable.thread_id;
  }
  const metadata = isRecord(config.metadata) ? config.metadata : undefined;
  return typeof metadata?.thread_id === "string" ? metadata.thread_id : undefined;
}

function componentActionNames(
  components: Array<Record<string, unknown>>,
): string[] {
  return components.flatMap((component) => {
    if (component.component !== "Button") {
      return [];
    }
    const action = component.action;
    const event = isRecord(action) && isRecord(action.event) ? action.event : undefined;
    return typeof event?.name === "string" ? [event.name] : [];
  });
}

export function createLiveGenerateTool(model: BaseChatModel) {
  const template = createGenerateA2UITool(model, A2UI_TOOL_SURFACE_SENTINEL);
  const innerTools = new Map<string, ReturnType<typeof createGenerateA2UITool>>();

  function innerToolFor(surfaceId: string) {
    const cached = innerTools.get(surfaceId);
    if (cached) {
      return cached;
    }
    if (innerTools.size >= MAX_CACHED_TOOLS) {
      const oldest = innerTools.keys().next().value;
      if (typeof oldest === "string") {
        innerTools.delete(oldest);
      }
    }
    const created = createGenerateA2UITool(model, surfaceId);
    innerTools.set(surfaceId, created);
    return created;
  }

  return tool(
    async (args, config) => {
      const threadId = readThreadId(config);
      if (!threadId) {
        return liveFailureEnvelope("Live generation requires a thread ID.");
      }
      const surfaceId = surfaceIdForThread(threadId);
      const draftSurfaceId = draftSurfaceIdForThread(threadId);
      const state = isRecord(config) && isRecord(config.state) ? config.state : undefined;
      if (typeof state?.surfaceId === "string" && state.surfaceId.length > 0) {
        return liveFailureEnvelope(
          "A form already exists on this thread; Stage 3 creates one surface per thread.",
        );
      }
      if (args.intent === "update") {
        return liveFailureEnvelope(
          "Stage 3 supports creating one surface per thread; update is Stage 4.",
        );
      }
      let raw: unknown;
      try {
        raw = await innerToolFor(draftSurfaceId).invoke(args, config);
      } catch (error) {
        return liveHostErrorEnvelope(surfaceId, [
          error instanceof Error ? error.message : "The model tool threw an error.",
        ]);
      }
      const envelope = envelopeFromToolResult(raw);
      if (isSdkErrorEnvelope(envelope)) {
        return envelope;
      }
      const normalized = normalizeLiveEnvelope(envelope, surfaceId);
      if (!normalized.valid) {
        console.info(
          `[a2ui] live generation rejected: ${safeDetail(
            normalized.errors.join(" | "),
          )}`,
        );
        return liveHostErrorEnvelope(surfaceId, normalized.errors);
      }
      console.info(
        `[a2ui] live surface=${surfaceId} ` +
          `components=${String(normalized.components.length)}:${componentTypes(
            normalized.components,
          ).join(",")} ` +
          `bindings=${componentBindingPaths(normalized.components).join(",")} ` +
          `actions=${componentActionNames(normalized.components).join(",")}`,
      );
      return normalized.envelope;
    },
    {
      name: template.name,
      description:
        "Create one new A2UI surface for the user's request from the approved catalog. Stage 3 creates exactly one surface per thread; do not use intent='update'.",
      schema: z.object({
        intent: z
          .enum(["create", "update"])
          .optional()
          .describe(GENERATE_A2UI_ARG_DESCRIPTIONS.intent),
        target_surface_id: z
          .string()
          .optional()
          .describe(GENERATE_A2UI_ARG_DESCRIPTIONS.target_surface_id),
        changes: z
          .string()
          .optional()
          .describe(GENERATE_A2UI_ARG_DESCRIPTIONS.changes),
      }),
    },
  );
}
