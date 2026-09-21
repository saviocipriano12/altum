import test from "node:test";
import assert from "node:assert/strict";
import { parseEvolutionInbound } from "../lib/server/messaging/evolution-webhook.ts";
import { isWhatsAppGroup, resolveWhatsAppRecipient } from "../lib/whatsapp-conversation.ts";
const payload = (participant, pushName = "Pessoa") => ({ event: "messages.upsert", data: { key: { remoteJid: "120363000123@g.us", participant, id: "msg" }, pushName, groupSubject: "Equipe", message: { conversation: "Ola" } } });
test("group identity stays the same across participants", () => {
 const a = parseEvolutionInbound(payload("5511111111111@s.whatsapp.net", "Ana"));
 const b = parseEvolutionInbound(payload("5522222222222@s.whatsapp.net", "Bia"));
 assert.equal(a?.isGroup, true); assert.equal(a?.from, "120363000123@g.us"); assert.equal(a?.from, b?.from);
 assert.equal(a?.groupName, "Equipe"); assert.equal(a?.participantName, "Ana"); assert.notEqual(a?.participantJid, b?.participantJid);
});
test("LID participant remains an identity rather than fabricated telephone", () => {
 const a = parseEvolutionInbound(payload("987654@lid")); assert.equal(a?.participantJid, "987654@lid"); assert.equal(a?.from, "120363000123@g.us");
});
test("individual message remains a phone conversation", () => {
 const p = payload(""); p.data.key.remoteJid = "5511999999999@s.whatsapp.net";
 const a = parseEvolutionInbound(p); assert.equal(a?.isGroup, false); assert.equal(a?.from, "5511999999999"); assert.equal(a?.participantName, "");
});
test("group outbound keeps complete JID and unsupported providers fail", () => {
 const normalize = () => "wrong-recipient";
 assert.equal(resolveWhatsAppRecipient("120363000123@g.us", "evolution", normalize), "120363000123@g.us");
 assert.throws(() => resolveWhatsAppRecipient("120363000123@g.us", "meta_cloud", normalize));
 assert.equal(isWhatsAppGroup("5511999999999@s.whatsapp.net"), false); assert.equal(isWhatsAppGroup("123-456@g.us"), true);
});
