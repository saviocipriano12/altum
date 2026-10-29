import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("WhatsApp e canais Meta aplicam o contexto de campanha ao lead", async () => {
  const [whatsapp, meta] = await Promise.all([
    source("app/api/webhooks/whatsapp/route.ts"),
    source("app/api/webhooks/meta/route.ts"),
  ]);
  assert.match(whatsapp, /applyInboundCampaignAttribution/);
  assert.match(whatsapp, /clickId:\s*cleanString\(referral\.ctwa_clid/);
  assert.match(meta, /applyInboundCampaignAttribution/);
  assert.match(meta, /campaign:\s*inbound\.campaign/);
});

test("conversoes usam outbox com lease, retry, dead letter e identidade estavel", async () => {
  const conversions = await source("lib/server/pixels/conversions.ts");
  assert.match(conversions, /status:\s*"pending"/);
  assert.match(conversions, /status:\s*"processing"/);
  assert.match(conversions, /"dead_letter"\s*:\s*"retry"/);
  assert.match(conversions, /leaseUntil/);
  assert.match(conversions, /retryDelayMs/);
  assert.match(conversions, /eventId:\s*ref\.id/);
  assert.match(conversions, /action_source:[\s\S]*business_messaging/);
});

test("worker operacional existente recupera conversoes a cada minuto", async () => {
  const worker = await source("app/api/internal/jobs/outbound-campaigns/process/route.ts");
  const timer = await source("infra/jobs/altum-job-outbound.timer");
  assert.match(worker, /processConversionDispatchJobs/);
  assert.match(timer, /OnUnitActiveSec=60s/);
});

test("diagnostico diferencia pendencia, retry, dead letter e lease vencido", async () => {
  const health = await source("app/api/tenant/[tenantId]/campaigns/conversions/health/route.ts");
  for (const field of ["pending", "processing", "retrying", "deadLetter", "staleLease"]) {
    assert.match(health, new RegExp(`${field}:`));
  }
});
