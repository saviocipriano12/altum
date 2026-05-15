# Plano de implementacao do redesign do portal do cliente

## Premissas

- nao alterar `app/admin`
- nao remover funcionalidades existentes
- nao reescrever backend, auth, banco ou integracoes
- trabalhar com rotas antigas em compatibilidade ate a consolidacao final
- priorizar componentes compartilhados e reorganizacao de UX antes de qualquer limpeza agressiva
- nao transformar a primeira etapa em laboratorio paralelo de preview
- aplicar a nova experiencia nas rotas reais, com rollout seguro e progressivo

## Estrategia segura de primeira implementacao

1. criar base visual e nova navegacao
2. nao unificar rotas complexas ainda
3. nao remover rotas antigas
4. manter compatibilidade com query params atuais
5. adiar redirects e aliases definitivos para depois da validacao da UX
6. validar explicitamente que `app/admin` nao sofreu impacto

## O que esta fora da primeira implementacao

- migracao total de `CRM`, `Pipeline`, `Comercial` e `Follow-ups` para uma rota unica
- remocao de modulos antigos
- mudanca de contratos de API
- troca de bibliotecas principais
- limpeza estrutural profunda de backend

## Comandos base de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 1: layout base, sidebar, topbar e tokens

### Objetivo

Criar a nova base visual e a nova arquitetura de navegacao do portal do cliente, sem ainda redesenhar os modulos profundos.

### Entregavel estrategico

- o usuario ja deve sentir que entrou em uma plataforma nova, mais comercial e mais simples
- a nova taxonomia principal precisa estar visivel:
  - Inicio
  - Conversas
  - Clientes & Oportunidades
  - Agenda
  - Campanhas
  - Relatorios
  - Assistente Altum
  - Configuracoes

### Arquivos provaveis a alterar

- `app/cliente/painel/layout.tsx`
- `app/cliente/painel/components/cliente-sidebar.tsx`
- `app/cliente/painel/components/cliente-topbar.tsx`
- `app/cliente/painel/components/cliente-bottom-nav.tsx`
- `app/cliente/painel/components/cliente-shell.tsx`
- `app/cliente/painel/components/ui.tsx`
- `app/globals.css` ou um novo arquivo CSS exclusivo do cliente

### Componentes novos necessarios

- `ClientePortalTheme`
- `ClientePrimaryNav`
- `ClientePageHeader`
- `ClienteViewSwitcher`
- `ClienteContextDrawerShell`

### Componentes existentes que podem ser reaproveitados

- `PanelCard`
- `SectionHeader`
- `MetricCard`
- `StateBadge`
- `ClienteGlobalSearch`
- `ClienteCommandPalette`

### Riscos

- CSS global do cliente hoje vive em `app/globals.css`
- a navegacao atual depende de capabilities em pontos especificos
- o modo `essencial` x `completo` pode conflitar com a nova simplificacao
- renomear o menu sem aliases claros pode confundir usuarios que usam URLs antigas

### Criterios de aceite

- novo shell visual aplicado apenas na area do cliente
- navegacao principal reduzida para 8 itens
- `app/admin` permanece visualmente intacto
- busca global e command palette continuam funcionando
- mobile e desktop mantem navegacao utilizavel
- nenhuma rota antiga e removida nesta fase

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 2: Inicio

### Objetivo

Transformar a home em uma tela de prioridades, nao em um mosaico tecnico.

### Entregavel estrategico

- o `Inicio` deve responder rapidamente:
  - quem precisa de resposta
  - quais leads estao ativos
  - quais propostas estao abertas
  - o que esta parado
  - o que a Altum recomenda fazer agora

### Arquivos provaveis a alterar

- `app/cliente/painel/page.tsx`
- componentes novos de prioridade e resumo

### Componentes novos necessarios

- `ClientPriorityBoard`
- `ClientTodayQueue`
- `ClientPipelineSnapshot`
- `ClientAiInsightsCard`
- `ClientRecommendedActions`

### Componentes existentes que podem ser reaproveitados

- `MetricCard`
- `PanelCard`
- `EmptyState`
- hooks de polling e readiness

### Riscos

