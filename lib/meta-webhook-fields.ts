/** Both messaging channels may share one Page. Never replace the sibling's subscriptions. */
export function mergeMetaWebhookFields(existing: unknown, requested: string) {
  const values = Array.isArray(existing) ? existing : [];
  return [...new Set([...values, ...requested.split(",")].filter((value): value is string =>
    typeof value === "string" && /^[a-z_]+$/.test(value.trim())).map(value => value.trim()))].sort().join(",");
}
