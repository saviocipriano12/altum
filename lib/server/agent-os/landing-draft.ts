import { normalizeCaptureLandingConfig, type CaptureLandingConfig } from "@/lib/capture-landing";

type Brand = { positioning?: string; audience?: string; tone?: string; offers?: string[] } | null;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function buildLandingDraft(input: { title: string; objective: string; brand: Brand }) {
  const positioning = clean(input.brand?.positioning, 220);
  const audience = clean(input.brand?.audience, 180);
  const offer = Array.isArray(input.brand?.offers) ? input.brand!.offers.map((item) => clean(item, 120)).filter(Boolean)[0] : "";
  const subject = clean(input.title.replace(/^Missão:\s*/i, ""), 110) || "Sua próxima oportunidade";
  const description = clean(input.objective, 420);
  const highlights = (Array.isArray(input.brand?.offers) ? input.brand!.offers.map((item) => clean(item, 150)).filter(Boolean) : []).slice(0, 4);
  const landing: CaptureLandingConfig = normalizeCaptureLandingConfig({
    badge: audience ? `Para ${audience}` : "Atendimento personalizado",
    heroTitle: subject,
    heroDescription: positioning || description || `Conheça uma solução pensada para quem quer avançar com mais clareza e resultado.${offer ? ` Comece por ${offer}.` : ""}`,
    ctaNote: "Envie seus dados. A equipe retorna com o próximo passo mais adequado para você.",
    formCardTitle: "Fale com a equipe",
    formCardDescription: "Preencha os dados para receber um atendimento personalizado.",
    highlights: highlights.length ? highlights : ["Atendimento com contexto", "Próximo passo claro", "Processo acompanhado pela equipe"],
    metrics: [{ label: "Atendimento", value: "Personalizado" }, { label: "Próximo passo", value: "Claro" }, { label: "Operação", value: "Acompanhada" }],
    testimonials: [],
    faq: [
      { question: "Como funciona o próximo passo?", answer: "Depois do envio, a equipe analisa suas informações e retorna com a melhor orientação." },
      { question: "Meus dados ficam protegidos?", answer: "Sim. Seus dados são usados apenas para viabilizar o atendimento solicitado." },
    ],
  });
  return { name: `Landing: ${subject}`.slice(0, 140), description: description || positioning || "Página de captura criada pela Altum.", landing };
}
