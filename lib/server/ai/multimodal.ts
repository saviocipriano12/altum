import { FieldValue } from "firebase-admin/firestore";
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
  if (looksLikeHttpUrl(mediaUrl)) {
    return fetchRemoteBuffer(mediaUrl);
  }
  return fetchStorageBuffer(mediaUrl);
}

async function resolveInboundMedia(input: {
  tenantId: string;
  message: Record<string, unknown>;
}) {
  const mediaUrl = cleanText(input.message.mediaUrl, 1400);
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
            "Voce descreve imagens recebidas em conversas comerciais. Responda em portugues do Brasil, em no maximo 2 frases, focando no que um agente comercial deve entender do contexto visual.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Descreva essa imagem de forma objetiva para ajudar um agente comercial a continuar a conversa." },
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

async function summarizeDocument(buffer: Buffer, contentType: string, mediaName: string) {
  if (contentType.startsWith("image/")) {
    return analyzeImage(buffer, contentType);
  }

  if (looksLikeTextDocument(contentType)) {
    const extracted = cleanText(buffer.toString("utf-8"), 1200);
    if (extracted) {
      return `Trecho do documento: ${extracted}`;
    }
  }

  const label = mediaName || "arquivo";
  if (contentType === "application/pdf") {
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

  if (!["audio", "image", "document"].includes(type)) {
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
      source: type as "audio" | "image" | "document",
    };
  } catch (error) {
    const fallback =
      rawText ||
      (type === "audio"
        ? "[Audio recebido]"
        : type === "image"
          ? "[Imagem recebida]"
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
