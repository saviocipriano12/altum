import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";
import { createHash } from "node:crypto";
import { matchesConversationCommercialFence, type ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import { AgentCommercialContextChanged } from "@/lib/server/crm/agent-commercial-task";
import {assertTransactionalTenantAuthority} from "@/lib/server/tenant-operation-authority";
import {assertAssignedCommercialRecordAccess} from "@/lib/server/commercial-access";
import { currentCommercialField } from "@/lib/crm-current-facts";

type ConversationMessageLike = {
  text?: string;
  sender?: string;
  type?: string;
  createdAt?: unknown;
};

type DossierTrigger =
  | "qualification_ready"
  | "qualification_reviewed"
  | "handoff"
  | "appointment_draft"
  | "appointment_scheduled"
  | "appointment_completed"
  | "meeting_analyzed"
  | "proposal_draft"
  | "sale_won";

type UpsertLeadCommercialDossierInput = {
  omitUnreviewedAnalysis?: boolean;
  assistedMeetingFence?: FirebaseFirestore.DocumentSnapshot;
  conversationFence?: ConversationCommercialFence;
  tenantId: string;
  leadId: string;
  trigger: DossierTrigger;
  sourceId?: string | null;
  chatId?: string | null;
  appointmentId?: string | null;
  plan?: AltumPlannerDecision | null;
  lead?: Record<string, unknown> | null;
  leadMemory?: Record<string, unknown> | null;
  conversation?: ConversationMessageLike[] | null;
  appointment?: Record<string, unknown> | null;
  actorId?: string | null;
  actorName?: string | null;
};

function clean(value: unknown, max = 260) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  for (const value of values) {
    const text = clean(value, 360);
    if (text) return text;
  }
  return "";
}

function uniqueList(values: Array<string | null | undefined>, max = 8) {
  return Array.from(new Set(values.map((item) => clean(item, 220)).filter(Boolean))).slice(0, max);
}

function triggerLabel(trigger: DossierTrigger) {
  if (trigger === "qualification_reviewed") return "Informações comerciais revisadas";
  if (trigger === "qualification_ready") return "Plano comercial pronto";
  if (trigger === "handoff") return "Handoff para humano";
  if (trigger === "appointment_draft") return "Agendamento a confirmar";
  if (trigger === "appointment_scheduled") return "Reuniao marcada";
  if (trigger === "appointment_completed") return "Reuniao concluida";
  if (trigger === "meeting_analyzed") return "Reunião analisada";
  if (trigger === "proposal_draft") return "Proposta em rascunho";
  if (trigger === "sale_won") return "Venda ganha";
  return "Atualizacao comercial";
}

function triggerStatus(trigger: DossierTrigger) {
  if (trigger === "sale_won") return "won";
  if (trigger === "appointment_draft") return "meeting_draft";
  if (trigger === "qualification_ready") return "diagnosis_ready";
  if (trigger === "appointment_completed") return "post_meeting";
  if (trigger === "appointment_scheduled") return "meeting_ready";
  if (trigger === "proposal_draft") return "proposal_ready";
  if (trigger === "handoff") return "handoff_ready";
  return "ready";
}

function latestConversationLines(conversation: ConversationMessageLike[] | null | undefined) {
  return (conversation || [])
    .slice(-8)
    .map((message) => {
      const text = clean(message.text, 240);
      if (!text) return "";
      const sender = clean(message.sender, 40) || "lead";
      return `${sender}: ${text}`;
    })
    .filter(Boolean);
}

