const DEFAULT_COVER_IMAGE = "/covers/cover-default.svg";

const CATEGORY_COVER_MAP: Record<string, string> = {
  "engenharia de vendas": "/covers/cover-engenharia-vendas.svg",
  qualificacao: "/covers/cover-qualificacao.svg",
  metricas: "/covers/cover-metricas.svg",
  "operacao comercial": "/covers/cover-operacao-comercial.svg",
  automacao: "/covers/cover-automacao.svg",
  whatsapp: "/covers/cover-whatsapp.svg",
  chatbot: "/covers/cover-chatbot.svg",
  b2b: "/covers/cover-b2b.svg",
  growth: "/covers/cover-growth.svg",
  estrategia: "/covers/cover-estrategia.svg",
};

export const normalizeCategory = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export const getCoverImageForCategory = (category: string): string =>
  CATEGORY_COVER_MAP[normalizeCategory(category)] ?? DEFAULT_COVER_IMAGE;

export const resolveBlogCoverImage = (coverImage: string | undefined, category: string): string => {
  if (typeof coverImage === "string" && coverImage.trim().length > 0) {
    return coverImage.trim();
  }

  return getCoverImageForCategory(category);
};

export const blogCoverImageMap = CATEGORY_COVER_MAP;
