import { z } from "zod";
import catalogSchemaJson from "./catalog-schema.json" with { type: "json" };
import {
  ALLOWED_ACTION_NAMES,
  ALLOWED_COMPONENTS,
  CATALOG_ID,
  FIELD_KEY_PATTERN,
  LIMITS,
  REQUEST_STATUSES,
  REQUIRED_FIELD_PATHS,
  type AllowedComponent,
  type RequestStatus,
} from "./constants.js";

const catalogSchema = catalogSchemaJson as unknown as {
  catalogId: string;
  components: Record<string, Record<string, unknown>>;
};

const FIELD_KEY = new RegExp(FIELD_KEY_PATTERN);
const COMPONENT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const DRAFT_PATH = /^\/draft\/([a-z][a-z0-9_]{0,31})$/;
const OPERATION_KEYS = [
  "createSurface",
  "updateComponents",
  "updateDataModel",
  "deleteSurface",
] as const;
const UNSAFE_MARKUP = /<\s*\/?\s*[a-z!]/i;
const UNSAFE_SCRIPT = /\b(?:javascript|vbscript):/i;
const UNSAFE_STYLE = /\b(?:style|class)\s*=/i;

export interface SurfaceValidationError {
  code: string;
  path: string;
  message: string;
}

export interface FieldRule {
  kind: "text" | "choice";
  required: boolean;
  options?: string[];
}

export interface ComponentTreeValidation {
  valid: boolean;
  errors: SurfaceValidationError[];
  fields: Record<string, FieldRule>;
}

export interface OperationEnvelopeValidation extends ComponentTreeValidation {
  operations: Array<Record<string, unknown>>;
}

interface ComponentCatalogEntry {
  properties: Record<string, unknown>;
  required: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function catalogEntry(type: string): ComponentCatalogEntry | null {
  const entry = catalogSchema.components[type];
  if (!isRecord(entry)) {
    return null;
  }
  const allOf = Array.isArray(entry.allOf) ? entry.allOf : [];
  const specific = isRecord(allOf[1]) ? allOf[1] : entry;
  const properties = isRecord(specific.properties)
    ? specific.properties
    : {};
  const required = Array.isArray(specific.required)
    ? specific.required.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return { properties, required };
}

function enumValues(type: string, property: string): string[] | null {
  const entry = catalogEntry(type);
  const schema = entry?.properties[property];
  if (!isRecord(schema) || !Array.isArray(schema.enum)) {
    return null;
  }
  return schema.enum.filter(
    (value): value is string => typeof value === "string",
  );
}

function addError(
  errors: SurfaceValidationError[],
  code: string,
  path: string,
  message: string,
): void {
  errors.push({ code, path, message });
}

function isSafeLabel(value: string, max: number): boolean {
  return (
    value.length > 0 &&
    value.length <= max &&
    !UNSAFE_MARKUP.test(value) &&
    !UNSAFE_SCRIPT.test(value) &&
    !UNSAFE_STYLE.test(value)
  );
}

function isSafeText(value: string, max: number): boolean {
  return (
    value.length <= max &&
    !UNSAFE_MARKUP.test(value) &&
    !UNSAFE_SCRIPT.test(value)
  );
}

function dynamicPath(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "path") {
    return null;
  }
  return typeof value.path === "string" ? value.path : null;
}

function checkLiteral(
  errors: SurfaceValidationError[],
  value: unknown,
  path: string,
  max: number,
): string | null {
  if (typeof value !== "string") {
    addError(errors, "invalid_prop", path, "Expected a literal string");
    return null;
  }
  if (!isSafeText(value, max)) {
    addError(
      errors,
      "unsafe_content",
      path,
      `String must be at most ${String(max)} characters and contain no markup or script URLs`,
    );
    return null;
  }
  return value;
}

function checkEnum(
  errors: SurfaceValidationError[],
  type: string,
  component: Record<string, unknown>,
  property: string,
  path: string,
): void {
  const value = component[property];
  if (value === undefined) {
    return;
  }
  const allowed = enumValues(type, property);
  if (!allowed) {
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    addError(
      errors,
      "invalid_variant",
      path,
      `Expected one of: ${allowed.join(", ")}`,
    );
  }
}

function validateChecks(
  errors: SurfaceValidationError[],
  value: unknown,
  path: string,
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length > LIMITS.maxOptions) {
    addError(errors, "invalid_checks", path, "checks must be a bounded array");
    return;
  }
  value.forEach((check, index) => {
    if (!isRecord(check)) {
      addError(
        errors,
        "invalid_checks",
        `${path}[${String(index)}]`,
        "each check must be an object",
      );
      return;
    }
    const keys = Object.keys(check).sort();
    if (keys.join(",") !== "condition,message") {
      addError(
        errors,
        "invalid_checks",
        `${path}[${String(index)}]`,
        "check must contain exactly condition and message",
      );
      return;
    }
    const condition = check.condition;
    const conditionPath = dynamicPath(condition);
    if (
      typeof condition !== "boolean" &&
      (conditionPath === null || !conditionPath.startsWith("/"))
    ) {
      addError(
        errors,
        "invalid_checks",
        `${path}[${String(index)}].condition`,
        "condition must be a boolean or a {path} object",
      );
    }
    if (typeof check.message !== "string" || !isSafeText(check.message, 300)) {
      addError(
        errors,
        "invalid_checks",
        `${path}[${String(index)}].message`,
        "check message must be a safe string",
      );
    }
  });
}

