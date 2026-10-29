function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function deriveDeterministicConversationFields(inboundText: string) {
  const text = normalize(String(inboundText || "").slice(0, 1400));
  const extracted: Record<string, string> = {};
  const niches = ["imobiliaria", "clinica odontologica", "clinica medica", "clinica", "agencia", "advocacia", "consultoria", "construtora", "ecommerce", "loja", "escola", "restaurante", "hotel", "industria"];
  const niche = niches.find((item) => text.includes(item));
  if (niche) extracted.businessType = niche;
  const goals = [
    { terms: ["vender mais", "mais vendas", "aumentar vendas", "converter mais"], value: "aumentar vendas" },
    { terms: ["captar mais", "gerar mais leads", "mais leads", "mais oportunidades", "mais demanda"], value: "gerar mais leads qualificados" },
    { terms: ["organizar atendimento", "organizar comercial", "organizar vendas", "crm", "pipeline"], value: "organizar a operacao comercial" },
    { terms: ["responder mais rapido", "atendimento mais rapido"], value: "ganhar velocidade no atendimento" },
  ];
  const goal = goals.find((item) => item.terms.some((term) => text.includes(term)));
  if (goal) extracted.primaryGoal = goal.value;
  const channels = ["whatsapp", "instagram", "facebook", "google", "meta", "site", "landing page", "crm"].filter((channel) => text.includes(channel));
  if (channels.length) extracted.currentChannels = [...new Set(channels)].join(", ");
  return extracted;
}
