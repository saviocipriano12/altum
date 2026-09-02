import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("outbound campaigns support behavioral audiences instead of only imported lists", async () => {
  const campaigns = await source("lib/server/outbound-campaigns.ts");
  const dispatches = await source("app/cliente/painel/disparos/page.tsx");

  assert.match(campaigns, /"no_response" \| "inactive" \| "proposal_stalled" \| "new_inbound"/);
  assert.match(campaigns, /export function matchesOutboundAudienceBehavior/);
  assert.match(campaigns, /loadOutboundAudienceLeads/);
  assert.match(dispatches, /Reativar sem resposta/);
  assert.match(dispatches, /Proposta parada/);
});

test("preview, queue and execution all enforce WhatsApp campaign frequency", async () => {
  const campaigns = await source("lib/server/outbound-campaigns.ts");

  assert.match(campaigns, /evaluateWhatsAppBulkCompliance/);
  assert.match(campaigns, /blockedByFrequency/);
  assert.match(campaigns, /const compliance = evaluateWhatsAppBulkCompliance\(item\.data\);/);
  assert.match(campaigns, /return compliance\.allowed && Boolean\(normalizePhone/);
});

