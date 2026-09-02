import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import { firebaseStorageBucketCandidates, saveChatMediaBuffer } from "@/lib/server/firebase-storage";
import { sendTenantChatMediaLink, type ChatDispatchActor, type ChatMediaType } from "@/lib/server/chat-dispatch";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import { getChatStateDocId } from "@/lib/server/ai/agent";
import { createMobileAudioRenditions } from "@/lib/server/audio-transcode";

type QueuedMedia = {
  tenantId: string;
  chatId: string;
  mediaType: ChatMediaType;
  storagePath: string;
  mediaSize: number;
  filename: string;
  contentType: string;
  caption?: string;
  replyToId?: string | null;
  actor: ChatDispatchActor;
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function previewForMedia(type: ChatMediaType, caption: string, filename: string) {
  if (caption) return caption;
  if (type === "image") return "[Imagem enviada]";
  if (type === "video") return "[Video enviado]";
  if (type === "audio") return "[Audio enviado]";
  return filename ? `[Documento enviado: ${filename}]` : "[Documento enviado]";
}

async function uploadedFile(path: string) {
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(path);
    const [exists] = await file.exists();
    if (exists) return file;
  }
  return null;
}

export async function queueTenantChatMedia(input: QueuedMedia) {
  const tenantId = clean(input.tenantId, 180);
  const chatId = clean(input.chatId, 180);
  const storagePath = clean(input.storagePath, 900);
  const filename = clean(input.filename, 180) || "arquivo";
  const contentType = clean(input.contentType, 180) || "application/octet-stream";
  const caption = clean(input.caption, 1024);
  const replyToId = clean(input.replyToId, 180) || null;
  const mediaSize = Math.max(0, Number(input.mediaSize || 0));

  if (!tenantId || !chatId || !storagePath || !mediaSize) {
    throw new Error("Dados da midia pendente estao incompletos.");
  }

  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists || clean(chatSnap.data()?.tenantId, 180) !== tenantId) {
    throw new Error("Conversa nao encontrada para esta empresa.");
  }

  const messageRef = adminDb.collection("messages").doc();
  const jobRef = adminDb.collection("chat_outbound_jobs").doc();
  const preview = previewForMedia(input.mediaType, caption, filename);
  const ownerId = clean(chatSnap.data()?.assignedTo || chatSnap.data()?.ownerId || input.actor.id, 180);
  const pauseMinutes = 30;

  const batch = adminDb.batch();
  batch.set(messageRef, {
    chatId,
    tenantId,
    text: preview,
    sender: "agent",
    senderId: input.actor.id,
    senderName: input.actor.name,
    type: input.mediaType,
    status: "sending",
    deliveryStatus: "queued",
    deliveryError: "",
    deliveryErrorCode: "",
    channel: "whatsapp",
    mediaUrl: storagePath,
    mediaName: filename,
    mediaMimeType: contentType,
    mediaSize,
    ...(caption ? { caption } : {}),
    ...(replyToId ? { replyToId } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(chatRef, {
    lastMessage: preview,
    lastMessageTime: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...buildOutgoingChatOperationalPatch({ status: "open", assignedTo: ownerId }),
  }, { merge: true });
  batch.set(adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)), {
    tenantId,
    chatId,
    aiEnabled: false,
    pausedUntil: new Date(Date.now() + pauseMinutes * 60_000),
    humanOwnerUserId: input.actor.id,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.actor.id,
    updatedByName: input.actor.name,
  }, { merge: true });
  batch.set(jobRef, {
    tenantId,
    chatId,
    messageId: messageRef.id,
    mediaType: input.mediaType,
    storagePath,
    mediaSize,
    filename,
    contentType,
    caption,
    replyToId,
    actorId: input.actor.id,
    actorName: input.actor.name,
    status: "ready",
    attempts: 0,
    dueAt: new Date(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { jobId: jobRef.id, messageId: messageRef.id, status: "queued" as const };
}

export async function queueTenantChatMediaBuffer(input: Omit<QueuedMedia, "storagePath" | "mediaSize"> & { buffer: Buffer }) {
  const stored = await saveChatMediaBuffer({
    tenantId: input.tenantId,
    chatId: input.chatId,
    messageId: adminDb.collection("messages").doc().id,
    data: input.buffer,
    contentType: input.contentType,
    filename: input.filename,
  });
  return queueTenantChatMedia({ ...input, storagePath: stored, mediaSize: input.buffer.length });
}

export async function processChatOutboundJobs(input?: { limit?: number; jobId?: string }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 5)));
  const docs = input?.jobId
    ? [await adminDb.collection("chat_outbound_jobs").doc(input.jobId).get()].filter((doc) => doc.exists)
    : (await adminDb.collection("chat_outbound_jobs").where("status", "==", "ready").limit(limit * 4).get()).docs;
  const results: Array<{ jobId: string; status: "sent" | "retry" | "failed" | "skipped"; error?: string }> = [];

  for (const doc of docs.slice(0, limit)) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(doc.ref);
      if (!fresh.exists || clean(fresh.data()?.status, 30) !== "ready") return null;
      const dueAt = fresh.data()?.dueAt;
      const due = dueAt && typeof dueAt === "object" && "toDate" in dueAt && typeof dueAt.toDate === "function" ? dueAt.toDate().getTime() : 0;
      if (due && due > Date.now()) return null;
      transaction.set(doc.ref, {
        status: "processing",
        attempts: FieldValue.increment(1),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return fresh.data() as Record<string, unknown>;
    });
    if (!claimed) {
      results.push({ jobId: doc.id, status: "skipped" });
      continue;
    }

    const messageId = clean(claimed.messageId, 240);
    try {
      const storagePath = clean(claimed.storagePath, 900);
      const file = await uploadedFile(storagePath);
      if (!file) throw new Error("Arquivo pendente nao encontrado no armazenamento.");
      const mediaType = clean(claimed.mediaType, 30) as ChatMediaType;
      let deliveryFile = file;
      let persistedStoragePath = storagePath;
      let persistedContentType = clean(claimed.contentType, 180) || "application/octet-stream";
      let deliveryContentType = persistedContentType;
      let filename = clean(claimed.filename, 180);

      if (mediaType === "audio" && messageId) {
        try {
          const [source] = await file.download();
          const sourceExtension = filename.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "bin";
          const renditions = await createMobileAudioRenditions({ source, extension: sourceExtension });
          const [voicePath, playbackPath] = await Promise.all([
            saveChatMediaBuffer({
              tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180), messageId,
              data: renditions.whatsappVoice, contentType: "audio/ogg; codecs=opus", filename: "voice.ogg", variant: "whatsapp",
            }),
            saveChatMediaBuffer({
              tenantId: clean(claimed.tenantId, 180), chatId: clean(claimed.chatId, 180), messageId,
              data: renditions.playback, contentType: "audio/mpeg", filename: "audio.mp3", variant: "playback",
            }),
          ]);
          const normalizedVoice = await uploadedFile(voicePath);
          if (!normalizedVoice) throw new Error("Audio normalizado nao foi encontrado no armazenamento.");
          deliveryFile = normalizedVoice;
          persistedStoragePath = playbackPath;
          persistedContentType = "audio/mpeg";
          deliveryContentType = "audio/ogg; codecs=opus";
          filename = filename.replace(/\.[a-z0-9]{1,8}$/i, "") + ".mp3";
        } catch (audioError) {
          console.error("Falha ao normalizar audio para celular; mantendo arquivo original:", audioError);
        }
      }

      const [temporaryReadUrl] = await deliveryFile.getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
      await sendTenantChatMediaLink({
        tenantId: clean(claimed.tenantId, 180),
        chatId: clean(claimed.chatId, 180),
        mediaType,
        mediaUrl: temporaryReadUrl,
        storedMediaPath: persistedStoragePath,
        mediaSize: Number(claimed.mediaSize || 0),
        filename,
        contentType: persistedContentType,
        deliveryContentType,
        caption: clean(claimed.caption, 1024),
        replyToId: clean(claimed.replyToId, 180) || null,
        actor: { id: clean(claimed.actorId, 180) || "chat_outbound_worker", name: clean(claimed.actorName, 180) || "Altum" },
        pauseAi: true,
        pauseMinutes: 30,
        messageId,
      });
      await doc.ref.set({ status: "completed", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      results.push({ jobId: doc.id, status: "sent" });
    } catch (error) {
      const attempts = Number(claimed.attempts || 0) + 1;
      const terminal = attempts >= 3;
      const message = error instanceof Error ? clean(error.message, 500) : "Falha ao enviar midia.";
      await Promise.all([
        doc.ref.set({
          status: terminal ? "failed" : "ready",
          error: message,
          dueAt: terminal ? null : new Date(Date.now() + attempts * 15_000),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        messageId ? adminDb.collection("messages").doc(messageId).set({
          status: terminal ? "failed" : "sending",
          deliveryStatus: terminal ? "failed" : "queued",
          deliveryError: message,
          deliveryUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }) : Promise.resolve(),
      ]);
      results.push({ jobId: doc.id, status: terminal ? "failed" : "retry", error: message });
    }
  }

  return { processed: results.length, results };
}
