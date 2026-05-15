# Inventario de funcionalidades da area do cliente

## Enquadramento estrategico

- O problema central nao e falta de funcionalidade. O problema e a experiencia atual apresentar a Altum como um conjunto de modulos tecnicos e nao como uma operacao simples de atendimento, CRM, vendas, propostas, campanhas e IA.
- O redesign da area do cliente nao e uma troca de cor. Ele precisa reorganizar a percepcao do produto em uma jornada unica:
  1. entrar em `Inicio`
  2. atender em `Conversas`
  3. entender o cliente em `Clientes & Oportunidades`
  4. agir em `Agenda`
  5. acelerar em `Campanhas`
  6. decidir em `Relatorios`
  7. configurar ajuda em `Assistente Altum`
  8. ajustar estrutura em `Configuracoes`
- A implementacao deve acontecer nas rotas reais do cliente. Rotas de preview ou laboratorios internos nao devem guiar a arquitetura do produto final.

## Base analisada

- Guard e sessao: `app/cliente/ClientePanelGuard.tsx`
- Shell e navegacao: `app/cliente/painel/layout.tsx`, `app/cliente/painel/components/cliente-sidebar.tsx`, `cliente-topbar.tsx`, `cliente-global-search.tsx`, `cliente-command-palette.tsx`, `cliente-bottom-nav.tsx`
- Tokens e estilos atuais do portal: `app/globals.css`
- Componentes base reutilizados: `app/cliente/painel/components/ui.tsx`

## Permissoes atuais encontradas

- Roles:
  - `client_owner`
  - `client_admin`
  - `client_agent`
  - `client_viewer`
- Capacidades:
  - `view_metrics`
  - `respond_inbox`
  - `edit_leads`
  - `manage_pipeline`
  - `manage_commercial`
  - `manage_ai`
  - `manage_automations`
  - `manage_channels`
  - `manage_users`
  - `manage_settings`
- Observacao estrategica:
  hoje varias telas aparecem para perfis simples mesmo quando a acao principal fica bloqueada. Isso reforca a sensacao de sistema interno e precisa ser corrigido pela nova navegacao.

## Infraestrutura compartilhada que nao pode quebrar

- Sessao multi-tenant via `/api/client-portal/me`
- Busca global por modulos, contatos, conversas, propostas e financeiro
- Polling adaptativo em telas operacionais
- Deep links por query string como `chatId`, `leadId`, `campaignId`, filtros e status
- Shell responsivo com sidebar desktop, bottom nav mobile, command palette e topbar
- Banners/PWA exclusivos da area do cliente:
  - `cliente-network-banner`
  - `cliente-install-banner`
  - `cliente-critical-notifications`
  - `cliente-finance-screen-alert`

## Rotas encontradas

