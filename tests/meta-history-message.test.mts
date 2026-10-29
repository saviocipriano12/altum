import test from "node:test";
import assert from "node:assert/strict";
import { parseMetaHistoryMessage } from "../lib/server/messaging/meta-history-message.ts";
import { normalizeCanonicalInboundEvent } from "../lib/server/messaging/inbound-event.ts";
import { mergeMetaWebhookFields } from "../lib/meta-webhook-fields.ts";
const base = { tenantId: "qa", channelId: "ig-channel", channel: "instagram" as const, accountIds: ["ig-business", "page"], contactId: "customer" };
const message = { id: "provider-id", message: "Teste", created_time: new Date(Date.now() - 120000).toISOString(), from: { id: "customer" }, to: { data: [{ id: "ig-business" }] } };
test("history uses the same inbound identity as a real Instagram webhook", () => {
  const history = parseMetaHistoryMessage({ ...base, message })!;
  const event = normalizeCanonicalInboundEvent({ ...base, provider: "meta", providerEventId: message.id, text: message.message,
    senderExternalId: "customer", recipientExternalId: "ig-business", occurredAt: new Date(message.created_time).getTime() });
  assert.ok(event.accepted);assert.equal(history.messageDocumentId, event.event.messageDocumentId);assert.equal(history.sender,"client");
});
test("native outgoing messages are outgoing and foreign participants are rejected", () => {
  assert.equal(parseMetaHistoryMessage({ ...base, message: { ...message, from: { id: "ig-business" }, to: { data: [{ id: "customer" }] } } })?.sender,"agent");
  assert.equal(parseMetaHistoryMessage({ ...base, message: { ...message, from: { id: "foreign" } } }),null);
  assert.equal(parseMetaHistoryMessage({ ...base, message: { ...message, to: { data: [{ id: "foreign" }] } } }),null);
  assert.equal(parseMetaHistoryMessage({ ...base, message: { ...message, id: "" } }),null);
});
test("media-only images and audio remain recoverable, without treating labels as customer text", () => {
  for(const [mime,type] of [["image/jpeg","image"],["audio/ogg","audio"]]) {
    const parsed = parseMetaHistoryMessage({ ...base, message: { ...message, message: "", attachments: { data: [{ mime_type: mime, file_url: "https://scontent.fbcdn.net/test-file" }] } } })!;
    assert.equal(parsed.messageType,type);assert.equal(parsed.attachments[0].url,"https://scontent.fbcdn.net/test-file");assert.match(parsed.text,/recebid/);
  }
});
test("attachment targets cannot reference arbitrary hosts or local services",()=>{
  for(const url of ["http://127.0.0.1/secret","https://foreign.invalid/file","https://fbcdn.net.foreign.invalid/file"]) {
    const parsed=parseMetaHistoryMessage({...base,message:{...message,attachments:{data:[{mime_type:"image/jpeg",file_url:url}]}}})!;
    assert.equal(parsed.attachments[0].url,null);
  }
});

test("provider-unsupported native history remains visible without inventing its original content",()=>{
  const parsed=parseMetaHistoryMessage({...base,message:{...message,message:"",from:{id:"ig-business"},to:{data:[{id:"customer"}]}}})!;
  assert.equal(parsed.sender,"agent");assert.equal(parsed.contentUnavailable,true);
  assert.match(parsed.text,/conteúdo não disponibilizado pela Meta/);assert.equal(parsed.attachments.length,0);
});
test("connecting Instagram keeps Messenger subscription fields already active on the shared Page",()=>{
  assert.equal(mergeMetaWebhookFields(["messages","message_reads","feed"],"messages,messaging_postbacks"),"feed,message_reads,messages,messaging_postbacks");
  assert.equal(mergeMetaWebhookFields(undefined,"messages,messaging_postbacks"),"messages,messaging_postbacks");
});