const HOST_ID_TYPES: Record<string, readonly string[]> = {
  root: ["Column", "Card"],
  heading: ["Text"],
  intro: ["Text"],
  review: ["Button"],
  discard: ["Button"],
  review_label: ["Text"],
  discard_label: ["Text"],
  host_validation: ["Text"],
  host_status: ["Text"],
};

type FieldBindingKinds = Map<string, "text" | "choice">;

function validateTextField(
  errors: SurfaceValidationError[],
  component: Record<string, unknown>,
  path: string,
  fieldBindingKinds: FieldBindingKinds,
): void {
  const label = checkLiteral(
    errors,
    component.label,
    `${path}.label`,
    LIMITS.maxLabelLength,
  );
  if (label === null || label.trim() === "") {
    addError(errors, "invalid_label", `${path}.label`, "Label is required");
  }

  const valuePath = dynamicPath(component.value);
  if (valuePath !== null) {
    const match = DRAFT_PATH.exec(valuePath);
    if (!match?.[1] || !FIELD_KEY.test(match[1])) {
      addError(
        errors,
        "invalid_binding",
        `${path}.value`,
        "TextField value must bind /draft/<fieldKey>",
      );
    } else if (fieldBindingKinds.has(match[1])) {
      addError(
        errors,
        "duplicate_field",
        `${path}.value`,
        `Duplicate field key '${match[1]}'`,
      );
    } else {
      fieldBindingKinds.set(match[1], "text");
    }
  } else if (component.value !== undefined) {
    checkLiteral(errors, component.value, `${path}.value`, LIMITS.maxTextLength);
  }

  checkEnum(errors, "TextField", component, "variant", `${path}.variant`);
  if (
    component.validationRegexp !== undefined &&
    (typeof component.validationRegexp !== "string" ||
      !isSafeText(component.validationRegexp, 300))
  ) {
    addError(
      errors,
      "invalid_prop",
      `${path}.validationRegexp`,
      "validationRegexp must be a safe string",
    );
  }
  validateChecks(errors, component.checks, `${path}.checks`);
}

function validateChoicePicker(
  errors: SurfaceValidationError[],
  component: Record<string, unknown>,
  path: string,
  fieldBindingKinds: FieldBindingKinds,
): void {
  const label = checkLiteral(
    errors,
    component.label,
    `${path}.label`,
    LIMITS.maxLabelLength,
  );
  if (label === null || label.trim() === "") {
    addError(errors, "invalid_label", `${path}.label`, "Label is required");
  }

  const options = component.options;
  if (!Array.isArray(options) || options.length === 0) {
    addError(
      errors,
      "invalid_options",
      `${path}.options`,
      "ChoicePicker requires at least one option",
    );
  } else if (options.length > LIMITS.maxOptions) {
    addError(
      errors,
      "invalid_options",
      `${path}.options`,
      `At most ${String(LIMITS.maxOptions)} options are allowed`,
    );
  } else {
    const values = new Set<string>();
    options.forEach((option, index) => {
      const optionPath = `${path}.options[${String(index)}]`;
      if (!isRecord(option)) {
        addError(errors, "invalid_options", optionPath, "Option must be an object");
        return;
      }
      const keys = Object.keys(option).sort();
      if (keys.join(",") !== "label,value") {
        addError(
          errors,
          "invalid_options",
          optionPath,
          "Option must contain exactly label and value",
        );
      }
      const optionLabel = checkLiteral(
        errors,
        option.label,
        `${optionPath}.label`,
        LIMITS.maxLabelLength,
      );
      if (optionLabel === null || optionLabel.trim() === "") {
        addError(errors, "invalid_options", `${optionPath}.label`, "Option label is required");
      }
      if (
        typeof option.value !== "string" ||
        option.value.length === 0 ||
        option.value.length > LIMITS.maxLabelLength ||
        !isSafeText(option.value, LIMITS.maxLabelLength)
      ) {
        addError(
          errors,
          "invalid_options",
          `${optionPath}.value`,
          "Option value must be a safe, non-empty string",
        );
        return;
      }
      if (values.has(option.value)) {
        addError(
          errors,
          "invalid_options",
          `${optionPath}.value`,
          `Duplicate option value '${option.value}'`,
        );
      }
      values.add(option.value);
    });
  }

  const variant = component.variant;
  if (variant !== undefined && variant !== "mutuallyExclusive") {
    addError(
      errors,
      "invalid_variant",
      `${path}.variant`,
      "The approved catalog is single-select: use mutuallyExclusive",
    );
  }

  const valuePath = dynamicPath(component.value);
  if (valuePath !== null) {
    const match = DRAFT_PATH.exec(valuePath);
    if (!match?.[1] || !FIELD_KEY.test(match[1])) {
      addError(
        errors,
        "invalid_binding",
        `${path}.value`,
        "ChoicePicker value must bind /draft/<fieldKey>",
      );
    } else if (fieldBindingKinds.has(match[1])) {
      addError(
        errors,
        "duplicate_field",
        `${path}.value`,
        `Duplicate field key '${match[1]}'`,
      );
    } else {
      fieldBindingKinds.set(match[1], "choice");
    }
  } else if (component.value !== undefined) {
    if (!Array.isArray(component.value) || component.value.length > 1) {
      addError(
        errors,
        "invalid_binding",
        `${path}.value`,
        "ChoicePicker value must be at most one string in a literal array",
      );
    } else if (
      component.value.some(
        (entry) => typeof entry !== "string" || entry.length > LIMITS.maxLabelLength,
      )
    ) {
      addError(
        errors,
        "invalid_binding",
        `${path}.value`,
        "ChoicePicker literal values must be strings",
      );
    }
  }

  checkEnum(errors, "ChoicePicker", component, "displayStyle", `${path}.displayStyle`);
  if (component.filterable !== undefined && typeof component.filterable !== "boolean") {
    addError(
      errors,
      "invalid_prop",
      `${path}.filterable`,
      "filterable must be a boolean",
    );
  }
  validateChecks(errors, component.checks, `${path}.checks`);
}

