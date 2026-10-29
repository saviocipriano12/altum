# Fase 0 — Auditoria Verificável do Altum Admin e Agência Autônoma

**Status:** em andamento  
**Atualizado em:** 12 de outubro de 2026  
**Missão:** `docs/ALTUM_ADMIN_AGENCY_EXECUTION_MISSION.md`
**Matriz de saída:** `docs/ALTUM_PHASE_0_EXIT_MATRIX.md`

## Resultado desta etapa

A Altum não parte de uma tela vazia. Já existem contratos relevantes para Comando, missões, aprovações, conexões, ativos criativos, MCP e runtime privado. A Fase 0 confirmou esses pontos no código, registrou o portfólio externo e concluiu o primeiro piloto de adoção upstream-first: a importação controlada da primeira equipe do Agency Agents.

Esta auditoria diferencia o que está provado localmente do que está apenas preparado no código ou depende de infraestrutura externa.

## Arquitetura observada

```text
Admin / Comando Altum
  -> API de missões, tarefas, aprovações e conexões
    -> Firestore: tenant, missão, tarefa, aprovação, artefato, auditoria
    -> Runtime compartilhado
       -> OpenClaw privado: sessões, skills, cron e execução
       -> Gateway de modelos: FreeLLMAPI / conexões compatíveis
       -> Workers criativos: provedores de mídia e biblioteca privada
       -> MCP: ferramentas administrativas e por tenant
  -> Área do cliente
       -> operação diária, campanhas, CRM, atendimento e relatórios
```

## Evidências verificadas

| Área                     | Evidência                                                                                                                | Estado                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comando e missões        | `app/api/admin/agent-os/command/route.ts`, `app/api/admin/agent-os/missions/route.ts`, `lib/server/agent-os/missions.ts` | Implementado no código; requer validação integrada por fluxo                                                                                                   |
| Aprovação e auditoria    | `app/api/admin/agent-os/approvals/route.ts`, `lib/server/agent-os/approvals.ts`                                          | Implementado no código; deve entrar nos cenários de aceite                                                                                                     |
| Runtime OpenClaw         | `lib/server/agent-os/openclaw-runtime.ts`, APIs internas de polling e eventos, bridge em `resources/openclaw/`           | Contrato e bridge presentes; despachos e eventos já preservam o contexto da tarefa e do candidato de agente; execução local ainda não verificada nesta máquina |
| Isolamento e retomada    | rotas de polling e eventos do runtime usam tenant, HMAC, idempotência de evento e reconciliação                          | Implementado no código; requer teste com worker real                                                                                                           |
| Fontes externas          | `config/agent-source-registry.json`, `scripts/sync-agent-sources.mjs`                                                    | Registro existente; auditoria automatizada adicionada nesta fase                                                                                               |
| Agência de especialistas | `config/reviewed-agency-agents.json`, `resources/agency-agents/review-queue/`                                            | Primeiro piloto concluído e reprodutível                                                                                                                       |
| Gateway de modelos       | `docker-compose.agent-runtimes.yml`, adaptadores de FreeLLMAPI                                                           | Preparado no código; container não verificado nesta máquina                                                                                                    |

## Portfólio de fontes

O catálogo completo está em `docs/ALTUM_EXTERNAL_CAPABILITY_PORTFOLIO.md`. O registro técnico possui **72 fontes** agrupadas entre força de trabalho, runtimes, orquestração, browser, documentos, memória, mídia, growth, CRM e interoperabilidade.

Para evitar ambiguidade de upstream, estas decisões foram registradas:

- **Agency Agents:** `Ado77/agency-agents` é a fonte selecionada para a primeira equipe da agência; entradas históricas semelhantes permanecem apenas para comparação.
- **OpenMontage:** `calesthio/OpenMontage` é o upstream atual a avaliar; forks históricos não são candidatos de adoção primária.
- **Orca:** `orca-cli/orca` e `orka-agents/orka` são candidatos distintos; nenhum será assumido como “o Orca” até uma comparação formal de runtime.
- **OpenJEV:** existem fontes diferentes registradas; a Fase 2 deve executar o mesmo contrato em ambas ou reduzir para uma fonte canônica.

