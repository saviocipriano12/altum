import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("campaign dispatch delegates every recipient to the durable delivery protocol", async () => {
  const source = await readFile(new URL("../lib/server/outbound-campaigns.ts", import.meta.url), "utf8");
  assert.match(source, /await deliverCampaignRecipient\(/);
  assert.doesNotMatch(source, /\b(?:sendTenantChatMediaLink|sendTenantChatText|sendTenantChatTemplate|sendWhatsAppText)\(/);
});

test("campaign media retains the provider ID and binds the confirmed message transactionally", async () => {
  const worker = await readFile(new URL("../lib/server/chat-outbound.ts", import.meta.url), "utf8");
  const branch = worker.slice(worker.indexOf('if (claimed.kind === "campaign_delivery")'), worker.indexOf('if (claimed.kind === "handoff_alert")'));
  assert.match(branch, /await sendTenantChatMediaLink\(/);
  assert.match(branch, /externalId = sent.metaMessageId/);
  assert.match(branch, /await persistCampaignRecipientResult\(/);
  const receipt = await readFile(new URL("../lib/server/campaign-recipient-contract.ts", import.meta.url), "utf8");
  const persist = receipt.slice(receipt.indexOf("export async function persistCampaignRecipientResult("));
  assert.match(persist, /await adminDb.runTransaction\(/);
  assert.match(persist, /metaMessageId: message.data\(\)!\.metaMessageId/);
  assert.match(persist, /channelPhoneNumberId: message.data\(\)!\.channelPhoneNumberId/);
  assert.match(persist, /await appendCampaignDeliveryAcknowledgement\(tx, deliveryRef/);
  assert.match(persist, /localMessageId: data.messageId/);
});
