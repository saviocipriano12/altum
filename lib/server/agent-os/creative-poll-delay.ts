/** Pure scheduling helper: safe to test without loading Next/Firebase modules. */
export function creativePollDelayMs(attempt: number) {
  return Math.min(5 * 60_000, Math.max(15_000, 15_000 * 2 ** Math.min(5, Math.max(0, attempt))));
}
