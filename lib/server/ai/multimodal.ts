import { FieldValue } from "firebase-admin/firestore";
import { inflateSync } from "node:zlib";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import {
  downloadWhatsAppMedia,
  getWhatsAppChannelByPhoneNumberId,
} from "@/app/lib/server/whatsapp-channel";

function cleanText(value: unknown, max = 1600) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeMessageType(value: unknown) {
  const raw = cleanText(value, 40).toLowerCase();
  if (["audio", "image", "video", "document", "text"].includes(raw)) return raw;
  return "text";
}

function numericValue(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function looksLikeHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function cleanMediaSource(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length > 48 * 1024 * 1024) throw new Error("media_source_too_large");
  return normalized;
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^,]*?);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) throw new Error("invalid_media_data_url");
  return {
    buffer: Buffer.from(match[2], "base64"),
    contentType: match[1] || "application/octet-stream",
  };
}

function storageBucketName() {
  return String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
}

function extensionFromMimeType(mimeType: string) {
  const normalized = cleanText(mimeType, 120).toLowerCase();
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("plain")) return "txt";
  return "bin";
}

function looksLikeTextDocument(contentType: string) {
  const normalized = cleanText(contentType, 120).toLowerCase();
  return (
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("csv") ||
    normalized.includes("xml") ||
    normalized.includes("javascript")
  );
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function printablePdfText(value: string) {
  const fragments: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  for (const match of value.matchAll(literal)) {
    const decoded = decodePdfLiteral(match[0].slice(1, -1));
    if (/[\p{L}\p{N}]/u.test(decoded)) fragments.push(decoded);
  }
  return cleanText(fragments.join(" "), 7000);
}

function extractPdfText(buffer: Buffer) {
  // PDFs comuns guardam o texto em streams Flate. Isso cobre orcamentos,
  // propostas e comprovantes simples sem introduzir um parser pesado no
  // runtime. PDFs digitalizados continuam sendo tratados como arquivo para
  // abertura; OCR pode ser ligado posteriormente no provedor de IA.
  const pdf = buffer.toString("latin1");
  const pieces: string[] = [printablePdfText(pdf)];
  const stream = /([\s\S]{0,800})stream\r?\n([\s\S]*?)\r?\nendstream/g;

  for (const match of pdf.matchAll(stream)) {
    if (!/\/FlateDecode/.test(match[1])) continue;
    try {
      const inflated = inflateSync(Buffer.from(match[2], "latin1")).toString("latin1");
      pieces.push(printablePdfText(inflated));
    } catch {
      // Um stream individual corrompido nao impede a leitura dos demais.
    }
  }

  return cleanText(pieces.join(" "), 5000);
}

async function fetchRemoteBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`media_http_${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

async function fetchStorageBuffer(path: string) {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("storage_bucket_missing");
  }
  const file = adminStorage.bucket(bucketName).file(path);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata().catch(() => [{ contentType: "application/octet-stream" }]);
  return {
    buffer,
    contentType: String(metadata.contentType || "application/octet-stream"),
  };
}

async function resolveMediaBuffer(mediaUrl: string) {
  if (mediaUrl.startsWith("data:")) return decodeDataUrl(mediaUrl);
  if (looksLikeHttpUrl(mediaUrl)) {
    return fetchRemoteBuffer(mediaUrl);
  }
  return fetchStorageBuffer(mediaUrl);
}

async function resolveInboundMedia(input: {
  tenantId: string;
  message: Record<string, unknown>;
}) {
  const mediaUrl = cleanMediaSource(input.message.mediaUrl);
  if (mediaUrl) {
    return resolveMediaBuffer(mediaUrl);
  }

  const mediaId = cleanText(input.message.mediaId, 240);
  const channelPhoneNumberId = cleanText(input.message.channelPhoneNumberId, 180);
  if (!mediaId || !channelPhoneNumberId) {
    throw new Error("media_source_missing");
  }

  const channel = await getWhatsAppChannelByPhoneNumberId(channelPhoneNumberId);
  if (!channel || channel.tenantId !== input.tenantId) {
    throw new Error("whatsapp_channel_not_available");
  }

  return downloadWhatsAppMedia({
    channel,
    mediaId,
  });
}

function resolveVideoThumbnail(message: Record<string, unknown>) {
  const raw = cleanMediaSource(message.mediaThumbnail);
  if (!raw) throw new Error("video_thumbnail_missing");
  if (raw.startsWith("data:")) return decodeDataUrl(raw);

  const normalized = raw.replace(/\s+/g, "");
  if (!/^[a-z0-9+/]+={0,2}$/i.test(normalized)) {
    throw new Error("video_thumbnail_invalid");
  }
  return { buffer: Buffer.from(normalized, "base64"), contentType: "image/jpeg" };
}

async function persistInboundMediaToStorage(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  buffer: Buffer;
  contentType: string;
}) {
  const bucketName = storageBucketName();
  if (!bucketName) {
    throw new Error("storage_bucket_missing");
  }

  const extension = extensionFromMimeType(input.contentType);
  const path = `chat-media/${input.tenantId}/${input.chatId}/${input.messageId}.${extension}`;
  const file = adminStorage.bucket(bucketName).file(path);
  await file.save(input.buffer, {
    metadata: {
      contentType: input.contentType,
      cacheControl: "public,max-age=31536000",
    },
    resumable: false,
  });

  return path;
}

export async function cacheInboundMessageMedia(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  message: Record<string, unknown>;
}) {
  const type = normalizeMessageType(input.message.type);
  if (!["audio", "image", "video", "document"].includes(type)) {
    return null;
  }

  const existingMediaUrl = cleanMediaSource(input.message.mediaUrl);
  if (existingMediaUrl && !looksLikeHttpUrl(existingMediaUrl) && !existingMediaUrl.startsWith("data:")) {
    return existingMediaUrl;
  }

  const media = await resolveInboundMedia({
    tenantId: input.tenantId,
    message: input.message,
  });

  const maxBytes = type === "image"
    ? 8 * 1024 * 1024
    : type === "video"
      ? 32 * 1024 * 1024
      : type === "audio"
        ? 16 * 1024 * 1024
        : 24 * 1024 * 1024;
  if (!media.buffer.length || media.buffer.length > maxBytes) {
    throw new Error(`media_size_invalid_${type}`);
  }

  const storedPath = await persistInboundMediaToStorage({
    tenantId: input.tenantId,
    chatId: input.chatId,
    messageId: input.messageId,
    buffer: media.buffer,
    contentType: media.contentType,
  });

  await adminDb.collection("messages").doc(input.messageId).set(
    {
      mediaUrl: storedPath,
      mediaMimeType: cleanText(input.message.mediaMimeType, 180) || media.contentType || null,
      mediaSize: media.buffer.length,
      mediaCachedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return storedPath;
}

async function transcribeAudio(buffer: Buffer, contentType: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return "";

  const form = new FormData();
  const extension =
    contentType.includes("mpeg") ? "mp3" : contentType.includes("ogg") ? "ogg" : contentType.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), `audio.${extension}`);
  form.append("model", "whisper-1");
  form.append("language", "pt");
  form.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`audio_transcription_http_${response.status}`);
  }

  const payload = (await response.json()) as { text?: string };
  return cleanText(payload.text, 1400);
}

function hasWeakTranscription(text: string) {
  const normalized = cleanText(text, 400);
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length < 4;
}

async function analyzeImage(buffer: Buffer, contentType: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return "";

  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Voce ajuda um agente comercial a entender imagens recebidas por WhatsApp. Responda em portugues do Brasil, em ate 2 frases, dizendo o que aparece e qual parece ser o contexto comercial mais importante.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Descreva essa imagem de forma objetiva para um agente comercial. Se houver anuncio, conversa, tela, oferta, marca, problema visual ou metrica relevante, cite isso.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`image_analysis_http_${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return cleanText(payload.choices?.[0]?.message?.content, 700);
}

async function summarizeTextDocument(text: string, mediaName: string) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const extracted = cleanText(text, 5000);
  if (!apiKey || !extracted) return "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Voce resume documentos recebidos em conversas comerciais. Responda em portugues do Brasil, em no maximo 2 frases, destacando o tema principal e qualquer informacao util para o proximo passo comercial.",
        },
        {
          role: "user",
          content: `Documento: ${mediaName || "arquivo"}\n\nConteudo:\n${extracted}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`document_summary_http_${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return cleanText(payload.choices?.[0]?.message?.content, 700);
}

async function summarizeDocument(buffer: Buffer, contentType: string, mediaName: string) {
  if (contentType.startsWith("image/")) {
    return analyzeImage(buffer, contentType);
  }

  if (looksLikeTextDocument(contentType)) {
    const extracted = cleanText(buffer.toString("utf-8"), 1200);
    if (extracted) {
      const llmSummary = await summarizeTextDocument(extracted, mediaName);
      return llmSummary || `Trecho do documento: ${extracted}`;
    }
  }

  const label = mediaName || "arquivo";
  if (contentType === "application/pdf") {
    const extracted = extractPdfText(buffer);
    if (extracted) {
      const llmSummary = await summarizeTextDocument(extracted, mediaName);
      return llmSummary || `Trecho do PDF: ${extracted}`;
    }
    return `[Arquivo PDF recebido: ${label}]`;
  }

  if (
    contentType.includes("word") ||
    contentType.includes("sheet") ||
    contentType.includes("presentation") ||
    contentType.includes("officedocument")
  ) {
    return `[Documento recebido: ${label}]`;
  }

  return `[Arquivo recebido: ${label}]`;
}

export async function enrichInboundMessageForAgent(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  message: Record<string, unknown>;
}) {
  const existingNormalized = cleanText(input.message.aiNormalizedText, 1600);
  if (existingNormalized) {
    return {
      normalizedText: existingNormalized,
      summary: cleanText(input.message.aiMultimodalSummary, 700) || null,
      source: "cached" as const,
    };
  }

  const type = normalizeMessageType(input.message.type);
  const rawText = cleanText(input.message.text, 1600);
  const mediaName = cleanText(input.message.mediaName, 180);
  const mediaDuration = numericValue(input.message.mediaDuration);

  if (!["audio", "image", "video", "document"].includes(type)) {
    return {
      normalizedText: rawText,
      summary: null,
      source: "text" as const,
    };
  }

  try {
    let normalizedText = rawText;
    let summary = "";

    if (type === "audio") {
      const { buffer, contentType } = await resolveInboundMedia(input);
      const transcription = await transcribeAudio(buffer, contentType);
      const lowClarity = hasWeakTranscription(transcription) && (mediaDuration || 0) >= 8;
      if (lowClarity) {
        summary = "[Audio recebido com baixa clareza de transcricao]";
        normalizedText = rawText || "[Audio com fala pouco clara]";
      } else {
        summary = transcription ? `Audio transcrito: ${transcription}` : "[Audio recebido]";
        normalizedText = transcription || rawText || "[Audio recebido]";
      }
    } else if (type === "image") {
      const { buffer, contentType } = await resolveInboundMedia(input);
      const analysis = await analyzeImage(buffer, contentType);
      summary = analysis || "[Imagem recebida]";
      normalizedText = [rawText, analysis].filter(Boolean).join(" ").trim() || "[Imagem recebida]";
    } else if (type === "video") {
      // Modelos de visao analisam imagens, nao um arquivo MP4 inteiro. A
      // Evolution fornece uma miniatura da cena, que preservamos separada do
      // arquivo original e usamos como leitura visual objetiva do video.
      try {
        const { buffer, contentType } = resolveVideoThumbnail(input.message);
        const analysis = await analyzeImage(buffer, contentType);
        summary = analysis ? `Video: ${analysis}` : "[Video recebido]";
        normalizedText = [rawText, analysis].filter(Boolean).join(" ").trim() || "[Video recebido]";
      } catch {
        summary = "[Video recebido - arquivo disponivel para reproducao]";
        normalizedText = rawText || "[Video recebido]";
      }
    } else if (type === "document") {
      try {
        const { buffer, contentType } = await resolveInboundMedia(input);
        const documentSummary = await summarizeDocument(buffer, contentType, mediaName);
        summary = documentSummary || (mediaName ? `[Arquivo recebido: ${mediaName}]` : "[Arquivo recebido]");
        normalizedText = [rawText, documentSummary].filter(Boolean).join(" ").trim() || summary;
      } catch {
        summary = mediaName ? `[Arquivo recebido: ${mediaName}]` : "[Arquivo recebido]";
        normalizedText = rawText || summary;
      }
    }

    await adminDb.collection("messages").doc(input.messageId).set(
      {
        aiNormalizedText: normalizedText || null,
        aiMultimodalSummary: summary || null,
        aiMediaProcessedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      normalizedText: normalizedText || rawText,
      summary: summary || null,
      source: type as "audio" | "image" | "video" | "document",
    };
  } catch (error) {
    const fallback =
      rawText ||
      (type === "audio"
        ? "[Audio recebido]"
        : type === "image"
          ? "[Imagem recebida]"
          : type === "video"
            ? "[Video recebido]"
          : mediaName
            ? `[Arquivo recebido: ${mediaName}]`
            : "[Arquivo recebido]");

    await adminDb.collection("messages").doc(input.messageId).set(
      {
        aiNormalizedText: fallback,
        aiMediaProcessError: error instanceof Error ? cleanText(error.message, 220) : "media_processing_failed",
        aiMediaProcessedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      normalizedText: fallback,
      summary: null,
      source: "fallback" as const,
    };
  }
}
