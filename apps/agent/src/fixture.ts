import {
  createSurface,
  updateComponents,
  updateDataModel,
  validateA2UIComponents,
  wrapAsOperationsEnvelope,
} from "@ag-ui/a2ui-toolkit";
import {
  ACTION_DISCARD_SURFACE,
  ACTION_REVIEW_REQUEST,
  CATALOG_ID,
  DISCARD_BUTTON_ID,
  HOST_STATUS_COMPONENT_ID,
  HOST_VALIDATION_COMPONENT_ID,
  REVIEW_BUTTON_ID,
  deleteSurfaceOperation,
  initializeDataModel,
  operationKind,
  operationsEnvelope,
  toValidationCatalog,
  updateComponentsOperation,
  updateDataModelOperation,
  validateComponentTree,
  validateDataModel,
  validateOperationEnvelope,
  type FieldRule,
  type RequestStatus,
} from "@arb/shared";
import { inlineCatalogSchema } from "@arb/shared";

export const PUBLISH_TOOL_NAME = "publish_fixture_operations";
export const REVIEW_ACTION_NAME = ACTION_REVIEW_REQUEST;
export const DISCARD_ACTION_NAME = ACTION_DISCARD_SURFACE;

const validationCatalog = toValidationCatalog(inlineCatalogSchema);

export type FixtureKind = "bug" | "feature" | "meeting" | "other";
export type FixtureCategory = "bug" | "feature" | "meeting" | "other";

export interface FixtureOption {
  label: string;
  value: string;
}

export interface FixtureFieldSpec {
  key: string;
  label: string;
  kind: "text" | "choice";
  required: boolean;
  multiline?: boolean;
  options?: FixtureOption[];
}

export interface FixtureDefinition {
  kind: FixtureKind;
  category: FixtureCategory;
  heading: string;
  intro: string;
  fields: FixtureFieldSpec[];
}

export interface FixtureSurface {
  kind: FixtureKind;
  definition: FixtureDefinition;
  components: Array<Record<string, unknown>>;
  data: Record<string, unknown>;
  fields: Record<string, FieldRule>;
  envelope: string;
}

export interface ReviewValues {
  values: Record<string, string>;
  issues: Record<string, string>;
  unknownKeys: string[];
}

export interface FixtureActionPlan {
  envelope: string;
  status: RequestStatus;
  revision: number;
  surfaceId: string | null;
  summary: string;
  text: string;
  painted: boolean;
}

