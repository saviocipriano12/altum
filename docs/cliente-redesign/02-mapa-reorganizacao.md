# Mapa de reorganizacao do portal do cliente

## Tese de produto

- O cliente final nao deve sentir que esta navegando entre sistemas diferentes.
- `Inbox`, `CRM`, `Funil`, `Retornos`, `Comercial`, `IA`, `Conhecimento`, `Handoffs` e `Automacoes` precisam deixar de parecer ilhas.
- A navegacao principal deve refletir a jornada natural de uso, nao a divisao tecnica atual do sistema.

## Nova navegacao principal

1. `Inicio`
2. `Conversas`
3. `Clientes & Oportunidades`
4. `Agenda`
5. `Campanhas`
6. `Relatorios`
7. `Assistente Altum`
8. `Configuracoes`

## Estrutura proposta por area

### Inicio

- pergunta principal:
  - `o que preciso fazer agora?`
- referencias de experiencia:
  - Linear
  - Stripe
  - Notion
- conteudos principais:
  - prioridades de hoje
  - conversas aguardando
  - leads novos
  - propostas abertas
  - tarefas vencidas
  - oportunidades paradas
  - insights da Altum

### Conversas

- referencia de experiencia:
  - WhatsApp Web
- estrutura:
  - coluna esquerda: lista de conversas
  - centro: chat
  - direita: painel do cliente/oportunidade
- regra:
  - a conversa precisa virar o centro da venda

### Clientes & Oportunidades

- referencias de experiencia:
  - HubSpot
  - Pipedrive
- regra central:
  - o dado e o mesmo; muda apenas a visualizacao
- visualizacoes:
  - `Lista`
  - `Kanban`
  - `Agenda`
  - `Propostas`
- reforco:
  - `CRM` vira a visualizacao `Lista`
  - `Funil/Pipeline` vira a visualizacao `Kanban`
  - `Comercial` vira `Propostas/Financeiro` dentro da ficha do cliente/oportunidade e tambem uma view `Propostas`

### Agenda

- consolidacao de:
  - retornos
  - follow-ups
  - tarefas
  - compromissos
- reforco:
  - `Retornos` e `Agenda` deixam de existir como modulos mentais separados

### Campanhas

- referencias de experiencia:
  - Meta Business Suite
  - Mailchimp
  - Typeform
- subareas sugeridas:
  - `Campanhas`
  - `Captacao`
  - `Social`, se fizer sentido por perfil

### Relatorios

- referencias de experiencia:
  - Stripe
  - Google Analytics simplificado
  - HubSpot Reports
- reforco:
  - `Metricas` vira `Relatorios`
  - menos leitura tecnica, mais apoio a decisao

### Assistente Altum

- referencias de experiencia:
  - ChatGPT
  - Intercom
  - Zendesk
- agrupamentos:
  - comportamento da IA
  - base de conhecimento
  - simulacoes
  - automacoes
  - escaladas para humano
  - logs tecnicos, quando fizer sentido e por permissao
- reforco:
  - `IA`, `Conhecimento`, `Handoffs` e `Automacoes` precisam ser percebidos como partes de um mesmo assistente configuravel

### Configuracoes

- hub enxuto e menos poluido
- subareas:
  - Empresa
  - Usuarios
  - Times
  - Canais
  - Operacao
  - Implantacao
  - Avancado
- reforco:
  - `Go-live` sai do menu principal
  - `Logs` saem do menu principal

## Mapa tela atual -> nova localizacao

