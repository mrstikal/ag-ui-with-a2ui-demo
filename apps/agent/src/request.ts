import {
  ACTION_REVIEW_REQUEST,
  ACTION_SUBMIT_DEMO_REQUEST,
  FIELD_KEY_PATTERN,
  HOST_CONTROL_COMPONENT_IDS,
  HOST_STATUS_COMPONENT_ID,
  HOST_VALIDATION_COMPONENT_ID,
  LIMITS,
  SIMULATION_NOTICE,
  SUBMIT_BUTTON_ID,
  deriveFieldSpecs,
  operationsEnvelope,
  updateComponentsOperation,
  updateDataModelOperation,
  validateOperationEnvelope,
  type FieldSpec,
  type RequestStatus,
} from "@arb/shared";

export type RequestCategory = "bug" | "feature" | "meeting" | "other";

export interface SurfaceState {
  surfaceId: string;
  status: RequestStatus;
  revision: number;
  category: RequestCategory;
  fields: Record<string, FieldSpec>;
  components: Array<Record<string, unknown>>;
  values: Record<string, string>;
  reviewedValues: Record<string, string> | null;
  reviewedRevision: number | null;
  reviewButtonId: string;
}

export interface RequestActionResult {
  surface: SurfaceState;
  painted: boolean;
  envelope: string;
  text: string;
  summary: string;
}

export interface RequestChange {
  addFields: FieldSpec[];
  setValues: Record<string, string>;
}

export type ChangePlanResult =
  | { ok: true; plan: RequestChange }
  | { ok: false; error: string };

interface DataUpdate {
  path: string;
  value: unknown;
}