| Rota | Objetivo atual | Componentes principais | Dados principais exibidos | Acoes disponiveis | Funcionalidades criticas que nao podem ser perdidas | Dependencias relevantes | Observacoes de risco |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/cliente/login` | Login do portal do cliente com redirecionamento para tenant e rota de destino. | Tela dedicada, Firebase auth, `ClientePanelGuard` indireto. | E-mail, senha, tenantId, `next`. | Entrar, validar acesso ao portal, redirecionar para painel. | Autenticacao do cliente, preservacao do `next`, suporte a multi-tenant. | `firebase/auth`, `/api/client-portal/me`. | Visual ainda escuro/laranja e pouco alinhado ao novo posicionamento comercial. |
| `/cliente/painel` | Visao geral operacional do tenant. | `SectionHeader`, `PanelCard`, `MetricCard`, `StateBadge`. | Dashboard portal, leads, chats, IA, KB, metricas, automacao, readiness. | Abrir conversas, CRM, metricas, configuracoes e atalhos de prioridade. | KPIs principais, prioridades, funil resumido, sinais de IA, readiness. | `/api/client-portal/dashboard`, `/api/tenant/:id/leads`, `chats`, `settings/ai`, `kb-docs`, `metrics-summary`, `automation-summary`, `readiness`. | Hoje mistura leitura executiva, operacao, financeiro e IA em uma tela densa. |
| `/cliente/painel/inbox` | Central de conversas do tenant. | Layout proprio de inbox, `PanelCard`, `SectionHeader`, `MetricCard`, composer, paineis laterais. | Lista de chats, mensagens, detalhes do chat, lead associado, tasks, notes, budgets, finance, equipe. | Responder mensagem, enviar template, pausar/retomar IA, redistribuir fila, alterar metadados do chat, mover etapa, criar tarefa, adicionar nota, abrir CRM/comercial. | Chat em tempo real, contexto do lead, anexos/midia, status IA, filtros de fila, historico. | `/api/tenant/:id/chats`, `/messages`, `/send`, `/send-template`, `/ai-state`, `/notes`, `/leads/:id/stage`, `/leads/:id/tasks`, `/leads/:id/notes`. | Pagina mais critica e mais complexa; ja funciona como ponto de convergencia de vendas, mas com UX fragmentada. |
| `/cliente/painel/crm` | Gestao de contatos e oportunidades. | Tabela/lista, painel lateral de lead, `PanelCard`, `MetricCard`, `SectionHeader`. | Leads, detalhe do lead, notes, tasks, appointments, timeline, related chats, qualification IA, pipeline, ai logs. | Filtrar, importar CSV, editar lead, alterar etapa, criar tarefas, notas, abrir conversas, gerar campanha a partir de import, baixar CSV. | Base unica de leads, enriquecimento IA, tarefas, historico, deep link por `leadId`, importacao CSV. | `/api/tenant/:id/leads`, `/leads/:id`, `/notes`, `/tasks`, `/appointments`, `/pipeline`, `/settings`, `/ai-logs`, `/outbound-campaigns`. | Ja concentra muito valor e deve virar o nucleo de `Clientes & Oportunidades`; alto risco de regressao em drawer e filtros. |
| `/cliente/painel/pipeline` | Visao kanban do funil comercial do tenant. | Colunas kanban, `MetricCard`, `SectionHeader`, `PanelCard`. | Pipeline, estagios, settings do negocio, contagem por coluna, lead selecionado. | Arrastar oportunidade, alterar etapa, editar configuracao do funil. | Mesmo dado do CRM em outro formato, drag-and-drop, leitura por etapa. | `/api/tenant/:id/pipeline`, `/api/tenant/:id/settings`, `/api/tenant/:id/leads/:leadId/stage`. | Hoje CRM e Funil sao modulos separados apesar de compartilharem o mesmo dado. |
| `/cliente/painel/follow-ups` | Fila de retornos e tarefas comerciais. | `MetricCard`, `PanelCard`, `SectionHeader`, filtros em URL. | Summary de follow-ups, itens por lead, AI logs, business profile. | Filtrar por status/tipo/owner/prioridade, concluir/reabrir tarefa, abrir CRM ou inbox. | Fila de proximo passo, filtros persistidos na URL, conclusao rapida de tarefas. | `/api/tenant/:id/follow-ups`, `/api/tenant/:id/settings`, `/api/tenant/:id/ai-logs`, `/api/tenant/:id/leads/:leadId/tasks/:taskId`. | Deve virar visao e contexto dentro de Agenda e dentro da ficha do cliente. |
| `/cliente/painel/agenda` | Agenda de reunioes e compromissos. | Formulario de agendamento, lista de itens, `SectionHeader`, `CardTitle`. | Appointments, leads para vinculo, owner, status, horario, local, link. | Criar agendamento, alterar status, filtrar por status e owner. | Cadastro e acompanhamento de compromissos vinculados ao lead. | `/api/tenant/:id/appointments`, `/api/tenant/:id/leads`. | Ainda separado das tarefas/follow-ups e sem ficha unificada do cliente. |
| `/cliente/painel/comercial` | Gestao de propostas, financeiro comercial e cobrancas. | `PanelCard`, `MetricCard`, formularios de proposta/financeiro/cobranca. | Leads, budgets, finance, settings do negocio, ai logs, preview de cobranca. | Criar proposta, criar lancamento financeiro, aprovar/perder proposta, gerar cobranca PIX/boleto/link, copiar dados, abrir modulos relacionados. | Propostas, receita/despesa, cobranca, vinculacao ao lead e sinais de IA. | `/api/tenant/:id/leads`, `/budgets`, `/finance`, `/finance/create-charge`, `/settings`, `/ai-logs`. | Nao pode sumir; deve ser reencaixado dentro da ficha da oportunidade e da view Propostas. |
| `/cliente/painel/captacao` | Gestao de formularios e landing pages de captura. | Editor de formulario, editor de landing, `PanelCard`, `MetricCard`. | Forms, recent submissions, users, channels, settings, top sources, top campaigns, performance. | Criar/editar formulario, configurar campos, landing, tags, owner, copiar embed/URLs, excluir, abrir submissao/campanhas. | Formularios, landing config, submissions, atribuicao inicial de lead. | `/api/tenant/:id/capture/forms`, `/users`, `/channels`, `/settings`. | Funcionalidade de aquisicao importante, mas nao deveria parecer modulo tecnico principal na home do cliente comum. |
| `/cliente/painel/campanhas` | Campanhas outbound por WhatsApp. | Lista + editor, preview de audiencia, `PanelCard`, `MetricCard`. | Campanhas, rodadas, users, business profile, filtros por etapa/owner/source/tag/heat. | Criar, editar, prever audiencia, disparar, pausar, excluir. | Segmentacao, preview antes do disparo, historico de rodadas, deep link `campaignId`. | `/api/tenant/:id/outbound-campaigns`, `/users`, `/settings`, `/preview`, `/dispatch`. | Faz sentido no novo menu como `Campanhas`; precisa linguagem menos interna. |
| `/cliente/painel/metricas` | Relatorios e leitura de desempenho. | `MetricCard`, `PanelCard`, `SectionHeader`, graficos. | Metrics summary, readiness, business profile, trafego, funil, canais, IA, operacao, comparativos. | Trocar janela, sincronizar campanhas, abrir inbox por filtro, baixar/compartilhar leituras. | KPIs de vendas e atendimento, series, funil, IA, operacao. | `/api/tenant/:id/metrics-summary`, `/settings`, `/readiness`, `/campaigns/sync`. | Nomenclatura atual e excesso de leituras executivas podem afastar o cliente final. |
| `/cliente/painel/ia` | Configuracao e leitura operacional do agente de IA. | Editor grande de politicas, metrics de IA, manutencao de KB, preview de IA. | Settings da IA, KB docs, AI logs, AI usage, tenant settings. | Ajustar tom/politicas, ativar recursos, fazer preview, salvar runtime policy, subir midia, editar/remover docs KB. | Config do agente, custos/uso, logs, preview, base de conhecimento integrada. | `/api/tenant/:id/settings/ai`, `/kb-docs`, `/ai-logs`, `/ai-usage`, `/ai-preview`, `/kb-docs/media/upload`. | Muito poderosa, mas com cara de console tecnico; deve ser reembalada como `Assistente Altum`. |
| `/cliente/painel/conhecimento` | Biblioteca de documentos usados pela IA. | Lista de docs, editor simples, `MetricCard`, `PanelCard`. | KB docs, AI logs, business profile, uso por doc. | Criar, editar, excluir, filtrar por tipo/uso, abrir modulos relacionados. | Base de conhecimento, tags, rastreabilidade de uso e gatilhos de handoff. | `/api/tenant/:id/kb-docs`, `/ai-logs`, `/settings`. | Deve virar subarea de `Assistente Altum > Base de conhecimento`. |
| `/cliente/painel/handoffs` | Mesa de escaladas da IA para atendimento humano. | `MetricCard`, tabela focada em risco, `PanelCard`, `SectionHeader`. | Chats, AI logs, users, settings, risco, owner, confianca, motivo de handoff. | Filtrar, assumir/pausar IA no chat, abrir inbox/CRM, analisar gargalos por owner/motivo. | Monitoramento de handoff, ownership humano, risco operacional. | `/api/tenant/:id/chats`, `/ai-logs`, `/users`, `/settings`, `/chats/:id/ai-state`. | Hoje e util, mas isolado; melhor como subpainel do assistente e do contexto da conversa. |
| `/cliente/painel/automacoes` | Builder e operacao de automacoes de atendimento/comercial. | Lista, editor, templates, queue/execution views. | Automation summary, automations, executions, queue, settings do negocio. | Criar/editar/excluir automacoes, reordenar acoes, processar fila, ativar template. | Regras automatizadas por trigger, fila/execution log, templates. | `/api/tenant/:id/automation-summary`, `/settings`, `/automations`, `/automations/process`. | Pagina muito longa e tecnica; ideal para gestor/admin e nao para cliente comum em destaque. |
| `/cliente/painel/automacoes/instagram` | Operacao dedicada do canal Instagram. | Cards de status, toggles, logs, `PanelCard`. | Social automations config, canal Instagram, logs recentes. | Ativar/desativar fluxos, reenviar evento, revisar playbook. | Fluxos de DM/comentario/seguidor e observabilidade do canal. | `/api/tenant/:id/social-automations`, `/social-automations/retry`. | Deve ficar escondido em configuracao/social ou automacoes avancadas. |
| `/cliente/painel/logs` | Central de logs da IA, automacoes e fila. | `MetricCard`, `PanelCard`, `SectionHeader`, busca unica. | AI logs, automation summary, executions, queue. | Filtrar, abrir modulo de origem, investigar gargalo. | Rastreabilidade operacional. | `/api/tenant/:id/ai-logs`, `/api/tenant/:id/automation-summary`. | Forte candidato a ocultacao para suporte/admin; pouco vendavel para cliente final comum. |
| `/cliente/painel/go-live` | Checkpoint de prontidao e onboarding do tenant. | `MetricCard`, checklist, onboarding manual, `PanelCard`. | Readiness snapshot, checklist, blockers, modules, insights, onboarding, validation. | Validar go-live, marcar etapas manuais, abrir modulos bloqueados. | Score de readiness, checklist e onboarding critico. | `/api/tenant/:id/readiness`, `/api/tenant/:id/onboarding`, hook `useTenantReadiness`. | Importante para implantacao, mas nao como modulo principal de uso diario. |
| `/cliente/painel/configuracoes` | Hub de governanca do tenant. | Hero de readiness, cards de atalhos, push notification panel. | Settings, users, channels, AI, forms, readiness, push subscription. | Navegar para submodulos, testar push, revisar prontidao e setup. | Atalhos para governanca, notificacoes criticas, visao de setup. | `/api/tenant/:id/settings`, `/users`, `/channels`, `/settings/ai`, `/capture/forms`, `/readiness`, `/api/client-portal/push/*`. | Mistura configuracao com go-live e roadmap do produto; precisa ser mais enxuto. |
| `/cliente/painel/configuracoes/empresa` | Cadastro basico da empresa/tenant. | Formulario simples, `SectionHeader`, `PanelCard`. | Nome, nicho, site, telefone e identidade basica. | Editar e salvar dados da empresa. | Perfil da empresa usado em IA, operacao e leitura do tenant. | `/api/tenant/:id/settings`. | Bom candidato a permanecer quase intacto, so com novo visual. |
| `/cliente/painel/configuracoes/usuarios` | Gestao de usuarios e permissoes do tenant. | Lista de membros, formulario de convite, `MetricCard`, `PanelCard`. | Usuarios, role, status, equipe, canais, capabilities. | Convidar usuario, trocar role, bloquear/desbloquear, ajustar capabilities. | Modelo de acesso e capacidades do portal cliente. | `/api/tenant/:id/users`. | Base de permissao existe e deve orientar a visibilidade do redesign. |
| `/cliente/painel/configuracoes/times` | Gestao de times e ownership. | Formulario de times, resumo de cobertura, `PanelCard`. | Settings e users do tenant, time padrao, cobertura. | Criar/editar estrutura de times e time padrao. | Times, ownership e cobertura de fila. | `/api/tenant/:id/settings`, `/api/tenant/:id/users`. | Importante para operacao, mas nao para cliente operador comum. |
| `/cliente/painel/configuracoes/canais` | Gestao de conectores e saude de integracoes. | Lista de conectores, health, OAuth flows, formularios. | Channels, WhatsApp channel, conversion health, pendencias OAuth. | Iniciar OAuth, concluir pendencia, salvar tokens/metadados, sync campanhas, repair health. | Conectores omnichannel, health checks, readiness de WhatsApp/Ads. | `/api/tenant/:id/channels`, `/channels/whatsapp`, `/campaigns/conversions/health`, `/campaigns/sync`, `/integrations/*`. | Muito sensivel e tecnico; deve permanecer protegido por capability e talvez por perfil tecnico. |
| `/cliente/painel/configuracoes/operacao` | Regras de SLA e distribuicao do inbox. | Formulario com toggles, `PanelCard`. | Inbox rules, teams, assignment mode, SLA. | Ajustar SLA, autoassign, round robin, least_loaded, horario comercial. | Regras de roteamento e atendimento. | `/api/tenant/:id/settings`. | Fluxo importante, mas claramente avancado. |
| `/cliente/painel/configuracoes/social` | Regras de automacao social por tenant. | Tabela de canais/logs, toggles, `PanelCard`. | Social automation config, summary, channels, logs. | Ativar DM/comentarios/seguidores, editar prompts, horario ativo, opt-out. | Automacao social e logs por canal. | `/api/tenant/:id/social-automations`. | Deve ficar em configuracao avancada ou em campanhas/aquisicao dependendo da narrativa. |
| `/cliente/painel/crm-preview` | Laboratorio visual de CRM com tres propostas de interface. | Mock local com dados estaticos. | Leads simulados, modos clean/hybrid/enterprise. | Alternar modo e comparar UI. | Referencia de UX, nao funcionalidade produtiva. | Variavel `NEXT_PUBLIC_ENABLE_PREVIEW_PAGES`. | Nao e rota de producao; pode servir como referencia interna, sem orientar o rollout real. |

## Componentes compartilhados mais relevantes

- `PanelCard`, `SectionHeader`, `MetricCard`, `StateBadge`, `EmptyState`, `CardTitle`
- `ClienteSidebar`, `ClienteTopbar`, `ClienteBottomNav`
- `ClienteGlobalSearch` com busca por modulos, contatos, conversas, propostas e financeiro
- `ClienteCommandPalette`
- `useClienteShell` com tema, densidade e modo `essencial` x `completo`
- `useAdaptivePolling` e `useTenantReadiness`

## Leitura geral do estado atual

- A base funcional ja e rica e cobre atendimento, CRM, propostas, cobranca, IA, automacao, captacao e configuracao.
- O maior problema nao e ausencia de funcionalidade; e a fragmentacao do fluxo entre modulos paralelos.
- As telas de `Inbox`, `CRM`, `Pipeline`, `Follow-ups` e `Comercial` ja possuem dados complementares entre si. Isso reduz risco tecnico de unificacao visual, porque a maior parte da informacao ja existe.
- O principal eixo de produto encontrado e:
  - `Conversas` como centro operacional
  - `Clientes & Oportunidades` como base unica de relacionamento e venda
  - `Agenda` como consolidacao de proximo passo
  - `Assistente Altum` como camada de IA e automacao
- A taxonomia atual atrapalha a compreensao:
  - `CRM` e `Pipeline` aparecem como modulos separados, embora sejam o mesmo fluxo
  - `Comercial` vive separado da oportunidade
  - `Retornos` e `Agenda` dividem a mesma necessidade do usuario
  - `IA`, `Conhecimento`, `Handoffs` e `Automacoes` aparecem como ilhas
- O principal cuidado do redesign sera reorganizar navegacao e contexto sem perder:
  - deep links existentes
  - capabilities atuais
  - comportamento multi-tenant
  - integracoes sensiveis em `Configuracoes > Canais`

## Conclusao estrategica do inventario

- O portal do cliente ja possui quase todas as pecas de um SaaS comercial maduro.
- O trabalho principal nao e criar novas funcoes; e reconectar:
  - conversa
  - lead
  - oportunidade
  - tarefa
  - proposta
  - campanha
  - IA
- A implementacao mais segura sera:
  - primeiro mudar shell, tokens, nomenclatura e navegacao
  - depois melhorar as rotas reais mais importantes
  - so depois consolidar aliases, redirects e unificacoes de rota
