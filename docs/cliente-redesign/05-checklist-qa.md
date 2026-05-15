# Checklist de QA do redesign do portal do cliente

## Checklist funcional

- [ ] Menu principal mostra exatamente `Inicio`, `Conversas`, `Clientes & Oportunidades`, `Agenda`, `Campanhas`, `Relatorios`, `Assistente Altum`, `Configuracoes` para quem tiver acesso
- [ ] Login do cliente continua funcionando com `tenantId` e `next`
- [ ] Logout continua funcionando
- [ ] Home carrega dados principais sem erro
- [ ] Conversas lista chats corretamente
- [ ] Conversas abre thread correta por `chatId`
- [ ] Conversas envia mensagem manual
- [ ] Conversas envia template quando aplicavel
- [ ] Conversas mostra contexto comercial do lead no painel lateral
- [ ] Conversas permite mover etapa quando usuario tem permissao
- [ ] Conversas permite criar tarefa e nota
- [ ] Clientes & Oportunidades lista leads corretamente
- [ ] Kanban move oportunidade entre etapas
- [ ] Drawer/ficha abre o lead correto por `leadId`
- [ ] Tarefas e notas do lead continuam salvas
- [ ] Propostas continuam sendo criadas e listadas
- [ ] Financeiro comercial continua sendo criado e listado
- [ ] Geracao de cobranca continua funcionando
- [ ] Agenda cria e atualiza compromissos
- [ ] Follow-ups/tarefas podem ser concluidos e reabertos
- [ ] Campanhas permitem preview e disparo
- [ ] Captacao continua criando e atualizando formularios e landing
- [ ] Relatorios carregam KPIs e filtros por periodo
- [ ] Assistente Altum continua salvando configuracoes de IA
- [ ] Base de conhecimento continua permitindo criar, editar e excluir documentos
- [ ] Automacoes continuam criando, editando e executando regras
- [ ] Go-live/Implantacao continua validando readiness
- [ ] Configuracoes de usuarios, times, canais e operacao continuam acessiveis para quem tem permissao
- [ ] CRM e Pipeline aparecem como visualizacoes de `Clientes & Oportunidades`, nao como produtos mentais separados
- [ ] Comercial aparece no contexto da oportunidade e ou na view `Propostas`
- [ ] Retornos e follow-ups ficam refletidos na experiencia de `Agenda`
- [ ] IA, Conhecimento, Handoffs e Automacoes ficam agrupados sob `Assistente Altum`

## Checklist visual

- [ ] Tema claro e o padrao principal do portal
- [ ] Fundo usa base clara azulada, nao bege dominante
- [ ] Azul e a cor principal de produto
- [ ] Verde aparece apenas para WhatsApp e sucesso
- [ ] Roxo aparece apenas para Assistente Altum e IA
- [ ] Laranja aparece apenas para pendencias, alerta e implantacao
- [ ] Vermelho aparece apenas em erro e bloqueio
- [ ] Cards nao competem demais por atencao
- [ ] Tipografia segue a escala definida
- [ ] CTA principal de cada area e claro
- [ ] Textos estao curtos e diretos
- [ ] Nomes tecnicos antigos foram reduzidos ou escondidos
- [ ] `Conversas` lembra uma experiencia familiar de chat, sem parecer central de logs
- [ ] `Clientes & Oportunidades` lembra uma experiencia comercial madura, com lista e kanban coerentes
- [ ] `Inicio` tem poucos blocos e prioridade clara
- [ ] `Relatorios` parece area de decisao, nao console tecnico
- [ ] `Assistente Altum` parece assistente configuravel, nao tela de infraestrutura

## Checklist responsivo

- [ ] Sidebar desktop funciona em resolucoes largas
- [ ] Bottom nav mobile continua funcional
- [ ] Conversas funciona em desktop, tablet e mobile
- [ ] Drawer abre e fecha corretamente em tablet e mobile
- [ ] Tabelas criticas continuam legiveis em telas menores
- [ ] Composer do chat permanece acessivel no mobile
- [ ] Formularios longos quebram bem em mobile
- [ ] Nenhum CTA fica inacessivel por overflow

## Checklist de permissoes

- [ ] `client_owner` ve rotas tecnicas e avancadas esperadas
- [ ] `client_admin` ve modulos de gestao sem perder acesso relevante
- [ ] `client_agent` ve apenas o necessario para operar atendimento e vendas
- [ ] `client_viewer` nao ve acoes de escrita nem modulos tecnicos
- [ ] Acoes bloqueadas aparecem como somente leitura ou ficam ocultas conforme decisao do produto
- [ ] Logs nao aparecem para perfil comum
- [ ] Canais, OAuth e health checks nao aparecem para perfis sem capability
- [ ] `Go-live/Implantacao` nao aparece no menu principal do cliente comum
- [ ] `Operacao Instagram`, `Logs` e configuracoes tecnicas ficam em avancado ou perfil tecnico

## Checklist de regressao

- [ ] Busca global continua encontrando modulos, leads, conversas, propostas e financeiro
- [ ] Command palette continua navegando para rotas validas
- [ ] Polling adaptativo continua funcionando em telas operacionais
- [ ] Banners de rede, PWA, push critico e alerta financeiro continuam funcionando
- [ ] Query params antigos continuam abrindo o contexto correto
- [ ] Redirects ou aliases preservam filtros e IDs
- [ ] Nenhum endpoint do cliente deixou de ser chamado quando a funcionalidade equivalente ainda existe
- [ ] Nenhuma rota antiga foi removida antes da validacao da nova UX

## Checklist de acessibilidade basica

- [ ] Contraste suficiente em texto principal, secundario e badges
- [ ] Foco visivel em links, botoes e campos
- [ ] Navegacao principal acessivel por teclado
- [ ] Command palette acessivel por teclado
- [ ] Labels e placeholders fazem sentido
- [ ] Icones importantes possuem texto de apoio ou `aria-label`
- [ ] Drawer e modais respeitam foco e fechamento por teclado

## Checklist de linguagem do produto

- [ ] `Inbox` nao aparece como nome principal
- [ ] `Visao geral` nao aparece como nome principal
- [ ] `Metricas` foi substituido por `Relatorios` quando for linguagem visivel ao cliente
- [ ] `IA` foi reposicionada como `Assistente Altum` quando for linguagem visivel ao cliente
- [ ] `Conhecimento` aparece como `Base de conhecimento` quando fizer sentido
- [ ] `Handoff` nao aparece como termo principal para cliente comum
- [ ] `Logs`, `runtime` e `guardrails` nao aparecem fora do avancado

## Checklist para garantir que `app/admin` nao foi afetado

- [ ] Nenhum arquivo em `app/admin` foi alterado
- [ ] Nenhum seletor novo do cliente afeta admin fora de escopo
- [ ] Navegacao do admin continua igual
- [ ] Paginas principais do admin continuam renderizando
- [ ] `npm run build` continua passando no projeto inteiro
- [ ] Qualquer ajuste global em CSS foi validado visualmente no admin
