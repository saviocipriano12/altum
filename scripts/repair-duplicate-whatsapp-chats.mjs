import nextEnv from "@next/env";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

nextEnv.loadEnvConfig(process.cwd());

const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawCredential) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY nao encontrada em .env.local.");

const tenantId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!tenantId) throw new Error("Uso: node scripts/repair-duplicate-whatsapp-chats.mjs <tenantId> [--apply]");

function dateMs(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  return 0;
}

function clean(value) {
  return String(value || "").trim();
}

function identity(chat) {
  const phone = clean(chat.contactPhoneNormalized || chat.contactPhone).replace(/\D/g, "");
  const channelId = clean(chat.channelId || chat.channelPhoneNumberId);
  return phone && channelId ? `${channelId}:${phone}` : "";
}

function identityDocumentId(tenant, channelId, phone) {
  return `whatsapp_${tenant}_${channelId}_${phone}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220);
}

const app = initializeApp({ credential: cert(JSON.parse(rawCredential)) }, `repair-chat-${Date.now()}`);

try {
  const db = getFirestore(app);
  const snapshot = await db.collection("chats").where("tenantId", "==", tenantId).limit(1500).get();
  const groups = new Map();
  for (const document of snapshot.docs) {
    const data = document.data();
    if (clean(data.channel).toLowerCase() !== "whatsapp" || clean(data.mergedIntoChatId)) continue;
    const key = identity(data);
    if (!key) continue;
    const current = groups.get(key) || [];
    current.push({ ref: document.ref, id: document.id, data });
    groups.set(key, current);
  }

  const duplicates = Array.from(groups.values()).filter((items) => items.length > 1);
  console.log(`DUPLICATE_WHATSAPP_GROUPS tenant=${tenantId} groups=${duplicates.length} mode=${apply ? "apply" : "dry-run"}`);

  for (const items of duplicates) {
    items.sort((left, right) => dateMs(left.data.createdAt) - dateMs(right.data.createdAt));
    const canonical = items[0];
    const redundant = items.slice(1);
    const relatedCounts = {};
    const related = [];

    for (const duplicate of redundant) {
      for (const collectionName of ["messages", "chat_notes", "ai_jobs", "handoff_events"]) {
        const relatedSnapshot = await db.collection(collectionName).where("chatId", "==", duplicate.id).limit(2000).get();
        relatedCounts[collectionName] = (relatedCounts[collectionName] || 0) + relatedSnapshot.size;
        related.push(...relatedSnapshot.docs.map((document) => ({ document, collectionName })));
      }
    }

    console.log(JSON.stringify({
      canonicalChatId: canonical.id,
      duplicateChatIds: redundant.map((item) => item.id),
      relatedCounts,
    }));

    if (!apply) continue;

    const newest = [...items].sort(
      (left, right) => dateMs(right.data.lastMessageTime || right.data.updatedAt) - dateMs(left.data.lastMessageTime || left.data.updatedAt)
    )[0];
    const unreadCount = items.reduce((sum, item) => sum + Math.max(0, Number(item.data.unreadCount || 0)), 0);
    await canonical.ref.set({
      lastMessage: newest.data.lastMessage || canonical.data.lastMessage || "",
      lastMessageTime: newest.data.lastMessageTime || canonical.data.lastMessageTime || null,
      updatedAt: FieldValue.serverTimestamp(),
      unreadCount,
      duplicateRepairAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    for (let offset = 0; offset < related.length; offset += 400) {
      const batch = db.batch();
      for (const { document } of related.slice(offset, offset + 400)) {
        batch.set(document.ref, { chatId: canonical.id, duplicateRepairAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await batch.commit();
    }

    const duplicateBatch = db.batch();
    for (const duplicate of redundant) {
      duplicateBatch.set(duplicate.ref, {
        mergedIntoChatId: canonical.id,
        mergedAt: FieldValue.serverTimestamp(),
        status: "merged",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await duplicateBatch.commit();

    const canonicalPhone = clean(canonical.data.contactPhoneNormalized || canonical.data.contactPhone).replace(/\D/g, "");
    const canonicalChannelId = clean(canonical.data.channelId || canonical.data.channelPhoneNumberId);
    if (canonicalPhone && canonicalChannelId) {
      await db.collection("chat_identities").doc(
        identityDocumentId(tenantId, canonicalChannelId, canonicalPhone)
      ).set({
        tenantId,
        channel: "whatsapp",
        channelId: canonicalChannelId,
        contactPhone: canonicalPhone,
        chatId: canonical.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await db.collection("chat_merge_audits").add({
      tenantId,
      channel: "whatsapp",
      canonicalChatId: canonical.id,
      duplicateChatIds: redundant.map((item) => item.id),
      relatedCounts,
      createdAt: FieldValue.serverTimestamp(),
      reversible: true,
    });
  }
} finally {
  await deleteApp(app);
}
