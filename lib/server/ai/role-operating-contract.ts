import { createHash } from "node:crypto";
import {
  normalizeAltumAssistantRole,
  type AltumAssistantRole,
} from "@/lib/ai-assistant-role";

export const AI_ROLE_CONTRACT_VERSION = "role-operating-contract-v1" as const;

export type AiRoleCapability =
  | "answer"
  | "triage"
  | "qualify"
  | "diagnose"
  | "recommend"
  | "schedule"
  | "prepare_proposal"
  | "handle_objection"
  | "close"
  | "support"
  | "request_evidence"
  | "follow_up"
  | "retain"
  | "expand"
  | "handoff";

export type AiOperationalAction =
  | "answer_question"
  | "capture_basic_context"
  | "qualify_lead"
  | "diagnose_need"
  | "recommend_offer"
  | "schedule_next_step"
  | "prepare_proposal"
  | "handle_objection"
  | "complete_purchase"
  | "resolve_support"
  | "request_evidence"
  | "run_follow_up"
  | "protect_retention"
  | "suggest_expansion"
  | "handoff_human";

type RoleDefinition = {
  mission: string;
  turnProtocol: string;
  capabilities: AiRoleCapability[];
  successSignals: string[];
  forbiddenActions: string[];
  requiredSignals: Array<"business" | "objective" | "ideal_customer" | "qualification" | "offer" | "proposal" | "escalation">;
};

const ROLE_DEFINITIONS: Record<AltumAssistantRole, RoleDefinition> = {
  receptionist: {
    mission: "Acolher, identificar o motivo do contato, resolver o basico confirmado e encaminhar sem criar uma venda artificial.",
    turnProtocol: "Responda o pedido atual; se faltar destino, faca uma unica pergunta para identificar o assunto.",
    capabilities: ["answer", "triage", "request_evidence", "handoff"],
    successSignals: ["motivo do contato identificado", "duvida simples resolvida", "encaminhamento com contexto"],
    forbiddenActions: ["qualificar comercialmente sem pedido", "recomendar oferta espontanea", "negociar ou fechar"],
    requiredSignals: ["business", "objective", "escalation"],
  },
  sdr: {
    mission: "Confirmar aderencia, necessidade, momento e proximo passo com descoberta curta e util.",
    turnProtocol: "Use uma unica lacuna de qualificacao por turno, devolva uma leitura util e encerre com no maximo uma pergunta. Ao surgir proposta ou negociacao, organize o contexto e encaminhe ao closer.",
    capabilities: ["answer", "qualify", "diagnose", "schedule", "follow_up", "handoff"],
    successSignals: ["aderencia confirmada", "lacunas de qualificacao reduzidas", "reuniao ou encaminhamento adequado"],
    forbiddenActions: ["emitir proposta", "negociar preco ou desconto", "forcar fechamento", "repetir perguntas ja respondidas"],
    requiredSignals: ["business", "objective", "ideal_customer", "qualification", "escalation"],
  },
  sales: {
    mission: "Entender a necessidade, recomendar somente ofertas verificadas, tratar objecoes e facilitar a decisao.",
    turnProtocol: "Conecte necessidade e oferta verificada, responda a objecao principal e proponha somente um proximo passo claro.",
    capabilities: ["answer", "qualify", "diagnose", "recommend", "schedule", "prepare_proposal", "handle_objection", "close", "follow_up", "handoff"],
    successSignals: ["necessidade conectada a oferta real", "objecao respondida com evidencia", "decisao ou proximo passo claro"],
    forbiddenActions: ["inventar oferta ou condicao", "oferecer antes de compreender", "pressionar sem intencao"],
    requiredSignals: ["business", "objective", "ideal_customer", "offer", "proposal", "escalation"],
  },
  closer: {
    mission: "Usar o diagnostico existente para remover a barreira decisiva e conduzir proposta, compra ou agenda com precisao.",
    turnProtocol: "Nao reabra descoberta. Responda primeiro a barreira final usando apenas condicoes documentadas. Se faltar um dado decisivo, explique exatamente o que precisa ser confirmado e faca no maximo uma pergunta total, nunca duas perguntas na mesma mensagem.",
    capabilities: ["answer", "diagnose", "recommend", "schedule", "prepare_proposal", "handle_objection", "close", "follow_up", "handoff"],
    successSignals: ["objecao decisiva identificada", "condicoes confirmadas", "decisao explicita registrada"],
    forbiddenActions: ["nao reiniciar qualificacao generica", "nao inventar desconto, prazo ou garantia", "nao pressionar sem prontidao", "nao ocultar risco ou limite"],
    requiredSignals: ["business", "objective", "offer", "proposal", "escalation"],
  },
  consultant: {
    mission: "Diagnosticar, ensinar e recomendar um caminho sustentado por fatos, sem apressar fechamento.",
    turnProtocol: "Entregue uma leitura ou orientacao antes da proxima pergunta e separe recomendacao de fechamento.",
    capabilities: ["answer", "qualify", "diagnose", "recommend", "schedule", "prepare_proposal", "request_evidence", "handoff"],
    successSignals: ["problema e impacto compreendidos", "alternativas organizadas", "recomendacao justificada"],
    forbiddenActions: ["pressionar fechamento", "negociar condicoes", "pular diagnostico para ofertar"],
    requiredSignals: ["business", "objective", "ideal_customer", "offer", "escalation"],
  },
  support: {
    mission: "Resolver o problema atual, coletar a evidencia minima e escalar com contexto quando a resolucao nao for segura.",
    turnProtocol: "Confirme o sintoma, forneca uma acao verificavel ou solicite uma unica evidencia e confirme a resolucao antes de encerrar.",
    capabilities: ["answer", "triage", "support", "request_evidence", "handoff"],
    successSignals: ["problema reproduzido ou entendido", "orientacao verificavel", "resolucao confirmada ou escalada completa"],
    forbiddenActions: ["prospectar", "qualificar oportunidade", "ofertar espontaneamente", "prometer correcao sem evidencia"],
    requiredSignals: ["business", "objective", "escalation"],
  },
  post_sales: {
    mission: "Garantir implantacao, adocao, resultado e retencao; expansao so depois de resolver a necessidade principal.",
    turnProtocol: "Resolva risco, incidente ou bloqueio antes de falar em expansao e confirme se a necessidade principal foi atendida.",
    capabilities: ["answer", "triage", "support", "request_evidence", "follow_up", "retain", "expand", "handoff"],
    successSignals: ["uso ou implantacao avancou", "risco de churn tratado", "resultado acompanhado"],
    forbiddenActions: ["fazer upsell durante incidente", "ignorar insatisfacao", "prometer resultado nao medido"],
    requiredSignals: ["business", "objective", "offer", "escalation"],
  },
};

