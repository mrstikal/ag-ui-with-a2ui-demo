import type { BaseEvent } from "@ag-ui/core";
import {
  componentBindingPaths,
  componentTypes,
  extractOperations,
  operationKind,
  operationSurfaceId,
  type AllowedComponent,
  validateOperationEnvelope,
} from "@arb/shared";

export type SurfaceLifecycle =
  | "none"
  | "building"
  | "retrying"
  | "failed"
  | "painted"
  | "deleted";

export interface SurfaceSummary {
  catalogId: string | null;
  surfaceId: string | null;
  activityMessageId: string | null;
  lifecycle: SurfaceLifecycle;
  operations: string[];
  components: Array<Record<string, unknown>>;
  componentTypes: AllowedComponent[];
  bindingPaths: string[];
  validationErrors: string[];
  updatedAt: string | null;
}

export const EMPTY_SURFACE: SurfaceSummary = {
  catalogId: null,
  surfaceId: null,
  activityMessageId: null,
  lifecycle: "none",
  operations: [],
  components: [],
  componentTypes: [],
  bindingPaths: [],
  validationErrors: [],
  updatedAt: null,
};

export function reduceSurfaceActivity(
  previous: SurfaceSummary,
  event: BaseEvent,
  now: string = new Date().toISOString(),
): SurfaceSummary {
  const record = event as unknown as Record<string, unknown>;
  if (
    record.type !== "ACTIVITY_SNAPSHOT" ||
    record.activityType !== "a2ui-surface"
  ) {
    return previous;
  }

  const content = isRecord(record.content) ? record.content : {};
  const operations = extractOperations(content);
  const messageId =
    typeof record.messageId === "string"
      ? record.messageId
      : previous.activityMessageId;
  const contentErrors = activityErrors(content);

  if (operations.length === 0) {
    const status = content.status;
    const lifecycle: SurfaceLifecycle =
      status === "failed"
        ? "failed"
        : status === "retrying"
          ? "retrying"
          : status === "building"
            ? "building"
            : previous.lifecycle;
    return {
      ...previous,
      activityMessageId: previous.activityMessageId ?? messageId,
      lifecycle,
      operations: [],
      validationErrors: contentErrors,
      updatedAt: now,
    };
  }

  const operationSurface = operations
    .map(operationSurfaceId)
    .find((value): value is string => Boolean(value));
  const surfaceId = operationSurface ?? previous.surfaceId;
  const startsNewSurface = operations.some(
    (operation) =>
      isRecord(operation.createSurface) &&
      typeof operation.createSurface.surfaceId === "string" &&
      operation.createSurface.surfaceId !== previous.surfaceId,
  );
  const baseComponents = startsNewSurface ? [] : previous.components;

  let catalogId = startsNewSurface ? null : previous.catalogId;
  let deleted = false;
  const components = new Map<string, Record<string, unknown>>();
  for (const component of baseComponents) {
    if (isRecord(component) && typeof component.id === "string") {
      components.set(component.id, component);
    }
  }

  for (const operation of operations) {
    const create = operation.createSurface;
    if (isRecord(create)) {
      if (typeof create.catalogId === "string") {
        catalogId = create.catalogId;
      }
    }
    const update = operation.updateComponents;
    if (isRecord(update) && Array.isArray(update.components)) {
      for (const component of update.components) {
        if (isRecord(component) && typeof component.id === "string") {
          components.set(component.id, component);
        }
      }
    }
    if (isRecord(operation.deleteSurface)) {
      deleted = true;
    }
  }

  if (deleted) {
    components.clear();
  }

  const currentComponents = [...components.values()];
  const envelopeValidation = validateOperationEnvelope(
    { a2ui_operations: operations },
    {
      ...(surfaceId ? { expectedSurfaceId: surfaceId } : {}),
    },
  );
  const validationErrors = unique([
    ...contentErrors,
    ...envelopeValidation.errors.map(
      (error) => `${error.path}: ${error.message}`,
    ),
  ]);
  const status = content.status;
  const lifecycle: SurfaceLifecycle = deleted
    ? "deleted"
    : status === "failed"
      ? "failed"
      : status === "retrying"
        ? "retrying"
        : status === "building"
          ? "building"
          : "painted";

  return {
    catalogId,
    surfaceId,
    activityMessageId: messageId,
    lifecycle,
    operations: operations.map(operationKind),
    components: currentComponents,
    componentTypes: componentTypes(currentComponents),
    bindingPaths: componentBindingPaths(currentComponents),
    validationErrors,
    updatedAt: now,
  };
}

function activityErrors(content: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (typeof content.error === "string" && content.error.trim() !== "") {
    errors.push(content.error);
  }
  if (Array.isArray(content.errors)) {
    for (const error of content.errors) {
      if (isRecord(error) && typeof error.message === "string") {
        errors.push(error.message);
      } else if (typeof error === "string") {
        errors.push(error);
      }
    }
  }
  return errors.map((error) => cap(error, 300));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cap(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