## Piloto 0A — Agency Agents

### Decisão

Adotar o catálogo original do Agency Agents como conteúdo versionado, e não reescrever os especialistas manualmente.

### Execução comprovada

- checkout original sincronizado em `.altum-agent-sources/Ado77__agency-agents`;
- commit verificado: `3c9588880b7cafaec325a104899fd8bbe27e7d72`;
- licença verificada no checkout: MIT;
- estrutura original de divisões e arquivos validada por inspeção;
- 12 especialistas importados para `resources/agency-agents/review-queue/`;
- cada arquivo preserva repositório, commit, licença, caminho de origem e papel Altum;
- manifesto de revisão gerado em `resources/agency-agents/review-queue/manifest.json`;
- reimportação concluída sem divergência;
- comando `npm run agents:audit:sources` aprovado com checkout fixado.

### Equipe inicial importada

- Pesquisador de Mercado;
- Estrategista de Growth;
- Especialista de SEO e GEO;
- Estrategista de Conteúdo Social;
- Especialista de Mídia Paga Social;
- Especialista de Mídia Paga de Busca;
- Analista de Medição e Atribuição;
- Revisor de Marca e Qualidade;
- Diretor Criativo;
- Estrategista de Oferta e Geração de Demanda;
- Estrategista de Propostas;
- Coordenador de Operações da Agência.

### Limite atual

Os 12 especialistas continuam em `review_required_before_activation`. Eles ainda não têm manifesto Altum, ferramentas, acesso a tenant, orçamento, avaliação, responsável ou permissão de execução. Portanto, estão importados e prontos para curadoria, mas não estão ativos em produção.

## Piloto 0B — OpenClaw

### O que está comprovado

- checkout local presente e fixado em `f45e4dac14547bdc78d90c95384ca65c2de3ef4e`;
- bridge privada da Altum presente em `resources/openclaw/altum-mission-bridge/`;
- rotas de polling e callback assinadas presentes;
- estados de claim, retry limitado, reconciliação e idempotência de eventos implementados no código;
- Docker Compose preparado para bind local do gateway.

### O que não está comprovado neste ambiente

- o Docker Engine não está disponível nesta máquina no momento da auditoria;
- portanto, não foi possível construir ou subir o container do runtime;
- nenhum job real OpenClaw foi executado nesta sessão;
- a integração deve continuar classificada como `prepared`, não `validated`.

### Próximo teste objetivo

Quando o Docker Engine estiver disponível: preparar o runtime com o script existente, subir o compose privado e executar uma missão de baixo risco que apenas retorne um artefato de texto. O teste precisa comprovar polling, assinatura, callback, persistência de evento, entrega na conversa e nenhuma ação externa.

## Decisão de sequência

