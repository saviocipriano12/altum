export type AiResponseFormatPreference = "audio" | "text";
export type AiVoiceReplyMode = "audio_only" | "smart" | "always";

export type AiVoiceReplyDecision = {
  shouldSend: boolean;
  reason:
    | "voice_not_available"
    | "lead_prefers_text"
    | "lead_prefers_audio"
    | "inbound_audio"
    | "voice_audio_only_mode"
    | "voice_always_mode"
    | "smart_requires_audio_signal";
};

export function shouldProactivelySendVoiceReply(input: {
  preference: AiResponseFormatPreference | null;
  voiceReplyEnabled: boolean;
  voiceReplyMode?: AiVoiceReplyMode;
  shouldUseWhatsApp: boolean;
  serviceWindowClosed: boolean;
  hasChannel: boolean;
  hasLeadPhone: boolean;
  inboundMessageType?: string | null;
}): AiVoiceReplyDecision {
  if (
    !input.voiceReplyEnabled ||
    !input.shouldUseWhatsApp ||
    input.serviceWindowClosed ||
    !input.hasChannel ||
    !input.hasLeadPhone
  ) {
    return { shouldSend: false, reason: "voice_not_available" };
  }

  const inboundType = String(input.inboundMessageType || "").trim().toLowerCase();
  if (input.preference === "text") return { shouldSend: false, reason: "lead_prefers_text" };
  if (input.preference === "audio") return { shouldSend: true, reason: "lead_prefers_audio" };
  if (inboundType === "audio") return { shouldSend: true, reason: "inbound_audio" };
  if (input.voiceReplyMode === "always") return { shouldSend: true, reason: "voice_always_mode" };
  if (input.voiceReplyMode === "audio_only") {
    return { shouldSend: false, reason: "voice_audio_only_mode" };
  }

  return { shouldSend: false, reason: "smart_requires_audio_signal" };
}

export function shouldPlanAudioResponse(input: {
  preference: AiResponseFormatPreference | null;
  voiceReplyEnabled: boolean;
  voiceReplyMode?: AiVoiceReplyMode;
  inboundMessageType?: string | null;
}) {
  if (!input.voiceReplyEnabled || input.preference === "text") return false;
  if (input.preference === "audio") return true;
  if (String(input.inboundMessageType || "").trim().toLowerCase() === "audio") return true;
  return input.voiceReplyMode === "always";
}