function validateButton(
  errors: SurfaceValidationError[],
  component: Record<string, unknown>,
  path: string,
): void {
  if (typeof component.child !== "string" || component.child.length === 0) {
    addError(errors, "invalid_child", `${path}.child`, "Button child is required");
  }
  checkEnum(errors, "Button", component, "variant", `${path}.variant`);
}

function validateActionEvent(
  errors: SurfaceValidationError[],
  component: Record<string, unknown>,
  path: string,
  fields: Record<string, FieldRule>,
): void {
  const action = component.action;
  if (!isRecord(action)) {
    addError(errors, "invalid_action", `${path}.action`, "Button action is required");
    return;
  }
  if ("functionCall" in action) {
    addError(
      errors,
      "invalid_action",
      `${path}.action.functionCall`,
      "Function-call actions are not allowed",
    );
    return;
  }
  const actionKeys = Object.keys(action);
  if (actionKeys.length !== 1 || actionKeys[0] !== "event") {
    addError(
      errors,
      "invalid_action",
      `${path}.action`,
      "Button action must contain exactly one event",
    );
    return;
  }
  const event = action.event;
  if (!isRecord(event)) {
    addError(errors, "invalid_action", `${path}.action.event`, "event must be an object");
    return;
  }
  const eventKeys = Object.keys(event).sort();
  if (eventKeys.join(",") !== "context,name") {
    addError(
      errors,
      "invalid_action",
      `${path}.action.event`,
      "event must contain exactly name and context",
    );
    return;
  }
  const name = event.name;
  if (
    typeof name !== "string" ||
    !(ALLOWED_ACTION_NAMES as readonly string[]).includes(name)
  ) {
    addError(
      errors,
      "unknown_action",
      `${path}.action.event.name`,
      `Unknown action '${String(name)}'`,
    );
    return;
  }
  if (!isRecord(event.context)) {
    addError(
      errors,
      "invalid_action",
      `${path}.action.event.context`,
      "Action context must be an object",
    );
    return;
  }

  const context = event.context;
  const expectedKeys =
    name === "reviewRequest"
      ? [...Object.keys(fields), "revision"].sort()
      : ["revision"];
  const actualKeys = Object.keys(context).sort();
  if (actualKeys.join(",") !== expectedKeys.join(",")) {
    addError(
      errors,
      "invalid_action_context",
      `${path}.action.event.context`,
      `Action context keys must be exactly: ${expectedKeys.join(", ")}`,
    );
  }

  for (const [key, value] of Object.entries(context)) {
    const keyPath = `${path}.action.event.context.${key}`;
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) {
      addError(errors, "invalid_action_context", keyPath, "Invalid context key");
      continue;
    }
    const pathValue = dynamicPath(value);
    if (pathValue === null) {
      addError(
        errors,
        "invalid_action_context",
        keyPath,
        "Action context values must be {path} objects",
      );
      continue;
    }
    if (key === "revision") {
      if (pathValue !== "/meta/revision") {
        addError(
          errors,
          "invalid_action_context",
          keyPath,
          "revision must bind /meta/revision",
        );
      }
      continue;
    }
    if (name === "discardSurface") {
      addError(
        errors,
        "invalid_action_context",
        keyPath,
        "discardSurface accepts only revision",
      );
      continue;
    }
    if (pathValue !== `/draft/${key}`) {
      addError(
        errors,
        "invalid_action_context",
        keyPath,
        `${key} must bind /draft/${key}`,
      );
    }
  }
}

