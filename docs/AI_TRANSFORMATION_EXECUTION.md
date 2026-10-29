# Transformacao da IA — execucao por fases

Missão de continuidade do substituto Shopify:
[AI_ATTENDANCE_CONTINUOUS_MISSION.md](AI_ATTENDANCE_CONTINUOUS_MISSION.md).
Exige entrega integrada inicial e qualidade final comprovada; preserva pendências
históricas, escopo e autorizações. Não encerra ou retoma objetivos por si só.

## Plano de substituição integrada — 19/10/2026

O novo plano de capacidades, dependências, aceitação e virada está em
[AI_ATTENDANCE_REBUILD_PLAN_2026-10-19.md](AI_ATTENDANCE_REBUILD_PLAN_2026-10-19.md).
Ele está planejado, não implementado. Preserva os gates pendentes e o histórico
abaixo; nenhuma fase fica aprovada pela criação do plano. A entrega ao cliente
será integrada, com etapas internas condicionadas a evidências.

## Reavaliacao de qualidade conversacional — 19/10/2026

O cliente relata perda de contexto, resposta engessada e nenhuma melhora percebida.
As marcacoes historicas `pronta` abaixo NAO comprovam a qualidade atual em producao
nem autorizam afirmar que a IA atende bem em qualquer negocio. Ficam preservadas
como historico das entregas e das evidencias daquele ciclo; a aprovacao de qualidade
conversacional atual esta reaberta, sem declaracao de conclusao.

Inspecao confirmou: fetchConversation limita a 24 mensagens e o router cortava de
novo para 10 x 220 caracteres; memoria/estado eram recortados novamente; correcao
de detalhe apagava o assunto e substituia resposta por frase generica; palavras
sociais em pedidos comerciais podiam disparar politicas de saudacao/agradecimento.
As mudancas locais desta retomada preservam transcricao limitada por orcamento,
enviam papeis user/assistant a OpenAI, evitam repetir o ID da mensagem atual,
excluem respostas comprovadamente nao enviadas e preservam correcao de detalhe.
Nao foi migrado modelo, instalado framework, publicado codigo ou testado tenant real.

Evidencia inicial: 63/63 testes direcionados, incluindo 12 casos novos de continuidade
e regressao de politica/compositor/contexto/Shopify. O teste multi-turno desta suite
fornece rascunhos de resposta conhecidos: prova transporte de contexto e que as
regras nao os destroem; NAO prova que o modelo produz essas respostas. Bateria real,
comparacao cega, segmentos variados e piloto autenticado continuam obrigatorios.
Nao confundir esta revisao de inteligencia com fechamento do gate 2 de entregas.
Regressao ampla atual: 243/245 (56988), com dois contratos de fonte de autonomia/
handoff divergentes do actionPlan atual, ainda sem aprovacao ampla. Tipos finais
incluindo novos testes e lint direcionado aprovados. Detalhes e referencias em
AI_CONVERSATIONAL_ARCHITECTURE_REVIEW.md. Nao foi executada inferencia real nesta rodada.

Este documento controla a execucao da transformacao da IA da Altum. Uma fase so muda para `pronta` quando todos os criterios de saida forem comprovados. A fase seguinte nao pode comecar antes disso.

## Estados permitidos

- `nao_iniciada`: nenhum trabalho da fase em curso.
- `implementacao`: codigo, cenarios, dados ou operacao ainda em construcao.
- `validacao`: implementacao concluida, mas os gates ainda estao sendo executados.
- `reprovada`: um ou mais gates falharam; corrigir e repetir a validacao.
- `pronta`: todos os gates foram aprovados e existe evidencia registrada.

## Regra de conclusao comum

Cada fase exige implementacao completa, testes unitarios e de integracao aplicaveis, regressao, isolamento por tenant, seguranca, compatibilidade, observabilidade, rollback documentado e validacao operacional. Resultado parcial, media alta com regressao escondida ou dependencia externa indisponivel nao contam como conclusao.

## Fases

| Fase | Objetivo | Estado |
| --- | --- | --- |
| 1 | Fundacao, baseline e medicao comparavel por tenant | pronta |
| 2 | Entrada omnichannel confiavel | pronta |
| 3 | Modelo operacional por tenant | pronta |
| 4 | Estado inteligente do relacionamento | pronta |
| 5 | Supervisor e papeis especializados | pronta |
| 6 | Planejamento, ferramentas e autonomia | pronta |
| 7 | Composicao e validacao da resposta | pronta |
| 8 | Aprendizado em tres niveis | pronta |
| 9 | Gemeo digital e simulacao | pronta |
| 10 | Inteligencia proativa | pronta |

## Fase 1 — Fundacao, baseline e medicao

### Entregas

- Suite oficial versionada com 31 cenarios e cobertura completa obrigatoria.
- Snapshot comparavel por tenant sem ampliar a persistencia de mensagens brutas.
- Comparacao cenario a cenario, por papel e por categoria.
- Deteccao de regressao critica e de regressao compensada por melhora em outro cenario.
- Orcamentos explicitos de latencia e custo.
- Baseline inicial aceito apenas quando o gate oficial estiver `ready`.
- Comparacao contra a ultima execucao aprovada do mesmo tenant e da mesma versao. Antes de existir uma aprovada, usa a primeira execucao observada como referencia de progresso, sem promove-la para rollout.
- Estabilidade medida em ate tres execucoes da mesma versao e do mesmo fingerprint de configuracao; uma execucao isolada nao prova consistencia.

### Gate de saida

- Todos os testes deterministas da IA passam.
- Testes especificos de baseline passam.
- Typecheck e lint dos arquivos alterados passam.
- Uma bateria real completa do modelo e executada sem fallback, com todas as falhas atuais registradas.
- O resultado atual fica documentado como baseline observado; somente uma execucao `ready` pode virar referencia aprovada de rollout.
- Cobertura de todos os papeis e categorias e confirmada.
- O baseline por tenant e persistido e recuperado corretamente.
- O rollback consiste em ignorar o campo de comparacao; o gate oficial anterior permanece funcional.