const FIXTURES: Record<FixtureKind, FixtureDefinition> = {
  bug: {
    kind: "bug",
    category: "bug",
    heading: "Report a bug",
    intro:
      "Fixed fixture: this form is rendered from catalog-validated A2UI operations, not local JSX.",
    fields: [
      { key: "title", label: "Bug summary", kind: "text", required: true },
      {
        key: "details",
        label: "Steps to reproduce",
        kind: "text",
        required: true,
        multiline: true,
      },
      {
        key: "expected",
        label: "Expected behavior",
        kind: "text",
        required: false,
        multiline: true,
      },
      {
        key: "actual",
        label: "Actual behavior",
        kind: "text",
        required: false,
        multiline: true,
      },
      {
        key: "severity",
        label: "Severity",
        kind: "choice",
        required: true,
        options: [
          { label: "Low", value: "low" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" },
          { label: "Critical", value: "critical" },
        ],
      },
    ],
  },
  feature: {
    kind: "feature",
    category: "feature",
    heading: "Propose a feature",
    intro:
      "Fixed fixture: this form is rendered from catalog-validated A2UI operations, not local JSX.",
    fields: [
      { key: "title", label: "Feature title", kind: "text", required: true },
      {
        key: "details",
        label: "User problem",
        kind: "text",
        required: true,
        multiline: true,
      },
      {
        key: "outcome",
        label: "Desired outcome",
        kind: "text",
        required: false,
        multiline: true,
      },
      {
        key: "priority",
        label: "Priority",
        kind: "choice",
        required: true,
        options: [
          { label: "Low", value: "low" },
          { label: "Medium", value: "medium" },
          { label: "High", value: "high" },
        ],
      },
    ],
  },
  meeting: {
    kind: "meeting",
    category: "meeting",
    heading: "Arrange a project review",
    intro:
      "Fixed fixture: this form is rendered from catalog-validated A2UI operations, not local JSX.",
    fields: [
      { key: "title", label: "Meeting topic", kind: "text", required: true },
      {
        key: "details",
        label: "Agenda",
        kind: "text",
        required: true,
        multiline: true,
      },
      {
        key: "attendees",
        label: "Attendees (invented names)",
        kind: "text",
        required: false,
      },
      {
        key: "duration",
        label: "Duration",
        kind: "choice",
        required: true,
        options: [
          { label: "30 minutes", value: "30" },
          { label: "45 minutes", value: "45" },
          { label: "60 minutes", value: "60" },
          { label: "90 minutes", value: "90" },
        ],
      },
      {
        key: "preferred_time",
        label: "Preferred date and time",
        kind: "text",
        required: false,
      },
    ],
  },
  other: {
    kind: "other",
    category: "other",
    heading: "Describe your request",
    intro:
      "Fixed generic fixture: this form is rendered from catalog-validated A2UI operations, not local JSX.",
    fields: [
      { key: "title", label: "Request title", kind: "text", required: true },
      {
        key: "details",
        label: "Request details",
        kind: "text",
        required: true,
        multiline: true,
      },
    ],
  },
};

const FIXTURE_BY_CATEGORY: Record<FixtureCategory, FixtureDefinition> = {
  bug: FIXTURES.bug,
  feature: FIXTURES.feature,
  meeting: FIXTURES.meeting,
  other: FIXTURES.other,
};

export function selectFixtureKind(prompt: string): FixtureKind {
  const value = prompt.toLowerCase();
  if (/\b(login|bug|error|crash|broken|reproduc|defect)\b/.test(value)) {
    return "bug";
  }
  if (/\b(feature|propose|dashboard|enhancement|improvement)\b/.test(value)) {
    return "feature";
  }
  if (/\b(meeting|schedule|arrange|agenda|calendar|attendees)\b/.test(value)) {
    return "meeting";
  }
  return "other";
}

export function fixtureForCategory(
  category: FixtureCategory | string,
): FixtureDefinition {
  return (
    FIXTURE_BY_CATEGORY[category as FixtureCategory] ?? FIXTURES.other
  );
}

export function fixtureForKind(kind: FixtureKind): FixtureDefinition {
  return FIXTURES[kind];
}

export class FixtureValidationError extends Error {
  readonly errors: Array<{ code: string; path: string; message: string }>;

  constructor(
    message: string,
    errors: Array<{ code: string; path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "FixtureValidationError";
    this.errors = errors;
  }
}

function fieldComponent(
  field: FixtureFieldSpec,
): Record<string, unknown> {
  if (field.kind === "choice") {
    return {
      id: `field_${field.key}`,
      component: "ChoicePicker",
      label: field.label,
      variant: "mutuallyExclusive",
      displayStyle: "chips",
      options: field.options ?? [],
      value: { path: `/draft/${field.key}` },
    };
  }
  return {
    id: `field_${field.key}`,
    component: "TextField",
    label: field.label,
    ...(field.multiline ? { variant: "longText" } : {}),
    value: { path: `/draft/${field.key}` },
  };
}

function reviewContext(
  definition: FixtureDefinition,
): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (const field of definition.fields) {
    context[field.key] = { path: `/draft/${field.key}` };
  }
  context.revision = { path: "/meta/revision" };
  return context;
}

function button(
  id: string,
  labelId: string,
  label: string,
  actionName: string,
  context: Record<string, unknown>,
  variant?: string,
): Array<Record<string, unknown>> {
  return [
    { id: labelId, component: "Text", text: label },
    {
      id,
      component: "Button",
      child: labelId,
      ...(variant ? { variant } : {}),
      action: { event: { name: actionName, context } },
    },
  ];
}

export function buildFixtureComponents(
  definition: FixtureDefinition,
  phase: "editing" | "review" = "editing",
  revision = 0,
): Array<Record<string, unknown>> {
  const fieldIds = definition.fields.map((field) => `field_${field.key}`);
  const heading =
    phase === "review"
      ? `${definition.heading} (fixture review)`
      : `${definition.heading} (fixture)`;
  const statusText =
    phase === "review" ? `Reviewed at revision ${String(revision)}.` : "";

  return [
    {
      id: "root",
      component: "Column",
      children: [
        "heading",
        "intro",
        ...fieldIds,
        HOST_VALIDATION_COMPONENT_ID,
        HOST_STATUS_COMPONENT_ID,
        REVIEW_BUTTON_ID,
        DISCARD_BUTTON_ID,
      ],
    },
    { id: "heading", component: "Text", text: heading, variant: "h3" },
    { id: "intro", component: "Text", text: definition.intro },
    ...definition.fields.map(fieldComponent),
    {
      id: HOST_VALIDATION_COMPONENT_ID,
      component: "Text",
      text: { path: "/errors/summary" },
    },
    {
      id: HOST_STATUS_COMPONENT_ID,
      component: "Text",
      text: statusText,
    },
    ...button(
      REVIEW_BUTTON_ID,
      "review_label",
      "Review request",
      ACTION_REVIEW_REQUEST,
      reviewContext(definition),
      "primary",
    ),
    ...button(
      DISCARD_BUTTON_ID,
      "discard_label",
      "Discard demo form",
      ACTION_DISCARD_SURFACE,
      { revision: { path: "/meta/revision" } },
      "borderless",
    ),
  ];
}

function validateBeforePublish(
  surfaceId: string,
  components: Array<Record<string, unknown>>,
  data: Record<string, unknown>,
): { fields: Record<string, FieldRule>; envelope: string } {
  const tree = validateComponentTree(components);
  if (!tree.valid) {
    throw new FixtureValidationError(
      "Fixture components failed host catalog validation",
      tree.errors,
    );
  }

  const dataErrors = validateDataModel(data, tree.fields);
  if (dataErrors.length > 0) {
    throw new FixtureValidationError(
      "Fixture data model failed host validation",
      dataErrors,
    );
  }

  const sdkValidation = validateA2UIComponents({
    components,
    data,
    catalog: validationCatalog,
  });
  if (!sdkValidation.valid) {
    throw new FixtureValidationError(
      "Fixture components failed SDK catalog validation",
      sdkValidation.errors,
    );
  }

  const envelope = wrapAsOperationsEnvelope([
    createSurface(surfaceId, CATALOG_ID),
    updateComponents(surfaceId, components),
    updateDataModel(surfaceId, data),
  ]);
  const envelopeValidation = validateOperationEnvelope(envelope, {
    expectedSurfaceId: surfaceId,
    fields: tree.fields,
  });
  if (!envelopeValidation.valid) {
    throw new FixtureValidationError(
      "Fixture operations failed strict envelope validation",
      envelopeValidation.errors,
    );
  }
  return { fields: tree.fields, envelope };
}

export function buildFixtureSurface(
  surfaceId: string,
  kind: FixtureKind,
): FixtureSurface {
  const definition = fixtureForKind(kind);
  const components = buildFixtureComponents(definition);
  const fields = validateComponentTree(components).fields;
  const data = initializeDataModel(fields);
  const { envelope } = validateBeforePublish(surfaceId, components, data);

  return {
    kind,
    definition,
    components,
    data,
    fields,
    envelope,
  };
}

function normalizeChoice(
  field: FixtureFieldSpec,
  value: unknown,
): string | null {
  let candidate: unknown = value;
  if (Array.isArray(value)) {
    if (value.length !== 1) {
      return null;
    }
    candidate = value[0];
  }
  if (typeof candidate !== "string") {
    return null;
  }
  if (!(field.options ?? []).some((option) => option.value === candidate)) {
    return null;
  }
  return candidate;
}

export function normalizeReviewValues(
  definition: FixtureDefinition,
  context: Record<string, unknown>,
): ReviewValues {
  const allowedKeys = new Set([
    ...definition.fields.map((field) => field.key),
    "revision",
  ]);
  const unknownKeys = Object.keys(context).filter((key) => !allowedKeys.has(key));
  const values: Record<string, string> = {};
  const issues: Record<string, string> = {};

  for (const field of definition.fields) {
    const raw = context[field.key];
    if (field.kind === "choice") {
      const normalized = normalizeChoice(field, raw);
      if (normalized === null) {
        issues[field.key] = `${field.label} must be one approved option.`;
      } else {
        values[field.key] = normalized;
      }
      continue;
    }
    if (typeof raw !== "string") {
      issues[field.key] = `${field.label} must be text.`;
      continue;
    }
    if (raw.length > 2_000) {
      issues[field.key] = `${field.label} must be at most 2000 characters.`;
      continue;
    }
    if (field.required && raw.trim() === "") {
      issues[field.key] = `${field.label} is required.`;
      continue;
    }
    values[field.key] = raw;
  }

  return { values, issues, unknownKeys };
}

function validationSummary(issues: Record<string, string>): string {
  const messages = Object.values(issues);
  return messages.length === 0
    ? ""
    : `Please fix: ${messages.join(" ")}`;
}

function reviewUpdate(
  definition: FixtureDefinition,
  surfaceId: string,
  revision: number,
  values: Record<string, string>,
  issues: Record<string, string>,
): { envelope: string; status: RequestStatus; revision: number; summary: string; text: string } {
  const invalid = Object.keys(issues).length > 0;
  const nextRevision = invalid ? revision : revision + 1;
  const phase = invalid ? "editing" : "review";
  const components = buildFixtureComponents(definition, phase, nextRevision);
  const errors = {
    summary: validationSummary(issues),
    fields: issues,
  };
  const operations = [
    updateComponentsOperation(surfaceId, components),
    updateDataModelOperation(surfaceId, "/errors", errors),
    updateDataModelOperation(surfaceId, "/meta/status", phase),
    ...(invalid
      ? []
      : [updateDataModelOperation(surfaceId, "/meta/revision", nextRevision)]),
  ];
  const envelope = operationsEnvelope(operations);
  const validation = validateOperationEnvelope(envelope, {
    expectedSurfaceId: surfaceId,
    fields: definition.fields.reduce<Record<string, FieldRule>>((rules, field) => {
      rules[field.key] = {
        kind: field.kind,
        required: field.required,
        ...(field.options
          ? { options: field.options.map((option) => option.value) }
          : {}),
      };
      return rules;
    }, {}),
  });
  if (!validation.valid) {
    throw new FixtureValidationError(
      "Review update failed strict envelope validation",
      validation.errors,
    );
  }

  return {
    envelope,
    status: phase,
    revision: nextRevision,
    summary: invalid
      ? `Validation failed: ${Object.keys(issues).join(", ")}`
      : `Review saved at revision ${String(nextRevision)}`,
    text: invalid
      ? `Validation failed. ${validationSummary(issues)} Nothing was reviewed; fix the fields in the same surface and try again.`
      : `Review saved at revision ${String(nextRevision)} for ${JSON.stringify(
          values.title ?? values[definition.fields[0]?.key ?? "title"] ?? "",
        )}. Edit the A2UI surface and review again, or discard this demo form.`,
  };
}

export function planReviewAction(
  definition: FixtureDefinition,
  surfaceId: string,
  revision: number,
  context: Record<string, unknown>,
): FixtureActionPlan {
  const normalized = normalizeReviewValues(definition, context);
  if (normalized.unknownKeys.length > 0) {
    return {
      envelope: "",
      status: "editing",
      revision,
      surfaceId,
      summary: "Rejected action: unknown context keys",
      text: `Rejected action: unexpected context keys ${normalized.unknownKeys.join(", ")}.`,
      painted: false,
    };
  }
  const result = reviewUpdate(
    definition,
    surfaceId,
    revision,
    normalized.values,
    normalized.issues,
  );
  return {
    envelope: result.envelope,
    status: result.status,
    revision: result.revision,
    surfaceId,
    summary: result.summary,
    text: result.text,
    painted: true,
  };
}

export function planDiscardAction(
  surfaceId: string,
  definition: FixtureDefinition,
  revision: number,
  context: Record<string, unknown>,
): FixtureActionPlan {
  const keys = Object.keys(context).sort();
  if (keys.join(",") !== "revision") {
    return {
      envelope: "",
      status: "editing",
      revision,
      surfaceId,
      summary: "Rejected action: discard context must contain only revision",
      text: "Rejected action: discardSurface accepts only the revision binding.",
      painted: false,
    };
  }
  const envelope = operationsEnvelope([deleteSurfaceOperation(surfaceId)]);
  const validation = validateOperationEnvelope(envelope, {
    expectedSurfaceId: surfaceId,
  });
  if (!validation.valid) {
    throw new FixtureValidationError(
      "deleteSurface fixture failed strict envelope validation",
      validation.errors,
    );
  }
  return {
    envelope,
    status: "editing",
    revision: 0,
    surfaceId: null,
    summary: `Fixture surface discarded (${definition.heading})`,
    text: `Discarded the ${definition.heading.toLowerCase()} fixture surface. Start a new request to render another form.`,
    painted: true,
  };
}

export function validatePublishEnvelope(
  envelope: string,
  surfaceId: string,
): string[] {
  const validation = validateOperationEnvelope(envelope, {
    expectedSurfaceId: surfaceId,
  });
  return validation.errors.map(
    (error) => `${error.path}: ${error.message}`,
  );
}

export function describeEnvelopeOperations(envelope: string): string[] {
  try {
    const parsed = JSON.parse(envelope) as { a2ui_operations?: unknown };
    if (!Array.isArray(parsed.a2ui_operations)) {
      return [];
    }
    return parsed.a2ui_operations
      .filter(
        (operation): operation is Record<string, unknown> =>
          Boolean(operation) &&
          typeof operation === "object" &&
          !Array.isArray(operation),
      )
      .map(operationKind);
  } catch {
    return [];
  }
}
