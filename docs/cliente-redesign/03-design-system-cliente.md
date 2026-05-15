# Design system proposto para o portal do cliente

## Principios

- parecer produto SaaS comercial, nao painel interno
- ser claro por padrao
- priorizar acao e leitura rapida
- reduzir laranja/bege como linguagem dominante
- manter tudo escopado ao portal do cliente para nao afetar `app/admin`
- transmitir familiaridade de uso por area, sem copiar identidade visual de terceiros

## Regra de escopo tecnico

- tokens do cliente devem continuar em prefixo `--cliente-*`
- novos estilos do portal devem ficar em camada dedicada e escopada
- evitar seletores globais genericos em `app/globals.css`
- se houver refatoracao de CSS, mover o que for possivel para uma folha exclusiva do cliente antes de expandir o redesign

## Referencias de experiencia por area

### Inicio

- referencias:
  - Linear
  - Stripe
  - Notion
- leitura esperada:
  - poucos cards
  - numeros fortes
  - acoes recomendadas
  - pouco texto explicativo

### Conversas

- referencia:
  - WhatsApp Web
- leitura esperada:
  - lista de conversas a esquerda
  - thread no centro
  - composer fixo
  - painel lateral com contexto comercial

### Clientes & Oportunidades

- referencias:
  - HubSpot
  - Pipedrive
- leitura esperada:
  - filtros claros
  - lista e kanban do mesmo dado
  - ficha lateral unica
  - acoes comerciais sempre no contexto do lead

### Campanhas e Captacao

- referencias:
  - Meta Business Suite
  - Mailchimp
  - Typeform
- leitura esperada:
  - status claros
  - segmentacao simples
  - captacao em subarea propria

### Relatorios

- referencias:
  - Stripe
  - Google Analytics simplificado
  - HubSpot Reports
- leitura esperada:
  - KPI limpo
  - grafico simples
  - conclusao clara

### Assistente Altum

- referencias:
  - ChatGPT
  - Intercom
  - Zendesk
- leitura esperada:
  - assistente configuravel
  - base de conhecimento, simulacao e automacao conectadas
  - menos cara de console tecnico

## Tokens de cor

### Base

| Token | Valor | Uso |
| --- | --- | --- |
| `--cliente-bg` | `#F6F8FB` | Fundo geral |
| `--cliente-bg-elevated` | `#EEF3F9` | Areas levemente destacadas |
| `--cliente-card` | `#FFFFFF` | Cards, drawers e paineis |
| `--cliente-panel-soft` | `#F8FAFC` | Superficies secundarias |
| `--cliente-border` | `#E5E7EB` | Borda padrao |
| `--cliente-border-strong` | `#CBD5E1` | Borda de foco e divisao forte |
| `--cliente-text` | `#0F172A` | Texto principal |
| `--cliente-text-muted` | `#334155` | Texto secundario forte |
| `--cliente-text-soft` | `#64748B` | Texto auxiliar |

### Marca e estados

| Token | Valor | Uso |
| --- | --- | --- |
| `--cliente-primary` | `#2563EB` | CTA principal, links, tabs ativas |
| `--cliente-primary-hover` | `#1D4ED8` | Hover do CTA principal |
| `--cliente-success` | `#16A34A` | Sucesso e WhatsApp |
| `--cliente-ai` | `#7C3AED` | Assistente Altum, IA, automacoes inteligentes |
| `--cliente-warning` | `#F97316` | Implantacao, pendencias, alertas |
| `--cliente-danger` | `#EF4444` | Erro, risco e bloqueio |
| `--cliente-info` | `#0EA5E9` | Apoio informativo opcional |

### Tintas suaves

| Token | Valor | Uso |
| --- | --- | --- |
| `--cliente-primary-soft` | `#DBEAFE` | Fundo de badge/acao azul |
| `--cliente-success-soft` | `#DCFCE7` | Fundo de sucesso/WhatsApp |
| `--cliente-ai-soft` | `#EDE9FE` | Fundo de IA |
| `--cliente-warning-soft` | `#FFEDD5` | Fundo de alerta |
| `--cliente-danger-soft` | `#FEE2E2` | Fundo de erro |
| `--cliente-muted-soft` | `#F1F5F9` | Fundo neutro |