const SUBMIT_LABEL_ID = "submit_label";
const HOST_CONTROL_IDS = new Set<string>(HOST_CONTROL_COMPONENT_IDS);
const MAX_ADDED_FIELDS = 4;
const MAX_CHANGED_VALUES = 8;
const FIELD_KEY = new RegExp(FIELD_KEY_PATTERN);
const RESERVED_FIELD_KEYS = new Set([
  "draft",
  "errors",
  "meta",
  "revision",
  "status",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function safeText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function rejected(
  surface: SurfaceState,
  text: string,
  summary: string,
): RequestActionResult {
  return {
    surface,
    painted: false,
    envelope: "",
    text,
    summary: summary.slice(0, 160),
  };
}

function actionContext(fields: Record<string, FieldSpec>): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (const key of Object.keys(fields).sort()) {
    context[key] = { path: `/draft/${key}` };
  }
  context.revision = { path: "/meta/revision" };
  return context;
}

function dataValue(spec: FieldSpec, value: string): unknown {
  return spec.kind === "choice" ? (value === "" ? [] : [value]) : value;
}

function errorsValue(issues: Record<string, string>, summary?: string): Record<string, unknown> {
  return {
    summary: summary ?? validationSummary(issues),
    fields: issues,
  };
}

function validationSummary(issues: Record<string, string>): string {
  const messages = Object.values(issues);
  return messages.length === 0 ? "" : `Please fix: ${messages.join(" ")}`;
}

function statusText(surface: SurfaceState, phase: RequestStatus): string {
  if (phase === "submitted-demo") {
    return SIMULATION_NOTICE;
  }
  if (phase === "review") {
    return `Reviewed at revision ${String(surface.revision)}. Submit the demo request or keep editing.`;
  }
  return "Editing - this demo request has not been reviewed or sent.";
}

function findButton(
  components: Array<Record<string, unknown>>,
  actionName: string,
): Record<string, unknown> | null {
  return (
    components.find((component) => {
      if (component.component !== "Button" || !isRecord(component.action)) {
        return false;
      }
      const event = component.action.event;
      return isRecord(event) && event.name === actionName;
    }) ?? null
  );
}

function findReviewButton(
  components: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const button = findButton(components, ACTION_REVIEW_REQUEST);
  if (!button || typeof button.id !== "string") {
    throw new Error("The request surface has no reviewRequest button.");
  }
  return button;
}

function rootColumn(
  components: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const root = components.find((component) => component.id === "root");
  if (!root || root.component !== "Column") {
    throw new Error("The request surface root must be a Column.");
  }
  return root;
}

function removeChildReferences(
  components: Array<Record<string, unknown>>,
  removed: Set<string>,
): void {
  for (const component of components) {
    if (Array.isArray(component.children)) {
      component.children = component.children.filter(
        (child) => typeof child !== "string" || !removed.has(child),
      );
    }
  }
}

function rebuiltComponents(
  surface: SurfaceState,
  phase: RequestStatus,
): Array<Record<string, unknown>> {
  const removed = new Set<string>(HOST_CONTROL_IDS);
  if (phase === "submitted-demo") {
    removed.add(surface.reviewButtonId);
    const review = surface.components.find(
      (component) => component.id === surface.reviewButtonId,
    );
    if (review && typeof review.child === "string") {
      removed.add(review.child);
    }
  }

  const components = clone(surface.components).filter(
    (component) =>
      typeof component.id !== "string" || !removed.has(component.id),
  );
  removeChildReferences(components, removed);

  if (phase !== "submitted-demo") {
    const review = components.find(
      (component) => component.id === surface.reviewButtonId,
    );
    if (!review) {
      throw new Error("The request surface lost its reviewRequest button.");
    }
    review.action = {
      event: {
        name: ACTION_REVIEW_REQUEST,
        context: actionContext(surface.fields),
      },
    };
  }

  components.push(
    {
      id: HOST_VALIDATION_COMPONENT_ID,
      component: "Text",
      text: { path: "/errors/summary" },
      variant: "body",
    },
    {
      id: HOST_STATUS_COMPONENT_ID,
      component: "Text",
      text: statusText(surface, phase),
      variant: "body",
    },
  );

  if (phase === "review") {
    components.push(
      { id: SUBMIT_LABEL_ID, component: "Text", text: "Submit demo request" },
      {
        id: SUBMIT_BUTTON_ID,
        component: "Button",
        child: SUBMIT_LABEL_ID,
        variant: "primary",
        action: {
          event: {
            name: ACTION_SUBMIT_DEMO_REQUEST,
            context: actionContext(surface.fields),
          },
        },
      },
    );
  }

  const root = rootColumn(components);
  const children = Array.isArray(root.children)
    ? root.children.filter(
        (child): child is string =>
          typeof child === "string" && !HOST_CONTROL_IDS.has(child),
      )
    : [];
  children.push(HOST_VALIDATION_COMPONENT_ID, HOST_STATUS_COMPONENT_ID);
  if (phase === "review") {
    children.push(SUBMIT_LABEL_ID, SUBMIT_BUTTON_ID);
  }
  root.children = unique(children);

  return components;
}

function buildEnvelope(
  surface: SurfaceState,
  components: Array<Record<string, unknown>>,
  dataUpdates: DataUpdate[],
  fields: Record<string, FieldSpec> = surface.fields,
): string {
  const envelope = operationsEnvelope([
    updateComponentsOperation(surface.surfaceId, components),
    ...dataUpdates.map((update) =>
      updateDataModelOperation(surface.surfaceId, update.path, update.value),
    ),
  ]);
  const validation = validateOperationEnvelope(envelope, {
    expectedSurfaceId: surface.surfaceId,
    fields,
  });
  if (validation.errors.length > 0) {
    throw new Error(
      `Host action update failed validation: ${validation.errors
        .slice(0, 4)
        .map((error) => `${error.path}: ${error.message}`)
        .join(" | ")}`,
    );
  }
  return envelope;
}

function normalizeValue(
  spec: FieldSpec,
  raw: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (spec.kind === "text") {
    if (typeof raw !== "string") {
      return { ok: false, message: `${spec.label} must be text.` };
    }
    if (raw.length > LIMITS.maxFieldValueLength) {
      return {
        ok: false,
        message: `${spec.label} must be at most ${String(
          LIMITS.maxFieldValueLength,
        )} characters.`,
      };
    }
    if (spec.required && raw.trim() === "") {
      return { ok: false, message: `${spec.label} is required.` };
    }
    return { ok: true, value: raw };
  }

  let candidate: unknown = raw;
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      candidate = "";
    } else if (raw.length === 1) {
      candidate = raw[0];
    } else {
      return { ok: false, message: `${spec.label} must be one approved option.` };
    }
  }
  if (typeof candidate !== "string") {
    return { ok: false, message: `${spec.label} must be one approved option.` };
  }
  if (candidate === "") {
    if (spec.required) {
      return { ok: false, message: `${spec.label} is required.` };
    }
    return { ok: true, value: "" };
  }
  if (!(spec.options ?? []).includes(candidate)) {
    return { ok: false, message: `${spec.label} must be one approved option.` };
  }
  return { ok: true, value: candidate };
}