function buildMarkdown(input: {
  title: string;
  summary: string;
  leadName: string;
  company: string;
  source: string;
  objective: string;
  painPoints: string[];
  recommendedOffer: string;
  nextAction: string;
  objections: string[];
  diagnosis: string;
  personalizedPlan: string;
  sellerNextMove: string;
  materialToSend: string;
  proposalOutline: string;
  talkingPoints: string[];
  questionsToAsk: string[];
  recentConversation: string[];
}) {
  const lines = [
    `# ${input.title}`,
    "",
    `**Lead:** ${input.leadName || "Nao identificado"}`,
    input.company ? `**Empresa:** ${input.company}` : "",
    input.source ? `**Origem:** ${input.source}` : "",
    "",
    "## Resumo executivo",
    input.summary || "Ainda nao ha resumo suficiente.",
    "",
    "## Objetivo do lead",
    input.objective || "Não informado.",
    "",
    "## Dores e sinais",
    ...input.painPoints.map((item) => `- ${item}`),
    "",
    "## Oferta recomendada",
    input.recommendedOffer,
    "",
    "## Diagnostico da IA",
    input.diagnosis,
    "",
    "## Plano sugerido",
    input.personalizedPlan,
    "",
    "## O que preparar",
    ...(uniqueList([input.sellerNextMove, input.materialToSend, input.proposalOutline], 6).length
      ? uniqueList([input.sellerNextMove, input.materialToSend, input.proposalOutline], 6).map((item) => `- ${item}`)
      : []),
    "",
    "## Proxima acao",
    input.nextAction,
    "",
    "## Objeccoes e riscos",
    ...(input.objections.length ? input.objections.map((item) => `- ${item}`) : ["- Sem objecao principal registrada ainda."]),
    "",
    "## Roteiro para o vendedor",
    ...input.talkingPoints.map((item) => `- ${item}`),
    "",
    "## Perguntas que faltam",
    ...input.questionsToAsk.map((item) => `- ${item}`),
    "",
    "## Ultimos sinais da conversa",
    ...(input.recentConversation.length ? input.recentConversation.map((item) => `- ${item}`) : ["- Sem conversa recente vinculada."]),
  ].filter((line) => line !== "");

  // Do not turn absent data into a long document of empty headings/prompts.
  const visible = lines.filter((line, index) => {
    if (!line.startsWith("## ")) return true;
    for (let cursor = index + 1; cursor < lines.length && !lines[cursor].startsWith("## "); cursor++) {
      if (lines[cursor].trim()) return true;
    }
    return false;
  });
  return visible.join("\n").slice(0, 8000);
}

/** Pure projection, also used by the human-review transaction so its two saved
 * copies cannot lag behind the facts that were just corrected. */