### Evidencias

- Codigo: `lib/ai-evaluation-baseline.ts`.
- Testes: `tests/ai-evaluation-baseline.test.mts`.
- Execucao real: tres baterias concluidas em 2026-10-09 com `gpt-4.1-mini`, sem fallback. As execucoes aprovaram 18/31, 18/31 e 19/31; todas ficaram com gate `blocked`. Artefatos locais em `.qa-artifacts/ai-evaluation/`.
- Integracao da persistencia por tenant: implementada e coberta por testes deterministas; validacao operacional autenticada ainda pendente.
- Falhas persistentes nas tres amostras: saudacao, identidade da IA, preco sem contexto, dor de negocio, preco com contexto, audio com contexto, avanco de comprador pronto, objecao tardia de closer, fronteira de dados entre tenants e protecao de dados de pagamento.
- Cenarios instaveis: descoberta de servicos, audio sem clareza, diagnostico consultivo, memoria sem repeticao e incidente de pos-venda antes de upsell. Consistencia observada: 83,87%; `audio_unclear` e a oscilacao critica.
- Bloqueio de validacao em 2026-10-09: o teste de persistencia no emulador foi criado em `tests/ai-evaluation-baseline.emulator.mts`, mas o Firebase Emulator nao iniciou porque `java` nao esta instalado nem disponivel no `PATH`. Nenhuma operacao foi feita no Firestore de producao para contornar o bloqueio.

### Fechamento da Fase 1

- Estado final: `pronta` em 2026-10-09.
- Java 21 LTS instalado para a infraestrutura local de validacao.
- Firestore Emulator executado com sucesso; persistencia, recuperacao, referencia aprovada e isolamento entre tenants validados.
- Regressao final: 84/84 testes da suite de qualidade e 14/14 testes adicionais de baseline/estabilidade aprovados.
- Typecheck e lint aprovados.
- Rollback confirmado: os campos `baselineComparison`, `stability` e `tenantContextFingerprint` sao aditivos; consumidores antigos podem ignora-los e o gate anterior continua funcional.

## Fase 2 — Entrada omnichannel confiavel

### Objetivo

Garantir que a IA receba o mesmo significado, contexto e identidade da conversa independentemente de WhatsApp, Instagram, Facebook ou outro canal, sem mensagens duplicadas, ordem incorreta, perda de anexos ou mistura entre tenants.

### Gate de saida

- Contrato canonico de evento de entrada por canal.
- Idempotencia e deduplicacao por tenant, canal e mensagem do provedor.
- Ordenacao e agrupamento seguro de mensagens proximas.
- Normalizacao de texto, audio, imagem, documento, resposta citada e contexto de campanha.
- Identidade do contato e da conversa isolada por tenant e canal.
- Tratamento explicito de evento ausente, atrasado, repetido ou fora de ordem.
- Testes unitarios, integracao no Firestore Emulator e regressao dos canais atuais.
- Metricas e razoes operacionais para descarte, duplicidade e falha de normalizacao.
- Compatibilidade com rotas e webhooks existentes e rollback documentado.

Enquanto qualquer item estiver pendente, a Fase 2 permanece em `implementacao` e a Fase 3 nao comeca.

### Fechamento da Fase 2

- Estado final: `pronta` em 2026-10-10.
- Contrato canonico versionado em `lib/server/messaging/inbound-event.ts`, compartilhado pelos webhooks Meta e WhatsApp oficial/Evolution.
- Identidade deterministica composta por tenant, canal, conta do canal e remetente; buscas de conversa deixaram de misturar paginas Meta ou numeros WhatsApp diferentes.
- Timestamp do provedor passou a controlar ordenacao; eventos atrasados sao persistidos para auditoria, mas nao regridem o cursor nem disparam uma resposta fora de contexto.
- Texto, legenda, todos os anexos, resposta citada e campanha sao preservados em um formato limitado e uniforme.
- Duplicidade, evento invalido, evento fora de ordem, politica ignorada e falha de midia possuem contadores isolados por tenant e canal, sem expor o tenant no identificador da metrica.
- Compatibilidade preservada com conversas antigas sem `channelId` apenas quando existe uma unica correspondencia legada inequivoca.
- Validacao determinista: 25/25 testes de contrato/canais aprovados e 84/84 testes da suite de qualidade da IA aprovados.
- Firestore Emulator: 2/2 testes de identidade, idempotencia e metricas; 3/3 testes da fila, incluindo deduplicacao, turno mais novo e lock concorrente.
- Lint, typecheck e build de producao aprovados.
- Rollback: os campos canonicos e cursores sao aditivos. Os webhooks podem voltar a consumir os campos legados sem migracao destrutiva; documentos e rotas existentes foram preservados.

## Fase 3 — Modelo operacional por tenant

### Objetivo

Transformar configuracoes dispersas de cada empresa em um contrato operacional unico, versionado e verificavel, para que mudar o papel entre SDR, consultor, suporte e closer altere de fato objetivos, criterios de decisao, ferramentas permitidas, limites e forma de conduzir cada conversa.

### Gate de saida

- Contrato operacional canonico por tenant, com versao e fingerprint estavel.
- Papeis possuem capacidades, metas, proibicoes, criterios de sucesso e escalada materialmente diferentes.
- Configuracao incompleta cai em um perfil seguro e explica quais lacunas impedem maior autonomia.
- Runtime, preview e avaliacao oficial compilam o mesmo contrato, sem prompts paralelos divergentes.
- Alteracao relevante invalida provas antigas e exige nova avaliacao antes de ampliar rollout automatico.
- Isolamento por tenant e nenhuma heranca acidental de politica, catalogo ou aprendizado de outra empresa.
- Testes de contraste comprovam diferenca comportamental entre SDR, consultor, suporte e closer.
- Observabilidade registra versao, fingerprint e papel efetivamente usados em cada decisao.
- Compatibilidade, rollback, testes, lint, typecheck e build documentados.

Enquanto qualquer item estiver pendente, a Fase 3 permanece em `implementacao` e a Fase 4 nao comeca.

