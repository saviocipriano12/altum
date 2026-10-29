import { adminStorage } from "@/app/lib/server/firebase-admin";
import { createHash } from "node:crypto";
import { ChatOutboundIdempotencyError } from "@/lib/server/chat-outbound-idempotency";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function addCandidate(candidates: string[], value: unknown) {
  const candidate = clean(value);
  if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
}

export function firebaseStorageBucketCandidates() {
  const candidates: string[] = [];
  const configured =
    clean(process.env.FIREBASE_STORAGE_BUCKET) ||
    clean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const projectId = clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  addCandidate(candidates, configured);

  if (configured.endsWith(".firebasestorage.app")) {
    addCandidate(candidates, configured.replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  }

  if (configured.endsWith(".appspot.com")) {
    addCandidate(candidates, configured.replace(/\.appspot\.com$/i, ".firebasestorage.app"));
  }

  if (projectId) {
    addCandidate(candidates, `${projectId}.appspot.com`);
    addCandidate(candidates, `${projectId}.firebasestorage.app`);
  }

  return candidates;
}

function isMissingBucketError(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "404" || message.toLowerCase().includes("specified bucket does not exist");
}

/** Readers must use the same bucket order as writers, including legacy buckets. */
export async function findFirebaseStorageFile(path: string) {
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(path);
    try {
      const [exists] = await file.exists();
      if (exists) return file;
    } catch (error) {
      if (!isMissingBucketError(error)) throw error;
    }
  }
  return null;
}

export async function saveFirebaseStorageFileWithFallback(input: {
  path: string;
  data: Buffer;
  options: Parameters<ReturnType<ReturnType<typeof adminStorage.bucket>["file"]>["save"]>[1];
}) {
  const candidates = firebaseStorageBucketCandidates();
  if (candidates.length === 0) {
    throw new Error("Storage nao configurado no servidor.");
  }

  let lastError: unknown = null;
  for (const bucketName of candidates) {
    try {
      const file = adminStorage.bucket(bucketName).file(input.path);
      await file.save(input.data, input.options);
      return { bucketName, file };
    } catch (error) {
      lastError = error;
      if (!isMissingBucketError(error)) throw error;
      console.warn("Bucket Firebase Storage inexistente. Tentando fallback:", bucketName);
    }
  }

  throw lastError || new Error("Nenhum bucket de storage disponivel.");
}

/** Create-only object for an immutable outbound attempt, including legacy replay. */
export async function saveImmutableFirebaseStorageFileWithFallback(
  input: Parameters<typeof saveFirebaseStorageFileWithFallback>[0] & { requireExisting?: boolean }
) {
  const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  const expected = digest(input.data);
  const existing = async () => {
    for (const bucketName of firebaseStorageBucketCandidates()) {
      const file = adminStorage.bucket(bucketName).file(input.path);
      try {
        // Verify actual bytes, not user-editable custom metadata or only length.
        const [bytes] = await file.download();
        if (digest(bytes) !== expected) throw new ChatOutboundIdempotencyError();
        return { bucketName, file };
      } catch (error) {
        if (!isMissingBucketError(error)) throw error;
      }
    }
    return null;
  };
  const original = await existing();
  if (original) return original;
  if (input.requireExisting) throw new Error("Arquivo original do envio ausente; reconciliacao necessaria.");
  try {
    return await saveFirebaseStorageFileWithFallback({ ...input, options: {
      ...input.options,
      preconditionOpts: { ...input.options?.preconditionOpts, ifGenerationMatch: 0 },
    } });
  } catch (error) {
    if (Number(error && typeof error === "object" && "code" in error ? error.code : NaN) !== 412) throw error;
    // Another process created the same object after our read. Accept only the
    // same bytes; never overwrite a concurrently accepted file.
    const winner = await existing();
    if (winner) return winner;
    throw error;
  }
}

/** Server-only, short-lived URL for a provider that must fetch a private input.
 * Callers must validate ownership and file path before requesting a URL. */
export async function signedStorageReadUrl(storagePath: string, expiresMs = 20 * 60_000) {
  if (!storagePath || storagePath.includes("..")) return null;
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(storagePath);
    const [exists] = await file.exists();
    if (!exists) continue;
    const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + expiresMs });
    return url;
  }
  return null;
}

function extensionFromContentType(contentType: string, filename: string) {
  const mime = contentType.toLowerCase().split(";")[0].trim();
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "application/pdf": "pdf",
  };
  if (byMime[mime]) return byMime[mime];
  const filenameExtension = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  return filenameExtension || "bin";
}

export async function saveChatMediaBuffer(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  data: Buffer;
  contentType: string;
  filename: string;
  variant?: string;
}) {
  const extension = extensionFromContentType(input.contentType, input.filename);
  const variant = clean(input.variant, 40).replace(/[^a-zA-Z0-9_-]/g, "_");
  const suffix = variant ? `-${variant}` : "";
  // The readable prefix is not identity. Inbound provider IDs can share more
  // than 180 characters; include the full identifiers, role and actual bytes.
  // A retry reuses the object; a different file never replaces accepted media.
  const identity = createHash("sha256").update(JSON.stringify([input.tenantId, input.chatId, input.messageId, input.variant ?? null, input.contentType])).update("\0").update(input.data).digest("hex");
  const readable = clean(input.messageId, 80).replace(/[^a-zA-Z0-9_-]/g, "_") || "message";
  const path = `chat-media/${clean(input.tenantId, 180)}/${clean(input.chatId, 180)}/${readable}${suffix}-${identity}.${extension}`;
  await saveImmutableFirebaseStorageFileWithFallback({
    path,
    data: input.data,
    options: {
      metadata: {
        contentType: input.contentType || "application/octet-stream",
        cacheControl: "private,max-age=3600",
      },
      resumable: false,
    },
  });
  return path;
}
