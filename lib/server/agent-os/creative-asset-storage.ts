import { adminStorage } from "@/app/lib/server/firebase-admin";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";

const MAX_ASSET_BYTES = 80 * 1024 * 1024;

function providerAssetHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "fal.media" || host.endsWith(".fal.media") || host === "replicate.delivery" || host.endsWith(".replicate.delivery") || host === "higgsfield.ai" || host.endsWith(".higgsfield.ai")
    // Qwen Image output URLs are documented as short-lived DashScope result
    // objects. Restrict this to the exact generated-result naming convention,
    // not every Alibaba OSS host.
    || /^dashscope-result-[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(host);
}

export function isApprovedProviderAssetUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && providerAssetHost(url.hostname);
  } catch {
    return false;
  }
}

function extension(contentType: string, sourceUrl: string, type: string) {
  const fromMime: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  if (fromMime[normalized]) return fromMime[normalized];
  try {
    const match = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,6})$/i);
    if (match) return match[1].toLowerCase();
  } catch { /* validated by caller */ }
  return type === "video" ? "mp4" : "png";
}

export type StoredCreativeAsset = {
  sourceUrl: string;
  storagePath: string | null;
  contentType: string | null;
  size: number | null;
  persistence: "stored" | "external";
};

/**
 * Copies only known provider-owned output URLs into private storage. This is
 * deliberately not a generic URL downloader: it prevents an output field from
 * becoming a server-side request primitive.
 */
export async function persistCreativeAsset(input: { sourceUrl: string; tenantId: string; jobId: string; type: string }) : Promise<StoredCreativeAsset> {
  if (!isApprovedProviderAssetUrl(input.sourceUrl) || !input.tenantId || !input.jobId || firebaseStorageBucketCandidates().length === 0) {
    return { sourceUrl: input.sourceUrl, storagePath: null, contentType: null, size: null, persistence: "external" };
  }
  const response = await fetch(input.sourceUrl, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || response.type === "opaqueredirect") return { sourceUrl: input.sourceUrl, storagePath: null, contentType: null, size: null, persistence: "external" };
  const sizeHeader = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(sizeHeader) && sizeHeader > MAX_ASSET_BYTES) return { sourceUrl: input.sourceUrl, storagePath: null, contentType: null, size: null, persistence: "external" };
  const contentType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (!(contentType.startsWith("image/") || contentType.startsWith("video/"))) return { sourceUrl: input.sourceUrl, storagePath: null, contentType: null, size: null, persistence: "external" };
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return { sourceUrl: input.sourceUrl, storagePath: null, contentType: null, size: null, persistence: "external" };
  const ext = extension(contentType, input.sourceUrl, input.type);
  const storagePath = `agent-media/${input.tenantId}/${input.jobId}.${ext}`;
  await saveFirebaseStorageFileWithFallback({
    path: storagePath,
    data: bytes,
    options: { resumable: false, metadata: { contentType, cacheControl: "private,max-age=0,no-store", metadata: { tenantId: input.tenantId, creativeJobId: input.jobId, purpose: "creative_asset" } } },
  });
  return { sourceUrl: input.sourceUrl, storagePath, contentType, size: bytes.length, persistence: "stored" };
}

export async function signedCreativeAssetUrl(storagePath: string, filename: string) {
  if (!storagePath.startsWith("agent-media/") || storagePath.includes("..")) return null;
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(storagePath);
    const [exists] = await file.exists();
    if (!exists) continue;
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 10 * 60_000, responseDisposition: `inline; filename="${filename.replace(/[^\w.\- ]+/g, "_")}"` });
    return url;
  }
  return null;
}
