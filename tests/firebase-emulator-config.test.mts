import test from "node:test";
import assert from "node:assert/strict";
import { resolveFirebaseEmulatorConfig } from "../lib/firebase-emulator-config.ts";

const safe = { enabled: true, projectId: "demo-altum-qa-lab", hostname: "127.0.0.1", production: false };
test("normal Firebase configuration never opts in implicitly", () => {
  assert.equal(resolveFirebaseEmulatorConfig({ ...safe, enabled: false, projectId: "real-project", production: true }), null);
});
test("local QA uses fixed loopback emulator ports", () => {
  assert.deepEqual(resolveFirebaseEmulatorConfig(safe), { host: "127.0.0.1", authPort: 9099, firestorePort: 8080, storagePort: 9199 });
});
test("QA rejects production builds, real projects and remote browsers", () => {
  for (const input of [{ ...safe, production: true }, { ...safe, projectId: "real-project" }, { ...safe, hostname: "altumia.com.br" }]) {
    assert.throws(() => resolveFirebaseEmulatorConfig(input), /QA requires/);
  }
});
