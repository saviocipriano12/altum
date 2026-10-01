import { adminStorage } from "@/app/lib/server/firebase-admin";
import type { WhatsAppChannelConfig } from "@/app/lib/server/whatsapp-channel";
import { getWhatsAppMessagingProvider } from "@/lib/server/messaging/registry";
import { createMobileAudioRenditions } from "@/lib/server/audio-transcode";

function cleanText(value: unknown, max = 1800) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

const ALLOWED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
]);
// Uma nota de voz comercial boa costuma ser uma ideia curta, não uma leitura
// da resposta inteira. O limite padrão mantém a fala perto de 35–45 segundos.
const DEFAULT_MAX_VOICE_CHARS = 460;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1024;

function normalizeVoice(value: unknown) {
  const normalized = cleanText(value, 40).toLowerCase();
  return ALLOWED_VOICES.has(normalized) ? normalized : "marin";
}

function speechModel() {
  return String(process.env.ALTUM_TTS_MODEL || "gpt-4o-mini-tts").trim() || "gpt-4o-mini-tts";
}

function speechResponseFormat() {
  const format = String(process.env.ALTUM_TTS_SOURCE_FORMAT || "wav").trim().toLowerCase();
  return ["mp3", "opus", "wav"].includes(format) ? format : "wav";
}

function speechSpeed() {
  const value = Number(process.env.ALTUM_TTS_SPEED || 0.97);
  return Number.isFinite(value) ? Math.max(0.85, Math.min(1.08, value)) : 0.97;
}

function speechContentType(format: string) {
  if (format === "wav") return "audio/wav";
  return format === "opus" ? "audio/ogg; codecs=opus" : "audio/mpeg";
}

