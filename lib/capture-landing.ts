export type CaptureLandingMetric = {
  label: string;
  value: string;
};

export type CaptureLandingTestimonial = {
  quote: string;
  author: string;
  role?: string;
};

export type CaptureLandingFaq = {
  question: string;
  answer: string;
};

export type CaptureLandingConfig = {
  badge: string;
  heroTitle: string;
  heroDescription: string;
  ctaNote: string;
  formCardTitle: string;
  formCardDescription: string;
  highlights: string[];
  metrics: CaptureLandingMetric[];
  testimonials: CaptureLandingTestimonial[];
  faq: CaptureLandingFaq[];
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanStringList(value: unknown, maxItems = 8, maxLength = 180) {
  const source = Array.isArray(value) ? value : [];
  return source.map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function cleanMetrics(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => {
      const metric = item as Record<string, unknown>;
      return {
        label: clean(metric?.label, 80),
        value: clean(metric?.value, 80),
      };
    })
    .filter((item) => item.label && item.value)
    .slice(0, 6);
}

function cleanTestimonials(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => {
      const testimonial = item as Record<string, unknown>;
      return {
        quote: clean(testimonial?.quote, 260),
        author: clean(testimonial?.author, 80),
        role: clean(testimonial?.role, 80),
      };
    })
    .filter((item) => item.quote && item.author)
    .slice(0, 6);
}

function cleanFaq(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => {
      const faq = item as Record<string, unknown>;
      return {
        question: clean(faq?.question, 180),
        answer: clean(faq?.answer, 320),
      };
    })
    .filter((item) => item.question && item.answer)
    .slice(0, 8);
}

export function defaultCaptureLandingConfig(): CaptureLandingConfig {
  return {
    badge: "Lead intake premium",
    heroTitle: "",
    heroDescription: "",
    ctaNote: "Resposta comercial com contexto e roteamento para CRM, inbox e automações.",
    formCardTitle: "Solicite um contato",
    formCardDescription: "Preencha os dados abaixo para entrar no fluxo comercial desta operação.",
    highlights: [],
    metrics: [
      { label: "Roteamento", value: "Tenant isolado" },
      { label: "Atendimento", value: "IA + humano" },
      { label: "Operação", value: "CRM integrado" },
    ],
    testimonials: [],
    faq: [],
  };
}

export function normalizeCaptureLandingConfig(value: unknown): CaptureLandingConfig {
  const source = (value || {}) as Record<string, unknown>;
  const defaults = defaultCaptureLandingConfig();
  return {
    badge: clean(source.badge, 80) || defaults.badge,
    heroTitle: clean(source.heroTitle, 160),
    heroDescription: clean(source.heroDescription, 420),
    ctaNote: clean(source.ctaNote, 180) || defaults.ctaNote,
    formCardTitle: clean(source.formCardTitle, 120) || defaults.formCardTitle,
    formCardDescription: clean(source.formCardDescription, 220) || defaults.formCardDescription,
    highlights: cleanStringList(source.highlights, 8, 180),
    metrics: cleanMetrics(source.metrics).length ? cleanMetrics(source.metrics) : defaults.metrics,
    testimonials: cleanTestimonials(source.testimonials),
    faq: cleanFaq(source.faq),
  };
}
