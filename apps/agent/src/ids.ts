import { surfaceIdForThread as sharedSurfaceIdForThread } from "@arb/shared";

export function surfaceIdForThread(threadId: string | undefined): string {
  const trimmed = threadId?.trim();
  if (!trimmed) {
    throw new Error("A thread ID is required to derive a surface ID.");
  }
  return sharedSurfaceIdForThread(trimmed);
}

export function draftSurfaceIdForThread(threadId: string): string {
  return `live-draft-${surfaceIdForThread(threadId)}`;
}