### Fechamento da Fase 3

- Estado final: `pronta` em 2026-10-10.
- Contrato operacional versionado em `lib/server/ai/role-operating-contract.ts`, incorporado ao contexto canonico `tenant-ai-context-v2`.
- `closer` passou a ser papel de primeira classe, separado de SDR e vendedor, com missao, protocolo de turno, capacidades, sinais de sucesso e proibicoes proprias.
- O planejador aplica capacidades de forma deterministica: SDR nao prepara proposta nem conclui compra; closer nao reinicia qualificacao; suporte nao recomenda oferta; consultor diagnostica sem fechamento automatico; pos-venda resolve risco antes de expansao.
- Configuracao incompleta entra em `restricted`: proposta, recomendacao de alto risco e fechamento deixam de ser executados, e as lacunas ficam disponiveis em `missingRoleSignals`.
- Runtime, preview e avaliacao oficial usam o mesmo contrato e a mesma composicao final de resposta.
- Logs de decisao armazenam papel efetivo, versao, prontidao, lacunas e fingerprint dentro do diagnostico do contexto por tenant.
- A bateria oficial passou para `2026-10-10-role-contract-v1`; provas de versoes anteriores nao liberam aumento de rollout.
- O fingerprint da avaliacao agora representa a matriz completa de cenarios e papeis, sem perder estabilidade por cada papel possuir seu proprio contrato.
- Validacao determinista: 85/85 testes da regressao de IA e 15/15 testes adicionais de contrato, isolamento, prova e integracao aprovados.
- Validacao real com `gpt-4.1-mini`: 10/10 cenarios de alinhamento por papel aprovados sem fallback. Artefato em `.qa-artifacts/ai-evaluation/baseline-2026-10-10T15-27-05-311Z.json`.
- Firestore Emulator aprovou persistencia e isolamento do baseline por tenant. Lint, typecheck e build de producao aprovados.
- Rollback: o contexto v2 e seus diagnosticos sao aditivos; a selecao antiga de `assistantRole` continua aceita, `sales` permanece fallback seguro e consumidores podem ignorar `roleContract` sem migracao destrutiva.

## Fase 4 — Estado inteligente do relacionamento

### Objetivo

Fazer a IA compreender e manter o estado real de cada relacionamento ao longo do tempo e dos canais: quem e a pessoa, o que ja foi dito, qual problema esta vivo, o que foi confirmado, o que mudou, qual compromisso existe e qual e o proximo passo, sem repetir perguntas ou carregar suposicoes antigas.

### Gate de saida

- Estado canonico por tenant, contato e relacionamento, separado do resumo textual do modelo.
- Fatos confirmados, hipoteses, preferencias, objecoes, compromissos e perguntas abertas possuem origem, confianca e validade.
- Correcao explicita substitui fato anterior sem manter contradicao silenciosa.
- Memoria funciona entre canais do mesmo contato somente quando existe vinculacao de identidade comprovada.
- Nenhum estado, resumo ou fato atravessa tenants ou contatos diferentes.
- Estado da conversa e memoria duravel possuem versionamento, limite, expiracao e estrategia de compactacao.
- O planejador usa lacunas reais do estado e nao repete pergunta ja respondida.
- Escritas concorrentes, mensagens fora de ordem e reprocessamentos nao regridem o relacionamento.
- Observabilidade explica quais fatos sustentaram a decisao e quais foram ignorados por baixa confianca ou expiracao.
- Compatibilidade, rollback, testes unitarios, Firestore Emulator, regressao, lint, typecheck, build e validacao operacional documentados.

Enquanto qualquer item estiver pendente, a Fase 4 permanece em `implementacao` e a Fase 5 nao comeca.

### Fechamento da Fase 4

- Estado final: `pronta` em 2026-10-10. A Fase 5 pode iniciar.
- Estado relacional canonico versionado em `lib/server/ai/relationship-state.ts`, separado do resumo livre do modelo e persistido por `tenantId + leadId`.
- Cada fato aceito registra valor, status (`confirmed` ou `hypothesis`), confianca, origem, mensagem de origem, momento observado, expiracao e historico curto de valores substituidos.
- Fatos explicitos do lead sao confirmados; extracoes indiretas permanecem hipoteses; uma hipotese de menor confianca nao sobrescreve um fato confirmado.
- Correcoes explicitas substituem o valor anterior sem apagar a trilha curta. Eventos atrasados, identidades divergentes e atualizacoes de menor confianca ficam registrados como descartes explicaveis.
- Identidades de telefone, e-mail ou provedor sao normalizadas, associadas ao tenant e armazenadas como hash. Memoria de outro contato retorna nula; o mesmo identificador em tenants diferentes gera chaves distintas.
- Estado e memoria usam transacoes no Firestore. Escritas fora de ordem nao regridem nem o relacionamento nem o estado da conversa.
- Expiracao por classe de fato, limites de fatos/compromissos/perguntas e compactacao de historico impedem crescimento sem limite e o uso silencioso de contexto vencido.
- Runtime e preview informam separadamente fatos confirmados e hipoteses. Uma politica final remove perguntas sobre fatos ja confirmados antes do envio.
- Pedidos por preco, condicao, proposta, conversa ou dados de outro cliente recebem uma fronteira deterministica de privacidade, compartilhada por producao, preview e avaliacao; o comportamento nao depende apenas do modelo.
- Logs de decisao registram revisao do relacionamento, chaves confirmadas, hipoteses, descartes e se existe identidade vinculada, sem copiar o valor sensivel para o diagnostico.
- A bateria oficial passou para `2026-10-10-relationship-state-v1`; cenarios de memoria agora falham se a prova nao contiver estado relacional canonico, e o cenario de isolamento falha sem a fronteira deterministica.
- Firestore Emulator: 2/2 testes aprovados para identidade, correcao, concorrencia e eventos fora de ordem. Testes unitarios e contratuais especificos: 15/15 aprovados na verificacao final da fase.
- Regressao final: 112/112 testes da suite `test:ai-quality`; lint sem erros (duas advertencias preexistentes em `agent.ts`), typecheck e build de producao aprovados.
- Validacao operacional real com `gpt-4.1-mini`: 3/3 cenarios criticos aprovados, sem fallback (`memory_accepts_business_correction`, `memory_does_not_repeat_known_goal` e `tenant_data_boundary`). Evidencia: `.qa-artifacts/ai-evaluation/baseline-2026-10-11T02-17-23-760Z.json`.
- Compatibilidade: campos anteriores de `ai_lead_memory`, documentos, IDs e rotas foram preservados; a leitura canonica prefere somente fatos confirmados e continua aceitando memoria legada quando ainda nao existe estado v1.
- Rollback: `relationshipState` e `relationshipUpdate` sao aditivos e nao exigem migracao destrutiva. Em reversao, o runtime pode ignorar esses campos e voltar aos campos legados; nenhuma rota, documento antigo ou dado anterior precisa ser removido. Provas da versao nova deixam de liberar rollout se o contrato for revertido.