interface NormalizedAction {
  values: Record<string, string>;
  issues: Record<string, string>;
  unknownKeys: string[];
}

function normalizeAction(
  fields: Record<string, FieldSpec>,
  context: Record<string, unknown>,
): NormalizedAction {
  const allowed = new Set([...Object.keys(fields), "revision"]);
  const unknownKeys = Object.keys(context).filter((key) => !allowed.has(key));
  const values: Record<string, string> = {};
  const issues: Record<string, string> = {};

  for (const key of Object.keys(fields).sort()) {
    const spec = fields[key];
    if (!spec) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(context, key)) {
      issues[key] = `${spec.label} is missing.`;
      continue;
    }
    const normalized = normalizeValue(spec, context[key]);
    if (!normalized.ok) {
      issues[key] = normalized.message;
    } else {
      values[key] = normalized.value;
    }
  }

  return { values, issues, unknownKeys };
}

function readRevision(context: Record<string, unknown>): number | null {
  const revision = context.revision;
  return typeof revision === "number" &&
    Number.isInteger(revision) &&
    revision >= 0
    ? revision
    : null;
}

export function createSurfaceState(args: {
  surfaceId: string;
  category: RequestCategory;
  components: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
}): SurfaceState {
  const fields = deriveFieldSpecs(args.components);
  const review = findReviewButton(args.components);
  const draft = isRecord(args.data.draft) ? args.data.draft : {};
  const values: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    const spec = fields[key];
    if (!spec) {
      continue;
    }
    const normalized = normalizeValue(
      spec,
      Object.hasOwn(draft, key) ? draft[key] : undefined,
    );
    values[key] = normalized.ok ? normalized.value : "";
  }

  return {
    surfaceId: args.surfaceId,
    status: "editing",
    revision: 0,
    category: args.category,
    fields,
    components: clone(args.components),
    values,
    reviewedValues: null,
    reviewedRevision: null,
    reviewButtonId: String(review.id),
  };
}

export function applyReviewAction(
  surface: SurfaceState,
  context: Record<string, unknown>,
): RequestActionResult {
  if (surface.status === "submitted-demo") {
    return rejected(
      surface,
      "Rejected review: the demo request is already complete. Use New request to start another request.",
      "Rejected review: submitted request",
    );
  }

  const revision = readRevision(context);
  if (revision === null) {
    return rejected(
      surface,
      "Rejected review: the resolved context has no valid revision.",
      "Rejected review: malformed revision",
    );
  }
  if (revision !== surface.revision) {
    return rejected(
      surface,
      `Rejected stale review: surface revision ${String(
        revision,
      )} does not match the saved revision ${String(surface.revision)}.`,
      "Rejected review: stale revision",
    );
  }

  const normalized = normalizeAction(surface.fields, context);
  if (normalized.unknownKeys.length > 0) {
    return rejected(
      surface,
      `Rejected review: unexpected context keys ${normalized.unknownKeys.join(
        ", ",
      )}.`,
      "Rejected review: unknown context keys",
    );
  }

  const issueKeys = Object.keys(normalized.issues);
  if (issueKeys.length > 0) {
    const next: SurfaceState = {
      ...surface,
      status: "editing",
      values: { ...surface.values, ...normalized.values },
      reviewedValues: null,
      reviewedRevision: null,
    };
    const components = rebuiltComponents(next, "editing");
    next.components = components;
    const envelope = buildEnvelope(next, components, [
      { path: "/errors", value: errorsValue(normalized.issues) },
      { path: "/meta/status", value: "editing" },
    ]);
    return {
      surface: next,
      painted: true,
      envelope,
      text: `Validation failed. ${validationSummary(
        normalized.issues,
      )} Nothing was reviewed; fix the fields in the same surface and try again.`,
      summary: `Validation failed: ${issueKeys.join(", ")}`.slice(0, 160),
    };
  }

  const nextRevision = surface.revision + 1;
  const next: SurfaceState = {
    ...surface,
    status: "review",
    revision: nextRevision,
    values: normalized.values,
    reviewedValues: { ...normalized.values },
    reviewedRevision: nextRevision,
  };
  const components = rebuiltComponents(next, "review");
  next.components = components;
  const envelope = buildEnvelope(next, components, [
    { path: "/errors", value: { summary: "", fields: {} } },
    { path: "/meta/status", value: "review" },
    { path: "/meta/revision", value: nextRevision },
  ]);
  return {
    surface: next,
    painted: true,
    envelope,
    text: `Review saved at revision ${String(
      nextRevision,
    )}. Submit the demo request when ready, or edit the fields and review again.`,
    summary: `Review saved at revision ${String(nextRevision)}`,
  };
}

