import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { fetchMetaConversationProfile, type MetaChannelConfig } from "@/app/lib/server/meta-channel";
import { findContactProfile } from "./contact-profile";

const clean = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function isGenericMetaContactName(value: unknown) {
  const name = clean(value);
  return !name || /^(Instagram|Messenger)\s+\d+$/i.test(name) || /^Contato sem nome$/i.test(name);
}
export type MetaContactProfile = { name: string; username: string; photoUrl: string | null };

export async function resolveMetaContactProfile(input: {
  channel: MetaChannelConfig; userId: string; hint?: { name?: string; username?: string };
}): Promise<MetaContactProfile> {
  const cached = await findContactProfile({ tenantId: input.channel.tenantId, channel: input.channel.type, externalProfileId: input.userId });
  const hintedName = clean(input.hint?.name), hintedUsername = clean(input.hint?.username);
  const cachedUsername = input.channel.type === "instagram" ? clean(cached?.instagramUsername) : "";
  const alreadyKnown = (!isGenericMetaContactName(hintedName) || !isGenericMetaContactName(cached?.name)) &&
    (input.channel.type !== "instagram" || hintedUsername || cachedUsername);
  const fresh = alreadyKnown ? null : await fetchMetaConversationProfile(input).catch(() => null);
  const username = clean(fresh?.username) || hintedUsername || cachedUsername;
  const name = [fresh?.name, hintedName, cached?.name, username].map(value => clean(value)).find(value => !isGenericMetaContactName(value)) ||
    `${input.channel.type === "instagram" ? "Instagram" : "Messenger"} ${input.userId.slice(-6)}`;
  return { name, username, photoUrl: clean(fresh?.photoUrl, 1200) || clean(cached?.photoUrl, 1200) || null };
}

/** Profile enrichment only. Never changes assignment, funnel, messages or assistant state. */
export async function refreshStoredMetaContactProfile(input: {
  channel: MetaChannelConfig; userId: string; chatId: string; profile: MetaContactProfile;
}) {
  const { channel, profile } = input;
  if (isGenericMetaContactName(profile.name) && !profile.username && !profile.photoUrl) return false;
  return adminDb.runTransaction(async tx => {
    const chatRef = adminDb.collection("chats").doc(input.chatId);
    const [chat, currentChannel] = await Promise.all([tx.get(chatRef), tx.get(adminDb.collection("tenant_channels").doc(channel.id))]);
    const data = chat.data();
    if (!data || data.tenantId !== channel.tenantId || data.channel !== channel.type || data.channelId !== channel.id || data.contactExternalId !== input.userId ||
      currentChannel.data()?.tenantId !== channel.tenantId || currentChannel.data()?.status !== "active" ||
      clean(currentChannel.data()?.externalAccountId) !== clean(channel.externalAccountId)) throw new Error("meta_profile_scope_invalid");
    const contactRef = data.contactId ? adminDb.collection("contacts").doc(data.contactId) : null;
    const leadRef = data.leadId ? adminDb.collection("leads").doc(data.leadId) : null;
    const [contact, lead] = await Promise.all([contactRef ? tx.get(contactRef) : null, leadRef ? tx.get(leadRef) : null]);
    if (contact?.exists && (contact.data()?.tenantId !== channel.tenantId ||
      ![contact.data()?.externalProfileId, ...(contact.data()?.externalProfileIds || [])].includes(input.userId))) throw new Error("meta_profile_contact_scope_invalid");
    if (lead?.exists && (lead.data()?.tenantId !== channel.tenantId ||
      (lead.data()?.externalProfileId !== input.userId && (!data.contactId || lead.data()?.contactId !== data.contactId)))) throw new Error("meta_profile_lead_scope_invalid");
    let changed = false;
    const update = (snapshot: NonNullable<typeof chat>, nameField: string, photoField: string) => {
      const previous = snapshot.data() || {}, patch: Record<string, unknown> = {};
      if (!isGenericMetaContactName(profile.name) && isGenericMetaContactName(previous[nameField]) && profile.name !== previous[nameField]) patch[nameField] = profile.name;
      if (channel.type === "instagram" && profile.username && profile.username !== previous.instagramUsername) patch.instagramUsername = profile.username;
      if (profile.photoUrl && profile.photoUrl !== previous[photoField]) patch[photoField] = profile.photoUrl;
      if (Object.keys(patch).length) { tx.set(snapshot.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });changed = true; }
    };
    update(chat, "contactName", "contactPhotoUrl");
    if (contact?.exists) update(contact, "name", "photoUrl");
    if (lead?.exists) update(lead, "nome", "profilePhotoUrl");
    return changed;
  });
}