## Fase 5 — Supervisor e papeis especializados

### Objetivo

Separar decisao, execucao e revisao em papeis especializados coordenados por um supervisor, para que recepcao, SDR, closer, consultoria, suporte e pos-venda executem estrategias proprias sem perder contexto, seguranca ou continuidade.

### Gate de saida

- Supervisor escolhe o especialista por intencao, estado relacional, risco e papel configurado, com justificativa observavel.
- Especialistas possuem entradas, saidas, ferramentas, limites e criterios de conclusao tipados; nao sao apenas variacoes de prompt.
- Uma conversa pode transferir entre especialistas sem reiniciar descoberta, perder fatos confirmados ou duplicar acao.
- Conflitos entre recomendacoes sao resolvidos por politica deterministica e nenhuma acao externa ocorre sem autorizacao do papel e do tenant.
- Falha, timeout ou indisponibilidade de um especialista cai em comportamento seguro e recuperavel, sem resposta duplicada.
- Isolamento por tenant, idempotencia, compatibilidade e rollback sao comprovados.
- Testes de contraste, integracao, regressao, lint, typecheck, build e validacao operacional real por papel sao aprovados.

Enquanto qualquer item estiver pendente, a Fase 5 permanece em `implementacao` e a Fase 6 nao comeca.

### Fechamento da Fase 5

- Estado final: `pronta` em 2026-10-11. A Fase 6 pode iniciar.
- Supervisor deterministico versionado em `lib/server/ai/specialist-supervisor.ts`; ele escolhe recepcao, SDR, closer, consultoria, suporte, pos-venda ou handoff humano antes da chamada ao modelo.
- A selecao considera papel configurado, intencao atual, incidente, condicao de cliente, contexto confirmado, estagio anterior e especialista ja ativo. Transferencias permitidas formam uma matriz explicita; suporte nao pode virar closer e um turno curto nao oscila de volta ao papel inicial.
- SDR ou vendedor com contexto qualificado transfere para closer; sem contexto suficiente permanece em qualificacao segura. Incidente de cliente ativo fica em pos-venda antes de expansao. Pedido humano sempre vence o roteamento interno.
- O envelope de continuidade preserva revisao do relacionamento, chaves confirmadas e hipoteticas, perguntas abertas, estagio e especialista anterior. A decisao possui chave idempotente isolada por tenant, chat, mensagem e revisao.
- Contrato tipado de execucao em `lib/server/ai/specialist-execution.ts`: cada especialista recebe tarefa, capacidades, ferramentas permitidas, limite de uma pergunta, timeout, criterios de conclusao e fallback; nao e apenas uma variacao de prompt.
- Ferramentas mutaveis sao removidas em modo copiloto, contexto incompleto ou papel restrito. Saida que solicita proposta, checkout, agenda ou CRM sem ferramenta autorizada e descartada antes de chegar ao planejador/executor.
- Saida ausente, timeout ou desobediencia ao handoff entra em fallback seguro. O timeout do roteador usa a mesma constante do contrato; uma resposta rejeitada nao e reutilizada silenciosamente.
- Runtime, preview e verificador real executam o mesmo supervisor e o mesmo contrato. O papel efetivo recompila o contrato operacional do tenant antes do modelo e antes do planejador.
- Estado da conversa persiste especialista ativo, versao do supervisor, razao da transferencia e chave da decisao em transacao que rejeita eventos fora de ordem.
- Logs registram papel configurado, especialista efetivo, modo, razao, confianca, chave idempotente, tarefa, ferramentas liberadas, status da saida e motivos de bloqueio.
- A bateria oficial passou para `2026-10-11-specialist-supervisor-v1`; provas antigas nao liberam rollout. O fingerprint v2 exige tambem versoes do supervisor e da execucao especialista.
- Validacao determinista final: 130/130 testes da suite `test:ai-quality`; 12/12 testes diretos de supervisor/execucao na ultima verificacao focada; Firestore Emulator 2/2 para memoria, ordem e persistencia do especialista.
- Validacao operacional real com `gpt-4.1-mini`: 10/10 cenarios de todos os papeis aprovados sem fallback. Evidencia: `.qa-artifacts/ai-evaluation/baseline-2026-10-11T08-26-28-437Z.json`. Cinco cenarios criticos de handoff, closer, suporte e pos-venda tambem passaram 5/5 apos correcao das variacoes reais de linguagem; evidencia: `.qa-artifacts/ai-evaluation/baseline-2026-10-11T08-24-52-541Z.json`.
- Lint sem erros (duas advertencias preexistentes em `agent.ts`), typecheck, `git diff --check` e build de producao aprovados.
- Compatibilidade: `assistantRole` continua sendo a configuracao de entrada; rotas e documentos antigos permanecem validos. Os novos campos de supervisor e especialista sao aditivos.
- Rollback: remover a instrucao/validacao especialista e ignorar os campos `activeSpecialist`/`specialist*` restaura o contrato unico da Fase 4 sem migracao de dados. A versao nova da avaliacao impede que uma prova obtida com supervisor seja reaproveitada depois da reversao.

## Fase 6 — Planejamento, ferramentas e autonomia

