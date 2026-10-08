import test from "node:test";
import assert from "node:assert/strict";
import { avatarReferenceStatus } from "../lib/server/agent-os/avatar-reference-state.ts";

test("avatar só fica pronto para âncora quando foto e voz privadas existem", () => {
  assert.equal(avatarReferenceStatus(["visual"]), "reference_incomplete");
  assert.equal(avatarReferenceStatus(["voice"]), "reference_incomplete");
  assert.equal(avatarReferenceStatus(["visual", "voice"]), "anchor_required");
});
