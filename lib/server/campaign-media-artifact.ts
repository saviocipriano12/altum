import { createHash, randomUUID } from "node:crypto";
import { adminStorage } from "@/app/lib/server/firebase-admin";
import { downloadPublicChatAsset, parsePublicChatAssetUrl } from "./chat-public-asset";
import { firebaseStorageBucketCandidates, saveImmutableFirebaseStorageFileWithFallback } from "./firebase-storage";
export type CampaignAsset = { storagePath: string; bucketName: string; generation: string; contentType: string; contentSha256: string; size: number; fingerprint: string };
type Context = { tenantId: string; chatId: string; messageId: string; fingerprint: string; source: { url: string; type: "image" | "video" | "document" } };
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const limit = (type: string) => (type === "video" ? 32 : type === "image" ? 8 : 24) * 1024 * 1024;
const invalid = () => new Error("Falha de integridade: material de campanha alterado ou fora da conversa.");
export async function readCampaignAsset(context: Context, value: CampaignAsset) {
  if (!value || typeof value.storagePath !== "string" || !value.storagePath.startsWith(`chat-media/${context.tenantId}/${context.chatId}/${context.messageId}-campaign-`) ||
    value.storagePath.includes("..") || !value.storagePath.endsWith("/asset.bin") || !firebaseStorageBucketCandidates().includes(value.bucketName) ||
    !/^\d+$/.test(value.generation) || value.fingerprint !== context.fingerprint || !/^[a-f0-9]{64}$/.test(value.contentSha256) ||
    !Number.isSafeInteger(value.size) || value.size < 1 || value.size > limit(context.source.type)) throw invalid();
  const file = adminStorage.bucket(value.bucketName).file(value.storagePath, { generation: value.generation });
  const [metadata] = await file.getMetadata();
  if (String(metadata.generation) !== value.generation || Number(metadata.size) !== value.size || metadata.contentType !== value.contentType) throw invalid();
  const [buffer] = await file.download(); if (buffer.length !== value.size || digest(buffer) !== value.contentSha256) throw invalid();
  return { artifact: value, file, buffer };
}
export async function prepareCampaignAsset(context: Context & { existing?: CampaignAsset; commit: (asset: CampaignAsset) => Promise<CampaignAsset> }) {
  if (context.existing) return readCampaignAsset(context, context.existing);
  const source = parsePublicChatAssetUrl(context.source.url);
  const downloaded = await downloadPublicChatAsset(source.href, limit(context.source.type)), mime = downloaded.contentType;
  if (!downloaded.buffer.length || (context.source.type === "image" && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime)) ||
    (context.source.type === "video" && !mime.startsWith("video/")) || (context.source.type === "document" && /text\/html|javascript|image\/svg/i.test(mime))) throw invalid();
  const storagePath = `chat-media/${context.tenantId}/${context.chatId}/${context.messageId}-campaign-${randomUUID()}/asset.bin`;
  const stored = await saveImmutableFirebaseStorageFileWithFallback({ path: storagePath, data: downloaded.buffer,
    options: { metadata: { contentType: mime, cacheControl: "private,max-age=3600" }, resumable: false } });
  const [metadata] = await stored.file.getMetadata();
  const artifact = await context.commit({ storagePath, bucketName: stored.bucketName, generation: String(metadata.generation), contentType: mime,
    contentSha256: digest(downloaded.buffer), size: downloaded.buffer.length, fingerprint: context.fingerprint });
  return readCampaignAsset(context, artifact);
}