export function applySubmitAction(
  surface: SurfaceState,
  context: Record<string, unknown>,
): RequestActionResult {
  if (surface.status !== "review" || surface.reviewedValues === null) {
    return rejected(
      surface,
      "Rejected submit: the request is not in review. Nothing was sent.",
      "Rejected submit: status is not review",
    );
  }

  const revision = readRevision(context);
  if (
    revision === null ||
    revision !== surface.revision ||
    revision !== surface.reviewedRevision
  ) {
    return rejected(
      surface,
      `Rejected stale submit: revision ${String(
        revision ?? "missing",
      )} does not match the reviewed revision ${String(surface.revision)}.`,
      "Rejected submit: stale revision",
    );
  }

  const normalized = normalizeAction(surface.fields, context);
  if (normalized.unknownKeys.length > 0) {
    return rejected(
      surface,
      `Rejected submit: unexpected context keys ${normalized.unknownKeys.join(
        ", ",
      )}.`,
      "Rejected submit: unknown context keys",
    );
  }
  const issueKeys = Object.keys(normalized.issues);
  if (issueKeys.length > 0) {
    return rejected(
      surface,
      `Rejected submit: ${validationSummary(
        normalized.issues,
      )} The request remains in review; nothing was sent.`,
      "Rejected submit: invalid values",
    );
  }

  const changed = Object.keys(surface.fields).filter(
    (key) => normalized.values[key] !== surface.reviewedValues?.[key],
  );
  const nextRevision = surface.revision + 1;

  if (changed.length > 0) {
    const issues = Object.fromEntries(
      changed.map((key) => [
        key,
        `${surface.fields[key]?.label ?? key} changed after review.`,
      ]),
    );
    const next: SurfaceState = {
      ...surface,
      status: "editing",
      revision: nextRevision,
      values: normalized.values,
      reviewedValues: null,
      reviewedRevision: null,
    };
    const components = rebuiltComponents(next, "editing");
    next.components = components;
    const envelope = buildEnvelope(next, components, [
      {
        path: "/errors",
        value: errorsValue(
          issues,
          "Fields changed since review. Review the request again before submitting.",
        ),
      },
      { path: "/meta/status", value: "editing" },
      { path: "/meta/revision", value: nextRevision },
    ]);
    return {
      surface: next,
      painted: true,
      envelope,
      text: `Fields changed since review (${changed
        .map((key) => surface.fields[key]?.label ?? key)
        .join(", ")}). Review the request again before submitting. Nothing was sent.`,
      summary: "Submit blocked: values changed after review",
    };
  }

  const next: SurfaceState = {
    ...surface,
    status: "submitted-demo",
    revision: nextRevision,
    values: normalized.values,
    reviewedValues: null,
    reviewedRevision: null,
  };
  const components = rebuiltComponents(next, "submitted-demo");
  next.components = components;
  const envelope = buildEnvelope(next, components, [
    { path: "/errors", value: { summary: "", fields: {} } },
    { path: "/meta/status", value: "submitted-demo" },
    { path: "/meta/revision", value: nextRevision },
  ]);
  return {
    surface: next,
    painted: true,
    envelope,
    text: `${SIMULATION_NOTICE} Use New request to start another demo request.`,
    summary: "Demo request submitted (simulation only)",
  };
}

function parseOption(value: unknown): { label: string; value: string } | null {
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    typeof value.value !== "string"
  ) {
    return null;
  }
  const label = value.label.trim();
  const optionValue = value.value.trim();
  if (
    label === "" ||
    optionValue === "" ||
    label.length > LIMITS.maxLabelLength ||
    optionValue.length > LIMITS.maxLabelLength
  ) {
    return null;
  }
  return { label, value: optionValue };
}