function validateOneComponent(
  errors: SurfaceValidationError[],
  component: unknown,
  index: number,
  fieldBindingKinds: FieldBindingKinds,
): string | null {
  const path = `components[${String(index)}]`;
  if (!isRecord(component)) {
    addError(errors, "invalid_component", path, "Component must be an object");
    return null;
  }
  const id = component.id;
  if (typeof id !== "string" || !COMPONENT_ID.test(id)) {
    addError(errors, "invalid_id", `${path}.id`, "Component id is invalid");
  }
  const type = component.component;
  if (
    typeof type !== "string" ||
    !(ALLOWED_COMPONENTS as readonly string[]).includes(type)
  ) {
    addError(
      errors,
      "unknown_component",
      `${path}.component`,
      `Component type '${String(type)}' is not in the catalog`,
    );
    return null;
  }

  const expectedHostTypes = typeof id === "string" ? HOST_ID_TYPES[id] : undefined;
  if (expectedHostTypes && !expectedHostTypes.includes(type)) {
    addError(
      errors,
      "host_id_collision",
      `${path}.component`,
      `Host-only component id '${id}' must be ${expectedHostTypes.join(" or ")}`,
    );
  }

  const entry = catalogEntry(type);
  if (!entry) {
    addError(
      errors,
      "unknown_component",
      `${path}.component`,
      `Component type '${type}' has no catalog schema`,
    );
    return null;
  }

  const allowed = new Set(["id", "component", ...Object.keys(entry.properties)]);
  for (const key of Object.keys(component)) {
    if (!allowed.has(key)) {
      addError(
        errors,
        "unknown_prop",
        `${path}.${key}`,
        `Property '${key}' is not in the ${type} schema`,
      );
    }
  }
  for (const required of entry.required) {
    if (!(required in component)) {
      addError(
        errors,
        "missing_required_prop",
        `${path}.${required}`,
        `${type} is missing required prop '${required}'`,
      );
    }
  }

  switch (type) {
    case "Text": {
      const textPath = dynamicPath(component.text);
      if (textPath !== null) {
        if (textPath !== "/errors/summary") {
          addError(
            errors,
            "invalid_binding",
            `${path}.text`,
            "Text may bind only /errors/summary",
          );
        }
      } else {
        checkLiteral(errors, component.text, `${path}.text`, LIMITS.maxTextLength);
      }
      checkEnum(errors, "Text", component, "variant", `${path}.variant`);
      break;
    }
    case "Column": {
      validateChildren(errors, component, path);
      checkEnum(errors, "Column", component, "justify", `${path}.justify`);
      checkEnum(errors, "Column", component, "align", `${path}.align`);
      break;
    }
    case "Card": {
      if (typeof component.child !== "string" || component.child.length === 0) {
        addError(errors, "invalid_child", `${path}.child`, "Card child is required");
      }
      break;
    }
    case "TextField":
      validateTextField(errors, component, path, fieldBindingKinds);
      break;
    case "ChoicePicker":
      validateChoicePicker(errors, component, path, fieldBindingKinds);
      break;
    case "Button":
      validateButton(errors, component, path);
      break;
  }

  return type;
}

function validateChildren(
  errors: SurfaceValidationError[],
  component: Record<string, unknown>,
  path: string,
): void {
  const children = component.children;
  if (!Array.isArray(children) || children.length === 0) {
    addError(
      errors,
      "invalid_child",
      `${path}.children`,
      "children must be a non-empty array",
    );
    return;
  }
  if (children.length > 40) {
    addError(
      errors,
      "invalid_child",
      `${path}.children`,
      "children must contain at most 40 entries",
    );
  }
  children.forEach((child, index) => {
    if (typeof child !== "string" || child.length === 0) {
      addError(
        errors,
        "invalid_child",
        `${path}.children[${String(index)}]`,
        "Child references must be component IDs",
      );
    }
  });
}

function childReferences(component: Record<string, unknown>): string[] {
  const references: string[] = [];
  if (Array.isArray(component.children)) {
    for (const child of component.children) {
      if (typeof child === "string") {
        references.push(child);
      }
    }
  }
  if (typeof component.child === "string") {
    references.push(component.child);
  }
  return references;
}

