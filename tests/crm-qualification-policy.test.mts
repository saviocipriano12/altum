import assert from "node:assert/strict";
import test from "node:test";
import { qualificationEvidenceAllowsUpdate as allows } from "../lib/crm-qualification-policy.ts";

test("manual facts require explicit release and an actual later message occurrence", () => {
  assert.equal(allows({ source: "manual" }, "000000000101:000000001"), false);
  assert.equal(allows({ source: "manual", automaticUpdates: true }, "000000000101:000000001"), false);
  assert.equal(allows({ source: " manual " }, "000000000101:000000001"), false);
  const proof = { source: "manual", automaticUpdates: true, automaticAfter: { seconds: 101, nanoseconds: 123 } };
  assert.equal(allows(proof), false);
  assert.equal(allows(proof, "000000000101:000000123"), false);
  assert.equal(allows(proof, "000000000100:999999999"), false);
  assert.equal(allows(proof, "000000000101:000000124"), true);
});
test("release boundary survives AI replacement and fails closed on malformed provenance", () => {
  const proof = { source: "customer_message", automaticAfter: { _seconds: 101, _nanoseconds: 123 } };
  assert.equal(allows(proof), false);
  assert.equal(allows(proof, "000000000100:000000001"), false);
  assert.equal(allows(proof, "000000000102:000000001"), true);
  assert.equal(allows({ source: "manual", automaticUpdates: true, automaticAfter: {} }, "000000000102:000000001"), false);
  assert.equal(allows({ source: "customer_message" }), true);
});
