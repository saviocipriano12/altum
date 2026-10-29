import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { commitSocialLeadCreationOccurrence, intakeCreationJobId } from "@/lib/server/crm/intake-occurrence";

type SocialChannel = "instagram" | "messenger";

function clean(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  return Number.MAX_SAFE_INTEGER;
}

export function socialLeadIdentityId(input: { tenantId: string; contactId?: string | null; channel: SocialChannel; externalProfileId: string }) {
  return `social_lead_${createHash("sha256").update(JSON.stringify([
    clean(input.tenantId, 180), clean(input.contactId, 220) || `${input.channel}:${clean(input.externalProfileId, 320)}`,
  ])).digest("hex").slice(0, 48)}`;
}

export async function resolveCanonicalSocialLead(input: {
  tenantId: string;
  contactId?: string | null;
  channel: SocialChannel;
  externalProfileId: string;
  createData: Record<string, unknown>;
  creationWorkflow?: { channelId: string; actorId: string; actorName: string };
}) {
  const identityId = socialLeadIdentityId(input);
  const identityRef = adminDb.collection("lead_identities").doc(identityId);
  const leadsRef = adminDb.collection("leads");
  const creationEventRef = leadsRef.doc(identityId).collection("events").doc();
  const existingCreation = (data: FirebaseFirestore.DocumentData | undefined) =>
    typeof data?.intakeCreationEventId === "string" ? intakeCreationJobId(data.intakeCreationEventId) : null;
  const candidates = await leadsRef
    .where("tenantId", "==", input.tenantId)
    .where("externalProfileId", "==", input.externalProfileId)
    .limit(20)
    .get();
  const exact = candidates.docs.filter((document) => clean(document.data().channel, 60) === input.channel);
  const legacy = exact.length === 0 && candidates.docs.length === 1 && !clean(candidates.docs[0]?.data().channel, 60)
    ? [candidates.docs[0]]
    : [];
  const matching = [...exact, ...legacy].sort((left, right) => toMillis(left.data().createdAt) - toMillis(right.data().createdAt));

  const result = await adminDb.runTransaction(async (transaction) => {
    const identity = await transaction.get(identityRef);
    if (identity.exists && identity.data()?.tenantId !== input.tenantId) throw new Error("social_lead_identity_scope_invalid");
    const mappedLeadId = clean(identity.data()?.leadId);
    if (mappedLeadId) {
      const mappedRef = leadsRef.doc(mappedLeadId);
      const mapped = await transaction.get(mappedRef);
      if (mapped.exists) {
        if (mapped.data()?.tenantId !== input.tenantId) throw new Error("social_lead_mapping_scope_invalid");
        return { leadRef: mappedRef, created: false, creationJobId: existingCreation(mapped.data()) };
      }
    }
    const legacyCandidate = matching[0] as QueryDocumentSnapshot | undefined;
    const leadRef: DocumentReference = legacyCandidate?.ref || leadsRef.doc(identityId);
    const lead = legacyCandidate || await transaction.get(leadRef);
    const created = !lead.exists;
    let creationJobId = existingCreation(lead.data());
    if (created && input.creationWorkflow) {
      if (input.createData.tenantId !== input.tenantId || input.createData.channel !== input.channel || input.createData.externalProfileId !== input.externalProfileId) throw new Error("social_lead_creation_scope_invalid");
      creationJobId = await commitSocialLeadCreationOccurrence(transaction, { leadRef, eventRef: creationEventRef,
        record: input.createData, ...input.creationWorkflow });
    } else if (created) transaction.set(leadRef, input.createData);
    transaction.set(identityRef, {
      tenantId: input.tenantId,
      contactId: clean(input.contactId, 220) || null,
      channel: input.channel,
      externalProfileId: input.externalProfileId,
      leadId: leadRef.id,
      identityVersion: 2,
      createdAt: identity.exists ? identity.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { leadRef, created, creationJobId };
  });

  return {
    ...result,
    duplicateRefs: matching.filter((document) => document.id !== result.leadRef.id).map((document) => document.ref),
  };
}
