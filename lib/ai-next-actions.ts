export function humanizeAiNextAction(value?: string | null) {
  const action = String(value || "").trim().toLowerCase();
  if (!action) return "Sem proximo passo definido";
  if (action === "assumir_handoff_humano") return "Assumir handoff humano";
  if (action === "qualificar_contexto_minimo") return "Qualificar contexto minimo";
  if (action === "coletar_campos_obrigatorios") return "Coletar campos obrigatorios";
  if (action === "conduzir_para_proximo_passo") return "Conduzir para o proximo passo";
  if (action === "aprofundar_oportunidade") return "Aprofundar oportunidade";
  if (action === "preparar_proposta_comercial") return "Preparar proposta comercial";
  if (action === "agendar_proximo_passo") return "Agendar proximo passo";
  if (action.startsWith("sugerir_oferta_")) return "Sugerir oferta comercial";

  return action.replaceAll("_", " ");
}

export function suggestPipelineStageForAiAction(action: string | null | undefined, stages: string[]) {
  const normalizedStages = stages.map((stage) => String(stage || "").trim()).filter(Boolean);
  const nextAction = String(action || "").trim().toLowerCase();
  if (!nextAction || !normalizedStages.length) return null;

  const findStage = (patterns: RegExp[]) =>
    normalizedStages.find((stage) => patterns.some((pattern) => pattern.test(stage))) || null;

  if (nextAction === "preparar_proposta_comercial" || nextAction.startsWith("sugerir_oferta_")) {
    return findStage([/proposta/, /orcamento/, /negociacao/]);
  }

  if (nextAction === "agendar_proximo_passo") {
    return findStage([/agendamento/, /visita/, /avaliacao/, /diagnostico/, /reuniao/]);
  }

  if (
    nextAction === "conduzir_para_proximo_passo" ||
    nextAction === "aprofundar_oportunidade" ||
    nextAction === "qualificar_contexto_minimo" ||
    nextAction === "coletar_campos_obrigatorios"
  ) {
    return findStage([/qualific/, /triagem/, /contato/, /respond/, /negociacao/]) || normalizedStages[1] || normalizedStages[0] || null;
  }

  return null;
}

export function buildAiTaskPreset(action: string | null | undefined, leadName?: string | null) {
  const contact = String(leadName || "lead").trim() || "lead";
  const nextAction = String(action || "").trim().toLowerCase();

  if (nextAction === "agendar_proximo_passo") {
    return {
      title: `Agendar proximo passo com ${contact}`,
      type: "reuniao",
      priority: "high",
    };
  }

  if (nextAction === "preparar_proposta_comercial" || nextAction.startsWith("sugerir_oferta_")) {
    return {
      title: `Preparar proposta para ${contact}`,
      type: "proposta",
      priority: "high",
    };
  }

  if (nextAction === "assumir_handoff_humano") {
    return {
      title: `Assumir atendimento humano de ${contact}`,
      type: "pendencia",
      priority: "high",
    };
  }

  return {
    title: `Retomar contexto comercial de ${contact}`,
    type: "follow_up",
    priority: nextAction === "coletar_campos_obrigatorios" ? "high" : "medium",
  };
}