### Objetivo

Transformar a decisao comercial em planos executaveis, auditaveis e seguros, nos quais cada ferramenta possui pre-condicoes, idempotencia, autorizacao, confirmacao e compensacao, e o nivel de autonomia do tenant muda de fato o que a IA pode executar.

### Gate de saida

- Plano canonico versionado separa objetivo, fatos, lacunas, passos, ferramentas, risco, aprovacao e criterio de conclusao.
- Toda ferramenta possui contrato tipado de entrada/saida, escopo por tenant, pre-condicoes e chave idempotente.
- `copilot`, `hybrid` e `autonomous` geram limites de execucao materialmente diferentes e verificaveis.
- Acoes financeiras, contratuais, destrutivas, sensiveis ou irreversiveis nunca sao executadas sem a autorizacao exigida.
- Replanejamento ocorre depois de resultado, falha ou mudanca de estado; nenhum passo assume sucesso antes da evidencia.
- Timeout, retry, duplicidade, execucao parcial e compensacao possuem comportamento seguro e observavel.
- Preview e modo sombra nao produzem efeitos externos.
- Isolamento por tenant, compatibilidade, rollback, testes, Firestore Emulator, regressao, lint, typecheck, build e validacao operacional real sao aprovados.

Enquanto qualquer item estiver pendente, a Fase 6 permanece em `implementacao` e a Fase 7 nao comeca.

### Fechamento da Fase 6

- Estado final: `pronta` em 2026-10-11. A Fase 7 pode iniciar.
- Plano canonico `ai-action-plan-v1` implementado em `lib/server/ai/action-plan.ts`. Cada turno separa objetivo, fatos usados, lacunas, passos, ferramenta, risco, autorizacao, pre-condicoes, evidencia esperada, compensacao, chave idempotente e fingerprint.
- Contratos `ai-action-tool-contract-v1` declaram entradas, saidas, mutacao, efeito externo e necessidade de aprovacao para CRM, pipeline, follow-up, proposta, checkout e handoff.
- Os niveis agora alteram a execucao de verdade: Copiloto somente prepara aprovacoes e permite o handoff de seguranca; Hibrido atualiza contexto de baixo risco, mas segura fluxo comercial; Autonomo pode executar CRM, pipeline e follow-up de risco baixo ou medio.
- Checkout, pagamento e proposta contratual nunca sao executados automaticamente. Checkout exige oferta verificada, intencao explicita e aprovacao humana. Dados financeiros sensiveis bloqueiam toda automacao comercial daquele turno.
- Pedidos de aprovacao sao persistidos uma unica vez por tenant e chave idempotente em `ai_action_approvals`, com risco, justificativa, pre-condicoes, evidencias e compensacao.
- Execucao usa ledger transacional `ai-action-execution-v1` em `ai_action_executions`: claims concorrentes, lease, numero da tentativa, conclusao por evidencia, pre-condicao nao atendida, falha retryable e compensacao pendente ficam observaveis.
- Uma acao so e marcada concluida quando o runtime devolve evidencia compativel com o tipo do passo. Passos nao realizados terminam como `skipped_precondition`; falhas ficam `retryable` e sao replanejadas no novo processamento do turno.
- Runtime, preview e avaliacao real compilam o mesmo plano. Preview, avaliacao e rollout sombra usam `shadowMode` e deixam todos os passos sem efeito.
- Logs de IA persistem o plano e o fingerprint. A bateria oficial passou para `2026-10-11-action-plan-v1`; o fingerprint v3 exige a versao do planejador, invalidando provas anteriores para aumento de rollout.
- Validacao determinista final: 138/138 testes da suite `test:ai-quality`; 9/9 testes focados de plano/contrato/paridade; Firestore Emulator 4/4 para concorrencia, replay, retry, aprovacao e pre-condicao.
- Validacao operacional real com `gpt-4.1-mini`: 5/5 cenarios criticos de handoff, comprador pronto, closer, transferencia SDR→closer e protecao de pagamento aprovados sem fallback. Evidencia: `.qa-artifacts/ai-evaluation/baseline-2026-10-11T08-58-33-469Z.json`.
- Lint dos arquivos alterados sem erros (duas advertencias preexistentes em `agent.ts`), typecheck, `git diff --check` e build de producao aprovados. O lint global foi interrompido porque passou a percorrer fontes grandes e alheias em `.altum-agent-sources`; a verificacao escopada dos arquivos desta fase terminou limpa.
- Compatibilidade: rotas, documentos e executor comercial existentes foram preservados. Plano, logs, aprovacoes e ledger sao aditivos e isolados por tenant.
- Rollback: o executor pode voltar a ignorar `actionPlan`, `ai_action_approvals` e `ai_action_executions` sem apagar dados nem alterar rotas antigas. Provas da versao nova deixam de liberar rollout se o planejador for removido.

## Fase 7 — Composicao e validacao da resposta

### Objetivo

Produzir respostas finais naturais, objetivas e adequadas ao canal sem permitir que estilo, personalizacao ou persuasao removam fatos, limites, decisoes de seguranca ou o proximo passo definido pelo supervisor e pelo plano.

### Gate de saida

- Resposta e composta em camadas separadas de conteudo obrigatorio, fatos verificaveis, politica, tom do tenant e formato do canal.
- Um validador final deterministico protege identidade, privacidade, dados sensiveis, promessas, preco, estoque, prazo, desconto, checkout e handoff.
- WhatsApp, Instagram, Facebook, site chat, texto e audio possuem limites e formatos proprios sem alterar o significado da resposta.
- Resposta longa e dividida somente quando melhora a leitura; nenhuma divisao duplica pergunta, CTA ou envio.
- Perguntas repetidas, interrogatorio, jargao interno, resposta circular, pressao comercial e contradicao com memoria confirmada sao bloqueados antes do envio.
- Falha de composicao ou validacao produz resposta segura e util, sem expor erro tecnico ao cliente e sem disparar acao externa indevida.
- Runtime, preview e avaliacao oficial usam o mesmo compositor e o mesmo recibo de validacao.
- Isolamento por tenant, compatibilidade, rollback, testes, regressao, lint, typecheck, build e validacao real por canal sao aprovados.

