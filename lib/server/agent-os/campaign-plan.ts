type Brand = { positioning?: string; audience?: string; tone?: string; offers?: string[]; restrictions?: string[] } | null;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** A commercial campaign brief that is useful before any paid render or media
 * buy. It is deliberately provider-neutral: the creative router chooses the
 * implementation only after the person approves an actual asset. */
export function buildCampaignPlan(input: { title: string; objective: string; brand: Brand }) {
  const audience = clean(input.brand?.audience, 180) || "o público prioritário";
  const offer = Array.isArray(input.brand?.offers) ? input.brand.offers.map((item) => clean(item, 140)).find(Boolean) || "a oferta principal" : "a oferta principal";
  const positioning = clean(input.brand?.positioning, 260) || `uma proposta clara para ${audience}`;
  const tone = clean(input.brand?.tone, 120) || "direto, humano e responsável";
  const restriction = Array.isArray(input.brand?.restrictions) ? input.brand.restrictions.map((item) => clean(item, 160)).find(Boolean) || "não prometer resultados sem evidência" : "não prometer resultados sem evidência";
  const campaignName = clean(input.title.replace(/^Missão:\s*/i, ""), 120) || "Nova campanha";
  return {
    name: `Campanha: ${campaignName}`.slice(0, 140),
    objective: clean(input.objective, 600),
    audience,
    positioning,
    offer,
    tone,
    guardrail: restriction,
    hypothesis: `Se apresentarmos ${offer} como ${positioning} para ${audience}, com uma mensagem ${tone}, aumentaremos conversas qualificadas sem depender de promessas genéricas.`,
    funnel: [
      { stage: "Descoberta", goal: "Tornar a dor e a mudança desejada reconhecíveis.", asset: "Vídeo curto ou imagem de impacto" },
      { stage: "Consideração", goal: "Explicar o método, a prova e a diferença da oferta.", asset: "Carrossel educativo e página de captura" },
      { stage: "Conversão", goal: "Convidar para uma conversa com um próximo passo claro.", asset: "Landing page e CTA de atendimento" },
    ],
    assetMatrix: [
      { kind: "Vídeo principal", purpose: "Gancho, demonstração e CTA", status: "draft" },
      { kind: "Imagem estática", purpose: "Teste de ângulo e benefício", status: "draft" },
      { kind: "Carrossel", purpose: "Educação e objeções", status: "draft" },
      { kind: "Copy", purpose: "Legenda, anúncio e variações de CTA", status: "draft" },
      { kind: "Landing page", purpose: "Captar e qualificar interesse", status: "draft" },
    ],
    measurement: ["Conversas qualificadas", "Custo por conversa", "Taxa de conversão da landing", "Aprendizado por ângulo criativo"],
  };
}
