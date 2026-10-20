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