const ACTION_CAPABILITY: Record<AiOperationalAction, AiRoleCapability> = {
  answer_question: "answer",
  capture_basic_context: "triage",
  qualify_lead: "qualify",
  diagnose_need: "diagnose",
  recommend_offer: "recommend",
  schedule_next_step: "schedule",
  prepare_proposal: "prepare_proposal",
  handle_objection: "handle_objection",
  complete_purchase: "close",
  resolve_support: "support",
  request_evidence: "request_evidence",
  run_follow_up: "follow_up",
  protect_retention: "retain",
  suggest_expansion: "expand",
  handoff_human: "handoff",
};

export type CompiledAiRoleOperatingContract = {
  schemaVersion: typeof AI_ROLE_CONTRACT_VERSION;
  fingerprint: string;
  tenantId: string;
  role: AltumAssistantRole;
  mission: string;
  capabilities: AiRoleCapability[];
  successSignals: string[];
  forbiddenActions: string[];
  readiness: "ready" | "restricted";
  missingSignals: string[];
  prompt: string;
};

function present(value: unknown) {
  return typeof value === "string" && value.replace(/\s+/g, " ").trim().length >= 4;
}

export function roleAllowsOperationalAction(role: unknown, action: AiOperationalAction) {
  const normalizedRole = normalizeAltumAssistantRole(role);
  return ROLE_DEFINITIONS[normalizedRole].capabilities.includes(ACTION_CAPABILITY[action]);
}

export function compileAiRoleOperatingContract(input: {
  tenantId: string;
  role: unknown;
  businessSummary?: string;
  objective?: string;
  idealCustomer?: string;
  mandatoryQuestions?: string[];
  hasVerifiedOffers?: boolean;
  proposalStyle?: string;
  escalationTopics?: string[];
}): CompiledAiRoleOperatingContract {
  const role = normalizeAltumAssistantRole(input.role);
  const definition = ROLE_DEFINITIONS[role];
  const available: Record<RoleDefinition["requiredSignals"][number], boolean> = {
    business: present(input.businessSummary),
    objective: present(input.objective),
    ideal_customer: present(input.idealCustomer),
    qualification: Boolean(input.mandatoryQuestions?.some(present)),
    offer: input.hasVerifiedOffers === true,
    proposal: present(input.proposalStyle),
    escalation: Boolean(input.escalationTopics?.some(present)),
  };
  const missingSignals = definition.requiredSignals.filter((signal) => !available[signal]);
  const readiness = missingSignals.length ? "restricted" : "ready";
  const prompt = [
    `Contrato operacional ${AI_ROLE_CONTRACT_VERSION}. Papel efetivo: ${role}.`,
    `Missao: ${definition.mission}`,
    `Protocolo do turno: ${definition.turnProtocol}`,
    `Capacidades permitidas: ${definition.capabilities.join(", ")}.`,
    `Sinais de sucesso: ${definition.successSignals.join("; ")}.`,
    `Proibicoes do papel: ${definition.forbiddenActions.join("; ")}.`,
    readiness === "restricted"
      ? `Modo restrito por configuracao incompleta (${missingSignals.join(", ")}). Responda e colete contexto seguro, mas nao execute proposta, negociacao, fechamento ou promessa operacional sem evidencias configuradas.`
      : "Configuracao minima do papel presente. Ainda assim, fatos comerciais dependem de evidencia verificavel.",
  ].join("\n");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      schemaVersion: AI_ROLE_CONTRACT_VERSION,
      tenantId: input.tenantId,
      role,
      capabilities: definition.capabilities,
      readiness,
      missingSignals,
      businessSummary: input.businessSummary || "",
      objective: input.objective || "",
      idealCustomer: input.idealCustomer || "",
      mandatoryQuestions: input.mandatoryQuestions || [],
      hasVerifiedOffers: input.hasVerifiedOffers === true,
      proposalStyle: input.proposalStyle || "",
      escalationTopics: input.escalationTopics || [],
    }))
    .digest("hex")
    .slice(0, 24);

  return {
    schemaVersion: AI_ROLE_CONTRACT_VERSION,
    fingerprint,
    tenantId: input.tenantId,
    role,
    mission: definition.mission,
    capabilities: [...definition.capabilities],
    successSignals: [...definition.successSignals],
    forbiddenActions: [...definition.forbiddenActions],
    readiness,
    missingSignals,
    prompt,
  };
}
