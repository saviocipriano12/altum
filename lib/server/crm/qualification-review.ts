import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTransactionalTenantAuthority } from "@/lib/server/tenant-operation-authority";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { crmQualificationFields } from "@/lib/crm-qualification-fields";
import { currentCommercialField } from "@/lib/crm-current-facts";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { evaluateLeadQualification } from "@/lib/server/crm/qualification";
import { buildLeadCommercialDossier } from "@/lib/server/ai/lead-dossier";

export class QualificationReviewError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Context = { tenantId: string; leadId: string; userId: string; userName: string };
const validId = (id: string) => !!id && id === id.trim() && id.length <= 180 && !id.includes("/");
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
async function current(tx: FirebaseFirestore.Transaction, context: Context) {
  if (![context.tenantId, context.leadId, context.userId].every(validId)) throw new QualificationReviewError(400, "invalid_context", "Cliente inválido.");
  const membership = await assertTransactionalTenantAuthority(tx, { tenantId: context.tenantId, userId: context.userId, capability: "edit_leads", module: "crm" });
  const snapshot = await tx.get(adminDb.collection("leads").doc(context.leadId));
  if (!snapshot.exists || snapshot.data()?.tenantId !== context.tenantId) throw new QualificationReviewError(404, "lead_not_found", "Cliente não encontrado.");
  assertAssignedCommercialRecordAccess(membership, context.userId, snapshot.data()!);
  return snapshot;
}
const revision = (snapshot: FirebaseFirestore.DocumentSnapshot) => `${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`;
export async function readQualificationReview(context: Context) {
  return adminDb.runTransaction(async tx => {
    const snapshot = await current(tx, context), row = snapshot.data()!;
    const evidence = record(row.aiFieldEvidence);
    return { revision: revision(snapshot), fields: Object.fromEntries(crmQualificationFields.map(field => [field.key, currentCommercialField(row, field.fact).value])),
      manualFields: crmQualificationFields.filter(field => { const proof = record(evidence[`custom.${field.key}`]); return proof.source === "manual" && proof.automaticUpdates !== true; }).map(field => field.key) };
  }, { readOnly: true });
}

