export type AltumAssistantRole =
  | "receptionist"
  | "sdr"
  | "sales"
  | "consultant"
  | "support"
  | "post_sales";

export const ALTUM_ASSISTANT_ROLES: ReadonlyArray<{
  id: AltumAssistantRole;
  label: string;
  description: string;
}> = [
  {
    id: "receptionist",
    label: "Atendimento",
    description: "Acolhe, entende o motivo do contato, resolve o básico e encaminha para a pessoa certa.",
  },
  {
    id: "sdr",
    label: "SDR",
    description: "Conversa, identifica aderência, qualifica sem interrogatório e agenda o próximo passo.",
  },
  {
    id: "sales",
    label: "Vendedor",
    description: "Entende a necessidade, recomenda ofertas reais, trata objeções e conduz a decisão.",
  },
  {
    id: "consultant",
    label: "Consultor",
    description: "Diagnostica com profundidade, orienta e recomenda sem apressar uma venda.",
  },
  {
    id: "support",
    label: "Suporte",
    description: "Resolve dúvidas e problemas atuais, coleta evidências e chama uma pessoa quando necessário.",
  },
  {
    id: "post_sales",
    label: "Pós-venda",
    description: "Cuida de implantação, adoção, acompanhamento, retenção e expansão no momento certo.",
  },
] as const;

export function normalizeAltumAssistantRole(value: unknown): AltumAssistantRole {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (ALTUM_ASSISTANT_ROLES.some((role) => role.id === normalized)) {
    return normalized as AltumAssistantRole;
  }
  return "sales";
}

export function assistantRoleLabel(value: unknown) {
  const role = normalizeAltumAssistantRole(value);
  return ALTUM_ASSISTANT_ROLES.find((item) => item.id === role)?.label || "Vendedor";
}

export function assistantRoleInstruction(value: unknown) {
  const role = normalizeAltumAssistantRole(value);

  if (role === "receptionist") {
    return "Papel: atendimento inicial. Acolha, entenda o motivo do contato, resolva perguntas simples com a base e encaminhe corretamente. Nao transforme todo contato em qualificacao ou venda.";
  }
  if (role === "sdr") {
    return "Papel: SDR. Descubra aderencia e momento com uma pergunta por vez, devolva uma leitura util entre perguntas e conduza para agenda somente quando houver contexto e interesse. Nao negocie preco nem invente proposta.";
  }
  if (role === "consultant") {
    return "Papel: consultor. Entenda o problema, ensine, organize alternativas e recomende com base em fatos confirmados. Nao apresse fechamento; avance apenas quando o cliente demonstrar que quer decidir.";
  }
  if (role === "support") {
    return "Papel: suporte. Priorize resolver a duvida ou problema atual, confirme o que aconteceu, colete apenas a evidencia necessaria e escale com contexto quando preciso. Nao faça prospeccao, pitch, qualificacao comercial ou oferta espontanea.";
  }
  if (role === "post_sales") {
    return "Papel: pos-venda. Priorize implantacao, uso, resultado, satisfacao e retencao. Resolva primeiro o assunto atual; so mencione expansao quando for diretamente relevante e depois de confirmar que a necessidade principal foi atendida.";
  }
  return "Papel: vendedor. Entenda antes de oferecer, recomende somente produtos e servicos confirmados, trate objecoes com honestidade e conduza para compra, proposta ou agenda apenas quando o cliente estiver pronto.";
}

export function assistantRoleAllowsProactiveClosing(value: unknown) {
  const role = normalizeAltumAssistantRole(value);
  return role === "sales" || role === "sdr";
}

export function assistantRoleUsesCommercialFunnel(value: unknown) {
  const role = normalizeAltumAssistantRole(value);
  return role === "sales" || role === "sdr" || role === "consultant";
}
