import { createHash, randomUUID } from "node:crypto";
import { adminStorage } from "@/app/lib/server/firebase-admin";
import { firebaseStorageBucketCandidates, saveImmutableFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";
import { normalizeOutboundText } from "@/lib/server/chat-outbound-payload";
import { normalizeVoice, prepareAltumVoiceReplyText, synthesizeAltumSpeech } from "./voice";
import { AiVoicePreparationError } from "./voice-delivery-errors";

export function normalizeAiVoiceRequest(input: { text: unknown; voice?: unknown; maxChars?: unknown }) {
  const text = normalizeOutboundText(input.text);
  const supplied = Number(input.maxChars ?? 460);
  if (!Number.isFinite(supplied)) throw new Error("Configuracao de voz invalida.");
  const maxChars = Math.max(260, Math.min(1400, Math.floor(supplied)));
  const voice = normalizeVoice(input.voice);
  return { text, voice, maxChars, transcript: prepareAltumVoiceReplyText(text, maxChars) };
}
type Artifact = { storagePath: string; bucketName: string; generation: string; sha256: string; size: number; contentType: string };
export type AiVoiceArtifacts = {
  delivery: Artifact; playback: Artifact; voice: string; transcript: string; requestFingerprint: string;
  durationMs: number; durationSource: "measured_wav" | "estimated_text";
};
type Context = { tenantId: string; chatId: string; messageId: string; requestFingerprint: string; request: ReturnType<typeof normalizeAiVoiceRequest> };
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const integrity = () => new Error("Falha de integridade: arquivos da resposta em voz invalidos ou alterados.");
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw integrity();
  return value as Record<string, unknown>;
}
export async function readAiVoiceArtifacts(context: Context, value: unknown) {
  const data = record(value);
  if (data.requestFingerprint !== context.requestFingerprint || data.voice !== context.request.voice || data.transcript !== context.request.transcript ||
    typeof data.durationMs !== "number" || !Number.isFinite(data.durationMs) || data.durationMs <= 0 || data.durationMs > 600000 ||
    !["measured_wav", "estimated_text"].includes(String(data.durationSource))) throw integrity();
  const prefix = `chat-media/${context.tenantId}/${context.chatId}/${context.messageId}-voice-`;
  const buffers: Buffer[] = [];
  for (const [variant, mime] of [["delivery", "audio/ogg; codecs=opus"], ["playback", "audio/mpeg"]] as const) {
    const artifact = record(data[variant]);
    if (typeof artifact.storagePath !== "string" || !artifact.storagePath.startsWith(prefix) || artifact.storagePath.includes("..") ||
      !artifact.storagePath.endsWith(variant === "delivery" ? "/delivery.ogg" : "/playback.mp3") ||
      typeof artifact.bucketName !== "string" || !firebaseStorageBucketCandidates().includes(artifact.bucketName) ||
      !/^\d+$/.test(String(artifact.generation)) || !/^[a-f0-9]{64}$/.test(String(artifact.sha256)) ||
      !Number.isSafeInteger(artifact.size) || Number(artifact.size) <= 0 || Number(artifact.size) > 15 * 1024 * 1024 || artifact.contentType !== mime) throw integrity();
    const file = adminStorage.bucket(artifact.bucketName).file(artifact.storagePath);
    const [metadata] = await file.getMetadata();
    if (String(metadata.generation) !== artifact.generation || Number(metadata.size) !== artifact.size) throw integrity();
    const [bytes] = await file.bucket.file(file.name, { generation: artifact.generation as string }).download();
    if (bytes.length !== artifact.size || digest(bytes) !== artifact.sha256) throw integrity();
    buffers.push(bytes);
  }
  return { artifacts: value as AiVoiceArtifacts, deliveryBuffer: buffers[0] };
}
export async function prepareAiVoiceArtifacts(context: Context & {
  existing?: unknown; commit: (artifacts: AiVoiceArtifacts) => Promise<AiVoiceArtifacts>;
}) {
  if (context.existing) return readAiVoiceArtifacts(context, context.existing);
  let speech: Awaited<ReturnType<typeof synthesizeAltumSpeech>>;
  try { speech = await synthesizeAltumSpeech(context.request.transcript, context.request.voice); }
  catch (error) { throw new AiVoicePreparationError(error instanceof Error ? error.message : "Falha na preparacao da voz."); }
  // Unique staging pair: an interrupted preparation cannot replace another
  // worker's pair. Bind only after BOTH immutable files exist; retain all files
  // under the chat's existing retention/deletion prefix.
  const prefix = `chat-media/${context.tenantId}/${context.chatId}/${context.messageId}-voice-${randomUUID()}`;
  async function save(variant: string, bytes: Buffer, contentType: string, extension: string): Promise<Artifact> {
    const storagePath = `${prefix}/${variant}.${extension}`;
    const stored = await saveImmutableFirebaseStorageFileWithFallback({ path: storagePath, data: bytes,
      options: { metadata: { contentType, cacheControl: "private,max-age=3600" }, resumable: false } });
    const [metadata] = await stored.file.getMetadata();
    if (!/^\d+$/.test(String(metadata.generation)) || Number(metadata.size) !== bytes.length) throw integrity();
    return { storagePath, bucketName: stored.bucketName, generation: String(metadata.generation), sha256: digest(bytes), size: bytes.length, contentType };
  }
  const delivery = await save("delivery", speech.buffer, speech.contentType, "ogg");
  const playback = await save("playback", speech.playbackBuffer, speech.playbackContentType, "mp3");
  const accepted = await context.commit({ delivery, playback, voice: context.request.voice, transcript: context.request.transcript,
    requestFingerprint: context.requestFingerprint, durationMs: speech.durationMs, durationSource: speech.durationSource });
  return readAiVoiceArtifacts(context, accepted);
}
