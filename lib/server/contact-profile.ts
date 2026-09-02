import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";

type UpsertContactProfileInput = {
  tenantId: string;
  phone?: string | null;
  externalProfileId?: string | null;
  leadId?: string | null;
  channel?: string | null;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  photoUrl?: string | null;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sanitize(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `contact_${Date.now()}`;
}

function buildContactDocId(tenantId: string, phone: string, email: string, externalProfileId: string) {
  return sanitize(`${tenantId}_${phone || email || externalProfileId}`);
}

function cleanList(value: unknown, max = 240) {
  return Array.isArray(value) ? value.map((item) => clean(item, max)).filter(Boolean) : [];
}

export async function upsertContactProfile(input: UpsertContactProfileInput) {
  const tenantId = clean(input.tenantId, 140);
  const phone = normalizePhoneBR(clean(input.phone, 40));
  const externalProfileId = clean(input.externalProfileId, 180);
  const leadId = clean(input.leadId, 180);
  const name = clean(input.name, 180);
  const email = clean(input.email, 180).toLowerCase();
  const company = clean(input.company, 180);
  const photoUrl = clean(input.photoUrl, 600);
  const channel = clean(input.channel, 60);

  if (!tenantId || (!phone && !email && !externalProfileId)) {
    return null;
  }

  const tenantContacts = await adminDb
    .collection("contacts")
    .where("tenantId", "==", tenantId)
    .limit(2_000)
    .get();
  const matches = tenantContacts.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const phones = new Set([normalizePhoneBR(clean(data.phone, 40)), ...cleanList(data.phones, 40).map(normalizePhoneBR)].filter(Boolean));
    const emails = new Set([clean(data.email, 180).toLowerCase(), ...cleanList(data.emails, 180).map((item) => item.toLowerCase())].filter(Boolean));
    const externalProfiles = new Set([clean(data.externalProfileId, 180), ...cleanList(data.externalProfileIds, 180)].filter(Boolean));
    return Boolean(
      (phone && phones.has(phone)) ||
      (email && emails.has(email)) ||
      (externalProfileId && externalProfiles.has(externalProfileId))
    );
  });
  const canonical = matches.find((doc) => !clean(doc.data().canonicalContactId, 220)) || matches[0] || null;
  const canonicalData = canonical ? (canonical.data() as Record<string, unknown>) : {};

  const payload: Record<string, unknown> = {
    tenantId,
    updatedAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  };

  if (phone) payload.phone = phone;
  if (externalProfileId) payload.externalProfileId = externalProfileId;
  if (leadId) payload.leadId = leadId;
  if (name) payload.name = name;
  if (email) payload.email = email;
  if (company) payload.company = company;
  if (photoUrl) payload.photoUrl = photoUrl;
  if (channel) payload.channel = channel;
  if (phone) payload.phones = FieldValue.arrayUnion(phone);
  if (email) payload.emails = FieldValue.arrayUnion(email);
  if (externalProfileId) payload.externalProfileIds = FieldValue.arrayUnion(externalProfileId);
  if (leadId) payload.leadIds = FieldValue.arrayUnion(leadId);
  payload.primaryLeadId = clean(canonicalData.primaryLeadId || canonicalData.leadId, 180) || leadId || null;

  const docId = canonical?.id || buildContactDocId(tenantId, phone, email, externalProfileId);
  const ref = adminDb.collection("contacts").doc(docId);
  const snap = await ref.get();

  if (!snap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.firstSeenAt = FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
  await Promise.all(
    matches
      .filter((doc) => doc.id !== docId)
      .map((doc) => doc.ref.set({ canonicalContactId: docId, updatedAt: FieldValue.serverTimestamp() }, { merge: true }))
  );
  return ref.id;
}
