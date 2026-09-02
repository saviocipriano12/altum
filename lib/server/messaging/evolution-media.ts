import type { MessagingProvider } from "./types";

export function buildEvolutionMediaRequest(
  instance: string,
  input: Parameters<MessagingProvider["sendMedia"]>[0]
) {
  if (!input.mediaUrl && !input.buffer) throw new Error("Arquivo ou URL obrigatorio para envio de midia.");
  const media = input.mediaUrl || input.buffer!.toString("base64");
  const isVoice = input.mediaType === "audio" && input.voice !== false;

  return isVoice
    ? {
        path: `/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`,
        body: {
          number: input.to,
          audio: media,
          // OGG/Opus ja e a voz nativa do WhatsApp; reencodar esse arquivo
          // reduz qualidade sem beneficio. Outros formatos seguem pela
          // conversao da Evolution como fallback.
          encoding: !String(input.contentType || "").toLowerCase().includes("ogg"),
        },
      }
    : {
        path: `/message/sendMedia/${encodeURIComponent(instance)}`,
        body: {
          number: input.to,
          mediatype: input.mediaType,
          mimetype: input.contentType,
          media,
          fileName: input.filename,
          caption: input.caption || "",
        },
      };
}