Enquanto qualquer item estiver pendente, a Fase 7 permanece em `implementacao` e a Fase 8 nao comeca.

### Fechamento da Fase 7

- Estado final: `pronta` em 2026-10-11. A Fase 8 pode iniciar.
- Compositor canonico `ai-response-composer-v1` implementado em `lib/server/ai/response-composer.ts` e executado como ultima barreira antes do envio.
- A composicao aplica em ordem controlada: seguranca de dados sensiveis, fatos transacionais verificados, autorizacao de URL, handoff, identidade da IA, pressao comercial, correcao de memoria, politica do turno, privacidade, perguntas ja respondidas, repeticao, limite de perguntas e formato do canal.
- Preco, estoque, pagamento, prazo e link nao verificados sao substituidos por uma resposta segura. Checkout continua impossivel sem a autorizacao produzida pela Fase 6.
- Pedido de cartao completo, senha ou CVV nunca e aceito; vazamento de prompt, guardrail ou ferramentas vira resposta segura; a IA nao pode se declarar humana.
- Pedido de handoff sempre confirma que uma pessoa da equipe assumira e preserva o contexto. Resposta circular e pergunta sobre fato confirmado sao reparadas antes do envio.
- Frases de pressao como ultima chance, compre agora ou ameaca de perda sao removidas. Uma correcao explicita do cliente nao pode ser respondida com o valor confirmado antigo.
- WhatsApp, Instagram, Facebook e chat do site possuem limites proprios. Respostas longas podem ser divididas em no maximo duas mensagens, mantendo no maximo uma pergunta; audio permanece em uma unica mensagem.
- Cada composicao gera recibo com versao, status, canal, transformacoes, motivos de bloqueio, perguntas removidas, quantidade de perguntas/mensagens e fingerprints de entrada/saida.
- Runtime, handoff, rollout sombra, preview e avaliacao real usam o mesmo compositor. Logs persistem `responseValidationTrace`; preview devolve o recibo sem produzir efeitos.
- A bateria oficial passou para `2026-10-11-response-composer-v1`, ganhou cenarios de Instagram, Facebook e chat do site e o fingerprint v4 exige a versao do compositor.
- Validacao determinista final: 148/148 testes da suite `test:ai-quality`; testes diretos cobrem seguranca, fatos, URL, handoff, identidade, vazamento interno, repeticao, limites por canal, audio, pressao e contradicao de memoria.
- Validacao operacional real com `gpt-4.1-mini`: 6/6 cenarios criticos e de canal aprovados sem fallback para WhatsApp, Instagram, Facebook, site, dados de pagamento e handoff. Evidencia: `.qa-artifacts/ai-evaluation/baseline-2026-10-11T09-15-27-344Z.json`.
- Lint dos arquivos alterados sem erros (duas advertencias preexistentes em `agent.ts`), typecheck e build de producao aprovados.
- Compatibilidade: o compositor recebe a resposta ja produzida pelo fluxo anterior e devolve texto/mensagens; canais, rotas e provedores existentes foram preservados.
- Rollback: remover a chamada final de `composeAiResponse` restaura a composicao anterior; recibos e campos de runtime sao aditivos e podem ser ignorados sem migracao destrutiva.

## Fase 8 — Aprendizado em tres niveis

### Objetivo

Fazer a IA aprender com seguranca em tres escalas separadas — dentro da conversa, dentro do tenant e no produto global — usando resultados reais e feedback confiavel, sem transformar erros, preferencias isoladas ou dados de outra empresa em novas regras automaticas.

### Gate de saida

- Aprendizado de conversa atualiza apenas estado, preferencias, fatos e compromissos daquele relacionamento.
- Aprendizado do tenant usa resultados agregados, feedback humano e amostra minima; nenhuma mensagem isolada vira politica.
- Aprendizado global usa somente sinais anonimizados e agregados, sem texto bruto, identificador de pessoa ou transferencia entre tenants.
- Feedback explicito, edicao humana, handoff, resposta, silencio, conversao, perda, proposta e agendamento possuem pesos e confianca diferentes.
- Correlacao nao e tratada como causalidade; recomendacoes novas entram em sombra e avaliacao antes de alterar comportamento automatico.
- Sinais conflitantes, antigos, esparsos ou enviesados perdem peso, expiram ou exigem revisao humana.
- Toda recomendacao aprendida possui origem, amostra, intervalo temporal, confianca, versao, explicacao e rollback.
- Poisoning, prompt injection, spam, repeticao artificial e feedback do proprio agente nao contaminam aprendizado.
- Isolamento por tenant, privacidade, compatibilidade, rollback, testes, Firestore Emulator, regressao, lint, typecheck, build e validacao operacional sao aprovados.

Enquanto qualquer item estiver pendente, a Fase 8 permanece em `implementacao` e a Fase 9 nao comeca.

### Fechamento da Fase 8