export function buildLeadCommercialDossier(input: UpsertLeadCommercialDossierInput, persisted: {
  lead: Record<string, unknown>; generation: Timestamp;
}) {
  const tenantId = clean(input.tenantId, 140);
  const leadId = clean(input.leadId, 180);
  const lead = persisted.lead;
  const fence = input.conversationFence;

  const customFields = asRecord(lead.customFields);
  const aiMemory = {
    ...(input.leadMemory || {}),
    ...asRecord(lead.aiMemory),
  };
  const plan = input.plan || null;
  const leadName = firstValue(lead.nome, lead.name, lead.leadName, aiMemory.preferredName);
  const company = firstValue(lead.empresa, lead.company, customFields.empresa);
  const source = firstValue(lead.origem, lead.sourceLabel, lead.sourceType, lead.channel);
  const objective = currentCommercialField(lead, "primaryGoal", [aiMemory.primaryGoal]).value;
  const businessType = currentCommercialField(lead, "businessType", [aiMemory.businessType]).value;
  const budget = currentCommercialField(lead, "budgetBand", [aiMemory.budgetBand]).value;
  const urgency = currentCommercialField(lead, "urgency", [aiMemory.urgency]).value;
  const currentChannels = currentCommercialField(lead, "currentChannels", [aiMemory.currentChannels]).value;
  const digitalMaturity = currentCommercialField(lead, "digitalMaturity", [aiMemory.digitalMaturity]).value;
  const dominantObjection = currentCommercialField(lead, "dominantObjection", [aiMemory.dominantObjection]).value;
  const omitAnalysis = input.omitUnreviewedAnalysis === true || lead.aiCommercialAnalysisNeedsRefresh === true;
  const recommendedOffer = currentCommercialField(lead, "serviceInterest", omitAnalysis ? [] : [plan?.recommendedOffer, aiMemory.serviceInterest, lead.aiRecommendedOffer]).value;
  const nextAction = omitAnalysis ? "" : firstValue(plan?.nextAction, lead.aiNextAction);
  const diagnosis = omitAnalysis ? "" : firstValue(aiMemory.diagnosis, lead.aiDiagnosis, customFields.diagnostico_ia);
  const personalizedPlan = omitAnalysis ? "" : firstValue(aiMemory.personalizedPlan, lead.aiPersonalizedPlan, customFields.plano_personalizado_ia);
  const sellerNextMove = omitAnalysis ? "" : firstValue(aiMemory.sellerNextMove, lead.aiSellerNextMove, customFields.proximo_passo_vendedor_ia);
  const materialToSend = omitAnalysis ? "" : firstValue(aiMemory.materialToSend, lead.aiMaterialToSend, customFields.material_recomendado_ia);
  const proposalOutline = omitAnalysis ? "" : firstValue(aiMemory.proposalOutline, lead.aiProposalOutline);
  const summary = firstValue(
    omitAnalysis ? null : lead.aiLeadSummary,
    lead.notes,
    input.appointment?.notes,
  );
  const appointment = asRecord(input.appointment);
  const appointmentStart = firstValue(appointment.startAt);
  const qualification = asRecord(lead.qualification);
  const score = lead.scoreSource === "manual" ? cleanNumber(lead.score) : cleanNumber(qualification.score) ?? cleanNumber(lead.score);

  const painPoints = uniqueList([
    businessType ? `Tipo de negocio: ${businessType}` : null,
    objective ? `Objetivo registrado: ${objective}` : null,
    currentChannels ? `Canais atuais: ${currentChannels}` : null,
    digitalMaturity ? `Maturidade digital: ${digitalMaturity}` : null,
    budget ? `Faixa de investimento/orcamento: ${budget}` : null,
    urgency ? `Urgencia: ${urgency}` : null,
  ]);
  const objections = uniqueList([
    dominantObjection,
    plan?.objectionType ? `Objecao detectada: ${plan.objectionType}` : null,
  ]);
  const talkingPoints = uniqueList([
    objective ? `Objetivo registrado: ${objective}.` : null,
    recommendedOffer ? `Conectar a conversa com a oferta: ${recommendedOffer}.` : null,
    budget ? `Orçamento registrado: ${budget}.` : null,
    urgency ? `Prazo/urgência registrados: ${urgency}.` : null,
    dominantObjection ? `Tratar objecao com calma: ${dominantObjection}.` : null,
    diagnosis ? `Use o diagnostico da IA: ${diagnosis}.` : null,
    personalizedPlan ? `Apresente o plano sugerido sem soar como pacote generico: ${personalizedPlan}.` : null,
    sellerNextMove ? `Proximo movimento recomendado: ${sellerNextMove}.` : null,
    materialToSend ? `Se fizer sentido, envie ou cite o material: ${materialToSend}.` : null,
  ]);
  const questionsToAsk = uniqueList([
    plan?.nextQuestion,
  ]);
  const recentConversation = latestConversationLines(input.conversation);
  const title = `${triggerLabel(input.trigger)} - ${leadName || company || "Lead"}`;
  const sellerBrief = [
    summary,
    recommendedOffer ? `Oferta sugerida: ${recommendedOffer}.` : "",
    diagnosis ? `Diagnostico: ${diagnosis}.` : "",
    personalizedPlan ? `Plano sugerido: ${personalizedPlan}.` : "",
    sellerNextMove ? `Movimento do vendedor: ${sellerNextMove}.` : "",
    nextAction ? `Proximo passo: ${nextAction}.` : "",
    appointmentStart ? `Reuniao/agenda: ${appointmentStart}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const markdown = buildMarkdown({
    title,
    summary,
    leadName,
    company,
    source,
    objective,
    painPoints,
    recommendedOffer,
    nextAction,
    objections,
    diagnosis,
    personalizedPlan,
    sellerNextMove,
    materialToSend,
    proposalOutline,
    talkingPoints,
    questionsToAsk,
    recentConversation,
  });

  const dossier = {
    id: "commercial_dossier",
    title,
    status: triggerStatus(input.trigger),
    trigger: input.trigger,
    triggerLabel: triggerLabel(input.trigger),
    leadName: leadName || null,
    company: company || null,
    source: source || null,
    score,
    temperature: clean(plan?.commercialTemperature || lead.aiCommercialTemperature, 40) || null,
    objective: objective || null,
    recommendedOffer: recommendedOffer || null,
    nextAction: nextAction || null,
    diagnosis: diagnosis || null,
    personalizedPlan: personalizedPlan || null,
    sellerNextMove: sellerNextMove || null,
    materialToSend: materialToSend || null,
    proposalOutline: proposalOutline || null,
    summary,
    sellerBrief,
    painPoints,
    objections,
    talkingPoints,
    questionsToAsk,
    recentConversation,
    markdown,
    tenantId,
    leadId,
    sourceChatId: clean(input.chatId, 180) || null,
    sourceMessageId: fence?.messageId || null,
    sourceMessageVersion: fence?.messageVersion || null,
    sourceLeadGeneration: persisted.generation,
    sourceId: clean(input.sourceId, 240) || null,
    appointmentId: clean(input.appointmentId, 180) || null,
    updatedBy: clean(input.actorId, 160) || "ai_sales_agent",
    updatedByName: clean(input.actorName, 120) || "AI Sales Agent",
    updatedAt: FieldValue.serverTimestamp(),
    version: 1,
  };
  return dossier;
}

export async function upsertLeadCommercialDossier(input: UpsertLeadCommercialDossierInput) {
  const tenantId = clean(input.tenantId, 140);
  const leadId = clean(input.leadId, 180);
  if (!tenantId || !leadId) return null;
  const leadRef = adminDb.collection("leads").doc(leadId);
  // Caller snapshots may precede a human correction or even deletion/recreation.
  // Derive from the persisted record and compare its revision again at commit.
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists || leadSnap.data()?.tenantId !== tenantId) {
    if (input.conversationFence) throw new AgentCommercialContextChanged();
    return null;
  }
  if (input.lead?.tenantId && input.lead.tenantId !== tenantId) return null;
  const fence = input.conversationFence;
  if (fence && (fence.tenantId !== tenantId || fence.leadId !== leadId || input.chatId && fence.chatId !== input.chatId)) throw new AgentCommercialContextChanged();
  const dossier = buildLeadCommercialDossier(input, { lead: leadSnap.data()!, generation: leadSnap.createTime! });

  const {updatedAt: omittedUpdatedAt, ...content} = dossier;
  void omittedUpdatedAt;
  const fingerprint = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const documentRef = leadRef.collection("documents").doc("commercial_dossier");
  const eventRef = leadRef.collection("events").doc(`commercial_dossier_${fingerprint}`);
  return adminDb.runTransaction(async tx => {
    if (fence && !await matchesConversationCommercialFence(tx, fence)) throw new AgentCommercialContextChanged();
    const current = await tx.get(leadRef), document = await tx.get(documentRef), event = await tx.get(eventRef);
    let meetingRef: FirebaseFirestore.DocumentReference | null = null;
    if (input.assistedMeetingFence) {
      const expected = input.assistedMeetingFence;
      if (expected.ref.parent.id !== "assisted_meetings") return null;
      const meeting = await tx.get(expected.ref), source = meeting.data();
      if (!source || source.tenantId !== tenantId || source.leadId !== leadId || source.createdBy !== input.actorId || source.summary?.analysisMode !== "model" || source.dossierStatus !== "pending" ||
        !meeting.createTime?.isEqual(expected.createTime!) || !meeting.updateTime?.isEqual(expected.updateTime!) || !current.exists ||
        typeof source.sourceLeadGeneration?.isEqual !== "function" || !source.sourceLeadGeneration.isEqual(current.createTime) || !current.updateTime?.isEqual(meeting.updateTime!)) return null;
      const authority = await assertTransactionalTenantAuthority(tx, {tenantId, userId: String(input.actorId), capability: "edit_leads", module: "assisted_meetings"});
      await assertTransactionalTenantAuthority(tx, {tenantId, userId: String(input.actorId), capability: "edit_leads", module: "crm"});
      assertAssignedCommercialRecordAccess(authority, String(input.actorId), current.data()!);
      if (source.appointmentId) {
        if (typeof source.appointmentId !== "string" || source.appointmentId.includes("/")) return null;
        const appointment = await tx.get(adminDb.collection("appointments").doc(source.appointmentId));
        if (!appointment.exists || appointment.data()?.tenantId !== tenantId || appointment.data()?.leadId !== leadId ||
          typeof source.sourceAppointmentGeneration?.isEqual !== "function" || !source.sourceAppointmentGeneration.isEqual(appointment.createTime) ||
          !appointment.updateTime?.isEqual(meeting.updateTime!) || input.trigger === "appointment_completed" && appointment.data()?.status !== "completed") return null;
        assertAssignedCommercialRecordAccess(authority, String(input.actorId), appointment.data()!);
      } else if (input.trigger === "appointment_completed") return null;
      meetingRef = expected.ref;
    }
    if (!current.exists || current.data()?.tenantId !== tenantId || !current.createTime?.isEqual(leadSnap.createTime!)) {
      if (fence) throw new AgentCommercialContextChanged();
      return null;
    }
    if (document.exists && document.data()?.tenantId && document.data()?.tenantId !== tenantId) throw new Error("CRM_DOSSIER_DOCUMENT_IDENTITY_CONFLICT");
    if (document.exists) {
      const savedGeneration = document.data()?.sourceLeadGeneration;
      const created = document.createTime!, parentCreated = current.createTime!;
      const legacyPredatesParent = created.seconds < parentCreated.seconds || created.seconds === parentCreated.seconds && created.nanoseconds < parentCreated.nanoseconds;
      if (savedGeneration !== undefined && (!(savedGeneration instanceof Timestamp) || !savedGeneration.isEqual(parentCreated)) || savedGeneration === undefined && legacyPredatesParent) throw new Error("CRM_DOSSIER_DOCUMENT_GENERATION_CONFLICT");
    }
    if (event.exists) {
      if (event.data()?.tenantId !== tenantId || event.data()?.dossierFingerprint !== fingerprint) throw new Error("CRM_DOSSIER_EVENT_IDENTITY_CONFLICT");
      return current.data()?.commercialDossier || null;
    }
    if (!current.updateTime?.isEqual(leadSnap.updateTime!)) {
      if (fence) throw new AgentCommercialContextChanged();
      return null;
    }
    const saved = {...dossier, version: Math.max(0, Number(current.data()?.commercialDossier?.version) || 0) + 1, fingerprint};
    tx.update(leadRef, {commercialDossier: saved, commercialDossierUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    tx.set(documentRef, saved);
    tx.create(eventRef, {
      tenantId, dossierFingerprint: fingerprint, evidenceMessageId: fence?.messageId || null,
      type: "commercial_dossier_updated",
      title: "Brief comercial atualizado",
      detail: `${triggerLabel(input.trigger)} gerou um dossie comercial para o vendedor.`,
      actorId: dossier.updatedBy,
      actorName: dossier.updatedByName,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (meetingRef) tx.update(meetingRef, {dossierStatus: "done", dossierCompletedAt: FieldValue.serverTimestamp(), dossierFingerprint: fingerprint});
    return saved;
  });
}