### Regras de cor por contexto de plataforma

| Contexto | Regra |
| --- | --- |
| Instagram | gradiente apenas em badge, card ou detalhe contextual |
| Meta/Facebook | azul Meta apenas em conector, canal ou campanha Meta |
| Google Ads | cores Google apenas em conector ou campanha Google |
| WhatsApp | verde apenas em conversa, envio, sucesso ou canal conectado |

Reforco:

- a marca Altum continua mandando na interface
- cores de plataforma aparecem como contexto, nunca como tema geral do portal

## Tipografia

- fonte recomendada:
  - prioridade: fonte ja existente bem configurada
  - fallback seguro: `Inter`, `Geist`, `Plus Jakarta Sans`
- escala:

| Uso | Tamanho | Peso | Observacao |
| --- | --- | --- | --- |
| Titulo de pagina | `24px` | `600` | Uma linha, claro e direto |
| Titulo de secao | `16px` | `600` | Cards e blocos |
| KPI principal | `28px` | `600` | Numeros de destaque |
| Texto base | `14px` | `400-500` | Corpo do portal |
| Texto auxiliar | `12px` | `400` | Metadata, badges e ajuda curta |
| Label uppercase | `11-12px` | `600` | Navegacao e microtitulo |

## Espacamento

| Token conceitual | Valor |
| --- | --- |
| `space-1` | `4px` |
| `space-2` | `8px` |
| `space-3` | `12px` |
| `space-4` | `16px` |
| `space-5` | `20px` |
| `space-6` | `24px` |
| `space-8` | `32px` |
| `space-10` | `40px` |

- cards padrao: `20px` a `24px`
- drawers e paineis laterais: `24px`
- gaps entre blocos principais: `24px`

## Radius

| Uso | Valor |
| --- | --- |
| Input pequeno | `12px` |
| Botao padrao | `14px` |
| Card padrao | `20px` |
| Card destaque | `24px` |
| Drawer | `24px` |
| Badge | `999px` |

## Sombras

| Uso | Valor sugerido |
| --- | --- |
| `shadow-soft` | `0 10px 30px rgba(15, 23, 42, 0.06)` |
| `shadow-card-hover` | `0 16px 36px rgba(15, 23, 42, 0.10)` |
| `shadow-drawer` | `0 20px 48px rgba(15, 23, 42, 0.14)` |
| `shadow-topbar` | `0 8px 20px rgba(15, 23, 42, 0.06)` |

## Botoes

- primario:
  - fundo `--cliente-primary`
  - texto branco
  - hover `--cliente-primary-hover`
- secundario:
  - fundo branco
  - borda `--cliente-border`
  - texto `--cliente-text`
- ghost:
  - sem fundo fixo
  - hover em `--cliente-muted-soft`
- perigo:
  - usar apenas em exclusao ou bloqueio

Regras:

- um CTA principal por bloco
- evitar mais de 2 botoes fortes competindo no mesmo card
- em `Conversas`, o CTA principal do composer deve ser `Enviar`

## Inputs

- fundo branco
- borda `--cliente-border`
- foco com anel azul suave
- placeholder em `--cliente-text-soft`
- altura padrao entre `40px` e `44px`

## Cards

- fundo branco
- borda sutil
- sombra leve
- cabecalho curto
- maximo de 1 insight principal por card

Camadas recomendadas:

- `card neutro`
  - uso estrutural do dia a dia
- `card tonal`
  - fundo levemente colorido para prioridade, insight, IA, campanha ou alerta leve
- `card destaque`
  - cor mais forte e rara, usada para hero, prioridade central ou insight realmente importante

Regras:

- reduzir card dentro de card
- em `Inicio`, preferir 4 a 6 blocos fortes a um mosaico de mini-cards
- acima da dobra, usar no maximo 1 ou 2 cards realmente fortes por area
- cor forte deve sinalizar prioridade, nao decoracao

## Badges

- azul:
  - status ativo
  - etapa
  - ownership
- verde:
  - sucesso
  - WhatsApp
  - pago
  - respondido
- roxo:
  - IA
  - insight
  - recomendacao do assistente
- laranja:
  - pendencia
  - prazo
  - implantacao
  - risco medio
- vermelho:
  - bloqueio
  - erro
  - atraso grave
