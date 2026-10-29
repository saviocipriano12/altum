// API sync builds the same JSON payloads received from webhooks. Optional
// GraphQL fields must be omitted, not stored as undefined in Firestore.
export function commerceJsonPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}
