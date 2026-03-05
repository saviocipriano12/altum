import fs from "node:fs/promises";
import path from "node:path";
import { blogTopics, type BlogTopic } from "../data/blog-topics.ts";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "content", "blog");

const introVariants = [
  "Em operacoes B2B, velocidade sem criterio gera ruido. O foco deste guia e mostrar como estruturar atendimento e captacao para aumentar qualidade de pipeline. O objetivo e simples: menos curiosos, mais oportunidades com chance real de fechar.",
  "Quando o volume de leads cresce, o gargalo deixa de ser atrair e passa a ser qualificar. Este artigo mostra um caminho pratico para combinar IA, automacao e WhatsApp sem complicar o processo comercial.",
  "Muitas empresas investem em midia e ainda assim sentem baixa conversao no comercial. Em geral, o problema esta entre o primeiro contato e a passagem de bastao para vendas. Aqui voce encontra um modelo objetivo para resolver isso.",
  "No B2B, previsibilidade depende de processo. Sem padrao, o time responde no improviso e perde oportunidades boas. A seguir, voce vai ver uma estrutura enxuta para gerar demanda com mais controle de qualidade.",
];

const scenarios = [
  {
    segment: "e-commerce B2B",
    challenge: "alto volume de carrinhos iniciados e poucos contatos com contexto",
    action:
      "roteiro de triagem no WhatsApp, pagina dedicada por categoria e follow-up automatizado por etapa do funil",
    outcome:
      "em muitos casos, queda perceptivel no tempo de resposta e melhora na taxa de lead aproveitavel",
  },
  {
    segment: "clinica especializada",
    challenge: "agenda oscilando e muitos atendimentos iniciais sem aderencia",
    action:
      "formulario com filtros objetivos, automacao de mensagens e priorizacao por prontidao de agendamento",
    outcome:
      "com frequencia, melhora de comparecimento e maior qualidade nas conversas de fechamento",
  },
  {
    segment: "rede de lojas",
    challenge: "demanda local irregular e equipe sobrecarregada no atendimento",
    action:
      "campanhas geolocalizadas, triagem inicial automatica e distribuicao de atendimentos por prioridade",
    outcome:
      "em cenarios maduros, aumento do aproveitamento comercial sem ampliar equipe no mesmo ritmo",
  },
  {
    segment: "empresa de servicos B2B",
    challenge: "pipeline cheio de contatos frios e ciclo comercial longo",
    action:
      "lead scoring com IA, cadencia de follow-up padronizada e paginas por dor de negocio",
    outcome:
      "normalmente, ganho de previsibilidade e melhor uso do tempo do time comercial",
  },
];

const categoryTools: Record<BlogTopic["category"], string[]> = {
  IA: [
    "Modelos de classificacao de leads por regras e sinais de intencao",
    "Automacao de tarefas repetitivas no CRM e no WhatsApp",
    "Painel de indicadores com conversao por etapa e tempo de resposta",
  ],
  WhatsApp: [
    "API oficial de mensageria para operacao comercial com governanca",
    "Fila de atendimento com SLA e regras de prioridade",
    "Template de mensagens com variacao por etapa do funil",
  ],
  Vendas: [
    "CRM com pipeline visivel e tarefas automatizadas por etapa",
    "Cadencias de follow-up com gatilhos de avanço e encerramento",
    "Playbook comercial com perguntas e criterios de qualificacao",
  ],
  "Sites/LPs": [
    "Construtor de landing pages com monitoramento de eventos",
    "Formularios inteligentes com logica condicional",
    "Integração entre pagina, CRM e WhatsApp para handoff rapido",
  ],
  Ecommerce: [
    "Plataforma de loja virtual com eventos de funil rastreaveis",
    "Automacoes de abandono e recompra baseadas em comportamento",
    "Camada de atendimento no WhatsApp com contexto de pedido",
  ],
};

const coverByCategory: Record<BlogTopic["category"], string> = {
  IA: "/covers/cover-automacao.svg",
  WhatsApp: "/covers/cover-whatsapp.svg",
  Vendas: "/covers/cover-engenharia-vendas.svg",
  "Sites/LPs": "/covers/cover-estrategia.svg",
  Ecommerce: "/covers/cover-growth.svg",
};

