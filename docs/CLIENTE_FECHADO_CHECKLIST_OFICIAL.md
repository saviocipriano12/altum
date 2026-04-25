# Checklist Oficial ALTUM - Cliente Fechado (D0 a D7)

Data base: 24/04/2026  
Versao: 1.1  
Owner do documento: Operacoes ALTUM

## Objetivo
Padronizar o passo a passo obrigatorio apos fechamento comercial para que todo cliente entre em operacao com previsibilidade, seguranca e go-live validado.

## Janela do processo
- Inicio: contrato fechado e aceite comercial confirmado.
- Fim: tenant com go-live aprovado, onboarding manual concluido e revalidacao D7 sem bloqueio critico.

## Regra de ouro
Um cliente so e considerado "pronto para operar e vender" quando:
- todos os gates criticos em `/cliente/painel/go-live` estiverem sem bloqueio;
- a validacao de go-live for executada com sucesso via `POST /api/tenant/:tenantId/readiness`;
- o status salvo em `tenant_settings.goLive.status` estiver como `approved`.

## Gates criticos oficiais (nao negociaveis)
1. `Canal conectado` (`channel_connected`)
2. `IA habilitada` (`ai_enabled`)
3. `Base de conhecimento minima` (`knowledge_minimum`, minimo 3 docs)
4. `Owner e handoff definidos` (`owner_handoff`)
5. `Limites de uso e custo` (`usage_cost_limits`)

Se qualquer um dos 5 itens acima falhar, o go-live fica bloqueado.

## RACI resumido
- Comercial: entrega handoff completo do cliente e escopo contratado.
- Onboarding/CS: conduz configuracoes de tenant, treinamento e aceite.
- Operacoes/Implementacao: integra canais, IA, automacoes e testes ponta a ponta.
- Tech/Plataforma: suporte em incidentes de integracao, webhook, seguranca e jobs.
- Dono do tenant (cliente): aprova acessos, mensagens, tom e regras de operacao.

## Como executar sem se perder (SOP diario)
1. Abra uma ficha operacional por cliente usando `docs/CLIENTE_FECHADO_FICHA_OPERACIONAL_TEMPLATE.md`.
2. Mantenha apenas 1 fase ativa por cliente (nunca avancar em paralelo com fase critica pendente).
3. So marque etapa como concluida quando houver evidencia registrada.
4. Se travar, mude o status para `Bloqueado`, registre causa, owner da resolucao e prazo.
5. Feche cada dia com "proxima acao + responsavel + data".

## Modo inteligente de execucao (anti-erro)
1. Sempre iniciar com ficha gerada por comando (padrao unico):
`npm run cliente:onboarding:new -- --cliente "NOME" --tenant "TENANT_ID" --ownerAltum "SEU_NOME" --ownerCliente "NOME_CLIENTE" --fechamento "YYYY-MM-DD" --kickoff "YYYY-MM-DD" --prazo "YYYY-MM-DD" --escopo "PLANO"`
2. Trabalhar por fase com checkpoint de entrada e saida:
- entrada: confirmar dados minimos da fase;
- saida: confirmar evidencias minimas da fase.
3. Nunca pular etapa bloqueadora:
- se etapa com "Bloqueia go-live = Sim" nao estiver concluida, a fase nao pode avancar.
4. Encerrar cada ciclo de trabalho com 3 perguntas obrigatorias:
- qual etapa estou agora;
- qual bloqueio pode travar as proximas 24h;
- qual proxima acao com dono e data.

## Fases oficiais (macro fluxo)

| Fase | Objetivo | Etapas do checklist |
| --- | --- | --- |
| F0 - Kickoff interno | Garantir base contratual e setup inicial do tenant | 1 a 4 |
| F1 - Setup operacional | Fechar empresa, equipe, SLA, ownership e canal principal | 5 a 12 |
| F2 - Setup IA e CRM | Fechar IA, limites, conhecimento, CRM e handoff | 13 a 19 |
| F3 - Compliance e liberacao | Fechar LGPD, testes e aprovar go-live | 20 a 23 |
| F4 - Estabilizacao | Acompanhar operacao D1 e revalidar D7 | 24 a 26 |

## Regras de passagem de bastao (para funcionario)
- Toda troca de responsavel exige handoff escrito na ficha operacional.
- O novo responsavel deve conseguir continuar o processo sem call de contexto.
- Campos minimos no handoff:
1. fase atual;
2. etapa exata em andamento;
3. bloqueios ativos;
4. proxima acao objetiva;
5. prazo comprometido com cliente.

## SLA interno recomendado por fase
- F0: ate 1 dia util apos fechamento.
- F1: ate 2 dias uteis.
- F2: ate 2 dias uteis.
- F3: ate 1 dia util.
- F4: D1 e D7 obrigatorios nas datas corretas.

