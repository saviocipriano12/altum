export type City = {
  slug: string;
  name: string;
  state: string;
  focus: string;
};

export const cities: City[] = [
  { slug: "sao-paulo-sp", name: "Sao Paulo", state: "SP", focus: "operacoes B2B e e-commerce de alta competicao" },
  { slug: "rio-de-janeiro-rj", name: "Rio de Janeiro", state: "RJ", focus: "clinicas, servicos e varejo local" },
  { slug: "belo-horizonte-mg", name: "Belo Horizonte", state: "MG", focus: "servicos recorrentes e vendas consultivas" },
  { slug: "curitiba-pr", name: "Curitiba", state: "PR", focus: "industria, tecnologia e educacao" },
  { slug: "porto-alegre-rs", name: "Porto Alegre", state: "RS", focus: "operacoes B2B de ciclo medio e longo" },
  { slug: "campinas-sp", name: "Campinas", state: "SP", focus: "tecnologia, saude e franquias" },
  { slug: "goiania-go", name: "Goiania", state: "GO", focus: "varejo e servicos de alta demanda local" },
  { slug: "fortaleza-ce", name: "Fortaleza", state: "CE", focus: "captacao regional com WhatsApp e automacao" },
];

export const getCityBySlug = (slug: string): City | null =>
  cities.find((city) => city.slug === slug) ?? null;