export function normalizeChangePlan(
  surface: SurfaceState,
  raw: unknown,
): ChangePlanResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "The change intent must be an object." };
  }
  const allowedKeys = new Set(["summary", "add_fields", "set_values"]);
  const unknownKeys = Object.keys(raw).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unexpected change keys: ${unknownKeys.join(", ")}.`,
    };
  }

  const fields = clone(surface.fields);
  const addFields: FieldSpec[] = [];
  const rawAdd = raw.add_fields;
  if (rawAdd !== undefined) {
    if (!Array.isArray(rawAdd) || rawAdd.length > MAX_ADDED_FIELDS) {
      return {
        ok: false,
        error: `add_fields must contain at most ${String(MAX_ADDED_FIELDS)} entries.`,
      };
    }
    for (const [index, entry] of rawAdd.entries()) {
      if (!isRecord(entry)) {
        return { ok: false, error: `add_fields[${String(index)}] must be an object.` };
      }
      const key = entry.key;
      const label = entry.label;
      const kind = entry.kind;
      if (typeof key !== "string" || !FIELD_KEY.test(key)) {
        return {
          ok: false,
          error: `add_fields[${String(index)}].key must be lowercase snake_case.`,
        };
      }
      if (RESERVED_FIELD_KEYS.has(key)) {
        return {
          ok: false,
          error: `Field key '${key}' is reserved by the host.`,
        };
      }
      if (Object.hasOwn(fields, key)) {
        return { ok: false, error: `Field '${key}' already exists.` };
      }
      if (
        typeof label !== "string" ||
        label.trim() === "" ||
        label.length > LIMITS.maxLabelLength
      ) {
        return {
          ok: false,
          error: `add_fields[${String(index)}].label must be 1-${String(
            LIMITS.maxLabelLength,
          )} characters.`,
        };
      }
      if (kind !== "text" && kind !== "choice") {
        return {
          ok: false,
          error: `add_fields[${String(index)}].kind must be text or choice.`,
        };
      }
      if (entry.required !== undefined && typeof entry.required !== "boolean") {
        return {
          ok: false,
          error: `add_fields[${String(index)}].required must be boolean.`,
        };
      }
      if (entry.multiline !== undefined && typeof entry.multiline !== "boolean") {
        return {
          ok: false,
          error: `add_fields[${String(index)}].multiline must be boolean.`,
        };
      }
      if (entry.options !== undefined && !Array.isArray(entry.options)) {
        return {
          ok: false,
          error: `add_fields[${String(index)}].options must be an array.`,
        };
      }
      const options = Array.isArray(entry.options)
        ? entry.options.map(parseOption)
        : [];
      if (options.some((option) => option === null)) {
        return {
          ok: false,
          error: `add_fields[${String(index)}].options are invalid.`,
        };
      }
      const parsedOptions = options.filter(
        (option): option is { label: string; value: string } => option !== null,
      );
      if (kind === "choice") {
        if (parsedOptions.length === 0 || parsedOptions.length > LIMITS.maxOptions) {
          return {
            ok: false,
            error: `Choice field '${key}' requires 1-${String(
              LIMITS.maxOptions,
            )} options.`,
          };
        }
        const values = new Set(parsedOptions.map((option) => option.value));
        if (values.size !== parsedOptions.length) {
          return {
            ok: false,
            error: `Choice field '${key}' has duplicate option values.`,
          };
        }
      } else if (parsedOptions.length > 0) {
        return {
          ok: false,
          error: `Text field '${key}' must not carry options.`,
        };
      }

      const spec: FieldSpec = {
        key,
        label: safeText(label, LIMITS.maxLabelLength),
        kind,
        required: entry.required === true,
        ...(entry.multiline === true && kind === "text"
          ? { multiline: true }
          : {}),
        ...(kind === "choice"
          ? {
              options: parsedOptions.map((option) => option.value),
              optionLabels: parsedOptions,
            }
          : {}),
      };
      fields[key] = spec;
      addFields.push(spec);
    }
  }

  const setValues: Record<string, string> = {};
  const rawSet = raw.set_values;
  if (rawSet !== undefined) {
    if (!isRecord(rawSet)) {
      return { ok: false, error: "set_values must be an object." };
    }
    const entries = Object.entries(rawSet);
    if (entries.length > MAX_CHANGED_VALUES) {
      return {
        ok: false,
        error: `set_values may contain at most ${String(MAX_CHANGED_VALUES)} entries.`,
      };
    }
    for (const [key, value] of entries) {
      const spec = Object.hasOwn(fields, key) ? fields[key] : undefined;
      if (!spec) {
        return { ok: false, error: `Field '${key}' does not exist.` };
      }
      const normalized = normalizeValue(spec, value);
      if (!normalized.ok) {
        return { ok: false, error: normalized.message };
      }
      setValues[key] = normalized.value;
    }
  }

  if (addFields.length === 0 && Object.keys(setValues).length === 0) {
    return { ok: false, error: "The change intent contains no changes." };
  }
  if (Object.keys(fields).length > LIMITS.maxFields) {
    return {
      ok: false,
      error: `At most ${String(LIMITS.maxFields)} fields are allowed.`,
    };
  }
  if (addFields.length + Object.keys(setValues).length > MAX_CHANGED_VALUES) {
    return {
      ok: false,
      error: `At most ${String(MAX_CHANGED_VALUES)} field changes are allowed.`,
    };
  }

  return {
    ok: true,
    plan: { addFields, setValues },
  };
}

function allocateFieldComponentId(
  key: string,
  used: Set<string>,
): string {
  const base = `field_${key}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}_${String(index)}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  throw new Error(`No free component id for field '${key}'.`);
}

