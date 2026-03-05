export type CityPage = {
  slug: string;
  city: string;
  state: string;
  subtitle: string;
  localFocus: string;
  benefits: [string, string, string];
  problems: [string, string, string];
  steps: [string, string, string, string];
  delivery7Days: [string, string, string, string, string, string, string];
  faqs: Array<{
    q: string;
    a: string;
  }>;
};

export const cityPages: CityPage[] = [
  {
    slug: "sao-paulo-sp",
    city: "Sao Paulo",
    state: "SP",
    subtitle: "Estrategias de IA e WhatsApp para operacoes B2B em mercado competitivo.",
    localFocus: "empresas de servicos, e-commerce e clinicas com alta concorrencia",
    benefits: ["Resposta comercial mais rapida", "Triagem com maior precisao", "Maior aproveitamento de midia"],
    problems: ["Lead entra sem contexto de compra", "Equipe comercial sobrecarregada", "Baixa previsibilidade de pipeline"],
    steps: ["Diagnostico local", "Ajuste de oferta por bairro/regiao", "Triagem automatica", "Ritmo comercial com metas por etapa"],
    delivery7Days: ["Mapa de demanda local", "Definicao de ICP regional", "Fluxo de WhatsApp", "Ajustes em LP", "Playbook comercial", "Painel de conversao", "Plano de escala"],
    faqs: [
      { q: "Serve para empresas em zonas diferentes da cidade?", a: "Sim, a estratégia pode separar ofertas e mensagens por região e perfil." },
      { q: "Como lidar com alto custo de mídia em SP?", a: "Com qualificação mais rígida e foco em intenção real, reduzindo desperdício." },
      { q: "Em quanto tempo vejo melhoria?", a: "As melhorias iniciais costumam aparecer no tempo de resposta e qualidade de lead." },
      { q: "Funciona para B2B de ticket alto?", a: "Sim, especialmente quando há filtros claros de perfil e prontidão." },
      { q: "Preciso trocar ferramentas?", a: "Não necessariamente. Muitas operações evoluem com integração leve na stack atual." },
    ],
  },
  {
    slug: "rio-de-janeiro-rj",
    city: "Rio de Janeiro",
    state: "RJ",
    subtitle: "Operacao comercial para captar melhor demanda local e converter com mais consistencia.",
    localFocus: "clinicas, lojas e servicos com forte dependência de WhatsApp",
    benefits: ["Atendimento organizado por prioridade", "Mais conversas qualificadas", "Menos perda por demora"],
    problems: ["Fluxo alto de curiosos", "Falta de padrao na abordagem comercial", "Acompanhamento fraco de follow-up"],
    steps: ["Definir segmento prioritario", "Padronizar mensagens", "Automatizar triagem", "Medir conversao por etapa"],
    delivery7Days: ["Diagnostico de entrada", "Segmentacao de publico", "Fluxo no WhatsApp", "Ajuste de pagina", "Script para vendas", "Painel de SLA", "Plano de otimizacao"],
    faqs: [
      { q: "Funciona para negócios locais no RJ?", a: "Sim. A adaptação por região melhora qualidade de demanda e eficiência de atendimento." },
      { q: "Como reduzir lead sem perfil?", a: "Com perguntas de qualificação logo na entrada e regras de priorização." },
      { q: "Serve para clínica e loja ao mesmo tempo?", a: "Serve, com fluxos separados por tipo de operação." },
      { q: "A equipe precisa de treinamento?", a: "Sim, treinamento curto ajuda a manter padrão e melhorar conversão." },
      { q: "Qual canal principal?", a: "Geralmente WhatsApp integrado à página de captura e CRM." },
    ],
  },
  {
    slug: "belo-horizonte-mg",
    city: "Belo Horizonte",
    state: "MG",
    subtitle: "Modelo B2B para gerar leads qualificados com mais controle de funil.",
    localFocus: "servicos recorrentes e vendas consultivas",
    benefits: ["Mais previsibilidade comercial", "Menos retrabalho da equipe", "Maior qualidade de reunião"],
    problems: ["Pipeline cheio de lead frio", "Pouca visibilidade de etapa", "Passagem ruim entre marketing e vendas"],
    steps: ["Refinar ICP", "Ajustar captura", "Automatizar triagem", "Estruturar follow-up"],
    delivery7Days: ["Diagnostico de funil", "Definicao de filtros", "Fluxo de atendimento", "Ajuste de LP", "Cadencia comercial", "Painel de KPI", "Plano de escala"],
    faqs: [
      { q: "Serve para empresas de serviço em BH?", a: "Sim. O método é ajustado para ciclo e ticket de cada operação." },
      { q: "Como melhorar qualidade de reunião?", a: "Com triagem mais objetiva e pré-contexto antes da call." },
      { q: "Preciso de SDR?", a: "Não necessariamente. Pode começar com time atual e evoluir." },
      { q: "Quanto tempo para organizar o processo?", a: "As primeiras melhorias de processo aparecem rápido; maturidade vem com iteração." },
      { q: "Dá para integrar com CRM atual?", a: "Sim, geralmente por etapas para reduzir risco operacional." },
    ],
  },
  {
    slug: "curitiba-pr",
    city: "Curitiba",
    state: "PR",
    subtitle: "Estruture captação e atendimento com IA para escalar sem perder qualidade.",
    localFocus: "industria, tecnologia e educacao B2B",
    benefits: ["Triagem mais eficiente", "SLA comercial melhor", "Mais oportunidades com fit"],
    problems: ["Leads sem especificacao suficiente", "Equipe respondendo no improviso", "Baixa taxa de avanço de etapa"],
    steps: ["Mapear gargalos", "Definir filtros", "Configurar automacao", "Ajustar discurso comercial"],
    delivery7Days: ["Levantamento de dados", "Definicao de ICP", "Fluxo de triagem", "Padrao de mensagens", "Roteiro de abordagem", "Painel de conversao", "Plano de melhoria"],
    faqs: [
      { q: "Funciona para indústria em Curitiba?", a: "Sim. A triagem técnica na entrada melhora muito a qualidade de oportunidade." },
      { q: "Como reduzir tempo de resposta?", a: "Com automação de contato inicial e prioridade por sinal de intenção." },
      { q: "Serve para ciclo longo?", a: "Sim, com cadência estruturada e acompanhamento por estágio." },
      { q: "Preciso mudar processo inteiro?", a: "Não. A evolução pode ser incremental por etapas." },
      { q: "Quais KPIs priorizar?", a: "Tempo de resposta, taxa de qualificação e avanço por etapa." },
    ],
  },
  {
    slug: "porto-alegre-rs",
    city: "Porto Alegre",
    state: "RS",
    subtitle: "Acelere funil comercial com qualificação de demanda e operação disciplinada.",
    localFocus: "operacoes B2B de ciclo medio e longo",
    benefits: ["Mais oportunidades qualificadas", "Menos dispersao do time", "Melhor previsibilidade"],
    problems: ["Muitos contatos sem fit", "Follow-up inconsistente", "Pipeline sem priorização"],
    steps: ["Diagnosticar etapas", "Criar lead scoring", "Automatizar follow-up", "Ajustar handoff"],
    delivery7Days: ["Analise de funil", "Definicao de score", "Fluxo WhatsApp", "Ajuste de páginas", "Playbook de abordagem", "Painel de etapas", "Plano de escala"],
    faqs: [
      { q: "Serve para B2B de serviço em Porto Alegre?", a: "Sim, com ajustes de linguagem e critérios por perfil de cliente." },
      { q: "Como reduzir perda de oportunidade?", a: "Com SLA definido e cadência comercial padronizada." },
      { q: "A IA ajuda no follow-up?", a: "Ajuda, principalmente em tarefas repetitivas e priorização de fila." },
      { q: "Qual primeiro passo?", a: "Mapear o gargalo entre entrada de lead e primeira conversa qualificada." },
      { q: "Funciona com equipe pequena?", a: "Funciona, e geralmente equipes pequenas sentem ganho rápido de produtividade." },
    ],
  },
  {
    slug: "campinas-sp",
    city: "Campinas",
    state: "SP",
    subtitle: "Modelo de geração de leads para operações B2B e clínicas com foco em eficiência comercial.",
    localFocus: "tecnologia, saude e franquias",
    benefits: ["Mais eficiência no atendimento", "Melhor fit de lead", "Conversas com mais contexto"],
    problems: ["Demora no primeiro contato", "Baixa taxa de lead qualificado", "Muita energia em oportunidade fraca"],
    steps: ["Definir oferta por perfil", "Qualificar entrada", "Automatizar jornada inicial", "Medir ganhos por etapa"],
    delivery7Days: ["Diagnóstico inicial", "Segmentação de público", "Fluxo de triagem", "Script de atendimento", "Ajuste de LP", "Painel de desempenho", "Plano de otimização"],
    faqs: [
      { q: "Serve para clínica em Campinas?", a: "Sim, principalmente para reduzir no-show e qualificar agenda." },
      { q: "E para SaaS B2B?", a: "Também. O método melhora passagem de lead para reunião qualificada." },
      { q: "Quanto investir no início?", a: "Depende da meta, mas a estratégia pode começar com orçamento controlado." },
      { q: "Preciso de equipe de marketing interna?", a: "Não obrigatoriamente. O foco é processo e integração entre canais." },
      { q: "Qual ganho mais comum?", a: "Ganho de velocidade de atendimento e qualidade de pipeline." },
    ],
  },
  {
    slug: "goiania-go",
    city: "Goiania",
    state: "GO",
    subtitle: "Capte melhor demanda local com IA e WhatsApp para elevar conversao comercial.",
    localFocus: "varejo e servicos de alta demanda local",
    benefits: ["Atendimento mais rapido", "Melhor triagem inicial", "Maior aproveitamento da equipe"],
    problems: ["Mensagens sem priorizacao", "Leads sem perfil de compra", "Baixa consistencia no follow-up"],
    steps: ["Mapear demanda local", "Aplicar filtros de qualificação", "Automatizar respostas", "Monitorar conversão"],
    delivery7Days: ["Levantamento local", "Critérios de triagem", "Fluxo WhatsApp", "Ajuste de oferta", "Script de vendas", "Painel KPI", "Plano de escala"],
    faqs: [
      { q: "Funciona para loja e serviço local?", a: "Sim. Com segmentação local, o atendimento fica mais eficiente." },
      { q: "Como reduzir lead sem perfil?", a: "Com perguntas objetivas e regras de descarte logo no início." },
      { q: "Posso usar com equipe atual?", a: "Pode. A implementação é progressiva para não travar operação." },
      { q: "Precisa de CRM robusto?", a: "Não no início. O essencial é ter processo e registro básico por etapa." },
      { q: "Quando medir resultado?", a: "Desde a primeira semana, com foco em tempo de resposta e qualidade de lead." },
    ],
  },
  {
    slug: "fortaleza-ce",
    city: "Fortaleza",
    state: "CE",
    subtitle: "Estruture atendimento e geração de demanda para crescer com previsibilidade.",
    localFocus: "captacao regional com WhatsApp e automacao",
    benefits: ["Mais contatos com contexto", "Melhor conversão no WhatsApp", "Menos retrabalho comercial"],
    problems: ["Baixa velocidade de resposta", "Equipe sem padrão de triagem", "Falta de visão de funil"],
    steps: ["Definir oferta principal", "Criar fluxo de entrada", "Automatizar qualificação", "Ajustar follow-up"],
    delivery7Days: ["Diagnóstico atual", "Definição de ICP", "Fluxo inicial", "Templates comerciais", "Ajuste de páginas", "Painel de conversão", "Plano tático"],
    faqs: [
      { q: "Funciona para operações regionais?", a: "Sim. A estrutura foi pensada para adaptação por praça e perfil local." },
      { q: "Como melhorar qualidade de lead?", a: "Com triagem inicial e mensagens orientadas por objetivo comercial." },
      { q: "Da para reduzir tempo de resposta?", a: "Sim, com automação de primeira resposta e prioridade por intenção." },
      { q: "Qual principal etapa crítica?", a: "Normalmente a passagem da entrada para a qualificação real." },
      { q: "Serve para serviço B2B?", a: "Serve, com ajustes de linguagem e critérios por ticket." },
    ],
  },
  {
    slug: "recife-pe",
    city: "Recife",
    state: "PE",
    subtitle: "Otimize funil comercial para captar e converter melhor com apoio de IA.",
    localFocus: "servicos, educacao e operacoes digitais",
    benefits: ["Melhor aproveitamento de campanhas", "Triagem mais precisa", "Conversas comerciais mais produtivas"],
    problems: ["Leads sem clareza de necessidade", "Baixa consistência no atendimento", "Dificuldade de escalar processo"],
    steps: ["Diagnostico de jornada", "Definicao de filtros", "Automacao de contato inicial", "Rotina de melhoria semanal"],
    delivery7Days: ["Mapa de jornada", "Regras de triagem", "Fluxo em WhatsApp", "Ajuste de LP", "Script de qualificação", "Painel operacional", "Plano de evolução"],
    faqs: [
      { q: "Como melhorar taxa de conversão?", a: "Atuando em triagem, velocidade e consistência de follow-up." },
      { q: "Funciona para educação e serviço?", a: "Sim, com variações por oferta e ciclo de decisão." },
      { q: "É possível começar simples?", a: "Sim. O modelo funciona por camadas e evolução contínua." },
      { q: "Quais ganhos aparecem primeiro?", a: "Tempo de resposta e qualidade de oportunidade." },
      { q: "Precisa de muitas ferramentas?", a: "Não. O essencial é integração mínima e disciplina operacional." },
    ],
  },
  {
    slug: "brasilia-df",
    city: "Brasilia",
    state: "DF",
    subtitle: "Geração de leads qualificados com foco em B2B, serviços e atendimento de alto valor.",
    localFocus: "servicos consultivos e operacoes de ticket medio/alto",
    benefits: ["Mais precisão na qualificação", "Pipeline mais limpo", "Maior previsibilidade de receita"],
    problems: ["Volume sem aderência ao ICP", "Tempo perdido em triagem manual", "Baixa taxa de avanço comercial"],
    steps: ["Refinar ICP", "Qualificar entrada", "Automatizar contato inicial", "Padronizar transição para vendas"],
    delivery7Days: ["Diagnóstico de ICP", "Setup de triagem", "Fluxo WhatsApp", "Ajuste de páginas", "Playbook comercial", "Painel de métricas", "Plano de iteração"],
    faqs: [
      { q: "Serve para serviços consultivos?", a: "Sim. A abordagem melhora qualidade das reuniões e da proposta." },
      { q: "Como evitar lead sem perfil?", a: "Com critérios claros de entrada e priorização automática." },
      { q: "Qual indicador mais importante?", a: "Taxa de lead qualificado para reunião e conversão por etapa." },
      { q: "Da para escalar sem crescer equipe no mesmo ritmo?", a: "Em muitos casos, sim, graças à automação de tarefas repetitivas." },
      { q: "Precisa mudar toda operação?", a: "Não. A implementação pode ser progressiva por blocos de maior impacto." },
    ],
  },
];

export const getCityPageBySlug = (slug: string): CityPage | null =>
  cityPages.find((city) => city.slug === slug) ?? null;
