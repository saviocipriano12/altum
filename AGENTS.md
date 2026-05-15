# AGENTS

## Redesign da area do cliente da Altum

Estas regras valem como diretriz permanente para as proximas tarefas de redesign da area do cliente.

## 1. Escopo

- O redesign atual e somente da area do cliente.
- Priorizar `app/cliente/painel`.
- Nao alterar `app/admin`.
- Nao alterar backend, APIs, banco de dados ou autenticacao sem pedido explicito.
- Nao remover funcionalidades existentes.
- Nao quebrar rotas antigas.
- Mudancas em `app/globals.css` devem ser evitadas ou cuidadosamente escopadas para nao afetar admin ou paginas publicas.

## 2. Visao de produto

A area do cliente deve deixar de parecer um painel tecnico cheio de modulos soltos e passar a parecer uma operacao simples de:

- atendimento
- conversas
- clientes
- oportunidades
- funil
- agenda
- propostas
- campanhas
- relatorios
- IA e Assistente Altum

Promessa principal do produto para o cliente final:

- `operacao comercial com IA`

Leitura pratica dessa promessa:

- o cliente entra para responder, vender, acompanhar e decidir
- a IA aparece como apoio pratico e inteligencia aplicada, nao como console tecnico
- `Conversas`, `Clientes & Oportunidades` e `Agenda` formam o nucleo da operacao diaria
- configuracoes tecnicas e controles finos de IA devem ficar fora da camada comum sempre que possivel

## 3. Nova navegacao principal

- Inicio
- Conversas
- Clientes & Oportunidades
- Agenda
- Produtos & Servicos
- Campanhas
- Relatorios
- Perguntar a Altum
- Assistente Altum
- Configuracoes

## 4. Mapeamento conceitual

- Visao geral -> Inicio
- Inbox -> Conversas
- CRM -> Clientes & Oportunidades > Lista
- Pipeline e Funil -> Clientes & Oportunidades > Kanban
- Comercial -> Propostas e Financeiro dentro da ficha do cliente ou oportunidade
- Follow-ups e Retornos -> Agenda
- Produtos, Servicos, Catalogo e Ofertas -> Produtos & Servicos
- Ecommerce, Shopify, Nuvemshop, WooCommerce, VTEX, Tray e Loja Integrada -> Configuracoes > Integracoes
- Pedidos, carrinho abandonado, rastreio, recompra e upsell ecommerce -> Conversas, Clientes & Oportunidades, Campanhas e Relatorios
- Metricas -> Relatorios
- Inteligencia, Copiloto e perguntas sobre o negocio -> Perguntar a Altum
- IA -> Assistente Altum
- Conhecimento -> Assistente Altum > Base de conhecimento
- Handoffs -> Assistente Altum > Escaladas para humano ou Controle da IA
- Automacoes -> Assistente Altum ou Configuracoes
- Go-live -> Configuracoes > Implantacao
- Logs -> Configuracoes > Avancado ou perfil tecnico

## 5. Direcao visual

- SaaS moderno, limpo e comercial.
- Evitar excesso de bege e laranja.
- Azul e indigo como cor principal.
- Verde para WhatsApp, conversa e sucesso.
- Roxo para IA e Assistente Altum.
- Laranja para alerta, pendencia e implantacao.
- Vermelho para erro e risco.
- Cards brancos, bordas sutis e sombras leves.
- Tipografia clara.
- Menos texto explicativo.
- Mais clareza de acao.

## 6. Referencias de experiencia

Usar referencias conhecidas apenas como familiaridade de UX, sem copiar marcas, logos ou identidade visual:

- Conversas: WhatsApp Web
- Clientes & Oportunidades: HubSpot e Pipedrive
- Inicio: Linear, Stripe e Notion
- Campanhas e Captacao: Meta Business Suite, Mailchimp e Typeform
- Relatorios: Stripe, Google Analytics simplificado e HubSpot Reports
- Assistente Altum: ChatGPT, Intercom e Zendesk

## 7. Cores por contexto

- A marca Altum manda na interface geral.
- Verde aparece em WhatsApp, conversa e sucesso.
- Gradiente Instagram apenas em contexto de Instagram.
- Azul Meta apenas em contexto de Meta e Facebook.
- Cores Google apenas em contexto de Google Ads.
- Roxo em IA.
- Laranja em alerta e pendencia.
- Vermelho em erro e risco.

## 8. Cuidados de implementacao

- Nao criar biblioteca visual paralela sem necessidade.
- Reaproveitar componentes existentes quando possivel.
- Preferir alteracoes incrementais e revisaveis.
- Rodar `lint`, `typecheck` e `build` quando possivel.
- Documentar riscos.
- Antes de grandes unificacoes, preservar compatibilidade com rotas atuais.
- Em toda mudanca, buscar mais clareza, robustez e maturidade visual para quem usa a plataforma.
- Remover ou esconder previews, cards, blocos explicativos e informacoes que nao ajudem o usuario a decidir ou agir.
- Evitar telas com aparencia de MVP: excesso de cards, metricas soltas, textos genericos, diagnosticos sem acao e secoes decorativas.
- Cada bloco visivel deve responder a uma destas perguntas: o que aconteceu, o que preciso fazer, onde configuro, qual risco existe ou qual resultado tive.
- Preferir layouts mais enxutos, hierarquia clara, acoes principais obvias e linguagem comercial.
- Informacoes tecnicas, debug, logs, runtime, filas, providers e detalhes de integracao devem ir para areas avancadas ou perfis tecnicos.

## 9. Curadoria por perfil

- `Atendente`: ver apenas o necessario para responder conversas, acompanhar clientes, mover etapa e registrar proxima acao.
- `Gestor comercial`: ver operacao, funil, propostas, agenda, campanhas e relatorios.
- `Admin do cliente`: ver equipe, empresa, canais, permissoes e configuracoes operacionais do negocio.
- `Tecnico ou Altum`: ver automacoes, comportamento da IA, escaladas, implantacao, logs e avancado.

Regras permanentes:

- cliente comum nao deve ver de frente controles tecnicos da IA, logs, runtime, guardrails ou filas tecnicas
- automacoes e comportamento da IA devem usar linguagem comercial e humana quando estiverem fora do avancado
- o menu principal deve privilegiar trabalho diario; configuracao e poder tecnico ficam em segunda camada
