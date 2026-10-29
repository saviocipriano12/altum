import type {
  AiRoleCapability,
  CompiledAiRoleOperatingContract,
} from "@/lib/server/ai/role-operating-contract";
import type {
  AiSpecialist,
  AiSpecialistSupervisorDecision,
} from "@/lib/server/ai/specialist-supervisor";

export const AI_SPECIALIST_EXECUTION_VERSION = "specialist-execution-v1" as const;
export const AI_SPECIALIST_TIMEOUT_MS = 18_000;

export type AiSpecialistToolFamily =
  | "knowledge_read"
  | "relationship_read"
  | "crm_read"
  | "crm_write"
  | "calendar_read"
  | "calendar_write"
  | "proposal_prepare"
  | "checkout_prepare"
  | "support_context"
  | "request_evidence"
  | "human_handoff";

export type AiSpecialistTaskKind =
  | "triage"
  | "qualification"
  | "diagnosis"
  | "closing"
  | "support_resolution"
  | "retention"
  | "human_handoff";

export type AiSpecialistExecutionContract = {
  schemaVersion: typeof AI_SPECIALIST_EXECUTION_VERSION;
  specialist: AiSpecialist | null;
  taskKind: AiSpecialistTaskKind;
  allowedCapabilities: AiRoleCapability[];
  allowedTools: AiSpecialistToolFamily[];
  mutatingToolsAllowed: boolean;
  maxQuestions: number;
  timeoutMs: number;
  completionCriteria: string[];
  failSafe: "fallback_response" | "human_handoff";
  prompt: string;
};

export type AiSpecialistOutputValidation = {
  accepted: boolean;
  status: "accepted" | "restricted" | "fallback_required";
  blockedReasons: string[];
  decision: "respond" | "ask_more" | "handoff" | "skip";
  nextAction: string | null;
};

const TOOLS_BY_SPECIALIST: Record<AiSpecialist, AiSpecialistToolFamily[]> = {
  receptionist: ["knowledge_read", "relationship_read", "crm_read", "human_handoff"],
  sdr: ["knowledge_read", "relationship_read", "crm_read", "crm_write", "calendar_read", "calendar_write", "human_handoff"],
  sales: ["knowledge_read", "relationship_read", "crm_read", "crm_write", "calendar_read", "calendar_write", "proposal_prepare", "checkout_prepare", "human_handoff"],
  closer: ["knowledge_read", "relationship_read", "crm_read", "crm_write", "calendar_read", "calendar_write", "proposal_prepare", "checkout_prepare", "human_handoff"],
  consultant: ["knowledge_read", "relationship_read", "crm_read", "crm_write", "calendar_read", "calendar_write", "proposal_prepare", "request_evidence", "human_handoff"],
  support: ["knowledge_read", "relationship_read", "crm_read", "support_context", "request_evidence", "human_handoff"],
  post_sales: ["knowledge_read", "relationship_read", "crm_read", "crm_write", "support_context", "request_evidence", "calendar_read", "calendar_write", "human_handoff"],
};

const MUTATING_TOOLS = new Set<AiSpecialistToolFamily>([
  "crm_write",
  "calendar_write",
  "proposal_prepare",
  "checkout_prepare",
]);

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function inferTaskKind(decision: AiSpecialistSupervisorDecision): AiSpecialistTaskKind {
  if (decision.mode === "human_handoff") return "human_handoff";
  if (decision.selectedSpecialist === "support") return "support_resolution";
  if (decision.selectedSpecialist === "post_sales") return "retention";
  if (decision.selectedSpecialist === "closer") return "closing";
  if (decision.selectedSpecialist === "consultant") return "diagnosis";
  if (decision.selectedSpecialist === "sdr") return "qualification";
  return "triage";
}

function completionCriteria(kind: AiSpecialistTaskKind) {
  const criteria: Record<AiSpecialistTaskKind, string[]> = {
    triage: ["pedido atual respondido ou destino identificado", "no maximo uma pergunta util"],
    qualification: ["uma lacuna real reduzida", "contexto anterior preservado", "proximo passo sem fechamento indevido"],
    diagnosis: ["leitura util entregue", "recomendacao separada de fechamento", "hipoteses identificadas como hipoteses"],
    closing: ["barreira decisiva tratada", "condicoes limitadas a fatos verificados", "decisao ou proximo passo explicito"],
    support_resolution: ["sintoma reconhecido", "acao verificavel ou evidencia solicitada", "sem oferta comercial espontanea"],
    retention: ["incidente ou risco tratado antes de expansao", "continuidade de cliente preservada"],
    human_handoff: ["pedido humano respeitado", "contexto preservado para a equipe"],
  };
  return criteria[kind];
}

