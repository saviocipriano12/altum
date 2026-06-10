import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";

type ConversationMessageLike = {
  text?: string;
  sender?: string;
  type?: string;
  createdAt?: unknown;
};

type DossierTrigger =
  | "qualification_ready"
  | "handoff"
  | "appointment_scheduled"
  | "appointment_completed"
  | "proposal_draft"
  | "sale_won";

type UpsertLeadCommercialDossierInput = {
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
  if (trigger === "qualification_ready") return "Plano comercial pronto";
  if (trigger === "handoff") return "Handoff para humano";
  if (trigger === "appointment_scheduled") return "Reuniao marcada";
  if (trigger === "appointment_completed") return "Reuniao concluida";
  if (trigger === "proposal_draft") return "Proposta em rascunho";
  if (trigger === "sale_won") return "Venda ganha";
  return "Atualizacao comercial";
}

function triggerStatus(trigger: DossierTrigger) {
  if (trigger === "sale_won") return "won";
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
    input.objective || "Confirmar objetivo principal na proxima interacao.",
    "",
    "## Dores e sinais",
    ...(input.painPoints.length ? input.painPoints.map((item) => `- ${item}`) : ["- Mapear dores principais."]),
    "",
    "## Oferta recomendada",
    input.recommendedOffer || "Validar melhor oferta antes de apresentar proposta.",
    "",
    "## Diagnostico da IA",
    input.diagnosis || "Consolidar diagnostico com base na proxima resposta do lead.",
    "",
    "## Plano sugerido",
    input.personalizedPlan || "Definir plano com base no objetivo, urgencia e oferta indicada.",
    "",
    "## O que preparar",
    ...(uniqueList([input.sellerNextMove, input.materialToSend, input.proposalOutline], 6).length
      ? uniqueList([input.sellerNextMove, input.materialToSend, input.proposalOutline], 6).map((item) => `- ${item}`)
      : ["- Preparar abordagem consultiva e confirmar contexto do lead."]),
    "",
    "## Proxima acao",
    input.nextAction || "Definir proximo passo com o lead.",
    "",
    "## Objeccoes e riscos",
    ...(input.objections.length ? input.objections.map((item) => `- ${item}`) : ["- Sem objecao principal registrada ainda."]),
    "",
    "## Roteiro para o vendedor",
    ...(input.talkingPoints.length ? input.talkingPoints.map((item) => `- ${item}`) : ["- Comecar confirmando contexto e expectativa."]),
    "",
    "## Perguntas que faltam",
    ...(input.questionsToAsk.length ? input.questionsToAsk.map((item) => `- ${item}`) : ["- Nenhuma pergunta critica pendente."]),
    "",
    "## Ultimos sinais da conversa",
    ...(input.recentConversation.length ? input.recentConversation.map((item) => `- ${item}`) : ["- Sem conversa recente vinculada."]),
  ].filter((line) => line !== "");

  return lines.join("\n").slice(0, 8000);
}