1. **Concluído agora:** adoção de conteúdo do Agency Agents, com proveniência e reimportação verificável. O manifesto da fila de revisão agora registra hashes SHA-256 do arquivo upstream e da cópia importada; `npm run agents:audit:sources` verifica os 12 arquivos contra o checkout fixado.
2. **Fundação iniciada:** `lib/server/agent-os/agent-manifest.ts` define o contrato canônico e bloqueia ativação sem responsável, avaliação e política de aprovação. Três manifestos piloto foram adicionados em `config/agency-agent-manifests.json` e seus testes passam.
3. **Ligação iniciada:** as sementes de missão agora persistem `agentCandidateId` e a referência de origem do especialista importado. A recomendação de especialista aparece no dado da tarefa, mas permanece em `review_required`.
4. **Ciclo de vida iniciado:** `task-lifecycle.ts` formaliza estados e transições de tarefa. Início, avanço e aprovações agora recusam saltos de estado inválidos; tarefas concluídas não podem ser reabertas por aprovação tardia.
5. **Rastreabilidade ampliada:** o envelope do runtime e seus eventos agora carregam a tarefa em curso e o candidato de agente associado. O callback é recusado se tentar atribuir evidência a uma tarefa diferente do despacho original.
6. **Planejamento separado da execução:** callbacks de `plan` registram progresso e resultado de planejamento sem encerrar a missão ou criar aprovação externa. Somente callbacks de `execute` podem mover o ciclo de vida comercial da missão.
7. **Execução canônica iniciada:** cada despacho agora cria `agent_task_executions`, separado da tarefa planejada. O registro preserva tentativa, runtime, candidato de agente, estado e último evento; despachos anteriores são compatíveis e recebem um registro mínimo ao concluir. Claims usam lease renovada por progresso; uma execução em andamento que perde essa lease vai para reconciliação, nunca é repetida automaticamente. A decisão de reconciliação atualiza despacho e execução juntos; se o operador confirma que não houve execução, a missão volta a pausada e exige retomada explícita.
8. **Avanço autônomo governado:** conclusão de execução com `taskId` marca a tarefa concluída e avalia a próxima. Etapas internas são enfileiradas em novo despacho; etapas com política de aprovação ficam em `waiting_approval`; a última encerra a missão. O bridge recebe instrução explícita para executar somente a etapa atual.
9. **Retomada após aprovação corrigida:** aprovações no Comando e no Centro de Aprovações preservam `taskId`, capability e candidato de agente ao criar o novo despacho. A aprovação não volta a executar a missão inteira sem contexto de etapa.
10. **Inventário repetível:** `npm run agents:audit:inventory` mapeia no código as coleções centrais de agente, ferramentas e auditoria e falha se os contratos mínimos desaparecerem.
11. **Codebase Memory MCP avaliado:** a ficha em `docs/ALTUM_SOURCE_EVALUATION_CODEBASE_MEMORY_MCP.md` bloqueia instalação no host e define o sandbox necessário antes de qualquer integração.
12. **OpenMontage bloqueado por licença:** `docs/ALTUM_SOURCE_EVALUATION_OPENMONTAGE.md` confirma AGPL-3.0 e proíbe importação, adaptação ou uso comercial até parecer jurídico e sandbox isolado.
13. **Orca desambiguado:** `docs/ALTUM_SOURCE_EVALUATION_ORCA.md` seleciona `orca-cli/orca` apenas para avaliação de agentes técnicos; Orka é benchmark Kubernetes experimental e Nethyric/ORCA está fora do escopo de servidor.
14. **Próximo lote de construção:** Fase 1 — ligar os manifestos aprovados ao modelo canônico de missão/tarefa/execução, sem ativar os agentes que permanecem em revisão.
15. **Piloto de runtime:** executar o OpenClaw original e sua bridge na VPS privada; ele não bloqueia a evolução local do control plane.
16. **Não iniciar ainda:** o piloto original de `orca-cli/orca`; ele deve ser executado e avaliado pelo contrato antes de entrar como ferramenta técnica.
17. **Curadoria administrativa visível:** `/admin/agentes` expõe o catálogo importado, sua origem, manifestos e bloqueios de ativação para administradores. A tela é estritamente de leitura nesta fase: não cria conexão, não atribui permissão e não promove agentes.
18. **Contrato de dados do Agent OS:** `config/agent-os-data-contracts.json` registra o escopo esperado de cada coleção central. As coleções de despacho, evento e execução agora também têm bloqueio explícito no Firestore para impedir acesso direto do cliente.
19. **Dívida encontrada no inventário:** `audit_events` é uma coleção legada lida por `chatId`, sem `tenantId` explícito. Ela está fora do Agent OS e não deve ser reutilizada por missões ou agentes até receber uma migração aditiva de escopo.
20. **Decisão de arquitetura registrada:** `docs/ADR-001_AGENT_OS_RUNTIME_BOUNDARY.md` confirma Firestore/Altum como control plane durável e OpenClaw como executor isolado do piloto. Adoção de um novo motor geral de workflow fica condicionada a evidência do piloto e comparação reproduzível.
21. **Superfície Admin inventariada:** `npm run admin:audit:surface` mapeia de forma repetível 40 rotas de tela, 91 rotas de API, 8 candidatos a worker e 14 arquivos de jobs no estado atual do código.
22. **Evento canônico inicial:** a criação de missão agora persiste `mission.created` em `agent_domain_events`, com versão, tenant, correlação e ator. O modelo de eventos deixa de ser somente contrato em código.
23. **Direção operacional visível:** `/admin/objetivos` fecha o primeiro slice de interface para criar objetivos, definir indicadores, agrupar programas e acompanhar as missões relacionadas, sempre dentro da empresa correta. A criação de uma missão vinculada atualiza o programa de forma atômica.
24. **Origem canônica de missões:** o Comando Altum passou a criar missões independentes com `objectiveId` e `programId` explícitos como nulos e a registrar o mesmo evento `mission.created` versionado das missões abertas pelo centro operacional.
25. **Transições por aprovação completas:** uma decisão no Centro de Aprovações registra agora, na mesma transação, tanto a mudança da tarefa quanto a transição correspondente da missão, com escopo de empresa conferido e evento versionado.
26. **Ciclo de vida de missão protegido:** `mission-lifecycle.ts` formaliza transições permitidas e impede ressurreição de missões concluídas ou canceladas por uma aprovação tardia; os testes de contrato cobrem as transições operacionais e terminais.
27. **Direção administrável:** Objetivos e Programas podem agora ter seu estado alterado na própria área Admin. A API valida o estado, preserva o escopo da empresa e registra a alteração em `audit_logs`; a interface recarrega a leitura canônica após cada atualização.
28. **Pausa não reabre execução:** callbacks de despachos com operação `pause` não alteram mais o estado comercial da missão. O reconhecimento do runtime preserva a pausa decidida pelo operador; o contrato tem teste explícito contra reabertura acidental.

