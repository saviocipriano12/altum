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

const ALLOWED_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);
const DEFAULT_MAX_VOICE_CHARS = 760;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1024;

function normalizeVoice(value: unknown) {
  const normalized = cleanText(value, 40).toLowerCase();
  return ALLOWED_VOICES.has(normalized) ? normalized : "alloy";
}

function storageBucketName() {
  return String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
}

function normalizeVoiceText(value: string) {
  return cleanText(value, 3200)
    .replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link enviado na conversa ")
    .replace(/[`*_>#]+/g, "")
    .replace(/\s*(?:-|\u2022)\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampVoiceText(text: string, maxChars: number) {
  const normalized = normalizeVoiceText(text);
  const limit = Math.max(260, Math.min(1400, Math.floor(Number(maxChars || DEFAULT_MAX_VOICE_CHARS))));
  if (normalized.length <= limit) return normalized;

  const slice = normalized.slice(0, limit);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
  const base = sentenceEnd > 220 ? slice.slice(0, sentenceEnd + 1) : slice.replace(/\s+\S*$/, "");
  return `${base.trim()} Te deixei o essencial neste audio e sigo por aqui se quiser aprofundar.`;
}

export function prepareAltumVoiceReplyText(text: string, maxChars = DEFAULT_MAX_VOICE_CHARS) {
  return clampVoiceText(text, maxChars);
}

function isLikelyMp3(buffer: Buffer) {
  if (buffer.length < MIN_AUDIO_BYTES) return false;
  const id3Header = buffer.subarray(0, 3).toString("ascii") === "ID3";
  const frameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  return id3Header || frameSync;
}

function assertValidSpeechBuffer(buffer: Buffer, contentType: string) {
  if (buffer.length < MIN_AUDIO_BYTES) {
    throw new Error("voice_synthesis_empty_audio");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("voice_audio_too_large");
  }
  if (!isLikelyMp3(buffer)) {
    const preview = buffer.subarray(0, 180).toString("utf8").replace(/\s+/g, " ").trim();
    const detail = preview ? `:${preview.slice(0, 120)}` : "";
    throw new Error(`voice_synthesis_invalid_audio${detail}`);
  }
  if (contentType && !contentType.includes("audio") && !contentType.includes("octet-stream")) {
    throw new Error(`voice_synthesis_invalid_content_type:${contentType}`);
  }
}

export async function synthesizeAltumSpeech(text: string, voice?: string) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const normalizedText = prepareAltumVoiceReplyText(text, 1400);
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
      voice: normalizeVoice(voice),
      response_format: "mp3",
      input: normalizedText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`voice_synthesis_http_${response.status}${detail ? `:${cleanText(detail, 160)}` : ""}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assertValidSpeechBuffer(buffer, response.headers.get("content-type") || "");
  return buffer;
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
    size: input.buffer.length,
  };
}

export async function sendAltumVoiceReply(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  text: string;
  tenantId: string;
  chatId: string;
  voice?: string;
  maxChars?: number;
}) {
  const voiceText = prepareAltumVoiceReplyText(input.text, input.maxChars);
  const buffer = await synthesizeAltumSpeech(voiceText, input.voice);

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

  let stored: Awaited<ReturnType<typeof storeAltumSpeech>> | null = null;
  try {
    stored = await storeAltumSpeech({
      tenantId: input.tenantId,
      chatId: input.chatId,
      buffer,
    });
  } catch (storageError) {
    console.warn(
      "Audio da IA enviado ao WhatsApp sem salvar no Storage:",
      storageError instanceof Error ? storageError.message : "voice_storage_unavailable"
    );
  }

  return {
    path: stored?.path || null,
    signedUrl: stored?.signedUrl || null,
    contentType: stored?.contentType || "audio/mpeg",
    size: stored?.size || buffer.length,
    text: voiceText,
    voice: normalizeVoice(input.voice),
    mediaId: upload.mediaId,
    metaMessageId: String((sent as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id || "").trim() || null,
  };
}