## Escalonamento padrao (quando bloquear)
- Ate 4h sem avancar: escalar para owner de Operacoes.
- Ate 24h com bloqueio tecnico: envolver Tech/Plataforma.
- Risco de prazo com cliente: notificar Comercial/CS no mesmo dia.

## Checklist operacional detalhado (ordem obrigatoria)

| Ordem | Etapa | Responsavel | Como fazer | Evidencia de conclusao | Bloqueia go-live |
| --- | --- | --- | --- | --- | --- |
| 1 | Abrir handoff interno | Comercial | Registrar escopo vendido, oferta, prazo, canais contratados, owner do cliente e data de kickoff. | Card/tarefa de onboarding criada com dados completos. | Nao |
| 2 | Validar base juridica | Comercial + CS | Confirmar contrato assinado, DPA alinhado ao `docs/DPA_MINIMO_CLIENTES.md` e canal DSAR definido. | Contrato + DPA anexados no dossie do cliente. | Sim |
| 3 | Criar tenant | CS/Operacoes | Criar tenant via fluxo admin (`/api/admin/tenants/create`) com `name`, `niche`, `businessProfileId`, timezone e businessHours. | `tenantId` ativo criado sem erro. | Sim |
| 4 | Aplicar starter kit do perfil | CS/Operacoes | Manter `applyStarterKit=true` para gerar base inicial de IA/playbook por perfil de negocio. | Retorno da criacao com starter kit aplicado (ou erro tratado). | Nao |
| 5 | Completar perfil da empresa | CS + Cliente | Em `/cliente/painel/configuracoes/empresa`, preencher nome, nicho, telefone, site, responsavel e modo de negocio. | Item de onboarding `profile_setup` em `done`. | Sim |
| 6 | Configurar usuarios | CS + Cliente | Convidar usuarios em `/cliente/painel/configuracoes/usuarios`; garantir ao menos 1 usuario ativo do cliente. | `activeUsers >= 1`. | Sim |
| 7 | Configurar times | CS + Cliente | Criar times em `/cliente/painel/configuracoes/times` e definir ownership. | Time principal criado e em uso. | Sim |
| 8 | Configurar operacao (SLA e distribuicao) | CS/Operacoes | Em `/cliente/painel/configuracoes/operacao`, definir SLA, modo de distribuicao, time padrao e horario operacional. | `defaultResponseSlaMinutes > 0` e `defaultTeam` definido. | Sim |
| 9 | Definir owner e handoff | CS + Cliente | Garantir owner operacional nominal e telefone do responsavel de handoff IA em configuracoes. | Gate `owner_handoff` em `ready`. | Sim |
| 10 | Conectar canal principal | Operacoes | Em `/cliente/painel/configuracoes/canais`, conectar canal via OAuth (Meta/Google) ou canal contratado. | Pelo menos 1 canal `active` com readiness operacional. | Sim |
| 11 | Validar saude da integracao | Operacoes | Rodar health de canais (`/api/tenant/:tenantId/channels/health`) e corrigir `degraded/reauth_required/webhook_pending`. | `connectionStatus` em `ready` ou `connected` saudavel. | Sim |
| 12 | Testar webhook/entrada real | Operacoes | Enviar evento de teste do provider e confirmar chegada no inbox. | Evento recebido e conversa criada sem erro. | Sim |
| 13 | Habilitar IA do tenant | Operacoes | Em `/cliente/painel/ia`, garantir IA ativa para o tenant. | Gate `ai_enabled` em `ready`. | Sim |
| 14 | Ajustar guardrails e objetivo | Operacoes + Cliente | Revisar tom, objetivo, perguntas obrigatorias, escalacoes e guardrails. | Guardrails aprovados pelo owner do cliente. | Sim |
| 15 | Configurar limites de custo/uso | Operacoes + Financeiro | Definir `monthlyBudgetUsd` e `monthlyUsageCap` no perfil de operacao IA. | Gate `usage_cost_limits` em `ready` e sem estouro. | Sim |
| 16 | Publicar base de conhecimento minima | CS + Cliente | Em `/cliente/painel/conhecimento`, publicar no minimo 3 documentos validos para atendimento. | Gate `knowledge_minimum` em `ready` (`>= 3 docs`). | Sim |
| 17 | Preparar CRM e pipeline | CS/Operacoes | Revisar funil em `/cliente/painel/crm` e garantir fluxo de lead com dono/etapa. | Lead teste transita entre etapas sem travar. | Sim |
| 18 | Preparar follow-up e handoffs | CS/Operacoes | Validar `/cliente/painel/follow-ups` e `/cliente/painel/handoffs` para takeover humano. | Handoff concluido sem conversa "orfa". | Sim |
| 19 | Revisar automacoes essenciais | Operacoes | Ativar automacoes minimas em `/cliente/painel/automacoes`. | Pelo menos 1 automacao critica ativa (quando aplicavel ao contrato). | Nao |
| 20 | Validar conformidade LGPD operacional | CS + Operacoes | Seguir `docs/LGPD_OPERACAO_E_GOVERNANCA.md`: politica publicada, DSAR ativo, responsavel de incidente definido. | Checklist LGPD sem pendencia critica. | Sim |
| 21 | Rodar teste ponta a ponta D0 | Operacoes + Cliente | Simular lead real: entrada -> IA -> inbox -> takeover -> atualizacao CRM. | Fluxo completo sem erro bloqueante. | Sim |
| 22 | Marcar etapas manuais do onboarding | CS/Operacoes | Confirmar manualmente via `/api/tenant/:tenantId/onboarding`: `team_enablement`, `incident_runbook_ack`, `handoff_drill`. | 3 etapas manuais em `done` com `doneByName` e `doneAt`. | Sim |
| 23 | Rodar validacao oficial de go-live | CS/Operacoes | Executar validacao na tela `/cliente/painel/go-live` (botao liberar/revalidar) ou via API readiness. | Retorno `ok: true`, status `approved`, score salvo. | Sim |
| 24 | Go-live assistido D1 | CS + Cliente | Primeiras 24h: acompanhar SLA, backlog, handoff e uso de IA. | Sem bloqueio critico novo nas primeiras 24h. | Sim |
| 25 | Reavaliacao D7 | CS + Operacoes | Revisar novamente score, custos IA, canais, backlog, jobs e automacoes. | Tenant segue com gates criticos em `ready`. | Sim |
| 26 | Encerramento do onboarding | CS | Formalizar aceite operacional e entrar em rotina semanal (segunda/quarta/sexta). | Termo interno de onboarding concluido. | Nao |

