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
  if (action === "tratar_objecao_orcamento") return "Tratar objecao de orcamento";
  if (action === "tratar_objecao_tempo") return "Tratar objecao de tempo";
  if (action === "tratar_objecao_confianca") return "Tratar objecao de confianca";
  if (action === "tratar_objecao_suave") return "Tratar objecao suave";
  if (action === "retomar_qualificacao_sem_reset") return "Retomar qualificacao sem resetar a conversa";
  if (action === "abrir_descoberta_comercial") return "Abrir descoberta comercial";
  if (action === "esclarecer_oferta_e_mapear_foco") return "Esclarecer oferta e mapear foco";
  if (action === "qualificar_antes_de_preco") return "Qualificar antes de falar de preco";
  if (action === "conduzir_para_diagnostico_ou_reuniao") return "Conduzir para diagnostico ou reuniao";
  if (action === "coletar_contexto_comercial_minimo") return "Coletar contexto comercial minimo";
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
    nextAction === "tratar_objecao_orcamento" ||
    nextAction === "tratar_objecao_tempo" ||
    nextAction === "tratar_objecao_confianca" ||
    nextAction === "tratar_objecao_suave"
  ) {
    return findStage([/negociacao/, /proposta/, /qualific/, /triagem/]) || normalizedStages[1] || normalizedStages[0] || null;
  }

  if (
    nextAction === "conduzir_para_proximo_passo" ||
    nextAction === "aprofundar_oportunidade" ||
    nextAction === "qualificar_contexto_minimo" ||
    nextAction === "coletar_campos_obrigatorios" ||
    nextAction === "retomar_qualificacao_sem_reset" ||
    nextAction === "abrir_descoberta_comercial" ||
    nextAction === "esclarecer_oferta_e_mapear_foco" ||
    nextAction === "qualificar_antes_de_preco" ||
    nextAction === "conduzir_para_diagnostico_ou_reuniao" ||
    nextAction === "coletar_contexto_comercial_minimo"
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

  if (
    nextAction === "tratar_objecao_orcamento" ||
    nextAction === "tratar_objecao_tempo" ||
    nextAction === "tratar_objecao_confianca" ||
    nextAction === "tratar_objecao_suave"
  ) {
    return {
      title: `Retomar objecao comercial com ${contact}`,
      type: "follow_up",
      priority: "high",
    };
  }

  return {
    title: `Retomar contexto comercial de ${contact}`,
    type: "follow_up",
    priority:
      nextAction === "coletar_campos_obrigatorios" || nextAction === "coletar_contexto_comercial_minimo"
        ? "high"
        : "medium",
  };
}
