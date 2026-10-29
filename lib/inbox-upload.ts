type UploadProgress = { bytesTransferred: number; totalBytes: number };

export function describeInboxMediaFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/storage\/unauthorized|permission/i.test(message)) {
    return "O armazenamento bloqueou o upload. Um administrador precisa liberar arquivos de conversa.";
  }
  if (!message || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
    return "Nao foi possivel confirmar o envio. O arquivo foi mantido nesta pagina; confira a conexao e tente novamente.";
  }
  return message;
}

export type InboxMediaAttempt = Readonly<{
  caption: string;
  replyToId: string | null;
  composerText: string | null;
}>;

/** A pending request ID always refers to its original caption and reply. */
export function prepareInboxMediaAttempt<T extends { id: string; attempt?: InboxMediaAttempt }>(
  files: T[], id: string, input: { caption: string; replyToId: string | null; composerText?: string | null }
) {
  const file = files.find((item) => item.id === id);
  if (!file) return null;
  const attempt = file.attempt || Object.freeze({ caption: input.caption.trim(),
    replyToId: input.replyToId || null, composerText: input.composerText ?? null });
  return { attempt, files: file.attempt ? files : files.map((item) => item.id === id ? { ...item, attempt } : item) };
}

/** Never switch transport after upload: the dispatch may already be accepted. */
export function canFallbackInboxVideoUpload(mediaType: string, size: number, uploadCompleted: boolean) {
  return !uploadCompleted && mediaType === "video" && size <= 32 * 1024 * 1024;
}

type MediaTransportState = { file: object; uploaded: boolean; panel: boolean; uploading?: Promise<void> };
// Same lifetime as the in-memory draft: no private file bytes in persistent storage.
const mediaTransports = new WeakMap<InboxMediaAttempt, Map<string, MediaTransportState>>();
const mediaDigests = new WeakMap<Blob, Promise<string>>();

class InboxUploadOutcomeUnknown extends Error {
  constructor() {
    super("Nao foi possivel confirmar o upload. O arquivo foi mantido nesta pagina; confira a conexao e tente novamente.");
  }
}

/** Only an authenticated object-not-found response proves absence. */
export async function probeInboxUploadedObject(readMetadata: () => Promise<unknown>) {
  try { await readMetadata(); return true; }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "storage/object-not-found") return false;
    throw error;
  }
}

/** Digest the original selected File, not metadata supplied by Storage. */
export function inboxMediaContentSha256(file: Blob) {
  let digest = mediaDigests.get(file);
  if (!digest) {
    digest = file.arrayBuffer().then((bytes) => globalThis.crypto.subtle.digest("SHA-256", bytes))
      .then((bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""));
    mediaDigests.set(file, digest);
    void digest.catch(() => { mediaDigests.delete(file); });
  }
  return digest;
}

/** Retrying an uncertain dispatch must not overwrite its create-only upload or switch transport. */
export async function sendInboxDirectMedia<T>(input: {
  attempt: InboxMediaAttempt;
  file: object;
  storagePath: string;
  upload: () => Promise<void>;
  /** Presence is only a recovery hint; sendStored must still verify the original digest. */
  probeUploaded?: () => Promise<boolean>;
  sendStored: () => Promise<T>;
  sendPanel: () => Promise<T>;
  allowPanelFallback: boolean;
}) {
  let paths = mediaTransports.get(input.attempt);
  if (!paths) { paths = new Map(); mediaTransports.set(input.attempt, paths); }
  let state = paths.get(input.storagePath);
  if (!state) {
    state = { file: input.file, uploaded: false, panel: false };
    paths.set(input.storagePath, state);
  }
  if (state.file !== input.file) throw new Error("O arquivo desta tentativa mudou. Selecione-o como um novo envio.");
  if (state.panel) return input.sendPanel();
  if (!state.uploaded) {
    // Share only the upload, not the dispatch result: an uncertain API request
    // still needs another request with the same server idempotency key.
    const current = state;
    current.uploading ??= Promise.resolve().then(input.upload).catch(async (uploadError) => {
      if (!input.probeUploaded) throw uploadError;
      let present: boolean;
      try { present = await input.probeUploaded(); }
      catch { throw new InboxUploadOutcomeUnknown(); }
      if (!present) throw uploadError;
      // The upload may have committed before its completion callback was lost.
      // Do not overwrite or switch transport; the API checks the actual bytes.
    }).then(() => { current.uploaded = true; });
    try { await current.uploading; }
    catch (error) {
      current.uploading = undefined;
      if (!input.allowPanelFallback || error instanceof InboxUploadOutcomeUnknown) throw error;
      current.panel = true;
      return input.sendPanel();
    }
  }
  return input.sendStored();
}

export function clearAcknowledgedMediaCaption(currentText: string, sentText: string) {
  return currentText === sentText ? "" : currentText;
}

type ObservableUpload = {
  on(event: "state_changed", progress: (snapshot: UploadProgress) => void,
    error: (error: unknown) => void, complete: () => void): () => void;
  cancel(): boolean;
};

/** Timeout is based on lack of byte progress, not total file upload duration. */
export function waitForInboxUpload(task: ObservableUpload, onProgress: (percent: number) => void, idleMs = 60000) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let bytes = -1;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      if (error) reject(error); else resolve();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        finish(new Error("O upload parou de progredir. O arquivo foi mantido; tente novamente."));
        task.cancel();
      }, idleMs);
    };
    arm();
    try {
      unsubscribe = task.on("state_changed", (snapshot) => {
        if (settled) return;
        if (snapshot.bytesTransferred > bytes) { bytes = snapshot.bytesTransferred; arm(); }
        onProgress(snapshot.totalBytes > 0 ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0);
      }, finish, () => finish());
      if (settled) unsubscribe();
    } catch (error) { finish(error); }
  });
}
