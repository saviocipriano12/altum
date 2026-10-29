/** QA is opt-in and must never redirect a real Firebase project to an emulator. */
export function resolveFirebaseEmulatorConfig(input: {
  enabled: boolean; projectId: string; hostname: string; production: boolean;
}) {
  if (!input.enabled) return null;
  if (input.production || input.projectId !== "demo-altum-qa-lab"
    || !["localhost", "127.0.0.1", "[::1]"].includes(input.hostname)) {
    throw new Error("Firebase QA requires development, loopback and the isolated demo project.");
  }
  return { host: "127.0.0.1", authPort: 9099, firestorePort: 8080, storagePort: 9199 };
}
