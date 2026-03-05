export type Vertical = {
  slug: string;
  name: string;
  title: string;
  description: string;
  commonProblems: string[];
  howWeSolve: string[];
  examples: string[];
};

type VerticalSeed = {
  slug: string;
  name: string;
  offer: string;
  leadProfile: string;
  highValueExample: string;
};

const seeds: VerticalSeed[] = [
  { slug: "imobiliarias", name: "Imobiliarias", offer: "imoveis residenciais e comerciais", leadProfile: "comprador ou locatario com renda comprovavel", highValueExample: "venda de apartamento de medio e alto padrao" },
  { slug: "clinicas-medicas", name: "Clinicas medicas", offer: "consultas e procedimentos medicos", leadProfile: "paciente elegivel para atendimento", highValueExample: "agenda para especialidade de alta demanda" },
  { slug: "advogados", name: "Advogados", offer: "servicos juridicos especializados", leadProfile: "cliente com caso viavel e urgencia real", highValueExample: "consultoria juridica empresarial" },
  { slug: "dentistas", name: "Dentistas", offer: "tratamentos odontologicos", leadProfile: "paciente com potencial de fechamento do plano", highValueExample: "implante e reabilitacao oral" },
  { slug: "lojas", name: "Lojas", offer: "produtos de varejo local", leadProfile: "cliente com intencao de compra no curto prazo", highValueExample: "campanha de colecao com aumento de ticket medio" },
  { slug: "ecommerce", name: "E-commerce", offer: "produtos online", leadProfile: "comprador com historico ou sinal de recompra", highValueExample: "escala de vendas com bundles" },
  { slug: "academias", name: "Academias", offer: "planos e modalidades fitness", leadProfile: "aluno com objetivo claro e disponibilidade", highValueExample: "venda de plano anual premium" },
  { slug: "escolas-de-idiomas", name: "Escolas de idiomas", offer: "cursos de idiomas", leadProfile: "aluno com meta e horizonte de estudo", highValueExample: "matricula em turma executiva" },
  { slug: "contabilidades", name: "Contabilidades", offer: "servicos contabeis recorrentes", leadProfile: "empresa com faturamento compativel", highValueExample: "contrato de BPO financeiro" },
  { slug: "arquitetura", name: "Arquitetura", offer: "projetos de arquitetura e interiores", leadProfile: "cliente com escopo e verba minima definida", highValueExample: "projeto residencial completo" },
  { slug: "engenharia-civil", name: "Engenharia civil", offer: "projetos e execucao de engenharia", leadProfile: "empresa ou cliente com demanda tecnica definida", highValueExample: "gestao de obra corporativa" },
  { slug: "construtoras", name: "Construtoras", offer: "empreendimentos e obras", leadProfile: "investidor ou comprador com capacidade financeira", highValueExample: "lancamento de empreendimento local" },
  { slug: "seguros", name: "Seguros", offer: "seguros pessoais e empresariais", leadProfile: "cliente com risco e patrimonio compativeis", highValueExample: "seguro empresarial completo" },
  { slug: "consorcios", name: "Consorcios", offer: "cartas de credito e consorcio", leadProfile: "interessado com capacidade de parcela", highValueExample: "adesao em consorcio imobiliario" },
  { slug: "agencias-de-turismo", name: "Agencias de turismo", offer: "pacotes e experiencias de viagem", leadProfile: "viajante com data e investimento definidos", highValueExample: "pacote internacional premium" },
  { slug: "hoteis-e-pousadas", name: "Hoteis e pousadas", offer: "hospedagem e experiencia local", leadProfile: "hospede com intencao de reserva direta", highValueExample: "reserva para feriado prolongado" },
  { slug: "restaurantes", name: "Restaurantes", offer: "experiencias gastronomicas", leadProfile: "cliente local com recorrencia potencial", highValueExample: "reserva de jantar especial" },
  { slug: "saloes-de-beleza", name: "Saloes de beleza", offer: "servicos de beleza e bem-estar", leadProfile: "cliente com necessidade recorrente", highValueExample: "pacote premium de atendimento mensal" },
  { slug: "clinicas-de-estetica", name: "Clinicas de estetica", offer: "tratamentos esteticos", leadProfile: "paciente com indicacao para protocolo", highValueExample: "plano completo de tratamento corporal" },
  { slug: "fisioterapia", name: "Fisioterapia", offer: "reabilitacao e fisioterapia", leadProfile: "paciente com dor, laudo ou objetivo funcional", highValueExample: "programa de reabilitacao pos-cirurgica" },
  { slug: "veterinarias", name: "Veterinarias", offer: "servicos para saude animal", leadProfile: "tutor com necessidade clara de atendimento", highValueExample: "plano preventivo anual para pets" },
  { slug: "pet-shops", name: "Pet shops", offer: "produtos e servicos pet", leadProfile: "tutor com potencial de recompra", highValueExample: "assinatura recorrente de itens essenciais" },
  { slug: "autoescolas", name: "Autoescolas", offer: "cursos de habilitacao", leadProfile: "aluno com prontidao para matricula", highValueExample: "matricula em pacote completo de habilitacao" },
  { slug: "oficinas-mecanicas", name: "Oficinas mecanicas", offer: "manutencao e reparo automotivo", leadProfile: "motorista com demanda imediata ou preventiva", highValueExample: "plano de revisoes recorrentes" },
  { slug: "energia-solar", name: "Energia solar", offer: "projetos fotovoltaicos", leadProfile: "cliente com conta de energia compativel", highValueExample: "instalacao solar para empresa de medio porte" },
  { slug: "moveis-planejados", name: "Moveis planejados", offer: "projetos de moveis sob medida", leadProfile: "cliente com ambiente e escopo definidos", highValueExample: "projeto completo de cozinha planejada" },
  { slug: "equipamentos-industriais", name: "Equipamentos industriais", offer: "equipamentos para industria", leadProfile: "comprador tecnico com demanda real", highValueExample: "projeto de modernizacao de linha de producao" },
  { slug: "software-b2b", name: "Software B2B", offer: "software para empresas", leadProfile: "decisor com dor de negocio prioritaria", highValueExample: "venda consultiva para conta enterprise" },
  { slug: "consultorias-empresariais", name: "Consultorias empresariais", offer: "consultoria de gestao e performance", leadProfile: "empresa com meta e necessidade de execucao", highValueExample: "projeto de melhoria de margem operacional" },
  { slug: "franquias", name: "Franquias", offer: "expansao e venda de franquias", leadProfile: "candidato com perfil e capital minimo", highValueExample: "fechamento de novo franqueado em regiao estrategica" },
];

const buildVertical = (seed: VerticalSeed): Vertical => ({
  slug: seed.slug,
  name: seed.name,
  title: `Geracao de demanda para ${seed.name.toLowerCase()}`,
  description: `Estrutura comercial para ${seed.offer}, com foco em lead qualificado e previsibilidade de vendas.`,
  commonProblems: [
    `Volume alto de contatos sem perfil para ${seed.offer}.`,
    "Tempo comercial desperdicado com triagens manuais.",
    "Baixa previsibilidade de receita mensal.",
  ],
  howWeSolve: [
    `Campanhas segmentadas para atrair ${seed.leadProfile}.`,
    "Qualificacao automatica para priorizar oportunidades reais.",
    "Processo comercial com metas por etapa e rotina de follow-up.",
  ],
  examples: [
    `Captacao para ${seed.highValueExample}.`,
    "Fluxo de nutricao para leads de medio prazo.",
    "Dashboard com indicadores de CAC, conversao e ROI.",
  ],
});

export const verticals: Vertical[] = seeds.map(buildVertical);

export const getVerticalBySlug = (slug: string): Vertical | null =>
  verticals.find((vertical) => vertical.slug === slug) ?? null;