function speechExtension(format: string) {
  if (format === "wav") return "wav";
  return format === "opus" ? "ogg" : "mp3";
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
    .replace(/R\$\s*([\d.,]+)/gi, "$1 reais")
    .replace(/\b(\d+)%/g, "$1 por cento")
    .replace(/\b(?:prezado|prezada)\b/gi, "oi")
    .replace(/\b(?:informamos que|gostaria de informar que)\b/gi, "só pra te avisar:")
    .replace(/\b(?:caso tenha dúvidas|em caso de dúvidas)\b/gi, "se quiser, me chama")
    .replace(/;\s+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildAltumSpeechDirection(text: string) {
  const lower = text.toLocaleLowerCase("pt-BR");
  const context = /\?|quer|prefere|posso/.test(lower)
    ? "Quando fizer uma pergunta, termine com curiosidade leve e espere a resposta, sem soar insistente."
    : /preço|valor|reais|proposta|desconto/.test(lower)
      ? "Ao falar de preço ou proposta, seja claro, tranquilo e seguro, sem tom promocional."
      : /desculp|problema|atras|entendo|compreendo/.test(lower)
        ? "Demonstre empatia discreta e sincera, sem dramatizar."
        : "Converse com proximidade e confiança, como em uma mensagem espontânea para uma única pessoa.";
  return `Fale em português brasileiro natural, com sotaque brasileiro neutro e voz humana de WhatsApp. ${context} Soe como uma pessoa falando com uma única pessoa: calor discreto, ritmo variável e pausas naturais entre ideias. Não cante, não anuncie, não leia como telemarketing e não acrescente nenhuma palavra ao texto. Pronuncie nomes, preços e números com calma. Evite cadência repetitiva, entusiasmo artificial, locução publicitária e final mecânico.`;
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

export function defaultAltumVoiceReplyMaxChars() {
  return DEFAULT_MAX_VOICE_CHARS;
}

function isLikelyMp3(buffer: Buffer) {
  if (buffer.length < MIN_AUDIO_BYTES) return false;
  const id3Header = buffer.subarray(0, 3).toString("ascii") === "ID3";
  const frameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  return id3Header || frameSync;
}

function isLikelyOggOpus(buffer: Buffer) {
  if (buffer.length < MIN_AUDIO_BYTES) return false;
  return buffer.subarray(0, 4).toString("ascii") === "OggS";
}

function isLikelyWav(buffer: Buffer) {
  return buffer.length >= MIN_AUDIO_BYTES && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
}

function wavDurationMs(buffer: Buffer) {
  if (!isLikelyWav(buffer)) return null;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt " && chunkSize >= 12 && chunkStart + 12 <= buffer.length) {
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    }
    if (chunkId === "data") {
      dataSize = Math.min(chunkSize, Math.max(0, buffer.length - chunkStart));
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  return byteRate > 0 && dataSize > 0 ? Math.round((dataSize / byteRate) * 1000) : null;
}

/** A transparent fallback for non-WAV source formats; never presented as measured audio. */
function estimatedSpeechDurationMs(text: string) {
  const words = cleanText(text, 3200).split(/\s+/).filter(Boolean).length;
  return Math.max(1_000, Math.round((words / 2.45) * 1000));
}

/**
 * Returns a duration that is safe to show to an operator. WAV comes from a
 * readable header, whereas any other source intentionally stays an estimate.
 */
export function measureAltumSpeechDuration(
  buffer: Buffer,
  responseFormat: string,
  text: string
): { durationMs: number; durationSource: "measured_wav" | "estimated_text" } {
  const measuredDurationMs = responseFormat === "wav" ? wavDurationMs(buffer) : null;
  return measuredDurationMs
    ? { durationMs: measuredDurationMs, durationSource: "measured_wav" }
    : { durationMs: estimatedSpeechDurationMs(text), durationSource: "estimated_text" };
}

function assertValidSpeechBuffer(buffer: Buffer, contentType: string, responseFormat: string) {
  if (buffer.length < MIN_AUDIO_BYTES) {
    throw new Error("voice_synthesis_empty_audio");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("voice_audio_too_large");
  }
  const valid = responseFormat === "opus" ? isLikelyOggOpus(buffer) : responseFormat === "wav" ? isLikelyWav(buffer) : isLikelyMp3(buffer);
  if (!valid) {
    const preview = buffer.subarray(0, 180).toString("utf8").replace(/\s+/g, " ").trim();
    const detail = preview ? `:${preview.slice(0, 120)}` : "";
    throw new Error(`voice_synthesis_invalid_audio${detail}`);
  }
  if (contentType && !contentType.includes("audio") && !contentType.includes("octet-stream")) {
    throw new Error(`voice_synthesis_invalid_content_type:${contentType}`);
  }
}

export async function synthesizeAltumSpeech(
  text: string,
  voice?: string,
  options?: { allowSourcePlaybackFallback?: boolean }
) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const normalizedText = prepareAltumVoiceReplyText(text, 1400);
  const responseFormat = speechResponseFormat();
  const model = speechModel();
  if (!apiKey || !normalizedText) {
    throw new Error("voice_synthesis_unavailable");
  }

  const instructions = cleanText(process.env.ALTUM_TTS_INSTRUCTIONS, 1200) || buildAltumSpeechDirection(normalizedText);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice: normalizeVoice(voice),
        response_format: responseFormat,
        ...(model.startsWith("gpt-4o-mini-tts") ? { instructions } : {}),
        speed: speechSpeed(),
        input: normalizedText,
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("voice_synthesis_timeout");
    }
    throw new Error("voice_synthesis_network_unavailable");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) throw new Error("voice_synthesis_invalid_credentials");
    if (response.status === 429 && /no credits|billing|quota|insufficient/i.test(detail)) throw new Error("voice_synthesis_no_credits");
    if (response.status === 429) throw new Error("voice_synthesis_rate_limited");
    throw new Error(`voice_synthesis_http_${response.status}${detail ? `:${cleanText(detail, 160)}` : ""}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assertValidSpeechBuffer(buffer, response.headers.get("content-type") || "", responseFormat);
  const { durationMs, durationSource } = measureAltumSpeechDuration(buffer, responseFormat, normalizedText);
  try {
    const mobile = await createMobileAudioRenditions({ source: buffer, extension: speechExtension(responseFormat) });
    return {
      buffer: mobile.whatsappVoice,
      contentType: "audio/ogg; codecs=opus",
      extension: "ogg",
      playbackBuffer: mobile.playback,
      playbackContentType: "audio/mpeg",
      playbackExtension: "mp3",
      sourceContentType: speechContentType(responseFormat),
      model,
      voice: normalizeVoice(voice),
      nativeVoiceReady: true,
      durationMs,
      durationSource,
    };
  } catch (error) {
    if (!options?.allowSourcePlaybackFallback) throw error;

    const sourceContentType = speechContentType(responseFormat);
    const sourceExtension = speechExtension(responseFormat);
    console.warn(
      "Preview de voz usando o audio original porque a conversao nao ficou disponivel:",
      error instanceof Error ? error.message : "voice_transcode_unavailable"
    );
    return {
      buffer,
      contentType: sourceContentType,
      extension: sourceExtension,
      playbackBuffer: buffer,
      playbackContentType: sourceContentType,
      playbackExtension: sourceExtension,
      sourceContentType,
      model,
      voice: normalizeVoice(voice),
      nativeVoiceReady: false,
      durationMs,
      durationSource,
    };
  }
}

export async function storeAltumSpeech(input: {
  tenantId: string;
  chatId: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
}) {
  const bucketName = storageBucketName();
  if (!bucketName) {
    throw new Error("storage_bucket_missing");
  }

  const path = `ai-voice/${input.tenantId}/${input.chatId}/reply_${Date.now()}.${input.extension}`;
  const file = adminStorage.bucket(bucketName).file(path);
  await file.save(input.buffer, {
    metadata: {
      contentType: input.contentType,
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
    contentType: input.contentType,
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
  const speech = await synthesizeAltumSpeech(voiceText, input.voice);

  const sent = await getWhatsAppMessagingProvider(input.channel).sendMedia({
    to: input.to,
    mediaType: "audio",
    buffer: speech.buffer,
    filename: `altum_reply_${Date.now()}.${speech.extension}`,
    contentType: speech.contentType,
    voice: true,
  });

  let stored: Awaited<ReturnType<typeof storeAltumSpeech>> | null = null;
  try {
    stored = await storeAltumSpeech({
      tenantId: input.tenantId,
      chatId: input.chatId,
      buffer: speech.playbackBuffer,
      contentType: speech.playbackContentType,
      extension: speech.playbackExtension,
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
    contentType: stored?.contentType || speech.playbackContentType,
    size: stored?.size || speech.playbackBuffer.length,
    deliveryContentType: speech.contentType,
    text: voiceText,
    voice: normalizeVoice(input.voice),
    mediaId: sent.mediaId || null,
    metaMessageId: sent.externalMessageId,
    durationMs: speech.durationMs,
    durationSource: speech.durationSource,
  };
}
