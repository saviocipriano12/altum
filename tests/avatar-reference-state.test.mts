import test from "node:test";
import assert from "node:assert/strict";
import { avatarReferenceStatus } from "../lib/server/agent-os/avatar-reference-state.ts";

test("avatar fica pronto para âncora visual com referência visual autorizada", () => {
  assert.equal(avatarReferenceStatus(["visual"]), "anchor_required");
  assert.equal(avatarReferenceStatus(["voice"]), "reference_incomplete");
  assert.equal(avatarReferenceStatus(["visual", "voice"]), "anchor_required");
});