- cinza:
  - estado neutro
  - metadata
  - rascunho

## Tabelas

- cabecalho fixo quando houver rolagem
- linhas altas o bastante para leitura rapida
- primeira coluna com contexto principal
- ultima coluna com acoes discretas

## Tabs e view switchers

- tabs curtas:
  - `Lista`
  - `Kanban`
  - `Agenda`
  - `Propostas`
- o dado nao muda; muda apenas a visualizacao
- a tab ativa deve usar azul, nao laranja

## Drawers

- peca central do redesign
- largura recomendada:
  - desktop: `400px` a `480px`
  - tablet: `100%` ou `88vw`
- deve suportar:
  - Dados
  - Conversas
  - Tarefas
  - Propostas
  - Historico
  - Financeiro/comercial
  - IA/insights

## Kanban

- colunas claras, com titulo, contagem e soma opcional
- cards com:
  - nome
  - empresa
  - valor
  - temperatura
  - proxima acao
  - responsavel

## Chat

- estrutura:
  - lista esquerda `320px` a `360px`
  - thread central fluida
  - painel direito `360px` a `420px`
- elementos:
  - cabecalho com status, owner, etapa e temperatura
  - bolhas com separacao clara de entrada e saida
  - composer fixo
  - respostas rapidas
  - anexos, audio, imagem e documento
  - acoes comerciais no painel lateral

Regras:

- verde apenas para sinais de WhatsApp e sucesso
- CTA comercial nao deve poluir a thread
- o usuario deve entender em segundos:
  - quem esta aguardando resposta
  - em que etapa esta a oportunidade
  - qual e a proxima acao

## Empty states

- titulo curto
- uma frase orientada a acao
- um CTA principal

## Loading states

- skeleton leve em listas e cards
- spinner apenas para operacoes localizadas
- evitar tela inteira vazia com loader em fluxos frequentes

## Toasts

- curtos
- objetivos
- com verbo claro

## Motion e animacoes

- duracao base: `180ms` a `220ms`
- curva suave
- usos principais:
  - entrada de drawer
  - transicao entre tabs
  - hover leve de card/lista
  - skeleton fade

Regras adicionais:

- usar `stagger` suave em listas e secoes de dashboard
- usar elevacao discreta em hover de card clicavel
- evitar bounce, rotacao ou animacao decorativa sem funcao
- motion deve costurar a experiencia, nao competir com a leitura

## Navegacao principal

1. `Inicio`
2. `Conversas`
3. `Clientes & Oportunidades`
4. `Agenda`
5. `Campanhas`
6. `Relatorios`
7. `Assistente Altum`
8. `Configuracoes`

Regras:

- nomes curtos
- nada de siglas internas como item principal
- modulos tecnicos nao entram no primeiro nivel para o cliente comum

## Linguagem e microcopy

- preferir:
  - `Prioridades de hoje`
  - `Conversas aguardando`
  - `Leads novos`
  - `Propostas abertas`
  - `Tarefas vencidas`
  - `Oportunidades paradas`
  - `Insights da Altum`
- evitar:
  - `modo operacional premium`
  - `modo essencial`
  - `analise completa`
  - `leitura executiva` recorrente
  - `handoff`
  - `runtime`
  - `guardrails` fora do avancado

## Linguagem visual a evitar

- excesso de laranja em botoes e destaques
- fundo bege dominante
- cards demais na primeira dobra
- excesso de texto institucional
- componentes com cara de painel interno
- labels tecnicas em destaque

## Componentes que valem reaproveitar

- `PanelCard`
- `SectionHeader`
- `MetricCard`
- `StateBadge`
- `EmptyState`

## Componentes que devem evoluir no redesign

- `ClienteSidebar`
- `ClienteTopbar`
- `ClienteBottomNav`
- layout de `Inbox`
- drawer/ficha de lead no `CRM`
- selectors de modo `essencial` x `completo`, que hoje ficam muito expostos

## Risco visual atual identificado

- o tema claro atual ainda carrega muito bege/laranja em tokens globais do cliente
- existe grande quantidade de CSS especifico por pagina dentro de `app/globals.css`
- o redesign deve reduzir variacoes soltas por modulo e convergir para um sistema unico, mais limpo e azul-centrico
