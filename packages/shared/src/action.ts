export const LOG_A2UI_EVENT_TOOL_NAME = "log_a2ui_event";

export interface ForwardedActionPayload {
  name: string;
  surfaceId: string;
  sourceComponentId?: string;
  context: Record<string, unknown>;
}

export function redactActionContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const redacted = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(context).slice(0, 32)) {
    if (
      key === "revision" &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      redacted[key] = value;
      continue;
    }
    redacted[key] = redactActionValue(value);
  }
  return redacted;
}

function redactActionValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return { type: "string", length: value.length };
  }
  if (Array.isArray(value)) {
    return { type: "array", length: value.length };
  }
  if (typeof value === "number") {
    return { type: "number" };
  }
  if (typeof value === "boolean") {
    return { type: "boolean" };
  }
  if (value === null) {
    return { type: "null" };
  }
  return { type: "object" };
}

const ACTION_PATTERN =
  /^User performed action "([^"]+)" on surface "([^"]+)"(?: \(component: ([^)]+)\))?\. Context: (.*)$/s;

export function parseForwardedActionText(
  content: string,
): ForwardedActionPayload | null {
  const match = ACTION_PATTERN.exec(content);
  if (!match) {
    return null;
  }

  let context: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(match[4] ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    context = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const sourceComponentId = match[3]?.replace(/^"|"$/g, "");

  return {
    name: match[1] ?? "",
    surfaceId: match[2] ?? "",
    ...(sourceComponentId ? { sourceComponentId } : {}),
    context,
  };
}