export async function saveQualificationReview(context: Context, body: unknown) {
  const input = record(body), fields = record(input.fields);
  const release = input.releaseFields ?? [];
  if (Object.keys(input).some(key => !["revision", "fields", "releaseFields"].includes(key)) ||
      (input.fields !== undefined && (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields))) ||
      !Array.isArray(release) || release.length > crmQualificationFields.length || new Set(release).size !== release.length ||
      release.some(key => !crmQualificationFields.some(field => field.key === key) || Object.hasOwn(fields, key)) ||
      typeof input.revision !== "string" || !/^\d+:\d{1,9}$/.test(input.revision) || (!Object.keys(fields).length && !release.length) ||
      Object.keys(fields).some(key => !crmQualificationFields.some(field => field.key === key)) ||
      Object.values(fields).some(value => typeof value !== "string" || value.trim().length > 320)) {
    throw new QualificationReviewError(400, "invalid_qualification", "Informe apenas os campos comerciais, com até 320 caracteres por campo.");
  }
  return adminDb.runTransaction(async tx => {
    const snapshot = await current(tx, context);
    if (revision(snapshot) !== input.revision) throw new QualificationReviewError(409, "qualification_changed", "A ficha mudou enquanto você editava. Reabra a revisão para conferir os dados atuais.");
    const row = snapshot.data()!, custom = record(row.customFields), evidence = record(row.aiFieldEvidence);
    if (release.some(key => { const proof = record(evidence[`custom.${key}`]); return proof.source !== "manual" || proof.automaticUpdates === true; }))
      throw new QualificationReviewError(409, "qualification_changed", "Reabra a revisão para conferir quais campos estão protegidos pela equipe.");
    const patch: Record<string, unknown> = {}, changes: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(fields)) {
      const value = (raw as string).trim();
      const definition = crmQualificationFields.find(field => field.key === key)!;
      const before = currentCommercialField(row, definition.fact).value;
      // Even confirming an unchanged value deliberately puts it under human control.
      changes[key] = { before, after: value };
      patch[`customFields.${key}`] = value;
    }
    const nextEvidence = { ...evidence };
    for (const [key, raw] of Object.entries(fields)) nextEvidence[`custom.${key}`] = {
      source: "manual", value: (raw as string).trim(), actorId: context.userId, actorName: context.userName,
      occurredAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp(),
    };
    for (const key of release) nextEvidence[`custom.${key}`] = {
      ...record(evidence[`custom.${key}`]), automaticUpdates: true, automaticAfter: FieldValue.serverTimestamp(),
      releasedBy: context.userId, releasedByName: context.userName,
    };
    const event = snapshot.ref.collection("events").doc();
    const projection: Record<string, unknown> = {};
    let refreshedDossier: Record<string, unknown> | null = null;
    const documentRef = snapshot.ref.collection("documents").doc("commercial_dossier");
    if (Object.keys(fields).length) {
      const { stages } = await loadTenantPipelineInTransaction(tx, context.tenantId);
      const chats = await tx.get(adminDb.collection("chats").where("tenantId", "==", context.tenantId).where("leadId", "==", context.leadId).limit(1));
      const nextLead = { ...row, customFields: { ...custom, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, (value as string).trim()])) }, aiFieldEvidence: nextEvidence };
      const signal = record(record(row.qualification).aiSignal);
      const qualification = evaluateLeadQualification({ lead: nextLead, stages, aiSignals: Object.keys(signal).length ? [signal] : [], relatedChats: chats.docs.map(doc => doc.data()) });
      projection.qualification = qualification;
      if (row.scoreSource !== "manual") { projection.score = qualification.score; projection.scoreSource = "crm"; }
      // Free-form generated advice may contain the very fact being corrected.
      // Keep its former version in the review event, not as current guidance.
      projection.aiLeadSummary = null;
      projection.aiCommercialAnalysisNeedsRefresh = true;
      if (row.commercialDossier) {
        const document = await tx.get(documentRef), previous = document.data();
        if (previous?.tenantId && previous.tenantId !== context.tenantId) throw new QualificationReviewError(409, "dossier_changed", "O resumo precisa ser revisado antes de salvar a correção.");
        if (document.exists) {
          const generation = previous?.sourceLeadGeneration;
          if (generation !== undefined && (!(generation instanceof Timestamp) || !generation.isEqual(snapshot.createTime!)) ||
              generation === undefined && (document.createTime!.seconds < snapshot.createTime!.seconds ||
                document.createTime!.seconds === snapshot.createTime!.seconds && document.createTime!.nanoseconds < snapshot.createTime!.nanoseconds))
            throw new QualificationReviewError(409, "dossier_changed", "O resumo pertence a uma versão anterior deste cliente.");
        }
        const dossier = buildLeadCommercialDossier({ tenantId: context.tenantId, leadId: context.leadId,
          trigger: "qualification_reviewed", sourceId: event.id, actorId: context.userId, actorName: context.userName, omitUnreviewedAnalysis: true },
          { lead: { ...nextLead, ...projection }, generation: snapshot.createTime! });
        const { updatedAt: omitted, ...content } = dossier; void omitted;
        refreshedDossier = { ...dossier, version: Math.max(0, Number(record(row.commercialDossier).version) || 0) + 1,
          fingerprint: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
        projection.commercialDossier = refreshedDossier;
        projection.commercialDossierUpdatedAt = FieldValue.serverTimestamp();
      }
    }
    tx.update(snapshot.ref, { ...patch, ...projection, aiFieldEvidence: nextEvidence, updatedAt: FieldValue.serverTimestamp() });
    if (refreshedDossier) tx.set(documentRef, refreshedDossier);
    tx.create(event, { tenantId: context.tenantId, type: "qualification_reviewed", title: "Informações comerciais revisadas",
      detail: release.length ? "Atualização pela IA liberada para novas mensagens nos campos selecionados; valores atuais preservados." : "Dados conferidos pela equipe e protegidos contra substituição automática.", changes, releasedFields: release,
      previousDossierFingerprint: record(row.commercialDossier).fingerprint || null,
      previousAnalysis: Object.keys(fields).length ? { summary: row.aiLeadSummary || null, dossier: row.commercialDossier || null } : null,
      actorId: context.userId, actorName: context.userName, createdAt: FieldValue.serverTimestamp() });
    return { eventId: event.id };
  });
}
