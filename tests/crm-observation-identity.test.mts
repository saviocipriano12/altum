import assert from "node:assert/strict";
import test from "node:test";
import { crmObservationIdentity } from "../lib/crm-observation-identity.ts";
test("record identities retain exact bytes and the entire long channel identifier", () => {
  const input = { tenantId: "tenant", chatId: "chat", messageId: "m".repeat(300) };
  assert.deepEqual(crmObservationIdentity(input), input);
  for (const field of ["tenantId", "chatId", "messageId"] as const) {
    for (const value of ["", ` ${input[field]}`, `${input[field]} `, "..", "other/path", "line\nbreak", "\u0000", "x".repeat(field === "messageId" ? 301 : 181)])
      assert.equal(crmObservationIdentity({ ...input, [field]: value }), null);
  }
});