function findCycle(
  components: Map<string, Record<string, unknown>>,
): string[] | null {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (state.get(id) === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (state.get(id) === "done") {
      return null;
    }
    state.set(id, "visiting");
    stack.push(id);
    for (const child of childReferences(components.get(id) ?? {})) {
      const cycle = visit(child);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  }

  for (const id of components.keys()) {
    const cycle = visit(id);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

function reachableFromRoot(
  components: Map<string, Record<string, unknown>>,
): Set<string> {
  const reachable = new Set<string>();
  const stack = ["root"];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || reachable.has(id)) {
      continue;
    }
    const component = components.get(id);
    if (!component) {
      continue;
    }
    reachable.add(id);
    stack.push(...childReferences(component));
  }
  return reachable;
}

function maxDepth(
  components: Map<string, Record<string, unknown>>,
  id: string,
  seen: Set<string>,
): number {
  if (seen.has(id)) {
    return 0;
  }
  const component = components.get(id);
  if (!component) {
    return 0;
  }
  const nextSeen = new Set(seen).add(id);
  const children = childReferences(component);
  if (children.length === 0) {
    return 1;
  }
  return 1 + Math.max(...children.map((child) => maxDepth(components, child, nextSeen)));
}

export function validateComponentTree(
  components: unknown,
): ComponentTreeValidation {
  const fieldBindingKinds: FieldBindingKinds = new Map();
  const errors: SurfaceValidationError[] = [];
  if (!Array.isArray(components) || components.length === 0) {
    addError(
      errors,
      "empty_components",
      "components",
      "A2UI components must be a non-empty array",
    );
    return { valid: false, errors, fields: {} };
  }
  if (components.length > LIMITS.maxComponents) {
    addError(
      errors,
      "too_many_components",
      "components",
      `At most ${String(LIMITS.maxComponents)} components are allowed`,
    );
  }

  const byId = new Map<string, Record<string, unknown>>();
  const types = new Map<string, string>();
  components.forEach((component, index) => {
    const type = validateOneComponent(
      errors,
      component,
      index,
      fieldBindingKinds,
    );
    if (!isRecord(component) || typeof component.id !== "string") {
      return;
    }
    if (byId.has(component.id)) {
      addError(
        errors,
        "duplicate_id",
        `components[${String(index)}].id`,
        `Duplicate component id '${component.id}'`,
      );
    }
    byId.set(component.id, component);
    if (type) {
      types.set(component.id, type);
    }
  });

  const root = byId.get("root");
  if (!root) {
    addError(errors, "no_root", "components", "No component has id 'root'");
  } else if (root.component !== "Column" && root.component !== "Card") {
    addError(
      errors,
      "invalid_root",
      "components[id=root].component",
      "root must be a layout component (Column or Card)",
    );
  }

  for (const [id, component] of byId) {
    for (const reference of childReferences(component)) {
      if (!byId.has(reference)) {
        addError(
          errors,
          "unresolved_child",
          `components[id=${id}]`,
          `Child reference '${reference}' does not match any component id`,
        );
      }
    }
    if (component.component === "Button" && typeof component.child === "string") {
      if (types.get(component.child) !== "Text") {
        addError(
          errors,
          "invalid_child",
          `components[id=${id}].child`,
          "Button child must reference a Text component",
        );
      }
    }
  }

  const cycle = findCycle(byId);
  if (cycle) {
    addError(
      errors,
      "child_cycle",
      "components",
      `Child reference cycle detected: ${cycle.join(" -> ")}`,
    );
  }

  const reachable = reachableFromRoot(byId);
  for (const id of byId.keys()) {
    if (!reachable.has(id)) {
      addError(
        errors,
        "unreachable_component",
        `components[id=${id}]`,
        "Component is not reachable from root",
      );
    }
  }
  if (byId.has("root")) {
    const depth = maxDepth(byId, "root", new Set());
    if (depth > LIMITS.maxDepth) {
      addError(
        errors,
        "too_deep",
        "components[id=root]",
        `Nesting depth ${String(depth)} exceeds ${String(LIMITS.maxDepth)}`,
      );
    }
  }

  const fields: Record<string, FieldRule> = {};
  const keys = [...fieldBindingKinds.keys()];
  if (keys.length > LIMITS.maxFields) {
    addError(
      errors,
      "too_many_fields",
      "components",
      `At most ${String(LIMITS.maxFields)} fields are allowed`,
    );
  }
  for (const key of keys) {
    const kind = fieldBindingKinds.get(key);
    if (kind) {
      fields[key] = {
        kind,
        required: (REQUIRED_FIELD_PATHS as readonly string[]).includes(
          `/draft/${key}`,
        ),
        ...(kind === "choice" ? { options: [] } : {}),
      };
    }
  }

  for (const path of REQUIRED_FIELD_PATHS) {
    const key = path.replace(/^\/draft\//, "");
    if (!fields[key]) {
      addError(
        errors,
        "missing_required_field",
        "components",
        `Required canonical binding ${path} is missing`,
      );
    }
  }

  for (const [id, component] of byId) {
    if (component.component === "Button") {
      validateActionEvent(errors, component, `components[id=${id}]`, fields);
    }
  }

  return { valid: errors.length === 0, errors, fields };
}

export function deriveFieldRules(
  components: unknown,
): Record<string, FieldRule> {
  return validateComponentTree(components).fields;
}

export function initializeDataModel(
  fields: Record<string, FieldRule>,
): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(fields)) {
    draft[key] = rule.kind === "choice" ? [] : "";
  }
  return {
    draft,
    meta: { revision: 0, status: "editing" satisfies RequestStatus },
    errors: { summary: "", fields: {} },
  };
}

function validateErrorData(value: unknown): SurfaceValidationError[] {
  const errors: SurfaceValidationError[] = [];
  if (typeof value === "string") {
    if (!isSafeText(value, LIMITS.maxTextLength)) {
      addError(
        errors,
        "invalid_data_value",
        "errors",
        "Error text must be bounded and contain no executable content",
      );
    }
    return errors;
  }
  if (!isRecord(value)) {
    addError(
      errors,
      "invalid_data_value",
      "errors",
      "Error data must be an object or string",
    );
    return errors;
  }
  for (const key of Object.keys(value)) {
    if (key !== "summary" && key !== "fields") {
      addError(
        errors,
        "invalid_data_value",
        `errors.${key}`,
        "Error data allows only summary and fields",
      );
    }
  }
  if (value.summary !== undefined) {
    if (
      typeof value.summary !== "string" ||
      !isSafeText(value.summary, LIMITS.maxTextLength)
    ) {
      addError(
        errors,
        "invalid_data_value",
        "errors.summary",
        "Error summary must be a bounded safe string",
      );
    }
  }
  if (value.fields !== undefined) {
    if (!isRecord(value.fields)) {
      addError(
        errors,
        "invalid_data_value",
        "errors.fields",
        "Error fields must be an object",
      );
    } else {
      const entries = Object.entries(value.fields);
      if (entries.length > LIMITS.maxFields) {
        addError(
          errors,
          "invalid_data_value",
          "errors.fields",
          `At most ${String(LIMITS.maxFields)} field errors are allowed`,
        );
      }
      for (const [key, message] of entries) {
        if (!FIELD_KEY.test(key)) {
          addError(
            errors,
            "invalid_data_value",
            `errors.fields.${key}`,
            "Error field keys must match the field-key pattern",
          );
          continue;
        }
        if (
          typeof message !== "string" ||
          !isSafeText(message, 300)
        ) {
          addError(
            errors,
            "invalid_data_value",
            `errors.fields.${key}`,
            "Field errors must be bounded safe strings",
          );
        }
      }
    }
  }
  try {
    if (JSON.stringify(value).length > 4_000) {
      addError(
        errors,
        "invalid_data_value",
        "errors",
        "Error data must be at most 4000 serialized characters",
      );
    }
  } catch {
    addError(
      errors,
      "invalid_data_value",
      "errors",
      "Error data must be JSON-serializable",
    );
  }
  return errors;
}

