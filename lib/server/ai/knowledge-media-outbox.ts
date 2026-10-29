import { createHash, randomUUID } from "node:crypto";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import { firebaseStorageBucketCandidates, saveImmutableFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";
import { downloadPublicChatAsset, parsePublicChatAssetUrl } from "@/lib/server/chat-public-asset";

export class AiKnowledgeMediaPreparationError extends Error { constructor(message: string) { super(message); this.name = "AiKnowledgeMediaPreparationError"; } }
export class AiKnowledgeMediaPendingError extends Error { constructor() { super("Material registrado na fila, mas a entrega ainda nao foi confirmada."); this.name = "AiKnowledgeMediaPendingError"; } }
function clean(value: unknown, max: number, required = false) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("Dados do material invalidos.");
  return value.trim();
}
export function normalizeKnowledgeMedia(input: Record<string, unknown>) {
  const kbDocId = clean(input.kbDocId, 240, true), mediaUrl = clean(input.mediaUrl, 4000, true), mediaStoragePath = clean(input.mediaStoragePath, 900);
  if (kbDocId.includes("/") || !["image", "video", "document"].includes(String(input.mediaType))) throw new Error("Dados do material invalidos.");
  const mediaType = input.mediaType as "image" | "video" | "document";
  const url = parsePublicChatAssetUrl(mediaUrl).href;
  return { kbDocId, mediaUrl: url, mediaStoragePath, mediaType, caption: clean(input.caption, 1024, true), filename: clean(input.filename, 180) || "Material" };
}
export type KnowledgeMediaRequest = ReturnType<typeof normalizeKnowledgeMedia>;
const integrity = () => new Error("Falha de integridade: material nao pertence a esta empresa ou foi alterado.");
const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
const limit = (type: string) => (type === "video" ? 64 : type === "image" ? 12 : 24) * 1024 * 1024;
export async function assertKnowledgeMediaSource(tenantId: string, request: KnowledgeMediaRequest) {
  const doc = await adminDb.collection("kb_docs").doc(request.kbDocId).get(), data = doc.data();
  if (!doc.exists || data?.tenantId !== tenantId || data.availability === "paused" || data.inventoryQuantity === 0) throw integrity();
  const candidates = [data, ...(Array.isArray(data.mediaItems) ? data.mediaItems : [])] as Record<string, unknown>[];
  const matches = candidates.some(row => {
    if (!row || typeof row !== "object" || row.usage === "blocked" || row.mediaType !== request.mediaType || String(row.mediaStoragePath || "").trim() !== request.mediaStoragePath) return false;
    try { return new URL(String(row.mediaUrl || "").trim()).href === request.mediaUrl; } catch { return false; }
  });
  if (!matches || (request.mediaStoragePath && (!request.mediaStoragePath.startsWith(`kb-media/${tenantId}/`) || request.mediaStoragePath.includes("..")))) throw integrity();
}
export type KnowledgeMediaArtifact = { storagePath: string; bucketName: string; generation: string; contentSha256: string; size: number; contentType: string; requestFingerprint: string };
type Context = { tenantId: string; chatId: string; messageId: string; request: KnowledgeMediaRequest; requestFingerprint: string };
export async function readKnowledgeMediaArtifact(context: Context, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw integrity();
  const artifact = value as KnowledgeMediaArtifact;
  if (artifact.requestFingerprint !== context.requestFingerprint || typeof artifact.storagePath !== "string" ||
    !artifact.storagePath.startsWith(`chat-media/${context.tenantId}/${context.chatId}/${context.messageId}-knowledge-`) || artifact.storagePath.includes("..") || !artifact.storagePath.endsWith("/asset.bin") ||
    !firebaseStorageBucketCandidates().includes(artifact.bucketName) || !/^\d+$/.test(artifact.generation) || !/^[a-f0-9]{64}$/.test(artifact.contentSha256) ||
    !Number.isSafeInteger(artifact.size) || artifact.size <= 0 || artifact.size > limit(context.request.mediaType) || typeof artifact.contentType !== "string") throw integrity();
  const source = adminStorage.bucket(artifact.bucketName).file(artifact.storagePath), [metadata] = await source.getMetadata();
  if (String(metadata.generation) !== artifact.generation || Number(metadata.size) !== artifact.size || String(metadata.contentType || "").split(";")[0].trim().toLowerCase() !== artifact.contentType) throw integrity();
  const file = source.bucket.file(source.name, { generation: artifact.generation }), [buffer] = await file.download();
  if (buffer.length !== artifact.size || hash(buffer) !== artifact.contentSha256) throw integrity();
  return { artifact, file, buffer };
}
export async function prepareKnowledgeMedia(context: Context & { existing?: unknown; commit: (artifact: KnowledgeMediaArtifact) => Promise<KnowledgeMediaArtifact> }) {
  await assertKnowledgeMediaSource(context.tenantId, context.request);
  if (context.existing) return readKnowledgeMediaArtifact(context, context.existing);
  let downloaded: { buffer: Buffer; contentType: string };
  try {
    if (context.request.mediaStoragePath) {
      let found: typeof downloaded | null = null;
      for (const name of firebaseStorageBucketCandidates()) {
        const source = adminStorage.bucket(name).file(context.request.mediaStoragePath), [exists] = await source.exists();
        if (!exists) continue;
        const [metadata] = await source.getMetadata();
        if (Number(metadata.size) <= 0 || Number(metadata.size) > limit(context.request.mediaType)) throw new Error("Material excede o limite permitido.");
        const [buffer] = await source.bucket.file(source.name, { generation: String(metadata.generation) }).download();
        found = { buffer, contentType: String(metadata.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase() }; break;
      }
      if (!found) throw new Error("Material original nao encontrado."); downloaded = found;
    } else downloaded = await downloadPublicChatAsset(context.request.mediaUrl, limit(context.request.mediaType));
    const mime = downloaded.contentType;
    if (!downloaded.buffer.length || downloaded.buffer.length > limit(context.request.mediaType) ||
      (context.request.mediaType === "image" && !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) ||
      (context.request.mediaType === "video" && !mime.startsWith("video/")) ||
      (context.request.mediaType === "document" && /text\/html|javascript|image\/svg/i.test(mime))) throw new Error("Conteudo do material incompativel.");
  } catch (error) { throw new AiKnowledgeMediaPreparationError(error instanceof Error ? error.message : "Nao foi possivel preparar o material."); }
  const storagePath = `chat-media/${context.tenantId}/${context.chatId}/${context.messageId}-knowledge-${randomUUID()}/asset.bin`;
  const stored = await saveImmutableFirebaseStorageFileWithFallback({ path: storagePath, data: downloaded.buffer,
    options: { metadata: { contentType: downloaded.contentType, cacheControl: "private,max-age=3600" }, resumable: false } });
  const [metadata] = await stored.file.getMetadata();
  const artifact = await context.commit({ storagePath, bucketName: stored.bucketName, generation: String(metadata.generation), contentSha256: hash(downloaded.buffer),
    size: downloaded.buffer.length, contentType: downloaded.contentType, requestFingerprint: context.requestFingerprint });
  return readKnowledgeMediaArtifact(context, artifact);
}
