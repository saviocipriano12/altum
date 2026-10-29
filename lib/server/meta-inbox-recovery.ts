import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getMetaChannelForTenant, type MetaChannelConfig } from "@/app/lib/server/meta-channel";
import { upsertContactProfile } from "./contact-profile";
import { resolveInboundAssignment } from "./tenant-routing";
import { resolveCanonicalSocialChat } from "./social-chat-identity";
import { resolveCanonicalSocialLead } from "./social-lead-identity";
import { loadTenantPipelineConfig } from "./crm/pipeline";
import { buildManualQueuePatch, toDate } from "./chat-operations";
import { parseMetaHistoryMessage, type MetaHistoryMessage, type MetaHistoryParticipant } from "./messaging/meta-history-message";
import { resolveMetaContactProfile, refreshStoredMetaContactProfile } from "./meta-contact-profile";
import { persistMetaOutgoingMessage } from "./meta-outgoing-message";

type Conversation = { id?: string; participants?: { data?: MetaHistoryParticipant[] }; messages?: { data?: MetaHistoryMessage[]; paging?: { cursors?: { after?: string }; next?: string } } };
const clean = (v: unknown, max = 320) => typeof v === "string" ? v.trim().slice(0, max) : "";
const version = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
async function graph<T>(channel: MetaChannelConfig, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${channel.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const data = await res.json() as T & { error?: { code?: number } };
  if (!res.ok) throw new Error(`meta_history_http_${res.status}_code_${data.error?.code || 0}`);
  return data;
}
/** Import history only: no sends, automations, AI jobs or simulated inbound events. */
export async function recoverRecentMetaInbox(tenantId: string, options: { chatId?: string } = {}) {
  if (!/^[\w-]{1,180}$/.test(tenantId)) throw new Error("Empresa invalida.");
  const target = options.chatId ? await adminDb.collection("chats").doc(options.chatId).get() : null;
  const targetData = target?.data();
  if (options.chatId && (!targetData || targetData.tenantId !== tenantId || !["instagram", "messenger"].includes(targetData.channel) || !targetData.channelId || !targetData.contactExternalId)) throw new Error("meta_history_target_invalid");
  const stateRef = adminDb.collection("integration_sync_state").doc(`${tenantId}_meta_inbox${target ? `_${target.id}` : ""}`), token = randomUUID();
  const granted = await adminDb.runTransaction(async tx => {
    const state = (await tx.get(stateRef)).data();
    if (state && state.tenantId !== tenantId) throw new Error("Sincronizacao fora da empresa.");
    if ((toDate(state?.nextAttemptAt)?.getTime() || 0) > Date.now()) return false;
    tx.set(stateRef, { tenantId, leaseToken: token, nextAttemptAt: new Date(Date.now() + 90_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });return true;
  });
  if (!granted) return { synced: 0, skipped: "throttled", channels: [] };
  const results: Array<{ channel: string; synced: number; status: string }> = [];
  let profilesUpdated = 0;
  const finish = async () => adminDb.runTransaction(async tx => {
    const state = await tx.get(stateRef);if (state.data()?.leaseToken !== token) return;
    tx.set(stateRef, { lastSyncAt: FieldValue.serverTimestamp(), lastStatus: results.some(r => r.status === "error") ? "partial_error" : "ok",
      lastSyncedCount: results.reduce((sum, r) => sum + r.synced, 0), results,
      nextAttemptAt: new Date(Date.now() + 45_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  try {
    const rows = await adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) {
      const type = row.data().type;if (type !== "instagram" && type !== "messenger") continue;
      if (targetData && row.id !== targetData.channelId) continue;
      const channel = await getMetaChannelForTenant(tenantId, type, { channelId: row.id });
      if (!channel || channel.id !== row.id) continue;
      let synced = 0;
      try {
        const page = clean(channel.pageId || channel.externalAccountId), accounts = [clean(channel.externalAccountId), page].filter(Boolean);
        if (!page) continue;
        const conversations = await graph<{ data?: Conversation[] }>(channel, `${encodeURIComponent(page)}/conversations`, {
          fields: `id,participants,messages.limit(${target ? 50 : 30}){id,message,from,to,created_time,attachments}`, limit: "10",
          ...(targetData ? { user_id: String(targetData.contactExternalId) } : {}),
          ...(type === "instagram" ? { platform: "instagram" } : {}),
        });
        for (const conversation of (conversations.data || []).slice(0, 10)) {
          const customers = conversation.participants?.data?.filter(p => p.id && !accounts.includes(p.id)) || [];
          if (customers.length !== 1) continue;
          const customer = customers[0], externalId = clean(customer.id);
          if (targetData && externalId !== targetData.contactExternalId) continue;
          const history = [...(conversation.messages?.data || [])];
          let cursor = conversation.messages?.paging?.cursors?.after;
          for (let page = 0; target && conversation.id && cursor && conversation.messages?.paging?.next && page < 3; page++) {
            const more = await graph<{ data?: MetaHistoryMessage[]; paging?: { cursors?: { after?: string }; next?: string } }>(channel, `${encodeURIComponent(conversation.id)}/messages`, {
              fields: "id,message,from,to,created_time,attachments", limit: "50", after: cursor,
            });
            history.push(...(more.data || []));
            cursor = more.paging?.next ? more.paging.cursors?.after : undefined;
          }
          const messages = history.slice(0, target ? 200 : 30).map(message => parseMetaHistoryMessage({ tenantId, channelId: channel.id, channel: type,
            accountIds: accounts, contactId: externalId, message })).filter(m => m !== null).sort((a,b) => a.occurredAtMs - b.occurredAtMs);
          if (!messages.length) continue;
          const profile = await resolveMetaContactProfile({ channel, userId: externalId, hint: customer });
          const contactName = profile.name;
          const latestChannel = await adminDb.collection("tenant_channels").doc(channel.id).get();
          if (latestChannel.data()?.tenantId !== tenantId || latestChannel.data()?.status !== "active" ||
            clean(latestChannel.data()?.externalAccountId) !== clean(row.data().externalAccountId)) throw new Error("meta_history_channel_changed");
          const contactId = await upsertContactProfile({ tenantId, channel: type, externalProfileId: externalId, name: contactName, photoUrl: profile.photoUrl });
          const assignee = await resolveInboundAssignment(tenantId, { channel: type, priority: "medium", responsibility: "lead" });
          const firstStage = (await loadTenantPipelineConfig(tenantId)).stages[0]?.id || "captado";
          const lead = await resolveCanonicalSocialLead({ tenantId, channel: type, contactId, externalProfileId: externalId, createData: {
            tenantId, channel: type, contactId, externalProfileId: externalId, nome: contactName,
            sourceType: type === "instagram" ? "instagram_dm" : "facebook_messenger", source: "meta_history_recovery",
            pipelineStage: firstStage, stage: firstStage, status: "novo", ownerId: assignee?.userId || null, owner: assignee?.name || null,
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } });
          const leadData = (await lead.leadRef.get()).data() || {}, latest = messages[messages.length - 1];
          if (leadData.tenantId !== tenantId) throw new Error("meta_history_lead_scope_changed");
          const ownerId = clean(leadData.ownerId) || assignee?.userId || null;
          const canonical = await resolveCanonicalSocialChat({ tenantId, channel: type, channelId: channel.id, externalProfileId: externalId, createData: {
            tenantId, channel: type, channelId: channel.id, channelExternalAccountId: channel.externalAccountId || page,
            contactExternalId: externalId, contactId, contactName, contactPhotoUrl: profile.photoUrl, leadId: lead.leadRef.id, ownerId, assignedTo: ownerId,
            status: "open", lastMessage: latest.text, lastMessageTime: new Date(latest.occurredAtMs),
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } });
          if (await refreshStoredMetaContactProfile({ channel, userId: externalId, chatId: canonical.chatRef.id, profile })) profilesUpdated++;
          for (const message of messages) {
            const existing = await adminDb.collection("messages").where("chatId", "==", canonical.chatRef.id).where("metaMessageId", "==", message.providerEventId).limit(5).get();
            if (existing.docs.some(d => d.data().tenantId === tenantId && (!d.data().channelId || d.data().channelId === channel.id))) continue;
            if (message.sender === "agent") {
              const result = await persistMetaOutgoingMessage({ channel, event: message, chatId: canonical.chatRef.id, contentUnavailable: message.contentUnavailable, source: "meta_history_recovery" });
              if (result.created) synced++;
              continue;
            }
            const ref = adminDb.collection("messages").doc(message.messageDocumentId);
            const created = await adminDb.runTransaction(async tx => {
              const [stored, chat, current] = await Promise.all([tx.get(ref), tx.get(canonical.chatRef), tx.get(row.ref)]);
              if (chat.data()?.tenantId !== tenantId || chat.data()?.channelId !== channel.id || current.data()?.tenantId !== tenantId || current.data()?.status !== "active") throw new Error("meta_history_scope_changed");
              if (stored.exists) { if (stored.data()?.tenantId !== tenantId || stored.data()?.chatId !== canonical.chatRef.id) throw new Error("meta_history_message_conflict");return false; }
              const a = message.attachments[0];
              tx.create(ref, { tenantId, chatId: canonical.chatRef.id, channel: type, channelId: channel.id,
                text: message.text, sender: message.sender, type: message.messageType, metaMessageId: message.providerEventId,
                attachments: message.attachments, mediaUrl: a?.url || null, mediaMimeType: a?.mimeType || null, mediaName: a?.name || null,
                source: "meta_history_recovery", createdAt: new Date(message.occurredAtMs), receivedAt: FieldValue.serverTimestamp() });
              const data = chat.data() || {}, currentTime = toDate(data.lastMessageTime)?.getTime() || 0;
              const patch: Record<string, unknown> = {};
              if (message.occurredAtMs >= currentTime) { patch.lastMessage = message.text;patch.lastMessageTime = new Date(message.occurredAtMs); }
              const field = "lastClientMessageAt";
              if (message.occurredAtMs > (toDate(data[field])?.getTime() || 0)) patch[field] = new Date(message.occurredAtMs);
              if (Object.keys(patch).length) tx.set(canonical.chatRef, { ...patch, ...buildManualQueuePatch({ ...data, ...patch }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
              return true;
            });
            if (created) synced++;
          }
        }
        results.push({ channel: type, synced, status: "ok" });
      } catch { results.push({ channel: type, synced, status: "error" }); }
    }
    return { synced: results.reduce((sum,r) => sum+r.synced,0), profilesUpdated, channels: results, recentWindowOnly: true };
  } finally { await finish(); }
}