export function compileAiSpecialistExecutionContract(input: {
  supervisor: AiSpecialistSupervisorDecision;
  roleContract: CompiledAiRoleOperatingContract;
  autonomyMode: "copilot" | "hybrid" | "autonomous";
  tenantContextConfigured: boolean;
}): AiSpecialistExecutionContract {
  const specialist = input.supervisor.selectedSpecialist;
  const taskKind = inferTaskKind(input.supervisor);
  const baseTools = specialist ? TOOLS_BY_SPECIALIST[specialist] : ["human_handoff" as const];
  const mutatingToolsAllowed =
    input.autonomyMode !== "copilot" &&
    input.roleContract.readiness === "ready" &&
    input.tenantContextConfigured &&
    input.supervisor.mode !== "human_handoff";
  const allowedTools = baseTools.filter((tool) => mutatingToolsAllowed || !MUTATING_TOOLS.has(tool));
  const criteria = completionCriteria(taskKind);
  const failSafe = taskKind === "human_handoff" || taskKind === "support_resolution"
    ? "human_handoff"
    : "fallback_response";
  const maxQuestions = taskKind === "human_handoff" ? 0 : 1;
  const prompt = [
    `Contrato de execucao ${AI_SPECIALIST_EXECUTION_VERSION}.`,
    `Tarefa: ${taskKind}. Especialista: ${specialist || "humano"}.`,
    `Capacidades: ${input.roleContract.capabilities.join(", ") || "nenhuma"}.`,
    `Ferramentas disponiveis: ${allowedTools.join(", ") || "nenhuma"}.`,
    `Criterios de conclusao: ${criteria.join("; ")}.`,
    `Limite: ${maxQuestions} pergunta(s). Timeout operacional: ${AI_SPECIALIST_TIMEOUT_MS}ms.`,
    mutatingToolsAllowed
      ? "Acoes mutaveis continuam sujeitas ao planejador e as provas do tenant."
      : "Acoes mutaveis estao bloqueadas; responda, colete contexto seguro ou encaminhe.",
  ].join(" ");
  return {
    schemaVersion: AI_SPECIALIST_EXECUTION_VERSION,
    specialist,
    taskKind,
    allowedCapabilities: [...input.roleContract.capabilities],
    allowedTools,
    mutatingToolsAllowed,
    maxQuestions,
    timeoutMs: AI_SPECIALIST_TIMEOUT_MS,
    completionCriteria: criteria,
    failSafe,
    prompt,
  };
}

function requiredToolForAction(nextAction: string): AiSpecialistToolFamily | null {
  const value = clean(nextAction, 180).toLowerCase();
  if (!value) return null;
  if (/(checkout|pagamento|concluir_compra)/.test(value)) return "checkout_prepare";
  if (/(proposta|orcamento)/.test(value)) return "proposal_prepare";
  if (/(agendar|agenda|horario)/.test(value)) return "calendar_write";
  if (/(atualizar_crm|registrar_lead|mover_etapa)/.test(value)) return "crm_write";
  if (/(evidencia|print|comprovante)/.test(value)) return "request_evidence";
  if (/(humano|handoff|encaminhar)/.test(value)) return "human_handoff";
  return null;
}

export function validateAiSpecialistOutput(input: {
  contract: AiSpecialistExecutionContract;
  result: {
    decision?: string | null;
    responseText?: string | null;
    nextAction?: string | null;
  } | null;
}): AiSpecialistOutputValidation {
  if (!input.result || !clean(input.result.responseText, 1800)) {
    return {
      accepted: false,
      status: "fallback_required",
      blockedReasons: ["missing_specialist_response"],
      decision: input.contract.failSafe === "human_handoff" ? "handoff" : "respond",
      nextAction: null,
    };
  }
  const rawDecision = clean(input.result.decision, 40).toLowerCase();
  const decision = (["respond", "ask_more", "handoff", "skip"].includes(rawDecision)
    ? rawDecision
    : "respond") as AiSpecialistOutputValidation["decision"];
  const nextAction = clean(input.result.nextAction, 180) || null;
  const requiredTool = requiredToolForAction(nextAction || "");
  const blockedReasons: string[] = [];
  if (requiredTool && !input.contract.allowedTools.includes(requiredTool)) {
    blockedReasons.push(`tool_not_allowed:${requiredTool}`);
  }
  // Limites de forma sao reparados pelo compositor final, que recebe contexto
  // de canal e memoria. Este contrato bloqueia apenas capacidade ou acao proibida.
  if (input.contract.taskKind === "human_handoff" && decision !== "handoff") {
    blockedReasons.push("human_handoff_not_respected");
  }
  return {
    accepted: blockedReasons.length === 0,
    status: blockedReasons.length ? "restricted" : "accepted",
    blockedReasons,
    decision: blockedReasons.includes("human_handoff_not_respected") ? "handoff" : decision,
    nextAction: requiredTool && blockedReasons.length ? null : nextAction,
  };
}