const titleCase = (value: string): string =>
  value
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const safe = (value: string): string => value.replace(/"/g, '\\"');

const relatedSlugs = (index: number): [BlogTopic, BlogTopic] => {
  const first = blogTopics[(index + 3) % blogTopics.length];
  const second = blogTopics[(index + 11) % blogTopics.length];
  return [first, second];
};

const buildPost = (topic: BlogTopic, index: number): string => {
  const intro = introVariants[index % introVariants.length];
  const scenario = scenarios[index % scenarios.length];
  const tools = categoryTools[topic.category];
  const [relatedA, relatedB] = relatedSlugs(index);
  const date = new Date(Date.UTC(2026, 2, 1 - index));
  const author = "ALTUM";
  const readingTime = `${6 + (index % 4)} min de leitura`;
  const category = topic.category.toLowerCase();
  const tags = topic.keywords.slice(0, 4);

  const faqItems = [
    {
      q: `Como aplicar ${topic.category} sem aumentar retrabalho comercial?`,
      a: "Comece com um fluxo curto de qualificacao e uma rotina de acompanhamento por etapa. O ganho vem da consistencia operacional.",
    },
    {
      q: "Isso funciona para empresa com time comercial pequeno?",
      a: "Sim. Em muitos casos, equipes enxutas ganham mais produtividade porque deixam de perder tempo com contatos sem perfil.",
    },
    {
      q: "Qual indicador acompanhar primeiro?",
      a: "Priorize tempo de resposta, taxa de lead qualificado e taxa de avanço para reuniao ou proposta.",
    },
    {
      q: "Preciso trocar todo meu processo para comecar?",
      a: "Nao. O ideal e evoluir em ciclos curtos, aproveitando o que ja existe e ajustando gargalos de maior impacto.",
    },
    {
      q: "Quando os resultados costumam aparecer?",
      a: "Depende do volume e da maturidade da operacao, mas melhorias de processo e velocidade costumam surgir nas primeiras semanas.",
    },
  ];

  return `---
title: "${safe(topic.title)}"
description: "${safe(topic.description)}"
date: "${formatDate(date)}"
category: "${safe(category)}"
tags:
  - "${safe(tags[0] ?? topic.category.toLowerCase())}"
  - "${safe(tags[1] ?? "geracao de leads")}"
  - "${safe(tags[2] ?? "b2b")}"
  - "${safe(tags[3] ?? "automacao")}"
coverImage: "${coverByCategory[topic.category]}"
author: "${author}"
readingTime: "${readingTime}"
---

${intro}

Se voce atua com ${topic.category.toLowerCase()} e quer melhorar geracao de leads com foco em conversao, este material organiza um caminho pratico para executar com clareza.

## O problema

No dia a dia comercial, a maioria das equipes sofre com duas frentes: entrada de contatos sem perfil e falta de processo no atendimento inicial.

Quando isso acontece, o time gasta energia em oportunidades frias e perde velocidade para responder quem realmente tem potencial.

Em empresas de ${scenario.segment}, isso aparece como ${scenario.challenge}, afetando previsibilidade e receita.

## Como a IA resolve

- Classifica contatos por sinais objetivos de intencao e aderencia ao ICP.
- Prioriza filas de atendimento para reduzir tempo de resposta nos leads quentes.
- Automatiza tarefas repetitivas, liberando vendedores para conversas de alto valor.

Ao integrar IA com WhatsApp e funil comercial, a equipe opera com mais criterio e menos improviso.

## Implementacao passo a passo

<Steps items={[
  "Mapear gargalos atuais entre captacao, triagem e passagem para vendas.",
  "Definir criterios minimos de qualificacao alinhados ao ticket e ao perfil do cliente ideal.",
  "Configurar fluxo inicial no WhatsApp com perguntas objetivas e linguagem clara.",
  "Conectar pagina de captacao, CRM e atendimento para manter contexto do lead.",
  "Acompanhar indicadores por etapa e ajustar semanalmente o que trava conversao."
]} />

## Exemplo pratico

Cenario: uma operacao de ${scenario.segment} tinha ${scenario.challenge}.

Acao aplicada: ${scenario.action}.

Resultado observado: ${scenario.outcome}. Em vez de promessas absolutas, a avaliacao foi feita por etapa do funil e qualidade de oportunidade.

## Checklist

<Checklist items={[
  "Definir ICP com criterios operacionais e nao apenas percepcao.",
  "Padronizar mensagens iniciais no WhatsApp por tipo de lead.",
  "Estabelecer SLA de primeira resposta para leads qualificados.",
  "Registrar motivo de perda para evoluir triagem e copy de captacao.",
  "Revisar semanalmente conversao por etapa e gargalos de handoff."
]} />

## Ferramentas recomendadas

- ${tools[0]}.
- ${tools[1]}.
- ${tools[2]}.

Escolha ferramentas que permitam integracao simples com seu processo atual. O principal e manter visibilidade de funil e disciplina de execucao.

## Perguntas frequentes

<FAQAccordion items={[
  { q: "${safe(faqItems[0].q)}", a: "${safe(faqItems[0].a)}" },
  { q: "${safe(faqItems[1].q)}", a: "${safe(faqItems[1].a)}" },
  { q: "${safe(faqItems[2].q)}", a: "${safe(faqItems[2].a)}" },
  { q: "${safe(faqItems[3].q)}", a: "${safe(faqItems[3].a)}" },
  { q: "${safe(faqItems[4].q)}", a: "${safe(faqItems[4].a)}" }
]} />

## Links recomendados para avancar

- Pilar principal: [${topic.primaryPillar}](${topic.primaryPillar})
- Outro pilar: [/automacao-com-ia](/automacao-com-ia)
- Outro pilar: [/ia-no-whatsapp](/ia-no-whatsapp)
- Solucoes por vertical: [/solucoes](/solucoes)
- Segmentos atendidos: [/segmentos](/segmentos)
- Post relacionado: [/blog/${relatedA.slug}](/blog/${relatedA.slug})
- Post relacionado: [/blog/${relatedB.slug}](/blog/${relatedB.slug})

---

Se fizer sentido para a sua operacao, fale com a ALTUM e desenhe um plano de captacao e qualificacao com foco em resultado comercial.

- Contato: [Ir para pagina inicial](/)
- WhatsApp: [Falar com especialista](https://wa.me/5531972545430)
`;
};

const run = async () => {
  await fs.mkdir(BLOG_DIR, { recursive: true });

  const files: Array<{ file: string; category: BlogTopic["category"] }> = [];

  for (let index = 0; index < blogTopics.length; index += 1) {
    const topic = blogTopics[index];
    const content = buildPost(topic, index);
    const filePath = path.join(BLOG_DIR, `${topic.slug}.mdx`);
    await fs.writeFile(filePath, content, "utf8");
    files.push({ file: `${topic.slug}.mdx`, category: topic.category });
  }

  const summary = files
    .map((item) => `- ${item.file} [${titleCase(item.category)}]`)
    .join("\n");

  console.log("Posts gerados:");
  console.log(summary);
  console.log(`Total: ${files.length}`);
};

run().catch((error) => {
  console.error("Falha ao gerar posts:", error);
  process.exit(1);
});