## Gates que continuam abertos

- [ ] executar testes oficiais do Agency Agents em ambiente Bash compatível; o Bash disponível nesta máquina aponta para WSL sem distribuição configurada;
- [ ] rodar um job OpenClaw real com o container privado;
- [ ] decidir o runtime durável principal após comparação de OpenClaw, Hatchet, LangGraph e candidatos Orca;
- [ ] executar os testes e exemplos oficiais de Codebase Memory MCP e OpenMontage;
- [ ] validar baseline completo de lint, typecheck, build e testes relevantes do repositório atual;
- [ ] validar regras Firestore contra o projeto remoto; a tentativa local falhou antes da validação por `invalid_grant` da credencial de serviço, compatível com relógio/token fora da janela aceita pelo Google.

## Gate reproduzível do Agent OS

Antes de promover qualquer mudança de missão, tarefa, execução, aprovação ou catálogo de especialistas, executar:

```bash
npm run agents:audit:sources
npm run agents:audit:inventory
npm run agents:audit:data-contracts
npm run admin:audit:surface
npm run test:agent-os-contracts
npm run typecheck
```

Esse gate não prova um worker OpenClaw real — isso continua dependente do Docker Engine — mas prova contratos de proveniência, estados, lease, reconciliação, aprovação e compatibilidade de envelopes no código.

- [ ] produzir inventário completo de coleções Firestore, contratos e índices da Fase 1.

### Resultado atual do lint

Em 13 de outubro de 2026, o lint passou a ignorar `.altum-agent-sources/` e `.qa-artifacts/`, que são respectivamente checkouts de upstream e relatórios gerados, não código distribuído pela Altum. Após essa correção de escopo, ele encontrou um único erro bloqueante: `prefer-const` em `app/cliente/painel/configuracoes/canais/page.tsx` (`loginTimeout`). A correção deve ser feita no lote do painel do cliente, preservando o limite desta missão Admin. Os demais apontamentos são avisos não bloqueantes já existentes.

## Comandos de verificação disponíveis

```powershell
npm run agents:audit:sources
npm run agents:import:agency
node scripts/sync-agent-sources.mjs Ado77/agency-agents
```

## Conclusão honesta

A Fase 0 produziu uma base real e reprodutível para adotar fontes externas, mas não está finalizada: a validação do runtime e o inventário completo do modelo canônico ainda precisam ser concluídos. O primeiro ativo externo já está incorporado de forma segura como conteúdo versionado; a próxima fase pode começar em paralelo, sem afirmar que execução multiagente em produção já está validada.
