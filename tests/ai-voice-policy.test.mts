import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldPlanAudioResponse,
  shouldProactivelySendVoiceReply,
} from "../lib/ai-voice-policy.ts";

const availableVoice = {
  preference: null,
  voiceReplyEnabled: true,
  shouldUseWhatsApp: true,
  serviceWindowClosed: false,
  hasChannel: true,
  hasLeadPhone: true,
} as const;

test("modo sempre realmente planeja e envia voz", () => {
  assert.equal(
    shouldPlanAudioResponse({
      preference: null,
      voiceReplyEnabled: true,
      voiceReplyMode: "always",
      inboundMessageType: "text",
    }),
    true
  );
  assert.deepEqual(
    shouldProactivelySendVoiceReply({ ...availableVoice, voiceReplyMode: "always", inboundMessageType: "text" }),
    { shouldSend: true, reason: "voice_always_mode" }
  );
});

test("preferencia explicita por texto vence qualquer modo de voz", () => {
  assert.deepEqual(
    shouldProactivelySendVoiceReply({ ...availableVoice, preference: "text", voiceReplyMode: "always" }),
    { shouldSend: false, reason: "lead_prefers_text" }
  );
});

test("audio recebido ou preferido recebe resposta em audio no modo inteligente", () => {
  assert.equal(
    shouldProactivelySendVoiceReply({ ...availableVoice, voiceReplyMode: "smart", inboundMessageType: "audio" }).shouldSend,
    true
  );
  assert.equal(
    shouldProactivelySendVoiceReply({ ...availableVoice, preference: "audio", voiceReplyMode: "smart" }).shouldSend,
    true
  );
});

test("voz falha de forma segura fora da janela ou sem canal", () => {
  assert.deepEqual(
    shouldProactivelySendVoiceReply({ ...availableVoice, voiceReplyMode: "always", serviceWindowClosed: true }),
    { shouldSend: false, reason: "voice_not_available" }
  );
  assert.equal(
    shouldProactivelySendVoiceReply({ ...availableVoice, voiceReplyMode: "always", hasChannel: false }).shouldSend,
    false
  );
});
