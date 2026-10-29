import { adminDb } from "@/app/lib/server/firebase-admin";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { resolveCanonicalSocialChat } from "@/lib/server/social-chat-identity";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function socialKey(data: Record<string, unknown>) {
  const channel = clean(data.channel, 60);
  const channelId = clean(data.channelId, 220);
  const externalProfileId = clean(data.contactExternalId, 320);
  return channelId && externalProfileId && ["instagram", "messenger"].includes(channel)
    ? `${channel}|${channelId}|${externalProfileId}`
    : "";
}

export async function getTenantOmnichannelIdentityHealth(tenantIdValue: string) {
  const tenantId = clean(tenantIdValue, 180);
  if (!tenantId) throw new Error("tenantId obrigatorio.");
  const [contacts, chats, aliases] = await Promise.all([
    adminDb.collection("contacts").where("tenantId", "==", tenantId).limit(500).get(),
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(500).get(),
    adminDb.collection("contact_identity_aliases").where("tenantId", "==", tenantId).limit(1000).get(),
  ]);
  const groups = new Map<string, number>();
  chats.docs.forEach((doc) => {
    const data = doc.data();
    if (clean(data.mergedIntoChatId, 180)) return;
    const key = socialKey(data);
    if (key) groups.set(key, (groups.get(key) || 0) + 1);
  });
  const duplicateGroups = [...groups.values()].filter((count) => count > 1).length;
  return {
    contacts: contacts.size,
    aliases: aliases.size,
    socialChatsInspected: chats.size,
    duplicateGroups,
    coverageComplete: contacts.size < 500 && chats.size < 500 && aliases.size < 1000,
    healthy: duplicateGroups === 0,
  };
}

export async function reconcileTenantOmnichannelIdentities(tenantIdValue: string) {
  const tenantId = clean(tenantIdValue, 180);
  if (!tenantId) throw new Error("tenantId obrigatorio.");
  const [contacts, chats] = await Promise.all([
    adminDb.collection("contacts").where("tenantId", "==", tenantId).limit(500).get(),
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(500).get(),
  ]);
  let reconciledContacts = 0;
  for (const contact of contacts.docs) {
    const data = contact.data();
    if (clean(data.canonicalContactId, 220)) continue;
    const externalProfileId = clean(data.externalProfileId, 180);
    const channel = clean(data.channel, 60);
    const result = await upsertContactProfile({
      tenantId,
      phone: clean(data.phone, 40),
      email: clean(data.email, 180),
      externalProfileId: externalProfileId && channel ? externalProfileId : null,
      channel,
      leadId: clean(data.primaryLeadId || data.leadId, 180),
      name: clean(data.name, 180),
      company: clean(data.company, 180),
      photoUrl: clean(data.photoUrl, 600),
    });
    if (result) reconciledContacts += 1;
  }

  const groups = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  chats.docs.forEach((doc) => {
    if (clean(doc.data().mergedIntoChatId, 180)) return;
    const key = socialKey(doc.data());
    if (!key) return;
    groups.set(key, [...(groups.get(key) || []), doc]);
  });
  let reconciledChatGroups = 0;
  let mergedChats = 0;
  for (const docs of groups.values()) {
    const first = docs[0];
    const data = first.data();
    const channel = clean(data.channel, 60) as "instagram" | "messenger";
    const resolved = await resolveCanonicalSocialChat({
      tenantId,
      channel,
      channelId: clean(data.channelId, 220),
      externalProfileId: clean(data.contactExternalId, 320),
      createData: data,
    });
    reconciledChatGroups += 1;
    mergedChats += resolved.duplicateRefs.length;
  }
  return {
    reconciledContacts,
    reconciledChatGroups,
    mergedChats,
    contactCoverageComplete: contacts.size < 500,
    chatCoverageComplete: chats.size < 500,
  };
}
