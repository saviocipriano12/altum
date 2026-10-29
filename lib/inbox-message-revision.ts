/** HTTP responses can finish out of order while realtime is also updating a bubble. */
export function mergeMessageRevision<T extends { revision?: string }>(previous: T | undefined, incoming: T): T {
  if (previous?.revision && incoming.revision && previous.revision > incoming.revision) return previous;
  return { ...previous, ...incoming };
}