export function validateDataModel(
  value: unknown,
  fields: Record<string, FieldRule>,
): SurfaceValidationError[] {
  const errors: SurfaceValidationError[] = [];
  if (!isRecord(value)) {
    addError(errors, "invalid_data_model", "data", "Data model must be an object");
    return errors;
  }
  for (const key of Object.keys(value)) {
    if (key !== "draft" && key !== "meta" && key !== "errors") {
      addError(
        errors,
        "invalid_data_model",
        `data.${key}`,
        "Data model allows only draft, meta, and errors",
      );
    }
  }
  let rules = fields;
  const draft = value.draft;
  if (isRecord(draft) && Object.keys(rules).length === 0) {
    const inferred: Record<string, FieldRule> = {};
    for (const [key, entry] of Object.entries(draft)) {
      if (!FIELD_KEY.test(key)) {
        addError(
          errors,
          "invalid_data_value",
          `data.draft.${key}`,
          "Draft keys must match the field-key pattern",
        );
        continue;
      }
      if (typeof entry === "string") {
        inferred[key] = { kind: "text", required: false };
      } else if (Array.isArray(entry)) {
        inferred[key] = { kind: "choice", required: false };
      } else {
        addError(
          errors,
          "invalid_data_value",
          `data.draft.${key}`,
          "Draft values must be strings or arrays",
        );
      }
    }
    rules = inferred;
  }
  if (!isRecord(draft)) {
    addError(errors, "invalid_data_model", "data.draft", "draft must be an object");
  } else {
    for (const [key, rule] of Object.entries(rules)) {
      if (!(key in draft)) {
        addError(
          errors,
          "missing_data_value",
          `data.draft.${key}`,
          `draft.${key} must be initialized`,
        );
        continue;
      }
      const entry = draft[key];
      if (rule.kind === "text") {
        if (
          typeof entry !== "string" ||
          entry.length > LIMITS.maxFieldValueLength ||
          !isSafeText(entry, LIMITS.maxFieldValueLength)
        ) {
          addError(
            errors,
            "invalid_data_value",
            `data.draft.${key}`,
            "Text field values must be safe strings",
          );
        }
      } else if (
        !Array.isArray(entry) ||
        entry.length > 1 ||
        entry.some(
          (candidate) =>
            typeof candidate !== "string" ||
            !isSafeText(candidate, LIMITS.maxFieldValueLength),
        )
      ) {
        addError(
          errors,
          "invalid_data_value",
          `data.draft.${key}`,
          "Choice values must be a single-item string array",
        );
      }
    }
    for (const key of Object.keys(draft)) {
      if (!rules[key]) {
        addError(
          errors,
          "unexpected_data_value",
          `data.draft.${key}`,
          `Field '${key}' is not bound by a generated input`,
        );
      }
    }
  }

  const meta = value.meta;
  if (!isRecord(meta)) {
    addError(errors, "invalid_data_model", "data.meta", "meta must be an object");
  } else {
    for (const key of Object.keys(meta)) {
      if (key !== "revision" && key !== "status") {
        addError(
          errors,
          "invalid_data_model",
          `data.meta.${key}`,
          "meta allows only revision and status",
        );
      }
    }
    if (!Number.isInteger(meta.revision) || (meta.revision as number) < 0) {
      addError(
        errors,
        "invalid_data_model",
        "data.meta.revision",
        "meta.revision must be a non-negative integer",
      );
    }
    if (
      typeof meta.status !== "string" ||
      !(REQUEST_STATUSES as readonly string[]).includes(meta.status)
    ) {
      addError(
        errors,
        "invalid_data_model",
        "data.meta.status",
        "meta.status is invalid",
      );
    }
  }

  if (value.errors !== undefined) {
    for (const error of validateErrorData(value.errors)) {
      addError(
        errors,
        error.code === "invalid_data_value" ? "invalid_data_model" : error.code,
        `data.${error.path}`,
        error.message,
      );
    }
  }

  return errors;
}

