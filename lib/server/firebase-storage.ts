import { adminStorage } from "@/app/lib/server/firebase-admin";

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
  const path = `chat-media/${clean(input.tenantId, 180)}/${clean(input.chatId, 180)}/${clean(input.messageId, 180)}${suffix}.${extension}`;
  await saveFirebaseStorageFileWithFallback({
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
