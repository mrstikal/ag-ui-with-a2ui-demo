import { randomUUID } from "node:crypto";
import { surfaceIdForThread as sharedSurfaceIdForThread } from "@arb/shared";

export function surfaceIdForThread(threadId: string | undefined): string {
  return sharedSurfaceIdForThread(threadId?.trim() || randomUUID());
}

export function draftSurfaceIdForThread(threadId: string): string {
  return `live-draft-${surfaceIdForThread(threadId)}`;
}