| Tela atual | Nova localizacao | O que muda | O que precisa ser preservado |
| --- | --- | --- | --- |
| Visao geral | `Inicio` | Troca leitura executiva extensa por foco em acao imediata. | KPIs, prioridades, funil resumido, sinais de IA, readiness. |
| Inbox | `Conversas` | Vira centro do atendimento e da venda com layout mais familiar. | Lista de chats, thread, contexto do lead, midia, AI state, filtros e deep links. |
| CRM | `Clientes & Oportunidades > Lista` | Sai de modulo isolado e vira uma view da mesma base. | Filtros, importacao CSV, detalhe do lead, qualification IA, tasks, notes. |
| Funil / Pipeline | `Clientes & Oportunidades > Kanban` | Mesmo dado do CRM com troca de view, nao rota mental separada. | Drag-and-drop, configuracao de etapas, leitura por coluna. |
| Retornos / Follow-ups | `Agenda` e ficha lateral do cliente | Deixa de ser ilha; vira parte do fluxo do cliente e da agenda. | Fila de tarefas, filtros por owner/status/prioridade, concluir/reabrir. |
| Agenda | `Agenda` | Mantem rota propria, mas passa a reunir appointments + follow-ups + proximo passo. | Criacao de compromissos, status, owner, vinculo com lead. |
| Comercial | `Clientes & Oportunidades > Propostas` e ficha lateral | Propostas e financeiro entram no contexto da oportunidade. | Propostas, financeiro, cobranca, vinculo ao lead, charge preview. |
| Captacao | `Campanhas > Captacao` | Entra no guarda-chuva de aquisicao. | Formularios, landing, submissions, origem, owner, tags. |
| Campanhas | `Campanhas` | Mantem escopo, com linguagem menos tecnica e mais comercial. | Editor, preview de audiencia, disparo, historico de rodadas. |
| Metricas | `Relatorios` | Nome e narrativa mudam para leitura mais comercial. | KPIs, funil, canais, IA, operacao, range, sync. |
| IA | `Assistente Altum` | Console tecnico vira produto de apoio a atendimento e vendas. | Politicas, preview, uso/custo, documentos e simulacoes. |
| Conhecimento | `Assistente Altum > Base de conhecimento` | Deixa de ser modulo solto. | CRUD de docs, tags, uso por documento, gatilhos de escalada. |
| Handoffs | `Assistente Altum > Escaladas para humano` e contexto de Conversas | Sai do papel de monitor isolado. | Motivos, owner humano, risco, acao por chat. |
| Automacoes | `Assistente Altum > Automacoes` ou `Configuracoes > Avancado` | Reposiciona para gestor/admin, nao como item de rotina para todo cliente. | Builder, templates, executions, queue, ativacao. |
| Operacao Instagram | `Configuracoes > Social` ou `Avancado` | Sai da navegacao principal. | Fluxos Instagram, logs, retry, status. |
| Go-live | `Configuracoes > Implantacao` | Some da rotina diaria e vira area de setup. | Readiness, checklist, onboarding manual, validacao. |
| Logs | `Configuracoes > Avancado > Logs tecnicos` | Oculto por perfil tecnico/suporte. | AI logs, executions, fila, busca cruzada. |
| Configuracoes | `Configuracoes` | Fica mais curta, menos misturada com narrativa de produto. | Empresa, usuarios, times, canais, push, atalhos de setup. |

## Funcionalidade atual -> nova experiencia do usuario

| Funcionalidade atual | Nova experiencia do usuario |
| --- | --- |
| Responder mensagens no Inbox | Atender em `Conversas`, com chat central e contexto comercial lateral |
| Ver dados do lead no CRM | Abrir a ficha lateral do cliente sem sair da conversa ou da lista |
| Mover etapa no Pipeline | Mover a oportunidade na propria conversa ou na view `Kanban` |
| Criar follow-up em CRM ou Inbox | Criar tarefa/proximo passo no contexto do cliente e ver tudo em `Agenda` |
| Criar proposta em Comercial | Criar proposta dentro da ficha do cliente/oportunidade e acompanhar em `Propostas` |
| Ver historico e notas em varias telas | Consultar uma ficha unica com abas reutilizaveis |
| Configurar IA em modulo separado | Ajustar o `Assistente Altum` como apoio a vendas e atendimento |
| Ver conhecimento em tela isolada | Gerir `Base de conhecimento` dentro do Assistente Altum |
| Ver handoffs como modulo tecnico | Acompanhar escaladas para humano no contexto da operacao da IA |
| Ver logs no menu principal | Acessar logs tecnicos apenas em modo avancado ou perfil tecnico |
| Acompanhar readiness em go-live | Ver `Implantacao` dentro de Configuracoes quando necessario |

## Rotas antigas e rotas canonicas sugeridas

| Rota antiga | Rota canonica sugerida | Compatibilidade sugerida |
| --- | --- | --- |
| `/cliente/painel` | `/cliente/painel` | Mantida; apenas muda rotulo para `Inicio`. |
| `/cliente/painel/inbox` | `/cliente/painel/conversas` | Alias temporario; preservar `chatId`, filtros e contexto. |
| `/cliente/painel/crm` | `/cliente/painel/clientes?view=list` | Alias temporario; abrir drawer via `leadId`. |
| `/cliente/painel/pipeline` | `/cliente/painel/clientes?view=kanban` | Alias temporario; preservar coluna/lead selecionado. |
| `/cliente/painel/follow-ups` | `/cliente/painel/agenda?view=tarefas` | Alias temporario; mapear filtros atuais. |
| `/cliente/painel/agenda` | `/cliente/painel/agenda` | Mantida; ganha tabs internas. |
| `/cliente/painel/comercial` | `/cliente/painel/clientes?view=propostas` | Alias temporario; preservar `leadId`, `budgetStatus`, `financeStatus`, `financeType`. |
| `/cliente/painel/campanhas` | `/cliente/painel/campanhas` | Mantida. |
| `/cliente/painel/captacao` | `/cliente/painel/campanhas/captacao` | Alias temporario; preservar `formId`. |
| `/cliente/painel/metricas` | `/cliente/painel/relatorios` | Alias temporario com preservacao de `range`. |
| `/cliente/painel/ia` | `/cliente/painel/assistente` | Alias temporario. |
| `/cliente/painel/conhecimento` | `/cliente/painel/assistente/conhecimento` | Alias temporario. |
| `/cliente/painel/handoffs` | `/cliente/painel/assistente/escaladas` | Alias temporario. |
| `/cliente/painel/automacoes` | `/cliente/painel/assistente/automacoes` | Alias temporario protegido por capability. |
| `/cliente/painel/automacoes/instagram` | `/cliente/painel/configuracoes/social` | Alias temporario protegido. |
| `/cliente/painel/go-live` | `/cliente/painel/configuracoes/implantacao` | Alias temporario protegido. |
| `/cliente/painel/logs` | `/cliente/painel/configuracoes/avancado/logs` | Alias temporario protegido. |

