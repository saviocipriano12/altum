/** Provider placeholders are presentation metadata, never a transcript. */
export function isMediaPlaceholder(type: string, value?: string | null) {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!text) return true;
  const labels: Record<string, string> = { audio: "audio (?:recebido|enviado)", image: "imagem (?:recebida|enviada)", video: "video (?:recebido|enviado)", document: "(?:arquivo recebido|documento enviado)" };
  const label = labels[type];
  return Boolean(label && new RegExp(`^(?:\\[?${label}\\]?\\s*)+$`).test(text));
}

/** Strip only generated trailing bracket labels; keep the actual caption verbatim. */
export function getMediaCaption(type: string, value?: string | null) {
  const text = String(value || "").trim();
  if (isMediaPlaceholder(type, text)) return "";
  const labels: Record<string, string> = {
    audio: "[aá]udio (?:recebido|enviado)", image: "imagem (?:recebida|enviada)",
    video: "v[ií]deo (?:recebido|enviado)", document: "(?:arquivo recebido|documento enviado)",
  };
  return labels[type] ? text.replace(new RegExp(`(?:\\s*\\[${labels[type]}\\])+$`, "i"), "").trim() : text;
}