export function validateScopedDataPath(
  path: string,
  value: unknown,
): SurfaceValidationError[] {
  const errors: SurfaceValidationError[] = [];
  if (!path.startsWith("/") || path.includes("..")) {
    addError(errors, "invalid_data_path", "updateDataModel.path", "Invalid data path");
    return errors;
  }
  const draft = DRAFT_PATH.exec(path);
  if (draft?.[1] && FIELD_KEY.test(draft[1])) {
    const allowed =
      typeof value === "string" ||
      (Array.isArray(value) &&
        value.length <= 1 &&
        value.every(
          (entry) =>
            typeof entry === "string" &&
            isSafeText(entry, LIMITS.maxFieldValueLength),
        ));
    if (!allowed) {
      addError(
        errors,
        "invalid_data_value",
        `updateDataModel.${path}`,
        "Draft values must be strings or single-item string arrays",
      );
    }
    return errors;
  }
  if (path === "/meta/revision") {
    if (!Number.isInteger(value) || (value as number) < 0) {
      addError(
        errors,
        "invalid_data_value",
        "updateDataModel./meta/revision",
        "revision must be a non-negative integer",
      );
    }
    return errors;
  }
  if (path === "/meta/status") {
    if (
      typeof value !== "string" ||
      !(REQUEST_STATUSES as readonly string[]).includes(value)
    ) {
      addError(
        errors,
        "invalid_data_value",
        "updateDataModel./meta/status",
        "status is invalid",
      );
    }
    return errors;
  }
  if (path === "/errors") {
    for (const error of validateErrorData(value)) {
      addError(
        errors,
        error.code,
        `updateDataModel.${error.path}`,
        error.message,
      );
    }
    return errors;
  }
  if (path === "/errors/summary") {
    if (typeof value !== "string" || !isSafeText(value, LIMITS.maxTextLength)) {
      addError(
        errors,
        "invalid_data_value",
        "updateDataModel./errors/summary",
        "Error summary must be a bounded safe string",
      );
    }
    return errors;
  }
  const errorField = /^\/errors\/fields\/([a-z][a-z0-9_]{0,31})$/.exec(path);
  if (errorField) {
    if (typeof value !== "string" || !isSafeText(value, 300)) {
      addError(
        errors,
        "invalid_data_value",
        `updateDataModel.${path}`,
        "Field errors must be bounded safe strings",
      );
    }
    return errors;
  }
  addError(
    errors,
    "invalid_data_path",
    `updateDataModel.${path}`,
    "Only /draft/<fieldKey>, /meta/revision, /meta/status, and /errors are host-approved paths",
  );
  return errors;
}

export function createSurfaceOperation(
  surfaceId: string,
  catalogId: string = CATALOG_ID,
): Record<string, unknown> {
  return { version: "v0.9", createSurface: { surfaceId, catalogId } };
}

export function updateComponentsOperation(
  surfaceId: string,
  components: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return { version: "v0.9", updateComponents: { surfaceId, components } };
}

export function updateDataModelOperation(
  surfaceId: string,
  path: string,
  value: unknown,
): Record<string, unknown> {
  return { version: "v0.9", updateDataModel: { surfaceId, path, value } };
}

export function deleteSurfaceOperation(
  surfaceId: string,
): Record<string, unknown> {
  return { version: "v0.9", deleteSurface: { surfaceId } };
}

export function operationsEnvelope(
  operations: Array<Record<string, unknown>>,
): string {
  return JSON.stringify({ a2ui_operations: operations });
}

export function operationSurfaceId(
  operation: Record<string, unknown>,
): string | undefined {
  for (const key of OPERATION_KEYS) {
    const value = operation[key];
    if (isRecord(value) && typeof value.surfaceId === "string") {
      return value.surfaceId;
    }
  }
  return undefined;
}

export function operationKind(
  operation: Record<string, unknown>,
): string {
  return Object.keys(operation).find((key) => key !== "version") ?? "unknown";
}

const envelopeSchema = z
  .object({
    a2ui_operations: z.array(z.unknown()).min(1).max(LIMITS.maxOperations),
  })
  .strict();

function parseEnvelope(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(value) ? value : null;
}

export function extractOperations(
  value: unknown,
): Array<Record<string, unknown>> {
  const envelope = parseEnvelope(value);
  if (!envelope) {
    return [];
  }
  const operations = envelope.a2ui_operations;
  return Array.isArray(operations) ? operations.filter(isRecord) : [];
}

