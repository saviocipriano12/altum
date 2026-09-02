import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { BusinessBlueprint } from "@/lib/business-blueprint";
import { normalizeAutomationDoc } from "@/lib/server/automations";

function safeId(value: string, max = 120) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, max);
}

export async function applyBusinessBlueprint(input: {
  tenantId: string;
  blueprint: BusinessBlueprint;
  actorId: string;
  actorName: string;
}) {
  const tenantKey = safeId(input.tenantId);
  const pipelineRef = adminDb.collection("pipeline").doc(input.tenantId);
  const automationRefs = input.blueprint.automations.map((item) => adminDb.collection("automations").doc(`blueprint_${tenantKey}_${item.key}`));
  const [pipelineSnap, ...automationSnaps] = await Promise.all([pipelineRef.get(), ...automationRefs.map((ref) => ref.get())]);
  const existingPipeline = pipelineSnap.exists ? (pipelineSnap.data() as Record<string, unknown>) : null;
  const canManagePipeline = !existingPipeline || existingPipeline.blueprintManaged === true;
  const batch = adminDb.batch();

  if (canManagePipeline) {
    batch.set(pipelineRef, {
      tenantId: input.tenantId,
      stages: input.blueprint.pipeline,
      blueprintManaged: true,
      blueprintFingerprint: input.blueprint.fingerprint,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actorId,
      updatedByName: input.actorName,
    }, { merge: true });
  }

  let automationsCreated = 0;
  let automationsUpdated = 0;
  input.blueprint.automations.forEach((automation, index) => {
    const ref = automationRefs[index];
    const snapshot = automationSnaps[index];
    const normalized = normalizeAutomationDoc(ref.id, { tenantId: input.tenantId, ...automation, status: automation.enabled ? "active" : "paused" }, input.tenantId);
    batch.set(ref, {
      tenantId: input.tenantId,
      name: normalized.name,
      description: normalized.description,
      trigger: normalized.trigger,
      enabled: normalized.enabled,
      status: normalized.status,
      conditions: normalized.conditions,
      actions: normalized.actions,
      blueprintManaged: true,
      blueprintKey: automation.key,
      blueprintFingerprint: input.blueprint.fingerprint,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actorId,
      updatedByName: input.actorName,
      ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    if (snapshot.exists) automationsUpdated += 1;
    else automationsCreated += 1;
  });

  const knowledgeDocs = [
    { id: `blueprint_${tenantKey}_operation`, type: "playbook", tags: ["blueprint", "operacao", "vendas"], content: `${input.blueprint.summary}\n\nFechamento: ${input.blueprint.closing.objective}\nAção principal: ${input.blueprint.closing.primaryAction}\nCTA: ${input.blueprint.closing.callToAction}\n\nCadência: primeira retomada em ${input.blueprint.cadence.firstFollowUpHours}h; segunda em ${input.blueprint.cadence.secondFollowUpHours}h; última em ${input.blueprint.cadence.finalFollowUpHours}h; máximo de ${input.blueprint.cadence.maxAttempts} tentativas.` },
    { id: `blueprint_${tenantKey}_objections`, type: "playbook", tags: ["blueprint", "objecoes", "vendas"], content: input.blueprint.objections.map((item) => `${item.label}: ${item.guidance}`).join("\n") },
    { id: `blueprint_${tenantKey}_ai_policy`, type: "policy", tags: ["blueprint", "ia", "regras"], content: `Tom de voz: ${input.blueprint.aiPolicy.toneOfVoice}\n\nRegras:\n${input.blueprint.aiPolicy.guardrails.map((item) => `- ${item}`).join("\n")}\n\nChamar humano quando:\n${input.blueprint.aiPolicy.handoffWhen.map((item) => `- ${item}`).join("\n")}` },
  ];
  knowledgeDocs.forEach((doc) => batch.set(adminDb.collection("kb_docs").doc(doc.id), {
    tenantId: input.tenantId,
    ...doc,
    blueprintManaged: true,
    blueprintFingerprint: input.blueprint.fingerprint,
    useInAi: true,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true }));

  batch.set(adminDb.collection("tenant_settings").doc(input.tenantId), {
    businessBlueprint: {
      status: "active",
      active: input.blueprint,
      fingerprint: input.blueprint.fingerprint,
      appliedAt: FieldValue.serverTimestamp(),
      appliedBy: input.actorId,
      appliedByName: input.actorName,
    },
    crm: {
      suggestedTags: input.blueprint.suggestedTags,
      leadFields: input.blueprint.qualificationFields.map((item) => item.id),
      updatedFromBlueprintAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(adminDb.collection("audit_logs").doc(), {
    type: "tenant_business_blueprint_applied",
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    fingerprint: input.blueprint.fingerprint,
    pipelineApplied: canManagePipeline,
    automationCount: input.blueprint.automations.length,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { pipelineApplied: canManagePipeline, pipelinePreserved: !canManagePipeline, automationsCreated, automationsUpdated, knowledgeDocsCreated: knowledgeDocs.length };
}