export async function upsertLeadCommercialDossier(input: UpsertLeadCommercialDossierInput) {
  const tenantId = clean(input.tenantId, 120);
  const leadId = clean(input.leadId, 160);
  if (!tenantId || !leadId) return null;

  const leadRef = adminDb.collection("leads").doc(leadId);
  const leadSnap = input.lead ? null : await leadRef.get();
  const lead = {
    ...(leadSnap?.exists ? (leadSnap.data() as Record<string, unknown>) : {}),
    ...(input.lead || {}),
  };
  if (clean(lead.tenantId, 120) && clean(lead.tenantId, 120) !== tenantId) return null;

  const customFields = asRecord(lead.customFields);
  const aiMemory = {
    ...asRecord(lead.aiMemory),
    ...(input.leadMemory || {}),
  };
  const plan = input.plan || null;
  const leadName = firstValue(aiMemory.preferredName, lead.nome, lead.name, lead.leadName);
  const company = firstValue(lead.empresa, lead.company, customFields.empresa);
  const source = firstValue(lead.origem, lead.sourceLabel, lead.sourceType, lead.channel);
  const objective = firstValue(aiMemory.primaryGoal, customFields.objetivo_principal, lead.aiPrimaryGoal);
  const businessType = firstValue(aiMemory.businessType, customFields.nicho, lead.aiBusinessType);
  const budget = firstValue(aiMemory.budgetBand, customFields.orcamento, lead.aiBudgetBand);
  const urgency = firstValue(aiMemory.urgency, customFields.urgencia, lead.aiUrgency);
  const currentChannels = firstValue(aiMemory.currentChannels, customFields.canais_atuais, lead.aiCurrentChannels);
  const digitalMaturity = firstValue(aiMemory.digitalMaturity, customFields.maturidade_digital, lead.aiDigitalMaturity);
  const dominantObjection = firstValue(aiMemory.dominantObjection, customFields.objecao_principal, lead.aiDominantObjection);
  const recommendedOffer = firstValue(plan?.recommendedOffer, aiMemory.serviceInterest, lead.aiRecommendedOffer);
  const nextAction = firstValue(plan?.nextAction, lead.aiNextAction);
  const diagnosis = firstValue(aiMemory.diagnosis, lead.aiDiagnosis, customFields.diagnostico_ia);
  const personalizedPlan = firstValue(aiMemory.personalizedPlan, lead.aiPersonalizedPlan, customFields.plano_personalizado_ia);
  const sellerNextMove = firstValue(aiMemory.sellerNextMove, lead.aiSellerNextMove, customFields.proximo_passo_vendedor_ia);
  const materialToSend = firstValue(aiMemory.materialToSend, lead.aiMaterialToSend, customFields.material_recomendado_ia);
  const proposalOutline = firstValue(aiMemory.proposalOutline, lead.aiProposalOutline);
  const summary = firstValue(
    lead.aiLeadSummary,
    lead.notes,
    input.appointment?.notes,
    plan?.reason,
    "Brief criado automaticamente a partir dos sinais comerciais do lead."
  );
  const appointment = asRecord(input.appointment);
  const appointmentStart = firstValue(appointment.startAt);
  const qualification = asRecord(lead.qualification);
  const score = cleanNumber(qualification.score) ?? cleanNumber(lead.score);

  const painPoints = uniqueList([
    businessType ? `Tipo de negocio: ${businessType}` : null,
    objective ? `Objetivo declarado: ${objective}` : null,
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
    objective ? `Comecar confirmando que o objetivo principal e ${objective}.` : "Comecar confirmando objetivo principal e expectativa.",
    recommendedOffer ? `Conectar a conversa com a oferta: ${recommendedOffer}.` : null,
    budget ? `Validar se a faixa de investimento ${budget} ainda faz sentido.` : "Validar faixa de investimento sem pressionar cedo demais.",
    urgency ? `Explorar urgencia: ${urgency}.` : "Perguntar prazo ideal para resolver o problema.",
    dominantObjection ? `Tratar objecao com calma: ${dominantObjection}.` : null,
    diagnosis ? `Use o diagnostico da IA: ${diagnosis}.` : null,
    personalizedPlan ? `Apresente o plano sugerido sem soar como pacote generico: ${personalizedPlan}.` : null,
    sellerNextMove ? `Proximo movimento recomendado: ${sellerNextMove}.` : null,
    materialToSend ? `Se fizer sentido, envie ou cite o material: ${materialToSend}.` : null,
  ]);
  const questionsToAsk = uniqueList([
    !businessType ? "Qual e exatamente o tipo de negocio/segmento?" : null,
    !objective ? "Qual resultado principal voce quer alcancar agora?" : null,
    !budget ? "Existe uma faixa de investimento prevista?" : null,
    !urgency ? "Para quando voce precisa resolver isso?" : null,
    !firstValue(aiMemory.decisionMaker, customFields.decisor) ? "Quem participa da decisao final?" : null,
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
    sourceChatId: clean(input.chatId, 160) || null,
    sourceId: clean(input.sourceId, 160) || null,
    appointmentId: clean(input.appointmentId || input.sourceId, 160) || null,
    updatedBy: clean(input.actorId, 160) || "ai_sales_agent",
    updatedByName: clean(input.actorName, 120) || "AI Sales Agent",
    updatedAt: FieldValue.serverTimestamp(),
    version: 1,
  };

  await Promise.all([
    leadRef.set(
      {
        tenantId,
        commercialDossier: dossier,
        commercialDossierUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    leadRef.collection("documents").doc("commercial_dossier").set(dossier, { merge: true }),
    leadRef.collection("events").add({
      type: "commercial_dossier_updated",
      title: "Brief comercial atualizado",
      detail: `${triggerLabel(input.trigger)} gerou um dossie comercial para o vendedor.`,
      actorId: dossier.updatedBy,
      actorName: dossier.updatedByName,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return dossier;
}
