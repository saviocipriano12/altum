export type CommercialInterestId =
  | "plataforma"
  | "demonstracao"
  | "implantacao"
  | "agencia"
  | "estrutura_digital"
  | "diagnostico"
  | "geral";

export type CommercialInterest = {
  id: CommercialInterestId;
  title: string;
  shortLabel: string;
  description: string;
};

export const commercialInterests: readonly CommercialInterest[] = [
  {
    id: "plataforma",
    title: "Altum Plataforma",
    shortLabel: "Plataforma",
    description: "Quero contratar a plataforma e entender plano, setup e entrada operacional.",
  },
  {
    id: "demonstracao",
    title: "Demonstração da Altum",
    shortLabel: "Demonstração",
    description: "Quero ver a plataforma aplicada ao processo comercial da minha empresa.",
  },
  {
    id: "implantacao",
    title: "Implantacao Altum",
    shortLabel: "Implantacao",
    description: "Quero ajuda para subir com funil, canais, agenda, IA e operacao mais redonda.",
  },
  {
    id: "agencia",
    title: "Altum Agencia",
    shortLabel: "Agencia",
    description: "Quero proposta para site, landing page, loja virtual, trafego ou growth.",
  },
  {
    id: "estrutura_digital",
    title: "Estrutura Digital",
    shortLabel: "Estrutura Digital",
    description: "Quero uma proposta mais completa, unindo captacao, WhatsApp, plataforma e implantacao.",
  },
  {
    id: "diagnostico",
    title: "Diagnostico Altum",
    shortLabel: "Diagnostico",
    description: "Quero passar por uma leitura inicial para entender qual oferta faz mais sentido.",
  },
  {
    id: "geral",
    title: "Contato comercial",
    shortLabel: "Geral",
    description: "Quero ajuda para entender o melhor proximo passo comercial com a Altum.",
  },
] as const;

export const publicCommercialInterests = commercialInterests.filter(
  (item) => item.id !== "agencia" && item.id !== "estrutura_digital" && item.id !== "diagnostico",
);

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizeCommercialInterest(value: unknown): CommercialInterestId {
  const normalized = clean(value, 120).toLowerCase();
  return commercialInterests.find((item) => item.id === normalized)?.id || "geral";
}

export function getCommercialInterest(value: unknown) {
  const id = normalizeCommercialInterest(value);
  return commercialInterests.find((item) => item.id === id) || commercialInterests.find((item) => item.id === "geral")!;
}

export function buildCommercialContactUrl(interest: CommercialInterestId, from?: string) {
  const params = new URLSearchParams({ interest });
  if (from) params.set("from", from);
  return `/contato?${params.toString()}#formulario-comercial`;
}
