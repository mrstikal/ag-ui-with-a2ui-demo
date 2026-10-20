export const CATALOG_ID = "arb://catalog/request-builder.v1";

export const ALLOWED_COMPONENTS = [
  "Text",
  "Column",
  "Card",
  "TextField",
  "ChoicePicker",
  "Button",
] as const;

export type AllowedComponent = (typeof ALLOWED_COMPONENTS)[number];

export const REQUIRED_FIELD_PATHS = ["/draft/title", "/draft/details"] as const;

export const ACTION_REVIEW_REQUEST = "reviewRequest";
export const ACTION_DISCARD_SURFACE = "discardSurface";

export const ALLOWED_ACTION_NAMES = [
  ACTION_REVIEW_REQUEST,
  ACTION_DISCARD_SURFACE,
] as const;

export type AllowedActionName = (typeof ALLOWED_ACTION_NAMES)[number];

export const REVIEW_BUTTON_ID = "review";
export const DISCARD_BUTTON_ID = "discard";
export const HOST_VALIDATION_COMPONENT_ID = "host_validation";
export const HOST_STATUS_COMPONENT_ID = "host_status";

export const HOST_COMPONENT_IDS = [
  REVIEW_BUTTON_ID,
  DISCARD_BUTTON_ID,
  HOST_VALIDATION_COMPONENT_ID,
  HOST_STATUS_COMPONENT_ID,
  "review_label",
  "discard_label",
  "heading",
  "intro",
  "root",
] as const;

export const REQUEST_STATUSES = [
  "editing",
  "review",
  "submitted-demo",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const FIELD_KEY_PATTERN = "^[a-z][a-z0-9_]{0,31}$";

export const LIMITS = {
  maxComponents: 80,
  maxFields: 12,
  maxDepth: 6,
  maxOptions: 8,
  maxLabelLength: 100,
  maxTextLength: 2_000,
  maxFieldValueLength: 2_000,
  maxPromptLength: 1_000,
  maxOperations: 12,
} as const;
