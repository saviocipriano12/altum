# ALTUM — Plano de crescimento orgânico

Data: 2026-09-08
Mercado: Brasil / português

## Objetivo

Aumentar tráfego orgânico qualificado para a ALTUM em Google e outros mecanismos de busca e tornar o produto mais compreensível e citável por mecanismos de resposta com IA.

A estratégia não deve gerar páginas em massa. Cada URL precisa ter intenção clara, aderência real ao produto, conteúdo diferenciado e papel definido na arquitetura interna.

## Princípio de posicionamento

Termos de categoria ajudam o mecanismo de busca a entender a ALTUM: CRM, WhatsApp, IA, pipeline, follow-up, automação, chatbot.

A diferenciação comercial da ALTUM é a continuidade operacional:

conversa → contexto → qualificação → CRM → pipeline → próxima ação → follow-up → automação → venda → reativação → métricas.

## Pesquisa de volume — Brasil

Volumes mensais aproximados retornados pela pesquisa em 2026-09-08. Usar como orientação, não como garantia de tráfego.

| Família / termo | Volume aprox. | Papel |
| --- | ---: | --- |
| CRM | 246.000 | categoria ampla; não priorizar como batalha principal inicial |
| funil de vendas | 22.200 | cluster editorial / autoridade |
| central de atendimento | 14.800 | oportunidade futura após validar intenção e produto |
| sistema de CRM | 8.100 | página CRM / expansão semântica |
| chatbot WhatsApp | 6.600 | P0 comercial + informacional |
| CRM WhatsApp | 3.600 | P0 comercial |
| CRM para vendas | 2.900 | página CRM |
| automação WhatsApp | 1.900 | cluster WhatsApp / automação |
| pipeline de vendas | 1.300 | P0 comercial |
| automação comercial | 1.300 | automações |
| follow up de vendas | 1.000 | P0 comercial |
| pipeline de vendas o que é | 1.000 | artigo de apoio ao pipeline |
| CRM para WhatsApp | 1.000 | mesma intenção de CRM WhatsApp |
| lead scoring | 880 | qualificação / conteúdo de apoio |
| chatbot para WhatsApp | 720 | mesma intenção de chatbot WhatsApp |
| CRM com IA | 320 | CRM / IA |
| IA para vendas | 320 | página IA para vendas |
| qualificação de leads | 320 | página qualificação |
| CRM com WhatsApp | 260 | mesma intenção de CRM WhatsApp |
| automação de vendas | 210 | automações |
| CRM integrado com WhatsApp | 210 | mesma intenção de CRM WhatsApp |
| gestão de pipeline | 210 | pipeline |
| CRM B2B | 170 | oportunidade futura, sem nova URL por enquanto |
| atendimento com IA | 140 | IA / chatbot / inbox |
| chatbot para empresas | 110 | consolidado em chatbot WhatsApp |

## URLs prioritárias

### `/crm-para-whatsapp`
Intenção principal: CRM WhatsApp / CRM para WhatsApp / CRM integrado com WhatsApp.

Deve conter:
- definição direta de CRM para WhatsApp;
- diferença entre WhatsApp Business e CRM conectado;
- funcionamento prático;
- CRM, pipeline, tarefas, follow-up e IA;
- FAQ derivado de perguntas reais da SERP;
- links para CRM, Inbox, Pipeline, Follow-up e IA.

Não criar `/crm-whatsapp`, `/crm-com-whatsapp` ou outras variações concorrentes.

### `/chatbot-whatsapp`
Intenção principal: chatbot WhatsApp / chatbot para WhatsApp / bot WhatsApp.

`/chatbot-para-empresas` deve redirecionar permanentemente para esta URL.

Deve responder:
- o que é chatbot para WhatsApp;
- como funciona;
- diferença entre regras e IA;
- quando transferir para humano;
- custo de forma não inventada;
- conexão com CRM e processo comercial.

### `/pipeline`
Intenção principal: pipeline de vendas / gestão de pipeline.

Landing comercial deve responder o conceito rapidamente e demonstrar o produto.

Artigo de apoio existente:
`/blog/pipeline-de-vendas-b2b-com-previsibilidade`

Esse artigo deve concentrar a intenção informacional "pipeline de vendas o que é" e apontar para `/pipeline`.

### `/follow-up`
Intenção principal: follow up de vendas / follow-up comercial.

Artigo de apoio existente:
`/blog/estrutura-de-follow-up-comercial`

O artigo deve ensinar cadência, exemplos, automação e boas práticas, enquanto `/follow-up` apresenta a solução.

### `/crm`
Intenções secundárias:
- sistema de CRM;
- CRM para vendas;
- CRM de vendas;
- CRM com IA.

Não tentar ganhar `CRM` puro no curto prazo. Construir autoridade temática primeiro.

### `/qualificacao-de-leads-com-ia`
Intenções:
- qualificação de leads;
- qualificação de leads com IA;
- lead scoring e conceitos relacionados.

O Search Console já mostrou impressões históricas para consultas de qualificação com IA. Reforçar essa URL antes de criar variações.

### `/ia-para-vendas`
Intenções:
- IA para vendas;
- inteligência artificial para vendas;
- atendimento com IA quando a intenção for comercial.

### `/automacoes`
Intenções:
- automação comercial;
- automação de vendas;
- automação ligada ao CRM e follow-up.

## Entidade e IA

Páginas estruturais:
- `/sobre`: definição clara da ALTUM, categoria, produto e principais áreas.
- `/integracoes`: integrações verificadas e escopo real.

Sinais importantes:
- Organization / WebSite / SoftwareApplication no JSON-LD global;
- AboutPage em `/sobre`;
- FAQ schema somente quando as respostas aparecem visivelmente na página;
- identidade e domínio canônicos consistentes;
- conteúdo original com exemplos e explicações concretas;
- cases reais quando houver dados verificáveis;
- menções externas e backlinks relevantes;
- `llms.txt` como complemento, nunca como substituto de autoridade pública.

## Arquitetura editorial

Priorizar atualização de URLs que já têm sinais no GSC antes de criar artigos novos.

1. `pipeline-de-vendas-b2b-com-previsibilidade` → intenção pipeline/o que é.
2. `estrutura-de-follow-up-comercial` → intenção follow-up de vendas.
3. Auditar `como-melhorar-conversao-de-mql-para-sql`.
4. Auditar `copy-para-landing-page-de-servicos` e decidir se ainda faz sentido para a categoria atual da ALTUM.
5. Criar conteúdo de lead scoring somente após SERP/cluster confirmar que não canibaliza qualificação.
6. Expandir funil de vendas como cluster editorial depois que o núcleo comercial estiver publicado e indexado.

## Regras de qualidade

- Não publicar páginas por cidade/vertical sem valor específico; manter páginas fracas em noindex.
- Não inventar resultados, métricas, clientes, integrações ou funcionalidades.
- Não criar múltiplas URLs para sinônimos da mesma intenção.
- Toda página editorial importante deve apontar para uma página comercial relacionada.
- Toda página comercial deve responder a pergunta principal em linguagem direta antes de aprofundar a oferta.
- Atualizar conteúdo existente que já possui histórico antes de abrir URL nova.

## Mensuração

GA4 foi instalado em 2026-09-08 e começa sem histórico.

Métricas iniciais:
- landing pages orgânicas;
- sessões orgânicas;
- engajamento;
- CTA / navegação para contato;
- `generate_lead` apenas após lead confirmado pelo backend;
- origem / UTM quando disponível.

GSC + GA4 devem ser cruzados depois que existir amostra suficiente:
consulta → impressão → clique → landing page → sessão → comportamento → lead.
