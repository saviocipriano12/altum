import assert from "node:assert/strict";
import test from "node:test";
import { autonomousApplyError } from "../lib/mcp/apply-error.ts";

test("maps WhatsApp apply failures to actionable safe codes", () => {
  assert.equal(autonomousApplyError(409, { error: "A API oficial exige templateName aprovado para iniciar uma conversa nova." }).code, "WHATSAPP_TEMPLATE_REQUIRED");
  assert.equal(autonomousApplyError(409, { error: "O lead nao possui telefone valido." }).code, "LEAD_PHONE_INVALID");
  assert.equal(autonomousApplyError(409, { error: "Canal WhatsApp ativo nao configurado para esta empresa." }).code, "WHATSAPP_CHANNEL_UNAVAILABLE");
  assert.equal(autonomousApplyError(502, { code: "WHATSAPP_PROVIDER_ERROR" }).code, "WHATSAPP_PROVIDER_ERROR");
  assert.equal(autonomousApplyError(404, {}).code, "NOT_FOUND");
});