- excesso de KPI pode manter a pagina poluida
- dados vem de varias APIs diferentes; a home e sensivel a latencia

### Criterios de aceite

- a primeira dobra responde `o que preciso fazer agora?`
- conversas aguardando, leads novos, propostas abertas e tarefas vencidas ficam claros
- linguagem reduz termos tecnicos
- acoes levam para Conversas, Clientes & Oportunidades, Agenda ou Configuracoes corretas

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 3: Conversas estilo WhatsApp + painel de cliente

### Objetivo

Fazer `Conversas` virar o centro da venda e do atendimento, com layout familiar e contexto comercial lateral.

### Entregavel estrategico

- o usuario deve conseguir atender, entender o lead, mover oportunidade, criar tarefa e iniciar proposta sem sentir troca de modulo

### Arquivos provaveis a alterar

- `app/cliente/painel/inbox/page.tsx`
- `app/cliente/painel/components/ui.tsx`
- possiveis novos componentes em `app/cliente/painel/components/`

### Componentes novos necessarios

- `ConversationList`
- `ConversationThread`
- `ConversationComposer`
- `ClientOpportunityDrawer`
- `QuickReplyBar`
- `ConversationMetaBar`

### Componentes existentes que podem ser reaproveitados

- estrutura de dados e endpoints de `Inbox`
- `ClienteGlobalSearch`
- `StateBadge`
- logica atual de notes, tasks e stage update

### Riscos

- pagina de maior criticidade do portal
- muitas acoes coexistem no mesmo fluxo
- risco alto de quebrar anexos, templates, AI state e filtros

### Criterios de aceite

- lista esquerda, thread central e painel direito funcionais
- composer fixo no rodape
- painel lateral mostra lead, etapa, responsavel, temperatura, proxima acao, tarefas, propostas e historico
- deep links com `chatId` continuam abrindo a conversa correta

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 4: Clientes & Oportunidades unificando CRM e Funil

### Objetivo

Unificar `CRM`, `Pipeline`, `Comercial` e partes de `Follow-ups` sob um dominio unico com views alternaveis.

### Entregavel estrategico

- `CRM` deixa de ser nome de produto para o cliente final
- `Funil` vira apenas uma forma de ver o mesmo dado
- `Comercial` passa a ser experiencia de proposta/financeiro dentro da oportunidade

### Arquivos provaveis a alterar

- `app/cliente/painel/crm/page.tsx`
- `app/cliente/painel/pipeline/page.tsx`
- `app/cliente/painel/comercial/page.tsx`
- possiveis novas rotas canonicas, por exemplo `app/cliente/painel/clientes/*`

### Componentes novos necessarios

- `ClientOpportunityWorkspace`
- `ClientListView`
- `ClientKanbanView`
- `ClientProposalsView`
- `ClientRecordDrawer`
- `ClientRecordTabs`

### Componentes existentes que podem ser reaproveitados

- drawer e detalhe de lead do CRM
- kanban do Pipeline
- formularios de proposta e financeiro do Comercial
- qualificacao IA, timeline, tasks e notes do CRM

### Riscos

- varios modulos compartilham query params e estados locais
- grande chance de duplicar logica se nao houver extracao de componentes
- importacao CSV e geracao de campanha precisam continuar acessiveis

### Criterios de aceite

- o mesmo lead pode ser aberto em lista, kanban, agenda e propostas
- ficha lateral unica reutilizada entre views
- `leadId` abre o mesmo registro em qualquer view
- propostas e financeiro aparecem no contexto do cliente/oportunidade

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 5: Agenda/Tarefas

### Objetivo

Juntar compromissos, retornos e proximo passo em uma experiencia unica de agenda operacional.

### Entregavel estrategico

- `Retornos` deixa de ser um destino mental separado
- `Agenda` vira a tela de acompanhamento do que precisa acontecer a seguir

### Arquivos provaveis a alterar

- `app/cliente/painel/agenda/page.tsx`
- `app/cliente/painel/follow-ups/page.tsx`
- componentes compartilhados da ficha do cliente

### Componentes novos necessarios

- `ClientAgendaBoard`
- `ClientTaskList`
- `ClientAgendaFilters`
- `ClientNextActionsPanel`

