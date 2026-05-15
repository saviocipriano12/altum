import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getMetaChannelForTenant, type MetaChannelConfig } from "@/app/lib/server/meta-channel";
import { buildIncomingChatOperationalPatch, resolveFirstResponseSlaMinutes } from "@/lib/server/chat-operations";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { getTenantSettings } from "@/lib/server/tenant";
import { resolveInboundAssignment } from "@/lib/server/tenant-routing";
import { runLeadAutomations } from "@/lib/server/automations";

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

type GraphParticipant = {
  id?: string;
  name?: string;
  email?: string;
};

type GraphMessage = {
  id?: string;
  message?: string;
  created_time?: string;
  from?: GraphParticipant;
};

type GraphConversation = {
  id?: string;
  updated_time?: string;
  participants?: { data?: GraphParticipant[] };
  messages?: { data?: GraphMessage[] };
};

function clean(value: unknown, max = 320) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `meta_${Date.now()}`;
}

function toDate(value: unknown) {
  const raw = clean(value, 80);
  if (!raw) return new Date();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toTime(value: unknown) {
  return toDate(value).getTime();
}

function findCustomerParticipant(conversation: GraphConversation, pageId: string) {
  const participants = Array.isArray(conversation.participants?.data) ? conversation.participants?.data || [] : [];
  return participants.find((item) => clean(item.id, 180) && clean(item.id, 180) !== pageId) || null;
}

async function fetchRecentMessengerConversations(channel: MetaChannelConfig) {
  const pageId = clean(channel.pageId || channel.externalAccountId, 180);
  if (!pageId) return [] as GraphConversation[];

  const fields = [
    "id",
    "updated_time",
    "participants",
    "messages.limit(10){id,message,from,to,created_time}",
  ].join(",");
  const url = new URL(`https://graph.facebook.com/${VERSION}/${encodeURIComponent(pageId)}/conversations`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "10");
  url.searchParams.set("access_token", channel.accessToken);

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: GraphConversation[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(clean(payload.error?.message, 300) || "Falha ao sincronizar conversas do Messenger.");
  }

  return Array.isArray(payload.data) ? payload.data : [];
}

async function resolveLead(input: {
  tenantId: string;
  externalProfileId: string;
  contactName: string;
}) {
  const existing = await adminDb
    .collection("leads")
    .where("tenantId", "==", input.tenantId)
    .where("externalProfileId", "==", input.externalProfileId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data() as Record<string, unknown>;
    const currentName = clean(data.nome, 180);
    if ((!currentName || /^Messenger\s+\d+$/i.test(currentName)) && input.contactName) {
      await doc.ref.set({ nome: input.contactName, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return {
      leadId: doc.id,
      ownerId: clean(data.ownerId, 180) || null,
      ownerName: clean(data.owner, 180) || null,
    };
  }

  const assignee = await resolveInboundAssignment(input.tenantId, { channel: "messenger", priority: "medium" });
  const lead = await recordInboundLead({
    tenantId: input.tenantId,
    sourceType: "facebook_messenger",
    sourceId: `messenger:${input.externalProfileId}`,
    sourceLabel: "Facebook Messenger",
    channel: "messenger",
    nome: input.contactName || `Messenger ${input.externalProfileId.slice(-6)}`,
    externalProfileId: input.externalProfileId,
    defaultOwnerId: assignee?.userId || null,
    defaultOwnerName: assignee?.name || null,
    automationActorId: "meta_messenger_sync",
    automationActorName: "Meta Messenger Sync",
  });

  return {
    leadId: lead.leadId,
    ownerId: assignee?.userId || null,
    ownerName: assignee?.name || null,
  };
}

async function upsertMessengerChat(input: {
  tenantId: string;
  channel: MetaChannelConfig;
  contactExternalId: string;
  contactName: string;
  leadId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  lastMessage: string;
  lastMessageAt: Date;
}) {
  const existing = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("channel", "==", "messenger")
    .where("contactExternalId", "==", input.contactExternalId)
    .limit(1)
    .get();

  const tenantSettings = await getTenantSettings(input.tenantId);
  const slaMinutes = resolveFirstResponseSlaMinutes(tenantSettings as Record<string, unknown> | null);
  const operationalPatch = buildIncomingChatOperationalPatch({
    status: "open",
    assignedTo: input.ownerId,
    slaMinutes,
  });

  if (existing.empty) {
    const ref = await adminDb.collection("chats").add({
      tenantId: input.tenantId,
      channel: "messenger",
      channelId: input.channel.id,
      channelExternalAccountId: input.channel.externalAccountId || input.channel.pageId || "",
      contactExternalId: input.contactExternalId,
      contactName: input.contactName,
      contactPhotoUrl: null,
      lastMessage: input.lastMessage,
      lastMessageTime: input.lastMessageAt,
      ownerId: input.ownerId,
      ownerName: input.ownerName,
      leadId: input.leadId,
      ...operationalPatch,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  const doc = existing.docs[0];
  const data = doc.data() as Record<string, unknown>;
  await doc.ref.set(
    {
      tenantId: input.tenantId,
      channel: "messenger",
      channelId: input.channel.id,
      channelExternalAccountId: input.channel.externalAccountId || input.channel.pageId || "",
      contactExternalId: input.contactExternalId,
      contactName: input.contactName || clean(data.contactName, 180),
      lastMessage: input.lastMessage,
      lastMessageTime: input.lastMessageAt,
      ownerId: clean(data.ownerId, 180) || input.ownerId,
      ownerName: clean(data.ownerName, 180) || input.ownerName,
      leadId: clean(data.leadId, 180) || input.leadId,
      ...operationalPatch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return doc.id;
}

export async function syncRecentMessengerConversationsForTenant(tenantId: string) {
  const normalizedTenantId = clean(tenantId, 180);
  if (!normalizedTenantId) return { synced: 0, skipped: "missing_tenant" };

  const stateRef = adminDb.collection("integration_sync_state").doc(`${normalizedTenantId}_messenger_conversations`);
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? (stateSnap.data() as Record<string, unknown>) : {};
  const lastSyncAt =
    state.lastSyncAt && typeof state.lastSyncAt === "object" && "toDate" in state.lastSyncAt
      ? (state.lastSyncAt as { toDate: () => Date }).toDate().getTime()
      : 0;

  if (Date.now() - lastSyncAt < 45_000) {
    return { synced: 0, skipped: "throttled" };
  }

  await stateRef.set(
    {
      tenantId: normalizedTenantId,
      channel: "messenger",
      syncingAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let synced = 0;
  try {
    const channel = await getMetaChannelForTenant(normalizedTenantId, "messenger");
    if (!channel) return { synced: 0, skipped: "missing_channel" };

    const pageId = clean(channel.pageId || channel.externalAccountId, 180);
    const conversations = await fetchRecentMessengerConversations(channel);

    for (const conversation of conversations) {
      const customer = findCustomerParticipant(conversation, pageId);
      const contactExternalId = clean(customer?.id, 180);
      if (!contactExternalId) continue;

      const contactName = clean(customer?.name, 180) || `Messenger ${contactExternalId.slice(-6)}`;
      const messages = (Array.isArray(conversation.messages?.data) ? conversation.messages?.data || [] : [])
        .filter((item) => clean(item.id, 240) && clean(item.message, 4000))
        .sort((a, b) => toTime(a.created_time) - toTime(b.created_time));
      if (messages.length === 0) continue;

      const latest = messages[messages.length - 1];
      const lead = await resolveLead({
        tenantId: normalizedTenantId,
        externalProfileId: contactExternalId,
        contactName,
      });
      const chatId = await upsertMessengerChat({
        tenantId: normalizedTenantId,
        channel,
        contactExternalId,
        contactName,
        leadId: lead.leadId,
        ownerId: lead.ownerId,
        ownerName: lead.ownerName,
        lastMessage: clean(latest.message, 1500),
        lastMessageAt: toDate(latest.created_time || conversation.updated_time),
      });

      await upsertContactProfile({
        tenantId: normalizedTenantId,
        externalProfileId: contactExternalId,
        leadId: lead.leadId,
        channel: "messenger",
        name: contactName,
        email: clean(customer?.email, 180),
        company: "",
        photoUrl: "",
      });

      for (const message of messages) {
        const messageId = clean(message.id, 240);
        const text = clean(message.message, 4000);
        const senderId = clean(message.from?.id, 180);
        const isClient = senderId !== pageId;
        const ref = adminDb.collection("messages").doc(sanitizeId(`meta_sync_${normalizedTenantId}_messenger_${messageId}`, 240));
        const snap = await ref.get();
        if (snap.exists) continue;

        await ref.set({
          chatId,
          tenantId: normalizedTenantId,
          channel: "messenger",
          channelId: channel.id,
          text,
          sender: isClient ? "client" : "agent",
          type: "text",
          ownerId: lead.ownerId,
          metaMessageId: messageId,
          source: "meta_graph_sync",
          createdAt: toDate(message.created_time),
        });
        synced += 1;

        if (isClient && lead.leadId) {
          await runLeadAutomations({
            tenantId: normalizedTenantId,
            trigger: "message_received",
            leadId: lead.leadId,
            chatId,
            channel: "messenger",
            messageText: text,
            actorId: "meta_messenger_sync",
            actorName: "Meta Messenger Sync",
          });
        }
      }
    }

    await stateRef.set(
      {
        lastSyncAt: FieldValue.serverTimestamp(),
        lastStatus: "ok",
        lastSyncedCount: synced,
        lastError: "",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { synced };
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 300) : "Falha ao sincronizar Messenger.";
    await stateRef.set(
      {
        lastSyncAt: FieldValue.serverTimestamp(),
        lastStatus: "error",
        lastSyncedCount: synced,
        lastError: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }
}
