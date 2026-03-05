export type Segment = {
  slug: string;
  name: string;
  pain: string;
  offer: string;
};

export const segments: Segment[] = [
  { slug: "ecommerce", name: "E-commerce", pain: "trafego sem conversao previsivel", offer: "escala de vendas com funil e WhatsApp" },
  { slug: "clinicas", name: "Clinicas", pain: "agenda instavel e leads sem perfil", offer: "captacao qualificada e confirmacao automatica" },
  { slug: "lojas", name: "Lojas", pain: "fluxo irregular e baixo ticket medio", offer: "campanhas locais com recorrencia" },
  { slug: "servicos-b2b", name: "Servicos B2B", pain: "pipeline sem previsibilidade", offer: "qualificacao com IA e operacao comercial" },
  { slug: "educacao", name: "Educacao", pain: "matriculas oscilando por sazonalidade", offer: "geracao de demanda por curso e perfil" },
  { slug: "saude", name: "Saude", pain: "alto volume de curiosos no WhatsApp", offer: "triagem automatica e agenda qualificada" },
  { slug: "industria", name: "Industria", pain: "ciclo longo e pre-venda sobrecarregada", offer: "captacao tecnica e lead scoring" },
  { slug: "franquias", name: "Franquias", pain: "candidatos sem perfil financeiro", offer: "filtro por capital e prontidao" },
];

export const getSegmentBySlug = (slug: string): Segment | null =>
  segments.find((segment) => segment.slug === slug) ?? null;
