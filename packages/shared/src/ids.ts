export function surfaceIdForThread(threadId: string): string {
  const safe = threadId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 80);
  return `surface-${safe || "unknown"}`;
}