## Estrategia de compatibilidade

- primeira implementacao segura:
  - criar base visual e nova navegacao
  - nao unificar rotas complexas ainda
  - nao remover rotas antigas
  - manter compatibilidade com query params
  - validar `app/admin` sem alteracoes
- deep links obrigatorios a preservar:
  - `chatId`
  - `leadId`
  - `campaignId`
  - filtros de agenda/follow-ups
  - filtros de comercial
  - `range` em metricas
- a busca global deve continuar encontrando os mesmos objetos e apontando para as rotas canonicas novas
- o command palette e a bottom nav precisam refletir a nova taxonomia sem quebrar links antigos

## Jornadas por perfil

### Atendente

1. Entra em `Inicio` e ve prioridades.
2. Vai para `Conversas`.
3. Responde cliente.
4. Consulta contexto do lead no painel lateral.
5. Move etapa, cria tarefa ou registra nota sem sair da conversa.
6. Usa `Agenda` para saber o proximo passo.

### Gestor comercial

1. Entra em `Inicio` e entende o que esta parado.
2. Vai para `Clientes & Oportunidades`.
3. Alterna entre `Lista`, `Kanban` e `Propostas`.
4. Acompanha gargalos, valores, temperatura e responsaveis.
5. Usa `Campanhas` para aquisicao ou reativacao.
6. Usa `Relatorios` para tomar decisao.

### Admin do cliente

1. Usa o mesmo fluxo do gestor comercial.
2. Entra em `Configuracoes` para ajustar usuarios, equipe, canais, operacao e implantacao.
3. Consulta `Assistente Altum` para IA, base de conhecimento e automacoes.

### Suporte tecnico/Altum

1. Entra por perfis com maior permissao.
2. Acessa `Configuracoes` avancadas, `Canais`, `Implantacao` e `Logs tecnicos`.
3. Investiga fila, integracao, readiness e incidentes sem poluir o menu do cliente comum.

## O que cada perfil deveria ver no menu principal

| Perfil | Menu principal desejado |
| --- | --- |
| Atendente | `Inicio`, `Conversas`, `Clientes & Oportunidades`, `Agenda` |
| Gestor comercial | `Inicio`, `Conversas`, `Clientes & Oportunidades`, `Agenda`, `Campanhas`, `Relatorios`, `Assistente Altum`, `Configuracoes` |
| Admin do cliente | Mesmo do gestor, com configuracoes completas conforme capability |
| Suporte tecnico/Altum | Mesmo do admin, com acesso a areas avancadas e tecnicas |

## O que deve ficar escondido ou em modo avancado

- `Logs`
- `Go-live` como item principal
- `Operacao Instagram`
- detalhes de fila tecnica
- runtime, budgets de IA, guardrails e termos de infraestrutura
- configuracoes de canais e health checks
- regras de distribuicao e operacao mais sensiveis
- detalhes profundos de automacoes para perfis de operacao simples

## Dicionario de renomeacao

| Termo atual | Novo termo recomendado |
| --- | --- |
| Inbox | Conversas |
| Visao geral | Inicio |
| CRM + Funil | Clientes & Oportunidades |
| Retornos / Follow-ups | Agenda |
| Metricas | Relatorios |
| IA | Assistente Altum |
| Conhecimento | Base de conhecimento |
| Handoffs | Escaladas para humano ou Controle da IA |
| Logs | Logs tecnicos / Avancado |
| Go-live | Implantacao |

## Termos a evitar no cliente comum

- `modo operacional premium`
- `modo essencial`
- `analise completa`
- `leitura executiva`, quando usada em excesso
- `handoff`
- `logs`
- `filas tecnicas`
- `runtime`
- `guardrails`, exceto em configuracao avancada

## Decisoes estrategicas reforcadas

- CRM e Funil nao devem ser tratados como produtos separados.
- Comercial deve ser contexto da oportunidade, nao uma ilha.
- Retornos e Agenda devem formar uma unica experiencia.
- IA, Conhecimento, Handoffs e Automacoes devem formar o `Assistente Altum`.
- Go-live e Logs saem do menu principal e entram em `Configuracoes` ou `Avancado`.
