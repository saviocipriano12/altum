import { adminStorage } from "@/app/lib/server/firebase-admin";
import {
  sendMetaAudioMessage,
  uploadWhatsAppMedia,
  type WhatsAppChannelConfig,
} from "@/app/lib/server/whatsapp-channel";

function cleanText(value: unknown, max = 1800) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function storageBucketName() {
  return String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
}

export async function synthesizeAltumSpeech(text: string) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const normalizedText = cleanText(text, 2400);
  if (!apiKey || !normalizedText) {
    throw new Error("voice_synthesis_unavailable");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "alloy",
      format: "mp3",
      input: normalizedText,
    }),
  });

  if (!response.ok) {
    throw new Error(`voice_synthesis_http_${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function storeAltumSpeech(input: {
  tenantId: string;
  chatId: string;
  buffer: Buffer;
}) {
  const bucketName = storageBucketName();
  if (!bucketName) {
    throw new Error("storage_bucket_missing");
  }

  const path = `ai-voice/${input.tenantId}/${input.chatId}/reply_${Date.now()}.mp3`;
  const file = adminStorage.bucket(bucketName).file(path);
  await file.save(input.buffer, {
    metadata: {
      contentType: "audio/mpeg",
      cacheControl: "public,max-age=31536000",
    },
    resumable: false,
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: "2035-01-01",
  });

  return {
    path,
    signedUrl,
    contentType: "audio/mpeg",
  };
}

export async function sendAltumVoiceReply(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  text: string;
  tenantId: string;
  chatId: string;
}) {
  const buffer = await synthesizeAltumSpeech(input.text);
  const stored = await storeAltumSpeech({
    tenantId: input.tenantId,
    chatId: input.chatId,
    buffer,
  });
  const upload = await uploadWhatsAppMedia({
    channel: input.channel,
    buffer,
    filename: `altum_reply_${Date.now()}.mp3`,
    contentType: "audio/mpeg",
  });
  const sent = await sendMetaAudioMessage({
    channel: input.channel,
    to: input.to,
    mediaId: upload.mediaId,
  });

  return {
    ...stored,
    mediaId: upload.mediaId,
    metaMessageId: String((sent as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id || "").trim() || null,
  };
}