## Definicao de pronto (DoD) do cliente fechado
Todos os itens abaixo precisam estar verdadeiros ao mesmo tempo:
- go-live aprovado (`tenant_settings.goLive.status = approved`);
- 5 gates criticos oficiais em `ready`;
- 3 etapas manuais de onboarding marcadas como concluidas;
- pelo menos 1 canal operacional ativo;
- IA ativa com limites de custo/uso definidos e sem estouro;
- base de conhecimento com no minimo 3 documentos;
- owner operacional, time padrao e cobertura humana ativa.

## Regra de auditoria semanal (qualidade do processo)
- Revisar todos os clientes em onboarding toda segunda-feira.
- Confirmar se cada cliente tem ficha operacional atualizada.
- Verificar se existe etapa marcada como concluida sem evidencia.
- Corrigir imediatamente qualquer desvio de ordem do checklist.

## Runbook de contingencia (resumo)
Se houver incidente apos liberacao:
- Quota/budget IA estourado: reduzir autonomia ou pausar IA, ajustar limite com aprovacao.
- Falha de webhook/canal: revalidar token, webhook e roteamento; novo teste ponta a ponta.
- Backlog/fila sem controle: rebalancear ownership, revisar SLA/time padrao e online coverage.

Referencia detalhada: `docs/go-live-incident-playbook.md`.

## Template rapido por cliente (copiar e preencher)

```md
# Cliente: <NOME>
- Tenant ID:
- Data fechamento comercial:
- Data kickoff:
- Owner ALTUM:
- Owner cliente:

## Status gates criticos
- [ ] Canal conectado (`channel_connected`)
- [ ] IA habilitada (`ai_enabled`)
- [ ] Base minima (`knowledge_minimum`)
- [ ] Owner e handoff (`owner_handoff`)
- [ ] Limites custo/uso (`usage_cost_limits`)

## Onboarding manual
- [ ] team_enablement
- [ ] incident_runbook_ack
- [ ] handoff_drill

## Validacao final
- [ ] POST `/api/tenant/:tenantId/readiness` aprovado
- [ ] Go-live `approved` em `tenant_settings`
- [ ] Revalidacao D7 sem bloqueio
```

## Referencias internas
- `docs/go-live-definitivo-checklist.md`
- `docs/go-live-runbook.md`
- `docs/go-live-incident-playbook.md`
- `docs/INTEGRATIONS_OAUTH_MANAGED.md`
- `docs/LGPD_OPERACAO_E_GOVERNANCA.md`
- `docs/DPA_MINIMO_CLIENTES.md`
- `docs/CLIENTE_FECHADO_FICHA_OPERACIONAL_TEMPLATE.md`
- `scripts/new-client-onboarding.mjs`