- Estado final: `pronta` em 2026-10-11. A Fase 9 pode iniciar.
- Politica versionada `ai-learning-policy-v1` implementada em `lib/server/ai/learning-policy.ts`, com pesos distintos para feedback explicito, edicao humana, handoff, resposta, silencio, conversao, perda, proposta, agenda, pipeline e observacao do agente.
- Saida da propria IA passou a ser registrada somente como `observation_only`, com peso zero e rejeicao `self_generated_signal`. Reprocessamento do mesmo log e do mesmo outcome e transacionalmente idempotente.
- Resultados reais de proposta, agendamento e pipeline sao atribuidos a no maximo cinco eventos recentes do mesmo lead. Oferta, proxima acao, objecao e movimento de fechamento so acumulam evidencia quando existe outcome externo positivo ou negativo.
- Feedback humano da fila comercial alimenta o mesmo contrato; a rota autenticada `ai-learning/feedback` aceita feedback explicito, edicao, resposta, silencio e handoff somente com tenant, permissao, lead acessivel e chave idempotente.
- Sinais ficam em `ai_learning_signals` sem texto bruto, com relacionamento e referencia transformados em hash, validade de 90 dias e agregacao diaria por tenant. O agregado global aceita apenas taxonomia fixa de canal, papel e familia de acao, sem tenant, lead, oferta ou texto.
- Prompt injection, sondagem de instrucao interna, spam, alvo contaminado e feedback do proprio agente sao rejeitados antes da agregacao. Uma mensagem isolada, um unico relacionamento ou repeticao artificial nao produz recomendacao.
- Recomendacao exige pelo menos oito sinais, tres relacionamentos distintos, confianca minima, conflito limitado e evidencia nao expirada. Cada item possui versao, amostra, diversidade, janela, pesos positivo/negativo, confianca, conflito, explicacao de correlacao e instrucao de rollback.
- Toda recomendacao nasce em `shadow`. Evidencia nova muda o fingerprint e devolve uma recomendacao aprovada para sombra; evidencia insuficiente, conflitante ou expirada arquiva a versao anterior. O runtime ignora contadores antigos e le exclusivamente recomendacoes `approved`, atuais e nao expiradas do proprio tenant.
- Preview e bateria oficial conseguem aplicar exatamente um fingerprint em sombra. O fingerprint v5 da bateria inclui o candidato de aprendizado; promocao exige duas execucoes estaveis, cobertura integral, todos os cenarios aprovados, comparacao sem regressao e aprovacao humana pela rota `ai-learning/recommendations`.
- Extracao deterministica compartilhada de negocio, objetivo e canais foi adicionada para impedir que um campo evidente desapareca quando o modelo omite uma chave. Identidade da IA, pedido de humano, preco sem contexto, visao de servicos, dor clara e pedido de dados de outro cliente ganharam intencoes deterministicas compartilhadas por runtime, preview e avaliacao.
- Validacao determinista final: 168/168 testes da suite `test:ai-quality`. Firestore Emulator: 4/4 para idempotencia, ausencia de texto bruto, agregado global anonimo, isolamento, sombra, invalidacao por nova evidencia e atribuicao de outcome.
- Validacao operacional real completa com `gpt-4.1-mini`: 35/35 cenarios aprovados, 100%, sem fallback e sem falha critica, incluindo WhatsApp, Instagram, Facebook, site, todos os papeis, memoria, privacidade, grounding e pagamento sensivel. Evidencia: `.qa-artifacts/ai-evaluation/baseline-2026-10-12T02-40-11-197Z.json`.
- Lint dos arquivos alterados sem erros (duas advertencias preexistentes em `agent.ts`), typecheck e build de producao aprovados.
- Compatibilidade: contadores e documentos antigos foram preservados para diagnostico, mas nao alteram mais a resposta. Rotas e contratos existentes continuam validos; novas colecoes, campos e endpoints sao aditivos.
- Rollback: desativar ou arquivar uma recomendacao remove sua influencia imediatamente sem apagar sinais. O runtime pode ignorar `ai_tenant_learning_recommendations` e voltar a `hasData: false`; fingerprints v5 impedem reutilizar provas obtidas com outro candidato ou depois da reversao.

## Fase 9 — Gemeo digital e simulacao

### Objetivo

Criar um ambiente de simulacao fiel da operacao comercial de cada tenant para comparar o comportamento atual com candidatos de configuracao, aprendizado, papel, modelo ou politica antes de qualquer mudanca atingir clientes ou executar efeitos externos.

### Gate de saida

- Snapshot de simulacao canonico e versionado congela contexto do tenant, contrato de papel, conhecimento permitido, estado relacional anonimizado, canal e configuracao avaliada.
- Replays removem ou transformam identificadores pessoais e nunca copiam texto ou memoria de outro tenant para o corpus de simulacao.
- Baseline e candidato recebem a mesma entrada, estado e evidencia; diferencas de decisao, resposta, fatos, acao, risco, latencia e custo ficam explicitas.
- Todo plano executado no gemeo usa sombra: nenhuma mensagem, CRM, agenda, proposta, checkout, handoff ou integracao externa produz efeito real.
- Simulacao cobre jornadas completas e nao apenas turnos soltos: entrada, qualificacao, transferencia, objecao, fechamento, suporte, pos-venda, silencio, retorno e correcao.
- Gerador de casos inclui variacoes por papel, canal, segmento, maturidade, ruido, prompt injection, dado sensivel, evento repetido, evento fora de ordem e falha de provedor.
- Resultados nao deterministas sao medidos em repeticoes vinculadas ao mesmo fingerprint; um unico acerto nao prova estabilidade.
- Gate contrafactual bloqueia qualquer regressao critica, perda de isolamento, aumento de acao indevida, quebra de grounding ou piora acima dos limites de latencia e custo.
- Recomendacoes da Fase 8 somente podem ser promovidas quando o fingerprint exato do candidato estiver aprovado no gemeo e na bateria oficial.
- Cada execucao gera artefato reproduzivel com versoes, fingerprints, cobertura, deltas, motivos, evidencias, aprovador e caminho de rollback.
- Isolamento por tenant, privacidade, compatibilidade, rollback, testes, Firestore Emulator, regressao, lint, typecheck, build e validacao operacional real sao aprovados.

Enquanto qualquer item estiver pendente, a Fase 9 permanece em `implementacao` e a Fase 10 nao comeca.

### Fechamento da Fase 9

