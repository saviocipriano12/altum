export type PublicSolution = {
  slug: string;
  name: string;
  title: string;
  description: string;
  answer: string;
  workflow: readonly {
    title: string;
    text: string;
    href: string;
    label: string;
  }[];
  evaluation: readonly string[];
  questions: readonly (readonly [string, string])[];
};

// Curated product use cases. No customer results, certifications or integrations are invented.
export const publicSolutions: readonly PublicSolution[] = [
  {
    slug: "whatsapp-e-instagram",
    name: "Vendas por WhatsApp e Instagram",
    title: "CRM com IA para vender pelo WhatsApp e Instagram",
    description:
      "Organize conversas, clientes, funil e retornos com a Altum. CRM com IA para empresas que vendem pelo WhatsApp e Instagram, com equipe no controle.",
    answer:
      "A Altum é uma plataforma de operação comercial com IA para empresas que recebem contatos pelo WhatsApp e Instagram. Ela reúne conversas, clientes, oportunidades e próximas ações. Faz sentido quando mais de uma pessoa atende, as negociações se perdem entre mensagens ou o retorno ao cliente depende da memória de cada vendedor.",
    workflow: [
      {
        title: "1. Atenda com o histórico por perto",
        text: "Consulte a conversa, identifique o responsável e registre o que o cliente procura. A IA pode apoiar a resposta conforme a base de conhecimento e as regras da empresa; a equipe assume quando necessário.",
        href: "/inbox",
        label: "Conhecer as conversas",
      },
      {
        title: "2. Transforme interesse em oportunidade",
        text: "Organize o cliente e a negociação em uma etapa do funil. Registre a proposta e o próximo passo para distinguir quem está conhecendo a oferta de quem está pronto para avançar.",
        href: "/crm",
        label: "Ver o CRM da Altum",
      },
      {
        title: "3. Dê continuidade ao combinado",
        text: "Defina o retorno na agenda e acompanhe o funil. Use campanhas e automações conforme o plano e a configuração, respeitando o canal, as permissões e o contexto do contato.",
        href: "/follow-up",
        label: "Organizar os retornos",
      },
    ],
    evaluation: [
      "Quantas pessoas atendem e quantos canais precisam ser conectados?",
      "Quais informações precisam acompanhar cada negociação?",
      "Quando a IA deve responder e quando a equipe deve assumir?",
      "Qual é o volume de mensagens e de uso de IA previsto por mês?",
    ],
    questions: [
      [
        "Quando um CRM é melhor que organizar tudo apenas nas mensagens?",
        "Quando a equipe precisa enxergar responsáveis, etapas, propostas e retornos de várias negociações. O histórico da conversa ajuda no atendimento; o CRM organiza o trabalho comercial que precisa acontecer depois.",
      ],
      [
        "A Altum responde automaticamente todas as mensagens?",
        "O comportamento da IA depende da configuração e das regras da operação. É possível manter o atendimento humano no controle. A demonstração deve validar o que será automatizado e as situações de transferência para a equipe.",
      ],
      [
        "Posso manter os canais da minha empresa?",
        "A conexão depende do provedor, das permissões e do plano. Antes da contratação, a Altum avalia os canais existentes e o caminho de implantação. Custos oficiais dos provedores podem existir além da assinatura.",
      ],
      [
        "Como avaliar a Altum antes de contratar?",
        "Compare os planos, confira os limites e use o teste de sete dias nos planos elegíveis. Na demonstração, apresente uma conversa e uma negociação típicas para validar o fluxo completo com a equipe.",
      ],
    ],
  },
  {
    slug: "clinicas-e-servicos",
    name: "Clínicas e empresas de serviços",
    title: "CRM e atendimento com IA para clínicas e serviços",
    description:
      "Conecte atendimento, contatos, agenda e propostas na Altum. Conheça um fluxo comercial com IA para clínicas e empresas que vendem serviços.",
    answer:
      "Para clínicas e empresas de serviços, a Altum organiza o caminho entre o primeiro contato, o agendamento e o acompanhamento comercial. Conversas, responsável, agenda e próxima ação ficam conectados. O foco é a rotina de atendimento e relacionamento; prontuário, avaliação clínica e decisões profissionais exigem os sistemas e responsáveis apropriados.",
    workflow: [
      {
        title: "1. Entenda o pedido antes de encaminhar",
        text: "Registre o serviço procurado, a disponibilidade e o melhor canal de retorno. Configure a base de conhecimento com informações aprovadas sobre horários, localização e atendimento para apoiar a recepção.",
        href: "/ia-no-whatsapp",
        label: "Entender a IA no atendimento",
      },
      {
        title: "2. Combine e acompanhe o próximo passo",
        text: "Organize o contato, o responsável e a ação na agenda. Diferencie pedido de informação, agendamento e proposta. A demonstração permite validar quais registros e integrações fazem sentido na sua rotina.",
        href: "/plataforma",
        label: "Ver agenda e oportunidades",
      },
      {
        title: "3. Mantenha a continuidade do relacionamento",
        text: "Acompanhe propostas pendentes e retornos combinados. Defina quando a equipe deve assumir e limite o que a IA pode responder. Para serviços, o contexto de cada contato é mais útil que uma sequência genérica de mensagens.",
        href: "/follow-up",
        label: "Conhecer o acompanhamento",
      },
    ],
    evaluation: [
      "Como recepção, especialistas e equipe comercial dividem o atendimento?",
      "Que agenda ou sistema já é utilizado e precisa ser considerado?",
      "Quais informações a IA pode responder e quais exigem uma pessoa?",
      "Que dados são realmente necessários no atendimento comercial?",
    ],
    questions: [
      [
        "A Altum substitui um prontuário eletrônico?",
        "A proposta desta solução é atendimento, relacionamento e organização comercial. A Altum não deve ser apresentada como substituta de prontuário nem como responsável por diagnóstico ou decisão clínica.",
      ],
      [
        "Posso usar a Altum para vender serviços e acompanhar propostas?",
        "Sim. A operação pode organizar contatos, oportunidades, propostas e próximos passos. O fluxo deve ser configurado conforme o serviço, a equipe e os recursos do plano contratado.",
      ],
      [
        "A IA pode encaminhar uma conversa para a equipe?",
        "O atendimento pode combinar apoio de IA e atuação humana, com regras definidas na implantação. Valide na demonstração os motivos de encaminhamento e quem deve receber cada conversa.",
      ],
      [
        "A agenda se conecta automaticamente ao sistema que já uso?",
        "A compatibilidade precisa ser verificada. A existência de agenda na plataforma não significa integração automática com qualquer sistema externo. Consulte as integrações disponíveis e o escopo de configuração.",
      ],
    ],
  },
  {
    slug: "ecommerce",
    name: "Lojas virtuais e e-commerce",
    title: "Atendimento e CRM com IA para e-commerce",
    description:
      "Conecte conversas e acompanhamento comercial da loja virtual com a Altum. Avalie integrações, campanhas e automações com IA para seu e-commerce.",
    answer:
      "A Altum conecta o atendimento e o acompanhamento comercial de lojas virtuais. A equipe pode organizar conversas, clientes e oportunidades, enquanto as integrações disponíveis trazem contexto da operação de e-commerce. É indicada para avaliar quando dúvidas sobre produtos, acompanhamento da compra e retornos comerciais ficam espalhados entre canais e pessoas.",
    workflow: [
      {
        title: "1. Identifique a dúvida e o contexto de compra",
        text: "Atenda o contato no canal conectado e organize o histórico do cliente. Na implantação, avalie como catálogo e dados da loja podem apoiar a resposta, de acordo com a integração e as permissões disponíveis.",
        href: "/integracoes",
        label: "Ver integrações de e-commerce",
      },
      {
        title: "2. Acompanhe oportunidades além do primeiro clique",
        text: "Registre a necessidade, o responsável e o retorno combinado. Diferencie uma dúvida sobre produto de uma negociação ou solicitação de acompanhamento para dar continuidade com o contexto adequado.",
        href: "/pipeline",
        label: "Conhecer o funil de vendas",
      },
      {
        title: "3. Configure campanhas com objetivo definido",
        text: "Avalie campanhas de relacionamento e automações comerciais com a equipe. Eventos como carrinho e pedido dependem da integração configurada; a disponibilidade deve ser confirmada antes de prometer um fluxo automático.",
        href: "/automacoes",
        label: "Explorar automações",
      },
    ],
    evaluation: [
      "Qual plataforma de e-commerce e quais canais a loja utiliza?",
      "Quais eventos e dados a integração realmente disponibiliza?",
      "Quais dúvidas ou retornos ocupam mais tempo da equipe?",
      "Como serão medidos atendimentos, oportunidades e resultados das campanhas?",
    ],
    questions: [
      [
        "A Altum se integra à Shopify e ao WooCommerce?",
        "Shopify e WooCommerce estão entre as plataformas apresentadas na área de integrações. A disponibilidade, os dados acessíveis e a configuração dependem do plano, das permissões e do cenário da loja.",
      ],
      [
        "A recuperação de carrinho funciona em qualquer loja?",
        "Não é uma função universal independente de configuração. Ela depende da integração, dos eventos disponíveis, dos dados de contato e das regras do canal. A demonstração deve validar esse fluxo com a plataforma da sua loja.",
      ],
      [
        "A IA pode responder sobre os produtos da loja?",
        "Isso depende da base de conhecimento e do acesso ao catálogo pela integração configurada. Valide como a solução lida com informações que mudam, como disponibilidade e preço, e quando deve encaminhar para a equipe.",
      ],
      [
        "A assinatura inclui todas as tarifas de WhatsApp e outros provedores?",
        "Não. Mensalidade, implantação, adicionais e tarifas oficiais de provedores são apresentados separadamente. Confira a página de preços e a proposta antes da contratação.",
      ],
    ],
  },
];

export const getPublicSolution = (slug: string) =>
  publicSolutions.find((item) => item.slug === slug);