### Componentes existentes que podem ser reaproveitados

- CRUD de appointments
- fila de follow-ups
- tarefas do CRM e do Inbox

### Riscos

- duplicidade entre task, follow-up e appointment
- filtros hoje estao espalhados entre paginas diferentes

### Criterios de aceite

- usuario entende em uma unica tela o que esta vencido, o que e hoje e o que vem depois
- retornos podem ser concluidos e abertos sem mudar de modulo
- abrir item da agenda pode mostrar a mesma ficha lateral do cliente

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 6: Campanhas, Relatorios e Assistente Altum

### Objetivo

Reposicionar modulos de crescimento, inteligencia e analise com linguagem mais comercial e menos tecnica.

### Entregavel estrategico

- `Campanhas` precisa parecer area de crescimento, nao ferramenta interna
- `Relatorios` precisa ajudar decisao, nao parecer console analitico
- `Assistente Altum` precisa parecer produto configuravel de apoio, nao tela de infraestrutura de IA

### Arquivos provaveis a alterar

- `app/cliente/painel/campanhas/page.tsx`
- `app/cliente/painel/captacao/page.tsx`
- `app/cliente/painel/metricas/page.tsx`
- `app/cliente/painel/ia/page.tsx`
- `app/cliente/painel/conhecimento/page.tsx`
- `app/cliente/painel/handoffs/page.tsx`
- `app/cliente/painel/automacoes/page.tsx`

### Componentes novos necessarios

- `CampaignWorkspace`
- `AcquisitionWorkspace`
- `ReportsOverview`
- `AssistenteAltumHome`
- `KnowledgeLibrary`
- `AutomationOverview`
- `HandoffDeskLite`

### Componentes existentes que podem ser reaproveitados

- editor de campanhas e preview de audiencia
- editor de formularios e landing de captacao
- KPIs e graficos de metricas
- blocos de saude e preview da IA
- biblioteca KB e analise de uso

### Riscos

- IA e Automacoes estao entre as paginas mais longas do projeto
- existe muito texto tecnico e varios modos de leitura
- risco de mover demais para o `Assistente Altum` e esconder funcoes importantes de gestao

### Criterios de aceite

- `Campanhas` comunica aquisicao e outbound com clareza
- `Relatorios` traduz metricas para linguagem comercial
- `Assistente Altum` mostra ajuda pratica, base de conhecimento e automacoes sem parecer console tecnico
- logs e canais avancados nao aparecem para perfil comum

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Fase 7: limpeza de rotas antigas, redirects e QA

### Objetivo

Consolidar rotas canonicas, manter compatibilidade e fechar o ciclo de regressao.

### Entregavel estrategico

- o usuario navega pela nova taxonomia sem perceber a heranca estrutural do sistema antigo

### Arquivos provaveis a alterar

- wrappers/redirects em rotas antigas do cliente
- `cliente-sidebar.tsx`
- `cliente-command-palette.tsx`
- `cliente-bottom-nav.tsx`
- possivel mapa de busca global

### Componentes novos necessarios

- `ClienteLegacyRouteRedirect`
- utilitario de compatibilidade de query params

### Componentes existentes que podem ser reaproveitados

- busca global
- command palette
- shell atual

### Riscos

- quebra de links compartilhados internamente
- busca global apontando para rotas antigas
- QA insuficiente em perfis diferentes

### Criterios de aceite

- rotas antigas redirecionam sem perder contexto
- navegacao principal e secundarias usam apenas nomenclatura nova
- `app/admin` segue intacto
- checklist de QA concluido para operador, gestor e tecnico

### Comandos de validacao

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Ordem recomendada

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 4
5. Fase 5
6. Fase 6
7. Fase 7

## Motivo da ordem

- `Conversas` e `Clientes & Oportunidades` dependem de uma base visual nova
- a unificacao de CRM/Pipeline/Comercial fica muito mais segura depois que o shell e a ficha lateral forem definidos
- a limpeza de rotas antigas so deve acontecer quando a experiencia nova ja estiver validada
- essa ordem privilegia percepcao de produto primeiro e consolidacao estrutural depois