export function validateOperationEnvelope(
  value: unknown,
  options: { expectedSurfaceId?: string; fields?: Record<string, FieldRule> } = {},
): OperationEnvelopeValidation {
  const errors: SurfaceValidationError[] = [];
  const envelope = parseEnvelope(value);
  if (!envelope) {
    addError(errors, "invalid_envelope", "envelope", "Envelope must be a JSON object");
    return { valid: false, errors, fields: {}, operations: [] };
  }
  const parsed = envelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    addError(
      errors,
      "invalid_envelope",
      "envelope",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
    return { valid: false, errors, fields: options.fields ?? {}, operations: [] };
  }

  const operations = parsed.data.a2ui_operations.filter(isRecord);
  if (operations.length !== parsed.data.a2ui_operations.length) {
    addError(
      errors,
      "invalid_envelope",
      "a2ui_operations",
      "Every operation must be an object",
    );
  }

  let fields = options.fields ?? {};
  let sawCreate = false;
  let sawDelete = false;
  const surfaces = new Set<string>();

  operations.forEach((operation, index) => {
    const path = `a2ui_operations[${String(index)}]`;
    if (sawDelete) {
      addError(
        errors,
        "invalid_operation_order",
        path,
        "No operation may follow deleteSurface",
      );
    }
    if (operation.version !== "v0.9") {
      addError(
        errors,
        "invalid_version",
        `${path}.version`,
        "A2UI operations must use version v0.9",
      );
    }
    const keys = Object.keys(operation).filter((key) => key !== "version");
    if (keys.length !== 1 || !(OPERATION_KEYS as readonly string[]).includes(keys[0] ?? "")) {
      addError(
        errors,
        "invalid_operation",
        path,
        "Operation must contain exactly one A2UI operation key",
      );
      return;
    }
    const kind = keys[0];
    const body = operation[kind ?? ""];
    if (!isRecord(body)) {
      addError(errors, "invalid_operation", `${path}.${kind}`, "Operation body must be an object");
      return;
    }
    const surfaceId = body.surfaceId;
    if (typeof surfaceId !== "string" || surfaceId.length === 0) {
      addError(
        errors,
        "invalid_surface",
        `${path}.${kind}.surfaceId`,
        "surfaceId must be a non-empty string",
      );
    } else {
      surfaces.add(surfaceId);
      if (
        options.expectedSurfaceId !== undefined &&
        surfaceId !== options.expectedSurfaceId
      ) {
        addError(
          errors,
          "surface_mismatch",
          `${path}.${kind}.surfaceId`,
          `Expected surface ${options.expectedSurfaceId}`,
        );
      }
    }

    if (kind === "createSurface") {
      const keys = Object.keys(body).sort();
      if (keys.join(",") !== "catalogId,surfaceId") {
        addError(
          errors,
          "invalid_operation",
          `${path}.createSurface`,
          "createSurface must contain exactly surfaceId and catalogId",
        );
      }
      if (body.catalogId !== CATALOG_ID) {
        addError(
          errors,
          "catalog_mismatch",
          `${path}.createSurface.catalogId`,
          `catalogId must be ${CATALOG_ID}`,
        );
      }
      if (sawCreate) {
        addError(
          errors,
          "duplicate_create",
          `${path}.createSurface`,
          "Only one createSurface is allowed per envelope",
        );
      }
      sawCreate = true;
      if (index !== 0) {
        addError(
          errors,
          "invalid_operation_order",
          `${path}.createSurface`,
          "createSurface must be the first operation",
        );
      }
    } else if (kind === "updateComponents") {
      const keys = Object.keys(body).sort();
      if (keys.join(",") !== "components,surfaceId") {
        addError(
          errors,
          "invalid_operation",
          `${path}.updateComponents`,
          "updateComponents must contain exactly surfaceId and components",
        );
      }
      const result = validateComponentTree(body.components);
      fields = { ...fields, ...result.fields };
      for (const error of result.errors) {
        addError(errors, error.code, `${path}.updateComponents.${error.path}`, error.message);
      }
    } else if (kind === "updateDataModel") {
      const keys = Object.keys(body).sort();
      if (keys.join(",") !== "path,surfaceId,value") {
        addError(
          errors,
          "invalid_operation",
          `${path}.updateDataModel`,
          "updateDataModel must contain exactly surfaceId, path, and value",
        );
      }
      if (typeof body.path !== "string") {
        addError(
          errors,
          "invalid_data_path",
          `${path}.updateDataModel.path`,
          "path must be a string",
        );
        return;
      }
      if (body.path === "/") {
        for (const error of validateDataModel(body.value, fields)) {
          addError(
            errors,
            error.code,
            `${path}.updateDataModel.${error.path}`,
            error.message,
          );
        }
      } else {
        for (const error of validateScopedDataPath(body.path, body.value)) {
          addError(
            errors,
            error.code,
            `${path}.updateDataModel.${error.path}`,
            error.message,
          );
        }
      }
    } else if (kind === "deleteSurface") {
      sawDelete = true;
      const keys = Object.keys(body).sort();
      if (keys.join(",") !== "surfaceId") {
        addError(
          errors,
          "invalid_operation",
          `${path}.deleteSurface`,
          "deleteSurface must contain exactly surfaceId",
        );
      }
    }
  });

  if (surfaces.size > 1) {
    addError(
      errors,
      "multiple_surfaces",
      "a2ui_operations",
      "All operations in one envelope must target the same surface",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    fields,
    operations,
  };
}

export function componentBindingPaths(
  components: Array<Record<string, unknown>>,
): string[] {
  const paths = new Set<string>();
  for (const component of components) {
    const type = component.component;
    if (type === "TextField" || type === "ChoicePicker") {
      const valuePath = dynamicPath(component.value);
      if (valuePath) {
        paths.add(valuePath);
      }
    }
    if (type === "Text") {
      const textPath = dynamicPath(component.text);
      if (textPath) {
        paths.add(textPath);
      }
    }
    if (type === "Button" && isRecord(component.action) && isRecord(component.action.event)) {
      const context = component.action.event.context;
      if (isRecord(context)) {
        for (const value of Object.values(context)) {
          const path = dynamicPath(value);
          if (path) {
            paths.add(path);
          }
        }
      }
    }
  }
  return [...paths].sort();
}

export function componentTypes(
  components: Array<Record<string, unknown>>,
): AllowedComponent[] {
  const types = new Set<AllowedComponent>();
  for (const component of components) {
    const type = component.component;
    if (
      typeof type === "string" &&
      (ALLOWED_COMPONENTS as readonly string[]).includes(type)
    ) {
      types.add(type as AllowedComponent);
    }
  }
  return [...types].sort();
}
