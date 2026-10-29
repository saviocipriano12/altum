/** Only unseen IDs from an incremental newer page count; edits/retries never do. */
export function collectInboxNewMessageIds(
  existingIds: readonly string[], incomingIds: readonly string[], pendingIds: readonly string[], followingLatest: boolean
) {
  if (followingLatest) return [];
  const existing = new Set(existingIds);
  return [...new Set([...pendingIds, ...incomingIds.filter((id) => id && !existing.has(id))])];
}
