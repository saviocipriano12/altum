import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

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

function buildContactDocId(tenantId: string, phone: string, externalProfileId: string) {
  return sanitize(`${tenantId}_${phone || externalProfileId}`);
}

export async function upsertContactProfile(input: UpsertContactProfileInput) {
  const tenantId = clean(input.tenantId, 140);
  const phone = clean(input.phone, 40);
  const externalProfileId = clean(input.externalProfileId, 180);
  const leadId = clean(input.leadId, 180);
  const name = clean(input.name, 180);
  const email = clean(input.email, 180).toLowerCase();
  const company = clean(input.company, 180);
  const photoUrl = clean(input.photoUrl, 600);
  const channel = clean(input.channel, 60);

  if (!tenantId || (!phone && !externalProfileId)) {
    return null;
  }

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

  const docId = buildContactDocId(tenantId, phone, externalProfileId);
  const ref = adminDb.collection("contacts").doc(docId);
  const snap = await ref.get();

  if (!snap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.firstSeenAt = FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
  return ref.id;
}
