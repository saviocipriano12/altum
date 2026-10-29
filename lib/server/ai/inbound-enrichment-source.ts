import { createHash } from "node:crypto";

export const inboundAnnotationFields = ["aiNormalizedText", "aiMultimodalSummary", "aiVisualAnalysis", "aiMediaProcessError"];
const metadata = new Set([...inboundAnnotationFields, "aiMediaProcessedAt", "aiMediaWriteToken", "aiMediaSourceProof", "updatedAt"]);

export function inboundOriginalFields(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !metadata.has(key)));
}

function fingerprint(row: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(inboundOriginalFields(row), (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
    }
    return value;
  })).digest("hex");
}

type Generation = { toMillis(): number; seconds?: number; nanoseconds?: number };
const generationKey = (value: Generation) => typeof value.seconds === "number" && typeof value.nanoseconds === "number"
  ? `${value.seconds}:${value.nanoseconds}` : String(value.toMillis());

export function inboundSourceProof(row: Record<string, unknown>, generation: Generation) {
  return { version: 1, generation: generationKey(generation), fingerprint: fingerprint(row) };
}

/** Never reuse interpretation of a replaced/edited attachment, nor an unproven legacy cache. */
export function hasCurrentInboundEnrichment(row: Record<string, unknown>, generation: Generation | undefined) {
  const proof = row.aiMediaSourceProof as Record<string, unknown> | undefined;
  return !!generation && !!proof && proof.version === 1 && proof.generation === generationKey(generation) &&
    proof.fingerprint === fingerprint(row) && typeof row.aiMediaWriteToken === "string" && !!row.aiMediaWriteToken;
}

export function observedMessageContent(row: Record<string, unknown>, generation: Generation | undefined) {
  const original = [row.text, row.message, row.body, row.caption].find(value => typeof value === "string" && value.trim()) as string | undefined;
  const current = hasCurrentInboundEnrichment(row, generation) && !row.aiMediaProcessError;
  const normalized = current && typeof row.aiNormalizedText === "string" ? row.aiNormalizedText.trim() : "";
  const type = String(row.type || "text").toLowerCase();
  // An image description/OCR is context, not a declaration by the buyer.
  const audio = type === "audio" && normalized && !normalized.startsWith("[");
  return {
    text: audio ? normalized : original || "",
    kind: audio ? "audio_transcription" : "text",
    mediaContext: current && ["image", "video", "document"].includes(type) && normalized && !normalized.startsWith("[")
      ? { kind: type, text: normalized, reviewRequired: true } : null,
    enrichmentToken: current ? String(row.aiMediaWriteToken) : "",
  };
}
