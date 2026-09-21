// Storage can be unavailable in private browsing or restricted WebViews.
// Preferences must never prevent the client app from opening.
export function readClientPreference(key: string): string | null {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); }
  catch { return null; }
}

export function writeClientPreference(key: string, value: string) {
  try { window.localStorage.setItem(key, value); }
  catch { /* The app remains usable without persistent preferences. */ }
}

export function removeClientPreference(key: string) {
  try { window.localStorage.removeItem(key); }
  catch { /* Removal is best effort in restricted browsers. */ }
}
