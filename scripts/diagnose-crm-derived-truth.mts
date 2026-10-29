import { mkdir, readFile, writeFile } from "node:fs/promises";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "",
  GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "", ALTUM_CRM_SEMANTIC_ENABLED: "0" });
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("External transport blocked");
  return originalFetch(input, init);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { evaluateLeadQualification } = await import("../lib/server/crm/qualification.ts");
const { readQualificationReview: read, saveQualificationReview: save } = await import("../lib/server/crm/qualification-review.ts");
const { upsertLeadCommercialDossier: dossier } = await import("../lib/server/ai/lead-dossier.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const tenantId = `qa_deep_derived_${Date.now()}`, uid = `${tenantId}_seller`;
const results: Array<Record<string, unknown>> = [];
const stages = [{ id: "entrada", label: "Entrada" }, { id: "proposta", label: "Proposta" }];
try {
  await adminDb.collection("users").doc(uid).set({ tenantId, role: "client_owner", status: "active", name: "Vendedor fictício" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_owner", status: "active" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: false, responsePaused: true } });
  const leadId = `${tenantId}_manual`, ref = adminDb.collection("leads").doc(leadId);
  await ref.set({ tenantId, ownerId: uid, nome: "Cliente fictício", pipelineStage: "entrada", customFields: { orcamento: "5000 reais" },
    aiBudgetBand: "9000 reais", aiMemory: { budgetBand: "7000 reais" }, aiFieldEvidence: { "custom.orcamento": { source: "customer_message", value: "5000 reais" } } });
  const context = { tenantId, leadId, userId: uid, userName: "Vendedor fictício" };
  for (const value of ["3000 reais", ""]) {
    await save(context, { revision: (await read(context)).revision, fields: { orcamento: value } });
    const saved = (await ref.get()).data()!, qualification = evaluateLeadQualification({ lead: saved, stages });
    const brief = await dossier({ tenantId, leadId, trigger: "qualification_ready", actorId: uid });
    results.push({ case: value ? "manual_correction" : "manual_clear", expected: value || null, actualReview: (await read(context)).fields.orcamento,
      qualificationBudget: qualification.reasons.find(reason => reason.code === "budget_band_mapped") || null,
      sellerBrief: brief?.sellerBrief, summary: brief?.summary, talkingPoints: brief?.talkingPoints, proof: saved.aiFieldEvidence["custom.orcamento"], leadId });
  }
  // Reuse actual model-produced records from the new journey run, without another model call.
  const semantic = JSON.parse(await readFile(".qa-artifacts/crm-deep-diagnostic/semantic-final.json", "utf8")) as { results: Array<{ journey: string; leadId: string }> };
  for (const id of ["revenue_not_budget", "contextual_yes", "foreign_currency", "monthly_budget"]) {
    const source = semantic.results.find(row => row.journey === id); if (!source) continue;
    const lead = (await adminDb.collection("leads").doc(source.leadId).get()).data()!;
    const qualification = evaluateLeadQualification({ lead, stages });
    results.push({ case: `actual_model_${id}`, budget: lead.customFields?.orcamento ?? null,
      qualificationBudget: qualification.reasons.find(reason => reason.code === "budget_band_mapped") || null, missingFields: qualification.missingFields });
  }
  const longId = `${tenantId}_long`, longChat = `${longId}_chat`, longMessage = `${longId}_message`;
  const longText = "a".repeat(4005) + ". Meu orçamento é 5000 reais";
  await adminDb.collection("leads").doc(longId).set({ tenantId, nome: "Cliente fictício com texto longo", pipelineStage: "entrada", createdAt: new Date() });
  await adminDb.collection("chats").doc(longChat).set({ tenantId, leadId: longId, channel: "whatsapp", createdAt: new Date() });
  await adminDb.collection("messages").doc(longMessage).set({ tenantId, leadId: longId, chatId: longChat, sender: "client", type: "text", text: longText, createdAt: new Date() });
  const outcome = await observe({ tenantId, chatId: longChat, messageId: longMessage });
  const longSaved = (await adminDb.collection("leads").doc(longId).get()).data()!;
  results.push({ case: "fact_after_4000_characters", messageLength: longText.length, expected: "5000 reais", actual: longSaved.customFields?.orcamento ?? null,
    readState: longSaved.aiCommercialReadState, outcome });
  await mkdir(".qa-artifacts/crm-deep-diagnostic", { recursive: true });
  await writeFile(".qa-artifacts/crm-deep-diagnostic/derived-truth.json", JSON.stringify({ at: new Date().toISOString(), tenantId, syntheticOnly: true,
    noProviderCalls: true, reviewWriterIsReal: true, httpRouteTested: false, results }, null, 2));
  console.log(JSON.stringify({ results }));
} finally { globalThis.fetch = originalFetch; await adminDb.terminate(); }