- Estado final: `pronta` em 2026-10-12. A Fase 10 pode iniciar.
- Contrato versionado `ai-digital-twin-v1` criado em `lib/ai-digital-twin.ts`. O snapshot canonico e isolado por tenant vincula baseline, candidato, versao da suite, fingerprints de contexto e aprendizado, corpus sintetico oficial e bloqueio de efeitos externos.
- As 35 situacoes oficiais sao distribuidas exatamente uma vez em sete jornadas: primeiro contato, qualificacao e fechamento, continuidade, suporte e retencao, canais e midia, seguranca e handoff e consultoria por papel.
- A matriz de variantes cobre papel, canal, segmento, maturidade, ruido, prompt injection, dado sensivel, entrega repetida/fora de ordem, falha de provedor, silencio, retorno e correcao.
- Provas sinteticas executaveis confirmam idempotencia de evento repetido, protecao contra regressao por evento atrasado, fallback seguro sem efeito e silencio sem mensagem nao aprovada.
- O gate compara decisao, objetivo de resposta, estado, qualidade, riscos, latencia e custo. Bloqueia cobertura incompleta ou duplicada, baseline/candidato reprovado, instabilidade, fallback, regressao, efeito real, resposta nao validada e aumento superior a 25% de latencia ou custo.
- A rota autenticada `ai-simulations` exige modulo de IA e `manage_ai`, aceita somente baterias oficiais persistidas e grava recibo transacional idempotente em `ai_digital_twin_runs`. O recibo nao contem texto bruto de conversa.
- Promocao da Fase 8 agora exige o recibo `ready` do gemeo do mesmo tenant, execucao e fingerprint do candidato, posterior a evidencia avaliada. Sem esse vinculo, a recomendacao permanece em sombra.
- Validacao determinista: 182/182 testes da suite de qualidade no fechamento da fase, 13/13 testes focados de gemeo/aprovacao e 2/2 testes no Firestore Emulator. Lint dos arquivos alterados e typecheck aprovados naquele ponto.
- Validacao operacional real com `gpt-4.1-mini`: nova bateria 35/35, 100%, zero falha critica, em `.qa-artifacts/ai-evaluation/baseline-2026-10-12T03-29-00-118Z.json`. A repeticao contra a bateria 35/35 anterior ficou `ready`, 35 cenarios, sete jornadas e nenhum bloqueio; recibo em `.qa-artifacts/ai-digital-twin/digital-twin-2026-10-12T03-29-36-199Z.json`.
- Compatibilidade e rollback: contratos, rotas e colecoes sao aditivos. Arquivar o candidato mantem o baseline; o gemeo nunca executa mensagem, CRM, agenda, proposta, checkout, handoff ou integracao.

## Fase 10 — Inteligencia proativa

### Objetivo

Fazer a Altum perceber riscos e oportunidades antes que o operador precise procurar, priorizando o que merece atencao e propondo o proximo movimento com explicacao, sem transformar proatividade em spam ou automacao insegura.

### Gate de saida

- Detectar e priorizar handoff pendente, compromisso vencido, incidente de retencao, agenda em risco, proposta sem retorno e lead quente parado usando somente fatos operacionais do proprio tenant.
- Cada recomendacao possui versao, fingerprint, prazo, expiracao, prioridade, score, evidencias, motivos, supressoes, modo de acao e rollback.
- Opt-out, consentimento negado, fadiga de contato, horario silencioso, lead encerrado e recomendacao aberta impedem nova acao inadequada.
- Nenhuma recomendacao envia mensagem ou muda CRM, agenda, proposta ou integracao. Aceite, descarte e conclusao exigem operador autenticado com permissao e acesso ao mesmo lead.
- Resultado positivo, negativo ou neutro pode ser registrado sem texto bruto para fechar o ciclo de qualidade e permitir calibracao futura.
- Persistencia e idempotente e transacional; tenant, lead e fingerprint nao podem ser reutilizados por outro escopo.
- Lista operacional mostra somente itens nao expirados e ordena por impacto, mantendo itens suprimidos fora do resumo acionavel.
- Isolamento por tenant, privacidade, seguranca, compatibilidade, rollback, testes, Firestore Emulator, regressao, lint, typecheck, build e validacao operacional sao aprovados.

### Fechamento da Fase 10

- Motor `ai-proactive-intelligence-v1` implementado com seis familias de recomendacao, priorizacao deterministica e contrato sempre `human_review`.
- Rotas autenticadas `ai-proactive` implementam geracao/listagem por tenant e revisao por recomendacao; ambas exigem modulo de IA, permissao de edicao e acesso comercial ao lead.
- Varredura realmente proativa implementada em job autenticado, paginado por cursor de tenant e lead, limitado por execucao e habilitado apenas para empresas com modulo de IA. O agendamento foi ligado ao cron cloud e ao timer do servidor proprio.
- Protecoes de consentimento, opt-out, fadiga em 72 horas, duplicidade, horario silencioso por timezone e estado encerrado suprimem a recomendacao antes que ela se torne acionavel. As supressoes ficam auditaveis, mas nunca executam efeito.
- As recomendacoes acionaveis chegam a `Inicio > Decisoes prioritarias`, respeitando a carteira acessivel ao usuario e traduzindo sinais tecnicos em acoes comerciais diretas.
- A listagem exclui itens expirados, filtra registros pela carteira do operador e separa total, acionaveis, suprimidos e urgentes. O ciclo de estado impede concluir sem aceitar, aceitar item suprimido ou reabrir item terminal.
- Aceite, descarte e conclusao agora usam transacao no Firestore, impedindo corrida entre operadores. O resultado aceita somente a taxonomia `positive`, `negative` ou `neutral`; observacao livre e texto bruto nao sao persistidos.
- Validacao determinista final: suite completa de IA em 195/195; testes focados em 13/13; Firestore Emulator em 4/4; lint dos arquivos da fase sem erros; typecheck escopado da area cliente/IA aprovado por `tsconfig.client-ai-release.json`.
- Validacao operacional reproduzivel: 12/12 casos aprovados e zero efeito externo. Evidencia em `.qa-artifacts/ai-proactive/operational-2026-10-12T04-08-07-417Z.json`.
- Estado final: `pronta` em 2026-10-13. O bloqueio externo deixou de existir e o gate foi repetido sobre o pacote de publicacao: 195/195 testes da suite oficial de IA, typecheck global e build Next de producao aprovados, com 367 paginas estaticas geradas.
- Rollback: remover o consumo da colecao `ai_proactive_recommendations` ou arquivar os itens. Como nenhuma acao externa e executada, nao existe mensagem, CRM ou compromisso a desfazer.

Enquanto o build global estiver bloqueado, a Fase 10 nao muda para `pronta` e a transformacao nao e marcada como concluida.
