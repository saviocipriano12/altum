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