function fieldComponent(
  spec: FieldSpec,
  id: string,
): Record<string, unknown> {
  if (spec.kind === "choice") {
    return {
      id,
      component: "ChoicePicker",
      label: spec.label,
      variant: "mutuallyExclusive",
      options: (spec.optionLabels ?? []).map((option) => ({
        label: option.label,
        value: option.value,
      })),
      value: { path: `/draft/${spec.key}` },
    };
  }
  return {
    id,
    component: "TextField",
    label: spec.label,
    ...(spec.multiline ? { variant: "longText" } : {}),
    value: { path: `/draft/${spec.key}` },
  };
}

export function applyChangePlan(
  surface: SurfaceState,
  plan: RequestChange,
): RequestActionResult {
  if (surface.status === "submitted-demo") {
    return rejected(
      surface,
      "Rejected update: the demo request is already complete. Use New request.",
      "Rejected update: submitted request",
    );
  }

  const components = clone(surface.components);
  const fields = clone(surface.fields);
  const usedIds = new Set(
    components
      .map((component) => component.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const addedComponentIds: string[] = [];
  const nextRevision = surface.revision + 1;

  for (const spec of plan.addFields) {
    const id = allocateFieldComponentId(spec.key, usedIds);
    fields[spec.key] = spec;
    components.push(fieldComponent(spec, id));
    addedComponentIds.push(id);
  }

  const root = rootColumn(components);
  removeChildReferences(components, HOST_CONTROL_IDS);
  const children = Array.isArray(root.children)
    ? root.children.filter(
        (child): child is string => typeof child === "string",
    )
    : [];
  children.push(...addedComponentIds);
  root.children = unique(children);

  const changedKeys = Object.keys(plan.setValues);
  const defaultKeys = plan.addFields
    .map((spec) => spec.key)
    .filter((key) => !Object.hasOwn(plan.setValues, key));
  const values = { ...surface.values };
  for (const key of defaultKeys) {
    values[key] = "";
  }
  for (const [key, value] of Object.entries(plan.setValues)) {
    values[key] = value;
  }

  const next: SurfaceState = {
    ...surface,
    status: "editing",
    revision: nextRevision,
    fields,
    components,
    values,
    reviewedValues: null,
    reviewedRevision: null,
  };
  const rebuilt = rebuiltComponents(next, "editing");
  next.components = rebuilt;

  const dataUpdates: DataUpdate[] = [
    ...plan.addFields.map((spec) => ({
      path: `/draft/${spec.key}`,
      value: dataValue(
        spec,
        Object.hasOwn(values, spec.key) ? (values[spec.key] ?? "") : "",
      ),
    })),
    ...changedKeys
      .filter((key) => !plan.addFields.some((spec) => spec.key === key))
      .map((key) => ({
        path: `/draft/${key}`,
        value: dataValue(fields[key] as FieldSpec, values[key] ?? ""),
      })),
    { path: "/errors", value: { summary: "", fields: {} } },
    { path: "/meta/status", value: "editing" },
    { path: "/meta/revision", value: nextRevision },
  ];

  const envelope = buildEnvelope(next, rebuilt, dataUpdates, fields);
  const addedLabels = plan.addFields.map((spec) => spec.label);
  const changedLabels = changedKeys.map(
    (key) => fields[key]?.label ?? key,
  );
  const parts: string[] = [];
  if (addedLabels.length > 0) {
    parts.push(`added ${addedLabels.join(", ")}`);
  }
  if (changedLabels.length > 0) {
    parts.push(`set ${changedLabels.join(", ")}`);
  }
  return {
    surface: next,
    painted: true,
    envelope,
    text: `Updated the form at revision ${String(
      nextRevision,
    )}: ${parts.join("; ")}. Review again before submitting.`,
    summary: `Form updated at revision ${String(nextRevision)}`,
  };
}
