# Progresso — missão contínua da IA de atendimento da Altum

Atualização: 22/10/2026. Fonte de trabalho: AI_ATTENDANCE_CONTINUOUS_MISSION.md.

## Unidade B — retomada de runs por recibos — 21–22/10/2026

### Diagnóstico funcional solicitado antes de novas capacidades — 22/10 — concluído localmente, REPROVADO integrado

- Pedido humano: avaliar funcionalidades construídas em testes antes de avançar.
  Novas implementações suspensas durante a avaliação; nenhuma correção de
  produção efetuada nesta rodada diagnóstica. Documento completo em
  AI_ATTENDANCE_FUNCTIONAL_DIAGNOSTIC_2026-10-22.md.
- Bateria atual de 25 arquivos **169/169**, zero skips, 475,96s, recibo
  ai-diagnostic-requested-runtime-20261022; memória/conhecimento/aprendizado
  **23/23**, zero skips, 32,91s, ai-diagnostic-memory-learning-20261022.
  Tipos/lint **0/0**. Snapshot e drift finais: **49 arquivos, zero alteração**.
- Jornadas reais do handler com transportes/modelo simulados **0/4**: três
  abortam em CRM_STAGE_AI_SIGNAL_HUMAN_CONTROL depois do próprio handoff;
  quarta (correção/reinício) aborta no processo novo com causa interna ainda
  não exposta. Não atribuir a quarta à mesma causa sem prova.
- Novo teste diagnóstico cruza claim real + admissão de tail + falha antes de
  uso + root expirado. **0/1**: root vai para conciliação apesar de plano válido
  pendente; retomada automática ainda não foi integrada. Arquivo
  tests/ai-handler-recovery-diagnostic.emulator.mts e log/recibo
  ai-diagnostic-tail-recovery-20261022. Mantida reprovação, sem reduzir asserção.
- Sem chamada paga: ledger consultado readonly, US$0,002858 comprometidos,
  duas chamadas históricas, zero pendências; trava da tarifa desatualizada
  preservada. Qualidade com modelo real não foi avaliada nesta rodada.
- Conclusão: infraestrutura isolada tem provas; agente integrado NÃO aprovado.
  Próxima ação é corrigir os bloqueadores reproduzidos e repetir jornadas antes
  de novas capacidades. C–G e B seguem abertas; sem produção/cliente real.

### Retomada dos efeitos finais do handler — 22/10 — implementação em validação

- Baseline ai-handler-continuation-baseline-20261022: **0/3**, 22,38s.
  Log legado sozinho concluía root com efeitos finais pendentes; replay de uso
  duplicava ledger/total mensal; evento de aprendizado criado antes de falha
  no sinal não retomava seu sinal. Sem modelo/provedor/cliente real.
- Novo handler-continuation reutiliza jobs com tipo próprio, plano congelado de
  até oito efeitos, digest, gerações/revisão da origem, lease e recibo por etapa.
  Quatro finais do handler (sombra, resposta pausada, handoff, resposta normal)
  admitem log/uso/aprendizado/automação/runtime/memória antes de executá-los.
  Retomada consulta plano antes de log/modelo/envio. Log legado sem prova de
  conclusão exige conciliação; não promove um histórico incompleto a concluído.
- Uso recebe chave opcional de operação e grava ledger+agregado em uma transação;
  replay preserva custo/contagem. Aprendizado retoma sinal a partir do evento
  persistido, sem duplicar agregado nem aceitar saída própria como evidência humana.
- Focado inicial **11/11**, 35,82s, com oito regressões de finalização; tipos 0.
  Focado efeitos **6/6**, 21,24s: etapas reais, perda de ACK depois de uso,
  replay, alteração do plano e recriação da mensagem. Logs/recibos
  ai-handler-continuation-focused/effects-20261022. Não aprovam B integral.
- Ajustes concorrentes de seleção de oportunidade preservados em agent, queue,
  execution-authority, runtime-state e handler-continuation. Testes/estáticos
  alheios confirmados vivos; não editar essas fontes durante execução.
- Sessão própria **37647** valida worker de entrada real retomando plano pendente
  antes do atalho de ai_logs, sem nova resposta/modelo. Log/recibo
  ai-handler-continuation-worker-20261022. Próximo: obter recibo, integrar recuperação
  de root executing expirado com plano durável quando fontes livres, congelar
  snapshot e executar tipos/lint/regressão dos consumidores.
- Limites ainda abertos: recuperação de root sem resultado completo deve usar
  o plano verificável antes de reabrir; persistência/deleção/restauração desse novo
  tipo precisa cruzamento dos contratos de B. Nenhuma publicação, custo pago ou
  uso de loja/conversa real. Missão e B permanecem abertas.

### Recuperação de execução e posse antes de efeitos — 22/10 — implementada/testada localmente

- Baseline ai-queue-recovery-baseline-20261022: **1/7**, 26,59s. A fila não
  recuperava `processing` expirado: nem execução não iniciada, nem resultado
  persistido, nem classificação explícita de execução incerta/legada.
- Claim agora registra protocolo, geração original do job/conversa e fase.
  Transação muda `claimed` para `executing` antes de observação/handler; resultado
  completo recebe recibo ligado a tenant/chat/mensagem/geração/tentativa/token
  antes de finalizar. Resultado registrado não pode ser convertido em retry.
- Recuperador distingue lease ativo, claim interrompido antes de iniciar,
  resultado verificável e efeito incerto/legado. Reabre somente não iniciado;
  conclui resultado sem executar handler; incerto exige conciliação. Paginação
  por IDs percorre histórico ativo sem esconder expirados depois da primeira página.
- Focado de recuperação/finalização/ciclo de vida **22/22**, 20,65s, recibo
  ai-queue-recovery-focused-20261022. Todos fictícios, sem settings de modelo.
- execution-authority propaga contexto de claim por awaits, sem aceitar contexto
  do modelo. Enqueue revalida raiz/geração/tentativa/token/lease e coordenadores;
  precondições da mesma gravação atômica impedem revogação entre leitura e commit.
  Writer de metadados também revalida posse. Leitor do agente passou a usar o
  store compatível v2, preservando v1 apenas do proprietário exato.
- Integrado dessas capacidades **27/27**, 52,65s, zero skips; tipos/lint **0/0**,
  logs/recibos ai-execution-recovery-integrated/static-20261022, snapshot homônimo.
- Reprovação adicional real ai-execution-crm-baseline-20261022: **0/1**. Fence
  comercial válido ainda permitia escrita por claim revogado; próxima correção
  deve integrar a autoridade ao fence e preservar worker passivo independente.
  Arquivo compartilhado conversation-commercial-context.ts estava sendo usado
  por teste alheio crm-conversation-selection-regression (PID 9004 confirmado
  vivo); preservado, sem editar suas fontes durante execução.
- Complemento em curso sessão **77292**, ai-queue-recovery-checkpoint-20261022:
  perda de confirmação após o checkpoint REAL e recuperação concorrente. Não
  duplicar nem editar imports enquanto ativo. Depois integrar guard de CRM e
  separar contexto dos workers independentes, validar consumidores e estáticos.
- B aberta. Sem publicação, modelo pago, loja/conversa real ou ações em clientes.

Atualização posterior da recuperação/posse:

- Complemento checkpoint/concorrência terminou **9/9**, 19,30s. Uma perda de
  confirmação depois da transação REAL de resultado deixa o recibo intacto;
  recuperação termina sem outra tentativa. Oito recuperadores simultâneos de
  claim não iniciado admitem somente uma tentativa nova. Falhas `qa injected`
  nesses logs são deliberadas, não incidentes de produção.
- Após término confirmado do teste alheio (44/44), acrescentada validação de
  posse ao fence comercial compartilhado, preservando a seleção de oportunidades
  e demais alterações existentes. Snapshot anterior dos três módulos compartilhados:
  ai-execution-crm-shared-before-20261022.json.
- Workers públicos de fila, observação CRM e outbox limpam somente o contexto
  herdado de quem os acordou; cada um mantém seus próprios recibos, lease e
  autorização. O agente novo recebe seu próprio contexto depois do claim.
  Assim, uma execução revogada não escreve CRM, e o observador passivo ou uma
  entrega previamente aceita não dependem da posse do chamador antigo.
- Integrado final **39/39**, zero skips, 62,38s: autoridade antes de efeitos,
  revogação entre leitura e commit, isolamento concorrente, CRM revogado,
  workers independentes, recuperação, finalização, ciclo de vida e escritores.
  Recibo ai-execution-crm-recovery-final-20261022. Tipos/lint **0/0**, recibo
  ai-execution-crm-recovery-static-20261022; snapshot homônimo de fontes.
- Regressão dos consumidores existentes ainda ativa sessão **47710**, arquivo
  ai-execution-workers-regression-20261022: fila v1, legado real, texto, handoff
  e CRM passivo. Não duplicar nem editar fontes durante execução. Próximo passo
  imediato: obter recibo terminal e conferir hashes.
- Próximo fechamento de B exige cruzar os quatro contratos originais. Em
  particular, `ai_logs` é gravado antes de aprendizado, automações e memória
  finais do handler; sua existência sozinha não comprova que esses efeitos
  terminaram. Esta unidade só aceita recibo do resultado completo, e não aprova
  automaticamente a retomada parcial anterior/legada ou qualidade C–G.

- Sessão 47710 encerrada: consumidores existentes **37/37**, zero skips,
  87,96s, recibo ai-execution-workers-regression-20261022. Drift posterior
  encontrou alteração concorrente SOMENTE em conversation-commercial-context.ts:
  validação de datas de histórico importado para seleção de oportunidade. Guard
  de posse foi preservado; não desfazer alteração alheia nem usar hashes antigos
  para aprovar a nova versão. Snapshot current de 30 fontes e rechecagem atual
  em ai-execution-crm-current-20261022 (oito casos de autoridade, tipos e lint).
  Próxima ação após o recibo terminal: conferir drift final e reproduzir a retomada
  parcial do handler quando ai_logs já existe e efeitos finais ainda não terminaram.

- Rechecagem da versão compartilhada atual encerrada: **8/8**, 14,58s, tipos/lint
  **0/0**, recibo ai-execution-crm-current-receipt-20261022. Drift final de 30
  fontes **0**, ai-execution-crm-current-final-drift-20261022. Sem processos de
  validação próprios pendentes. Fontes congeladas no snapshot current; provas
  anteriores continuam associadas aos snapshots históricos, sem somar baterias.
- Recuperação e posse desta unidade encerradas localmente. B continua aberta
  para cruzamento de fila/turno, entrega, exclusividade humana e identidade,
  incluindo a reprodução de retomada parcial descrita acima. Sem alterar critérios
  de saída e sem incluir capacidades conversacionais de C–G nesse gate técnico.

### Coordenação por identidade exata — implementação em curso — 22/10

Atualização nesta retomada: as sessões citadas abaixo são histórico,
não processos ainda ativos. Focado inicial terminou 11/11; legado inicialmente
3/5 revelou atualização v1 ocultada e colisão entre namespaces, corrigidos com
coleção ai_conversation_turns_v2 separada e leitura compatível; focado legado 5/5.
Ciclo de vida e progresso da fila passaram 4/4, depois controle/leituras 7/7.
Recibos: ai-turn-identity-focused, ai-turn-legacy-focused,
ai-turn-lifecycle-focused e ai-turn-control-focused (20261022).

- Nova reprodução chat-state-writers: 1/4, três falhas reais locais. Enqueue
  humano sobrescrevia controle estrangeiro e aceitava troca concorrente; exclusão
  arquivava/apagava estado de outro proprietário numa chave legada colidente.
- Enqueue agora deriva a chave do contexto e valida metadados; create/update
  com precondição faz o lote inteiro recusar troca concorrente. Replay não pausa
  novamente. Exclusão só inclui chat_state de proprietário exato no manifesto.
- Gravações tardias do agente usam writer transacional com geração da conversa.
  Pausa/takeover/resume da rota existente usam transação única para controle,
  atribuição e mensagem de sistema; identidade/geração inválida retorna conflito.
  Busca manual de mensagem inclui tenant. Autorizações existentes preservadas.
- Focado chat-state-writers-focused-20261022 terminou **18/18**, zero skips,
  79,02s: sete escritores/decisões humanas, sete ciclo de vida/isolamento e quatro
  waiting de exclusão/restauração/retenção. Não comprova HTTP autenticado completo.
- Estáticos ai-turn-state-writers: lint 0; tipos 2 por spread de união de tuplas
  em ai-turn-identity.test.mts:12. Corrigir a chamada sem alterar asserções após
  a regressão ativa terminar; não editar fontes em uso.
- Regressão de consumidores ativa sessão **1932**, log/recibo
  ai-turn-consumers-regression-20261022. Fonte congelada por snapshot
  ai-turn-state-writers-snapshot-20261022; não duplicar nem editar imports.
  Inclui fila, legado, identidade, texto, handoff, conhecimento/mídia, voz existente
  e templates; não é desenvolvimento de áudio nem chamada paga.
- Próximo contrato original de B: finalização após exclusão, recriação ou troca
  de tentativa. Baseline separado ativo sessão **9132**, projeto fictício isolado,
  arquivo ai-queue-finalization-baseline-20261022. Nenhum modelo/provedor real.
  B permanece aberta; recuperação de processamento interrompido e validação
  integrada ainda necessárias. Nenhuma publicação ou aprovação de C–G.

Resultados posteriores da mesma unidade:

- Regressão de consumidores terminou **69/72**, 219,16s, zero skips. As três
  reprovações de mídia/voz ocorreram na própria preparação do teste: interrupção
  fixada na terceira transação passou a acontecer antes do arquivo persistido
  depois que o leitor compatível ganhou transação. Mantidas todas as asserções;
  injeção agora exige artefato durável e nenhum início de provedor. Rechecagem
  dos dois arquivos completos **24/24**, 78,32s, recibo
  ai-turn-media-interruption-recheck-20261022. Falhas históricas preservadas;
  não apresentar estes resultados como uma única bateria verde de 72 casos.
- Erro de tipos corrigido com argumentos explícitos, mesma asserção de distinção.
  Tipos/lint atuais **0/0** (ai-queue-finalization-static-receipt-20261022).
- Baseline real de finalização terminou **0/3**: worker recriou job excluído,
  concluiu registro recriado de outra empresa e sobrescreveu tentativa mais nova.
  Todos os cenários locais, com pausa humana e sem settings/modelo real.
- Claim agora persiste token próprio no job e no coordenador, capturando geração
  original da conversa. Finalização verifica geração do job, tipo, proprietário,
  mensagem, status, tentativa e token; grava job, diagnóstico e liberação da trava
  na mesma transação. Contexto alterado exige revisão sem tocar estado alheio.
  Diagnóstico antigo não substitui o do turno mais novo. Falha de métricas/saúde
  após conclusão não reclassifica efeito persistido como retry.
- Focado ai-queue-finalization-focused terminou **22/22**, 26,25s (seis casos de
  finalização, sete ciclo de vida, sete escritores e dois identidade). Fontes
  conferidas: 28 hashes sem drift antes dos dois casos adicionais abaixo.
- Complemento terminal acrescentou falha transitória depois do claim e falha de
  métricas depois da conclusão: **8/8**, 26,51s no arquivo completo de finalização.
  Mensagens de erro nesse log são falhas INJETADAS identificadas com `qa injected`,
  não incidentes reais. Sessão **13725 encerrada**: runtime/tipos/lint **0/0/0**,
  recibo ai-queue-finalization-terminal-receipt-20261022. Snapshot final de 28
  arquivos em ai-queue-finalization-final-snapshot-20261022: única mudança desde
  o snapshot do focado é o arquivo de teste com os dois cenários adicionais;
  fontes de produção e fixtures históricas preservadas sem drift.
- Limites: não há prova HTTP autenticada integral dessa rota nem publicação.
  Esta unidade protege gravação/finalização; não afirma que todos os efeitos do
  agente já recebem a posse do claim. Próxima ação: reproduzir recuperação de `processing` após queda,
  conciliando efeitos por recibos e revalidando posse antes das ações. Depois
  confrontar quatro contratos originais de B, sem repetir unidades encerradas.

- Baselines ai-turn-identity: 0/2 puro e 0/2 pelo enqueue real. Pares válidos
  distintos colidiam por concatenação/pontuação, substituindo metadados do turno.
  Projeto de QA isolado, sem handler/modelo/provedor/cliente real.
- Chave nova usa hash da tupla exata tenant/chat; cálculo legado é preservado
  separadamente. Novo conversation-turn-store faz leitura compatível apenas
  quando tenant/chat persistidos correspondem exatamente. Admissão de outra
  conversa não copia nem altera espelho legado de proprietário distinto.
- Fila cria/migra coordenador novo com locks anteriores, mantendo espelho próprio;
  claim também respeita lock legado vivo. Release não remove lock legado de
  outro job. Validação impede sobrescrever job com mesma chave e outra origem.
  Outbox/handoff consultam o mesmo leitor, preservando precondição da referência
  realmente lida. Ainda não é aprovação de recuperação/consumidores mistos.
- Focado inicial ativo **sessão 79514**, log/recibo
  ai-turn-identity-focused-20261022, com testes puros, enqueue real e regressão
  da fila. Não editar suas fontes enquanto ativo; estáticos ainda não executados.
- ai-turn-legacy.emulator.mts preparado separadamente, não incluído no focado:
  v1 genuíno/replay, lock legado vivo, produtor v1 mais novo depois de raiz
  canônica e legado estrangeiro recusado. Próxima ação: terminal do focado e
  executar esses casos; leitor atual ainda prioriza canônico existente, o que
  precisa ser confrontado com atualização posterior v1 antes de aprovar unidade.
  Depois regressão dos consumidores reais de turno e estáticos proporcionais.
- Antes desta implementação, drift do snapshot waiting encontrou mudanças
  concorrentes em firestore.indexes.json e tenant-data-deletion.ts (20:25 local).
  Preservadas. Provas anteriores continuam por hash; não aprovam automaticamente
  essa nova versão compartilhada. Incluir os quatro casos waiting de ciclo de
  vida na validação integrada atual, sem repetir todos os 137 casos por isso.
  Teste alheio crm-activity-page estava ativo e suas fontes foram preservadas.

### Capacidade, progresso e concorrência do watchdog — 22/10

- Baseline waiting-progress-baseline-20261022: 0/3 em 51,50s. Reproduzidos
  catálogo truncado em 600 conversas, ocorrência concluída ocupando limite e
  primeira regra CRM removendo elegibilidade de outra regra do mesmo intervalo.
- Catálogo agora pagina em blocos de 100 e intercala empresas por espera;
  limite operacional continua 60 (máximo 200), consumido por admissão pendente,
  não por conversa já concluída/inelegível. Falha de acesso isola aquela empresa.
- Admissão v4 congela juntas as regras elegíveis antes dos efeitos. Recibos,
  executor, quota e outbox existentes são reutilizados. Fences por regra preservam
  consumidores anteriores; v3 genuíno continua retomável sem promoção de versão.
  Regras novas ou que amadurecem depois podem formar outro lote sem repetir as
  já admitidas. Mais de 120 regras novas recusa o lote inteiro antes de efeitos.
- Focado inicial 3/3 em 350,90s. Emulador respondeu lentamente; serviço existente
  foi preservado, sem ampliar timeouts/leases. Não é aprovação de desempenho.
  Integrado de espera seguinte 31/31 em 217,74s: paginação atravessando sete
  páginas, concorrência, elegibilidade posterior, recuperação, integridade,
  legado e consumidores v2/v3 reais preservados como fixtures históricas.
- Bateria final ampliada em execução: processo node 1396 (pai 13412), log
  waiting-progress-final-20261022.log, recibo terminal homônimo. Inclui duas
  mensagens ordenadas, envio junto de tarefa e recusa de lote excessivo sem
  bloquear outra conversa, além das regressões integrais de entrega/IA/social.
  Snapshot waiting-progress-final-snapshot-20261022.json; não editar fontes nem
  duplicar execução enquanto ativa. Tipos/lint serão executados após runtime.
- Índice local chats(tenantId,lastClientMessageAt) acrescentado, sem publicação.
  Unidade ainda não encerrada; B segue aberta para ciclo de vida/retenção das
  novas origens e cruzamento dos quatro contratos originais, sem iniciar C.
  Zero modelo pago, provedor real, conversa real ou alteração de produção.
- Observação da bateria ainda ativa: dois casos adicionais de mensagens com
  regras irmãs reprovaram (envio+tarefa e dois envios); diagnóstico detalhado
  aguarda recibo terminal. Não aprovar a unidade pelos 31 casos anteriores.
  Paginação, concorrência, regra posterior e lote excessivo passaram nesta rodada.
  Índices JSON válidos; duplicação localizada é messages(tenantId,chatId,createdAt),
  fora do índice chats desta unidade; preservada para não alterar trabalho alheio.
  Fixture v3 confere SHA 92d49de0690f67f7e066c0f7463f5e21cf453c893c13aab93692f353d2bef9b8.
- Bateria terminal 96/98 em 521,02s, exit=1 (processo 1396 encerrado),
  zero skips. Primeira reprovação é contagem de tarefas após envio e replay
  (2 vs 1), ainda sem prova de que a segunda tarefa vem da mesma regra;
  observador CRM também pode produzir tarefa legítima. Segunda é job dead_letter
  vs completed no caso com dois envios. Não atribuir causalidade sem diagnóstico.
  62 fontes conferidas drift=0 antes de acrescentar somente mensagens de
  diagnóstico às asserções, sem mudar exigência/comportamento de teste.
- Diagnóstico focado ativo sessão 37139, processo 7552/filho 7772, arquivo
  waiting-progress-message-diagnostic-20261022.log e recibo homônimo. Ainda sem
  resultado; não duplicar nem editar testes/módulos importados. Emulador Java
  9164 preservado. Próximo: obter resultado, distinguir tarefa do observador de
  repetição da regra e corrigir autoridade de mensagens conforme evidência;
  depois estáticos e verificação proporcional. B/unidade continuam abertas.
- Diagnóstico encerrado 0/2 em 248,33s: tarefa adicional tem origem
  crm_automation, ID crm_observation_task, título de espera de resposta; efeito
  tenant_automation manteve um único stage_effect. Teste agora exige esse mesmo
  ID e automationId, além da tarefa distinta do observador existente. Expectativa
  anterior de contagem total era incorreta; não remover observação para aprovar.
  Reprovação real de dois envios: STAGE_AUTHORITY_BLOCKED com
  CRM_STAGE_WAITING_SOURCE_REVOKED após confirmação do primeiro envio.
- Correção em validação: confirmação persiste agentAcknowledgedAt na mensagem
  e lastAgentMessageId na conversa, atomizados com o timestamp operacional.
  Autoridade waiting reconhece ACK próprio somente por mensagem, timestamp
  imutável e job da mesma empresa/conversa/raiz/lead/regra. Não usa updatedAt
  mutável como prova nem aceita apenas ponteiro/tail. Caminho enfileirado
  anterior permanece separado e revogações externas continuam exigidas.
- Focado integridade ativo sessão 56882, log/recibo
  waiting-progress-ack-focused-20261022. Snapshot ack-snapshot de 63 fontes.
  Sem editar fontes durante execução; ainda faltam resultado, negativos após
  ACK, estáticos e regressão proporcional do componente compartilhado.
- Focado ACK encerrado 7/8 em 146,05s: fonte de ACK passou, mas o segundo envio
  revelou STAGE_AUTOMATION_ROUTING_REVOKED. Primeiro envio preenche espelho
  chat.channelPhoneNumberId com o número do canal já congelado. Comparação agora
  preserva digests existentes e aceita somente ausência/valor exatamente igual
  ao número daquele canal; troca efetiva de número/canal continua revogando.
- Focado ACK+rota sessão 58578: 12 cenários já emitiram aprovação, aguardando
  encerramento/recibo terminal. Inclui dois envios ordenados/replay e atualização
  posterior de recibo sem mudar o timestamp de aceitação; resposta humana,
  mensagem de outra origem e número distinto bloqueiam segundo envio.
- Novo automation-waiting-trash.emulator.mts preparado, ainda não executado:
  restauração de raízes completed/ready, agendados em revisão e expurgo por
  retenção com certificado, incluindo os dois fences v4. Não altera fontes da
  bateria ativa. Próximo: terminal do focado, integrado incluindo ciclo de vida
  e regressão do ACK compartilhado, tipos/lint e hashes. B segue aberta.
- Focado ACK+rota encerrado **12/12 em 139,13s**, exit=0, zero skips.
  Nenhum timeout/lease/limite foi ampliado. Dois envios são comprovados por
  chamadas simuladas e conteúdo/ordem exatos; casos negativos têm zero segunda
  tentativa de provedor. Observador existente preservado com identidade própria.
- Integrado ampliado ativo **sessão 9104, processo node 5504**, incluindo os
  quatro casos novos de ciclo de vida e regressão de confirmação compartilhada:
  campaign-delivery-acknowledgement, whatsapp-delivery-status e chat-outbound-trash.
  Log/recibo waiting-progress-ack-integrated-20261022. Snapshot integrado de 68
  fontes (incluindo exclusão e testes novos). Tipos/lint estão encadeados depois
  do runtime no MESMO processo de shell, recibo waiting-progress-ack-static;
  não iniciar outro estático, duplicar bateria ou editar fontes enquanto ativo.
  Config waiting-progress-ack.tsconfig.json. Emuladores preservados; existe
  processo alheio de regras Firebase (10396), sem alteração de suas fontes.
- Próxima ação exata: obter recibos runtime/estático da sessão 9104, inspecionar
  reprovações e drift; fechar a unidade somente com provas atuais. Depois
  cruzamento integrado dos quatro contratos originais de B (fila/turno, entrega,
  exclusividade humana, identidade), sem repetir correções já encerradas e sem
  incluir capacidades conversacionais de C–G no gate B. Nenhuma publicação.
- Cruzamento do contrato original de identidade durante a espera: função atual
  getConversationTurnDocId concatena tenant/chat com underscore e substitui
  pontuação, sem identidade inequívoca. Novo ai-turn-identity.test.mts confirmou
  **0/2**: (qa_turn,part_leaf) e (qa_turn_part,leaf) coincidem; dois chats válidos
  chat:one/chat?one também coincidem. Ambas entradas passam validação de identidade
  existente. Baseline/recibo ai-turn-identity-baseline-20261022 preservados.
  Teste puro, sem banco/modelo/rede, separado da bateria ativa; ainda não prova
  efeito cruzado em runtime nem incidente real. Não alterar coordenador/fila/
  outbox enquanto sessão 9104 usa suas fontes. Próxima correção de identidade
  deve provar isolamento e compatibilidade de roots/locks/consumidores legados,
  não apenas trocar o formato da chave e abandonar trabalho em andamento.
- Baseline pelo consumidor real também encerrou **0/2 em 26,62s**, sessão
  23997 encerrada, log/recibo ai-turn-identity-runtime-baseline-20261022.
  Enfileirar duas mensagens válidas substituiu tenant/chat/latestMessageId
  do primeiro coordenador pelos do segundo. Projeto separado
  demo-altum-turn-identity, nenhum handler/modelo/provedor executado. Confirma
  falha local de coordenação/isolamento; não afirmar vazamento real de conversa.
- Preservados queue.ts v1 e coordenador v1 em fixtures históricas para provar
  migração/compatibilidade. Coordenador é cópia exata; fila difere somente no
  caminho do import para a fixture v1. Manifesto ai-turn-v1-fixture-source-20261022
  guarda hashes da fonte e das cópias. Ainda não há correção de runtime dessa
  unidade. Consumidores identificados: queue, chat-outbound e handoff-delivery;
  efeitos nas funções existentes (inclusive mídia/áudio) precisam ser preservados.
  Fontes da sessão 9104 seguem congeladas até runtime E estáticos terminarem.
- Sessão 9104 encerrada: integrado **134/137 em 1426,94s**, runtime=1;
  tipos=0/lint=0, recibo static em 20:02 local. Snapshot de 68 fontes drift=0.
  Todas as verificações waiting, inclusive quatro de exclusão/retenção, passaram.
  Não converter o conjunto reprovado em aprovação integral.
- Três reprovações classificadas pelo erro terminal: campanha esperava ACK de
  mensagem sem criar a conversa viva e sem manifesto de exclusão; fixture agora
  cria chat fictício depois do recibo antecipado, mantendo todas as asserções.
  Mídia e after-hook de limpeza falharam ECONNREFUSED 127.0.0.1:9199; inspeção
  de listeners confirmou armazenamento ausente. Não é falha injetada nem prova
  de regressão do envio de mídia. Faltou essa prontidão na execução ampliada;
  não repetir o lote inteiro para alteração apenas da fixture/infraestrutura.
- Serviço local retomado com helper existente serve-crm-local-service.cjs,
  projeto demo-altum-qa-lab, loopback 9199, node 12180/java 2852, sessão 85059.
  Bootstrap CLI próprio foi cancelado antes de iniciar serviço, substituído pelo
  helper de escopo explícito/sem download, sem reiniciar Firestore 9164 nem tocar
  armazenamento alheio 9201 (node 5212/java 2632). Readiness HTTP 200 preservada.
- Rechecagem afetada ativa **sessão 62711**: campaign-delivery-acknowledgement
  e chat-outbound-trash completos, seguida de tipos/lint da única fixture
  alterada no mesmo shell. Logs/recibos waiting-progress-ack-recheck-20261022.
  Não editar dependências nem duplicar essa execução. Próximo: resultado e delta
  final; depois corrigir a colisão de coordenação já reproduzida, com compatibilidade.
- Rechecagem encerrada **19/19 em 369,90s**, runtime=0; tipos=0/lint=0
  da fixture, recibo final 20:20 local, sessão 62711 encerrada. Mídia após
  exclusão e after-hook de armazenamento agora aprovados com serviço pronto;
  campanha preserva read antecipado e mesmo recibo entre entrega/mensagem.
  Delta frente ao integrado identifica SOMENTE a preparação da conversa fictícia
  nesse teste; nenhum código de aplicação mudou após o integrado de 137.
- Unidade waiting/capacidade/ACK/ciclo de vida encerrada localmente para os
  cenários descritos: preservar integrado 134/137 reprovado (fixture+infra),
  rechecagem 19/19 e ambos estáticos 0/0, sem apresentar soma como bateria única.
  Snapshot final de 68 fontes e delta documentados. Nenhum critério/timeout foi
  reduzido, nenhum provedor real/modelo pago/piloto/publicação executado.
  B permanece aberta: próxima implementação é identidade da coordenação de
  turnos já reproduzida em 0/2 puro + 0/2 enqueue real, preservando legado/locks,
  seguida dos quatro contratos integrados. Não repetir esta unidade encerrada.

### Validação local encerrada — retomada interna de waiting_for_reply — 22/10

- Baseline 0/1 em 25,15s: tarefa real foi gravada, nota seguinte falhou por fault
  de QA e watchdog posterior perdeu a nota. Recibos waiting-recovery-baseline-20261022
  preservados. Focado após integração 1/1 em 19,37s, sessão 44020 encerrada.
- Intervalos de espera novos recebem runtimeProtocolVersion=3, mantendo hash
  exato e fence legado transacional. Causa é o intervalo persistido na conversa,
  não uma mensagem de cliente fabricada. Guardas verificam gerações de cliente,
  conversa e contato, ausência de resposta, instante de espera, SLA/canal e acesso.
  Receita específica da regra congelada na admissão, incluindo baseline CRM
  quando aplicável. Raízes antigas não são promovidas a recibos novos.
- Reutiliza runner de sinais/checkpoints/efeitos/quota/outbox/agenda; não cria
  executor paralelo. Watchdog e processamento periódico retomam o mesmo registro.
  Mensagens novas desse caminho usam source waiting nos recibos; mensagens antigas
  conservam executor/identidade próprios. Erro de admissão conta failed e deixa
  log com código restrito, sem copiar erro bruto ou impedir outra espera elegível.
- Integrado em execução na sessão 91414: 8 cenários de retomada/guards/periódico,
  catálogo, legado, catálogo global isolado, entrega completa, sinal IA e social.
  Snapshot waiting-recovery-snapshot-20261022.json. Não editar fontes ou duplicar
  bateria enquanto ativa. Tipos/lint ainda não executados para esta versão.
  Próximo: obter resultado, corrigir reprovações, provar v2 canônico/consumidores
  mistos, estáticos e drift. B/release seguem abertos; sem provedor real/modelo pago.
- Preparados, ainda não executados: automation-waiting-v2.emulator.mts e fixture
  waiting-runtime-v2.mts, claim histórico extraído da versão anterior de automations
  (SHA aa923251625ddf293c7e4eda474c6892e6298194404cadc99ede8292fe422547).
  Casos claimed/done/error canônicos v2 e v2 recusando v3 parcial após lease;
  não fabricam v2 por downgrade de recibo novo. Não incluídos no snapshot de 57
  fontes nem na bateria 91414 que já estava ativa; validar separadamente depois.
- Revisão de código durante a espera identificou hardening ainda necessário antes
  de aprovar a unidade: validar waitingSince do payload contra waitingKey e exigir
  exatamente o plano da regra para não aceitar manifesto esvaziado/corrompido.
  Acrescentar testes próprios e corrigir só após terminar a bateria atual, sem
  editar módulo importado por processo ativo. Não considerar replay positivo
  suficiente para corrupção/retencão/capacidade. Limite de 600 conversas continua
  pendência conhecida e não foi ampliado neste pacote.
- Integrado encerrado 77/78 em 517,38s, final_exit=1, sessão 91414 encerrada.
  Única regressão: watchdog aguardava executed=1 no envio, retornou 0 porque
  enqueue atualiza lastAgentMessageAt pelo patch operacional já existente. Guard
  de waiting confundia seu próprio comprovante com resposta externa e bloqueava
  finalização do run. Não é falha de provedor real e não houve envio incidental.
  Demais 77 casos, incluindo 8 de recuperação e 6 revogações, passaram nesse
  snapshot; não declarar bateria integral aprovada. Novo integrity.emulator.mts
  preparado para origem própria vs resposta humana/nova mensagem, e corrupção do
  payload/plano. Baseline somente dos dois casos de corrupção em execução; fontes
  continuam congeladas até esse processo encerrar. Correção precisa reconhecer
  exatamente o próprio job/timestamp, sem liberar resposta externa pelo tailId.
- Baseline de integridade 0/2 em 39,91s, sessão 13262 encerrada: manifesto vazio
  e waitingSince adulterado podiam receber done (no segundo caso havia ação).
  Agora protocolo exige instante igual à chave, tipos temporais e exatamente o
  plano da regra/empresa/gatilho com as marcas de recibo. Plano novo é preparado
  antes da autoridade da própria admissão, não inferido durante replay.
- Enqueue próprio reconhecido apenas por job da mesma origem/regra/cliente/conversa
  e timestamp de criação igual ao timestamp operacional do chat. Novo cliente e
  resposta humana continuam revogando. Focado integridade + v2 8/9 em 32,93s:
  reprovação única era expectativa incorreta done vs completed do job de outbox;
  contrato existente confirmado em chat-outbound e testes antigos, expectativa
  corrigida sem mudar a exigência de uma chamada simulada e nenhuma duplicação.
  V2 canônico claimed/done/error intacto e claim histórico recusando v3 parcial
  passaram nessa rodada. Não atribuir aquela reprovação ao runtime de produção.
- Baseline adicional final-authority 0/1 em 11,05s, sessão 53051 encerrada:
  mudar fonte após checkpoint final, antes de confirmar a raiz, ainda marcava done.
  Runner compartilhado agora revalida autoridade na transação final; revogação
  mantém efeitos válidos anteriores e exige revisão, erro transitório não vira
  autorização nem finalização falsa. Cenário de janela temporal preservado.
- Novo integrado completo ativo 38210: 88 casos esperados (contagem real no recibo
  terminal), incluindo integridade e v2, mais regressões integrais anteriores.
  Snapshot waiting-recovery-verified-snapshot-20261022.json de 60 fontes. Config
  de tipos waiting-recovery.tsconfig.json preparada; executar tipos/lint somente
  depois dos casos de runtime, para evitar disputa de CPU durante leases.
  Não reiniciar ou editar fontes enquanto ativo. B/release não aprovados.
- Integrado completo verificado encerrado: 88/88 em 343,29s, verified_exit=0,
  sessão 38210 encerrada, zero falhas/skips. Inclui recuperação interna, 6 casos
  de integridade (inclusive confirmação final), 4 v2/mistos, catálogo/legado,
  regressão completa de entrega e amostras reais de consumidores IA/social com
  falhas injetadas/simulações. Não é avaliação de linguagem ou provedor real.
  Snapshot de 60 fontes conferido drift=0, recibo verified-drift-20261022.
  Estáticos da versão verificada em execução na sessão 32321, após runtime
  encerrar; logs e recibo waiting-recovery-verified-static-receipt-20261022.
  Não duplicar testes nem alterar suas fontes. Unidade ainda aguarda estáticos;
  B segue aberta para ciclo de vida/retenção, capacidade/concorrência e gate
  integrado, sem iniciar C ou declarar publicação autorizada.
- Estático inicial desta versão encerrou types_exit=2/lint=0 por um erro de
  genericidade somente no interceptor de teste (DocumentReference<unknown>).
  O interceptor só lê parent.id; parâmetro estreitado para essa estrutura,
  sem alterar corpo, fault ou asserções. Final types=0/lint=0, sessão 20041
  encerrada, recibo waiting-recovery-final-static-receipt-20261022.json.
  Não repetida bateria funcional por anotação apagada em runtime. Snapshot
  final de 60 fontes em waiting-recovery-final-snapshot-20261022.json;
  source-delta documenta apenas esse arquivo de teste frente ao snapshot dos
  88 casos. Reprovações de runtime/fixtures/estático anteriores preservadas.
- Esta unidade comprova os cenários listados, não fecha gate B. Próximo lote
  reunido no checkpoint do inventário existente: capacidade e concorrência do
  watchdog, incluindo janela de 600 conversas, progresso após ocorrências já
  concluídas e elegibilidade de múltiplas regras do mesmo intervalo. São lacunas
  identificadas por leitura, ainda sem nova reprodução; não afirmar incidente
  ou aprovação. Depois ciclo de vida/retenção das origens novas e cruzamento
  integrado dos quatro contratos originais de B. Não refazer unidades encerradas.

### Validada localmente — mudança de etapa produzida pelo agente — 22/10

- Conferência dos chamadores: Shopify já usa orderSource. O fallback de
  setLeadPipelineStageWithEffects é de outros providers, fora da validação desta
  rodada; não foi removido ou refeito. Caminho ativo encontrado no agente:
  commitAutomaticLeadPatch salvava etapa antes de hooks sem ocorrência causal.
- Baseline real 0/2 em 24,00s: perda de ACK após commit deixava etapa sem raiz;
  falha na criação da causa não era alcançada porque essa causa não existia.
  Logs/recibos crm-agent-stage-baseline-20261022 preservados.
- Agente agora prepara evento/ocorrência de conversa na própria transação da
  mudança, usando projector e consumidor existentes; sincronização de score não
  aplica segunda transição da mesma mensagem. Sem novo executor ou origem fictícia.
  Comportamento de inicialização sem etapa anterior permanece separado, como antes.
- Focado 2/2 em 26,78s, focused_exit=0, sessão 86221 encerrada. Prova commit
  atômico, retomada única e rollback; dados fictícios e nenhuma chamada externa.
- Integrado ampliado para sucesso/replay, trava manual, edição de origem e
  regressões de tarefas/observador em execução na sessão 39670. Há uma reprovação
  da retomada nesse integrado; ainda não diagnosticada. Estáticos na sessão 77431.
  Não repetir execução nem editar fontes desses processos enquanto ativos.
  Snapshot inicial crm-agent-stage-snapshot-20261022.json com 55 fontes.
  Não aprovar a unidade ou B com base apenas no focado. Próximo: obter diagnóstico
  terminal do integrado, corrigir causa comprovada e fechar validação proporcional.
- Continuidade: estáticos encerrados types=0/lint=0, recibo
  crm-agent-stage-static-receipt-20261022.json. Snapshot 55 fontes conferido com
  drift=0. Sessão 39670 continua viva, sem execução duplicada; erro completo ainda
  depende do relatório terminal. Regressões de tarefas e observador executadas,
  incluindo retomada de hooks/recibos, sem nova reprovação nas linhas já emitidas.
- Integrado encerrado 54/55 em 726,50s, final_exit=1. Falha única em
  processConversationStageTransition.completed, sem diagnóstico da raiz no teste
  daquela versão; não atribuir causalidade apenas à duração de 88,60s do caso.
  Teste ganhou diagnóstico de status/progresso sem mudar asserções. Repetição
  diagnóstica 5/5 em 105,31s, sessão 25741 encerrada; não apaga reprovação anterior.
- Reprodução adicional determinística: lease do próprio claim expira antes do
  primeiro hook, sem retirar origem nem executar efeito. Baseline 0/1 em 67,21s,
  sessão 5095 encerrada, lease-baseline_exit=1; consumidor movia ready/pendente
  para reconciliation_required por confundir expiração com revogação. Isso prova
  defeito próprio; não prova sozinho a causa da reprovação de timing anterior.
- Consumidor de conversa distingue LEASE_EXPIRED de SOURCE_REVOKED. Expiração
  interrompe o worker; finalização exige mesmo token, autoridade viva e
  canResumeStageHooks/recibos antes de voltar a ready. Não amplia lease, limite,
  timeout ou permissões. Origem editada continua em revisão; token de outro worker
  não pode ser sobrescrito. Testes explícitos para esses dois limites adicionados.
  Integrado agente + conversa na sessão 84046, sem estáticos concorrentes desta vez.
  Snapshot crm-agent-stage-lease-snapshot-20261022.json: 55 fontes. Próximo obter
  resultado terminal, estáticos sequenciais e verificar drift; não iniciar bateria
  duplicada. Unidade/B continuam abertas até evidências finais.
- Integrado pós-correção de lease encerrado: 44/44 em 190,20s, zero falhas/skips,
  lease-final_exit=0, sessão 84046 encerrada. São 8 casos do produtor real do
  agente + 36 do contexto/projeção/consumidor de conversa, incluindo guards,
  outbox simulado e recuperação por recibos. Não contar a bateria antiga 54/55
  como aprovada nem somar suas repetições a esse resultado. Falhas de ACK são
  injetadas em QA, não incidentes reais ou mensagens a clientes.
  Snapshot de 55 fontes conferido drift=0, recibo lease-drift-20261022.
  Estáticos finais na sessão 84840, após os casos de runtime terminarem, com
  saída/recibo crm-agent-stage-lease-static-receipt-20261022.json pendentes.
- Estático pós-lease encerrado types=2/lint=0, sessão 84840 encerrada: apenas
  acesso a leadId no retorno genérico do interceptor de QA. Estreitamento por
  `"leadId" in result` nos dois pontos, preservando fault/asserções e sem alterar
  runtime de produção. Repetição dos 3 casos de lease seguida de tipos/lint na
  sessão 43836; snapshot checked-snapshot-20261022 com 55 fontes. Não há testes
  duplicados nem alteração de fontes durante essa execução. Reprovações anteriores
  preservadas nos recibos próprios; gate B não foi aprovado por essa unidade.
- Casos pós-ajuste de tipagem: 3/3 em 203,21s, log lease-checked-20261022. Mantêm
  exigência de injeção real, uma tarefa na retomada válida e zero efeitos quando
  origem/posse muda. Não somar como cenários novos aos 44. Sessão 43836 ainda
  executa estáticos; não reiniciar pela demora ou pela ausência de nova saída.
- Final estático encerrado types=0/lint=0, runtime_checked=0, sessão 43836
  encerrada; recibo crm-agent-stage-lease-checked-receipt-20261022.json. Escopo
  tsc inclui agente, testes do agente/contexto e dependências; não é build/release
  completo. Sem publicação/modelo pago/uso real. Unidade local aprovada nesse
  recorte, B continua aberta. Próximo: reproduzir interrupção entre ações internas
  do waiting_for_reply e integrar a causa de timer com os recibos já existentes,
  sem promover runtime antigo claimed/done/error ou inventar mensagem de cliente.

### Continuação — fronteira de consumidores sociais antigos/novos — 22/10

- Baseline 0/1 em 19,36s: claim histórico v1 readmitia um evento novo após
  expiração, embora a tarefa já tivesse sido gravada e a nota estivesse pendente.
  Consumidor v1 copiado literalmente do source antes da alteração para fixture
  social-preparation-v1.mts, com SHA256 da origem; não usa downgrade de recibos.
  Log/recibo social-preparation-mixed-baseline-20261022 preservados.
- Preparos novos usam preparationProtocol=2. O consumidor histórico recusa esse
  valor antes de alterar posse/efeitos. Consumidor atual aceita somente v1/v2 e
  conserva versão do registro existente; não converte v1 em v2 na retomada.
  Efeitos genéricos novos exigem v2 + marcador de admissão. Legado v1 conserva o
  fluxo específico de resposta, mas continua sem autoridade nova para efeitos
  genéricos. Não altera a identidade/protocolo dos envios já aceitos.
- Bateria social completa 41/41 em 156,36s, final_exit=0, sessão 72132 encerrada:
  consumidor histórico, legado, efeitos públicos, revogações e respostas sociais.
  Repetição do caso misto ampliada para retrySocialAutomationLog: 1/1 em 34,89s,
  retry_exit=0, sessão 15497 encerrada; v1 não altera updateTime/posse e o atual
  retoma nota e finalização manual com tarefa única. Não contar repetição como
  cenário adicional. Limpeza da fixture de resposta inclui novos jobs causais.
- Estático inicial types=2/lint=0: erro apenas no tipo sobrecarregado do interceptor
  Transaction.update; estreitado por propriedade existente, sem mudar a injeção
  ou asserções. Final types=0/lint=0, sessão 32500 encerrada; recibo
  social-preparation-mixed-final-static-receipt-20261022.json. Snapshot final
  social-preparation-mixed-final-snapshot-20261022.json, 50 fontes, drift=0.
  Falhas injetadas são QA e não incidentes reais; testes de provedor são simulados.
- Fronteira v1/v2 social aprovada localmente neste recorte, não gate B inteiro
  nem autorização de release. Sem modelo pago/publicação/piloto/uso real.
  Próxima unidade: reproduzir fallback de stage-transition sem origem causal e
  fechar esse caminho; retomada interna do watchdog, retenção e gate integrado
  B continuam pendentes. Preservar capacidades existentes e não iniciar C antes B.

### Continuação — causa própria para eventos sociais públicos — 22/10

- `social/service` chamava message_received sem mensagem persistida. Baseline
  inicial 0/2 inválido por funil da fixture com duas etapas; preservado. Com
  funil válido, caso de agendamento genérico privado a partir de comentário
  público reprovou; o caso de ACK atingia tarefa de criação anterior à automação
  e não comprova perda causal naquele ponto. Integrado 18/19 preservado por essa
  injeção; fixture refinada para source=tenant_automation, sem reduzir asserções.
- Extraído o executor de sinais do arquivo da IA para automation-signal-execution;
  IA e evento social reutilizam claims/checkpoints/recibos/quota/retomada, cada
  origem com autorização própria. Social congela planos e causa do log social
  autenticado: conta/canal, ator/comentário, gerações de cliente/conversa e opt-out,
  regras e janela atual. Não fabrica mensagem de cliente a partir de system/public.
  Resposta social continua no executor específico existente; send_message genérico
  público é recusado antes de agenda/DM. Não libera mensagem a novo seguidor.
- Focado 2/2, guards 6/6 em 58,72s e compatibilidade inicial 61/61 em 168,92s.
  Guards cobrem canal/origem/configuração/opt-out/geração e lease expirado com
  tarefa editada preservada e quota única. Tipos iniciais 2 erros de integração,
  corrigidos (contexto explicitamente tipado e tenantId nos settings); lint 0.
- Baseline adicional legado 0/1: preparo antigo sem recibos podia receber nova
  execução genérica. Agora somente novos logs recebem automationEventProtocol=1;
  antigos geram ocorrência em reconciliation_required, sem planos/novos efeitos,
  e conservam fluxo específico de resposta. Não atualizar marca de legado em replay.
  Bateria final com legado/IA/criação/respostas 70/70 em 315,43s, final_exit=0,
  sessão 17204 encerrada. Tipos/lint completos dos arquivos/testes alterados
  0/0, sessão 70922 encerrada. Recibos social-event-causal-{final,admission-static}-
  receipt-20261022.json. Snapshot social-event-causal-snapshot-20261022.json,
  48 fontes/dependências, drift=0. Reprovações e correções de fixture preservadas;
  simuladores de resposta não são prova de envio/qualidade em loja real.
- Pendência material antes de publicar: prova de consumidores mistos, incluindo
  impedir handler social antigo (preparationProtocol=1) de readmitir efeitos
  genéricos novos após perder lease. A marca nova sozinha não fecha esse gate.
  Não publicar ou aprovar a família por testes só do consumidor novo. Fonte de
  etapa genérica e retomada do watchdog também continuam abertas. Nenhum custo
  de modelo, cliente real, mensagem incidental, release ou aceite final.
  Próxima ação: versionar/reproduzir recusa do preparo novo pelo consumidor antigo
  e confirmar retry/resposta social com os dois contratos; manter legacy v1 sem
  autorização retroativa. Incluir limpeza de jobs das fixtures antigas de resposta
  social na validação desse pacote. Não declarar B nem publicação aprovados.

### Continuação — catálogo e identidade de waiting_for_reply — 22/10

- Baseline 0/2 em 16,41s: regra elegível depois de configurações alheias era
  omitida e IDs longos de duas regras colidiam no runtime truncado de 240 chars.
  Logs/recibos waiting-catalogue-baseline-20261022 preservados.
- Watchdog agora consulta/pagina apenas waiting_for_reply por ID, tanto no recorte
  de empresa quanto no global. Mantém limite existente de conversas por execução,
  sem trocar UI/listTenantAutomations por conveniência. Runtime novo usa hash dos
  componentes completos. Trava legada é escrita na mesma transação quando ainda
  não existe, impedindo consumidor antigo de repetir; colisão legada de outra
  ocorrência não é sobrescrita nem suprime a identidade nova. Não reabre runtime
  histórico exato, inclusive erro/claim incerto.
- Integrado 2/2 em 15,63s; global 1/1 em 18,22s, em projeto exclusivamente fictício
  demo-altum-waiting-catalogue para não executar watchdog sobre trabalho alheio.
  Tipos/lint 0/0, sessão 24516 encerrada. Legado 3/3 em 9,69s, legacy_exit=0,
  76775 encerrada: claimed/done/error antigos permanecem intactos e não criam
  efeitos. Regressão executor/inbound 60/60 em 161,23s, compatibility_exit=0,
  29187 encerrada. Total da unidade 66/66 (2 recorte + 1 global + 3 legado + 60
  regressão). Lint adicional legado aprovado, 44117 encerrada. Índice explícito
  automations(tenantId,trigger) adicionado ao manifesto local, JSON válido e
  contrato sem duplicatas; não foi publicado/provisionado por esse teste.
  Snapshot waiting-catalogue-final-snapshot-20261022.json, 40 fontes, drift=0.
  Logs/recibos waiting-catalogue-* preservados. Não aprova retomada de ações
  internas parcialmente executadas do watchdog: esse contrato segue pendente.
- Auditoria de chamadores ainda encontrou message_received sem sourceMessageId
  em social/service.ts e fallback genérico de stage-transition.ts sem ocorrência
  causal. São próximas lacunas concretas de B, não afirmar duplicação/incidente
  real sem reprodução nem apagar funcionalidades para fechar gate. Retenção e
  compatibilidade mista precisam prova integrada. Sem publicação/uso real/modelo.

### Continuação — paginação inbound e ciclo de vida do sinal — 22/10

- Baseline de catálogo 1/2 em 25,90s: mais de 120 configurações totais bloqueavam
  uma regra válida de mensagem mesmo quando as outras pertenciam a outro evento.
  Overflow elegível já era recusado. Log/recibo inbound-catalogue-baseline-
  20261022 preservados. Corrigido usando o visitante paginado transacional já
  existente; cada plano mantém seu snapshot/updateTime para o fence original.
  Limite de 120 continua aplicado ao conjunto elegível, nunca à primeira amostra.
  Integrado 2/2 em 20,74s, integrated_exit=0.
- Controle histórico que rejeitava 121 regras desativadas ajustado para rejeitar
  121 regras elegíveis, preservando transação sem admissão/efeito e zero transporte.
  Caso positivo separado prova que regras alheias não truncam o catálogo. Não
  aumentar limite, prazo ou reduzir contagem para aprovar.
- Ciclo de vida da origem ai_next_action 3/3 em 34,89s, trash_exit=0: exclusão de
  cliente/conversa reúne raiz e recibos; restauração mantém recibo concluído e
  tarefa única, mas agenda pendente exige revisão e conserva prazo. Mensagem/
  contexto restaurados não autorizam o evento antigo. Expurgo remove cópias sem
  reativar tarefa. Sem alterar runtime da lixeira: contrato existente comprovado
  também para a origem nova, com dados fictícios e efeitos externos proibidos.
- Compatibilidade integral automation-message-delivery 58/58 em 136,44s,
  compatibility_exit=0, sessão 48186 encerrada; tipos/lint 0/0, 28929 encerrada.
  Total funcional da unidade 63/63 (2 catálogo + 3 ciclo de vida + 58 regressão).
  Snapshot inbound-catalogue-snapshot-20261022.json, 36 fontes/dependências,
  conferido sem drift. Logs/recibos inbound-catalogue-* e ai-signal-trash-*
  20261022 preservados; baseline 1/2 não apagado nem contado como aprovação.
  Sem build/publicação/modelo pago/uso real. B continua aberta. Próxima ação:
  conferir catálogo de waiting_for_reply e consumidores sem origem causal na
  auditoria finita de saída B; listTenantAutomations ainda tem limit(120), fora
  das admissões inbound agora paginadas. Não declarar paginação de todo o motor
  concluída. Retenção e compatibilidade de consumidores mistos seguem gates.

### Continuação — identidade causal de ai_next_action — 22/10

Estado mais recente: identidade/retomada do sinal testadas localmente, 17/17 em
97,16s (boundaries_exit=0, sessão 19505 encerrada). Corrigidos também dois defeitos
reproduzidos em baseline 0/2 (16,45s): indisponibilidade na consulta da política
era tratada como revogação; contadores diziam executar um evento vazio/repetido.
Falha de transporte agora propaga e mantém ready/attempts=0 antes do claim;
revogação confirmada continua bloqueando. Retorno usa contagens do executor e
replay informa zero novas execuções. Lote 14/14 em 90,45s antes dos três controles
finais; tipos com testes/agente/dependências e lint 0/0 (sessão 4366 encerrada).
Três controles adicionais provam concorrência inicial com efeito/quota únicos,
recusa de outra decisão sobre o mesmo evento e invalidação ao recriar mensagem.
Compatibilidade anterior 48/48 permanece evidência da versão antes do ajuste
local de política/contadores; não reapresentada como bateria ampla dessa revisão.
Snapshot final ai-signal-policy-counters-snapshot-20261022.json, 33 fontes,
drift=0. Lint final das três novas asserções aprovado, exit=0 (8532 encerrada);
recibo ai-signal-causal-boundaries-lint-receipt-20261022.json. Lint anterior
pendente encerrou com 0, recibo ai-signal-causal-final-receipt-20261022.json.
Sem publicação/modelo pago/efeito externo/aceite real. B continua aberta.
Próxima unidade delimitada: validar exclusão/restauração/retenção da nova origem
e fechar paginação das admissões inbound já identificada; depois auditar gate B
contra repetição/restart/efeito incerto/identidade/controle humano. Não ampliar
funcionalidades da fundação para substituir a passagem C→G exigida pela missão.

- Baseline 0/4 em 312,18s: repetir a mensagem duplicava tarefa; elegibilidade
  vazia não era preservada; mensagem estrangeira não era validada; send_message
  adiado criava agenda antes da recusa existente do executor imediato. Não há
  prova de envio externo nessa falha: o executor imediato já recusava o gatilho.
  Log/recibo ai-signal-causal-baseline-20261022 preservados, dados fictícios.
- Nova ocorrência causal no jobs existente vincula sinal à identidade do evento
  de entrada, mensagem/versão, geração de conversa/cliente e contato inequívoco.
  Decisão e conjunto completo de regras elegíveis são congelados antes dos
  efeitos, inclusive vazio, sem permitir nova decisão na repetição do evento.
  Executores/checkpoints/recibos/quota existentes são reutilizados; não cria
  serviço/fila paralela. As duas chamadas do agente propagam sourceMessageId.
  Origem de sinal não registra aprendizado ou conversão; mensagens são recusadas
  antes de agendar. Gatilhos antigos sem causa não recebem autorização inferida.
- Integrado inicial 4/4 em 110,26s, integrated_exit=0. Restam controles de retomada,
  revogação, agendados internos, limites e compatibilidade do executor compartilhado;
  lint/typecheck em execução. Não aprovar a família nem B com esses quatro casos.
  Fontes preservadas durante execução. Nenhum modelo pago, cliente real ou envio.
- Continuidade em validação: controles adicionais no arquivo separado
  automation-ai-signal-guards.emulator.mts (sessão 87877, processo de teste 13296/
  filho 5772 confirmado ativo): perda de ACK após tarefa, regra/mensagem/recibo
  revogados, tomada humana, pausa explícita, lease expirado e agenda interna.
  Lint da implementação sessão 80638/processo 2584 e npm run typecheck sessão
  74561/processo 7648 confirmados ativos, sem recibo final. Não duplicar nem
  editar fontes durante essas execuções. Próxima ação é ler os mesmos handles/
  recibos e corrigir reprovações; pausa aiEnabled=false é critério obrigatório,
  não aprovar apenas por bloquear humanOwnerUserId. Compatibilidade ampla ainda
  pendente e não deve ser inferida do integrado inicial. Estado implementando/
  validando, B aberta, sem publicação.
- Primeiros guards 1/8 preservados: injeção genérica em jobs atingia criação da
  nova ocorrência, antes do efeito. Fixture agora admite o evento primeiro e
  interrompe o recibo da tarefa, mantendo todas as asserções de efeito.
  Pausa explícita reproduzida separadamente 0/1: aiEnabled=false ainda retomava;
  autoridade corrigida para vetar tanto pausa quanto posse humana.
  Final funcional 12/12 em 101,02s, sem reduzir timeouts/contagens; lint final
  aguardando recibo. npm run typecheck anterior ao veto booleano passou (exit=0),
  e checagem final inclui também os dois novos testes e dependências do agente.
  Compatibilidade ativa sessão 34829; testes novos encerraram, mas fontes usadas
  por lint/tipos/compatibilidade continuam preservadas. Próxima revisão deve
  conferir classificação de indisponibilidade da política e retorno de contadores
  do adaptador, além das provas finais; não confundir 12/12 com família encerrada.
- Compatibilidade concluída 48/48 em 199,99s, compatibility_exit=0, sessão 34829
  encerrada: produtores de ingresso, classificadores, manual e criação inteiros.
  Tipos finais incluindo agente/testes/dependências aprovados, final_types_exit=0,
  sessão 94845 encerrada. Total funcional desta versão 60/60 (12 novos + 48
  compatibilidade); reprovações anteriores preservadas, sem somar repetições.
  Snapshot de 33 fontes em ai-signal-causal-snapshot-20261022.json, drift=0.
  Lint inicial da implementação aprovado (80638 encerrada); lint final do veto e
  guards ainda ativo na sessão 56384/processo 6584, confirmado sem término.
  Não reiniciar nem editar fontes até confirmar término. Unidade permanece em
  validação: após recibo, revisar catch da política para indisponibilidade não
  virar revogação e contadores do adaptador, depois controles de geração/decisão,
  concorrência/capacidade/retenção e gate de migração dessa nova origem. Sem
  publicação/modelo pago/uso real. B e objetivo geral continuam abertos.

### Continuação — conversa, criação e finance_paid — 22/10

- Reprodução dedicada 0/5 em 225,29s: tarefa com confirmação perdida bloqueava
  restante das três origens; conversa também bloqueava após aprendizado/trilha
  já confirmados. Log/recibo causal-occurrence-recovery-baseline-20261022
  preservados; falhas QA injetadas em dados fictícios, sem incidente de cliente.
- Consumidores de conversa, ingresso e pagamento passam a reutilizar runner,
  checkpoints e perfil de recibos existentes. Conversa conserva os hooks
  autorizados de etapa; criação/finance_paid/billing recebem somente automations,
  com tipo vinculado no fingerprint. Não transforma stage_only em finance_paid
  nem abre nova automação para legado. Mantém autoridade da mensagem/contexto,
  evento de criação, ator/permissão e pagamento/ledger em cada executor original.
- Casos de retomada, tarefa editada, concorrência, revogação e lease expirado
  adicionados nas três suítes; conversa inclui interrupção após aprendizado e
  trilha. Contagem por origem e quotas precisam permanecer iguais no replay.
  Integrado 14/14 em 174,62s, integrated_exit=0 (98056 encerrada); tipos escopados
  e lint 0/0 (76267 encerrada). Compatibilidade integral dos três arquivos 89/89
  em 392,25s, compatibility_exit=0 (91827 encerrada); inclui os 14 casos novos,
  não somar repetições como casos distintos. Logs/recibos causal-occurrence-
  recovery-{baseline,integrated,static,compatibility}-20261022 preservados.
- Resolvido o preparo da checagem geral sem excluir fontes ou alterar tsconfigs:
  next-env.d.ts gerenciado pelo Next importava tipos da prévia QA; exclusão do
  diretório não resolveria esse import explícito (relatório de entradas preservado).
  Executado o comando completo do projeto npm run typecheck, que inclui next
  typegen e regenerou referências canônicas. Resultado final exit=0, sessão 48541
  encerrada, recibo causal-occurrence-recovery-full-typecheck-receipt-20261022.json
  com hash do next-env gerado. Não editar arquivo gerado manualmente; falhas
  anteriores de checagem direta continuam registradas como histórico.
- Snapshot de 28 fontes/dependências conferido com drift=0. Implementado/testado
  localmente, sem build/publicação/modelo pago/ação externa ou prova em uso real.
  B continua aberta. Próxima unidade: reproduzir a automação ai_next_action sobre
  a mesma mensagem; dois produtores atuais não propagam identidade causal ao
  executor. Preservar recusa de envio nesse gatilho e não usar resposta da IA
  como evidência de aprendizado/conversão. Demais efeitos manuais, legado,
  retenção/capacidade, migração/concorrência e gates B continuam pendentes.

### Continuação — automação da decisão manual de etapa — 22/10

- Baseline 0/2: recibo da tarefa existia, mas a confirmação perdida impedia a
  nota restante e a retomada de posse expirada; log/recibo manual-receipt-
  recovery-baseline-20261022 preservados. Falha QA injetada após commit local.
- Consumidor manual agora reutiliza checkpoints, runner e perfil de recibos
  existentes. Plano de hooks contém somente automations, com fingerprint do
  tipo manual; não acrescenta aprendizado/trilha/conversão a essa ocorrência.
  Nova admissão pode retomar ações comprovadas com limite de três tentativas;
  raiz antiga ou prova removida continua em conciliação. Autoridade manual,
  evento original, ator, permissão precisa, funil e etapa travada revalidados.
- Controles adicionados para efeito parcial, tarefa editada, concorrência,
  evento/decisão/capacidade/recibo/progresso removidos e posse expirada.
  Caso legado conserva revisão com plano v1 congelado de fato, sem remover provas.
  Integrado 27/27 em 172,88s, integrated_exit=0, sessão 23665 encerrada;
  inclui todos os controles anteriores da família. Lint=0/types=2, sessão 80264
  encerrada: arquivo gerado concorrente .qa-artifacts/next-inbox/dev/types/
  routes.d.ts contém cauda duplicada/inválida em 531–551; fonte original preservada,
  hash/diagnóstico no recibo manual-receipt-recovery-external-diagnostic-20261022.
  Não atribuir erro ao consumidor nem declarar typecheck geral aprovado.
  Checagem adicional escopada das duas fontes e dependências aprovada (exit=0),
  sessão 99953 encerrada, sem alterar tsconfig.release ou remover o diagnóstico
  geral. Arquivo gerado permaneceu com o mesmo hash; repetir a mesma checagem
  geral sem mudança seria falha conhecida, não nova evidência.
  Compatibilidade seletiva de pedidos/financeiro/aprovação 27/27 em 239,98s,
  compatibility_exit=0, sessão 1853 encerrada. Rotas autenticadas de perfil/etapa
  5/5 em 119,90s, routes_exit=0, sessão 61895 encerrada. Total funcional desta
  unidade 59/59, sem contar baseline 0/2. Logs/recibos manual-receipt-recovery-*
  20261022 preservados, snapshot de 24 fontes/dependências drift=0.
  Capacidade implementada e testada localmente; checagem geral de tipos segue
  reprovada externamente, sem build/publicação/modelo pago/uso real. B aberta.
  Próxima unidade: estender retomada causal a conversa, ingresso e finance_paid
  conforme seus hooks efetivamente autorizados; legado, retenção/capacidade,
  demais efeitos manuais e gates B continuam pendentes antes de C.

### Continuação — retomada do próprio budget_approved — 22/10

- Baseline dedicado 0/4 em 15,09s: confirmação perdida após tarefa/tag/agenda
  ou na aprovação com etapa manual impedia completar a nota restante.
  approval-receipt-recovery-baseline-20261022.log/recibo preservados.
- Primeira implementação admite approvalReceiptRecoveryProtocol=1 somente no
  primeiro congelamento de planos hook v2 com todas as ações cobertas por recibos
  existentes. Retoma a fase de aprovação com as mesmas identidades, quota e
  autoridade transacional; teto de três tentativas da raiz. Não cria fila/run
  paralelo, não reabre manifesto histórico e não repete hooks de etapa concluídos.
- Legado nos controles passa a congelar manifesto v1 real antes de executar,
  preservando revisão após efeito incerto, sem apagar/rebaixar provas modernas.
- Integrado inicial 8/9 em 42,66s: falha do caso agendado porque ações sem ordem
  explícita são normalizadas por espera; a nota vinha antes da agenda. Corrigir
  a ordem da fixture, mantendo comparação de manifesto/quota e unicidade.
  Demais proteções de configuração/proposta/recibo/header e lease expirado passam.
  Ordem explícita corrigida na fixture, sem reduzir asserções. Integrado final
  10/10 em 57,21s, final_exit=0/lint=0, sessão 31252 encerrada; inclui teto de
  três tentativas, sem quarta execução/quota adicional ou repetição da tarefa.
  Tipos/lint gerais desta unidade aprovados (0/0), sessão 50190 encerrada.
  Recibos approval-receipt-recovery-{final,static}-receipt-20261022.json.
  Compatibilidade integral de propostas/candidatas 121/121 em 527,36s,
  compatibility_exit=0, sessão 14929 encerrada e recibo próprio preservado.
  Total final desta unidade 131/131 (10 recuperação + 121 compatibilidade);
  não inclui baseline 0/4 nem integrado reprovado 8/9. Snapshot de 22 fontes/
  dependências em approval-receipt-recovery-snapshot-20261022.json, drift=0;
  fontes preservadas durante a bateria. Aprovado localmente nesse recorte,
  sem publicação, build, modelo pago, ação externa ou prova em uso real.
  B continua aberta: próxima unidade é reproduzir retomada parcial da automação
  de mudança manual de etapa, aproveitando o executor compartilhado sem adicionar
  hooks de aprendizado/conversão que essa ocorrência não autoriza. Depois
  conversa/intake/finance_paid, legado/retenção/capacidade e gates completos B.

- Baseline 0/10 em 13,33s: perda de confirmação de uma ação ou da conclusão de
  um run deixava a raiz inteira em revisão e impedia os efeitos restantes.
  stage-run-recovery-baseline-20261021.log e recibo preservados. Falhas
  QA_SHARED_STAGE_HOOK_ACK_LOST/QA_STAGE_RUN_COMPLETION_ACK_LOST injetadas em
  pedidos Shopify fictícios, não incidentes de cliente.
- Reutilizado o perfil de capacidades de recibos já provado pelo ingresso v4:
  tarefas/follow-up/pendência humana/notas, tags/prioridade/etapa, outbox e
  identidade/manifesto dos agendados. A mesma identidade de ação/slot/agenda,
  prazo e reserva de quota são preservados; não cria fila nem provedor paralelo.
- Nova admissão usa hook v2 e stageRunRecoveryProtocol=2. Runs novos registram
  protocolo/contador próprios e só retomam com planos, origem, acesso, quota e
  recibos revalidados pelos executores existentes. Teto de três tentativas na
  raiz e no run; erro de autorização ou conflito de payload exige revisão.
  v1 continua legível para hooks idempotentes, mas não ganha recuperação de
  ações iniciadas. Consumidor antigo não reconhece hook v2 e deve recusá-lo;
  prova de migração/consumidores mistos e publicação continua pendente.
- Candidatas de aprovação são capturadas antes das primeiras ações de etapa,
  com condições originais e hash do plano. A seleção ocorre após as mutações
  restantes do próprio CRM: não introduz regra nova/habilitada/modificada durante
  a interrupção. Após congelar automationApprovalPlans, descarta a cópia das
  candidatas e conserva o fingerprint/marcador fechado; ausência de prova bloqueia.
- Recibo interno removido não é inferido a partir do cliente: audit/projeção ou
  registro ocupado exigem conciliação antes de reconstruir o efeito. Notas/tarefas
  editadas ou removidas por humano permanecem assim quando o recibo está íntegro.
- Integrado 17/17 em 56,16s. Revisão de escopo 22/23 preservada: o teste estrangeiro
  supunha uma só candidata, mas a captura correta é da empresa; corrigido para
  revogar a candidata da própria proposta, mantendo a asserção de bloqueio.
  Proteções 33/33 em 117,75s; versão/finalização da cópia 35/35 em 122,20s,
  versioned_exit=0, sessão 76198 encerrada. Logs/recibos stage-run-recovery-*
  20261021/20261022 preservados, sem reduzir timeouts/contagens de efeitos.
- Controles v1 agora usam congelamento real anterior ao hook, sem apagar ou
  rebaixar recibos para fabricar legado; asserções originais de quarentena e
  ausência de repetição mantidas. Novos controles exigem completar o restante
  com efeitos únicos, prazo/quota intactos e veto humano/recibo/empresa/regras.
- Estático inicial: lint_exit=0/types_exit=2, sessão 51246 encerrada, recibo e logs
  stage-run-recovery-{static-receipt,types,lint}-20261022. Onze TS2339 em
  appointment-mutation.ts:44–51, arquivo de trabalho concorrente, preservado;
  não houve diagnóstico nos arquivos desta unidade. Não equivale a typecheck
  geral aprovado. Regressão integral desta versão ainda pendente. Implementação local,
  não publicação nem prova em uso real; B continua aberta. Aprovação própria
  (budget_approved), demais consumidores, retenção, tamanho/carga/concorrência e
  gates não estão aprovados. Nenhum modelo pago, cliente real ou ação externa.
- Regressão completa iniciada na sessão 69906, prontidão do hub verificada:
  Asaas, financeiro, proposta, pedido e candidatas de aprovação, sequencial;
  stage-run-recovery-compatibility-20261022.log e recibo de término próprio.
  Inclui três novos casos reais do consumidor financeiro v2: retomar a nota
  restante preservando tarefa editada, ou bloquear pagamento/ator revogados.
  Snapshot de 20 fontes/dependências em stage-run-recovery-snapshot-20261022.json;
  hash do diagnóstico concorrente separado, sem alterar arquivo desse trabalho.
  A sessão 69906 desapareceu, sem processo de teste ativo nem recibo final;
  log parcial preservado com duas reprovações de proposta (troca de canal após
  enfileiramento e tarefa antes de falha posterior). Não é bateria aprovada.
  Fontes só foram alteradas depois de confirmar o término do processo.
- Retomada 22/10: consulta limitada a 121 configurações contava também regras
  de outros eventos, bloqueando propostas em catálogos maiores. Leitura agora
  paginada por ID dentro da mesma transação/empresa; limite de 120 continua
  aplicado aos planos selecionados e ao conjunto de candidatas de aprovação.
  Valida lease a cada página e antes de gravar, sem ampliar prazo ou permissões.
  Dois casos adicionados: 121 definições alheias não truncam seleção; 121 planos
  elegíveis exigem revisão antes de qualquer efeito, sem executar subconjunto.
  Reprodução dedicada inicial não executou: emuladores ausentes/conflitantes,
  com logs de infraestrutura preservados. Não atribuir baseline nova inexistente.
  Serviços foram encontrados separados (Auth/Storage no hub, Firestore standalone);
  validação usa prontidão real dos endpoints locais, sem reiniciar serviço alheio.
  Seleção/candidatas 15/15 em 109,82s, candidates_exit=0. Tipos/lint aprovados
  (types=0/lint=0), recibo stage-catalogue-static-receipt-20261022.json; diagnóstico
  concorrente anterior não repetiu, sem alteração de appointment-mutation aqui.
  Retomada seletiva de pedido/financeiro 18/18 em 72,41s: inclui mensagem imediata
  seguida de nota na mesma automação, preservando slot, messageId, updateTime e
  sequência do chat; mudança de destinatário exige revisão e não cria nova nota.
  Testes são fictícios, providerAttempts permanece zero; falhas QA são injetadas.
  Regressão completa de propostas 106/106 em 469,52s, proposal_exit=0, sessão
  83890 encerrada e recibo stage-catalogue-proposal-receipt-20261022.json.
  As duas reprovações do log amplo interrompido passam agora no arquivo integral,
  inclusive após acumular todas as configurações dos casos anteriores. Total
  desta correção: 139/139 (15 seleção + 18 retomada + 106 proposta), sem contar
  resultado parcial da bateria interrompida nem reapresentar 350 históricos como
  atuais. Lint adicional do teste de pedido aprovado (lint=0).
  Snapshot final de 21 fontes/dependências, stage-catalogue-final-snapshot-
  20261022.json, conferido com drift=0. Não houve build/publicação/modelo pago
  ou comprovação em uso. B permanece aberta. Próxima unidade: recuperação
  parcial do próprio budget_approved com recibos, mantendo manifesto, quota,
  controle humano e legado; depois demais produtores e gates B.

## Unidade B — checkpoints compartilhados por pedido, etapa financeira e proposta — 21/10/2026

- Baseline 0/4 em 34,07s reproduziu confirmação perdida após aprendizado/trilha
  nas duas novas origens; shared-stage-hooks-baseline-20261021.log preservado.
  Falhas QA_SHARED_STAGE_HOOK_ACK_LOST e QA_FINANCE_COMMIT_ACK_LOST são injetadas
  em fixtures Shopify fictícias; nenhum cliente, cobrança ou proposta reais.
- Execução de checkpoints extraída do consumidor de pedido e reutilizada, sem
  copiar permissões: cada origem fornece sua própria autoridade transacional.
  Etapa financeira continua exigindo pagamento/audit/ator/funil válidos; proposta
  exige revisão, financeiro, acesso e controle humano atuais. Não cria fila/cron.
- Proposta congela somente as fases pertinentes: etapas aplicadas mantêm seus
  hooks; aprovação tem checkpoint separado, inclusive quando a etapa é manual e
  preservada. Aprovação iniciada sem confirmação continua em conciliação.
  Apenas hooks idempotentes ou ainda não iniciados são retomáveis. Registros
  históricos sem checkpoints e com efeitos iniciados não ganham nova aprovação.
- Integrado 8/8 em 44,87s, integrated_exit=0, sessão 9855 encerrada;
  shared-stage-hooks-integrated-20261021.log. Inclui as duas origens e compatibilidade
  do pedido, conversão incerta e finalização com tarefa editada por humano.
- Proteções 17/17 em 126,92s, guards_exit=0, sessão 41981 encerrada:
  pagamento/permissão/revisão/financeiro, exclusão de progresso/recibo, executor
  expirado sob concorrência e aprovação sem mudança de etapa; log
  shared-stage-hooks-guards-20261021.log. Tipos/lint aprovados, sessão 1054
  encerrada, types_exit=0/lint_exit=0; shared-stage-hooks-{types,lint}-20261021.log.
- Regressão ampla 350/350 em 1.531,21s, compatibility_exit=0, sessão 32066
  encerrada: Asaas, financeiro, propostas e pedidos, sequencial;
  shared-stage-hooks-compatibility-20261021.log.
  Snapshot de oito arquivos da unidade mais sete dependências críticas em
  shared-stage-hooks-snapshot-20261021.json, conferido sem drift (0/15). Não alterar
  fontes enquanto os testes estiverem ativos. B segue aberta, sem publicação,
  modelo pago, ação externa ou comprovação em uso real.
- Revisão da fronteira etapa→aprovação reproduziu lacuna adicional (baseline
  1/5 em 51,64s): após aprendizado/trilha interrompidos, aprovação podia incorporar
  regras criadas/alteradas depois, inclusive elegibilidade antes vazia. O controle
  positivo de condições avaliadas após a própria mudança de CRM já passa.
  proposal-approval-candidates-baseline-20261021.log preservado; reprodução
  independente em namespace fictício isolado, sem modificar fontes da regressão
  ativa. Corrigido congelando o conjunto de aprovação quando as automações de
  etapa terminam, antes dos outros hooks, reutilizando automationApprovalPlans.
  Elegibilidade usa cliente/configurações lidos na mesma transação, com amostra
  integral limitada e falha explícita se incompleta; sem fallback de vazio falso.
- Integrado da fronteira 7/7 em 59,42s, candidate_integrated_exit=0, sessão 62615
  encerrada; proposal-approval-candidates-integrated-20261021.log. Regras novas,
  habilitação posterior e mudanças de elegibilidade não entram no evento antigo;
  alteração de ação aceita e exclusão do manifesto exigem revisão. O conjunto
  elegível continua sendo avaliado depois das próprias mutações de CRM da etapa.
- Nova prova de estáticos com recibo durável em execução na sessão 78920: o handle
  anterior 89255 não existe e a inspeção de processos não encontrou seu comando;
  logs vazios não foram tomados como exit=0. Snapshot final de 17 arquivos em
  shared-stage-hooks-final-snapshot-20261021.json. Compatibilidade focada da
  fronteira final iniciada em shared-stage-hooks-final-20261021.log, com recibo
  durável próprio. Não há outro processo executando esses dois arquivos; testes
  concorrentes de agenda/rascunhos/atividades preservados. B aberta, nenhum
  build/release integrado aprovado.
- Estáticos finais confirmados: types_exit=0/lint_exit=0, sessão 78920 encerrada;
  recibo shared-stage-hooks-static-receipt-20261021.json e logs *-verified-20261021.
  A compatibilidade final da sessão 54228 encerrou reprovada (0/27 em 109,65s,
  final_exit=1): hooks de preparo/limpeza recusaram conexão em 127.0.0.1:9099 e
  :8080. Incidente real da infraestrutura local, não falha injetada nem aprovação
  do código. Log/recibo preservados. Inspeção encontrou zero listeners nessas
  portas e outra inicialização Firebase já ativa (PIDs 592/9468); não duplicar,
  parar ou reiniciar esse processo. Aguardar prontidão comprovada e repetir a
  mesma bateria, sem editar fontes ou diminuir critérios.
- Emuladores confirmados prontos pelo hub em :4400 (firestore :8080, auth :9099,
  storage :9199), recibo shared-stage-hooks-emulators-ready-20261021.json. Mesma
  bateria reiniciada na sessão 75788, sem duplicar serviço ou alterar fontes,
  em shared-stage-hooks-final-retry-20261021.log, com novo recibo próprio. Os
  27 erros iniciais incluem 25 casos sem preparo e dois erros de encerramento
  dos arquivos após a queda; não representam 27 comportamentos da aplicação.
- Repetição final 25/25 em 140,31s, retry_exit=0, sessão 75788 encerrada, nenhum
  skip/cancelamento; shared-stage-hooks-final-retry-20261021.log e
  shared-stage-hooks-test-retry-receipt-20261021.json. Inclui os sete casos da
  fronteira e consumidores reais, controle humano, quota, entrega/CRM, falhas
  antes do claim e automação parcial que deve permanecer em revisão. Snapshot
  final sem drift (0/17); diff --check aprovado. A ampla 350/350 é do snapshot
  anterior à correção da fronteira; 25/25 e tipos/lint validam o delta final.
- Estado: implementada/testada localmente a recuperação seletiva em pedido,
  etapa financeira e proposta; não publicada nem comprovada em uso real. Não
  aprova B ou qualidade conversacional. Próxima reprodução: runs de automação
  iniciados sem confirmação integral, provando ação por ação/recibo e mantendo a
  fronteira de elegibilidade etapa→aprovação. Não promover legado nem apenas
  redefinir status para ready. Demais consumidores, retenção, paginação,
  concorrência/capacidade e gates continuam pendentes. Nenhum gasto/deploy.

## Unidade B — recuperação seletiva dos hooks de etapa — 21/10/2026

- Causa reproduzida nos dois hooks (baseline 0/2 em 9,91s): confirmação perdida
  após outcome/trilha deixava a raiz inteira em conciliação, mesmo com automações
  já confirmadas e hook restante idempotente. Log stage-partial-hooks-baseline-
  20261021.log preservado; QA_learning_HOOK_ACK_LOST/QA_trail_HOOK_ACK_LOST são
  falhas injetadas em clientes/pedidos Shopify fictícios.
- Executor de pedido registra checkpoints versionados no próprio job existente:
  automações, aprendizado, conversão e trilha. Confirmações completas são
  preservadas; apenas aprendizado/trilha interrompidos ou hook ainda não iniciado
  podem ser retomados com a autoridade/funil/decisão humana revalidados. Automação
  ou despacho externo iniciados sem confirmação continuam em conciliação.
- Trilha causal grava contagem, audit determinístico e recibo na raiz no mesmo
  commit; replay mantém a contagem e recusa recibo/audit ausente ou divergente.
  Chamadores antigos sem checkpoints mantêm seu contrato anterior. Nenhuma fila,
  cron ou coleção nova; nenhuma promoção de raiz histórica sem prova.
- Integrado 5/5 em 19,32s. Proteções 10/10 em 56,89s: aprendizado/trilha,
  executor expirado sob concorrência, exclusão da fonte, correção humana,
  remoção do progresso, recibo e audit; mantém bloqueio de automação incerta.
  Logs stage-partial-hooks-{integrated,guards}-20261021.log.
- Estático inicial reprovado com TS2345 no docId opcional novo em
  conversion-trail.ts; corrigido usando sobrecargas explícitas de doc. Lint
  inicial interrompido (lint_exit=-1, não aprovado) para aplicar a correção
  conhecida; nova checagem após a regressão. Baseline/erro não apagados.
  Regressão ampla 139/139 em 571,10s, compatibility_exit=0, sessão 42437
  encerrada: pedido, financeiro, etapa manual e hook de outcome. Inclui processo
  frio, confirmação perdida após todos os checkpoints e conversão incerta;
  stage-partial-hooks-compatibility-20261021.log. Snapshot dos seis arquivos
  em stage-partial-hooks-snapshot-20261021.json conferido sem drift (0/6).
- Revisão adicional reproduziu 0/1 no plano de aprendizado corrompido tratado
  como erro temporário; stage-partial-hooks-invalid-plan-baseline-20261021.log
  preservado. Erros AI_OUTCOME_SIGNAL_PLAN_* agora exigem conciliação; não repetir
  plano inválido automaticamente. Final focado 13/13 em 33,18s, final_exit=0,
  sessão 7506 encerrada; stage-partial-hooks-final-20261021.log. Snapshot novo
  stage-partial-hooks-final-snapshot-20261021.json. Tipos/lint finais aprovados,
  types_final_exit=0/lint_final_exit=0, sessão 65980 encerrada; logs
  stage-partial-hooks-{types,lint}-final-20261021.log. Outros testes de mídia concorrentes observados;
  não reiniciar seus processos nem alterar arquivos desse trabalho. B aberta;
  falta migrar os demais consumidores para os checkpoints, conciliar automações
  parciais, legado/retenção/paginação/capacidade e gates. Sem publicação ou gastos.
- Estado da capacidade: implementada/testada localmente no consumidor de pedidos;
  não publicada e não comprovada em uso real. Próxima implementação: reaproveitar
  checkpoints no consumidor financeiro e proposta; depois recuperar runs parciais
  somente quando cada ação tiver prova durável suficiente, sem promover legado.

## Unidade B — retomada do hook de resultado comercial — 21/10/2026

- Baseline 0/2 em 20,12s: perda de confirmação após o commit do outcome deixava zero
  sinais e a repetição retornava antes de completar o hook. Log preservado em
  ai-outcome-recovery-baseline-20261021.log; QA_OUTCOME_ACK_LOST é falha injetada,
  sem incidente, cliente ou proposta reais.
- O próprio outcome agora guarda plano mínimo e congelado dos alvos originais,
  versão e estado pending/done. Repetição retoma sinais usando as identidades
  idempotentes existentes, sem incrementar novamente a observação ou usar uma
  recomendação posterior da IA como se fosse a evidência comercial original.
  Não adiciona fila, aprovação automática ou aprendizado retrospectivo do legado.
- Integrado 2/2 em 12,73s; revisão final 5/5 em 17,35s. Inclui duas perdas de
  confirmação (outcome e primeiro sinal), alteração da observação entre tentativas,
  repetição concorrente, contagem única, conclusão nova e legado sem plano.
  Logs ai-outcome-recovery-{integrated,final}-20261021.log. Recibos/sinais e
  compilador de recomendações existentes reaproveitados, sem mudança de política.
- Compatibilidade do consumidor Shopify de etapa 6/6 em 34,91s, sessão 41367
  encerrada, stage_compatibility_exit=0; ai-outcome-stage-compatibility-20261021.log.
  Tipos do escopo e lint aprovados, sessão 12332 encerrada, logs
  ai-outcome-recovery-{types,lint}-20261021.log. Hashes dos dois arquivos em
  ai-outcome-recovery-snapshot-20261021.json. Não equivale à retomada integral
  de raiz com automações/CAPI parciais:
  esses efeitos incertos continuam exigindo conciliação; não promover ready.
  Paginação da seleção de aprendizado, retenção e autoria humana seguem gates
  próprios. B aberta; nenhum deploy, modelo pago ou envio externo.

## Unidade B — lançamento sem cliente vinculado e remoção do fallback direto — 21/10/2026

- Baseline 0/3 em 15,31s: lançamento comercial, contrato e assinatura sem leadId
  registravam pagamento antes de associar a causa ao cliente; confirmação perdida
  omitia hooks. asaas-unlinked-invoice-baseline-20261021.log preservado, falha
  QA_UNLINKED_INVOICE_ACK_LOST injetada localmente em fixtures Shopify fictícias.
- Cliente único da cobrança, mesma empresa, valor e propósito são verificados
  transacionalmente. Associação, pagamento, audit, decisão/ownership de etapa e
  recibo agora têm commit único. Workflow stage_only preserva o comportamento
  anterior de etapa, sem adicionar finance_paid que esse ingresso não disparava.
  Executor financeiro/etapa, recibos, quota e agenda existentes reaproveitados.
- Stage_only é revalidado no registro, audit e raiz; não pode ganhar gatilho
  financeiro por mudança de status da raiz. Alterações de cliente/workflow/fonte,
  controle humano ou preço invalidam pendências. Pagamento legado já confirmado
  não ganha vínculo/aprovação retrospectivos. Reversões também estabelecem vínculo
  verificado sem efeito de venda; pagamento antigo não reabre fato mais novo.
- Integrado 3/3 em 22,71s, integrated_exit=0, sessão 18700 encerrada;
  asaas-unlinked-invoice-integrated-20261021.log. Removidos atualização/evento
  soltos do cliente e setLeadPipelineStageWithEffects direto do webhook após
  compatibilidade dos ingressos substitutos. Vínculo inesperado exige revisão.
- Ampla 143/144 em 443,04s, compatibility_exit=1, sessão 85725 encerrada;
  asaas-unlinked-invoice-compatibility-20261021.log preservado. Caso antigo de
  assinatura exigia nova notificação após cancelamento sem retomada humana,
  incompatível com a correção anterior que preserva cancelled. Asserções de
  bloqueio adicionadas e retomada humana explícita antes do novo evento; sem
  relaxar proteção, reduzir timeouts ou esconder a reprovação histórica.
- Final focado 45/45 em 302,84s, final_exit=0, sessão 4014 encerrada;
  asaas-unlinked-invoice-final-20261021.log. Snapshot dos cinco arquivos em
  asaas-unlinked-invoice-snapshot-20261021.json. Tipos gerais reprovados por
  TS7034/TS7005 em message-media-source.ts:87/93, arquivo de mídia de outro
  trabalho; não alterado nesta unidade. Lint aprovado, sessão 92888 encerrada,
  lint_exit=0; asaas-unlinked-invoice-lint-20261021.log. Snapshot sem drift (0/5).
  B segue aberta; próxima prioridade é cobertura
  de ingresso/paginação e hooks parciais/legado/retenção/concorrência/capacidade.
  Não comprovados qualidade conversacional, build/release integrado ou gate B.
  Nenhum deploy, dado real, modelo pago, envio externo, pagamento ou reembolso.

## Unidade B — assinatura observada por cliente sem invoice vinculado — 21/10/2026

- Baseline 0/2 em 10,62s: assinatura com e sem subscriptionId perdia a origem
  causal da atualização do CRM após confirmação de commit perdida. Log
  asaas-platform-lead-baseline-20261021.log; falha QA_PLATFORM_LEAD_ACK_LOST
  injetada em fixture Shopify fictícia, não incidente real.
- Integrado inicial 2/2 em 16,43s, integrated_exit=0, sessão 6810 encerrada;
  asaas-platform-lead-integrated-20261021.log. Fato de pagamento do contato,
  audit, decisão de etapa e pendência compartilham commit. Recupera com a
  ocorrência de observação existente e executor financeStage, sem criar
  invoice ligado ao cliente nem disparar finance_paid/billing financeiro fictício.
- Autoridade asaas_billing_lead_event separada de compra comercial, com propósito
  platform_billing e vínculo mínimo no ledger. Revalida empresa, cliente único,
  assinatura, projeção de assinatura sem leadId (quando existente), evento,
  credencial e controle humano. Invoice inesperado/reatribuído exige conciliação.
- Valor de assinatura é o valor do evento autenticado da plataforma, identificado
  como platform_event; não vira preço contratado de compra do cliente. Não exige
  inventar lastChargeAmount e não flexibiliza o preço verificado de compra
  comercial. Correções do valor observado/projeção revogam efeitos pendentes.
- Reversão/restauração do fato do contato usa ordenação existente, sem enviar
  reembolso ou reabrir etapa cegamente. Pausa por cancelamento da assinatura
  continua impedindo avanço do CRM; um pagamento posterior não libera essa pausa.
- Compatibilidade inicial 116/118 em 379,86s, compatibility_exit=1, sessão 97042
  encerrada; asaas-platform-lead-compatibility-20261021.log preservado. Duas
  reversões revelaram erro real do código local: preservar assinatura cancelada
  tentava gravar platformPlan=undefined em tenant legado sem plano, retornando
  500. Atribuição provisória à fixture foi incorreta; logs completos corrigem
  o diagnóstico. O código agora preserva ausência de billingStatus/status/plano
  sem gravar undefined ou reativar campos bloqueados. Nenhum incidente real.
- Esses casos também passaram a exigir prova do bloqueio e retomada humana
  explícita antes do novo evento que deve avançar CRM. Isso não substitui a
  correção do erro 500 nem reduz asserções: status/valor/efeito continuam exigidos.
- Primeiro final 20/21 em 90,16s, sessão 79522 encerrada, final_exit=1;
  asaas-platform-lead-final-20261021.log preservado. A asserção reforçada provou
  outra falha: reativação redundante da projeção de assinatura desfazia o estado
  cancelled preservado pelo ingresso principal. Removida essa chamada redundante.
- Reativação de contrato agora verifica cobrança única, valor, propósito de
  billing, evento autenticado e estado atual da empresa no próprio commit.
  Cancelamento, operação pendente e pausa humana não são sobrescritos. Tenant,
  configuração e recibo de audit têm uma transação; recibo estável por pagamento
  preserva repetição sem regravar acesso. Falha/ACK perdido antes do ledger
  concluir retorna erro recuperável ao provedor; não desaparece em catch amplo.
- Final corrigido 42/42 em 141,80s, final_corrected_exit=0, sessão 22101 encerrada;
  asaas-platform-lead-final-corrected-20261021.log. Inclui novos casos de
  cancelamento/refund_pending/operação pendente/manual, reativação por atraso,
  duas confirmações, rollback do recibo e ACK perdido de reativação. Falhas QA
  injetadas são deliberadas; os dois defeitos de código acima foram reproduções
  locais reais e permanecem no histórico. Não somar execuções sobrepostas.
- Cobertura acima de 200 lançamentos: baseline 1/2 em 10,29s,
  coverage_baseline_exit=1, sessão 26271 encerrada; proteção provisória contra
  truncamento também bloqueava histórico inteiro quitado. Log
  asaas-billing-coverage-baseline-20261021.log preservado. Consulta agora paginada
  por ID dentro da transação: dívida em página posterior impede reativação;
  histórico integral quitado permite a recuperação autorizada. Não foi reduzida
  a exigência de cobertura para aprovar.
- Revisão final de cobertura/reativação/CRM 15/15 em 65,29s,
  coverage_final_exit=0, sessão 83403 encerrada;
  asaas-platform-lead-coverage-final-20261021.log. Reprovações históricas não
  foram apagadas; não somar esses quinze aos 42 ou à ampla sobrepostos.
  Snapshot final de seis fontes em asaas-platform-lead-final-snapshot-20261021.json;
  snapshot inicial de cinco fontes não representa a revisão de contract-billing.
  Tipos/lint aprovados, types_exit=0 lint_exit=0, sessão 15935 encerrada;
  asaas-platform-lead-types-20261021.log e asaas-platform-lead-lint-20261021.log.
  Diff check sem erros; sem build/release integrado nesta unidade.
- Próxima ação: reproduzir o fallback restante de cliente localizado pela
  cobrança quando há invoice sem leadId ou vínculo inesperado; fechar autoridade,
  retomada e compatibilidade antes de remover a mudança direta de etapa.
  Depois: demais coberturas/paginação, hooks parciais/legado/retenção/capacidade
  e gate B. Implementação/teste locais não comprovam publicação ou uso real.
- B aberta; ingresso sem vínculo esperado, lifecycle/ordem global de billing,
  cobertura/paginação, partial hooks, legado/retenção/capacidade e gates seguem
  pendentes. Nenhum deploy, modelo pago, dado real, envio externo ou aceite final.

## Unidade B — notificação financeira de contrato/assinatura com cliente vinculado — 21/10/2026

- Baseline 0/2 em 13,52s: cobrança de contrato e assinatura da plataforma
  registravam pagamento, mas perdiam finance_paid após confirmação de commit
  perdida. Fixtures fictícias Shopify; QA_BILLING_FINANCE_ACK_LOST injetado,
  não incidente real. asaas-billing-notification-baseline-20261021.log.
- Implementado produtor billing, com recibo asaas_billing_paid_occurrence,
  distinto do pagamento comercial. Compartilha executor financeiro, efeitos,
  recibos, quota, agenda e outbox; sem nova fila/cron ou emissor. A própria
  classificação da origem determina finance_paid e é verificada antes do efeito.
- Pagamento/audit/decisão de etapa/ocorrências e vínculo mínimo de billing no
  ledger têm commit único. Repetição preserva primeira data/recibo. Assinatura,
  empresa, invoice, cliente, flag de contrato, propósito, valor e credencial são
  revalidados; referência de plataforma não vira prova comercial. Fatos novos
  de reversão invalidam efeitos pendentes, sem executar reembolso ou desfazer
  etapa automaticamente. Caminhos de reativação de billing permanecem próprios.
- Primeiro integrado 0/3 revelou fingerprint instável pela ordem de chaves do
  mapa retornado pelo Firestore e classificação ainda exclusiva de finance.
  Corrigidos com fingerprint canônico e origem billing explícita, preservando
  os testes reprovados em asaas-billing-notification-integrated-20261021.log.
  Integrado corrigido 3/3 em 21,01s, integrated_exit=0, sessão 16403 encerrada;
  asaas-billing-notification-integrated-corrected-20261021.log. Inclui preservação
  do fluxo normal de assinatura, sem criar ocorrência de compra comercial.
- Compatibilidade aprovada 100/100 em 279,30s, zero falhas/skips/cancelamentos,
  compatibility_exit=0, sessão 69728 encerrada;
  asaas-billing-notification-compatibility-20261021.log. Inclui Asaas completo,
  financeiro manual e contrato de produtores, sem somar execuções sobrepostas.
- Fronteira adicional reproduzida 0/2 em 13,03s: repetição do pagamento com
  propósito comercial/billing trocado podia liberar recibo antigo ou omitir a
  conciliação da troca. asaas-billing-purpose-baseline-20261021.log preservado.
  Mesma evidência paga não troca propósito: cursor exige conciliação, sem
  notificação nova ou liberação da antiga. Registro pago legado sem recibo
  continua legado. Removido o emissor direto finance_paid agora sem produtores,
  após compatibilidade comprovada; estágio de entrada sem invoice segue separado.
- Final focado aprovado 19/19 em 60,07s, zero falhas/skips/cancelamentos,
  final_exit=0, sessão 17766 encerrada;
  asaas-billing-notification-final-20261021.log. Inclui propósito nos dois
  sentidos, recuperação de billing, nove revogações, fluxo comercial original,
  assinatura normal, lifecycle, checkout expirado e preservação de legado.
  Não somar aos 100 anteriores sobrepostos. Estático aprovado: types_exit=0 e
  lint_exit=0, sessão 37494 encerrada; asaas-billing-notification-types-20261021.log
  e asaas-billing-notification-lint-20261021.log. Diff check sem erros.
  Snapshot de dez fontes em asaas-billing-notification-snapshot-20261021.json.
- Próxima ação: ingresso de plataforma com cliente e sem invoice previamente
  vinculado, reproduzindo retomada e propósito sem inventar finance_paid. Depois
  cobertura/paginação e retomada parcial/legado/retenção/capacidade, antes do gate B.
  Capacidade implementada/testada localmente; sem build/release integrado,
  publicação, piloto ou comprovação operacional de qualidade conversacional.
- B aberta. Esta unidade cobre invoice existente com cliente da mesma empresa;
  ingresso de plataforma sem invoice vinculado, cobertura/paginação, lifecycle
  de billing e sua ordem global, hooks parciais/legado/retenção/capacidade ainda
  exigem provas. Não declara qualidade conversacional ou autorização de release.
  Nenhuma chamada paga, dado real, envio externo, pagamento ou reembolso.

## Unidade B — criação autenticada pela rota de agência — 21/10/2026

- Baseline 0/1 em 9,78s: confirmação de gravação perdida deixava cliente salvo
  sem ocorrência/automação, mesmo após repetir a solicitação. Fixture fictícia
  Shopify, falha injetada QA_AGENCY_CREATION_ACK_LOST, não incidente real.
  Log agency-creation-baseline-20261021.log preservado.
- POST leads/create agora grava cliente/evento/ocorrência numa transação, com
  autoridade agency_actor e produtor agency_leads. Fonte de aquisição continua
  sendo a fonte original; não é convertida em intake público ou draft MCP.
  Reutiliza executor/recibos/outbox/agenda de criação, sem nova fila/emissor.
- Repetição da mesma identidade retoma ocorrência pendente; criação concorrente
  não grava duas raízes. Atualização detecta conflito com a versão lida, preserva
  controle/atribuição e não aprova criação de registros legados retrospectivamente.
- Papel atual de agência, acesso à empresa, edit_leads, módulo, responsável,
  evento/produtor/fonte são revalidados antes do efeito. Reatribuição e revogação
  levam à conciliação, sem alterar cliente ou produzir tarefa. Criação em empresa
  sem acesso é negada antes da gravação; não foi alterado o sistema de autenticação.
  Registros sem empresa continuam sem automação e com evento atômico.
- Primeiro integrado 1/1 em 16,35s, integrated_exit=0, sessão 23840 encerrada;
  agency-creation-integrated-20261021.log. Confirma recuperação após ACK perdido,
  repetição e exatamente uma tarefa com fonte causal verdadeira.
- Compatibilidade das cinco famílias de criação aprovada 65/65 em 222,35s,
  zero falhas/skips/cancelamentos, compatibility_exit=0, sessão 55974 encerrada;
  agency-creation-compatibility-20261021.log. Quinze casos novos de agência,
  mais cinquenta de criação por intake/manual/MCP/social; não somar sobreposições.
  Revisão final de agência 19/19 em 125,39s, final_exit=0, sessão 16122
  encerrada; agency-creation-final-20261021.log. Inclui administrador global
  sem associação, cadastro sem empresa, legado e reatribuição entre leitura e
  commit; nenhuma asserção/timeout reduzido. Não somar aos quinze sobrepostos.
  Snapshot dos quatro arquivos em agency-creation-snapshot-20261021.json,
  verified_drift=0. Estático aprovado: types_exit=0 lint_exit=0, sessão 86466
  encerrada; agency-creation-types-20261021.log e
  agency-creation-lint-20261021.log. Diff check sem erros. Sem build/release
  integrado nesta unidade; estes resultados não fecham o gate B completo.
  Hooks de conversão/trilha permanecem separados, sem alegar recuperação integral.
  B aberta; próxima entrada pendente é a notificação legada de assinatura com
  lead. Depois: cobertura/paginação e retomada de hooks parciais, legado,
  retenção/concorrência/capacidade e gates antes de C. Nenhum deploy, gasto pago,
  dado real ou envio externo. Capacidade implementada/testada localmente;
  publicação e comprovação operacional permanecem pendentes.

## Unidade B — ordem de eventos comerciais e revogação de efeitos — 21/10/2026

- Implementada ordenação persistente por cobrança nos caminhos comerciais com
  invoice e diretamente no cliente. Evento pago antigo não sobrescreve estorno
  mais novo; repetição preserva recibo/data. Reversão mais nova invalida efeitos
  pendentes. Alteração manual não é desfeita pela repetição do mesmo fato bancário.
- Estado financeiro, índice de ordem e audit compartilham transação. Não executa
  estorno, pagamento ou retorno automático da etapa comercial. Usa executor,
  recibos e armazenamento existentes, sem nova fila/cron.
- Conflito no mesmo horário, conteúdo de evento reutilizado, vínculo ambíguo,
  preço divergente, controle humano e relógio desconhecido exigem conciliação;
  não autorizam efeitos. Ledger concluído permanece imutável. Proof/cursor de
  protocolo anterior não são promovidos automaticamente; migração exige revisão.
- Baseline de ordem 0/2, depois integrado 2/2; logs
  asaas-commercial-order-baseline-20261021.log e
  asaas-commercial-order-integrated-20261021.log. Compatibilidade inicial 82/82
  em 336,27s (61 Asaas e 21 financeiros manuais), tipos/lint aprovados; log
  asaas-commercial-order-compatibility-20261021.log. Não somar sobreposições.
- Falha adicional de relógio reproduzida 0/1: mesma data sem fuso mudava três
  horas entre UTC e São Paulo; asaas-commercial-time-baseline-20261021.log.
  Formato documentado em https://docs.asaas.com/docs/eventos-de-webhooks.
  Parser agora valida componentes civis sem depender do fuso do servidor.
  Horário civil do provedor e instante com offset são domínios separados;
  conflito entre domínios exige revisão, sem presumir fuso ausente.
- Validação final 67/67 em 178,34s, zero falhas/skips/cancelamentos,
  final_exit=0, sessão 34225 encerrada; log
  asaas-commercial-order-final-20261021.log. Inclui 65 cenários Asaas e dois
  testes puros de relógio. Erros QA_ACK_LOST são falhas injetadas locais;
  rejeições de prova são cenários deliberados, não incidentes de produção.
- Snapshot final de dez arquivos em
  asaas-commercial-order-final-snapshot-20261021.json; snapshot inicial preservado
  separadamente e não representa a revisão final do relógio.
- Estático confirmado após encerramento dos testes: types_confirmed_exit=0 e
  lint_confirmed_exit=0, sessão 21944 encerrada; logs
  asaas-commercial-order-types-confirmed-20261021.log e
  asaas-commercial-order-lint-confirmed-20261021.log. Diff check sem erros.
- B continua aberta: notificação legada de assinatura com lead, rota de agência,
  cobertura/paginação dos ingressos, hooks parciais, legado, retenção,
  concorrência/capacidade e gates antes de C. Nenhuma publicação, chamada paga,
  dado/cliente real, envio externo ou aceite de qualidade conversacional.

## Unidade B — cobrança Asaas diretamente no cliente, sem invoice — 21/10/2026

- Turno anterior: progresso, invoice Asaas comercial migrado, regressão inicial
  45/45 e final 28/28, tipos/lint aprovados. Continuidade sem refazer planejamento.
- Baseline novo 0/1 em 37,72s (caso 7,74s), asaas-lead-payment-baseline-
  20261021.log: confirmação de commit perdida deixava pagamento registrado e
  etapa captado, sem decisão/recibo causal para recuperar hooks. Falha injetada
  em fixture local Shopify, não incidente real.
- Implementado asaas-lead-payment: evento autenticado, cobrança com cliente único,
  ausência de invoice e valor contratado conhecido sustentam um recibo próprio de
  fato de pagamento. Fato/audit/ownership/etapa/ocorrência de hooks compartilham
  transação. Valor contratado ausente/divergente ou vínculo ambíguo aborta antes
  de alterar cliente; não usar valor recebido como preço contratado inventado.
- Não cria lançamento financeiro nem dispara finance_paid nesse caminho. O recibo
  crm_asaas_lead_payment significa fato confirmado, não entrega ou hooks completos.
  Somente a ocorrência financeStage admite lead_stage_changed no executor existente.
  Registros, quotas, outbox e agenda compartilhados; sem nova fila/cron/emissor.
- Recuperação exige o mesmo ledger concluído, cobrança, empresa, cliente, valor,
  autorização e proof íntegro. Invoice novo ou correção humana invalida o caminho
  antigo; não duplicar fatos nem sobrescrever controle manual. Pausa da empresa/CRM
  registra fato sem avançar etapa nem reativar billing. Legado pago sem recibo não
  recebe aprovação retroativa. Fonte verdadeira também preservada nos hooks.
- Primeiro integrado 1/1 em 31,46s (caso 10,83s), integrated_exit=0; asaas-lead-
  payment-integrated-20261021.log, sessão 72274 encerrada. Prova de recuperação
  após confirmação perdida, sem invoice ou automação financeira fictícios.
- Compatibilidade aprovada 61/61 em 177,00s, zero falhas/skips, compatibility_exit=0,
  sessão 11525 encerrada; asaas-lead-payment-compatibility-20261021.log. Quarenta
  cenários Asaas (22 anteriores e 18 novos) e 21 financeiros manuais; não somar
  execuções anteriores sobrepostas. Inclui nove revogações do novo caminho,
  valor ausente/divergente, clientes ambíguos, pausa/humano, ledger confirmado sem
  ACK, repetição preservando data/recibo, legado e rollback completo da gravação.
- Tipos/lint aprovados, types_exit=0 lint_exit=0, sessão 14990 encerrada;
  asaas-lead-payment-types-20261021.log e asaas-lead-payment-lint-20261021.log.
  Snapshot de seis arquivos em asaas-lead-payment-snapshot-20261021.json,
  verified_drift=0. Testes e estático desta unidade estão encerrados.
- B aberta: próximo recorte é ordem/reversões de eventos e conciliação, incluindo
  vínculos ambíguos entre consumidores. Notificação legada de assinatura com lead
  e rota de agência continuam separadas/pendentes; ingressos integrais,
  partial/legado/retenção/capacidade e gates ainda precisam fechamento antes de C.
  Sem publicação, chamadas pagas, uso de dados/clientes reais, mensagens externas,
  pagamentos, estoque ou aceite de qualidade conversacional.

## Unidade B — ingresso Asaas para lançamentos comerciais vinculados — 21/10/2026

- Turno anterior: progresso, decisão financeira de etapa atômica implementada,
  compatibilidade 41/41 e tipos/lint aprovados. Não repetida ampla histórica.
- Primeira fixture falhou no carregamento do marker server-only no Node;
  asaas-paid-baseline-20261021.log preservado, não defeito do produto. Harness
  passou a usar o alias server-side do Next, sem simular autenticação ou billing.
- Baseline corrigido 0/1 em 31,79s, asaas-paid-baseline-corrected-20261021.log:
  confirmação do commit perdida, webhook repetido, invoice pago e automação
  finance_paid omitida. Falha injetada local, não incidente real.
- Implementado asaas-finance-occurrence: snapshot mínimo autenticado no ledger,
  cobrança/valor/vínculo único verificados; atualização financeira, dois audits,
  decisão de etapa e ocorrências têm commit único. Identidade vem do evento
  verificado + lançamento, não do cliente. Recibo repetido não reinicia efeitos.
  Credenciais/conteúdo de cliente não são gravados; somente fingerprint da
  autorização e campos de pagamento necessários, com integridade recalculada.
- Consumidores aguardam ledger completed. Confirmação perdida do ledger ou da
  atualização é retomada; processing/failed não autoriza efeitos. Status, valor,
  tenant/cliente, módulo, credencial e origem são revalidados nos efeitos. Duas
  confirmações de uma cobrança preservam data/recibo, sem duplicação financeira.
- Retirado o emissor antigo somente dos lançamentos comerciais migrados. Sem
  nova fila/cron. Mensagens/checkout/pagamentos externos não foram executados.
  Lançamento histórico já pago sem recibo não ganha aprovação retrospectiva.
- Primeiro integrado 1/1 em 30,21s. Regressão inicial 45/45 em 155,88s, tipos/lint
  aprovados; asaas-paid-integrated-20261021.log, asaas-paid-compatibility-
  20261021.log, asaas-paid-types-20261021.log e asaas-paid-lint-20261021.log.
- Falha adicional de autorização reproduzida 0/1: pagamento de cliente comercial
  reativava assinatura Altum bloqueada. asaas-commercial-billing-boundary-
  baseline-20261021.log. Caminho comercial agora não chama reativação de billing;
  preserva fato do pagamento e registra etapa blocked_access quando empresa ou
  CRM estão pausados. Assinatura/plataforma permanece no fluxo próprio, sem
  inventar recibo comercial ou alterar suas permissões por conveniência.
- Validação final aprovada: 28/28 em 78,39s, final_exit=0, sessão 19189 encerrada;
  asaas-paid-final-20261021.log. Inclui 22 cenários Asaas e seis helpers de
  checkout; não somar à regressão anterior sobreposta. Estático final aprovado,
  types_final_exit=0 lint_final_exit=0, sessão 86170 encerrada; logs asaas-paid-
  types-final-20261021.log e asaas-paid-lint-final-20261021.log.
  Testados também integridade do conteúdo do proof, assinatura inativada,
  checkout expirado e pagamento de assinatura no fluxo próprio sem recibo
  comercial fictício. Isso não homologa todo billing em produção.
  Snapshot de seis arquivos em asaas-paid-final-snapshot-20261021.json,
  verified_drift=0; testes/estático desta unidade encerrados.
- Limites abertos: cobrança ligada apenas ao lead, sem invoice, e notificações
  legadas de assinatura com lead ainda não têm o novo contrato causal. Ordem de
  eventos reversos/cancelamento, paginação/cobertura de lotes, partial/legado/
  retenção/capacidade e ingresso integral continuam gates de B. Nenhum release,
  uso real ou qualidade conversacional aprovados. Próxima unidade: caminho
  Asaas sem invoice e demais produtores preservados, antes de fechar B e ir a C.

## Unidade B — decisão de etapa vinculada à confirmação financeira — 21/10/2026

- Turno anterior foi progresso: ocorrência finance_paid implementada e 27/27,
  tipos/lint aprovados. A lacuna de etapa explicitamente registrada foi a próxima
  implementação; não repetida a ampla histórica da fundação.
- Baseline novo 0/1, finance-stage-baseline-20261021.log: interrupção após gravar
  pagamento deixava etapa captado em vez de ganho, sem ocorrência própria para
  retomada. Falha injetada em fixture Shopify local, não incidente real.
- Implementado finance-stage-transition. Confirmação, decisão de etapa, ownership
  automático, dois audits e duas ocorrências (finance_paid e lead_stage_changed)
  compartilham o commit original. Pipeline ausente/inválido e propriedade humana
  são decisões bloqueadas explícitas; não inventar uma etapa para aprovar.
  Falha de armazenamento do funil aborta o commit, sem recibo de configuração falso.
- Retirado hook de etapa sem fonte desta rota. Executor periódico e rota consomem
  a origem financeStage com prova do evento financeiro original, acesso atual,
  cliente, ownership, versão do funil e audit da transição. Recibos, quota, outbox
  e agenda compartilhados. Não foi criada fila/cron nem fonte Shopify fictícia.
- Hooks antigos úteis (aprendizado/trilha/conversões) continuam no executor existente
  com revisão de autoridade antes de cada fronteira. Interrupção após efeito
  iniciado vai para conciliação; não repetir silenciosamente efeitos incertos.
  Recibo final significa hooks concluídos, não entrega no provedor ou qualidade
  do aprendizado. Recuperação parcial integral desses hooks ainda é gate aberto.
- Primeiro integrado 0/1 em 12,60s: decisão e raiz foram persistidas/consumidas,
  mas sourceIn da fixture excedia o limite existente de 80 caracteres e não casava
  a automação. Corrigida origem curta, sem enfraquecer asserção/regra. Log
  finance-stage-integrated-20261021.log preservado.
- Compatibilidade aprovada: 41/41 em 128,48s, zero falhas/skips, compatibility_exit=0,
  sessão 65673 encerrada; finance-stage-compatibility-20261021.log. Inclui 21 casos
  financeiros e 20 de etapa manual anterior. Correção humana/funil/pagamento/acesso/
  audit revogados, etapa humana prévia preservada e confirmação de tarefa perdida
  sem repetição comprovados localmente. Consumo antes de hooks também testado.
- Tipos/lint aprovados, types_exit=0 lint_exit=0, sessão 68086 encerrada;
  finance-stage-types-20261021.log e finance-stage-lint-20261021.log. Snapshot de
  sete arquivos em finance-stage-snapshot-20261021.json, SHA256
  cddb384a023bc0f6f9b15ce127500cbf1b8e4884fd231d24da534c35b46990b6.
  Nenhum processo desta unidade permaneceu ativo. Sem publicação/modelo pago,
  mensagens reais, pagamentos, checkout ou alterações de estoque.
- B aberta. Próxima unidade: ingresso Asaas de pagamentos comerciais, vinculando
  fato verificado/ledger e lançamentos ao mesmo contrato causal; preservar fluxos
  compartilhados de assinatura/checkout/reativação. Rota de agência, ingressos
  inteiros, parcial/legado/retenção/capacidade e gates continuam pendentes antes C.

## Unidade B — ocorrência finance_paid no lançamento manual — 21/10/2026

- Turno anterior: progresso, criação social migrada com 28/28, identidade antiga
  1/1 e tipos/lint aprovados. Nenhuma ampla histórica repetida.
- Reprodução pela rota real PATCH tenant/finance: status pago persistido, mas
  confirmação perdida e retry unchanged perdiam automação finance_paid. Baseline
  0/1, finance-paid-baseline-20261021.log. Falha injetada em registros fictícios,
  sem movimentação financeira ou incidente de produção inferido.
- Implementado finance-paid-occurrence: lançamento, audit do cliente e ocorrência
  pendente têm commit único, com versão esperada. Origem guarda identidade do
  evento, valor, método/data e ator; não usa leadId como toda a intenção. Retomada
  exige lançamento ainda pago, mesma empresa/cliente/recibo, fonte e permissão
  manage_commercial atuais; fontes de políticas entram na transação do efeito.
- Executor/recibos/outbox/agenda existentes aceitam origem finance e gatilho real
  finance_paid. Reabertura/reconfirmação deixa ocorrência nova e revoga a antiga.
  Consumo parcial exige conciliação, sem repetição cega de efeitos incertos.
- Primeiro integrado interrompido por erro de edição na rota (fechamento residual);
  finance-paid-integrated-20261021.log preservado, não incidente. Corrigido sem
  mudança de asserção. Integrado corrigido 1/1 em 51,24s (caso 32,82s),
  integrated_corrected_exit=0; finance-paid-integrated-corrected-20261021.log.
- Compatibilidade aprovada: 27/27 em 102,46s, compatibility_exit=0, sessão
  47224 encerrada; finance-paid-compatibility-20261021.log. Treze casos
  financeiros e 14 de criação existente. Inclui nove revogações, reabertura/
  nova confirmação, preservação do hook antigo e rollback do commit inteiro.
  Tipos/lint aprovados, types_exit=0 lint_exit=0, sessão 49726 encerrada;
  finance-paid-types-20261021.log e finance-paid-lint-20261021.log.
  Snapshot de oito arquivos em finance-paid-snapshot-20261021.json,
  verified_drift=0; nenhum processo desta unidade ficou ativo.
- Limite explícito: recibo comprova registro de automação finance_paid, não
  recuperação da mudança de etapa/learning/conversões. Hook antigo de etapa
  permanece na rota; interrupção entre commit e esse hook ainda precisa causa
  própria. Webhook Asaas não foi migrado, incluindo sua conciliação e ledger.
  Próxima unidade: fechar essa ligação de etapa e ingresso Asaas preservando
  checkout/assinaturas/reativação compartilhados; não iniciar pagamentos reais.
- B aberta: também rota da agência, ingressos integrais, parcial/legado/retenção/
  concorrência/capacidade e gates. Nenhuma publicação, modelo pago ou uso real.

## Unidade B — criação por canal social com causa durável — 21/10/2026

- Turno anterior: progresso, criação aprovada MCP implementada e compatibilidade
  49/49, tipos/lint aprovados. Sem repetição da ampla histórica.
- Conferência das entradas restantes: formulários/chat público já chamam o intake
  migrado; essa constatação é de código, não aprovação end-to-end dessas rotas.
  leads/create é rota interna de agência (agency_agent), com semântica diferente;
  preservada nesta unidade, não substituída por autorização de cliente fictícia.
- Lacuna real encontrada nos dois produtores sociais: webhook Meta e sincronização
  Messenger chamavam lead_created depois do commit da identidade/cliente. Baseline
  novo 0/2: confirmação de commit perdida seguida de retry perdia tarefa inicial.
  social-creation-baseline-20261021.log; falha injetada, não incidente real.
- Implementado: resolveCanonicalSocialLead admite criação automatizada apenas com
  opção explícita do produtor vivo; grava cliente/evento/identidade/ocorrência na
  mesma transação. Importação histórica mantém caminho sem opt-in, e consulta
  posterior não transforma cliente antigo em nova ocorrência.
- Webhook e sync usam o executor/recibos existentes após criar conversa, sem
  segundo emissor. Raiz pending antes da conversa não é consumida: permanece ready
  com attempts=0. Origem social vincula tenant/canal/conta/perfil, revalidados na
  transação de efeitos/entrega. Desconexão, troca de conta/tenant, perfil divergente,
  correção humana ou alteração de autoridade exigem conciliação, sem mutação cega.
- Primeiro integrado 2/2 em 21,96s, integrated_exit=0; social-creation-integrated-
  20261021.log, sessão 21169 encerrada. Compatibilidade corrente sessão 68267,
  social-creation-compatibility-20261021.log concluída 26/27 em 80,51s: teste
  de concorrência contava audit da tarefa como segunda criação. Corrigida a
  asserção para exigir uma criação e um audit automation_task_created (total 2),
  preservando a tarefa e sua trilha. Nenhuma redução de timeout/garantia.
  Tipos iniciais aprovados; lint sem erros, warning de variável não usada na
  fixture corrigido. Logs originais preservados.
- Acrescentada prova de autor: origem social aceita somente serviço identificado
  no audit, sem atribuir efeito a humano forjado. Regressão final sessão 85917,
  social-creation-compatibility-final-20261021.log. Estático final sessão 80475,
  social-creation-types-final-20261021.log e social-creation-lint-final-20261021.log.
  Identidade social legada em fixture anterior: sessão 16765, log social-creation-
  legacy-identity-20261021.log. Não duplicar/editar fontes durante execução.
- Fechamento local: compatibilidade final 28/28 em 110,49s, sem falhas/skips,
  compatibility_final_exit=0, sessão 85917 encerrada. Identidade social legada
  1/1 em 16,58s, legacy_identity_exit=0, sessão 16765 encerrada (20 produtores
  concorrentes no caso). Tipos/lint finais aprovados, types_final_exit=0 e
  lint_final_exit=0, sessão 80475 encerrada. Não há processos desta unidade vivos.
  Snapshot final de seis arquivos em social-creation-final-snapshot-20261021.json,
  verified_drift=0, SHA256 1b37f5b42f8b1935156ba57370d1858c8c0c0f56a5eb6e7f30379133b15c90af.
- Próxima unidade de implementação: ocorrência finance_paid das entradas de
  cliente/Asaas com fixtures locais, sem movimentação financeira real. A rota
  interna de agência fica explicitamente pendente, preservada nesta rodada.
- B aberta; falta rota de agência, provar ingressos completos, financeiro,
  recuperação parcial, legado/retenção/concorrência/capacidade e gates. Não há
  publicação, chamada paga, efeito em loja ou contato real. Sem aprovação de C–G.

## Unidade B — criação aprovada pelo assistente/MCP — 21/10/2026

- Turno anterior classificado como progresso: criação manual autenticada migrada,
  compatibilidade 29/29, tipos/lint aprovados. Continuidade sem refazer a ampla.
- Baseline da nova fixture teve erro de montagem (import duplicado); log original
  creation-draft-baseline-20261021.log preservado, não classificado como defeito.
  Baseline corrigido 0/1 em 13,29s, baseline_corrected_exit=1: rota real aplica,
  mas repetição retorna 409 sem recibo reutilizável. Log creation-draft-baseline-
  corrected-20261021.log. Nenhum incidente de produção inferido.
- Implementado lead-creation-draft: rascunho aprovado, cliente/evento, ocorrência
  pendente e audit são gravados juntos; retirado applying intermediário somente
  desta operação. Identidade causal vem do draft aprovado e evento real, não da
  identidade da pessoa. Repetição lê recibo sem regravar correção humana.
- Revisão humana passa a guardar hash do conteúdo de create_lead; aplicação
  exige correspondência, versão, autoria/revisor, capacidades e funil atual.
  Legado sem hash não é autoaprovado. Política autônoma existente continua
  exigindo escopo/token no ingresso e política ativa; não é nova autorização.
- Executor de criação reutilizado mantém sourceType mcp, autoria gerada e revisor
  separados. Efeitos revalidam draft/recibo/hash, acesso do autor e do revisor,
  ou política autônoma ativa. Não há nova fila, cron ou envio real.
- Primeiro caso integrado 1/1 em 12,65s, integrated_exit=0; creation-draft-
  integrated-20261021.log. Compatibilidade inicial 33/34 em 63,47s: revisor
  revogado era bloqueado antes de escrita, mas resposta 500 em vez de 403.
  Corrigida classificação do erro sem relaxar a asserção; log anterior preservado.
- Refinamento de origem reproduzido 0/1: reclassificar raiz/evento como manual
  evitava conferir aprovação revogada. creation-draft-source-kind-baseline-
  20261021.log preservado. Agora qualquer vínculo ao draft exige prova completa
  em cliente/evento/raiz; alterar rótulo não remove essa obrigação.
- Compatibilidade final aprovada: 49/49 em 119,64s, zero falhas/skips, sessão
  87685 encerrada, compatibility_final_
  exit=0; creation-draft-compatibility-final-20261021.log (inclui intake).
  Snapshot de seis arquivos sem drift em creation-draft-snapshot-20261021.json.
- Estático inicial: lint_exit=0; dois erros de tipagem, tipo de retorno do
  helper e mensagem de asserção da fixture. Corrigidos depois dos processos
  terminarem, sem mudança de decisão/efeito/asserção. Logs originais preservados.
  Estático final aprovado: types_final_exit=0 lint_final_exit=0; sessão 36066
  encerrada. Logs creation-draft-types-final-20261021.log e creation-draft-lint-
  final-20261021.log. Snapshot final creation-draft-final-snapshot-20261021.json,
  verified_drift=0, SHA256 01b41a6120e491adcdcb851dace09664e4ac57d76ea102c415690cd00856e9c3.
- B continua aberta. Próximas entradas leads/create e formulários/chat; financeiro,
  parcial/legado/retenção/capacidade e gates antes de C. Sem publicação/modelo pago,
  sem efeito na loja ou clientes reais. Recibo não aprova qualidade conversacional.

## Unidade B — cadastro manual autenticado com recuperação — 21/10/2026

- Turno anterior: progresso concreto, recuperação do intake implementada e
  compatibilidade 34/34, tipos/lint aprovados. Não repetida a ampla histórica.
- Nova reprodução pela rota real POST tenant/leads: cliente salvo, confirmação
  do commit perdida e repetição retorna 409; periódico não criava a tarefa inicial.
  Baseline 0/1 em 8,13s, baseline_exit=1, manual-creation-baseline-20261021.log.
  Falha injetada em fixture de loja fictícia; nenhum incidente real inferido.
- Implementado: cadastro manual agora salva cliente/evento/ocorrência/audit juntos,
  usando o executor de criação e recibos existentes, sem fila, cron ou gatilho de
  etapa fictício. Origem tenant_actor é vinculada no cliente, evento e ocorrência;
  recuperação exige autor original, edit_leads, vínculo/módulo ativos e acesso
  atual ao registro. Fontes de permissão lidas na transação de cada efeito.
- Primeira integração 0/1 revelou incompatibilidade: perfil atendimento cadastra
  contato sem responsável, permitido pela rota existente. Corrigido preservando
  esse cadastro e sua intenção original enquanto continua sem responsável. Depois
  de atribuído, acesso atual é exigido. Não convertida permissão de pipeline em
  permissão de editar. Log manual-creation-integrated-20261021.log preservado.
  Caso corrigido 1/1 em 7,88s, integrated_corrected_exit=0.
- Validação aprovada: 29/29 em 77,21s, compatibility_exit=0, sessão 53865
  encerrada; manual-creation-compatibility-20261021.log. Inclui 10 casos da
  criação manual, 14 do intake e 5 das rotas de edição/etapa existentes.
  Sete revogações verificadas: capacidade, membership, usuário, atribuição,
  autor do audit, tentativa de rebaixar origem humana a serviço e módulo.
  Falha ao gravar ocorrência desfaz cadastro e audit. Tipos/lint aprovados:
  types_exit=0 lint_exit=0, sessão 13208 encerrada, manual-creation-types-
  20261021.log e manual-creation-lint-20261021.log. Snapshot dos quatro
  arquivos: manual-creation-snapshot-20261021.json, verified_drift=0.
- Sem publicação, chamada paga ou contato real. B aberta; criação pelas outras
  rotas (leads/create, MCP e formulários/chat), financeiro, recuperação parcial,
  legado/retenção/concorrência/capacidade e gates ainda precisam fechamento.
  Não promover raízes em conciliação nem confundir recibo com qualidade do agente.

## Unidade B — recuperação causal do cadastro por intake — 21/10/2026

- Implementado: recordInboundLead grava a ocorrência de criação junto do cliente,
  identidade e evento existente. O consumidor periódico retoma interrupções após
  commit sem confundir identidade da pessoa com intenção de automação. Opt-out
  original fica explícito; replay de cliente existente não o promove a aprovação.
- Novo intake-occurrence usa executor/recibos/outbox/agenda existentes e gatilho
  lead_created verdadeiro. Contrato compartilhado agora reconhece intake, sem
  criar etapa fictícia, fila nova ou núcleo específico de Shopify. Revalida fonte,
  empresa, criação, módulo e controle humano antes de efeitos e entrega.
- Baseline 1/2: confirmação perdida após commit perdia automação (task 0 vs 1).
  Log .qa-artifacts/intake-occurrence-baseline-20261021.log. Falha injetada, não
  incidente real. Primeira integração 36/37: os 11 novos casos passaram; worker
  frio antigo excedeu 25s e foi SIGTERM. Reprovação preservada em
  intake-occurrence-integrated-20261021.log, nenhum timeout/asserção reduzido.
- Worker isolado aprovado 1/1, caso em 8,98s / total 13,84s, cold_exit=0;
  intake-occurrence-cold-worker-20261021.log. Isso não aprova capacidade sob carga.
- Específicos ampliados: 14 casos aprovados, incluindo efeito externo simulado
  imediato/agendado uma vez e fonte revogada antes de entrega (zero chamadas).
  Compatibilidade manual concluída: 34/34 em 124,44s, effects_exit=0, sessão
  89186 encerrada; intake-occurrence-effects-20261021.log. Snapshot SHA256 de
  nove arquivos em intake-occurrence-snapshot-20261021.json. Lint runtime/teste
  aprovado (lint_exit=0). Tipos detectaram somente TS2571 na fixture de falha
  injetada (args[1] unknown); corrigida a anotação, sem alteração de runtime/
  asserções. Validação final aprovada: types_final_exit=0, lint_final_exit=0,
  sessão 75599 encerrada. Logs intake-occurrence-types-final-20261021.log e
  intake-occurrence-lint-final-20261021.log. Runtime drift=0; snapshot final
  dos nove arquivos em intake-occurrence-final-snapshot-20261021.json.
- Não publicado; zero modelos pagos, mensagens reais ou alterações na loja.
  Registro da automação não prova demais hooks antigos nem qualidade do agente.
  B permanece aberta: concluir esta validação, migrar demais entradas de criação,
  financeiro e recuperação parcial/legado/retenção/capacidade antes dos gates.

## Aprovação local restrita — B, ocorrência da mudança manual de etapa — 21/10/2026

- Turno anterior classificado como progresso: legado/retomada corrigidos e ampla
  90/90, tipos/lint aprovados. Sem repetir a ampla de lixeira nesta unidade.
- Baseline novo 0/1, .qa-artifacts/manual-stage-baseline-20261021.log: helper real
  commitManualLeadPatch salva decisão/audit, mas não deixa ocorrência durável para
  o consumidor após interrupção. Nenhum incidente de produção inferido.
- Implementação em curso: manual-update grava raiz/audit/ownership juntos; novo
  manual-stage-transition reutiliza o executor causal por ação, sem fonte Shopify
  fictícia e sem uma nova fila. Contrato compartilhado distingue manual/order/
  proposal; cada origem mantém sua autorização.
- Processo de outro trabalho identificado vivo inicialmente: 12716/14624,
  regressão CRM com crm-proposal-update. Integração nas fontes compartilhadas
  aguardou o encerramento; observação posterior 7108/13888 também encerrou antes
  dessa integração. Processos de terceiros preservados, sem mensagem a outro chat.
- Primeiro específico da gravação atômica 0/1: fixture tinha só duas etapas, abaixo
  do contrato existente de 3–12; revisão corretamente bloqueou automação. Corrigida
  fixture com terceira etapa, sem enfraquecer validação. Logs original/corrigido:
  manual-stage-atomic-commit-20261021.log e
  manual-stage-atomic-commit-corrected-20261021.log, **1/1** em 38,54s,
  commit_exit=0, sessão 38794 encerrada.
- Guardas específicas aprovadas: **7/7** em 74,59s, authority_exit=0, sessão 40565
  encerrada; manual-stage-authority-20261021.log. Fonte/audit, funil, membership,
  capacidade, atribuição, decisão e módulo são revalidados. Reads das fontes das
  políticas também pertencem à transação do efeito, para conflito por revogação.
- Integradas as duas rotas manuais e consumidor periódico existente. Perfil
  substitui chamada direta; etapa usa o mesmo commit manual e preserva override/
  audit/409, sem segundo fan-out. Os demais hooks continuam nos pontos anteriores;
  recibo novo significa automação registrada, não prova de aprendizado/conversão
  ou entrega no provedor. Nenhuma publicação, nova fila/cron ou modelo pago.
- Validação integrada aprovada: **20/20 em 69,36s**, integrated_exit=0,
  sessão 21620 encerrada, manual-stage-integrated-20261021.log. Inclui rota
  autenticada, commit/retomada, concorrência, 7 revogações, falha de leitura isolada,
  recibo de tarefa com confirmação perdida, texto via outbox/provedor fictício
  uma vez, revogação após enqueue e agendado revogado após correção humana.
- Primeira ampla concluída: **199/201 em 420,74s**, regression_exit=1, sessão
  9879 encerrada, manual-stage-producers-regression-20261021.log. Falharam os dois
  workers frios: delayed proposal CRM recovers e cold stage scheduler recovers.
  Ambos SIGTERM/killed sob limite original de 25s; estágio registrou runtime_loaded
  15.275ms antes de exceder limite. Não chamar de aprovação nem reduzir timeout.
  Aconteceu com arquivos concorrentes e tipos/lint; causa de desempenho ainda
  não isolada. Próxima ampla deve executar sem estático concorrente e arquivos
  sequenciais, com os mesmos casos/asserções/timeouts; manter reprovação histórica.
- Tipos/lint aprovados, types=0 lint=0, sessão 51719 encerrada;
  manual-stage-types-20261021.log e manual-stage-lint-20261021.log.
- Refinamento de capacidade reproduzido 0/1: perfil perdia edit_leads mas ainda
  consumia a ocorrência com manage_pipeline. Log manual-stage-precise-permission-
  baseline-20261021.log, sessão 4742 encerrada. Raiz agora guarda a capacidade
  exigida pela rota; perfil exige edit_leads, etapa aceita também manage_pipeline.
- Teste antigo do agendado renomeado com precisão: combinava correção humana e
  prazo forjado, portanto não provava isoladamente revogação humana. Mantido e
  acrescentados positivo e revogação com prazo original válido de fixture, usando
  mesma fração de hora já adotada na suíte de etapas; nenhuma regra/timeout reduzidos.
  Acrescentadas rotas autenticadas com tarefa causal e capacidade individual.
- Refinada 23/25, targeted_exit=1, sessão 91084 encerrada: as duas fixtures novas
  de rota contavam tarefa causal + acompanhamento comercial antigo como duplicação.
  Mantidas as funções; teste agora exige exatamente uma tarefa da nova raiz, seu
  recibo/ID/proveniência e exatamente um acompanhamento crm_automation (total 2).
  Reexecução das rotas **5/5 em 18,72s**, routes=0 lint=0, sessão 44636 encerrada;
  manual-stage-final-routes-20261021.log e manual-stage-final-routes-lint-20261021.log.
  Os novos cenários de capacidade e prazo válido já passaram na refinada.
- Tipos/lint do runtime refinado aprovados novamente, types=0 lint=0, sessão 79823
  encerrada; manual-stage-final-types-20261021.log e manual-stage-final-lint-20261021.log.
  Última alteração posterior só fortalece asserções da fixture de rota; lint atual
  dela aprovado. Snapshot de 13 arquivos em manual-stage-final-snapshot-20261021.json.
- Repetição isolada/sequencial dos workers frios aprovada: **2/2 em 52,86s**,
  cold_exit=0, sessão 59909 encerrada, manual-stage-cold-recovery-isolated-20261021.log.
  Casos completos 14,99s e 15,28s; worker de estágio consumer_finished=8.955ms.
  Limites originais de 25s preservados, nenhum processo estático concorrente.
- Ampla sequencial aprovada: **206/206 em 766,89s**, zero falhas/skips/cancelamentos,
  regression_exit=0, sessão 54256 encerrada, manual-stage-producers-regression-
  sequential-20261021.log. Todos os casos antigos e cinco novos; não somar execuções.
  Recuperação de proposta 17,62s; etapa 6,32s (worker runtime_loaded=2.450ms,
  consumer_finished=4.573ms), dentro dos mesmos 25s. Concorrência de negócio
  permanece nos casos explícitos; arquivos sequenciais evitam disputa com estático.
  Não aprova capacidade sob carga nem apaga a ampla concorrente 199/201 reprovada.
- Hash audit encontrou alterações concorrentes às 01h44 em manual-update e nas
  duas rotas, posteriores ao snapshot/tipos anteriores, ANTES do início da ampla
  sequencial: outro trabalho integrou assertPipelineStageExists e respostas de
  etapa/funil inválidos. Preservadas ocorrência/ownership/fan-out/capacidade desta
  unidade. Sem sobrescrever. Snapshot combinado atual de 14 arquivos (inclui
  pipeline.ts) em manual-stage-combined-snapshot-20261021.json; tipos anteriores
  não aprovam automaticamente essa revisão. Revalidar tipos/lint após ampla,
  sem concorrer com os workers frios. Verificar drift ao terminar.
- Drift final de 1 arquivo: rota de perfil recebeu às 01h55 a proteção de conflito
  de exclusão/reaquisição de acesso de outro trabalho (DELETE/import), preservando
  PATCH e esta integração. tenant-data-deletion também evoluiu fora desta unidade;
  não sobrescrito nem transportar aprovação antiga 90/90 para esse novo helper.
  Regressão direcionada atual (rotas + raízes/legado/outbox/lixeira) sessão 27467,
  manual-stage-current-integration-20261021.log. Tipos/lint combinados sessão 57999,
  manual-stage-combined-types-20261021.log/manual-stage-combined-lint-20261021.log.
  Snapshot atual de 15 arquivos em manual-stage-current-snapshot-20261021.json.
- Complementar anterior 30/39, current_integration_exit=1, sessão 27467 encerrada:
  falta de configuração global dos emuladores no comando fez tenant-trash buscar
  ADC (sem credenciais disponíveis, sem prova de operação real); preparação Auth
  retornou uid-already-exists e impediu os cinco casos de rota. Demais 30 casos
  de raízes/outbox passaram. São falhas da preparação local, não incidentes reais
  nem motivo para retirar asserções. Outro trabalho também evoluiu o helper de
  exclusão às 02h00, durante essa execução; preservar hash/histórico.
- Fixture de rota ganhou sufixo UUID para isolar execuções. Comando complementar
  agora configura explicitamente todos os emuladores loopback e limpa credenciais,
  como a ampla antiga; arquivos sequenciais, sem alterar prazos/asserções.
  Repetição aprovada: **38/38 em 147,03s**, zero falhas/skips/cancelamentos,
  current_integration_exit=0, sessão 97625 encerrada;
  manual-stage-current-integration-final-20261021.log.
  Tipos/lint atuais aprovados, types=0 lint=0, sessão 68089 encerrada;
  manual-stage-current-types-20261021.log/manual-stage-current-lint-20261021.log.
  Snapshot conferido ao final: **verified_drift=0** nos 15 arquivos. SHA256 do
  manifesto manual-stage-verified-snapshot-20261021.json:
  a2678cb1c80a806652bd1180718bc7422c1065f9331d2cebe7e733a363e927da.
  manual-update.ts 28912139503dc84dce3cb42b512fef170e3cb0e5a9da2159197ba090c8a19d4f;
  manual-stage-transition.ts 1e7497a04a099555e94c78935d5e4fb42cf50c0e56cd60dceb15ab6370e2c552;
  stage-source-contract.ts 1fb2869a27223e52350ed085a3390f6f3660305d8e9073fa1ecbab88448e2c99.
  Diff check exit=0. Não somar 206/206, 38/38 e específicos: há sobreposição.
- Capacidade: ocorrência manual transacional, recuperação antes de efeitos,
  efeitos com recibo/outbox e agendas causais **implementados e testados localmente**.
  Publicados: não. Comprovados em operação real: não. Aprendizado/trilha/conversões
  e dossiê ainda seguem hooks antigos; recibo da raiz não diz que foram concluídos.
  Não representa qualidade conversacional nem aprovação da família inteira/B.
- B/gate 2 permanecem abertos. Próxima unidade concreta: recordInboundLead em
  lead-intake.ts já grava evento no commit, mas após perfil só chama lead_created
  quando created=true. Reproduzir interrupção nessa fronteira (e skip explícito)
  usando o evento existente; criar causa durável/consumo com prova, sem usar leadId
  como toda intenção, fingir proposta/pedido, duplicar contato ou perder workflows.
  Demais entradas de criação, financeiro e retomada parcial/legado/retenção/
  concorrência/capacidade continuam pendentes antes de C→G. Fontes/restrições da
  missão mantidas, sem novo planejamento, publicação ou gasto de modelo.
- Nenhum teste/estático próprio ativo no fechamento; emuladores e processos
  de outros trabalhos preservados. Sem subagentes, reset ou alterações próprias
  admin/auth/público. Build global não executado no checkout compartilhado.

## Unidade local — B, lixeira legada e retomada sem sobrescrever trabalho humano — 21/10/2026

- Implementado em tenant-data-deletion.ts: absorção paginada/transacional de jobs
  sem chatId omitidos por manifestos antigos de lead. IDs/recibos preservados;
  contagem e remoção das cópias vivas no mesmo commit. Restore/purge revisam apenas
  o manifesto selecionado; nenhum saneamento de dados reais executado.
- Baseline legado 0/2, legacy-trash-baseline-20261021.log. Ampliação intermediária
  13/13, legacy-trash-expanded-20261021.log. Falhas são injetadas em emulador.
- Retomada após confirmação perdida reproduzida: baseline corrigido 0/1,
  legacy-restore-ack-baseline-corrected-20261021.log. Primeiro log preservado
  com falha adicional de fixture (probe BulkWriter não fechado), corrigida sem
  reduzir asserção. Guarda anterior confundia o próprio lead restaurado com recriação.
- Lead restaurado recebe proveniência; retomada compara o conteúdo esperado e
  recusa alterações humanas, jobs novos/divergentes e cliente recriado. Restore
  agora cria registros ausentes e usa versão de escrita nos existentes; conflitos
  preservam manifesto para revisão, sem sobrescrita cega. Pendentes ficam em
  reconciliation_required; recibos terminais mantêm prova e identidade.
- Específico aprovado: **15/15 em 45,91s**, tests_exit=0, sessão 20408 encerrada;
  .qa-artifacts/legacy-trash-resume-final-20261021.log. Inclui isolamento de tenant,
  purge/certificado, cópias idênticas/divergentes, rollback de arquivo, 206 jobs em
  páginas com perda de confirmação e retomada da restauração/edição humana.
- Snapshot SHA256 tenant-data-deletion.ts
  9de49bcbd8ac47626ae1b4c98bc51e4be83c7c7969b9bef3bcbe3bc021c153d3;
  crm-stage-trash.emulator.mts
  77ebb6d6c2ed0bb3dec1e7e7e87b7394947cfa9098abc9bae1ed071d5e0ffe7e.
- Tipos e lint aprovados, types=0 lint=0, sessão 47625 encerrada;
  legacy-trash-types-20261021.log e legacy-trash-lint-20261021.log.
- Regressão de dez arquivos aprovada: **90/90 em 240,17s**, zero falhas/skips/
  cancelamentos, regression_exit=0, sessão 42780 encerrada;
  .qa-artifacts/legacy-trash-regression-20261021.log. Não somar específicos nem
  repetir ampla sem nova alteração/falha. Fontes mantidas durante execução.
- Sem publicação, modelo pago, cliente real ou mudança admin/auth/público.
  B permanece aberto. Próxima unidade concreta: causa durável da mudança manual
  de etapa, hoje commitManualLeadPatch grava evento mas retorna sem identidade e
  a rota executa runLeadAutomations depois do commit/perfil. Reproduzir interrupção
  nessa fronteira e evoluir contrato reaproveitando o motor existente, mantendo
  versão/acesso/decisão humana. Exclusão concorrente/captura, ingresso após expurgo e recuperação
  integral de hooks continuam pendentes, sem declarar migração geral aprovada.
- Nenhum teste/estático próprio ativo no fechamento; emuladores preservados.

## Publicação restrita autorizada no chat de origem — 21/10/2026

- Usuário pediu publicar o que já pode. Fonte pública atual inspecionada ao vivo,
  posterior à passagem: dpl_Cf6MVguX1UQnUYaTSfKwVaetECwv. Não foi sobrescrita com
  snapshot histórico nem com checkout compartilhado. Documentação/evidências em
  [PUBLICACAO_IA_PEDIDOS_2026-10-21.md](PUBLICACAO_IA_PEDIDOS_2026-10-21.md).
- Publicado somente lib/server/crm/order-stage-transition.ts, SHA256 afb77e7c03465c98f568d5ae854f59587ca0e09ff15c6fb6df5a4e764aa16d61,
  versão dpl_C7LYkuFPnHrujsnL4TERxK4Nhh8o, 00h40 de Brasília. Build remoto READY,
  promoção e fontes/HTTP conferidos; demais 1.512 arquivos preservados por hash.
- Patch isola falha de leitura/admissão/pré-claim/lote; não ativa o novo produtor
  geral nem migração de IA. O consumidor periódico já publicado usa esse helper.
  Agente, telas, mídia, admin/auth, dependências, regras/índices e catálogo intactos.
- Prova na árvore de produção: baseline 6/16, candidata 10/16; quatro falhas
  corrigidas, seis idênticas preservadas e nenhuma passagem virou falha. Cinco
  contratos “order pipeline” aprovados, repetidos 5/5; regressão pura 14/14,
  tipagem runtime e lint aprovados. Suíte maior NÃO aprovada; TS2339 da fixture
  completa depende de agendamento não publicado, diagnóstico mantido. Sem reduzir
  asserções, chamar 16/16 ou transportar a aprovação 83/83 para esta árvore diferente.
- B/gate 2 e seis falhas dos produtores/etapas legados continuam abertos. Nenhum
  novo modelo, memória ou aprendizado publicado como conjunto. Sem mensagem de
  teste a cliente, gasto de modelo, operação Shopify real ou migração de dados.
- Implementação continua no chat de destino; o chat de origem não alterou fontes
  compartilhadas do aplicativo nem iniciou missão/agendamento concorrente. Antes
  de próxima release, usar esta base ou a que estiver realmente ativa, não 19/10.

## Aprovação local restrita — B/C13-C16, confirmação tardia sem ressuscitar conversa — 21/10/2026

- Turno anterior: progresso, entrega restaurada protegida, 27/27 locais. Emuladores
  8080/9099/9199 confirmados prontos, nenhum teste/estático anterior ativo na entrada.
- Baseline 0/1 em 8,43s, deleted-inflight-baseline-20261021.log: excluir chat
  durante chamada ao provedor fictício permite que chat-dispatch recrie conversa
  e mensagem após retorno. Nenhum incidente de produção inferido.
- Persistência de texto, template e mídia no dispatcher agora usa transação
  única de confirmação/resumo/pausa, validando existência/tenant da conversa.
  Sem conversa ativa, confirmação só atualiza mensagem/job já presentes em UM
  manifesto ativo/completo do mesmo tenant/chat, com IDs e tentativa provados.
  Não recria mensagem/conversa/state nem observação CRM. Recibo é preservado na
  lixeira e job arquivado fica completed; restaurar não reenvia. Helpers diretos
  sem mensagem/tentativa arquivadas recusam a gravação, sem inventar prova.
- Identidade antiga de snapshot SHA256 preservada e extraída para módulo leve
  tenant-trash-identity.ts, compartilhado com exclusão. Sem nova fila/coleção.
- Primeira verificação só com helper não resolveu (chatRef.set ainda paralelo);
  depois da integração no dispatcher, 1/1 em 7,78s. Ampliação 13/13 em 22,40s:
  template/documento, exclusão de lead com manifesto filho, ambiguidades e
  controles anteriores. Baseline adicional de integridade 1/2 expôs necessidade
  de vincular providerAttemptId ao leaseToken arquivado; corrigido, específico
  final 15/15 em 21,90s (73055 exit=0). Provedor/transportes sempre fictícios.
- Primeira ampla 10 arquivos: 77/80 em 156,67s, exit=1 (80741 terminal).
  Três fixtures antigas de whatsapp-delivery-status criavam confirmação sem
  cadastrar chat. Preparação corrigida para chat do tenant/ID únicos, preservando
  todas as asserções de números/tenant/vínculo/histórico paginado/falha/read.
  Não liberar escrita sem conversa para fazer os testes passarem.
- Repetição ampla concluída: **80/80 em 128,93s**, zero falhas/skips/cancelamentos,
  regression_exit=0, sessão 56854 encerrada; log
  .qa-artifacts/deleted-inflight-release-regression-final-20261021.log.
  Mesmos dez arquivos/80 testes da ampla anterior, sem somar específicos ou apagar
  77/80. Inclui canais sociais, IA/site/Evolution, templates, mídia, lixeira,
  sete interrupções de processo e recibos antecipados/legados/reconciliação.
- Estáticos finais types=0/lint=0, sem erros/avisos, sessão 40798 encerrada;
  logs deleted-inflight-types-release-20261021.log e deleted-inflight-lint-release-20261021.log.
  Tipagem inclui a fixture de recibos alterada. Diff check sem erro (aviso LF/CRLF).
- Sete hashes estáveis na repetição:
  chat-dispatch.ts d01da2a475bfc50e439e423c2f303f0bed3d865b53fe4bbb362e5f6ee3b040e9;
  chat-message-acknowledgement.ts 9f740cb4727fad10a03131e1de34a6b9189f404506d7ec0e68358f314d962991;
  tenant-data-deletion.ts 26cb07a3693d2affe5196849d06fe78755e18b1b0244894b96e4112c852ffdcb;
  tenant-trash-identity.ts 47a24a17709afecf9c85e65f907c93cfa92175eef7cee7f3c5b9a7a32a3687e4;
  chat-outbound-trash.emulator.mts b293fa85991d17369f43442ddc7aec2daddf2fd62ab564cd8eceaf301b3a279e;
  whatsapp-delivery-status.emulator.mts 7139e4d9f24c0cdbf51cfe793b7ae7367e279551731d7b01e38c729cd28970a8;
  tsconfig.automation-delivery.json bd2026969c76d2edd06e1ae39c95ee1339036155fd27aa7587e0c193b832408c.
- Registro concorrente de publicação restrita no chat de origem foi acrescentado
  ao topo deste documento durante a validação; preservado. Não é release desta
  unidade nem inspeção de produção por este chat. Nenhuma fonte testada mudou.
- Sem build global, publicação, modelo pago, dados reais ou mudança admin/auth/
  público. B/gate 2 abertos; não é agente novo ou qualidade conversacional.
- Limites/PRÓXIMO: manifests antigos de lead que omitiram raízes/recibos ainda
  exigem reprodução/migração segura; não promover dado antigo por haver este patch.
  Também permanecem replay de ingresso/tombstones, corrida excluir versus captura
  inicial de manifesto, histórico de recibos após expurgo, demais produtores e
  recuperação integral de hooks. Helpers sem tentativa arquivada, manifesto
  ausente/ambíguo ou identidade divergente recusam escrita, sem criar recibo falso.
  Não comprovados produção, UI ou APIs reais. Próxima unidade: reproduzir restauração
  de manifesto legado que omite raiz ready e preservar seus recibos sem reativá-la.
- Nenhum teste/estático próprio ativo no fechamento; emuladores preservados.

## Aprovação local restrita — B/C13-C16, entrega restaurada exige revisão — 21/10/2026

- Turno anterior: progresso concreto, raízes/recibos sem chatId na lixeira e
  regressão 8/8, não aprovação de B. Fonte/estado/processos atuais conferidos;
  mesmos emuladores prontos em 8080/9099/9199, sem teste/estático próprio ativo.
- Novo tests/chat-outbound-trash.emulator.mts percorre enqueue, delete chat/lead,
  restore e consumidor reais; Meta interceptado com dados fictícios e sem pass-through
  externo. Baseline **1/4 em 23,19s**, exit=1, sessão 90027 encerrada:
  restaurar chat ou lead permite envio pendente ao provedor fictício; snapshot
  processing continua processing. Concluído já preservava recibo. Log
  .qa-artifacts/outbound-trash-baseline-20261021.log; não é incidente em produção.
- restoredDocument agora trata chat_outbound_jobs ready/pending/retrying/processing
  como reconciliation_required, preservando IDs/tentativas/fences e registrando
  RESTORED_DELIVERY_REQUIRES_REVIEW/restored_from_trash. Não inventa falha/aceite
  do provedor. Mensagem correspondente no MESMO manifesto, tenant/chat/messageId
  fica pending_confirmation; recibos sent/delivered/read não são rebaixados.
  Jobs/recibos terminais permanecem iguais, exceto restoredAt já existente.
- Primeira correção **4/4 em 57,74s**, sessão 60092 exit=0. Ampliação **8/8 em
  43,75s**, sessão 49745 exit=0: legado retrying sem protocolo de fence; reenvio
  humano confirmado reutiliza mesmo slot e envia só uma vez; excluir/restaurar
  durante a chamada do provedor conserva fence/recibo e não reativa lease; read
  antecipado preservado. Provedor sempre falso, não Meta real.
- Regressão quatro arquivos: tenant-trash, crm-stage-trash, chat-outbound-trash e
  chat-outbound-crash-recovery: **27/27 em 105,48s**, zero falhas/skips/cancelamentos,
  regression_exit=0, sessão 91522 encerrada. Log outbound-trash-regression-20261021.log.
  Inclui 2.001 mensagens/anexos, expurgo demo, sete interrupções após aceite de
  texto/template/mídia/voz/material/handoff e controle de posse/fence. Não somar
  lotes sobrepostos nem apresentar como nova ampla de 412.
- Tipagem ampliada (novo teste no tsconfig) e lint de runtime/teste aprovados,
  types=0/lint=0, sessão 74173 encerrada. Logs outbound-trash-types-20261021.log
  e outbound-trash-lint-20261021.log. Diff check sem erro, aviso LF/CRLF apenas.
- Hashes estáveis: tenant-data-deletion.ts
  5deec9451248ff1371bd5386ccf5128f289e3b3369d9d1464ae070b6eb0ab5b5;
  chat-outbound-trash.emulator.mts
  61cee429fe3a5dd19231c87c7d5ca474dc0993c113b14cbed508e5db4f857fc8;
  tsconfig.automation-delivery.json
  c6088cef7aaa4798228a1fc9dedeb53f20f17fd319f1ebc196498d90af69922e.
  chat-outbound.ts permaneceu intacto no hash
  671a84ccc5c169647e7b495a66cfc16bbfe24b8296ec1f960ea2679b25616179.
- Limites/PRÓXIMO: excluir durante envio SEM restaurar ainda não foi reproduzido;
  chat-dispatch grava confirmação/resumo após provedor e exige sonda para verificar
  eventual recriação indevida. Também faltam manifestações históricas de lead que
  omitiram raízes/recibos, replay de ingresso, tombstones e retomada/migração.
  O teste legado desta unidade cobre documento de outbox sem fence, não migração
  de manifests incompletos nem todas as coleções/produtores. B/gate 2 ABERTOS.
- Sem teste/estático próprio ativo, emuladores preservados. Sem build global,
  publicação, chamada paga, dados reais, admin/auth/público ou alterações Shopify/
  mídia alheias. Não é entrega do agente novo nem prova de naturalidade; C–G pendentes.

## Aprovação local restrita — B/C10-C16, lixeira de raízes e recibos sem chatId — 21/10/2026

- Missão ativa neste destino; continuidade reativada por pedido humano, ver seção
  abaixo. Progresso de produto continua sendo IA da Altum, Shopify primeiro recorte.
- Criado tests/crm-stage-trash.emulator.mts com eventos/pedido, commit e consumidor
  reais em demo-altum-qa-lab, sem chat, ferramentas/canal/modelo externos. Transporte
  externo recusado; limpeza apenas dos tenants aleatórios qa_stage_trash_ criados.
- Primeira sonda 0/2: primeiro caso não comprovava o defeito porque fixture omitia
  origem usada em conditions.sourceIn e não criava recibos. Corrigido só o preparo,
  mantendo asserções. Baseline correto **0/2 em 11,93s**, exit=1, sessão 15019
  encerrada, log stage-trash-baseline-fixture-corrected-20261021.log: três jobs
  (raiz/recibos) ficam ativos após excluir o lead; restaurar lead com raiz ready
  permite execução antiga sem nova autorização. É reprodução local, não incidente real.
- tenant-data-deletion agora coleta jobs por tenant/lead sem chatId no manifesto
  do lead; jobs com chatId continuam pertencendo ao manifesto filho da conversa,
  sem duplicar o mesmo documento nos dois manifestos. Mantém IDs/recibos concluídos.
  restoreRef conserva terminal e transforma jobs ready/pending/retrying/processing
  em reconciliation_required, preservando tentativas e evidência anterior, com
  status anterior/trashId registrados. Restaurar registros não autoriza ação antiga.
- Primeiro fix **2/2 em 10,96s**, exit=0, sessão 89528. Ampliação **5/5 em 12,10s**,
  sessão 62068 exit=0: comparação exata dos recibos concluídos (exceto restoredAt),
  trabalho interno agendado real com chatId=null, efeito interrompido/tentativa,
  isolamento de recibo estrangeiro com mesmo leadId e não reexecução no consumidor.
- Regressão com tenant-trash existente: **8/8 em 53,66s**, zero falhas/skips/
  cancelamentos, regression_exit=0, sessão 16796 encerrada. Inclui restauração de
  2.001 mensagens/anexos, expurgo Storage demo/certificado e manifesto incompleto.
  Log .qa-artifacts/stage-trash-regression-20261021.log; 5/5 sobreposto não se soma.
- Tipagem ampliada (incluindo teste novo no tsconfig.automation-delivery) e lint
  dos dois arquivos aprovados: types=0/lint=0, sessão 74871 encerrada. Logs
  stage-trash-types-20261021.log e stage-trash-lint-20261021.log. Diff check aprovado.
- Hashes estáveis: tenant-data-deletion.ts
  32b8fdaf6771c8af2b273f3466cf390092cd190300a74b4d6e58afbfc6fba7f1;
  crm-stage-trash.emulator.mts
  2a3932c0f1e3334e7b74926b709f4dbb7f9d50dbecd851235a11c2fcc36d4ad5;
  tsconfig.automation-delivery.json
  09b86710b1e78498e96ae2b1344107bbb8cd181a504e1447d48217eeefe2a674.
- Limites: não cobre todos os produtores/coleções, migração dos manifests antigos,
  replay de ingresso recriando lead, tombstones, corrida entre excluir/restaurar e
  worker em voo, nem outbox de conversa já aceita após restauração. Não limpar
  dados reais, converter legado ou declarar lixeira/retencão integralmente aprovada.
  Próxima unidade B: reproduzir revogação de entrega já aceita ao excluir/restaurar
  lead/conversa e compatibilidade com manifestos anteriores antes de nova correção.
- Sem teste/estático próprio ativo. Emuladores existentes preservados. Sem build
  global, deploy, novo gasto, dados reais, mudanças admin/auth/público ou pacote
  Shopify/mídia alheio. B/gate 2 ABERTOS; C–G/qualidade integrada pendentes.

## Missão e continuidade reativadas por pedido humano — 21/10/2026

- Usuário autorizou missão até tudo pronto. get_goal neste chat retornou null;
  criado objetivo persistente deste destino, ACTIVE confirmado, sem alterar o
  objetivo pausado do histórico. Missão completa e aceite final preservados.
- Automação existente lida, atualizada e confirmada ACTIVE; nome corrigido para
  “Concluir a transformação da IA da Altum”, mesmo intervalo 15 min e destino.
  Objetivo geral Altum; Shopify primeiro recorte. Sem nova automação concorrente.
- Continuidade segue após revisão e correção 83/83. Emuladores existentes
  8080/9099/9199 conferidos prontos; próxima unidade B é reprodução de lixeira
  para raízes/recibos por lead sem chatId. Sem alegação de qualidade já entregue.

## Revisão e continuidade local autorizadas no chat de destino — 20/10/2026

- Usuário esclareceu objetivo: melhorar a IA da Altum, com Shopify como primeiro
  recorte de validação; pediu avaliar feito/pendente/evolução antes de corrigir
  erros e continuar. Revisão registrada em AI_ATTENDANCE_RESUMPTION_AUDIT_2026-10-20.md
  e ligada à missão. Sem novo objetivo, agendamento ou remoção automática das pausas.
- Conferidos plano original, reconstrução, gate, auditorias, código e logs. Há
  publicação posterior de Conversas documentada em PUBLICACAO_CONVERSAS_2026-10-20.md:
  recibos locais confirmam pacote de 115 arquivos, versão dpl_Ai2Ldw1KfA7n7PydByigDHNzcJLk;
  não inclui toda a migração de IA nem os consumidores Shopify adicionais. Não
  consultamos produção ao vivo nem declaramos o checkout inteiro publicado.
- Hashes de pedido/teste na entrada iguais aos da passagem; log anterior 2/3
  confirmado. Isolamento por item/contador failed implementado em
  processPendingOrderPipelineTransitions: não escreve estado em catch, preserva
  ready/attempts em erro pré-claim e não reabre efeitos iniciados/incertos.
- Dois testes acrescentados: erro desconhecido preserva identidade e estado,
  contabiliza falha no lote e retoma sem duplicar; configurações inválida,
  estrangeira e ambígua recusadas na admissão/pré-claim. Preservados os três
  testes originais e casos humanos, efeito iniciado/parcial, replay e agendados.
- Emuladores ausentes na entrada. Tentativa com CLI antiga em cache ficou sem
  prontidão e foi encerrada somente no processo próprio; iniciada CLI 15.29.0
  já em cache, projeto demo-altum-qa-lab. Testes começaram só após confirmação
  de prontidão de Auth/Firestore/Storage. Transporte externo bloqueado na fixture.
- Arquivo completo crm-stage-transition.emulator.mts: **83/83 em 196,86s**,
  zero falhas/skips/cancelamentos, regression_exit=0, sessão 99412 encerrada.
  Log .qa-artifacts/resumption-order-regression-20261020.log. Inclui a unidade
  anterior 2/3 agora aprovada e testes novos, sem reduzir asserções/timeouts.
- Classificador puro: **2/2**, .qa-artifacts/resumption-pipeline-contract-20261020.log.
  Tipagem ampliada e lint dos dois arquivos: types=0/lint=0, sessão 63825
  encerrada, logs resumption-order-types-20261020.log e resumption-order-lint-20261020.log.
  Mensagens QA_STAGE_QUEUE_COMMIT_UNAVAILABLE no log são falhas injetadas dos
  cenários de efeito parcial; resultado final aprovado. Logs históricos preservados.
- Hashes estáveis durante a regressão: order-stage-transition.ts
  afb77e7c03465c98f568d5ae854f59587ca0e09ff15c6fb6df5a4e764aa16d61;
  crm-stage-transition.emulator.mts
  0a59e3558aaf104828412ff2e1b9f571568338997af0099fb0855ec1597703f1.
- Aprovação local restrita desta unidade, não repetição da ampla anterior de
  19 arquivos/412 nem aprovação de B ou release. Sem build global, publicação,
  gasto/modelo, dados reais, alteração admin/auth/público/mídia ou mudanças alheias.
  Emuladores locais próprios prontos, sessão 37476; nenhum teste/estático próprio ativo.
- Próximo: reproduzir exclusão/restauração/invalidação de raízes/recibos por lead
  sem chatId antes de mudar lixeira; depois recuperação parcial e produtores
  restantes pelo inventário B. B/gate 2 ABERTOS; C–G e qualidade integrada pendentes.

## Passagem de chat solicitada — 20/10/2026

Estado atual de execução confirmado no aplicativo: objetivo persistente PAUSED e
automação concluir-atendimento-ia-shopify-da-altum PAUSED. Os registros ACTIVE
abaixo são históricos, não estado atual. Nenhum objetivo concluído ou substituído.
Passagem retomável em [AI_ATTENDANCE_CHAT_HANDOFF_2026-10-20.md](AI_ATTENDANCE_CHAT_HANDOFF_2026-10-20.md).
Ela fixa B aberta, a ampla anterior 412/412 e a unidade atual ainda 2/3, sem publicação.
Portas locais 8080/9099/9199 sem listener na conferência desta passagem; não presumir
emuladores ativos pelos identificadores históricos. Não iniciar nova implementação
neste chat em paralelo ao destino. Novo chat primeiro confirma recepção e aguarda
comando humano para retomar; nenhuma pausa foi removida por esta preparação.
Destino criado e leitura iniciada: Atendimento IA Shopify — continuidade da
implementação, 01a15c2f-6a31-7a93-b4ba-62c32d932d11, projeto ALTUM local. Automação
existente redirecionada para o destino, PAUSED e mesma frequência preservados,
verificados após atualização. Sem objetivo novo/concluído, sem mudança de código,
teste funcional adicional, chamada paga, publicação ou acesso à loja nesta passagem.

## Continuidade configurada

Missão persistente correta criada em 19/10/2026 e confirmada ATIVA pelo aplicativo:
reconstruir atendimento Shopify e continuar além do MVP até qualidade comprovada.
O objetivo antigo de Conversas não é mais o objetivo ativo desta execução; seu
backlog permanece registrado, não concluído. A criação da nova missão foi progresso
de estado; esta retomada inicia implementação do contrato de avaliação da etapa A.

Automação na mesma conversa: `concluir-atendimento-ia-shopify-da-altum`.
Criação confirmada pelo aplicativo com estado ACTIVE, intervalo solicitado de
15 minutos. Isso comprova agendamento, não implementação, qualidade ou execução
ininterrupta. Trabalho local depende de computador ligado, aplicativo em execução,
projeto acessível e limites/permissões disponíveis.

Histórico: a automação acima foi criada antes do esclarecimento do usuário; não é
a missão persistente. Nenhuma automação adicional foi criada nesta retomada.

## Situação real

- Etapa A: encerrada em diagnóstico/contratos após auditoria e correção da divisão
  autorizada pelo usuário; ver AI_REBUILD_STAGE_A_EXIT_AUDIT.md.
- Etapa B: primeira implementação local em validação; gate 2 permanece aberto.
- Marco 1 (entrega integrada inicial): não comprovado.
- Marco 2 (qualidade final sustentada): não comprovado.
- Plano revisado, missão e recorte Shopify documentados e interligados.
- Nenhum motor novo entregue; um cenário de desenvolvimento já percorreu handler
  com inferência paga parcial; três outros foram exercitados com modelo simulado,
  incluindo correção/retomada com processos novos entre mensagens.
  Corpus integral e revisão de qualidade não comprovados.
- Nenhuma alteração de produção, envio a cliente ou escrita Shopify realizada.

## Incidente relatado — mídia na produção, 20/10/2026

- Cliente relata que áudio, imagem e vídeo antes funcionavam e agora não funcionam;
  confirmou ambiente publicado. Prioridade passa a ser investigar/restaurar o fluxo
  existente antes de novas evoluções da IA. A postergação anterior de áudio não
  significa autorização para ignorar regressão relatada de função existente.
- Domínio altumia.com.br consultado pelo conector Vercel: projeto altum esperado,
  deployment dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh, READY/production. CLI confirmou
  projeto/team correspondentes ao vínculo local. Histórico de publicação restrita
  no CLIENT_RELEASE_READINESS_2026-10-19.md não comprova mídia funcionando.
- Logs de mídia em 2h recusados por retenção Hobby; repetição limitada a 30m não
  retornou registros com filtro midia. Consulta CLI de erros de produção em 30m
  também sem registros. Isso é lacuna de evidência, não prova de ausência de falha.
- Inspecionados hook protegido de mídia, upload/persistência, endpoint de leitura
  e envio armazenado. Checkout local tem alterações não publicadas; não atribuir
  comportamento em produção ao arquivo local sem comparar o pacote efetivo.
- Ainda necessário identificar o trecho afetado (receber/enviar/abrir), tentativa
  recente e erro/captura; sem senha/token nem envio incidental a cliente. Não houve
  alteração de fonte, deploy, rollback ou regra de acesso nesta investigação.
  Não reproduzido ainda; causa e correção não comprovadas. Continuidade da missão
  deve priorizar este incidente, não retomar workers frios como se nada houvesse.
- Retomada 16:03 UTC: manifesto e recibos da publicação restrita conferidos. A
  pasta source do recibo contém somente os quatro arquivos de IA modificados;
  não é snapshot integral e não foi usada como se contivesse as rotas de mídia.
  Recuperado o conteúdo REAL da rota de leitura da implantação, pelo SHA
  df5ee47143e7838f5dd81a305c48e80f1336bfd4. Resposta MCP truncava base64 a 2014
  caracteres; detectado e descartado o trecho incompleto, não interpretado como
  fonte corrompida. Fallback CLI autorizado GET retornou conteúdo integral.
  Comparação normalizando apenas CRLF→LF: rota publicada e local idênticas,
  16.472 caracteres cada. Portanto este consumidor pode ser inspecionado localmente
  sem fingir que as demais mudanças locais foram publicadas.
- Recuperado também o hook useProtectedMessageMedia da implantação (arquivo SHA
  1b6885b9fdd88c7185cee7e1ed082d546e852b8a): áudio usa bytes autenticados/Blob;
  imagem/vídeo usam resolução de URL e fallback por bytes caso a resolução falhe.
  Espera de restauração Auth limitada, validade da URL e cache/conversão são
  hipóteses a investigar, não causas demonstradas para o relato do cliente.
- Consulta de clusters de erros da hospedagem nos últimos 30m não retornou erros.
  HEAD público no Inbox respondeu 200 e CSP permite blob em img-src/media-src,
  self e os destinos Storage declarados. Não há base para desativar CSP/permissões.
  Nenhum conteúdo de conversa, token, arquivo privado ou cliente real acessado.
  Sem sessão de navegador autenticada disponível nesta execução; não contornar
  login/proteção. Mantida a solicitação anterior de exemplo/trecho afetado, sem
  repetir a pergunta. Não houve correção suposta, envio, deploy ou rollback.
- Retomada 16:18 UTC — unidade C13/C16, leitura de mídia autenticada: criado
  tests/chat-media-read.emulator.mts para percorrer GET real, Auth/Firestore demo,
  metadados/download Meta simulados e falha de cache injetada. Primeiro fixture
  omitiu host Storage e importou um protótipo ESM diferente do usado pelo Admin:
  injeção não aconteceu, SDK tentou bucket demo inexistente e recebeu 404. Esse
  lote (3/6) não comprova a injeção pretendida, não é evidência de causa em produção
  e não deve ser divulgado como teste inteiramente isolado. Nenhum envio WhatsApp
  foi feito e não há prova de gravação de cache nesse bucket. Corrigido o fixture:
  Storage explícito em loopback, protótipo obtido da instância REAL do Admin e
  gravações inesperadas recusadas, sem carregar segredos/credenciais reais.
- Baseline isolado correto: **3/6 em 18,98 s**, três falhas HTTP 500 após bytes
  recebidos do provedor, com QA_CACHE_WRITE_UNAVAILABLE exatamente no cache.
  Autenticação, outra conversa e outro vendedor foram recusados antes de fetch.
  Log .qa-artifacts/media-read-cache-baseline-isolated-20261020.log. Defeito
  reproduzido na rota cujo conteúdo publicado foi comparado integralmente.
  Isto comprova uma falha POSSÍVEL neste código, ainda não a causa do caso real.
- Corrigida a região cache/atualização de metadados após download Meta: falha nessa
  cópia opcional registra aviso com código mínimo e permite devolver os bytes já
  autorizados, sem inventar caminho salvo, baixar arquivo de outra conta ou ocultar
  falha do download original. Não altera login, validações tenant/vendedor/canal,
  formatos, envio, roteador, admin nem regras. Primeiro lote após correção:
  **6/6 em 26,51 s**, mesmo cenário/asserções, zero skips. Log
  .qa-artifacts/media-read-cache-fixed-20261020.log. Fixtures verificam transporte
  e conteúdo da resposta; não são aceitação de codecs/player/browser.
- Acrescentados casos de tenant/canal alheios e erro de download original; regressão
  com quatro arquivos de mídia iniciada, log
  .qa-artifacts/media-read-cache-regression-20261020.log. Tipagem/lint iniciados na
  sessão 46905, log media-read-cache-static-20261020.log; repetir tipagem para a
  revisão final do teste, que foi ampliado após início da verificação. Sem deploy,
  piloto, envio a cliente, modelo pago, transcodificação nova ou alegação de solução
  do incidente em produção. A evidência/captura anterior continua necessária.
- Retomada 16:33 UTC: sessões 46905 e 15143 concluídas. Regressão dos quatro
  arquivos **26/26 em 132,58 s**, sem skips/cancelamentos, incluindo os nove casos
  novos de leitura e contratos anteriores de envio/admissão/imutabilidade. O
  download original indisponível continua HTTP 500; falha de cache não mascara
  essa condição. Tipagem anterior terminou sem erro; ESLint teve apenas aviso de
  variável usada como tipo no fixture. Removida essa variável, sem alterar teste
  ou implementação; nova checagem final sessão 53751, log
  media-read-cache-static-final-20261020.log. Repetição dos nove casos após higiene
  de tipos sessão 48487, log media-read-cache-final-20261020.log. Não duplicar.
- Hashes SHA256 desta correção local em validação: rota
  `726671a2f5bf1d7c9f2bf857d06180a3c2d07d99d43a513ddc9732cfb486d1a8`;
  teste `b984fff8d19c16f9194659ee89b6b4ce5ce22483f0d6a2da4d9f60c3068e429e`;
  tsconfig `4bd231806c697e75fa98ba0bf6cc99c7d19a7928e4d00ba01d1f886b12d3d54f`.
  Diff check sem erros, apenas aviso LF/CRLF. Build concorrente de outro trabalho
  encontrado (processos 7396/11432), preservado, sem iniciar build duplicado.
  Nenhuma nova publicação nem validação autenticada no domínio. O relato concreto
  do cliente ainda não foi reproduzido; não apresentar 26/26 como cura universal.
- Fechamento técnico desta unidade: repetição final **9/9 em 51,09 s**, zero
  skips/falhas, sessão 48487 encerrada. Tipagem/ESLint finais terminaram com código
  zero, sem erros/avisos, sessão 53751 encerrada; log estático vazio confirmado por
  recibo de término, não por inferência. Sem teste próprio pendente. O código de
  runtime é o mesmo do lote 26/26; ajuste posterior foi somente remover variável
  desnecessária do fixture, preservando as nove asserções/cenários.
- Manifesto de correção restrita em
  .qa-artifacts/media-read-cache-hotfix-20261020.json: um único arquivo de runtime,
  âncora no blob publicado, hash local e logs. Não é deployment nem autorização de
  release. Exige reconferir domínio/base, build isolado e autorização aplicável;
  nunca publicar checkout inteiro. Sem dado/schema novo, alteração de formato,
  áudio novo, remoção de proteção ou mudança da integração Shopify de outro chat.
  A orientação verification limitou a prova ao trecho exercitado; Auth/Firestore
  locais e transporte Meta simulado não comprovam player/browser/codec em produção.
  Próximo ponto para o incidente real: exemplo/erro/etapa da falha anteriormente
  solicitados, sem repetir pergunta nem acessar mensagens de empresas às cegas.
- Retomada 16:48 UTC — ampliação da prova do caminho saudável, C13/C16. Antes de
  agir, detectada mudança concorrente na mesma rota: SHA256 atual
  `1c375ffdff5d81ef7ce3b8d044e953c8f5856cc40b88fabaeb6256232f896c63`, diferente do
  726671... testado. Conteúdo novo toca conversão de áudio armazenado OGG/WebM e
  fallback para original; bloco de cache desta missão permanece. Nenhuma edição
  de runtime nesta retomada; alterações concorrentes preservadas. Manifesto
  marcado requires_revalidation_after_concurrent_runtime_change, impedindo tratar
  a versão atual como o patch único anterior aprovado. Não há autorização de deploy.
- Teste ampliado com três casos positivos: gravação REAL no Storage demo e leitura
  posterior dos mesmos bytes sem novo download WhatsApp, para imagem/MP3/vídeo.
  Código de transporte permanece fictício, não prova codecs. Cleanup só dos objetos
  sob prefixo aleatório desta fixture e guard explícito do emulador loopback.
  Ambiente local está reiniciando: processos Firebase 3596/8884 já existentes,
  mas sem listeners 8080/9099/9199 no inventário inicial. Não iniciar emulador/teste
  duplicado nem interromper esses processos; aguardar prontidão antes da integração.
- Checagem estática da ampliação terminou com código zero, sem erros/avisos:
  sessão 78254 encerrada, log .qa-artifacts/media-read-reopen-static-20261020.log.
  São 12 casos preparados; apenas os nove anteriores têm prova de integração na
  versão antiga. SHA256 do teste ampliado:
  `198fc780bd740c7083fdf2507909e1db12f7922f37f6c3001c41a8ef01680e85`.
  Rota concorrente manteve hash 1c375f... na conferência posterior. Nenhum teste de
  integração desta nova revisão foi iniciado: listeners dos três emuladores ainda
  ausentes, mas processo Firebase de outro trabalho em inicialização; preservado.
  Não interpretar ausência de erro como aprovação dos 12 casos ou do novo runtime.
  Próxima ação: verificar prontidão dos emuladores já existentes e só então rodar
  `node --import tsx --test tests/chat-media-read.emulator.mts` com log novo. Sem
  processo próprio de teste pendente. Não repetir a solicitação de captura ao cliente.

- Retomada 17:03 UTC — emuladores existentes prontos (Auth/Storage PID 556,
  Firestore PID 4028), sem iniciar outra instância. A rota foi novamente alterada
  por trabalho concorrente: hash `6765cc149b36bea5207af143e60a19464d81e44f862eebdfbbb7fb0e72a0674f`.
  Agora usa helpers de playback/recuperação Evolution; não é o patch de arquivo
  único anteriormente testado. Alterações preservadas; nenhuma edição de runtime
  desta missão nesta retomada. Não reutilizar o manifesto antigo como pacote de release.
- Executada a ampliação preparada: **12/12 em 18,40 s**, log
  `.qa-artifacts/media-read-reopen-integration-20261020.log`, sessão 74469 encerrada.
  Imagem/MP3/vídeo cobrem cache indisponível e gravação/reabertura pelo Storage demo,
  além das recusas de acesso e falha do provedor. Transporte externo simulado.
  Regressão dos quatro arquivos: **29/29 em 56,82 s**, sem skips/cancelamentos,
  log `media-read-reopen-regression-20261020.log`, sessão 38870 encerrada.
  São lotes sobrepostos: não somar 12+29 como casos distintos.
- Exercitado também o teste existente de playback: **2/2 em 17,22 s**,
  `media-read-reopen-playback-20261020.log`, sessão 94038 encerrada. WAV sintético
  convertido, leitura concorrente retorna MP3 e preserva fonte OGG/fila; resolve=1
  usa assinatura simulada. Isso não comprova reprodução em navegador/dispositivo,
  envio ao WhatsApp real nem funcionamento do incidente relatado na produção.
- Checagem estática atual encontrou **dois erros TS2339** em
  `app/api/webhooks/whatsapp/route.ts:556` e `:1200`: acesso a status ausente no tipo
  declarado. Não corrigir arquivo compartilhado às cegas nem declarar pacote aprovado.
  Log `media-read-reopen-static-current-20261020.log`; sessão 39686 ainda executava
  ESLint na última conferência. Próxima retomada deve colher término antes de repetir.
  Rota manteve hash 6765cc... após os testes. Helpers inspecionados:
  chat-media-playback SHA256 `771a6a2c506d137b074fd16649db0dda009eed7fe23892a621fb38597d0f66db`,
  evolution-media-recovery `58812df1b4ce8e794eeba65f3c90c4d0f3190510728477c7d3ce8c527bcd938c`,
  firebase-storage `80c9bbb43051ced4c4d7f948ddf3f05b05a939949517b08613bdd3efa830ba0f`.
  Sem publicação, cobrança de modelo, cliente real ou avanço de B. Próxima ação:
  conferir fechamento estático e coordenar erros de tipagem; manter pendente a
  reprodução autenticada do relato sem repetir a solicitação anterior ao cliente.

- Retomada 17:18 UTC — sessão 39686 terminou com código 1 pelos dois TS2339
  já registrados; ESLint não acrescentou erros. Ao inspecionar as duas declarações,
  o trabalho concorrente já havia acrescentado status e datas operacionais ao tipo.
  Preservada essa correção, sem editar o webhook. Nova tipagem direta pelo binário
  local terminou **código 0** (sessão 81421; log
  `media-read-reopen-types-recheck-20261020.log`); novo lint dos quatro arquivos
  terminou **código 0, sem avisos** (63393; `media-read-reopen-lint-recheck-20261020.log`).
  Webhook SHA256 `feda0c2463352ff205ad85a88ec62e08f9842ab7db68865ac359401cd0db6fc0`.
  Isto retira o bloqueador de tipagem observado, não aprova build/publicação.
- O teste compartilhado de leitura também recebeu um caso Evolution de outro
  trabalho (hash `8f7270dcb6819dc7ac020a3c3b9a0d7631dfa0ad7b55569276e82a36bb96e51f`).
  A integração anterior 12/12 não é prova desse novo caso. Tentativa nova em
  `media-read-followup-20261020T1718.log` foi indevidamente iniciada mesmo após a
  consulta de portas retornar indisponibilidade: interrompida pela própria sessão
  60055, código 1, sem processo remanescente no inventário. Dois casos de playback
  apareceram falhos no ambiente indisponível; lote incompleto não homologado nem
  atribuído ao produto. Não iniciar outro teste/emulador sem prontidão explícita.
- Trabalho independente sem serviços: **28/28 em 1,60 s**, quatro arquivos de
  leitura/retry do Inbox e roteamento de conexão, log
  `media-client-followup-20261020T1718.log`. Inclui sete casos de roteamento; não
  divulgar os 28 como testes integrais de mídia. Leitura protege bytes, recusa
  erro/HTML/JSON vazio, cancela desmontagem e limita espera. Sem browser real.
  Rota de mídia e helpers conservaram hashes anteriores na conferência inicial.
  Nenhuma edição de runtime/teste nesta rodada, nenhum custo/envio/publicação.
  Próxima ação: confirmar portas e ausência de testes concorrentes antes de
  revalidar o caso Evolution recém-adicionado; B e incidente real permanecem abertos.

- Retomada 17:33 UTC — C13/C16, compatibilidade da resolução de anexos. Portas
  8080/9099/9199 indisponíveis e nenhum processo de teste/emulador ativo encontrado.
  Iniciada UMA instância local do CLI já instalado, apenas Auth/Firestore/Storage,
  projeto demo-altum-qa-lab e configuração loopback existente. Sessão própria
  **51171**, PID **10260**, log `media-emulators-20261020T1733.log`; na conferência
  17:35 UTC ainda inicializando sem listeners/Java. Não iniciar duplicata nem testes
  dependentes até prontidão. Nenhum serviço de produção alterado.
- Acrescentados três casos de regressão ao fixture de leitura, preservando o caso
  Evolution concorrente: resolve=1 com cache indisponível deve devolver bytes
  originais autorizados de imagem/MP3/vídeo, nunca inventar URL JSON/caminho salvo,
  mantendo o mediaId original. São **16 casos preparados**, não aprovados por
  inferência. Teste SHA256
  `684acfa92133f967ef0aeffe720d6e98dedeaafda8e9d67034825c572fa8b5a6`.
  Runtime sem edição nesta retomada; rota segue 6765cc... no inventário inicial.
- ESLint do teste terminou código 0, zero avisos:
  `media-resolve-static-20261020T1733.log`. Tipagem terminou código 0, sessão
  **79560** encerrada, log `media-resolve-types-20261020T1733.log`.
  Nenhuma integração iniciada nesta rodada com os serviços indisponíveis. Próxima
  ação: verificar sessão/portas existentes e rodar os 16 casos + playback somente
  se Auth/Firestore/Storage estiverem prontos, com saída e hashes novos. Evidências
  antigas permanecem limitadas às versões e cenários efetivamente executados.
  Sem cobrança, envio, publicação, acesso a mídia real ou avanço do gate B.

- Retomada 17:48 UTC — ambiente local iniciado pela sessão 51171 está pronto,
  comprovado pelo log do CLI e pelos três listeners (Auth/Storage PID 10260,
  Firestore PID 2400). Nenhum teste concorrente encontrado. Integrações protegidas
  por verificação das três portas antes de iniciar, sem repetir o erro de 17:18.
- Bateria preparada executada: **18/18 em 19,50 s**, leitura (16) + playback (2),
  sessão 56296 encerrada, log `media-resolve-integration-20261020T1748.log`.
  Comprovados os três casos novos resolve=1/cache indisponível e o caso Evolution
  acrescentado pelo outro trabalho. Cache indisponível não inventa URL persistida;
  bytes continuam autorizados; falha real de download permanece erro, não sucesso.
- Regressão ampliada dos cinco arquivos: **36/36 em 30,20 s**, zero falhas,
  skips/cancelamentos, sessão 3568 encerrada, log
  `media-resolve-regression-20261020T1748.log`. Inclui os 18 casos anteriores:
  não somar os lotes. Transporte, Auth/Firestore/Storage demo e áudio sintético,
  sem envio externo. Mesmo teste SHA256 684acfa... e rota 6765cc... após o lote;
  helpers playback/Evolution/Storage mantiveram hashes registrados. Tipagem/lint
  do fixture já aprovados na sessão anterior, sem edição posterior do fixture.
- Manifesto atualizado para separar pacote antigo obsoleto e snapshot atual
  testado localmente. Isso não homologa build isolado, navegador autenticado,
  codecs em dispositivos, loja real nem incidente publicado. Sem novo deploy,
  alteração runtime, cobrança ou pergunta repetida ao usuário. Gate B ABERTO.
  Emuladores 51171/10260 permanecem disponíveis; não iniciar duplicata.
  Próximo passo do incidente continua evidência autenticada do fluxo afetado;
  trabalho independente B permitido: medir importação dos workers frios antes de
  extrair getChatStateDocId do agente, sem mudar timeout nem prometer causa provada.

## Retomada 18:03 UTC — B/C16-C17, dependência do motor no envio

- Incidente de mídia segue aberto para reprodução autenticada; nenhuma nova
  evidência do cliente, nenhum acesso ou publicação supostos. Depois da regressão
  local de mídia, executado trabalho independente na fundação B já registrado:
  medir a carga dos módulos antes de alterar, sem reduzir timeout de workers.
- Sonda em processos novos, projeto demo, credenciais vazias e fetch recusado,
  sem executar operação de negócio: importação de Shopify authority 5.882 ms e
  outbox 3.628 ms, log `worker-import-before-20261020T1803.log`. Verificado que
  ambos e chat-dispatch importavam o agente inteiro somente para compor um ID.
- Extraído `getChatStateDocId` para `lib/server/chat-state-identity.ts`, sem mudar
  algoritmo, trim, separador ou chave legada. Agent importa e reexporta o mesmo
  helper, mantendo a API antiga. Alteradas SOMENTE as importações correspondentes
  em chat-outbound, chat-dispatch e commerce/shopify-action-authority; demais
  mudanças preexistentes desses arquivos compartilhados preservadas. Sem migrar
  banco, formato de mídia, autorização, timeout ou comportamento de conversa.
- Criado `tests/chat-state-identity.test.mts`: **2/2 em 0,91 s**, preservação das
  chaves e limite de importação desses consumidores. Log
  `chat-state-identity-unit-20261020T1803.log`. Sonda posterior: authority 3.595 ms,
  outbox 3.767 ms, RSS maior, log `worker-import-after-20261020T1803.log`.
  Amostra única e dependências indiretas ainda existem: NÃO comprova ganho geral,
  menor memória, causa do timeout ou correção definitiva de inicialização.
- Regressão em cinco arquivos (Shopify authority, template outbox, integridade
  de mídia, criação de proposta e projeção ecommerce): **68/68 em 74,15 s**,
  zero skips/falhas, sessão 41339 encerrada. Workers de replay de proposta e
  ocorrência passaram no mesmo lote em 13,75 s e 13,76 s, mantendo o limite 25 s.
  Log `chat-state-identity-regression-20261020T1803.log`. Não é repetição integral
  dos 171 casos antigos nem elimina risco de carga/lock já observado.
- ESLint completo com max-warnings=0 REPROVADO por dois avisos fora das linhas
  desta extração em agent.ts (4366 doc; 4725 incompatibleIds). Log
  `chat-state-identity-static-20261020T1803.log`, sessão 89229 encerrada código 1.
  Não remover regras nem editar essas lógicas paralelas apenas para aprovar.
  Outros cinco arquivos da unidade passaram lint direcionado, código 0, sessão
  54204 encerrada. Repetição explícita de tipagem terminou **código 0**, sessão
  **14073** encerrada, log `chat-state-identity-types-20261020T1803.log`.
- Hashes SHA256: helper c26aa19273a4644ac7f08fa533297842e0cb3f8d3bd3bd9b36178053e4374977;
  agent 4823f314eced9cd540bb0f552dcdcded11644d25642111650bd736953edda9af;
  outbound 2453ddefe03e78d8f3f5bc28a82dae22ab449337a8aa6e001d2cee3df4f6fb2e;
  dispatch f6a11f6b2b0c7968e3de5b8ec107c5c2ffef8d108080115fbb121eb998b82e83;
  authority 042fcad89935a60cc7eddd3f0623a08d4d492ba92d9496bee0145dbcaa6c26a1;
  teste 054ed1b202d68014bd41ed1501fc73a440c59abfc4d634f72bafb12662312678.
  Diff check aprovado, somente avisos LF/CRLF. Nada publicado, nenhum gasto,
  envio ou efeito externo. B permanece aberta; C/D não iniciadas. Próximo passo:
  tratar avisos com contexto e repetir regressão principal sobre
  o snapshot final; não aprovar pacote antigo usando somente estes 68 casos.

## Retomada 18:18 UTC — B, regressão ampla e isolamento do fixture

- Releitura do contexto dos dois avisos do agente: doc não era usado no predicado
  de mídia; incompatibleIds era uma variável local sem consumidor. Removidos
  somente o binding e a construção Set sem uso, sem retirar campo de configuração,
  regra comercial ou reintroduzir recomendação inferida. Testes de ofertas e chave
  legada: **14/14 em 13,84 s**, sessão 71232 encerrada,
  `shopify-foundation-unit-20261020T1818.log`. Tipagem e lint completo dos seis
  arquivos da extração terminaram código 0, zero avisos; sessão 36347 encerrada,
  `shopify-foundation-static-20261020T1818.log`. Sem reduzir max-warnings/regras.
- Reconstruída a lista dos 13 arquivos do lote antigo pelo conteúdo das asserções
  no log, incluindo as suítes puras ecommerce-agent-policy/ecommerce-journey.
  Primeira execução atual terminou **159/172 em 151,26 s**, 13 falhas (12 casos
  omnichannel + teardown). Causa do fixture identificada: definia projeto demo mas
  não host do emulador nem limpeza de credenciais; execução standalone tentou ADC
  e recusou por ausência de credenciais. Não chamar este lote de rede totalmente
  isolada nem de aprovação do produto; não há evidência de escrita empresarial.
  Log `shopify-foundation-regression-20261020T1818.log`, sessão 59150 encerrada.
  Ambos workers frios passaram neste lote, sem mudança de timeout.
- Corrigido APENAS o ambiente do fixture omnichannel antes do import Firebase:
  projeto demo próprio, hosts loopback para Firestore/Auth/Storage e credenciais
  explicitamente vazias. Asserções, concorrência de 20 operações e timeout mantidos.
  ESLint do fixture aprovado, sessão 84969 encerrada; log
  `shopify-foundation-fixture-lint-20261020T1818.log`. Novo lote integral iniciado
  somente após conclusão do anterior e prontidão das três portas: sessão **5178**
  encerrada código 0, **171/171 em 117,92 s**, zero skips/cancelamentos/falhas,
  `shopify-foundation-regression-isolated-20261020T1818.log`. O lote reprovado
  continua preservado, não transformado retrospectivamente em aprovação.
  Workers de ocorrência/proposta passaram em 10,02 s/9,69 s com limite 25 s.
  As 20 atualizações concorrentes passaram em 40,61 s: risco de latência/carga
  permanece; não atribuir melhora causal à extração nem prometer SLA com esse lote.
  Sem processo de modelo, mensagem real, release ou avanço B.
- Hash agent final `81d436b89226f2909f7ce87ed94aa0bd8cce66c482d22fe582f2700f85568809`;
  fixture omnichannel `b94240903b9b610ab7f365009ab16212f4198beaa487a5b8da0799a7afab2ceb`.
  Helper/outbound/dispatch/authority seguem hashes registrados em 18:03.
  Inventário independente confirmou o ramo direto sendTenantChatText ainda em
  automations.ts:573, fora de scheduled/waiting/inbound com sourceMessageId.
  Contexto não possui referência de ocorrência para lead_created/stage/budget/finance;
  próxima unidade B deve levar a causa durável desde os produtores e proteger
  envio/replay, não inventar chave só por lead/texto nem desligar automações usadas.
  Inventário final sem teste próprio pendente; emuladores 51171/10260 mantidos.
  Hashes agent/fixture conferidos após o lote, estáveis; diff check aprovado com
  aviso LF/CRLF. A correção do isolamento foi no teste, não na autenticação do
  produto. Etapas C/D, validação de mídia em produção e demais requisitos B
  continuam pendentes; estes 171 são fundação determinística, não conversas reais.

## Retomada 18:33 UTC — B/C14-C16, envio de automação por aprovação

- Unidade escolhida: primeiro migrar o gatilho budget_approved a partir da
  ocorrência JÁ persistida em jobs/crm_proposal_mutation, sem substituir filas ou
  desativar automações. Inspecionados produtor, posse/check de autoridade, hooks,
  contexto de runLeadAutomations, queueAutomationText e barreira pré-provedor.
  O produtor tem id/token/revisão da ocorrência, mas não os propaga à automação;
  o caminho genérico termina em envio direto em vez de outbox. A falta é real.
- Implementado novo teste no harness HTTP/Firestore/Auth existente de atualização
  de proposta, mantendo os testes anteriores: commitProposalMutation real →
  processProposalMutation real → automação send_message configurada. Transporte
  externo recusado ANTES de executar; nenhuma mensagem ao cliente/Meta enviada.
  Exige que o hook conclua somente o enqueue durável, uma tarefa/mensagem
  identificadas e replay sem segundo efeito; conclusão não significa entrega.
  Cleanup expandido apenas às coleções de outbox da própria fixture.
- Baseline **0/1 em 12,75 s**, sessão 57812 encerrada, log
  `automation-proposal-source-baseline-20261020T1833.log`: contador detectou UMA
  tentativa direta de I/O antes de existir fila durável, esperava zero. Falha
  reproduzida na jornada real de proposta fictícia Shopify, não deduzida só de grep.
  Não identifica causa do incidente de mídia, não comprova falha real na loja.
  O lote anterior 171/171 é histórico; este caso novo está VERMELHO e precisa fix.
- Nesta unidade ainda não houve alteração de runtime: não conectar uma chave
  inventada ao envio apenas para tornar verde. Próxima implementação: propagar
  referência/token de crm_proposal_mutation, congelar plano/ações da ocorrência,
  gerar identidade por ocorrência+automação+ação e usar commitChatOutboundEnqueue.
  Revalidar fonte, tenant/lead/proposta/revisão, acesso, configuração e posse na
  transação de aceite e antes do provedor; source ainda processando é pendência,
  source revogado ou parcial não permite envio legado. Reusar estado de conciliação
  existente e preservar os caminhos message_received/scheduled/waiting já migrados.
  Acrescentar testes de replay, fonte/configuração/posse alteradas e resultado incerto.
- ESLint do teste aprovado, sessão 77486 encerrada; diff check aprovado. Teste
  SHA256 `81d57cab5ed8fe34cb791ffb92fab18caf4b5894150f6d09a3057fd4262c880a`.
  Tipagem aprovada código 0, sessão **76464** encerrada, log
  `automation-proposal-source-types-20261020T1833.log`.
  Sem teste de integração próprio pendente. Emuladores existentes
  51171/10260 preservados. B aberta; C/D, publicação e uso real não autorizados.

## Retomada 18:48 UTC — B/C14-C16, proposta → plano → outbox

- Implementação local em quatro consumidores: proposal-mutation propaga id/token
  da ocorrência persistida; automations congela o conjunto elegível, inclusive
  vazio, e passa a enfileirar send_message imediato desse gatilho; adapter
  automation-proposal-delivery usa a outbox existente; worker verifica autoridade
  e fingerprint na transação imediatamente anterior ao provedor. Sem fila paralela.
- Plano vinculado a tenant, lead, aprovação/revisão/valor, permissões comerciais,
  fonte/posse, definição normalizada da automação e índice/conteúdo da ação.
  Destino e conta/canal são vinculados por digest, sem credenciais no job/log.
  Mudança de destinatário, canal, configuração, dono, proposta, fonte, payload,
  protocolo ou pausa humana impede a tentativa. Fonte ainda em execução espera;
  execução expirada/parcial não vira autorização. Replay do enqueue revalida
  fonte mesmo no caminho que retorna recibo já existente.
- Baseline anterior 0/1 virou **1/1 em 56,26 s** no primeiro patch (apenas enqueue).
  Ampliação inicial **20/21 em 65,64 s**: teste positivo confundia status do
  resultado do worker (sent) com o estado persistido (completed). Corrigido teste
  para verificar contrato persistido e recibo da mensagem, não removida asserção.
  Nova ampliação mista **78/80 em 184,11 s** deixou duas falhas registradas:
  teste buscava providerMessageId no job, mas o contrato guarda metaMessageId na
  mensagem vinculada; e uma falha REAL de compatibilidade/fixture CRM passivo,
  análise recomendou contato quando o funil configurado esperava provador.
  Não alterar essa expectativa sem diagnosticar a origem. Logs preservados em
  automation-proposal-regression[-expanded]-20261020T1848.log.
- Teste final de propostas **24/24 em 101,02 s**, zero skips/falhas, sessão
  87490 encerrada, `automation-proposal-final-20261020T1848.log`. Percorre fila
  e worker com Meta simulado: um envio/recibo e replay sem repetição; resultado
  incerto vai à conciliação sem novo envio; dez revogações/alterações recusadas
  ANTES da barreira de tentativa. Também preserva falha após tarefa anterior:
  agora injeta erro no commit da fila, mantendo asserções de conciliação/replay,
  em vez de depender de uma chamada externa não rastreada que foi removida.
- Hashes finais: adapter
  `12b4b8de6f00d5c41739dfffe2219f0cc635d0f843a040f3c81c5a91252e8935`;
  automations `e2e9e46e99e067f063a88cd62a9ae8020e71f6321e17626ac3223a8412a0bfa9`;
  proposal-mutation `66ab0cd8ad1721559a0771bd8cb605b719ee64f1f252d454182b0b93ce11b121`;
  outbound `7edf55492c36402640c09e023090d5fa432aa7e5a85436b70e2c80f5d54b2d13`;
  teste `672ec539814099068d8d49cb32563cd2d9e88eb80785e69ba44c1e7e1b2553cf`.
  Diff check aprovado com avisos LF/CRLF. Tipagem final e ESLint passaram
  (exit 0, zero avisos), sessão **8497** encerrada, log
  automation-proposal-final-static-20261020T1848.log.
  Sessões intermediárias 42772/10073/86682/
  87545/90196 encerradas; nenhuma integração própria pendente.
- Limites abertos: é o envio IMEDIATO de budget_approved com produtor migrado,
  não todos os gatilhos/ações. Esperas desse gatilho, ações internas/quotas por
  ocorrência, outros produtores e migração/recuperação granular continuam B.
  Canal explícito válido é necessário nesta fronteira; comportamento/UX para
  legado sem canal precisa revisão antes de release. Nova bateria principal e
  diagnóstico do CRM passivo são obrigatórios; 171/171 histórico não aprova esta
  versão. Sem deploy, custo de modelo, cliente real ou novo setor. C/D não iniciadas;
  incidente de mídia em produção continua pendente de reprodução autenticada.
- Próximo passo: reproduzir isoladamente o caso CRM passivo (mesmas
  asserções/funil) antes de decidir correção; depois regressão ampla de automações,
  proposta/worker e Shopify. Não publicar ou avançar B por 24/24 isolados.

## Retomada 19:04 UTC — B/C10-C16, diagnóstico do CRM passivo

- Reproduzida isoladamente a falha anterior sem alterar asserção: 0/1 em
  17,21 s, `crm-passive-isolated-20261020T1904.log`. Duas causas separadas:
  o fixture presumia significado de qualificacao para a coluna provador sem
  definir isso; e evaluateLeadQualification descartava labels/descrições e flags
  terminais ao passar somente IDs ao mapeador. O fallback por score também
  recomendava contato/proposta inexistentes no funil personalizado.
- Correção local em lib/server/crm/qualification.ts: passa definições completas;
  fallback só usa ID presente e não terminal, depois mantém etapa atual válida.
  Não escolhe a segunda coluna nem inventa uma etapa. Isso mantém a heurística
  legada de score quando a coluna existe; NÃO comprova qualidade dessa heurística
  para varejo nem transforma recomendação em prova de venda.
- Fixture passivo agora configura explicitamente a descrição de qualificacao
  nesse caso, mantendo expectativa provador e todas as proteções: etapa/score/
  prioridade/tags humanas permanecem, cidade é observada com respostas pausadas.
  Isolado corrigido 1/1 em 8,81 s. Não foi atribuído significado arbitrário a
  provador no produto; o caso de funil opaco continua sem avanço presumido.
- Novo tests/crm-qualification-pipeline.test.mts reproduziu 2 falhas/3 antes
  do fix (1/3 aprovado); versão final tem quatro casos, incluindo flag terminal
  em ID canônico. Com regressões de conversação e gatilhos: 13/13 em 3,42 s.
  Logs crm-qualification-{baseline,final}-20261020T1904.log. Tipagem e ESLint
  dos três arquivos aprovados, sessão 22964 encerrada; diff check sem erros,
  somente aviso LF/CRLF. Nenhuma publicação, chamada paga ou mensagem real.
- Hashes SHA256: qualification
  `28b60e85c0ee5aa15259efeecca81b6f8fc134342fb89af909d9c0ab1b8584b5`;
  teste novo `54e08b76f2fbaa2a221dacb64fc40bd61709c1eb3616bfb57ef90b52a30620a9`;
  teste automações `c425cda84ff91cf08ccfb611ad5b53effc8cebdb2de769c0b4b88eea56b12b35`.
- Regressão ampla final **245/245 em 198,44 s**, zero falhas/skips/cancelamentos,
  sessão 86723 encerrada, log shopify-foundation-current-20261020T1904.log.
  Cobre automações, propostas, workers, CRM/intake/projeção, Shopify e identidade;
  sobrepõe lotes anteriores, não somar como casos independentes. Usa os emuladores
  existentes 51171/10260, prontidão conferida antes de iniciar, transporte
  simulado/dados fictícios. Hashes do runtime de propostas permanecem idênticos
  aos registrados às 18:48. B continua aberta, C/D não iniciadas; incidente real
  de mídia continua sem reprodução autenticada. Próxima unidade após fechar
  evidência: esperas e efeitos internos/cota da ocorrência budget_approved,
  preservando o plano congelado e sem reutilizar recibo como autorização nova.

## Retomada 19:19 UTC — B, baseline de cota por proposta

- Lidos AGENTS, missão e plano completo; emuladores 51171/10260 existentes,
  sem integração própria ativa. Processo de tipagem release de outro trabalho
  preservado. Nenhum deploy/acesso à loja/chamada paga.
- Acrescentado caso de reserva por proposta + automação congelada em
  tests/crm-proposal-update.emulator.mts. Com fonte real fictícia aprovada,
  claim/plano, teto 1 e cinco reservas concorrentes, o contrato esperado é uma
  cobrança, recusando automação alheia, token antigo e lease expirado.
- Baseline **0/1 em 25,36s**, sessão 8890 encerrada,
  proposal-quota-baseline-20261020T1919.log: reserva atual só aceita fontes
  inbound/scheduled, não proposta. Runtime ainda NÃO alterado. Teste novo pede
  kind=proposal ainda não presente no tipo; integração/tipagem do pacote não
  aprovadas nesta versão. Não publicar nem enfraquecer caso para aprovar.
- Interrompida a implementação para responder pergunta do usuário sobre
  continuidade. Próxima unidade: estender reserva existente, sem fila/counter
  paralelo, a fonte validada + ID da automação do plano congelado; armazenar
  recibo por automação na fonte, revalidar posse antes de reutilizar e propagar
  pelo runLeadAutomations. Executar baseline corrigido e regressão. Esperas/
  efeitos internos continuam pendentes, B aberta. Sessão de leitura 12329
  encerrada; nenhum teste próprio pendente.

## Continuação autorizada — B/C14-C16, cota por ocorrência de proposta

- Unidade implementada localmente: tenant-usage aceita kind=proposal, vinculado
  ao job crm_proposal_mutation e à automação do plano congelado. A mesma transação
  grava contador existente e recibo por hash da automação na fonte. Replay usa
  recibo apenas depois de validar posse/lease, tenant, proposta, vendedor, plano
  e configuração atuais. Outro ID não herda cota; não há coleção/fila paralela.
  runLeadAutomations passa agora essa referência nos hooks budget_approved.
- Autoridade compartilhada no adapter automation-proposal-delivery; importação
  lazy em tenant-usage evita carregar esse grafo em leitores de uso não relacionados.
  Recibo contém ID/digest do plano para não aceitar associação alterada. Reserva
  não é recibo de envio, nem autoriza efeito se fonte/configuração forem revogadas.
- Primeiro fix do baseline: **1/1 em 16,43s**, cinco reservas concorrentes = uma
  cobrança. Ampliação inicial **69/82 em 139,83s**: 13 casos esperavam uma outbox
  mas recebiam três; duas automações do NOVO fixture de cota não tinham filtro
  de origem e contaminavam outros casos no mesmo tenant fictício. Nenhuma rede
  externa. Corrigido isolamento com origem exclusiva, preservando asserções.
  Falhas preservadas em proposal-quota-regression-20261020.log.
- Caso ampliado exige recusa por teto para a segunda automação aceita, ID fora
  do plano, token antigo, configuração desativada, capacidade removida, proposta
  alterada, recibo adulterado e lease expirado, mantendo contador/recibo intactos.
  Helper queuedApproval exige recibo criado pelo produtor real, não só teste unitário.
- Tipagem final e ESLint dos quatro arquivos aprovados, sessão 50340 encerrada;
  diff check aprovado com avisos LF/CRLF. Bateria ampla **245/246 em 327,36s**,
  zero skips/cancelamentos, sessão **70880 encerrada**, log
  proposal-quota-final-regression-20261020.log. Todos os casos de proposta/cota
  passaram, mas o worker Shopify em processo novo ultrapassou 25s e foi encerrado
  pelo limite mantido. Não aprovar a bateria nem somar o isolado ao resultado.
  Isolado idêntico **1/1 em 15,95s**, worker 10,29s, sessão 96723 encerrada,
  proposal-quota-worker-isolated-20261020.log. Isso confirma instabilidade sob
  execução conjunta, não comprova causa nem correção de desempenho. Já havia
  ocorrido antes desta unidade; o lote verde das 19:04 não elimina recorrência.
  Não aumentar timeout nem reduzir concorrência só para declarar aprovação.
  Sessões anteriores
  30657/94884/66232 encerradas. Emuladores 51171/10260 preservados.
- Hashes: adapter `9f6dc9867e0833fe28b9eaf4f6332369500c70b8b672f751ac674cdd99afd028`;
  tenant-usage `bf6edcd993aa75617b28cef4a38505a747e8f82a88781afec45337c467d1bbe1`;
  automations `fe00978727534d844b4d382adae915ac5d8ac988762326bc5b0c521ff8815d57`;
  teste `d796e4935138904c0a1f4138bbd66bee6131ee0f47bcffae1ff1349c5a489324`.
- Sem publicação, cobrança de modelo, escrita Shopify ou mensagem a cliente.
  Esperas, efeitos internos e recuperação granular das propostas continuam
  pendentes; esta cota não os torna idempotentes nem permite reabrir fonte parcial.
  B aberta; C/D não iniciadas. Incidente de mídia real permanece sem prova de
  solução no domínio. Próximo B prioritário: instrumentar fases de inicialização
  e processamento do worker fictício para distinguir importação, conexão e
  execução sob concorrência, mantendo asserções e timeout. Depois, vincular
  agendamento de proposta à fonte/plano/destino. Nenhum teste próprio ativo;
  snapshot de runtime/hashes acima estável. Build/release completos não aprovados.

## Diagnóstico seguinte — B/C16-C17, inicialização do consumidor Shopify

- Turno anterior classificado como progresso: cota por proposta implementada,
  consumidores reais verificados e falha conjunta de retomada preservada.
  Conferidos estado/arquivos atuais e ausência de testes próprios ativos antes
  desta unidade; nenhum processo de outro trabalho interrompido.
- Adicionadas fases numéricas em stderr somente no fixture
  tests/fixtures/shopify-occurrence-worker.mts, capturadas pelo teste pai em
  diagnostic, inclusive no timeout. Não registra payload, token ou pessoa. JSON
  de resultado, assertivas, concorrência e limite 25s preservados. Parede no pai
  permite distinguir startup anterior à entrada, importação, execução e término.
- Bateria instrumentada ANTES de alterar runtime **246/246 em 223,56s**,
  sessão 20611 encerrada, shopify-cold-worker-timing-baseline-20261020.log.
  Worker: parede 7.624ms; automations_loaded 2.861ms; firebase_loaded 2.869ms;
  processing_complete 5.607ms; terminated 5.611ms (fases desde entrada).
  Falha anterior não reproduziu nesta tentativa; não declarar causa resolvida.
- Inspeção encontrou caminho ainda não migrado: automation-message-delivery
  importava getChatStateDocId de ai/agent, carregando grafo de IA para formar ID.
  Contrato de importação ampliado em tests/chat-state-identity.test.mts:
  baseline 1/2, corrigido 2/2 em 0,48s. Import agora vem do helper puro existente,
  com export legado e formato das chaves idênticos. Sem migração de estado.
- Bateria sobre runtime final **246/246 em 192,45s**, sessão **98572 encerrada**,
  log automation-identity-final-regression-20261020.log. Worker final: parede
  7.363ms; importação 2.737ms; Firebase 2.744ms; processamento concluído 5.719ms;
  término 5.724ms. Diferenças pequenas/em computador compartilhado não demonstram
  ganho causal nem explicam definitivamente o timeout anterior. Manter risco de
  carga/latência concorrente e diagnóstico disponível em F. Verificações
  estáticas aprovadas, sessão **16101 encerrada** (código 0, lint sem avisos).
  Emuladores 51171/10260 preservados. Não atribuir ganho causal de tempo/RSS a
  duas tentativas em computador compartilhado; inicialização/carga ainda em prova.
- Hashes: runtime `e482def7a72e366f0983ce2502af81788010d699ff995f5636c6902d65de0562`;
  contrato `8bada6fb7e4129b492ad7fd48582d827d58f860b765b2e07d686fae5615ae4aa`;
  worker `653bbfe16e6c03c42535c443d186566edca5ae3b683307f92d1a2dd33399da61`;
  teste pai `2a8844de22f902c7b3ece3b287a376b87b611b6cf55f8416b10b35ba3a404b63`.
- Sem deploy, gasto de modelo, loja ou mensagens reais. B aberta; C/D não
  iniciadas. Fechar evidência da bateria atual e manter latência concorrente em
  carga/F; próxima lacuna funcional B: agendamento de proposta sem vínculo
  fonte/plano/destino, seguido dos efeitos internos ainda sem recibo por ação.

## Baseline seguinte — B/C14-C16, autoridade das propostas adiadas

- Acrescentados DOIS casos em tests/crm-proposal-update.emulator.mts: aprovar
  proposta Shopify fictícia com send_message em 1h, levar agendamento ao prazo,
  remover ocorrência de origem ou alterar revisão da proposta, rodar scheduler
  e worker reais com transporte Meta somente simulado. Esperado zero tentativas.
- Baseline **0/2 em 10,84s**, cada caso tentou uma entrega no provedor falso apesar da
  revogação. Sessão **50444 encerrada**, log
  proposal-delayed-authority-baseline-20261020.log. Nenhuma chamada externa real.
  Tipagem/ESLint do teste aprovados, sessão 69262 encerrada, logs
  proposal-delayed-baseline-{types,lint}-20261020.log. Teste SHA256
  `ba3a5799e1556d18ad4d4cc4d92abe37df323df1d307bf9c5e841bb7e87f9d65`.
  Não há integração/tipagem própria ativa; emuladores existentes preservados.
  O agendamento legado não preserva sourceId/claim/plano da proposta nem destino
  congelado: scheduleAutomationAction grava job aleatório sem essa autoridade;
  scheduler reconstrói contexto sem proposalClaim e fila genérica não a revalida.
- Runtime dessa correção ainda NÃO implementado. O lote verde 246 anterior não
  inclui estes dois novos casos e não aprova o pacote atual. Fonte ainda pendente
  não pode virar autorização; repetição deve preservar identidade e prazo originais,
  alteração de configuração/destino/posse deve invalidar antes da tentativa.
  Não basta bloquear tudo: exigir positivo de envio único, reinício, espera pela
  conclusão da fonte/scheduler e resultado incerto sem reenvio, além das revogações.
- Próxima unidade concreta: agendamento determinístico por ocorrência/automação/
  ação, fonte/plano/canal aceitos juntos, claim e guardas revalidados no scheduler
  e na fronteira de envio da outbox existente. Reusar as coleções/consumidores
  atuais; não criar fila paralela ou promover legado sem prova. B permanece aberta.

## Implementação seguinte — B/C14-C16, proposta → agendamento → envio

- Turno anterior foi progresso: remoção de acoplamento, bateria 246 e baseline
  vermelho de autoridade adiada. Estado atual conferido; nenhum teste próprio
  ativo antes da implementação. Sem alteração de admin/autenticação/páginas públicas.
- scheduleProposalAutomationMessage agora cria identidade por tenant/ocorrência/
  automação/índice; grava job e manifesto de aceite na ocorrência na mesma
  transação. Fixa conversa, conta/destino por digest, ação/plano e prazo derivado
  de createdAt da origem, não do retry. O manifesto evita renovar autorização
  apenas editando o job. Fonte/plano/canal/grupo/posse são validados no aceite.
- claimScheduledAutomationJob usa a mesma autoridade para propostas; fonte
  ainda registrando ações aguarda sem tomar posse/consumir tentativa, fonte ou
  regra revogada vai à conciliação. Metadados removidos não autorizam fallback:
  prefixo determinístico e gatilho de proposta identificam o contrato. Agendamento
  legado de proposta sem origem comprovada requer conciliação, NÃO é promovido.
- queueScheduledAutomationMessage encaminha esse contrato à outbox existente.
  Enqueue/replay, cota e transação pré-provedor revalidam fonte, revisão/financeiro/
  acesso, configuração, destinatário/canal, pausa e prazo. Scheduler precisa
  concluir com os IDs da outbox/mensagem esperados; confirmação incerta mantém
  conciliação, nunca reenvio cego. Recuperação reutiliza identidade já aceita.
- Ação adiada reutiliza a reserva da automação na ocorrência; não cobra a mesma
  execução novamente. Teste positivo com teto 1 exige contador 1 após agendamento,
  entrega e replay. Outros efeitos internos da proposta AINDA não foram migrados.
- Baseline 0/2 virou 3/3 em 26,22s. Primeira tipagem apresentou três TS2339 na
  inferência do retorno do adapter; corrigido com retorno explícito de campos
  validados, sem relaxar tipos/testes. Ampliação **16/16 em 75,50s**, incluindo
  dez revogações pós-enqueue, origem/scheduler pendentes, incerteza e reinício
  em processo novo após commit da fila e falha na finalização (limite 25s mantido).
  Negativos usam prazo original curto realmente vencido, sem adulterar executeAfter;
  teste separado mantém 1h e exige prazo/ID imutáveis no replay.
- Lote conjunto posterior **165/166 em 204,67s**, sessão 64288 encerrada,
  proposal-delayed-regression-20261020.log. Todos os casos novos passaram;
  único erro no worker Shopify já intermitente: 25,09s, somente fase entry,
  sem automations_loaded. Agora há evidência de atraso ANTES da conclusão do
  import, não de processamento Firestore. Não declarar eliminada essa falha.
- Dois casos adicionais cobrem replay de agenda e legado sem vínculo. Tipagem
  e lint aprovados, sessão 83016 encerrada. Bateria final ampliada **265/266 em
  331,15s**, zero skips/cancelamentos, sessão **13128 encerrada**, log
  proposal-delayed-final-regression-20261020.log. Todos os testes de proposta
  passaram, inclusive reinício em 14,23s. Worker Shopify passou nesta rodada:
  parede 12,71s, import 4,29s, processamento terminado 11,12s desde entrada.
  Única falha: 20 atualizações concorrentes do contato, ABORTED/Transaction lock
  timeout após 113,11s. NÃO aprovar pacote amplo nem somar isolados ao resultado.
  Estáticos finais **19107 encerrados**, tipos/lint aprovados código 0, logs
  proposal-delayed-final-snapshot-{types,lint}-20261020.log.
  Fixture Shopify recebeu monitor numérico de CPU/RSS durante import
  (somente QA, sem payload/credencial, timer unref/limpo), preservando 25s e assertivas.
- Hashes desta implementação: adapter
  `adcf8be1ba7450b45a17593b351293d380322ea696656787fc0fdb324ca7955d`;
  automations `da5ddcb6f87cc5f1357d686afa752904d6ea157a15924d92c6d433f1a49f74c5`;
  message-delivery `624f49df8987c5802d081c1efcdaf82d612543bd26388b7cc04e7c95b4503b3b`;
  usage `809cc0be6f11508e37786f8e4a771636d479b5bf7d07092107ccc402b0015a83`;
  teste proposta `d0ea8c63b0a2646184519e63fbf6cd065643bfa4324a12bc748248f5c6539d76`;
  worker proposta `99e5ca9d18b8861dcdaf84227adb5e047a294996dd4993458fccf1df4f7e5b66`;
  tsconfig `c42ea9612d064add1dab93aa151270752de0ec1755b4b33215478858bcf8cf0d`.
- Nada publicado deste pacote; nenhuma cobrança de modelo, mensagem real ou
  escrita Shopify. Legado exige estratégia/UX de revisão antes de release;
  retenção deve preservar dependência de fonte enquanto houver agenda pendente.
  Demais gatilhos, efeitos internos/recibos por ação e auditoria idempotente de
  execução continuam B. C/D e qualidade conversacional não aprovadas. Incidente
  de mídia não foi revalidado em produção nesta unidade. Próximo: fechar prova
  da sessão final, guardar diagnóstico de import e seguir efeitos internos da
  proposta com transação/recibo, sem reabrir fonte parcial para repetição cega.

## Diagnóstico subsequente — B, disputa de identidade de contatos

- Falha ampla acima reproduziu a pendência histórica de concorrência, sem
  mudanças de runtime em contact-profile.ts nesta unidade. Isolado com as MESMAS
  20 chamadas/asserções **1/1 em 78,35s**, corpo 71,28s, sessão 45077 encerrada,
  proposal-delayed-contact-isolated-20261020.log. Passar isolado não elimina
  timeout conjunto nem aprova latência. Leitura diagnóstica 84472 encerrada.
- Nesse isolado houve MetadataLookupWarning para 169.254.169.254; env já
  apontava SDKs para demo/loopback, sem evidência de escrita em produção ou uso
  de credencial real. É uma lacuna do isolamento de rede, não prova de vazamento.
  Conferido código PRIMÁRIO instalado de gcp-metadata: env
  METADATA_SERVER_DETECTION=none retorna false sem consultar metadados.
- Somente tests/omnichannel-identity.emulator.mts recebeu esse env e assertiva
  do projectId demo antes de rodar; autenticação/configuração da aplicação real
  NÃO alteradas. Repetição isolada **1/1 em 41,67s**, corpo 38,44s, sem aviso de
  metadados no log, sessão 20316 encerrada. Não atribuir toda a diferença de tempo
  a esse ajuste, pois há variância/concorrência do host. Contratos 5/5 em 0,62s,
  lint aprovado, sessão 1626 encerrada. Logs contact-contention-{no-metadata,
  runtime-contract,fixture-lint}-20261020.log. Concorrência permanece 20.
- Fixture atual SHA256 `575d687bda709f6b26da71e18a9f367e628a9e97c957c662e3a3dcdfa01d88ed`;
  worker monitor `9642671ed7bce3d95a9a34e7794071d5bfda160219859a7fe4709085aec0cd54`;
  pai monitor `76e2a61e8bdc7b6287fbc8e707849e744d801a151168b3f8beefbc194b7e8a64`.
  Hashes do runtime do agendamento acima permaneceram estáveis durante os testes.
  Diff check sem erros, somente avisos LF/CRLF. Nenhum teste próprio ativo;
  emuladores 51171/10260 mantidos. Nenhuma publicação deste pacote.
- Próxima unidade prioritária B: upsertContactProfile segura aliases e cadeia
  canônica numa transação pessimista com seis tentativas externas e retries do
  SDK. Vinte atualizações do mesmo perfil disputam os mesmos documentos; há
  timeout comprovado, causa interna exata ainda requer teste da alternativa.
  Avaliar leitura sem locks + batch/CAS em TODAS as versões lidas, criação com
  precondição de inexistência e merge preservado; não reduzir 20 chamadas, não
  sobrescrever decisão humana, não juntar tenants/canais por nome nem aceitar
  cadeia alterada/ciclo/destino ausente. Preservar semântica e campos, antes/depois
  sobre o mesmo contrato. Não aumentar retries apenas para esconder a falha.
  Depois retornar a efeitos internos/recibos da proposta. B continua aberta;
  C/D, qualidade final e publicação continuam não aprovadas.

## Implementação — B/C02-C16-C17, contato sob concorrência

- Turno anterior foi progresso: contrato de proposta adiada implementado e
  verificado; nova falha ampla de contato/latência registrada. Repositório e
  processos atuais conferidos, sem testes próprios ativos antes da unidade.
  Recorte continua Shopify/canais existentes, sem publicação ou chamadas pagas.
- Baseline novo: proibir runTransaction no upsert de contato deu **0/1 em 4,54s**,
  contact-optimistic-baseline-20261020.log. Mantidas as 20 chamadas/asserções que
  falharam na bateria anterior; não foi reduzida concorrência nem aumentado limite.
- Primeiro CAS sem coordenação local: **12/13 em 20,57s**; 20 chamadas ainda
  disputavam a mesma versão e uma esgotou seis tentativas (FAILED_PRECONDITION,
  6,87s). Não declarado aprovado. Contador externo de tentativas continua seis;
  não foi aumentado para mascarar disputa. Log contact-optimistic-first-fix.
- contact-profile.ts substitui transação pessimista por plano de batch atômico:
  create com inexistência e update com lastUpdateTime em TODOS os snapshots
  lidos, incluindo aliases, raiz e redirecionamentos intermediários. Merge,
  identidade v2, IDs, campos, limite de cadeia e seleção da raiz preservados.
  Versão alterada invalida o lote inteiro e exige nova leitura; erro de acesso,
  tenant, ciclo ou armazenamento não vira sucesso. Sem coleção/fila paralela.
- Coordenação em memória por aliases/raízes somente ordena escritores sobrepostos
  neste processo; não serializa todos os clientes/tenants e NÃO é lock distribuído
  ou recibo durável. Leituras consultivas selecionam as chaves, nunca viram dados
  de escrita/autorização. O core relê tudo e CAS protege contra outros processos.
  Promessas/chaves são liberadas em finally inclusive se o escritor falhar.
- Lote coordenado inicial 12/13 e ampliação 18/19 tinham uma falha do NOVO fixture:
  teste arquitetural criava contato antes do teste antigo que exige total 1.
  Movido esse teste para depois, mantendo assertiva total=1 e vinte chamadas.
  Logs contact-optimistic-{coordinated,expanded}-20261020.log preservados.
  Tipagem da ampliação revelou dois TS2339 de projectId não público no tipo
  Firestore; assertiva passou a usar Auth.app.options.projectId, API pública do
  MESMO app usado por adminDb, sem cast permissivo ou alteração de app/auth reais.
- Ampliação final **24/24 em 30,67s**: 20 chamadas idênticas (2,33s), 20 aliases
  diferentes com todos os fatos preservados, QUATRO processos independentes e
  vinte observações distintas (9,07s, limite 25s por processo), edição humana
  após leitura, troca de alias/redirecionamento para tenant alheio, erro de
  armazenamento atômico e liberação de admissão após falha; demais contratos
  existentes mantidos. Namespace demo/metadados desativados só em QA. Não é SLA
  de produção nem prova de escala ilimitada ou de adaptação conversacional.
- Tipagem e ESLint finais aprovados, sessão 55134 encerrada; lote 76976 encerrado.
  Logs contact-optimistic-final[-types,-lint]-20261020.log. Intermediárias
  90294/72494/79367/24933/55040 encerradas. Diff check sem erros, aviso LF/CRLF.
- Regressão ampla sobre este snapshot **278/278 em 204,74s**, zero falhas,
  skips/cancelamentos, sessão **73431 encerrada**,
  contact-optimistic-full-regression-20261020.log. Vinte atualizações no mesmo
  perfil 2,24s; quatro processos/vinte fatos 10,06s; worker Shopify parede 6,69s,
  mantendo 25s. Contratos legados e cenários de proposta/entrega incluídos.
  Não somar com 24 como casos distintos; é aprovação local deste conjunto,
  não SLA de produção, qualidade de modelo, conclusão de B ou publicação.
  Emuladores 51171/10260 preservados; nenhum teste próprio ativo.
- Hashes: runtime `c4172efcfa1e8164b1b5c30987527bd8fb79aa9aff1d7a5d471073bda050038d`;
  teste `c59f2ff8dafa93c5206a569d7205407025fc97d91fcf04cd05a67935804ecf51`;
  worker `af242868190f1c7a0769b50e1d3cba3ab6cee0253abbc4cb70c2b21a77724c09`;
  tsconfig `a19a9521ee2de1c153a9980dab2e0aedc9d23363eb40ef6f7a654db10a908080`.
- Nenhuma mensagem/loja real, compra, pagamento, remoção de histórico ou publicação.
  Não afirmar concluídos identidade/migração globais ou retenção por esta mudança.
  B aberta. C/D não iniciadas. Próximo: fechar evidência ampla, depois efeitos
  internos/recibos por ação da proposta e demais produtores pendentes; manter
  os riscos de inicialização/carga documentados até avaliação final autorizada.

## Implementação aprovada localmente — B/C09-C14-C16, registros internos imediatos da proposta

- Último turno foi conferência final da unidade anterior, sem novo runtime; ponto
  retomado: B aberta e testes próprios encerrados. Emuladores atuais conferidos.
- Nova reprodução em runLeadAutomations: cinco execuções concorrentes da mesma
  ocorrência criaram **15 tarefas em vez de 3**, baseline 0/1 em 10,70s,
  proposal-internal-baseline-20261020.log. Não houve canal/provedor/loja real.
- Implementação local liga create_task/follow_up/alert_human/add_note imediatos
  à origem de aprovação, plano congelado e quota aceita. Registros, evento e
  recibo compartilham transação e identidade por origem/automação/índice.
  Prazo deriva de createdAt da origem, não do retry. Replay não sobrescreve
  tarefa/nota editada. Pendência humana criada não significa humano notificado.
- Primeiro teste da correção 1/1 em 14,24s; ampliação **6/6 em 31,77s**,
  proposal-internal-expanded-20261020.log: revogação de revisão/tenant/configuração/
  capacidade/lease/token/quota, rollback de tarefa+nota+evento+recibo, adulteração,
  edição humana, consumidor real e replay em processo novo (limite 25s mantido).
  Adicionados ainda dois cenários de revogação entre ações e não ressurreição de
  tarefa removida; os oito casos novos passaram na bateria ampla **286/286 em
  235,14s**, zero falhas/skips/cancelamentos, sessão **21167 encerrada, exit 0**,
  proposal-internal-full-regression-20261020.log. Não somar com os seis específicos
  como casos distintos. Tipagem e lint finais aprovados (64993 encerrada, exit 0),
  proposal-internal-final-{types,lint}-20261020.log; diff check sem erro.
- Hashes estáveis do snapshot verificado: automations.ts
  `29a4f2de150e2f668fe9c1fa5ccff4b879c8bf525719c0081877ba37a15a0106`;
  automation-proposal-delivery.ts
  `063db55e3a8fdb7c804668d8c91699e31522a009f2554877310fee343ebfd138`;
  testes de proposta
  `bc0c66c48da5d0a14d31719b7b86300b2ac4522f460f8addb126eea9ad533dcf`;
  novo worker
  `02571951c8106a794b193feaff101fadf58d43e3d2320da92b20b9de14673850`;
  tsconfig de testes
  `a2c17dd331450365a86c34a4d44ad78bed9b9ae58e975e3873f76683d4892ed7`.
- Consumidor existente executeImmediateAction usa o novo contrato só para os
  quatro tipos imediatos com proposalClaim; demais fluxos preservados. Não houve
  nova coleção, índice, fila, modelo pago, escrita em Shopify, envio ou publicação.
  Build/publicação, browser/produção e qualidade conversacional NÃO foram
  comprovados por este lote. Uma tarefa interna não é retorno automático executável.
- Próxima unidade B: CRM por ação e ações
  internas agendadas ainda pendentes nesta família; não liberar retomada cega da
  origem parcialmente executada. Demais produtores e backlog anterior preservados.
  Retenção/migração dos recibos e interface de conciliação continuam pendentes.
  Eventual reversão exige revisão do diff exato, preservação de recibos e drenagem
  dos executores; não restaurar o arquivo inteiro do checkout compartilhado.
  B permanece aberta; C/D não iniciadas; nenhum marco integrado aprovado.

## Implementação aprovada localmente — B/C09-C14-C16, registros agendados da proposta

- Turno anterior foi progresso: registros imediatos com recibos, ampla 286/286.
  Hashes atuais dos três arquivos conferidos iguais; emuladores vivos e nenhum
  teste próprio ativo ao iniciar. Backend autorizado no escopo Shopify, sem deploy.
- Baseline novo: apagar origem e executar agenda ainda criava **3 tarefas quando
  deveria criar zero**, 0/1 em 8,51s, proposal-internal-scheduled-baseline-20261020.log.
- Nova implementação mantém jobs/manifesto existentes: quatro tipos internos
  delayed recebem identidade por ocorrência/automação/ação, deadline original,
  validação de fonte/plano/cota no claim/reserva/efeito. Não requer conversa ou
  canal para criar registro interno; não confundir isso com permissão de envio.
  Nova execução antiga sem prova exige conciliação, não promoção de protocolo.
- Recibo + tarefa/nota + evento + marca do executor compartilham commit. Replay
  relê fonte/configuração e preserva edição/remoção humana. Primeiro lote 2/2 em
  15,48s; ampliação 6/6 em 52,29s. Revisão acrescentou duas corrupções ao mesmo
  cenário (action=null e troca para send_message) e conciliação legada, sem
  mudar expectativa ou timeout. Nova bateria específica **7/7 em 55,43s**, zero
  skips, sessão 85085 encerrada. Logs proposal-internal-scheduled-{first-fix,
  expanded,final-specific}-20261020.log. Não somar lotes sobrepostos.
- Tipagem/lint anteriores (60921) passaram mas a revisão posterior invalida seu
  uso como aprovação do snapshot final. Nova sessão **63793 encerrada exit 0**,
  tipos/lint finais aprovados, proposal-internal-scheduled-final-{types,lint}.
  Bateria ampla iniciada somente após os específicos terminarem: **293/293 em
  270,96s**, zero falhas/skips/cancelamentos, **82535 encerrada exit 0**,
  proposal-internal-scheduled-full-regression-20261020.log. Não somar com os
  específicos como casos distintos. Diff check sem erro, aviso LF/CRLF apenas.
- Hashes do snapshot: automations.ts
  `ababf74e2d697d243bcc9fc319a85eb1569efb8545d4185a0b355a0f19fb0cb7`;
  automation-proposal-delivery.ts
  `311f236af74e867254a7d29212db6b58e6e4d1fd01392e3d5819ab76a0b4c72c`;
  testes de proposta
  `c74e9641d322d6438db2be38fd0552e58c8c424de0203cdb7a12d17231786d2e`.
  Hashes revalidados após término. Nenhum teste próprio ativo. Sem build/release,
  chamada paga, acesso à loja, envio real, alteração de mídia/admin/auth/site.
- Testes comprovam quatro ações delayed sem exigir canal para registro interno,
  preservação de cota/prazos/edições, rollback integral, claim antigo recusado,
  espera de raiz viva sem tentativa consumida, oito revogações/adulterações,
  conciliação de legado sem prova e retomada em processo novo após commit com
  finalização perdida. Não comprovam notificação humana ou resposta natural.
- B aberta; CRM de proposta por campo e demais produtores ainda pendentes. Não
  reabrir raiz parcial para repetição cega nem declarar marco integrado concluído.
  Antes de release, revisar migração dos agendamentos legados agora conciliados;
  não fabricar manifesto para promover ações antigas. Retenção dos recibos/origens,
  interface de conciliação e backlog de Conversas continuam pendentes. Reversão
  somente com diff isolado e revisão de trabalho ativo, nunca checkout/reset amplo.

## Implementação aprovada localmente — B/C09-C10-C16, campos CRM da proposta

- Último turno foi progresso: ações internas agendadas, ampla 293/293. Hashes
  conferidos iguais e nenhum teste próprio ativo; emuladores existentes disponíveis.
- Baseline novo 0/1 em 8,48s: após pessoa alterar prioridade para low, replay da
  mesma ação restaurava high. Log proposal-crm-baseline-20261020.log.
- Implementação local congela baseline/propriedade por campo e funil ao aceitar
  lote CRM novo; ações com recibo/projeção/evento atômicos, incluindo agendadas.
  Stage própria não revoga a origem: exige prova do recibo/plano/posse exatos,
  não apenas marcador no lead. Edição humana divergente não ganha essa exceção.
  Planos legados não recebem baseline fabricada retroativamente.
- Primeiro teste corrigido 1/1 em 8,21s; ampliação 7/7 em 27,65s. Tipagem inicial
  43208 reprovou TS2322 de lead opcional no novo guard; corrigido com teste de
  existência explícito, sem cast/relaxar tipos. Helper de prova endurecido para
  objeto nulo, requested/after e autoria exata. Novo lote 9/9 em 49,09s, sessão
  78985 encerrada; prova de consumidor/envio simulado e CRM agendado em worker
  frio incluídas. Não somar lotes sobrepostos.
- Tipos finais passaram; lint final 86429 reprovou somente prefer-const no
  requested. Ajustado; nova aprovação estática e regressão ampla ainda pendentes.
  Revisão corrigiu também assertiva humana pós-envio: reserva negada por status
  done não provaria revogação; teste agora autoriza a fonte em modo delivery,
  antes da edição, e exige PROJECTION_INVALID após a edição. Não enfraquece gate.
  Sem publicação/custo nem prova de modelo real.
- Fechamento do snapshot revisado: prova delivery 1/1 em 9,75s (51720 encerrada),
  tipos/lint **aprovados, 17880 encerrada exit 0**, logs proposal-crm-release-
  {types,lint}-20261020.log. Não reaproveitar lint anterior reprovado.
- Regressão ampla **302/302 em 319,40s**, zero falhas/skips/cancelamentos,
  **22661 encerrada exit 0**, proposal-crm-full-regression-20261020.log. Os nove
  casos novos estão incluídos, não somar lotes sobrepostos. Mudanças sucessivas
  com três concorrentes, bloqueios manuais/stale permanentes, IDs reais do funil,
  rollback de campo+projeção+evento+recibo, cinco provas corrompidas, legado sem
  baseline, consumidor/outbox e CRM delayed em processo novo exercitados. Nenhum
  envio ao provedor real; resposta Graph simulada estritamente no fixture.
- Hashes: automations.ts
  `87e26507ffa7eb6bcaafbbcb96e1cd0a702491ff67b98d6d8faa24814bca5a97`;
  automation-proposal-delivery.ts
  `d14d05c6ab166b57096ca2a71b18aab60affebdd2ad4fb1547dabc6f3855205b`;
  crm/proposal-mutation.ts
  `c18dd06c2f5dd5e3536dd784bd32e16ff6e0d239162e1319e45ed16215d37b84`;
  novo crm/proposal-crm-proof.ts
  `07dad9e694758172b4ce1c76ca20a067897244633d227172500894bb39661905`;
  testes de proposta
  `c99b86c9af5bc4454515a9e8adf5a0176dadaedcc2c61aa64ace40854c5ba58f`.
  Snapshot conferido durante/final da bateria, diff check sem erro. Sessões
  3420/43208/25549/78985/86429/51720/17880/22661 terminadas; emuladores preservados.
- Próxima unidade B: testar classificação de falhas ao carregar funil. Revisão
  estática encontrou catch amplo em freezeProposalAutomationPlans e no ramo CRM:
  pode transformar indisponibilidade de armazenamento em blocked_pipeline
  persistente. É hipótese a reproduzir, não falha já demonstrada pelo lote verde.
  Também manter auditáveis elegibilidade/autoridade durante concorrência, demais
  produtores e retomada por recibos antes de qualquer saída de B.
- B aberta; não liberar raiz parcial para repetição cega. Demais produtores,
  migração/retenção, UI/conciliacão e qualidade conversacional continuam pendentes.
  Sem build, publicação, migração real ou mudança de mídia/admin/autenticação/site.
  Não equivale a CRM passivo completo ou campos úteis derivados da conversa;
  esse contrato de observação/extração continua nas fases dependentes. C/D não
  iniciadas. Reversão exige diff isolado e preservação de recibos/trabalho ativo.

## Implementação aprovada localmente — B/C09-C10-C16, classificação de erro do funil

- Último turno foi progresso (CRM por ação, ampla 302/302). Snapshot e emuladores
  conferidos; nenhum teste próprio ativo ao iniciar. Sem custo/envio/publicação.
- Baseline inicial **1/4 em 18,00s**: freeze mascarava falha como pipeline null,
  aprovação podia commitar apesar de falha de leitura e claim transformava erro
  de armazenamento em conciliação permanente. Caso do efeito inicialmente atingia
  a segunda checagem da fonte, não a leitura pretendida. Injeção corrigida para
  terceira leitura (duas reautorizações antes): baseline próprio **0/1 em 7,59s**.
  Logs proposal-pipeline-{error,effect}-baseline-20261020.log preservados.
- TenantPipelineConfigurationError agora identifica somente cinco defeitos de
  dados do leitor transacional (inválido/ambíguo/empresa errada). Proposta,
  baseline e efeito capturam somente essa classe. Transporte/erro desconhecido
  preserva identidade e aborta, sem inventar funil ausente ou recibo bloqueado.
  Wrapper CRM inbound também não converte transporte em negativa de autorização.
- Falha antes de claim deixa origem ready e tentativa intacta. Falha depois de
  hooks iniciados continua exigindo conciliação: não reabrir raiz parcial. Lote
  registra failed e continua as demais origens, evitando bloqueio de toda agenda.
- Primeira correção **4/4 em 42,18s** (69561 encerrada); ampliação **6/6 em
  54,30s** (12583 encerrada), domain 1/1 em 7,60s. Tipos/lint 79106 aprovados.
  Ampla intermediária **321/321 em 364,61s**, zero skips/falhas, 55008 encerrada;
  incluiu consumidor draft-mutation adicional. Não somar lotes sobrepostos.
- Verificação complementar do classificador encontrou lacuna: novo erro de
  configuração ainda não reconhecido no scheduler, baseline **1/2 em 3,33s**,
  pipeline-classifier-baseline-20261020.log. Adicionada classe explícita ao
  predicado, nunca inferência por texto/código de transporte. Novo teste real
  da agenda exige conciliação sem tentativa/registro de envio para funil inválido.
  Essa revisão invalida o uso do 321/321 como prova do snapshot final. Nova
  verificação estática e regressão final ainda pendentes. B aberto, C/D não iniciadas.
- Fechamento revisado: classificador/agenda **3/3 em 9,54s**, 53571 encerrada;
  `pipeline-classifier-final-specific-20261020.log`. Tipagem e lint finais
  **2134 encerrada exit 0**, `pipeline-error-release-{types,lint}-20261020.log`.
  Não reaproveitar aprovação estática anterior para o novo arquivo/tsconfig.
- Ampla FINAL **324/324 em 411,62s**, zero falhas/skips/cancelamentos,
  **60167 encerrada exit 0**, `pipeline-error-release-full-regression-20261020.log`.
  Inclui 19 arquivos: os consumidores anteriores, draft-mutation e classificador.
  Dez casos novos no escopo desta unidade; não confundir 324 com conversas reais
  ou somar baterias sobrepostas. Isolamento e limites dos testes preservados.
- Hashes do snapshot final: crm/pipeline.ts
  `0fec0eee3c516f396bb96f52a1a46ddc8ba24c04adaf9aa998a5b6cae23a816f`;
  automation-proposal-delivery.ts
  `9eb865fba73dc96ffe0e2bdecc4499293c98c78633bd7743deef0a4fbe61a3f2`;
  automation-internal-effect.ts
  `245c7df89da9f34f3fd786e94057f3c708a1f8d398b5c28de929d3e687e1accb`;
  crm/proposal-mutation.ts
  `1f844eca2850ed05bf4a3ebac042969e7c05b57b5e5ee2e3ed0ff5eeb368f918`;
  testes de proposta
  `b5ec8aef3ca27ca4a6301413727f81467ca09c1aab79834fdd4b5f2c49221a51`;
  testes de automação
  `6cbe1d575f6ef8106be7699789f5f87c285e6788f2ec2786137c6ad543eab63d`;
  novo teste de classificador
  `38950d84efa31368ed90125f0ea4de2fa2225165490bf6319591c3cc5e954dcd`;
  tsconfig de testes
  `72b32fd6c37b291be5213bda46ed2bab67287b913370618cb74f0ab6f1117c39`.
- Nenhum teste próprio ativo ao fechar; 50324/69561/12583/79106/55008/53571/
  2134/60167 encerradas, emuladores compartilhados preservados. Diff check sem
  erro. Não houve chamada paga, leitura da loja, envio externo, publicação,
  migração real ou mudança de mídia/admin/autenticação/páginas públicas.
- Próxima unidade B com evidência de código: propagar causa aos hooks de
  lead_stage_changed invocados por proposta/pedido, que ainda podem cair no
  sendTenantChatText direto. Primeiro reproduzir sem transporte externo. Mapa
  retomável em AI_FOUNDATION_B_REMAINING_PRODUCERS_2026-10-20.md: criação,
  financeiro, sinais IA, versões manuais e limites continuam explicitamente
  pendentes. Pedido ainda tem catch pré-claim amplo, a testar no próprio consumidor.
  Não generalizar esta prova de proposta/inbound para todos os produtores.
- B permanece ABERTA, C/D não iniciadas. Migração/retenção, reconciliação, posse/
  elegibilidade concorrente e backlog de Conversas não estão concluídos. Sem
  build/release e sem agente conversacional novo comprovado. Reversão exige diff
  isolado e preservação de recibos, dados e alterações dos demais trabalhos.

## Aprovação local restrita — B/C09-C16-C17, envio imediato dos hooks de etapa

- Último turno foi progresso (classificação do funil, ampla 324/324). Repositório,
  emuladores e ausência de testes próprios ativos conferidos. Sem publicação.
- Baseline **0/2 em 9,18s**: proposta e pedido tentavam provedor antes de outbox,
  stage-source-baseline-20261020.log. Transporte bloqueado, nenhuma chamada real.
- Origem comprovada agora propagada nos hooks de etapa dos dois produtores.
  Planos/eligibilidade (inclusive vazio), reserva por automação e estado de execução
  ficam no MESMO job de origem, sem nova coleção/fila ou proposta sintética.
  Envio imediato usa outbox com identidade por origem/tipo/automação/índice;
  revalida fonte, plano, destino/canal e controle humano antes do provedor.
  O domínio stage permite também Enviado/Perdido com mudança de etapa real, sem
  relaxar a autorização separada de budget_approved. Mensagem espera origem done.
- Primeira correção **2/2 em 10,10s**. Ampliação **14/15 em 54,25s**: 12 revogações,
  replay/eligibilidade e espera passaram; entrega positiva virou resultado incerto
  após I/O simulado. Verificar persistência/fixture, não enfraquecer status esperado.
  Log stage-source-expanded-20261020.log. Tipagem inicial 93947 reprovou dois
  TS18048 do novo guard opcional; corrigido por existência explícita, sem cast.
- Diagnóstico positivo **1/1 em 15,77s** após fixture gerar wamid único por job;
  lote anterior reutilizava o mesmo ID em mensagens independentes. Mantidas
  assertivas de completed e de uma tentativa. Não é evidência de defeito real Meta.
- Ampliação atual **26/26 em 68,83s**, 66187 encerrada: propostas Aprovado/Enviado,
  incerteza, 12 revogações, espera, conjunto vazio/replay, teto mensal real e
  pedido com cinco revogações/erro transitório sem tentativa. Caso antigo de
  efeito parcial agora injeta falha no commit do outbox, não em envio direto que
  foi removido; tarefa continua única e origem não é reportada integralmente done.
  Tipagem 52719 reprovou TS2345 por colisão do nome source no fixture de pedido:
  string da origem era sobrescrita pela referência do job. Renomeada sourceJob,
  preservando tipo/entrada e sem cast. Estáticos finais confirmados na sessão
  40750: types=0, lint=0, exit=0. Os logs vazios da primeira execução sem recibo
  recuperável não foram usados como prova de aprovação; repetição já terminada.
- Regressão integral encerrada sobre esta versão: **349/349 em 522,17s**, zero
  falhas/cancelamentos/skips, 19 arquivos, processo 11596 (início 18:51 local),
  log stage-source-release-full-regression-20261020.log.
  O identificador original da sessão não foi recuperado após truncamento de saída;
  observador 20942 abriu handle do MESMO processo, confirmou
  regression_process_exit=0, TAP final 349/349 e terminou exit=0, sem duplicar
  testes. Não foi usado trecho parcial como aprovação integral. Fonte e testes
  sem mudanças durante a bateria: nove hashes reconferidos iguais ao final.
- Snapshot local (não é manifesto autorizado para publicar o checkout):
  automation-stage-delivery.ts
  `6aaf21d74ab675bcde1c3017c075e5d12f2f748e022d56ed5712d5d757ae4169`;
  crm/stage-effects.ts
  `9c776b93a1810487bca7b67589c658ee16d8ceb65567b47a394a50198b860b34`;
  crm/proposal-mutation.ts
  `64cf8630ac9ea97b56a5b83be8571935fcb710d66caea0a532cb9e85242b0e47`;
  crm/order-stage-transition.ts
  `46835b0a4c47d04abcdeb5861b3d4de148632af8854e4a235b70f4f1098251ff`;
  automations.ts
  `8ce70f3f9b28014df31839757ad438affb503dccfca68316aae3c26428b27542`;
  chat-outbound.ts
  `671a84ccc5c169647e7b495a66cfc16bbfe24b8296ec1f960ea2679b25616179`;
  tenant-usage.ts
  `dd58438889560808f067267b7950938a96d49699029247aa29b9436055156954`;
  tests/crm-proposal-update.emulator.mts
  `e4649f71e671c08be780357ba11ef8a0c967bf63f583bdc42c58406196418eff`;
  tests/crm-stage-transition.emulator.mts
  `3cb40fbb7f038a81d92d142e961a27be6d21a12e965190fc064b7dac052d9384`.
- Sem teste/tsc/lint próprio ativo na conferência final; emuladores compartilhados
  preservados. Diff check escopado aprovado. Build integral/release não executados.
  Nenhuma chamada paga, consulta à loja, envio externo, publicação ou mudança de
  mídia/admin/autenticação/páginas públicas nesta unidade. Incidente de mídia real
  não revalidado por esta bateria; backlog e trabalhos paralelos preservados.
- Importante: esta unidade cobre primeira integração de MENSAGENS IMEDIATAS.
  Tarefas/notas/CRM dos hooks ainda usam caminhos legados, protegidos apenas por
  marcador conservador de execução completa: execução parcial exige conciliação,
  não recebe retomada automática nem selo de recibo por ação. Agendados de etapa,
  migração/retenção e demais produtores continuam pendentes. Não publicar assim
  como solução completa. B aberta, C/D não iniciadas, objetivo integral mantido.
- Próxima unidade concreta: reproduzir efeito interno/CRM parcialmente aplicado
  em hook de etapa, vincular recibo por ação à MESMA origem e preservar edição
  humana no replay, sem reabrir raiz parcial. Prova da própria mudança de etapa
  e agendados precisam do mesmo contrato antes de aprovar a família inteira.
  Pré-claim amplo do pedido continua pendente; nova classe do funil não o corrige
  por inferência. Ver inventário atualizado, sem reiniciar o plano.

## Aprovação local restrita — B/C09-C10-C16-C17, recibos internos e CRM nos hooks de etapa

- Turno anterior classificado como progresso: 349/349, tipos/lint aprovados;
  B aberta. Sem testes próprios ativos na entrada; emuladores existentes prontos.
- Baseline **0/2 em 10,90s**, sessão 9285 exit=1, log
  stage-internal-baseline-20261020.log. Primeiro caso criou tarefa/nota/pendência
  sem recibos individuais; segundo mudou etapa por automação e invalidou a própria
  origem, deixando conciliação em vez de concluir o consumidor/enfileirar mensagem.
- Implementação inicial reaproveita o executor atômico de registros comerciais
  existente, com autorização própria e metadados stageSourceId/kind, nunca proposta
  sintética. Planos novos congelam baseline/propriedade/funil; não promover legados.
  Projeção da própria etapa exige recibo/plano/autoria exatos, não marcador no lead.
  Primeira correção **2/2 em 10,51s**, sessão 33312 exit=0; tipos iniciais 3040
  exit=0. Ampliação 3592: **17/17 em 55,20s**, exit=0; estáticos 46396:
  types=0/lint=0, exit=0. Snapshot intermediário, não aprovação final.
- Ampliação 36262: **23/25 em 62,85s**, exit=1. Dois casos de proposta pediam
  fechamento/qualificacao ausentes do funil sintético (que contém reserva/captado).
  Retornaram blocked_pipeline corretamente. Testes agora usam IDs existentes e
  exigem recibo applied; adicionado negativo explícito para etapa inexistente,
  sem habilitar destinos padrão nem enfraquecer a proteção do funil.
- Sessão 69682: **4/4 em 21,57s**, exit=0: propostas Aprovado/Enviado com ações
  subsequentes, worker frio (timeout 25s mantido) preservando edição/exclusão e
  destino inválido bloqueado. Seis casos de adulteração de prova já passaram no
  lote 23/25; precisam da regressão final na versão corrigida inteira.
- Regressão final **376/376 em 615,26s**, zero falhas/cancelamentos/skips, 19
  arquivos, incluindo os 27 casos novos desta unidade na mesma execução.
  Sessão 47691/processo 6976 encerrados, regression_exit=0 e exit=0; log
  stage-internal-release-full-regression-20261020.log. Não foram somados lotes
  parciais para inventar aprovação integral. Estáticos finais 21478 encerrados
  com types=0/lint=0, exit=0; logs stage-internal-release-types/lint-20261020.log.
  Nenhuma fonte/teste da unidade alterada durante a bateria: dez hashes
  reconferidos iguais ao fechamento. Outro trabalho rodou Conversas/mídia em paralelo
  (processo 3924, entradas distintas); preservado e não interrompido. Arquivos
  compartilhados críticos conferidos sem alteração posterior ao início até esta
  observação; isso não homologa mídia nem prova ausência universal de disputa.
- Snapshot local, não pacote autorizado para publicar o checkout:
  automation-stage-delivery.ts
  `d3e028483d61a55adb47eab5919f19f30199c01bba830454723b4deb1cf0b402`;
  automation-proposal-delivery.ts
  `57a82973aae58ba36abe37303e1863a458fc10eb31c22beb2b741f911dd52fd2`;
  crm/proposal-crm-proof.ts
  `ec09254ab0b938c5cdb3c1474390a4eb551cda0d9a6f1d311d09747cc4a46f70`;
  crm/proposal-mutation.ts
  `74f3817a4e3dd60ed23b9b19d4e7d13984a6eb231b87aa95b6fc49adf8d441cf`;
  crm/order-stage-transition.ts
  `6cd2ad486fdef2dd7fe3fd2e0992ef885249d9c69b77efdc654aa00344ea787b`;
  automations.ts
  `9751ee6b4dfe6c69fccc80a1cd04ceafb44916cd8ba2448acdb341aa890e79c7`;
  tests/crm-stage-transition.emulator.mts
  `413bf77ecf71d47dc2e5d85cc6be78ba7c90f1fe48f30a7c4fd97e1ead637c05`;
  tests/crm-proposal-update.emulator.mts
  `9620765fdaf2487952c6150a153883e89a0036dd436952a2d5852fdf3fcb5d4a`;
  tests/fixtures/stage-internal-worker.mts
  `4502f08b6c25677d7917125eac9bcb1c1ca5b63a2568cb0ba08deaf8e9ce1e4a`;
  tests/tsconfig.automation-delivery.json
  `247aafcff45197c764022772d103c2e8cb7734061481170926198df1240cae40`.
- Sem teste próprio ativo ao fechar: sessões 9285/33312/3040/3592/46396/36262/
  69682/47691/21478 terminais. Processos de outros trabalhos e emuladores
  compartilhados preservados; diff check escopado aprovado. Build/release não
  executados. Reversão exige diff isolado e preservação dos registros/recibos,
  sem repetir efeitos só por voltar código.
- Escopo: sete tipos imediatos internos/CRM em proposta/pedido; agendados de etapa,
  retomada da raiz parcialmente executada e demais hooks continuam pendentes.
  Nenhuma chamada paga, loja real, cliente, publicação, mídia/admin/auth alterados.
- Próxima unidade: reproduzir tarefa/mensagem agendada de etapa após revogação da
  origem, propagar manifesto/sourceId/kind e prazo original ao consumidor existente
  e reaproveitar o executor atômico/outbox. Não reabrir raízes parciais nem promover
  agendamentos antigos sem prova. Pré-claim amplo do pedido, retomada dos demais
  hooks, migração/retenção, autoridade concorrente e backlog de Conversas seguem
  pendentes. B permanece ABERTA, C/D não iniciadas; sem agente novo ou qualidade
  conversacional comprovados. Aprovação desta unidade não fecha o gate integral.

## Aprovação local restrita — B/C09-C10-C16-C17, agendamentos causais de etapa

- Turno anterior foi progresso: sete efeitos imediatos, ampla 376/376 e tipos/lint
  aprovados localmente; B aberta. Sem teste próprio ativo na entrada; processos de
  outros trabalhos preservados e emuladores existentes usados, sem nova instância.
- Baseline **0/3 em 12,98s**, sessão 88024 exit=1, log
  stage-schedule-baseline-20261020.log: tarefa criada e mensagem enfileirada após
  remoção da origem; prazo ancorado na tentativa de agendar em vez da ocorrência.
- Manifesto/ID/prazo originais implementados no MESMO job de origem e jobs
  agendados existentes, sem nova fila/cron ou proposta sintética. Guard nos pontos
  claim/cota/execução/enqueue/pré-provedor, configuração e humano revalidados;
  cota original reutilizada e executor atômico compartilhado mantido.
- Primeira correção **3/3 em 10,52s**, sessão 69020 exit=0. Tipagem 88475 exit=2
  por TS18048 do guard opcional initial; corrigida por existência explícita, sem
  cast/remoção de asserção. Ampliação 38669: **29/29 em 66,05s**, exit=0; estáticos
  96631 encerrados types=0/lint=0, exit=0. Não são aprovação integral do pacote.
- Baseline de falha transitória: primeira tentativa do teste 0/1 não alcançou o
  ponto pretendido porque o fixture recriava o funil ao preparar a segunda origem.
  Corrigido somente o preparo (reusePipeline mantém a MESMA configuração das duas
  ocorrências). Repetição 14487: **0/1 em 17,99s**, exit=1, código 14 da primeira
  leitura interrompe o lote antes de chegar à outra origem elegível. Claim agora
  tem cerca individual: falha não grava recusa permanente nem consome tentativa,
  conta failed e continua o lote. Validação em 23352, ainda em andamento.
- Propostas Aprovado/Enviado e revisão revogada também na ampliação atual. Worker
  isolado de retomada preparado; não equivale a entrega, inferência ou uso real.
- Sessão 23352: **3/4 em 31,11s**, exit=1. Teste de proposta Enviado contava só
  uma tarefa total depois de entregar; diagnóstico 81525 **1/2 em 18,87s** mostrou
  tarefa própria stage_effect_ e tarefa DISTINTA crm_automation de aguardar resposta.
  Confirmada política em crm/operations.ts (sales_journey_wait_for_reply), sem
  alterar runtime para removê-la. Teste agora exige uma tarefa agendada antes da
  entrega e preserva exatamente o lembrete esperado após envio não terminal,
  sem aceitar qualquer tarefa adicional. Revalidação 37384: **7/7 em 43,40s**,
  exit=0; estáticos finais 53009 encerrados types=0/lint=0, exit=0. Incluem
  recuperação de finalização, processo frio e contador limitado.
- Regressão integral iniciada, 19 arquivos, sessão 46784, log
  stage-schedule-release-full-regression-20261020.log. Não editar fonte/testes
  enquanto estiver ativa, não duplicar a execução nem transformar log parcial em
  aprovação. Nove hashes capturados antes da bateria para comparação final.
- Regressão 46784 encerrada exit=1: **411/412 em 574,20s**, zero skips/cancelados.
  Única falha: worker frio de agendamento excedeu timeout de 25s e foi encerrado
  (killed/SIGTERM, caso 27,15s), sem diagnóstico de etapa no stderr anterior.
  Não somar 29/29 ou 7/7 para aprovar esse lote, nem ampliar timeout/reduzir testes.
  Instrumentação QA numérica de bootstrap/import/consumo adicionada ao worker e
  stderr capturado pelo teste; sem log de tokens, dados pessoais ou nomes de loja.
  Próximo: medir carga fria/consumidor antes de alterar runtime.
- Diagnóstico 51940: **78/78 em 190,13s** no arquivo completo, exit=0; worker
  runtime_loaded 2.212ms, consumer_finished 4.259ms, caso 5,97s. Isolado não
  elimina falha sob a bateria conjunta. Novo contrato de importação vazio 85527:
  **0/1 em 14,41s**, exit=1: scanned=0 mas ecommerce.ts carregado. É evidência
  de carga desnecessária, não prova isolada de causa do timeout anterior.
- Separado consumidor leve commerce/shopify-occurrence-recovery.ts com as MESMAS
  consultas, limites e efeitos; handler ecommerce.ts carregado apenas dentro do
  processamento de ocorrências encontradas. Reexport antigo preservado; scheduler
  usa módulo leve, sem remover fila, cron ou tratamento de evento real. Primeiro
  teste 53679 **1/1 em 14,27s**, exit=0 (caso 7,68s, runtime 2.262ms, consumidor
  4.352ms). A asserção agora também impede recarregar o grafo pesado com fila vazia.
  Timeout de 25s e todas as asserções de recibo/edição/prazo/cota mantidos.
- Regressão intermediária com eventos Shopify reais de fixture e recuperação:
  18711 **107/107 em 229,02s**, exit=0, três arquivos; worker runtime 2.421ms,
  consumidor 4.729ms, fila vazia não importou handler pesado. Estáticos 46194
  types=0/lint=0, exit=0. Não substitui repetição da ampla 412 nem comprova causa
  única do timeout/SLA de produção. Novo pacote amplo precisa do código atual,
  incluindo consumidor leve, ecommerce reexportado e diagnóstico QA.
- Repetição integral atual: sessão 52352, 19 arquivos, log
  stage-schedule-lazy-release-full-regression-20261020.log. Estáticos atuais 54922
  encerrados types=0/lint=0, exit=0. Onze hashes do novo snapshot capturados; não reaproveitar os
  nove hashes/resultado 411/412 anteriores nem editar fontes/testes nesta execução.
- Repetição encerrada: **412/412 em 562,07s**, zero falhas/skips/cancelamentos,
  regression_exit=0 e exit=0. Mesma bateria integral de 19 arquivos, com os 36
  casos novos e asserção adicional de fila vazia sem handler pesado. Worker frio
  no lote completo: caso 7,13s (timeout 25s mantido), runtime_loaded 3.014ms,
  database_loaded 3.027ms, consumer_finished 5.385ms. Não soma execuções isoladas
  à ampla anterior reprovada; não comprova causa única nem SLA de produção.
- Onze hashes estáveis durante o lote, reconferidos ao final. Snapshot local,
  não manifesto autorizado para publicar o checkout compartilhado:
  automation-stage-delivery.ts
  `642a3e7186cee37b3818b58db56d7e13a9122d79d2d25e3b6d0b40de2cb20c07`;
  automation-proposal-delivery.ts
  `05282f4f02c6c25e2f7a24739c30aa03a9e6f1550ccc74fa20071791e49d0f00`;
  automation-message-delivery.ts
  `da4aba246a69c70e7a5c03f584f7b9169e0188d2fd8363b096c81a07488dab63`;
  automations.ts
  `e0ec6424af3436664ab3f1c2605d0a9a8c1060d0a967d7c63a875804152e0012`;
  tenant-usage.ts
  `2094b65461628276a5333bff36f7f5f47272d4744ad8aa43d237178958e959de`;
  commerce/shopify-occurrence-recovery.ts
  `29a082449bb2bf00353f2acbf8283289242091cb5ff508f7e7a7f919931c0ee7`;
  ecommerce.ts
  `9b46f0e385e1bc701743d8f4e7d049b93aff6d55d900fc6c44149ac7bd8edadf`;
  tests/crm-stage-transition.emulator.mts
  `583bd7a2b3c528b778670139bc05fec4f73632f1d539a325141208518687489a`;
  tests/crm-proposal-update.emulator.mts
  `6085d36b5ce29dcb2a2f1fc3a92be31f13ac17c51a49967a4b330063f360062f`;
  tests/fixtures/stage-schedule-worker.mts
  `d73fe430dd87c9c5d5d1841bbe10d9b34c6be0774783eede6fd1b35a9c2e9721`;
  tests/tsconfig.automation-delivery.json
  `7788d1a997b884869e5feefd423f1bfa8d18764959fa917dc40ed9530d3adcc9`.
- Sem teste/tsc/lint próprio ativo na conferência final: 88024/69020/88475/38669/
  96631/14487/23352/81525/37384/53009/46784/51940/85527/53679/46194/18711/
  54922/52352 terminais. Emuladores e trabalhos paralelos preservados; diff check
  escopado aprovado. Nenhum build, publicação, chamada paga, consulta à loja ou
  envio externo por esta unidade. Reversão exige diff isolado e preservação dos
  recibos/registros: voltar código não autoriza repetir intenções antigas.
- Próxima unidade B: reproduzir indisponibilidade do funil na admissão/pré-claim
  do pedido (catches amplos ainda presentes), mantendo erros genuínos de configuração
  distintos de armazenamento e sem conciliação antes de efeito. Depois, exclusão/
  restauração de raízes e recibos sem chatId (inventário aponta lacuna no coletor,
  ainda não teste funcional). Agendamentos antigos sem fonte, raiz/hook parcial,
  demais produtores, ordem/capacidade e autoridade concorrente continuam pendentes.
  **B ABERTA, C/D não iniciadas**; sem entrega de agente novo, publicação ou
  qualidade conversacional comprovada. Aprovação apenas do snapshot local descrito.
- Agendamentos legados sem vínculo não recebem promoção automática. Raiz/hook
  parcial, demais produtores, retenção/migração/ordem/autoridade concorrente e
  backlog de Conversas continuam pendentes. Sem chamada paga, loja real, mensagem
  a cliente, publicação ou mudança de mídia/admin/autenticação/páginas públicas.

## Implementando — B/C09-C10-C16-C17, falhas transitórias do pedido

- Turno anterior foi progresso: agendamentos causais, ampla 412/412 e estáticos
  aprovados no snapshot anterior; B aberta. Instruções/estado conferidos; nenhum
  teste próprio ativo, emuladores existentes preservados, sem nova publicação.
- Baseline 18243: **0/3**, exit=1, log order-pipeline-errors-baseline-20261020.log.
  Admissão transformava leitura indisponível em blocked_pipeline persistido;
  pré-claim trocava ready por conciliação sem efeitos iniciados. Lote não tinha
  contagem de falha/continuidade correta para a ocorrência com erro de leitura.
- Admissão agora captura somente TenantPipelineConfigurationError; pré-claim
  captura só defeito real de configuração/códigos explícitos CRM_STAGE_. Erros
  de armazenamento/desconhecidos preservam identidade e não consomem a ocorrência.
  Marcador de protocolo inválido ganhou código de domínio, sem inferir pela língua.
  Primeira verificação concluída: **2/3**, uma falha, em 43,87 s, conforme
  order-pipeline-errors-first-fix-20261020.log. Identificador da sessão não
  recuperado; nenhum processo desse teste permanece ativo. Admissão e pré-claim
  passaram; lote ainda aborta com QA_ORDER_SOURCE_UNAVAILABLE (código 14), sem
  correção própria aplicada. Esta unidade ainda não está aprovada.
- Depois: verificar configurações inválidas/estrangeiras/ambíguas, preservação
  humana, efeito iniciado e replay. Sem ampliar escopo para serviços/áudio ou
  mexer em admin/auth/páginas públicas; nenhum custo pago, loja ou cliente real.

## Ponto de retomada confirmado — 20/10, após diagnóstico de reinício

- As sessões 87143, 97735 e 47656 terminaram; não há teste próprio pendente da
  unidade de autoridade Shopify. Regressão final principal: 169/171 em 275,55 s.
  Compatibilidade adicional: 72/72 em 167,36 s. Os dois cenários de reinício que
  excederam 25 s passaram isolados, mantendo seus limites e asserções: **2/2 em
  40,85 s**, workers em 15,52 s e 10,47 s, execução de arquivos em série. Não soma
  169+2 para declarar 171/171: falha sob execução conjunta permanece aberta.
- Tipagem do tsconfig.automation-delivery, ESLint dos sete arquivos da unidade e
  diff check terminaram com código zero. Somente avisos de conversão LF/CRLF do
  Git, sem reformatar arquivos. Log estático vazio não era prova enquanto a sessão
  estava ativa; conclusão confirmada na saída da sessão 47656.
- Nesta retomada foram conferidos os logs persistidos e os hashes de autoridade,
  ecommerce-agent e chat-outbound: iguais aos registrados abaixo. Nenhum processo
  node de testes/tsc/eslint desta unidade encontrado no inventário atual. Ausência
  de processo não substitui os recibos de término obtidos no turno anterior.
- Próxima unidade B/C16-C17: diagnosticar tempo de importação/inicialização dos
  workers frios e disputa sob lote completo, preservando timeout e sem interromper
  builds de outros trabalhos. Encontrado acoplamento de helper getChatStateDocId
  ao módulo ai/agent.ts em authority e outbox; isso é hipótese de custo de carga,
  não causa comprovada e ainda não foi alterado. Medir antes de refatorar; repetir
  o lote sobre código final e manter o risco anterior de lock/latência visível.
- Permanecem pendentes os demais gates B descritos abaixo. C/D não iniciadas,
  agente novo/qualidade conversacional não entregues, nenhum novo deploy/piloto.
  Não há evidência de trabalho adicional apenas por receber heartbeats agendados.

## Retomada — B: ações ecommerce ligadas à ocorrência

- Turno anterior: progresso, 131/131 e 81/81, B aberta. Nenhum teste próprio ativo.
  Unidade C16/C17, contratos 19.1/19.2, executor desta missão. Congelar ações da
  ocorrência e configuração; preservar intenção/destino aceitos, revalidar a ação
  no claim e antes do provedor, inclusive pausa humana. Não varrer outros pedidos
  em webhook. Reusar ecommerce_events/actions/outbox; sem API paga/envio real.
- Arquivos-alvo: ecommerce.ts, ecommerce-agent.ts, action-delivery, outbox e contrato
  compartilhado. Testes de integração em fixtures, incluindo revogação após enqueue;
  manual/legado e mudanças paralelas preservados, sem declarar sua migração global.
- Implementado localmente: commerce/shopify-action-authority.ts vincula intenção,
  destinatário, conteúdo, configuração e lote congelado à ocorrência admitida.
  Webhook Shopify deixa de varrer/backfillar pendências alheias do tenant. Claim,
  preparação do envio e transação imediatamente pré-provedor revalidam o vínculo,
  configuração, conexão, estado do pedido/carrinho e controle humano. Remover o
  guard não permite cair silenciosamente no caminho legado. Automático registra
  autoria de IA e não pausa a própria conversa; envio manual explícito mantém
  contrato distinto. Intenção pendente ainda sem envio/claim pode atualizar fonte
  após conclusão anterior, com revisão e auditoria; intenção vinculada não é
  silenciosamente reescrita. Plano congelado não incorpora ações criadas depois.
- Baseline inicial 0/2; primeiros ajustes detectaram fingerprint do template sem
  incluir o novo guard na recomputação. Corrigido nos dois consumidores. Lote
  intermediário 27/27; expansão 5/12 encontrou bloqueios de política tratados como
  retry genérico e um fixture com undefined. Corrigidos classificação e fixture,
  sem relaxar proteção ou configuração do banco; depois 12/12 e cerca adicional
  1/1. Regressão principal **169/169 em 120,84 s**, 13 arquivos, sem skips/falhas.
  Tipagem/lint aprovados nessa versão intermediária, não aprovação do pacote final.
- Regressão adicional **65/72 em 137,46 s**: seis falhas de mídia de campanha e
  falha no teardown. Log do Firebase registrou ENOENT em blob temporário e o
  processo local Auth/Storage desapareceu; teardown encontrou ECONNREFUSED:9199.
  Não corrigidos/desativados testes de campanha para esconder essa falha. Restaurados
  somente Auth/Storage do projeto demo, configuração QA existente; Firestore foi
  preservado. Serviço recuperado PID 13636, sessão 31197, portas 9099/9199;
  Firestore PID 5356/8080 preservado. Sem apagar blobs nem alterar autenticação do
  produto. Usuários em memória do emulador Auth anterior não foram recuperados.
- Dois novos cenários: revogação antes do claim e erro transitório do banco. O
  primeiro passou no lote adicional. O segundo reprovou isoladamente (0/1 em
  64,24 s): erro gRPC 14 era convertido em proibição permanente. Implementada
  preservação dos códigos transitórios 4/8/10/13/14; claim não esconde I/O como
  autorização negada. **Verificação final desta alteração ainda pendente.**
- Repetição dos quatro arquivos (authority, chat-template-outbound, mcp-message-
  delivery, campaign-recipient-delivery) e tipagem/lint foram iniciados após a
  recuperação. Na retomada seguinte, processos próprios 5044/7956 e 10004 ainda
  ativos, sem resultado final recuperável; não contar como aprovados. Solicitada
  interrupção apenas desses processos de verificação, conferindo seus argumentos,
  para permitir nova execução com evidência persistida em arquivo. Confirmar saída
  antes de reiniciar; não duplicar testes. Build concorrente de outro trabalho e
  emuladores não foram alvo. IDs de sessões de teste anteriores não recuperáveis
  nesta retomada; saída desconhecida não significa sucesso nem falha de asserção.
- Dois índices adicionais de ações por tenant/fonte e tenant/job apenas locais;
  instalação e prova remotas pendentes. Não houve nova chamada paga nem envio real.
  Limites: caminhos legados não foram promovidos; revisão de intenção já vinculada,
  reconciliação granular/UX, ordem entre eventos/pedidos, LTV, retenção/migração,
  quotas/carga e isolamento do pacote continuam pendentes. Checagem do snapshot
  persistido não comprova catálogo/estoque ao vivo nem qualidade do novo agente.
  A fronteira pré-provedor não desfaz envio já iniciado. B/gate 2 ABERTOS; C/D não
  iniciadas, nada publicado por esta unidade. Orientação create-a-backend mantém
  banco/outbox/consumidor existentes, sem plataforma ou fila paralela.
- Próxima ação obrigatória: confirmar término dos três processos próprios citados;
  repetir quatro arquivos e verificações estáticas com log persistido sob
  .qa-artifacts; repetir regressão principal com a versão final, registrar hashes
  e atualizar gate/auditoria com resultados efetivos. Não reaproveitar 169/169 como
  prova de código alterado depois do lote. Custo anterior permanece registrado,
  sem novas chamadas neste ciclo.
- Atualização verificada: processos próprios 5044/7956/10004 encerrados; pesquisa
  diagnóstica somente leitura também encerrada. Nova repetição com log persistido
  terminou **72/72 em 167,36 s**, zero falhas/skips/cancelamentos, quatro arquivos
  citados acima. Inclui os 15 cenários de autoridade, inclusive I/O gRPC 14, que
  preserva erro transitório sem convertê-lo em proibição definitiva. A interrupção
  anterior continua sem resultado, não é convertida em aprovação retrospectiva.
  Log: .qa-artifacts/shopify-authority-compat-final-20261020.log. Ledger conferido:
  US$ 0,002858 comprometidos/confirmados, US$ 2,997142 restantes, duas chamadas
  históricas, zero reservas/novas chamadas. Regressão principal final iniciada
  após término desta: sessão 87143, log shopify-authority-regression-final-20261020.log.
  Tipagem/lint final ainda ativa na sessão 47656, log
  shopify-authority-static-final-20261020.log. Não duplicar enquanto ativas.
- SHA256 da versão final em validação (não é pacote publicado):
  commerce/shopify-action-authority.ts
  `a5998b089812f510daa67e849a87c96160544611342b01742a83a6a4e76f008a`;
  commerce/shopify-occurrence.ts
  `4c14117302817adf8e7c24c606db521aea2a3e07e1e141aa3b4dcc43c56f42d1`;
  ecommerce.ts `7673da8ff83b39f030829afd75585fe172104b46a4fdfaaa4e3ad98954553d42`;
  ecommerce-agent.ts `de1ad3204096203518599f2470481adeeaf67e19176272664664622f7d2338fc`;
  ecommerce-action-delivery.ts
  `6f773aec6d9cbff0b8885bc95f9b7fb2eb5792c7e5a22df581c6492d098e7826`;
  chat-outbound.ts `4d4f71694b32907c6f8c77de3ad6803d5d84bdebf7b7c2f9d8aa2bdf391b7e24`;
  teste authority `e7e6859dc66b96bc6c0f2a83757f64391b9d461453635b2cb945270daf55a8b9`;
  tsconfig `df87ea82bbd42e268ed18687f44a2ad21031c5aba766590ba185edc8e44a76c8`;
  índices `d1eff4d8b74f4687e9a4cd14063c877863845f3403ce8af4eceaaed165ac96af`.
- Regressão principal da versão final terminou **169/171 em 275,55 s**, zero skips:
  falharam dois workers frios, shopify-occurrence-worker (27,17 s) e
  proposal-create-replay-worker (25,65 s), ambos encerrados por SIGTERM do timeout
  de 25 s de seus testes. Não houve relaxamento do limite nem mudança das asserções.
  Os 15 testes novos de autoridade passaram; os 20 upserts simultâneos de contato
  passaram, mas levaram 64,54 s (risco anterior de carga/latência continua aberto).
  O resultado final **não substitui** o 169/169 intermediário por uma aprovação
  fictícia de 171. Log principal acima preservado com os dois erros completos.
  Diagnóstico isolado, mesmos testes/limites, apenas esses dois cenários em série:
  sessão 97735, .qa-artifacts/shopify-authority-restart-diagnostic-20261020.log.
  Checagem de tipos final passou e avançou ao ESLint; sessão 47656 ainda ativa.

## Retomada — B: admissão e exclusividade da ocorrência Shopify

- Turno anterior foi progresso: três projeções e ID de sync, regressão 119/119 na
  repetição; lock timeout anterior preservado como risco. Nenhum processo próprio
  ativo. Unidade C10/C16/C17, contratos 19.1/19.2/19.4, executor desta missão.
- Congelar fonte antes de intake/derivados; ocorrência aceita tem estado durável,
  um executor, replay sem repetir fluxo e recuperação de ready no consumidor já
  existente. Iniciado sem confirmação exige conciliação, sem repetir efeitos cegos.
  Reusar ecommerce_events; legado sem prova não é promovido. Sem alterar admin,
  autenticação ou conector Shopify. Somente fixtures locais, não publica.
- Baseline **0/2 em 10,77 s**: replay regravava lead/intake e ID reutilizado com
  preço diferente substituía a fonte antes de ser recusado pela projeção. Migração
  do caminho real para commerce/shopify-occurrence.ts; primeira correção **13/13
  em 16,93 s**. Protocolo 1 em ecommerce_events. Admissão transacional com conta
  ativa congela tópico/ID externo/payload/normalizado/fingerprint; replay só atualiza
  metadados de recebimento, nunca troca conteúdo aceito. Legado/alterado recusado
  antes dos handlers, sem promoção por conveniência ou reset de recibo.
- Estados ready→processing→done ou reconciliation_required; token/lease de 120s,
  tentativa contada na aquisição. Um executor por ocorrência; entrega concorrente
  informa processing/completed=false. Repetição de done devolve recibo, sem intake,
  LTV, tarefas, CRM ou automação novos. Done significa handlers retornaram, não
  entrega no provedor. Erro parcial/lease expirado nunca volta a ready automaticamente.
  Não apaga efeitos confirmados nem declara rollback de integrações externas.
- Ready sem handler iniciado recupera pelo processPendingAutomationActions existente,
  sem nova fila/coleção/cron. Fonte congelada e conexão atual verificadas; recuperação
  não incrementa deliveryCount. Pausado/adulterado/expirado exige conciliação. Leitura
  ready por receivedAt; processing expirado por lease. Quatro índices locais novos
  (com/sem tenant). Instalação/validação remotas pendentes, sem publicação de índices.
- Guard por limite de ramo (produto/pedido/carrinho/agente/conclusão). Estado done,
  contadores da ocorrência e metadados permitidos da conexão no mesmo commit;
  conexão excluída não é recriada. Contadores mantêm semântica anterior por evento,
  não provar contagem de pedidos únicos. Outros provedores preservam fluxo anterior.
  Resposta distingue completed/replayed/requiresReconciliation/processingState.
- Lote ampliado **19/20 em 29,62 s**: teste de falha parcial contava um evento total,
  mas havia também auditoria legítima de qualificação. Corrigido para exigir exatamente
  um intake ecommerce_order e manter contagem TOTAL inalterada no replay; não retirou
  requisito de idempotência nem mexeu em produção. Lote seguinte **21/21 em 35,92 s**,
  incluindo processo novo que retoma ready pelo consumidor real existente.
- Depois foram adicionadas provas de atomicidade da conclusão e exclusão da conexão.
  Regressão principal **131/131 em 102,39 s**, dez arquivos do lote anterior; 23 casos
  no arquivo ecommerce-projection. Sem skips/falhas, emulator demo explícito, fetch
  externo bloqueado. Teste de 20 contatos simultâneos passou neste lote; timeout
  intermitente anterior não foi apagado nem diagnosticado como resolvido.
- Tipagem detectou sobrecarga SDK no interceptor de teste (TS2555): anotado overload
  update(ref, objeto), sem mudar argumentos/asserções/runtime do produto. Tipagem,
  ESLint dos cinco fontes e diff check aprovados. Regressão adicional sobre automações
  compartilhadas + arquivo Shopify após anotação: **81/81 em 125,42 s**, três arquivos
  (automation-message-delivery.emulator, automation-inbound-producers.test,
  crm-ecommerce-projection.emulator, todos .mts), sem skips/falhas. Inclui novamente
  os 23 casos Shopify na versão final do teste. JSON dos quatro
  índices validado localmente. Sem build global/HTTP Next/browser/deploy.
- Limites e próxima unidade: ainda não há retomada granular dos efeitos após falha
  parcial; conciliação exige operação/auditoria e interface supervisionada pendentes.
  Guards de ramo não substituem cerca por ação interna, destinatário, pausa humana
  ou revogação durante envio. Agente ecommerce legado, conversões, escopo do lote de
  ações e recibos individuais devem ser vinculados causalmente antes de homologar B.
  Ordem entre eventos DIFERENTES do mesmo pedido/carrinho, múltiplos pedidos, valores
  históricos, LTV/revenue e aliases continuam pendentes; não são resolvidos pelo root.
  Ready pode ser recuperado após queda; não significa disponibilidade/carga homologadas.
- Release ainda bloqueado: legado não comprovado exige conciliação/migração, fonte e
  recibos/tombstones precisam retenção e rollback compatíveis, índice remoto precisa
  prova, consumidores de HTTP/sync devem apresentar pendente/incerto sem sucesso
  operacional falso. Nenhuma limpeza/backfill/alteração de autenticação ou admin.
  Sem novo motor conversacional; C/D não iniciadas. B e gate 2 ABERTOS.
- Ledger sem alteração: US$ 0,002858 usados, US$ 2,997142 restantes, zero reservas.
  Nenhuma chamada paga, cliente real, compra, estoque, piloto ou publicação. Orientação
  create-a-backend manteve estado no banco e consumidor existentes, sem replatforming.
- SHA256 dos fontes do lote 131 e da regressão adicional (sem mudanças de runtime
  entre eles): commerce/shopify-occurrence.ts
  `23c9add2864b9d4b45c658b7d0ff314ab2fff2403be0e4536ba3da115db4ec59`;
  ecommerce.ts `4a8540eb3678da17eb4a3a1fd856592f241383146e7915d74f4a4d8568a1ea02`;
  automations.ts `160ad38d31743e3c57dd67ebadaeaf6c5d96acb7c2c78e1760ecabab71c87b43`;
  teste final `133dbed812d4cbe46bf908987fe9e5b6d046885bb4139a83b23717e6659b44c2`;
  worker `9dd35aa7ccb87c12d1b9c46ed8b858767599a37d47734b1833bb69764bdae9ef`;
  tsconfig `7a25fadff72e43000d8ddecedb79fa832ffc5faf745932144edf6c3a156f26f7`;
  índices `189b74c443f403b06194f56071ba303ed79bbf26d822a4e34eddadd645b279a0`.
  Arquivos compartilhados preservam alterações anteriores. Nenhum processo próprio
  pendente; emuladores existentes mantidos. Não somar 131+81 como casos distintos.
- Próximo alvo confirmado no código: ecommerce-agent.ts/processTenantEcommerceActions
  recebe tenant/source/limit, mas busca pendências do tenant inteiro e executa
  backfill/recovery antes do lote; não recebe IDs da ocorrência nem callback de
  validade. Congelar o lote causal/escopo e revalidar por ação antes de considerar
  a cerca root suficiente. Nenhuma edição desse executor nesta unidade.

## Retomada — B: projeção Shopify pós-intake

- Turno anterior foi progresso (108 testes). Nenhum processo próprio ativo.
  Unidade C10/C16, contratos 19.2/19.4, executor desta missão. Auditar três writers
  de ecommerce.ts: pedido, carrinho abandonado e recuperado. Condição: prioridade/
  tags manuais preservadas, cadastro excluído não recriado, projeção/evento atômicos
  e repetição da projeção não regrava estado humano posterior. Fixtures locais.
- Reutilizar evento de lead existente como recibo versionado; não nova fila/cron.
  Preservar conector e mudanças paralelas. Ocorrência integral/intake/fan-out/LTV
  continuam separados; estes testes não fecham B nem iniciam novo motor.
- Baseline **0/3 em 6,55 s** confirmou prioridade manual low substituída por high
  em pedido/carrinho abandonado e tag adicionada a campo bloqueado no recuperado.
  Depois da migração, primeiros **3/3 em 6,90 s**. Novo caso de sync revelou ID de
  recurso reutilizado com snapshot alterado: **0/1 em 7,12 s**, conflito de recibo.
- `crm/ecommerce-projection.ts` é consumidor dos três caminhos reais Shopify.
  Transação confere tenant/lead existente, evento normalizado/objeto/conta ativa,
  protege prioridade/tags manuais, registra antes/pedido/aplicado/bloqueio e autoria
  system_event quando escreve esses campos. Não altera etapa/pipeline por este
  helper; etapa mantém contrato próprio. Outros provedores mantêm caminho legado.
- Lead/evento original/recibo no ecommerce_events compartilham commit. Protocolo 1
  em `crmProjectionReceipts.<kind>` e evento do lead; ID de evento de lead preservado.
  Recibo guarda fingerprint do snapshot, alvo, kind, campos bloqueados e significado
  `lead_projection_committed_not_downstream`. Repetição válida não regrava lead,
  timestamp nem recibo; outro lead, snapshot modificado, recibo parcial/legado ou
  protocolo desconhecido exigem conciliação. Não promove legado nem recria excluído.
- `commerce/event-identity.ts` centraliza digest canônico (ordem de chaves não gera
  ocorrência nova). Somente entrada de sync Shopify ganha `sync:v1:<digest>` com
  identidade original/tópico/payload completo. Snapshot igual repete mesma ocorrência;
  alterado cria outra. IDs reais de webhook permanecem intactos. Não alterado adapter
  Shopify de outro trabalho. Regras de versão/ordem de atualização ainda pendentes.
- Lote **11/11 em 16,21 s**, incluindo quatro caminhos de produtor (3 webhook + sync),
  cinco commits concorrentes, atualização humana posterior ao aceite, rollback com
  falha de audit, revogação/tenant/objeto, fonte alterada/outro destino, protocolos
  legados/parciais e excluído. Tipagem ampliada e ESLint dos quatro fontes aprovados;
  diff check aprovado. Primeiro lote ampliado **118/119 em 185,98 s**: única falha
  em omnichannel-identity, 20 upserts simultâneos do mesmo contato, erro gRPC 10
  ABORTED Transaction lock timeout (108,77 s). Não removido teste nem aumentado
  limite/retry. Após processo terminar, repetição isolada do mesmo caso passou
  **1/1 em 18,53 s**, mantendo 20 simultâneos. Isso indica sensibilidade à disputa,
  não prova causa resolvida. Regressão integral idêntica em reexecução; B continua
  reprovada para saída. contact-profile.ts não modificado; observar loops de retry
  existentes e regravação concorrente de alias/perfil no próximo diagnóstico.
- Reexecução integral, mesmo comando/código/critérios: **119/119 em 100,92 s**,
  dez arquivos, sem skips/falhas. Caso de 20 upserts passou em 16,36 s. Registrar
  ambos os lotes: aprovação da repetição não corrige nem apaga lock timeout anterior.
  Risco de concorrência permanece aberto para carga/latência/recuperação da B/F.
  Comando `node --import tsx --test` com crm-ecommerce-projection.emulator,
  crm-lead-intake.emulator, crm-passive-business.emulator, crm-stage-transition.emulator,
  ecommerce-journey.test, crm-proposal-update.emulator, crm-proposal-create.emulator,
  ai-text-delivery.emulator, ai-social-text-delivery.emulator e
  omnichannel-identity.emulator (todos .mts). Firestore 127.0.0.1:8080/Auth 9099,
  projeto demo-altum-qa-lab e credenciais reais vazias. Nenhum processo próprio
  pendente; emuladores existentes preservados. Não é corpus/modelo real nem go-live.
- Limites: só projeção interna é atômica/idempotente. Intake, contato, LTV/receita,
  tarefas/ações, conversões e fan-out anterior/paralelo/posterior ainda não compartilham
  esse recibo. Payload de webhook ainda pode substituir fonte persistida antes da
  recusa; admissão imutável e worker causal da ocorrência inteira continuam urgentes.
  Vários pedidos, evento tardio/fora de ordem e lastEcommerce* não resolvidos aqui.
  potentialValue/valorPotencial continuam derivados legados sem autoria por campo;
  não anunciar que todo CRM foi protegido. Campos comerciais diferentes dos dois
  avaliados exigem contrato/migração; nenhuma alteração de política comercial.
- Publicação bloqueada: novo ID de sync exige migração versionada/reconciliação dos
  eventos e efeitos antigos antes de reenquadrar snapshots já vistos como novos.
  Recibos devem sobreviver a rollback/retenção conforme política; excluir só um lado
  exige conciliação e não replay. Fonte com recibo e lead excluído não ressuscita,
  mas apagar todos os recibos remove barreira. Sem rule/TTL/backfill/limpeza alterados.
  Erros conservadores ainda precisam destino operacional e retry classificado.
- Nenhum modelo pago, mensagem real, mudança Shopify, publicação, build global ou
  teste HTTP/autenticação remota. Ledger sem alteração: US$ 0,002858 usados,
  US$ 2,997142 restantes, zero reservas. B/gate 2 abertos; novo agente não entregue.
  Próxima unidade: admissão imutável/retomável do evento antes de qualquer efeito,
  incluindo identificação da ocorrência no intake e causalidade dos derivados.
- SHA256 da versão dos dois lotes ampliados: ecommerce.ts
  `23407bbca66e9e7d41e53100723f5138b6ea43341234668343a84925548e6eea`;
  crm/ecommerce-projection.ts
  `38f164c01e2646cd1ee797503075b10888daed29f067ce8a851e325d41055cb2`;
  commerce/event-identity.ts
  `33211cb9b9edfce0d79c0f5c83a9cf7f6208fec0a30909e8e87a6daf234423b9`;
  teste `3baac108f6a7d5419775820d82e57be3ecca2e6d938b72e50cf8e515feff90cd`;
  tsconfig `ffe08ae6b9438fb21a36ebd9b801af84f7d5e91e9d8698f1df3c859bbe77ce9f`.
  Arquivo compartilhado contém mudanças anteriores preservadas, não todas desta unidade.

## Retomada — B: convergência de criação do intake

- Turno anterior: progresso, 101 testes e proteção de seleção comprovados localmente.
  Nenhum processo próprio ativo na retomada. Unidade C10/C16, contratos 19.2/19.4;
  executor desta missão. Arquivos: lead-intake.ts, teste do intake e registros.
- Condição de saída desta unidade: entradas concorrentes com mesmo email/telefone
  convergem para um lead, somente uma retorna created=true, preservam cadastro
  humano; vínculo persistido inválido/excluído não ressuscita nem cruza tenant.
  Reutilizar lead_identities com namespace/protocolo explícito, sem alterar os
  documentos social_lead existentes. Não inferir que nome é identidade.
- Baseline **0/3 em 9,60 s**: concorrência terminava em erro "identidade mudou",
  não existia vínculo durável para exclusão e vínculo adulterado era ignorado.
  Implementado no consumidor real, sem mudar canais/conector/admin/autenticação.
- Para email/telefone aceitos, protocolo 1 `kind=intake_identity` em
  `lead_identities/intake_identity_<sha256([tenant,field,value])>`. Vínculo, lead e
  evento/submissão no mesmo commit; leituras do vínculo precedem seleção/transação.
  Campo não preenchido é aceito; alternativa divergente de campo já preenchido
  fica observada no evento, sem virar alias. Nome sozinho não produz vínculo.
- Se outro intake criar primeiro, a transação adota o cadastro encontrado e retorna
  created=false; somente o criador agenda workflows de criação. Vínculos apontando
  para destinos divergentes, de outro tenant, excluídos ou sem identidade compatível
  são recusados. Protocolo/field/kind inválido não cai em criação ou legado.
- Lote **26/26 em 31,44 s**, incluindo 5 entradas simultâneas por email, 4 por
  telefone, protocolo adulterado, exclusão/alteração após vínculo, alternativa não
  promovida, rollback de vínculo junto com erro do evento e processo Node separado
  preservando owner/notas humanos. Não é reinício do servidor Next/provedor, nem
  prova de replay da mesma ocorrência. Test worker só demo local, sem fetch externo.
- Limites: vínculo apenas email/telefone do intake; sourceId/perfil externo continuam
  na seleção escopada anterior e na infraestrutura social existente. Canonicalização
  integral entre todos os escritores/contas não foi homologada. Escritores antigos
  que ignorem protocolo não estão serializados por ele; publicação exige pacote e
  drenagem compatíveis. Não autentica identidade para consulta de pedido privado.
  Hash não torna dado anônimo; acesso restrito pelas regras existentes (deny por
  padrão), retenção/eliminação de identidade/tombstones e migração exigem revisão
  antes de publicar. Vínculo retido bloqueia recriação; removê-lo pode retirar essa
  barreira. Nenhuma alteração de rules, TTL ou limpeza histórica executada.
- Recibo causal de ocorrência e retomada de efeitos pós-commit seguem obrigatórios:
  cada chamada ainda pode criar novo evento/submissão e executar projeção. Perfil,
  tarefas e efeitos não estão integralmente duráveis. Atualização de identidade
  vinculada exige revisão/fluxo de reatribuição ainda pendente, não retry infinito.
  B/gate 2 permanecem abertos. Regressão final **108/108 em 91,96 s**, nove arquivos
  do lote anterior (26 testes agora no intake), sem skips/falhas, Firestore/Auth
  locais explícitos, projeto demo-altum-qa-lab. Tipagem direcionada ampliada com
  worker, ESLint dos três fontes e diff check aprovados; nenhum processo próprio
  pendente. Sem build global/browser/HTTP Next/conta real/publicação. Orientação
  backend/functions manteve coordenação persistente no banco existente.
- Versões SHA256 testadas: lead-intake
  `19852069b93bb92b2bb1a88379c50a890f8e733175754432bd4c3841292f9e32`;
  teste `345f8e1b202a88d54d7954f737d5bbce0df712ec4869017815c3af9fe89f1004`;
  worker `be1c81dc198b9ab21e0f0eec78194466b43588c75958bbc5e9d667226fa964fc`;
  tsconfig `568b3c5d88a3da222e4d9e221bffc6288a23f90b4622f4101071bbfa4126e682`.
  Ledger confirmado: US$ 0,002858 usados, US$ 2,997142 restantes, zero reservas;
  nenhuma chamada paga feita nesta unidade. Checkout compartilhado preservado.
- Inspeção para próxima unidade confirmou `ecommerce.ts/syncOrderToCommercial`
  possui eventId/sourceEventId persistidos, mas intake não recebe ocorrência;
  `syncAbandonedCartToCommercial` ainda grava priority/tags por set após intake.
  Proteção do intake não basta para esses pós-processadores. Próxima ação: reproduzir
  bypass de propriedade nesses escritores Shopify e migrar commit/causalidade,
  sem marcar pedido inteiro/replay resolvido. Nenhuma alteração ecommerce aqui.

## Retomada — B: identificação conservadora no intake

- Unidade C10/C16, contratos 19.1/19.4, executor desta missão. Continuação do intake,
  não nova etapa nem motor. Sem testes próprios anteriores ativos; emuladores
  existentes preservados. Alterados somente seleção/revalidação em lead-intake.ts,
  teste local e registros; atribuição/Shopify de outros trabalhos preservados.
- Baseline **0/6 em 19,77 s** reproduziu escolha entre email/telefone de pessoas
  diferentes, primeira duplicata histórica, colisão de sourceId entre tipos,
  externalProfileId entre canais, perfil legado sem canal e identidade alterada
  entre busca e commit. Nenhuma escrita em cliente real.
- O caminho real agora consulta todos os identificadores fornecidos. Duplicatas
  ou identificadores apontando para registros distintos recusam a escrita, sem
  escolher o primeiro nem fundir pessoas. SourceId exige tipo+canal compatíveis;
  perfil externo exige canal. Escopo legado ausente exige revisão; entrada nova
  com identificador escopado mas sem canal também é recusada. Erros não expõem PII.
- Busca é refeita dentro da transação antes de cadastro/evento/submissão: identidade
  alterada/duplicata inserida após lookup bloqueia commit. Leituras limitadas:
  2 para email/telefone, 21 para identificadores escopados; atingir limite recusa
  conjunto possivelmente incompleto. Filtro local conserva formato dos índices
  existentes. Sem nova coleção, migração, fusão ou apagamento de dados.
- Primeiro lote corrigido **15/15 em 10,71 s**; mais quatro testes adicionados para
  caminho positivo, sourceId em canal diferente, duplicata durante lookup e canal
  ausente na criação. Regressão final **101/101 em 97,62 s**, nove arquivos:
  crm-lead-intake.emulator (19 testes), crm-passive-business.emulator,
  crm-stage-transition.emulator, ecommerce-journey.test, crm-proposal-update.emulator,
  crm-proposal-create.emulator, ai-text-delivery.emulator,
  ai-social-text-delivery.emulator e omnichannel-identity.emulator, todos .mts.
  `node --import tsx --test`, Firestore 127.0.0.1:8080/Auth 127.0.0.1:9099,
  projeto demo-altum-qa-lab, credenciais externas vazias; sem skips/falhas.
  Erros QA_PROPOSAL_* e QA_PROVIDER_UNAVAILABLE são injeções esperadas desses
  testes, não acesso real. Não confundir 101 testes técnicos com corpus final.
- Hashes do código testado: lead-intake
  `2ec75a2ef726be8abed5676be2ea7749a141ffff0206c23a7dd560676bf299b7`;
  teste `368b6998923199021072db38a98616d9892d6f570948d61ea93331d5e71e63cc`.
  `tsc --noEmit -p tests/tsconfig.automation-delivery.json`, ESLint dos dois arquivos
  e diff check aprovados. Nenhum teste/processo próprio pendente ao encerrar.
- Limites mantidos: canal não é conta/loja; matching não comprova identidade para
  revelar pedido privado nem autoriza ligação entre canais. Aliases históricos,
  normalização/backfill, canonicalização com social-lead-identity/contact-profile,
  exclusão/tombstones e tratamento operacional de conflitos ainda exigem trabalho.
  Não há fila de conciliação criada por lançar erro; chamadores ainda precisam
  classificação/retry limitado, sem fingir resolução automática. Criação simultânea
  e recibo de ocorrência/replay continuam sem homologação integral. Campo channel
  legado mutável e customFields de mesma chave continuam pendentes.
- Uso das orientações create-a-backend/functions manteve banco/stack existentes;
  nenhuma contratação/migração Vercel. Sem build global, QA de navegador, modelo
  pago, publicação, acesso à LF ou envio real. Ledger: US$ 0,002858 usados,
  US$ 2,997142 restantes, zero reservas. B/gate 2 abertos, C/D não iniciadas.
- Rollback não deve reabilitar matching por primeiro resultado sobre conflitos;
  preservar cadastros/eventos e conter intake afetado durante reversão revisada.
  Próxima unidade: identidade canônica/concorrência e replay causal, incluindo
  destino operacional de ambiguidades antes de auditar saída B.

## Retomada — B: preservar decisões humanas no intake

- Turno anterior foi progresso: aprovação atômica e 125 testes. Sem processos
  próprios ativos. Unidade C10/C16, contrato 19.4: recordInboundLead existente.
  Responsável: executor desta missão. Relê registro antes de gravar, preserva
  responsável/etapa/tags manuais e cadastro existente; lead/evento/submissão juntos.
  Validar criação no funil do tenant. Somente fixtures locais Shopify.
- Identidade ambígua/duplicação de criação entre chamadas, eventos idempotentes,
  sincronização do perfil/derivados e efeitos legados continuam exigindo auditoria;
  não considerar a proteção de campos como conclusão de todo intake. B aberta.
- Baseline **0/3 em 6,62 s** reproduziu default substituindo etapa humana,
  etapa genérica fora do funil e inexistência do commit junto com evento.
  Helper existente usa agora transação com releitura do cliente selecionado;
  excluído/tenant alterado é recusado, sem recriação por snapshot. Preserva etapa
  já preenchida/responsável (inclusive assignedTo)/tags bloqueadas; cadastro/notas
  existentes não são substituídos nem truncados. Valores novos ficam no evento
  observado, não viram identidade revisada automaticamente. Evento/submissão e
  cadastro compartilham commit. Perfil de contato e derivados continuam depois.
- Novos clientes usam default somente se existe no funil real; caso contrário,
  primeira etapa configurada. Funil inválido impede criação, sem fallback genérico.
  `crm/operations.ts`: guard adicional impede avanço para recomendação inexistente;
  recomendação genérica antes escapava após intake, apesar da proteção inicial.
  Ainda falta revalidação da versão do funil no commit da projeção e fan-out causal.
- Ajustes de fixture: separar emails sem telefone compartilhado (o lookup real
  prioriza telefone) e fornecer três etapas válidas/canônicas (IDs normalizados
  usam underscore). Não modificar regra de matching por conveniência dos testes.
  Teste de histórico inicialmente exigiu um evento total, mas projeção também
  registra evento próprio: assert agora conta exatamente uma entrada shopify_order
  e mantém prova da mensagem; não elimina auditoria de outro consumidor.
- Primeiro lote ampliado **46/47 em 29,76 s** falhou só nesse assert de evento.
  Lote seguinte: 78 aprovados e 13 falhas de infraestrutura no arquivo de identidade
  (12 casos + teardown): arquivo exige FIRESTORE_EMULATOR_HOST do runner, não
  configura sozinho; ausência levou à descoberta de credencial padrão, indisponível.
  Nenhuma credencial real fornecida nem dado real escrito. Reexecução com host
  local/projeto demo explicitamente definidos; novo teste também protege notas longas.
- Orientação create-a-backend/functions usada para manter stack/armazenamento
  existentes e estado no banco, sem novo serviço/processo em memória. Não implica
  migração para produtos Vercel nem publicação. Sem modelo pago ou operação real.
- Tipagem ampliada incluindo o teste do intake e ESLint dos três arquivos aprovados;
  diff check aprovado. Hashes da versão na regressão:
  lead-intake `b2a7709eb793f3d17e6a2568a879b8152d66761425b047276b40a2ff03840418`;
  operations `d9e611363dc85bb1c305cb1eb46356aa0866c4e148c5b50a9079d704b90cd647`;
  teste `10a1f1ba40530c754310127a7bce75f3540ec561cd5b18a20fa12a62ef425d87`;
  tsconfig `475d9b8fe8f82fe9b30eb711a641691473198c5c6f52974c85cb9270d7384389`.
- Limites: customFields com mesma chave ainda podem receber valor inbound;
  ausência de autoria histórica não permite dizer que todo campo é protegido.
  Busca de identidade ainda seleciona primeiro match/permite ambiguidades e não
  serializa criação por identidade. Evento/submissão novos por chamada não resolvem
  replay; contato/qualificação/tarefas/automação pós-commit não são atômicos com
  intake. Não reduzir esses requisitos nem marcar B pronta. Rollback preserva
  evidências novas e não apaga cadastro/eventos/submissões para retornar código.
- Ledger confirmado sem mudança: US$ 0,002858 usados, US$ 2,997142 restantes,
  zero reservas. Próxima unidade B: identidade/concorrência/replay do intake e
  contratos causais dos efeitos remanescentes, antes da auditoria de saída.
- Resultado final: **91/91 em 87,02 s**, nove arquivos, sem skips/falhas. Comando
  `node --import tsx --test` com crm-lead-intake.emulator (9 testes novos),
  crm-passive-business.emulator, crm-stage-transition.emulator,
  ecommerce-journey.test, crm-proposal-update.emulator, crm-proposal-create.emulator,
  ai-text-delivery.emulator, ai-social-text-delivery.emulator e
  omnichannel-identity.emulator (todos .mts). Runner define Firestore 127.0.0.1:8080,
  Auth 127.0.0.1:9099 e projeto demo, limpa credenciais reais. Sem processos próprios
  pendentes; emuladores preservados. Correção de campos aprovada localmente;
  B ABERTA. Sem build global, QA visual/HTTP publicado ou qualidade de IA aprovada.
  As 91 verificações técnicas não substituem os 104 cenários de aceite conversacional.

## Retomada — B: aprovação de proposta, financeiro e efeitos causais

- Turno anterior foi progresso: intenção persistente de criação, 76 testes e
  restart local. Nenhum processo próprio de teste ativo. B permanece aberta.
- Unidade C09/C10/C14/C16, contratos 19.2/19.4: PATCH budgets/[budgetId].
  Responsável técnico: executor desta missão. Preservar rota e regras de cobrança:
  somente lançamento interno pendente, sem pagamento/compra/mensagem real.
- Meta: proposta/etapa/evento/lançamento/recibo juntos; concorrência/replay não
  duplica receita. Revisão obsoleta detectada; efeitos com trabalho durável,
  retomada antes de iniciar e conciliação após execução incerta, no consumidor
  periódico existente. Testes locais Shopify e regressão antes de aprovação.
- Criação legada sem chave, retenção, demais escritores/fan-out e gates continuam
  pendentes. Não iniciar C nem publicar por aprovar esta unidade.
- Baseline: **0/4 em 11,78 s**. Cinco aprovações criaram cinco receitas;
  revisão obsoleta alterou decisão; duplicatas financeiras históricas ignoradas;
  falha do evento não impedia gravação parcial. Mesmos asserts preservados.
- `crm/proposal-mutation.ts` integrado ao PATCH: proposta/revisão/evento/etapa,
  lançamento interno pendente e job causal compartilham transação. Financeiro
  com ID estável por tenant/proposta; compatível legado único é reutilizado sem
  sobrescrever pago/valor. Duplicata/valor/vínculo divergentes exigem conciliação,
  não escolhe o primeiro nem apaga receita. Aprovação não significa pagamento.
- Revisão esperada enviada pelo formulário existente impede edição obsoleta;
  repetir patch já efetivado é no-op, com acesso atual validado. Legado sem revisão
  permanece compatível, sem proteção contra toda edição antiga: migrar antes de
  afirmar garantia universal. Alteração de status não substitui etapa humana nem
  cria etapa ausente do funil. Histórico guarda before/after e causa.
- Job protocolo 1 `crm_proposal_mutation` na coleção existente. Consumidor
  periódico de automações drena ready e processing vencido; sem cron paralelo.
  Ready revalida fonte/revisão/acesso/owner/financeiro/funil; iniciado incerto ou
  falha parcial exige conciliação, não retry cego. Lease/token limitam conclusão.
  Verificação ocorre antes de cada ramo legado; ainda não é cerca de cada ação
  interna nem congela toda elegibilidade de automações. Fonte excluída não recria.
- Primeiro lote corrigido **4/4 em 15,27 s**. Ampliação inicial 9/10 falhou por
  nome errado do consumidor no teste; corrigida a importação, sem alterar produto
  para acomodar teste. Lote seguinte **10/10 em 20,98 s**. Regressão maior e teste
  de falha após tarefa em execução; tipagem ampliada sendo revalidada após corrigir
  nome do consumidor. ESLint dos cinco arquivos aprovado no lote inicial.
- Sem acesso real, cobrança, compra, Shopify write, publicação ou inferência.
  Retenção/tombstones/saúde/índices reais e restart do novo job ainda pendentes.
- Resultado final desta unidade: **125/125 em 135,20 s**, oito arquivos, zero
  skips/falhas/cancelamentos. Comando `node --import tsx --test` com
  crm-proposal-update.emulator (11 testes), crm-proposal-create.emulator,
  proposal-create-attempt.test, crm-stage-transition.emulator,
  automation-message-delivery.emulator, crm-draft-mutation.emulator,
  ai-text-delivery.emulator e ai-social-text-delivery.emulator (todos .mts).
  A falha deliberada no transporte após uma tarefa comprova conciliação e ausência
  de segunda tarefa/receita no replay/consumidor; nenhuma chamada externa ocorreu.
  ALREADY_EXISTS/QA_PROPOSAL_UPDATE_AUDIT_UNAVAILABLE nos logs são fault injection.
- Typecheck ampliado aprovado, ESLint dos cinco arquivos e diff check aprovados.
  Nenhum teste/processo próprio pendente. Emuladores preservados, sem build global,
  QA visual, HTTP Next, restart do novo job ou publicação. Índices jobs type/status/
  tenantId/leaseUntil já declarados localmente reutilizados; instalação real não provada.
- SHA256: proposal-mutation `3bbf1810022a35bff36ecbf1d2ede54e5cab05a960870989f0de569da5230480`;
  PATCH `037fed8b088dc356bff96af01309892f545b9378583ef5d1902c57ef2eddf110`;
  comercial page `b6888444917a6608574fca7c6eb891c6d5eab5ab8037fade4063a2d3fb6330ce`;
  automations `2a284df63edd7b1fcf40895800c1dbd1d8b2ef5969e430c34114df344f5d04d1`;
  teste `39a866d175877b411a6bc78fbce5a8201c7d259ef41daccbb8cf2eaf72f91723`;
  tsconfig `3c5e620296b88b3b72ee7903dec060524946cbc6c50d74d515c7d1a502ddf5ac`.
- Limites adicionais: status Perdido/Rascunho após aprovação não cancela/reembolsa
  receita histórica automaticamente (preservado comportamento anterior); conciliação
  comercial/financeira precisa regra explícita e UX. Receita apagada depois não é
  recriada por no-op de aprovação. Não retroexecuta hook legado de proposta já
  aprovada sem recibo. Relação proposta aprovada não comprova pagamento Shopify.
- Rollback preserva histórico/receita/jobs/revisões; não reinstalar writer que
  ignore recibos/ownership enquanto existirem trabalhos da versão nova em curso.
  Ledger: US$ 0,002858 acumulados, US$ 2,997142 restantes, zero reservas.
- Próxima unidade B: intake/escritores remanescentes e causalidade por ação dos
  gatilhos legados; depois retenção/saúde/restart/QA autenticado e auditoria de saída.
  Unidade aprovada localmente, B ABERTA. Não iniciar C/D ou afirmar qualidade de
  conversa com estes testes; 125 não são os 104 cenários Shopify do aceite final.

## Retomada — B: identidade persistente da criação de propostas

- Turno anterior foi progresso: POST protegido contra overwrite/funil e 66 testes.
  Sem processos próprios de teste ativos. B aberta; não iniciar C.
- Unidade C09/C16, contrato 19.2: ligar intenção do formulário existente à
  criação/recibo no servidor. Retry após resultado incerto deve retornar o mesmo
  ID, sem repetir etapa/evento nem interpretar conteúdo mudado como nova criação.
  Responsável: executor técnico. Fixtures locais Shopify; nenhum efeito externo.
- PATCH de aprovação/financeiro e demais gates permanecem pendentes. Não publicar.
- Baseline novo: **8/11 em 14,56 s**, três testes novos reprovados antes da mudança.
  Cinco cópias simultâneas geravam cinco IDs; replay após edição humana criava
  outro ID; conteúdo alterado com a mesma tentativa era aceito em vez de conflito.
- POST aceita Idempotency-Key validada; chave escopada por tenant/ator/intenção,
  não lead/texto. Proposta tem ID determinístico; receipt tipo
  `crm_proposal_create_receipt` protocolo 1 em jobs existente, status done, no
  mesmo commit de proposta/evento/etapa. Não cria worker/fila paralela. Replay
  valida acesso atual e vínculo, não reaplica etapa/evento/aprendizado auxiliar.
  Outro conteúdo gera conflito com ID anterior somente após validar seu acesso.
  Nova intenção explícita pode legitimamente criar proposta de conteúdo igual.
- Exclusão da proposta com receipt preservado bloqueia recriação; protocolo,
  estado ou significado de conclusão desconhecidos não autorizam replay.
  Fila IA e scheduler filtram seus tipos; não consomem esse receipt done.
- Consumidor real em comercial/page.tsx envia a chave estável. Helper guarda só
  ID opaco em sessionStorage, por tenant/vendedor, sem prazo automático ou payload,
  notas/segredos. Erro/resposta incerta não libera ID. Duplo submit cercado por ref.
  Sucesso exige receipt protegido; conflito de conteúdo leva à lista para revisão,
  sem criar/enviar outra proposta automaticamente. Nenhuma tela nova.
- Lotes: **11/11 em 13,24 s**, depois **17/17 em 14,25 s**; regressão ampliada
  **76/76 em 61,67 s** com restart em processo Node separado e autenticação local
  real do handler. Estado/versão/meaning incertos foram acrescentados depois;
  regressão final em execução. Sem assinatura OAuth, HTTP Next ou QA visual real.
- Tipagem incluindo formulário/helper e lint aprovados no primeiro lote; ampliando
  para fixture do processo filho. Testes do formulário são helper comportamental
  e ligação textual, não interação React/navegador nem prova de armazenamento
  entre diferentes dispositivos. sessionStorage não sobrevive a fechar sessão/aba.
- Compatibilidade: chamadas antigas sem chave permanecem aceitas e retornam
  retryProtected:false; NÃO têm proteção de repetição. Não homologar idempotência
  universal nem fechar B antes de decidir/migrar consumidores legados. Pacote novo
  precisa servidor+formulário compatíveis; interface nova com servidor velho não
  recebe esta garantia. Nenhuma publicação atual autorizada.
- Retenção/tombstones do tipo receipt ainda exigem auditoria antes de publicação:
  não apagar comprovante e proposta e prometer bloqueio de replay eterno. Se
  somente receipt sumir e proposta existir, ID determinístico falha sem duplicar;
  não tratar isso como reconciliação completa. Aprendizado auxiliar segue best-effort.
- Resultado final: **76/76 em 77,92 s**, 10 arquivos, zero skips/falhas. Lista
  da regressão anterior de 66 mais proposal-create-attempt.test.mts; criação
  ampliada de 8 para 14 casos inclui processo separado, protocolo/status/meaning
  incertos e os três defeitos originais. Comando `node --import tsx --test` com
  crm-proposal-create.emulator, proposal-create-attempt.test,
  crm-draft-mutation.emulator, crm-stage-transition.emulator,
  crm-manual-routes.emulator, crm-passive-business.emulator,
  crm-pipeline-view.test, crm-observation-runtime-contract.test,
  ai-text-delivery.emulator e ai-social-text-delivery.emulator (todos .mts).
- Typecheck incluindo formulário/fixture/helper aprovado; ESLint dos seis arquivos
  desta unidade e diff check aprovados. Nenhum processo/teste próprio pendente.
  Sem build global, QA visual, publicação, modelo pago ou mensagem externa.
  Ledger: US$ 0,002858 usados, US$ 2,997142 restantes, zero reservas.
- SHA256: budgets POST `831ea2d0688c57e29d98283d767bd83a199688023bb934248d6f0d644d8e9842`;
  comercial page `5b1c23ac72d5841ea767ba217b9d66c71a6b494076a5f59eee624b2e0c1a3736`;
  attempt helper `e1177df2dc9e577744b26cab3c3144accde8323206c347ec09fc4f40246559fd`;
  creation test `9b34c7a4ec3c545161e88e0ace31e23a9dd43cbf03fa99a27ed537b50b43acc5`;
  attempt test `c14d7dbdc1713cacd87565121fc8ef9cecee3e14603ba0465e078b7ecebae184`;
  restart fixture `f61f0b544c1c0372d752132c897dce9946470448e001f1e5fe281b3ab1e71c12`;
  tsconfig `14a644012ccad66b6bc43d5abe73c7fd05567800fd5d1ec9d4374342176e0241`.
- Próxima unidade: PATCH budgets/[budgetId] — aprovação, registro financeiro e
  efeitos causais. Legados/retencão/QA visual seguem gates explícitos; B aberta.
  Não confundir 76 testes técnicos com os 104 cenários de qualidade da conversa.

## Retomada — B: criação de propostas sem sobrescrever funil

- Turno anterior foi progresso: drafts aprovados atômicos e 157 testes locais.
  Sem processos próprios de teste ativos. B permanece aberta; não iniciar C.
- Unidade C09/C10/C16, contrato 19.4: POST budgets. Responsável: executor técnico.
  Criar proposta/evento/avaliação de etapa em uma transação, preservando autoria
  manual e IDs do funil. Rascunho não deve regravar etapa de snapshot anterior.
  Condição local: handlers autenticados com fixtures Shopify e regressão.
- PATCH budgets/[budgetId], financeiro e identidade de retry da criação continuam
  pendentes; não chamar esta correção de fluxo de propostas integral. Não publicar.
- Baseline: **1/5 em 9,32 s**, quatro reprovações antes da mudança. Confirmados
  overwrite de etapa manual, etapa inexistente inserida, timestamp do cliente
  alterado por Rascunho e ausência de causa/autoria automática. Assertions mantidos.
- POST existente agora relê cliente/acesso dentro da transação, verifica funil
  real e manual ownership, e grava proposta/evento/avaliação de etapa juntos.
  Outcomes: not_requested/blocked_manual/blocked_pipeline/unchanged/applied.
  Somente applied altera lead, registra ownership system_event e aprendizado de
  etapa. Rascunho não toca o documento do cliente. Sem remapear IDs por rótulo.
- Primeiro lote corrigido **5/5 em 8,06 s**. Lote ampliado **43/43 em 62,47 s**:
  8 testes novos de criação mais drafts, handlers manuais, CRM passivo e pedidos.
  Fault-injection de falha ao criar evento comprova rollback da proposta/etapa;
  tenant alheio, alvo excluído, caminho malformado, funil inválido e concorrência
  humana também cobertos. Emuladores Auth/Firestore locais e fixtures fictícias.
- Tipagem ampliada e lint aprovados. Regressões finais, acrescentando entrega
  WhatsApp/Instagram/Messenger, visualização do funil e contrato do observador,
  em execução. Sem teste de navegador/HTTP Next, inferência, publicação ou dados reais.
- Limites: um POST repetido ainda pode criar outra proposta (não há identidade
  estável enviada pelo cliente); isto NÃO fecha idempotência de criação. Aprendizado
  auxiliar permanece best-effort após commit, sem recuperação durável. Nenhuma
  alteração em PATCH budgets/[budgetId]/financeiro nesta unidade, nem remoção de
  gatilhos antigos. Próxima unidade deve fechar esses caminhos antes da saída B.
- Ledger mantido: US$ 0,002858 acumulados, US$ 2,997142 restantes, zero reservas.
  Rollback não deve reintroduzir writer que ignore ownership/funil; preservar
  propostas e recibos, sem apagar dados para trocar código. Build global pendente.
- Resultado final da unidade: **66/66 em 57,82 s**, 9 arquivos, sem skip/falha.
  Comando: `node --import tsx --test` com crm-proposal-create.emulator,
  crm-draft-mutation.emulator, crm-stage-transition.emulator,
  crm-manual-routes.emulator, crm-passive-business.emulator,
  crm-pipeline-view.test, crm-observation-runtime-contract.test,
  ai-text-delivery.emulator e ai-social-text-delivery.emulator (todos .mts).
  Não é nova execução dos 157 anteriores nem a bateria conversacional de aceite.
  Typecheck/lint/diff check aprovados. Nenhum teste/processo próprio pendente.
- SHA256: POST budgets `80b666a9f73f174c25dd995970a1758058d77002c1a8b597bbe1b20b3cbad51a`;
  teste `2333012dc52034b054c9d2d7d76874c03aa059931768603dcd2604d1fe3310d7`;
  tsconfig `75ca886e7242438a9300895e54aaf0c2dae66b934128fa42bf7437e893cec267`.
- Estado: correção local de preservação/atomicidade aprovada; fluxo integral de
  propostas e B ainda abertos. Próxima ação: identidade de criação e PATCH de
  aprovação/registro financeiro/efeitos, preservando permissões e autores.

## Retomada — B: aplicação atômica de alterações/propostas aprovadas

- Turno anterior foi progresso: transição causal de pedido e 123 testes locais.
  Instruções, plano, progresso, escritores e processos revalidados. B ABERTA.
- Unidade C09/C10/C16, contrato 19.4: update_lead/assign_lead/create_proposal no
  consumidor existente de drafts. Alteração, propriedade/autoria, auditoria e
  recibo devem compartilhar commit; reaplicação reconhece o mesmo resultado,
  sem desfazer edição posterior. Validar acesso atual e origem humana/automática.
- POST/PATCH gerais de propostas, intake, fan-out, retenção e demais pendências
  permanecem fora desta unidade, não concluídas. Nenhuma publicação ou efeito real.
- Iniciando regressões com Auth/Firestore locais e documentos Shopify fictícios.
- Retomada após resposta de status (sem progresso técnico): processo anterior do
  teste não estava ativo. Conferidos os arquivos atuais, sem reiniciar processo
  ainda vivo. Nenhuma mudança em autenticação/admin ou envio externo.
- Helper `crm/draft-mutation.ts` integrado aos três ramos existentes do apply:
  mutação/ownership/evento/auditoria/recibo na mesma transação. Proposta Rascunho
  usa ID estável por tenant/draft; replay devolve resultado e revalida acesso atual,
  sem desfazer edição humana posterior. Não existe estado applying intermediário.
- Revisão humana congela conteúdo e versão do cliente. Conteúdo/cliente alterados
  exigem nova aprovação; drafts antigos sem fingerprint precisam reaprovação.
  Registros applying legados sem recibo não recebem retry automático.
- Autoria gerada permanece MCP, mesmo aprovada por humano. Modo autônomo não
  transforma texto em autoria humana e preserva campos manualmente bloqueados.
  Teste desse modo é do helper: não comprova concessão OAuth real ponta a ponta.
- Baseline anterior: três testes reprovados antes da implementação (ownership,
  replay e proposta concorrente), conforme execução da unidade. Lote atual:
  **10/10 em 15,51 s**, handlers reais e tokens de Auth/Firestore locais. Inclui
  cinco aplicações concorrentes, permissões revogadas, conteúdo/cliente superados,
  atribuição a membro inativo, rollback de auditoria e etapa fora do funil.
- Harness Node usa somente alias do marcador server-only para o arquivo vazio
  react-server do Next; não substitui autenticação/provedor. Tipagem encontrou
  API registerHooks existente no Node atual mas ausente dos @types instalados;
  correção local de tipos do harness pendente, sem alterar dependências globais.
  ESLint dos quatro arquivos aprovado. Regressão ampliada em execução.
- Limites: aprendizado auxiliar de proposta continua best-effort após commit,
  sem retry durável; propostas gerais POST/PATCH e financeiro não foram migrados.
  Nada publicado e nenhuma inferência paga nesta unidade; B permanece aberta.
- Primeira regressão ampliada: **155/155 em 124,98 s**, 15 arquivos, sem skips.
  Acrescentadas verificações antes de encerrar a unidade: lote 10/12 reprovou
  ausência dos valores anteriores no evento e rejeição de rascunho cujo cliente
  foi excluído (403 em vez de 200). Corrigidos: evento/auditoria guardam before
  dos campos alterados; rejeição continua autenticada/manage_settings e do tenant,
  mas não depende de alvo ainda existente. Aprovação segue exigindo alvo/acesso.
  Não reduzidos os asserts. Recibo adulterado e aprovação legada sem fingerprint
  também cobertos. Segunda regressão em execução sobre o código corrigido.
- Tipos do harness agora descrevem a API síncrona registerHooks do Node v24.18.0,
  sem any/supressão e sem instalar pacote. ESLint novamente aprovado; tipagem
  ampliada em execução. Não houve bypass dos controles de autorização do produto.
- Typecheck direcionado ampliado aprovado depois do ajuste do harness. Hashes
  SHA256 da versão sob regressão: draft-mutation
  `e0192b0bf77d60d4aca90cf866d797d3cd7bdf7fd8f4d06c986c38cbce323450`;
  review route `179905383f1f8cfba248d64160478a12439d1ed7cbcaf8130eb0673dfa241436`;
  apply route `2a0bd3fad75ffb17437090c521c09bf57f3dd63bd74ed84fe131cd71268d86bf`;
  teste `f034d7d0ecdc6fb9d3297d107bb33ab8e148cec01c1d2798868b64fce84cc7b6`;
  tsconfig `9ac736b5685e85731082c4e80921bf2400615f608c3cc85b03c668b001f6d566`.
- Rollback: preservar recibos e não usar consumidor antigo que ignore o protocolo
  ou reaplique alteração já confirmada. Rascunhos legados incertos exigem revisão,
  não migração automática para applied/ready. Sem build/pacote/publicação nesta unidade.
- Próxima unidade B: POST/PATCH gerais de propostas (etapa de snapshot e corrida
  de criação financeira); depois intake/fan-out e demais provas de saída B.
  Nenhuma entrada em C/D nem afirmação de melhora conversacional pela regressão.
  Ledger conferido: US$ 0,002858 usados, US$ 2,997142 restantes, zero reservas.
- Resultado final desta unidade: **157/157 em 139,94 s**, 15 arquivos, sem skips,
  falhas ou cancelamentos. Mesma lista da regressão de 123 mais
  `crm-draft-mutation.emulator.mts` (12 testes) e
  `mcp-message-delivery.emulator.mts` (22 testes). Tipagem ampliada, lint dos quatro
  arquivos e diff check aprovados. Erros ALREADY_EXISTS/QA_PROVIDER_UNAVAILABLE
  nos logs são colisões/falhas injetadas para provar rollback/conciliação.
  Nenhum teste/processo próprio pendente. Unidade aprovada localmente; B ABERTA.
  Os 157 testes não são a bateria conversacional de 104 cenários de aceite.

## Retomada — B: transição de etapa a partir de pedido Shopify

- Turno anterior classificado como progresso: mutações CRM/handlers autenticados,
  101 testes em dois lotes. Retomada conferiu instruções, plano e escritores atuais;
  sem processos próprios de teste pendentes. B continua ABERTA, sem iniciar C.
- Unidade C10/C14/C16/C17, contrato 19.4: stage-transition.ts e consumidor de
  pedidos Shopify. Condição de saída local: não sobrescrever etapa manual/não
  criar etapa ausente; causa persistida e recibo/etapa/evento atômicos; retomada
  de registro sem efeito iniciado, conciliação de execução incerta; consumo pelo
  processador periódico existente. Executor técnico desta missão responsável.
- Propostas/drafts e outros escritores permanecem pendentes. Não alterar regras
  de pagamento/estoque do conector, nem chamar proteção de etapa de proteção de
  todo o processamento de pedido. Antes de publicar: migração coordenada,
  índices/provas operacionais e autorização do pacote ainda obrigatórios.
- Estado inicial desta unidade: reproduzindo falha em fixtures locais isoladas.
- Reprodução antes da mudança: **2/2 testes reprovados em 7,52 s**. O helper
  sobrescrevia etapa manual e criava `proposta` ausente do funil salvo. Ambos
  passaram depois da transação/validação; assertions originais preservados.
- `crm/stage-transition.ts`: escrita legada agora verifica lead/tenant, propriedade
  manual e ID do funil dentro da transação. Vazio não vira captado implicitamente.
  Pedido Shopify usa `crm/order-stage-transition.ts` com o evento ecommerce já
  persistido pelo consumidor, conexão e pedido; não cria identidade por tentativa.
- `ecommerce.ts`: somente passagem da referência do evento ao helper para Shopify.
  Preservados conectores, processamento de pagamento/estoque, conversão por pedido
  e demais alterações anteriores. Não afirmar que todos os efeitos upstream do
  pedido ficaram idempotentes: receita/LTV, intake e outros campos têm dívida própria.
- Novo tipo no armazenamento jobs existente: `crm_order_stage_transition`, protocolo
  1. Etapa, ownership, evento e recibo/trabalho ready são atômicos. Chave por
  tenant/evento/operação, não por lead ou texto; trocar destinatário de evento já
  aceito é conflito. IDs opacos de pedido Shopify com barras são preservados;
  somente IDs usados como caminho documental rejeitam barras.
- Fonte normalizada, conexão ativa, tenant, pedido e intenção revalidados; estado
  shipped sem pagamento confirmado não autoriza marcar ganho. Etapa manual ou
  ausente do funil gera resultado bloqueado explícito, sem apagar o fato do pedido
  ou escolher coluna por rótulo. Mapeamento de IDs próprios ainda precisa configuração.
- Consumidor imediato e processador periódico de automações usam o mesmo job.
  ready pode retomar; processing vencido/erro após início vai para conciliação,
  nunca ready por suposição. Lease/token e finalização condicional impedem que
  executor vencido confirme sucesso. Leituras paralelas de autorização terminam
  antes de gravar conciliação, inclusive quando fonte ou funil falham.
- `stage-effects.ts`: modo estrito opcional e cerca de autorização antes de cada
  ramo (automações, aprendizado, conversão/trilha). Erros de automação propagam
  nesse modo; não anunciar todos os efeitos concluídos depois de falha parcial.
  Legado sem modo estrito mantém compatibilidade. Trabalho de etapa concluído
  NÃO significa mensagem entregue pelo provedor. Não há retry cego do fan-out.
- Primeiro lote novo: **11/11 em 17,49 s**. Depois: tentativa com consumidor
  completo revelou fixture sem identidade compartilhada (sourceId de pedido não
  é critério atual de merge). Corrigida para o mesmo email fictício existente;
  não mudou o intake nem enfraqueceu assertion de lead único/etapa humana.
  Teardown passou a cobrir IDs gerados pelo próprio intake, sempre no tenant QA
  isolado. 95 registros da fixture anterior foram conferidos/removidos apenas no
  projeto demo local; nenhuma limpeza de dados reais ou de outro chat.
- Lote direcionado final: **22/22 em 18,80 s** (12 testes de transição e 10 da
  jornada ecommerce). Consumer real `processEcommerceWebhook` exercitado por entrada
  interna trusted, com duas cópias do mesmo evento fictício: pagamento persistido,
  vínculo por email, etapa manual mantida e um recibo causal. Não é validação de
  assinatura/HTTP da loja, identidade entre canais ou leitura Shopify real.
- Regressão final do código atual: **123/123 em 124,36 s**, sem skips/falhas.
  Comando: `node --import tsx --test` nos 10 arquivos da regressão anterior mais
  `crm-manual-routes.emulator.mts`, `crm-stage-transition.emulator.mts` e
  `ecommerce-journey.test.mts`. Emuladores locais, transportes simulados e dados
  fictícios; falha QA_PROVIDER_UNAVAILABLE no log é a injeção esperada do teste.
  Falha após primeira tarefa comprova conciliação sem segunda tarefa/tentativa.
- Typecheck direcionado ampliado aprovado, ESLint dos seis arquivos desta unidade
  sem erros/avisos e diff --check aprovado. Nenhum teste/processo próprio pendente.
  Não executado build global, restart real de worker ou publicação. Índices
  type/status/lease já declarados localmente são reutilizados; instalação/cron reais
  não comprovados. Fila de IA filtra seu tipo, não consome o job novo por status.
- SHA256: stage-transition `cebbff96ad783966fa909eb57654ef665ca1b5dce7af155391121b7e4543926f`;
  order-stage-transition `84a2c2f49093ea44d224463518a232778f96d2b9f18ee553f4c731524c58b7b9`;
  stage-effects `fb1de20f67e97a71f14936ba162fe4c8e3fffc54b8c045c26bbaf14cc9718cdc`;
  ecommerce `f165e6d659dfc8908941832c9f43386930ef553c15906e4ac0c758cd1fcac4dc`;
  automations `f5c1db72f4c32c0e4328f09823626cfeec065f613c3ac82dc558c7fa2058b212`;
  teste `d0c9a2ae976baf1cb32910c377921d8499a27373a081e7ea0ac4b09d4f62b334`;
  tsconfig `f2febedf6dc1198de3f13e238646da1d3f963c7c9cbb8da0b2cdb5284773061e`.
- Limites importantes: cerca por ramo não substitui autorização/idempotência de
  cada ação interna das automações legadas. Não congela ainda todo conjunto de
  automações de etapa. Conciliar exige revisão; não chamar contenção de recuperação
  completa. Ordem/revisão de pedidos e múltiplos pedidos por lead não homologadas;
  intake pode regravar tags/etapa de snapshot; prioridade/tags ecommerce e demais
  escritores de propostas/drafts ainda precisam migração. Retenção e saúde do novo
  tipo jobs entram na auditoria B; não removidos do backlog.
- Ledger sem alteração: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas
  chamadas antigas, zero reservas. Sem chamada paga, envio real, compra/estoque,
  publicação ou início de C. Os 123 testes NÃO são os 104 cenários de aceite da IA.
- Próxima unidade: escritores restantes (proposta/draft/intake) e contrato causal
  das automações de etapa, antes da auditoria/retomada real da saída B.

## Retomada — B: mutações CRM, propriedade manual e funil do tenant

- Turno anterior: resposta de status, sem avanço de implementação. Retomada
  revalidou instruções, missão/plano, gate e fontes; nenhum teste próprio anterior
  estava ativo. Unidade C10/C14/C16, contrato 19.4; responsável técnico: executor
  desta missão. B segue ABERTA, sem iniciar C ou aprovar qualidade conversacional.
- Falha confirmada por inspeção: move_stage/add_tag/set_priority acumulavam patch
  a partir de snapshot antigo e gravavam evento separadamente; não tinham recibo
  por efeito. PATCH humano não registrava propriedade desses campos. Agent usava
  etapas do perfil inicial, não o funil salvo. Não houve reprodução em cliente real.
- Implementação em validação: protocolo inbound 4 acrescenta mutações CRM com
  campo/evento/recibo atômicos, baseline por campo, versão do funil e resultado
  aplicado/inalterado/bloqueado. Protocolos 2/3 não ganham replay CRM retroativo.
  Fonte/plano/lease continuam revalidados; recibo não significa conversão externa.
- Edição pelo PATCH existente grava registro, propriedade manual e evento juntos,
  com versão do snapshot autorizado. Conflito devolve 409, sem sobrescrever outro
  vendedor. Mesmo valor explicitamente salvo pode ficar sob controle manual.
  Não se aceita autoria/metadado de propriedade vindo do corpo da requisição.
- Agent/CRM derivado usam commit condicional para não sobrescrever análise com
  snapshot superado. Campos manuais são preservados; funil salvo é lido pelo agent.
  Gatilhos legados de mutação usam transação para respeitar propriedade/funil,
  mas continuam sem identidade causal durável e sem homologação de replay geral.
- Removido flush final incondicional de lead nas automações: além de não precisar
  mais acumular os três campos, não pode ressuscitar lead excluído após um efeito.
- Primeiro lote direcionado: 6/6 testes novos aprovados em 16,88 s. Cobriu
  concorrência/retomada depois de commit, três campos manuais em ações adiadas,
  edição não rastreada entre claim/efeito, funil alterado/ID inexistente/tenant
  estranho, rollback atômico e snapshots manuais/automáticos superados.
  Prova intermediária; regressão ampliada e revisão ainda em andamento.
- Limites mantidos: outros escritores/edições de CRM e valores históricos sem
  autoria precisam inventário/migração; não declarar todo CRM protegido. Liberação
  explícita de controle manual na interface, efeito de etapa com fan-out durável,
  ordem de eventos, retomada real e consentimento/retencão permanecem pendentes.
  Snapshot conflitante não deve ser anunciado como atualização concluída.
- Sem publicação, chamadas pagas, escrita Shopify ou envio real. Ledger conferido:
  US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas, zero reservas.
- Rollback exige preservar recibos/ownership e drenar executores incompatíveis;
  apagar recibo não é forma de repetir ação. Não publicar checkout compartilhado.
- Ampliação da unidade: rota POST de etapa também marca propriedade manual e
  grava evento na mesma transação. Inspeção revelou acesso comercial conferido só
  depois dos efeitos; movido antes de qualquer escrita e revalidado snapshot antes
  do commit. Não alterou autenticação/membership; corrigiu a ordem de autorização.
- Testes reforçados: retomada de três mutações adiadas após commit sem finalizar
  scheduler; sequência de ações no mesmo campo; gatilho legado respeitando humano;
  observação passiva preservando etapa/score e registrando cidade com IA pausada.
  Funil inválido/ambíguo não é convertido silenciosamente em etapas padrão para
  autorizar mutação. Score manual também é protegido no commit comum.
- Observador não marca análise conflitante como completed; recibo permanece
  crm_written e worker durável existente recebe erro para retry. advancedStage
  reflete o avanço efetivo, não apenas canAdvanceStage. Agent registra skip em
  conflito de snapshot; não anunciar retry onde ainda não há executor garantido.
- Regressão intermediária: **93/94 em 109,59 s**. Única falha em teste estrutural
  histórico exigindo source humano literal no dispatcher; o código já distingue
  automação/IA/humano. Teste agora verifica por AST a expressão inteira e suas
  três precedências, sem mudar o dispatcher ou reduzir critérios. Demais asserts
  preservados. Lote CRM reforçado: **10/10 em 25,11 s**.
- Regressão final: **98/98 em 116,73 s**, sem skips/falhas, nestes dez arquivos:
  automation-message-delivery.emulator, ai-text-delivery.emulator,
  ai-social-text-delivery.emulator, automation-inbound-producers.test,
  inbound-webhook-contract.test, crm-passive-business.emulator,
  crm-pipeline-view.test, crm-observation-runtime-contract.test,
  ai-action-plan-runtime-contract.test e ai-role-runtime-contract.test.
- Adicional autenticado: **3/3 em 10,98 s** em crm-manual-routes.emulator.mts.
  Handler POST negou vendedor alheio com force antes de qualquer gravação/efeito;
  negou ausência de token, tenant alheio e capacidade ausente. POST/PATCH próprios
  gravaram autoria do usuário autenticado e ignoraram ownership forjado no body.
  Autenticação Firebase do emulador, sem bypass; handlers chamados diretamente,
  não servidor Next/navegador nem contas reais. Fixtures removidas no teardown.
- Typecheck direcionado final incluindo os dois handlers/teste autenticado e
  ESLint aprovados (zero erros; dois avisos no agent em trechos não alterados).
  diff --check sem erros. Todos os processos próprios de teste encerrados.
- Inventário parcial e próximos escritores: AI_REBUILD_CRM_WRITER_AUDIT.md.
  stage-transition/ecommerce, propostas e drafts aprovados ainda podem escrever
  fora deste contrato. Portanto NÃO afirmar proteção universal, B ou gate aprovados.
- SHA256 do código verificado (arquivos compartilhados têm mudanças anteriores
  preservadas; hashes não atribuem todo o diff a esta unidade):
  - automation-effect-contract: `05ad234029749987d845bdacae70926cc61366937f846d41561a83ebe3b53298`;
  - automation-inbound-execution: `b94c6d027617fd438d6ee5a1bfaeb313fb735e4288a780cd23f76fa396c4351a`;
  - automation-internal-effect: `b43ba53c7e47be953015f4f4c56074528e69e43d6967537b54f2ca2778f0c888`;
  - automations: `daf144057d002385644378fbf233a104f12f84b1ebd4353ca3a7180f175e8627`;
  - field-ownership: `3331205925fe749a2a18b81170ee60c824fa6f18c095309ba9926c6ce399a34c`;
  - manual-update: `59120706fab68130e8ba26a547d1c33ed05e197121a7d88d91f30863cc7078cc`;
  - crm/pipeline: `e20347c8c3ef06bb798417ba36eca6a653e44554b477a39d32ba43b662e46289`;
  - crm/operations: `b60d82807c26cdb27cc4b5c31d4375522cab02d07a692ff2cd4bad91f37e17a1`;
  - conversation-intelligence: `648bf1c51428598499a273f14ce4cc353d6c1b4cffd07125aa1abb9350a99427`;
  - ai/agent: `06c859359a6710b6a760102efe3ce48fe3b26aa898593e161a82788c96bae0ec`;
  - leads PATCH: `b9f36265118996689589b6e9759fb45575ecba62b583b14e424373f9f34229b3`;
  - stage POST: `16dd84f3e143f52960a386c422a8938f12241f38bfc3433ce8f9571b57048b17`;
  - automation emulator: `89bcb4271ebf5acdb6f5225ff5792e9af4c770058fecf9492454fea5a04762af`;
  - authenticated routes: `abf1171d52a82fe3eee9623994a0ffb03cd248400dedb7e09721cd94f476b739`;
  - CRM runtime contract: `076f5d64ac1b8907a710dbc5cf145969870e006f350646a0681768906d999de6`;
  - tsconfig: `6e557852b20f3a0ddcec3b6a94f377e2e12a726e6426638c71e749fcbb6028ff`.
- Próxima ação: transições comerciais/pedido e origem causal de efeitos de etapa;
  depois gatilhos restantes, waiting/consentimento, retenção e restart autenticado.
  Os 101 testes em dois lotes não são a bateria de 104 cenários Shopify nem
  comprovam conversação natural. Nenhuma publicação ou gasto adicional.

## Retomada — B: efeitos internos agendados com recibo e retomada

- Turno anterior: progresso (61 testes, planos mistos recuperáveis). Unidade
  C14/C16 e contrato 19.2; B segue ABERTA, sem iniciar C. Fontes/consumidores e
  processos conferidos; emulador demo preservado, sem executor duplicado.
- `automation-internal-effect.ts`: wrapper do scheduler reconstrói contexto pela
  ocorrência/execução persistidas. A transação comum revalida fonte, tenant/canal,
  lead, configuração/plano, índice, prazo e token/lease do job antes de criar
  tarefa/nota/evento/recibo. Exige execução original concluída. Prazo do efeito é
  ancorado no prazo do job, não no horário do retry. Recibo liga scheduledJobId.
- `automations.ts` usa o wrapper nos quatro tipos internos adiados inbound:
  create_task/follow_up/alert_human/add_note. Protocolo registrado no agendamento e
  no commit permite retomar após efeito gravado e antes de finalizar o scheduler,
  sem duplicar nem sobrescrever edição humana. Autoria continua automática; criar
  pendência humana não anuncia notificação/aceite do vendedor.
- Revogação/fonte inválida/perda de posse não recebem retry automático. Espera por
  root ainda em preparação agenda retryAfter sem consumir tentativa nem mudar
  executeAfter. Erros de armazenamento do efeito atômico têm retry limitado e cota
  reutilizada. Prazo anterior não é recomeçado por indisponibilidade do worker.
- Migração conservadora: retrying/pending já tentado sem prova de protocolo/recibo
  vai para conciliação; não inferir que legado não criou tarefa/enviou mensagem
  antes de falhar. Não promover processing antigo por suposição. Conciliação é
  contenção, não prova de que o fluxo legado ficou funcional.
- Prova do executor é separada da declaração do produtor e vinculada ao token
  daquela tentativa. Versão sem executor, executor sem token ou token de tentativa
  anterior não autorizam recovery/retry. Isso não dispensa drenar workers antigos
  que ignorem o contrato; não prometer compatibilidade com executores arbitrários.
- Cinco testes novos/fortalecidos: commit com scheduler ainda processing retoma
  com cinco workers e preserva edição/cota/prazo; quatro tipos adiados têm evidências
  distintas; quatro revogações/posse incorreta impedem escrita/novas tentativas;
  root inacabado espera sem reiniciar deadline; retry legado sem prova não executa.
  Falha modelada em estado persistido, não kill/restart real. Só fixtures isoladas.
- Execução intermediária: 64/64 em 136,10 s, tipagem/lint aprovados, antes de
  fortalecer a fronteira commit/finalização e os casos de quatro tipos/retry legado.
  Resultado final do código atual abaixo.
- Execuções intermediárias ampliadas: 66/66 em 113,81 s e 66/66 em 102,23 s,
  antes de amarrar completamente a prova do executor ao token não vazio. Tipos e
  lint dessas execuções aprovados; não usar como prova da revisão posterior.
- Execução final do código atual: **66/66 aprovados em 100,12 s**, sem skips/falhas,
  nos cinco arquivos da regressão anterior. Typecheck direcionado, ESLint dos três
  arquivos modificados e diff --check aprovados. Só Firestore demo e transportes
  simulados; não é homologação de cron/restart real, modelo ou conta de cliente.
- SHA256: internal-effect `932db91065174aef8a76a841cd22912e1cee883d264d2206f40585f2462d2946`;
  automations `bbc5c5a3be66f2f371dfd277c708b174a5318b781b6da09d32854f3b556f91d8`;
  teste `dbe6d65ea2a456f9a7586f713d9929e2b8ebb1720c9e515a4dddfdbf902ab545`.
- Sem build global, publicação ou efeito externo. Índices/compatibilidade do pacote
  anterior continuam exigidos antes de publicação autorizada. Rollback preserva
  recibos/efeitos e exige drenar workers, não apagar registros para repetir ações.
- Ledger conferido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas
  anteriores e zero reservas. Nenhuma chamada paga ou escrita Shopify nesta unidade.
- Pendências B: campos/funil com propriedade manual/recibo, gatilhos imediatos
  legados, waiting/consentimento, tombstones/retencão, auditoria dos estados antigos
  e testes autenticados/restart real. Conversação e memória seguem futuras C/D.
- Próxima unidade B: mutações CRM e funil real, depois origens restantes e auditoria
  de saída, mantendo os gates finais. Nenhuma entrega integrada aprovada.

## Retomada — B: recuperação de planos mistos e espera pré-entrega

- Turno anterior classificado como progresso: 58 testes e recuperação periódica
  dos planos internos imediatos. Unidade C13/C14/C16, B permanece ABERTA. Instruções,
  missão, gate e fontes atuais conferidos; nenhum executor anterior dos testes ativo
  antes deste lote. Sem iniciar C ou reduzir critérios de qualidade.
- `automation-effect-contract.ts`: contrato de retomada por versão conhecida.
  Protocolo 2 continua limitado aos quatro efeitos internos imediatos; protocolo 3
  admite esses efeitos, envio durável e registro determinístico de ações adiadas.
  Versão desconhecida, espera inválida e mutações CRM sem recibo continuam excluídas.
- `automation-inbound-execution.ts`: ocorrências novas usam protocolo 3. A retomada
  mantém mesmo plano/índices e slots de mensagem/agendamento; não cria outra intenção
  ao repetir execução. Não promove registros antigos nem reabre conciliação explícita.
- Pré-entrega passa a aguardar execução/scheduler recuperável vencido, em vez de
  dead-letter prematuro enquanto o worker ainda pode concluir com recibo. Não tenta
  provedor durante essa espera; configuração/fonte/destino continuam revalidados.
  Acima do teto ou sem protocolo conhecido continua bloqueando. Timer indisponível
  ainda pode atrasar retomada; saúde/latência reais precisam prova de operação.
- Três testes novos: plano mensagem+agendamento+nota após interrupção simulada na
  finalização preserva IDs, prazo, eventos e nota, com cinco workers; resultado
  externo incerto continua em conciliação e não causa segunda tentativa; scheduler
  com posse vencida aguarda recuperação e finalização sem executor antigo concluir.
  Modelagem por estados persistidos; não é kill/restart real do serviço.
- Preservado teste negativo anterior de mensagem sem prova de retomada: fixture
  explicitamente protocolo 2; ela continua bloqueada. Teste positivo separado usa
  protocolo 3 atual. Acrescentados casos de versão 99 e mutação CRM ainda sem recibo
  ao teste negativo de retomada. Nenhum assert de precisão/segurança removido.
- Execução intermediária: **61/61 aprovados em 98,34 s**, antes do reforço de
  protocolo desconhecido/teto e dos dois casos negativos adicionais. Tipos e lint
  intermediários aprovados. Resultado final do código atual registrado abaixo.
- Execução final: **61/61 aprovados em 90,44 s**, sem skips/falhas, nos cinco
  arquivos da regressão anterior. Typecheck direcionado, ESLint dos três arquivos
  de código/teste modificados e diff --check aprovados. Nenhuma chamada paga,
  mensagem real ou integração externa nesta bateria local.
- SHA256 local: contrato `e6eeba470c1da944de53c3a68a04fa90cfd5e20ce40a0d5d905894ad2097c55e`;
  inbound-execution `2ba064927ff4e82b04733abe385a755a58f9d1b28674059731da1511f46109df`;
  teste `78352bb7d16f01a871074001d044867191711a681092fb23dbe4616c064725f1`.
- B continua pendente: efeitos internos adiados, mutações de campos/funil com
  propriedade manual, gatilhos legados, espera/consentimento, tombstones/retencão
  e testes autenticados/recuperação real. Recuperar registro de agendamento não
  aprova a execução de todos os seus tipos. Não declarar fase ou entrega integrada pronta.
- Publicação não executada/autorizada para este pacote. Requer produtores/workers
  compatíveis, índices anteriores prontos e coordenação/drenagem; preservar recibos
  e protocolos em rollback. Sem build global do checkout compartilhado.
- Ledger relido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas
  anteriores e zero reservas; nenhuma chamada paga ou escrita Shopify nesta unidade.
- Próxima unidade B: aplicar recibos e retomada aos efeitos adiados e pré-condições
  de campos/funil; migrar origens restantes antes de auditar saída B.

## Retomada — B: recuperação de execução parcial com recibos

- Turno anterior classificado como progresso: 52 testes e efeitos internos
  atômicos. Unidade C14/C16/contrato 19.2, B ainda ABERTA. Conferidos consumidores
  atuais e ausência de executor anterior dos testes antes de iniciar o novo lote.
- `automation-effect-contract.ts` concentra os quatro tipos internos comprovados;
  `automation-internal-effect.ts` reutiliza o contrato sem ciclo de imports runtime.
  Não é outro motor, fila ou família de flags de atendimento.
- `automation-inbound-execution.ts`: ocorrências novas têm protocolo 2 e contador
  de tentativas. Lease vencido só é retomado automaticamente se TODO o plano for
  desses quatro tipos imediatos, versão/configuração continuar igual e ativa e
  estiver abaixo de três tentativas. Reusa plano, prazo e recibos, com token novo.
  Legado, ação ainda sem contrato, configuração mudada e conciliação explicitamente
  registrada não são liberados por suposição. Não converter protocolo de registros antigos.
- Claim recuperado preserva fonte canônica mesmo quando chamado pela cópia webhook/
  sync do mesmo evento de provedor. Fonte canônica apagada não é ressuscitada pela
  existência de uma cópia. Finalização com posse vencida agora retorna falha e não
  declara sucesso quando o estado efetivo foi reconciliation_required.
- `tenant-usage.ts` e produtor inbound: reserva de cota persiste atomicamente com
  a ocorrência/token, e é reutilizada após retomada, inclusive no limite contratado.
  Reserva de scheduler permanece compatível. Executor antigo/tipo errado não pode
  reutilizar reserva. Ramo de cota negada só declara terminal se confirmar posse.
- `processInterruptedInboundAutomations`, no consumidor existente de automações,
  busca ocorrências processing com lease vencido, de forma limitada e com tenant
  filtrado no servidor. Retoma SOMENTE a automação alvo; não executa incidentalmente
  outras automações elegíveis do evento. Fonte/plano inviável vira conciliação por
  CAS, sem sobrescrever claim mais novo. ProcessPendingAutomationActions o consome;
  rotas internas/tenant existentes já chamam esse processador, sem nova rota/auth.
  Ligação e função testadas; frequência/saúde do timer de produção não homologadas.
- Dois índices locais adicionados para tipo/status/leaseUntil, com e sem tenant.
  Não instalados em produção. Publicação futura precisa índices, workers e produtores
  compatíveis/ordenados e autorização do pacote; sem fallback que enfraqueça a consulta.
- Seis novos testes: execução parcial retoma via alias com cinco concorrentes,
  preserva edição humana e só cria efeito pendente; revogação/legado/teto/estado
  explícito não são retomados; conclusão vencida não relata sucesso; cota limitada
  com cinco reservas só conta uma e bloqueia token/tipo errado; consumidor periódico
  retoma sem nova mensagem e não dispara automação vizinha; fonte removida fica
  em conciliação sem criar nota. Execuções intermediárias: 55/55 em 82,48 s e
  58/58 em 85,95 s. Esta última precedeu reforço do isolamento ao alvo e ajuste
  explícito de narrowing; execução final do código atual registrada abaixo.
- Typecheck intermediário detectou possível snapshot apagado no catch do worker;
  acrescentada verificação explícita da existência antes de acessar campos, sem
  relaxar testes. Typecheck posterior aprovado. Lint intermediário aprovado.
- Execução final do código atual: **58/58 aprovados em 80,17 s**, zero skips/falhas,
  nos cinco arquivos da regressão anterior. Typecheck direcionado e ESLint dos seis
  arquivos de código/teste alterados aprovados; diff --check aprovado. Testes com
  Firestore demo e transportes simulados, sem chamada a cliente/provedor real.
- SHA256 local: contrato `911a99b3f10fe48a4cfd1fe237613de6cf673dc7aa8ee67ccae19e7d40446574`;
  inbound-execution `37b3804de132fdb616768fb930d3c47032b31147328d8a3ec975c2c88047310f`;
  internal-effect `dbe74158da182e1ff47b64cd52d0749e2c0ab2c9c49658b8a8c69437767b3822`;
  automations `8ddd65006d71bf2a3046bb39a6318e3781cfc347450d84c00601880725b28cb7`;
  tenant-usage `1427cbb9db1c22a92db028797953ed976154fc0f72a3191b9caad949fa21223c`;
  teste `4a34b5fc0852b57ad83e2eb5f27587b5003df4b54ac5b25620e806049a2f81ac`;
  índices `6d233943dfd2f05e3b7ce688a96bc4374455559949684a9227f18a67a95b62f1`.
- Ledger relido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas
  anteriores e zero reservas. Nenhuma chamada paga, mensagem real, acesso Shopify
  ou publicação nesta unidade. Sem build global do checkout compartilhado.
- Pendências B: recuperação de planos com mensagens/agendamentos ou alterações de
  CRM ainda sem recibo; efeitos internos adiados/gatilhos legados; consentimento/
  waiting, propriedade de campos/funil, tombstones/retencão e testes ponta a ponta.
  Recuperação de fonte apagada é contenção, não restauração do dado. Testes locais
  não homologam restart real do serviço, cron, qualidade do modelo nem entrega final.
- Próxima unidade B: ampliar recibos/retomada aos efeitos restantes com provas e
  revogações, preservar edições manuais/funil e fechar origens legadas antes de C.

## Retomada — B: recibos atômicos de tarefas e notas inbound

- Turno anterior classificado como progresso: 48 testes e revogação na entrega
  adiada. Esta unidade C14/C16, contratos 19.2/19.4, mantém B ABERTA. Emulador local
  8080 confirmado (PID 5356); nenhum teste anterior concorrente ao novo lote.
- Criado `lib/server/automation-internal-effect.ts`, consumido de verdade por
  executeImmediateAction em `automations.ts` quando há claim inbound aceito.
  create_task, follow_up, alert_human e add_note agora gravam tarefa/nota, evento
  comercial e recibo na mesma transação. Sem nova fila ou coleção paralela: recibos
  usam jobs, tipo automation_internal_effect, e os registros existentes do CRM.
- Identidade por execução/índice; prazo ancorado na criação da execução. Transação
  revalida fonte/canal/tenant/lead, plano/versão ativa, token/lease e exclusão de
  grupos antes da escrita. Retry com recibo não cria outra tarefa/nota, reinicia
  prazo ou sobrescreve edição humana posterior. Outros tipos não usam este contrato.
- Autoria automation:<id>/automationGenerated fica explícita. Alerta cria pendência
  humana e eventualmente nota, NÃO prova notificação/aceite do vendedor. Evento novo
  automation_human_task_created e recibo internal_records_committed_not_human_notified
  eliminam essa afirmação fictícia no caminho migrado; gatilho legado não alterado.
- Executor conta efeitos já registrados sem exigir novo evento, pois evento/recibo
  agora são parte da transação do efeito. Não duplica evento no fechamento do root.
- Novos testes: consumidor inbound real com cinco concorrentes e quatro ações;
  cinco tentativas do mesmo efeito preservam tarefa/nota e edição humana; fonte
  estrangeira/config revogada/lease vencido não deixam efeito parcial; conflito
  preexistente de documento Firestore deve desfazer tarefa/evento/recibo sem sobrescrever
  nota. É conflito no banco demo, não teste de mídia/Cloud Storage.
- Execução intermediária com três testes novos: 51/51 aprovados, 73,14 s; tipos e
  lint aprovados. Teste adicional de rollback incluído na execução final abaixo.
- Execução final: **52/52 aprovados em 78,39 s**, sem skips/falhas, nos cinco
  arquivos da regressão anterior. Typecheck de tests/tsconfig.automation-delivery.json,
  ESLint dos três arquivos alterados e diff --check aprovados. Os testes usam banco
  demo e transportes fictícios; nenhuma execução de modelo real nesta unidade.
- SHA256 local: automation-internal-effect.ts
  `a09d204a77015b138e6cb80aa8e145240d5673e3aafe3ba9570790cdc6aa91e5`;
  automations.ts `7ccc073c132235f36117b29a5f1abe19462d217bcb21c1a6269f0e8e2512e577`;
  teste `2fbb7cd08b317c3b2867f2a7b42c7ad3417ab2f252033fede04d6dfc1a3629f7`.
- Sem publicação, build global, alteração Shopify ou inferência paga. Estes testes
  não aprovam memória, qualidade conversacional, perfil de vendedor ou uso real.
  Rollback precisa manter recibos e drenar workers; não apagar efeitos/recibos para
  refazer ocorrência. Nenhum dado de cliente real foi usado ou removido.
- Ledger relido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas
  anteriores e zero reservas. Conferir estado não fez nova chamada paga.
- Pendências B preservadas: recuperação do root com prova de quais efeitos já
  ocorreram; ações internas adiadas e gatilhos legados; move_stage/tag/priority ainda
  no caminho anterior, dependentes também do contrato de propriedade/funil. Validar
  responsável configurado e disponibilidade não equivale a notificação humana.
  Consentimento/waiting, tombstones/retencão e teste ponta a ponta seguem abertos.
- Próxima unidade B: recuperação conciliável do root usando estes recibos, quota
  idempotente da ocorrência e extensão aos efeitos restantes com pré-condições.

## Retomada — B: revogação na entrega adiada inbound

- Turno anterior classificado como progresso: identidade/lease/recuperação do
  scheduler e 44 testes. Unidade atual C13/C16, contratos 19.1/19.2, somente local;
  B permanece ABERTA. Sem implementação de C, mudança de metas ou publicação.
- `automation-message-delivery.ts`: envio adiado de evento inbound mantém fonte,
  lead, execução e índice da ação na outbox/mensagem; o produtor valida plano,
  texto, destino e token/lease do scheduler. CAS impede aceitar com versão mudada.
  Namespace determinístico sem referência de origem não cai no produtor legado.
- `chat-outbound.ts`: novo fingerprint automation-scheduled-inbound-text-v1 vincula
  essas referências e job agendado. Remover dados/guard não transforma envio aceito
  em mensagem legada desprotegida. Outros recibos agendados legados preservam chave
  e fingerprint; não afirmar que receberam retroativamente a nova proteção.
- `automation-inbound-execution.ts`: transação antes da tentativa no provedor
  revalida fonte, tenant/lead existente, canal/conversa, versão ativa da automação,
  execução original concluída, job/ação/prazo e recibo do scheduler. Desativação,
  edição, exclusão ou conciliação pendente bloqueiam sem tentativa externa.
  Scheduler vivo ainda concluindo registro adia a entrega, não a anuncia enviada.
- `automations.ts`: token do scheduler chega ao produtor real; ramo de recusa de
  cota agora só registra conclusão/log após CAS confirmado. Perda de posse não
  contabiliza terminal fictício nesse ramo. Finalização e envio continuam separados.
- Quatro novos testes: jornada adiada positiva e replay; sete revogações/tamper
  após enqueue (config desativada/editada, fonte/job/lead excluído, root incerto,
  remoção de guard); produtor antigo e espera do scheduler; recusa de cota sem
  mensagem ou declaração de entrega. Cleanup cobre eventos da fixture mesmo com
  parent lead apagado. Execução intermediária anterior ao último teste: 47/47,
  61,83 s, tipos/lint aprovados; execução final registrada abaixo.
- Execução final: **48/48 aprovados em 56,91 s**, zero skips/falhas, nos cinco
  arquivos da bateria anterior. Typecheck de tests/tsconfig.automation-delivery.json,
  ESLint dos cinco arquivos de código/teste alterados e diff --check aprovados.
  São testes locais de integração com banco demo/transportes simulados, não prova
  de modelo real, conta Meta/Shopify operacional ou aceite de qualidade conversacional.
- Arquivos/hash SHA256 locais:
  automations.ts `0b0c131e4946f39b7456b9161eeed81d727d114e43daa9bf04941b3affb45769`;
  automation-message-delivery.ts `a688316eb3d718ee46cceaa1e5faf7afb93def5f90534a7fef433704c559297f`;
  automation-inbound-execution.ts `970daf4ebb21583e620f9f1772e6bd26dd7054ed7ef1b5d5cbae46af7b95982f`;
  chat-outbound.ts `a4042a15ddd19fd0344e408620394b396828239a9830f0fa93cf8fe204401366`;
  teste `05004cd0c4a96e442ac9e4bf9ba0d8fdb80fbc21e664710f9da32453885c2e55`.
- Sem build global ou homologação de contas reais. Compatibilidade de publicação
  exige produtor/worker do novo fingerprint e índices da unidade anterior juntos,
  com drenagem/ativação coordenada e autorização do pacote; nada publicado.
- Limitações: proteção nova é de mensagem adiada inbound, não de todo gatilho
  legado nem efeito interno. Espera/consentimento, tarefas/etapas com recibos
  atômicos, root interrompido, origens legadas e tombstones/retencão continuam
  pendentes. Um job bloqueado por incerteza não se torna automaticamente recuperado
  por passar estes testes. Corpus/modelo real/fluidez não são aprovados por outbox.
- Ledger relido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas
  anteriores, zero reservas; nenhuma chamada paga ou escrita Shopify nesta unidade.
- Próxima unidade B: efeitos internos com recibo atômico e recuperação do root;
  revalidação waiting/consentimento e origens legadas, antes de auditar saída B.

## Retomada — B: identidade e recuperação do agendamento

- Turno anterior: progresso (admissão por evento e 39 testes). Esta unidade mantém
  B ABERTA, sem iniciar C. Escopo C13/C16 e contratos 19.2/19.4; executor técnico
  nesta conversa, fixtures Shopify/Firestore demo, nenhum acesso a clientes reais.
- `automations.ts`: ação adiada de um plano inbound aceito agora cria job com ID
  determinístico por execução/índice, valida claim/plano em transação e ancora prazo
  em createdAt da execução original, não no relógio de cada tentativa. Dois passos
  legítimos têm IDs distintos. Recibo de agendamento usa ID fixo no histórico do lead.
  Agendamentos legados de outros gatilhos ainda usam criação antiga; não migrados.
- Scheduler agora atribui token de posse e lease de 60 s; conclusão/falha usa CAS
  e rejeita executor antigo ou vencido. Corrigido retorno de attempts sobrescrito
  pelo snapshot antigo. Recuperação automática apenas para send_message com protocolo
  novo e menos de três tentativas, sempre reutilizando outbox/recibo da ocorrência.
  Execução vencida legada ou de efeito não idempotente vai a reconciliation_required,
  nunca é repetida por suposição. Isso é contenção, não recuperação completa desses efeitos.
- Consulta de jobs agora filtra tipo/status/tenant no servidor e ordena prazo antes
  de amostrar. Jobs done não ocupam os primeiros 200 e bloqueiam trabalho pendente.
  Dois índices adicionados em firestore.indexes.json, preservando os de outros
  trabalhos. Índices NÃO publicados; emulador não homologa instalação em produção.
- `tenant-usage.ts`: reserva de cota do scheduler e contador mensal persistem na
  mesma transação com token válido. Retomada reutiliza reserva original; não cobra
  quota novamente nem perde resposta por atingir limite no retry. Inicialização
  concorrente do contador agora revalida em transação e não zera reservas recentes.
  Outros chamadores sem job mantêm assinatura/comportamento compatíveis.
- Cinco regressões novas: concorrência e prazos dos agendamentos inbound; posse
  vencida e conclusão obsoleta; quarentena de efeito incerto/legado; retomada após
  envio entregue sem segunda chamada; cinco reservas concorrentes com limite real
  de fixture e retomada, incluindo inicialização do contador.
- Resultado final: **44/44 aprovados em 49,47 s**, sem skips/falhas, nos mesmos
  cinco arquivos da regressão anterior. Typecheck direcionado incluindo produtores
  de canal e ESLint dos três arquivos de código/teste alterados aprovados.
  SHA256 automations.ts: `9402884f807b049126948008a854b3d06c0b873a46f6b11dc77578ed84e111d9`;
  tenant-usage.ts: `d1e39a8c420e685afdfc3a819047f14052685b4f8dc407802a20ce1bab104ada`;
  teste: `730421708906fbca71bb7e73bee467d775680cb8155075eb21a6c31416bbcf86`;
  índices: `e09ad28e79736cce0c8f831ad6d12ea71b502f56bfdfe26596b13c251f2eaa75`.
- Sem publicação, migração de dados, build global ou homologação autenticada UI.
  Rollback futuro precisa preservar jobs, recibos e reservas; coordenar workers
  e índices antes de ativar, não apagar registros para reiniciar efeitos.
- B segue pendente: revogação/configuração/fonte na entrega adiada, recuperação dos
  efeitos não-mensagem e root interrompido, origens imediatas legadas/comentários,
  espera/consentimento, tombstones/retencão e contratos ponta a ponta. Reserva de
  quota negada ainda tem relatório terminal a revisar sob perda simultânea de lease.
  Quantidade limitada de jobs por consulta e escala >120 configurações não homologadas.
- Ledger conferido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas
  anteriores, zero reservas. Nenhuma inferência paga, mensagem real ou escrita
  Shopify nesta unidade. Testes usam transporte falso e não provam qualidade de conversa.
- Próxima unidade B: vincular envio adiado ao plano/fonte revogáveis até o efeito,
  recuperar efeitos internos com recibo atômico e fechar concorrência de finalização.

## Retomada — B: congelamento da admissão completa do evento

- Turno anterior classificado como progresso: 35 testes e migração de cinco
  produtores, com brecha de novas automações em replay explicitamente aberta.
  Nesta unidade, instruções/plano/progresso e fontes atuais conferidos; emulador
  8080 ativo (PID 5356), sem executor anterior concorrente dos testes deste pacote.
- C13/C16 e contrato 19.2/19.4: `admitInboundAutomationEvent` em
  `automation-inbound-execution.ts`, consumido por `runLeadAutomations`, grava a
  seleção antes de qualquer efeito no mesmo armazenamento jobs, tipo
  automation_inbound_admission. Não adiciona segunda fila nem lê conversas reais.
- Transação lê mensagem, conversa, lead e conjunto de configurações do tenant.
  Elegibilidade usa lead/canal persistidos; IDs selecionados e versões ficam fixos,
  inclusive quando a seleção é vazia. Replay não inclui automação criada depois,
  condição tornada elegível depois ou lead que mudou. Novo evento pode usar novas
  regras. Não é congelamento de todo o CRM nem correção de memória conversacional.
- Claim novo valida participação e versão na admissão; configuração alterada entre
  seleção e claim exige revisão, sem substituir a ação. Claims já existentes continuam
  deduplicados e sujeitos à revalidação antes da entrega. Vínculo admissionId fica
  no registro de execução. IDs de admissão e execução têm namespaces distintos.
- Conjunto atual limitado a 120 configurações: query lê 121 e rejeita excesso antes
  de gravar admissão/efeitos, em vez de aceitar amostra incompleta silenciosamente.
  Paginação consistente para tenants acima desse limite permanece pendente. Não
  declarar escala/configuração ilimitada nem reduzir o escopo final por esse limite.
- Quatro regressões novas: novas automações/condições no replay; seleção vazia e
  canal verdadeiro versus pista do chamador; alteração entre admissão/claim; excesso
  de configurações sem efeito parcial. Testes anteriores de concorrência e aliases
  continuam cobrindo disputa pela mesma ocorrência.
- Resultado final: **39/39 aprovados em 42,58 s**, sem skips/falhas, com
  `node --import tsx --test` nos cinco arquivos registrados na unidade anterior.
  Typecheck de `tests/tsconfig.automation-delivery.json` e ESLint dos três arquivos
  modificados nesta unidade aprovados. Firestore demo e transportes simulados;
  isso não é homologação HTTP autenticada, reinício do serviço ou modelo real.
- Versão local SHA256: automation-inbound-execution.ts
  `75e116f024b153aa549793f1b61674b0f7daa7842ef2ad14a167d376846801d7`;
  automations.ts `79cf01ffa545bba3af9fc56d72d6d29124838f229fab2bf49e4c4d8a74438007`;
  teste `f885f132cae6b95da035bb0d649e46582ca334ba48fadc47bce0303b66e05f9a`.
- B continua ABERTA: recuperação por efeito/agendamento, caminhos imediatos legados,
  comentários, consentimento, tombstones/retencão e integração real continuam no
  gate. Admissão depende de metadados persistidos estáveis do evento; mudança tardia
  de identidade/enriquecimento precisa contrato de migração, não deduplicação por texto.
  Nenhum build/publicação/cliente real; rollback futuro preserva recibos/admissões
  e exige coordenação de workers, não apagar jobs para permitir replay.
- Ledger relido, sem chamada paga nesta unidade: US$ 0,002858 acumulados,
  US$ 2,997142 restantes, duas chamadas, zero reservas. Sem escritas Shopify.
- Próxima unidade B: identidade/recuperação dos efeitos e agendamentos do plano
  aceito, revalidação antes do efeito e migração de origens legadas. Não iniciar C.

## Retomada — B: evento de entrada e plano aceito de automação

- Implementação local, não publicada. A continua encerrada apenas no diagnóstico;
  B permanece ABERTA. Não há novo motor de conversa nem aprovação de C–G.
- Criado `lib/server/automation-inbound-execution.ts`: ocorrência por tenant,
  evento persistido e automação, claim transacional, plano aceito congelado e
  versão da configuração. Origem precisa ser mensagem de cliente da conversa/lead
  corretos, não grupo. Webhook e sincronização com mesmo ID do provedor/canal
  compartilham ocorrência; não usamos texto/nome/proximidade temporal para deduplicar.
- `automations.ts` e `automation-message-delivery.ts` agora aceitam send_message
  de message_received com sourceMessageId na outbox comum, sem envio direto.
  Mensagem, intenção e vínculo ao claim são registrados atomicamente com condições
  de versão. Lease vencido/falha exige conciliação, não repetição cega de efeitos.
- Ligados cinco pontos de entrada ao ID persistido: dois caminhos WhatsApp, DM
  Meta, sincronização Meta e widget público. Sincronização ignora entrada sem ID
  do provedor. Teste AST prova ligação dos chamadores, NÃO HTTP autenticado completo.
- `chat-outbound.ts` revalida fonte, destino, plano e versão da automação antes de
  iniciar tentativa no provedor. Fonte removida/configuração alterada ou desativada
  bloqueia o envio. Produtor ainda registrando ações adia o worker sem consumir
  tentativa de provedor. Remover metadados não permite rebaixar o novo fingerprint
  para o caminho legado. Conclusão do produtor significa ações registradas, não entrega.
- Regressão final: **35/35 aprovados**, 38,83 s, comando `node --import tsx --test`
  com automation-message-delivery.emulator.mts, ai-text-delivery.emulator.mts,
  ai-social-text-delivery.emulator.mts, automation-inbound-producers.test.mts e
  inbound-webhook-contract.test.mts. Inclui 16 testes de automação, concorrência
  de cinco execuções, aliases webhook/sync, fonte/config revogada, expiração,
  espera do produtor e perda de ACK, mais regressão IA WhatsApp/social.
  Firestore demo local e transportes simulados; nenhuma mensagem externa.
- Typecheck `tests/tsconfig.automation-delivery.json` aprovado incluindo as três
  rotas modificadas e sincronização. ESLint aprovado nos dez arquivos de código/teste
  alterados nesta unidade. Sem build global do checkout compartilhado nem teste UI.
- Inspeção dos consumidores: filas IA/agendamento filtram tipo; o novo tipo não
  entra nesses executores. Contagem de uso filtra automation_execution. Diagnóstico
  de prontidão ainda lê amostra genérica de jobs: revisar cobertura/limites antes do
  gate final. Não há ainda processador dedicado de conciliação dessas ocorrências.
- Limitações obrigatórias: outros gatilhos imediatos e comentários sociais ainda
  usam caminho legado; manifesto completo de automações elegíveis por evento não
  está congelado (nova configuração pode entrar numa nova avaliação do replay).
  Ações não-mensagem e agendamentos precisam identidade/recuperação por efeito;
  waiting/agendadas precisam revalidação própria. Consentimento/revogação e retries
  HTTP do widget antes de persistir precisam prova ponta a ponta. Não declarar B pronta.
- Publicação futura exige produtores e worker compatíveis com novo fingerprint,
  ativação coordenada/drenagem e autorização do pacote. Nada publicado ou ativado.
- Ledger conferido: US$ 0,002858 acumulados, US$ 2,997142 restantes, duas chamadas,
  zero reservas. Nenhuma chamada paga, acesso real de cliente ou escrita Shopify
  nesta unidade. Corpus/metas/revisão/piloto não reduzidos.
- Próxima unidade B: congelar admissão completa do evento (incluindo automações
  elegíveis), identidade dos efeitos/agendamentos e recuperação conciliável;
  depois migrar origens legadas com referência autêntica e testar revogações.

## Retomada — auditoria A encerrada e primeira mudança B

- Turno anterior: progresso (cold restart e causa de estado errado reproduzidos).
  Esta unidade conferiu critérios originais A nas seções 10/22 e o registro derivado.
  Identificada inclusão indevida de execução completa da bateria em A antes da
  construção do substituto. Usuário consultado explicitamente sobre corrigir divisão
  sem remover os 104 casos/metas/revisão/piloto: “faça o melhor caminho que voce encontrar”.
- Criada AI_REBUILD_STAGE_A_EXIT_AUDIT.md, requisito por requisito, com evidências,
  lacunas e limites de uso. A encerrada SOMENTE em diagnóstico/contratos; B iniciada
  depois dessa decisão registrada. Qualidade, MVP, gate 2 antigo e fases C–G não
  recebem aprovação. Dados/regras reais não aprovados continuam bloqueando seu uso.
- Nova inspeção de produção somente leitura: deployment atual READY
  dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh, 1.427 fontes; snapshot protegido em
  `.qa-artifacts/client-conversation-release-1792453253671`. Quatro fontes comparadas
  com normalização LF: router/policy/context coincidem; agent local difere em
  migrações de entrega e outras pendências. Nada criado/promovido/revertido no domínio.
- Implementados `lf-scope-metadata.mts`, `inspect-ai-rebuild-lf-scope.mts` e cinco
  testes. Queries projetadas server-side no tenant LF selecionado, sem mensagens,
  leads, pedidos, conteúdo KB, token Shopify/canal ou mudanças na configuração.
  Campos não operacionais ficam fora do JSON; canários de texto privado não vazam.
  Tipagem ampliada e lint aprovados após alargar tipos literais da fixture negativa.
- Artefato final LF `lf-scope-metadata-1792453481415.json`: uma Shopify/WhatsApp
  cadastrados ativos e exclusividade estrutural para uma conversa; nenhum IG/Messenger
  cadastrado. 107 documentos (102 catálogo/3 políticas/2 FAQ), sem ler conteúdo ou
  aprovar vigência. Token/contrato real não testados. Sem funil direto nem por query;
  consumidor cai no perfil empresarial — não concluir que não existe funil.
- B, primeira implementação: `queueWaitingReplyAutomationMessage` no helper comum
  de entrega de automações; identidade por tenant/conversa/instante persistido do
  cliente/automação/posição da ação. Cron/retry não gera nova intenção; ações e
  ciclos posteriores permanecem distintos. Chave/recibos agendados antigos preservados.
- `executeImmediateAction` agora enfileira send_message de waiting_for_reply em vez
  de chamar provedor. Eventos dizem QUEUED, não SENT, e usam ID do outbound para
  não duplicar recibo. Mensagem é automationGenerated=true e aiGenerated=false;
  não se apresenta como humano nem vira prova de etapa comercial. Nada publicado.
- Primeiro teste novo detectou ausência do marcador falso explícito aiGenerated;
  acrescentado ao produtor (assert não relaxado). Regressão intermediária: 22/22
  em 19,59s, incluindo fluxo watchdog, cinco concorrentes, ocorrências distintas,
  replay, incerteza de entrega e controles humano/turno/catálogo em WhatsApp/social.
  Tipagem de automações e lint dos três arquivos aprovados. Teste adicional de ACK
  perdido na ocorrência waiting incluído na execução final registrada a seguir.
- Execução final com o caso ACK waiting: 23/23 em 13,30s. Oito testes de automação
  e 15 de entrega IA WhatsApp/social, todos com transportes fictícios e banco local.
  Nova ocorrência aguardando resposta preserva reconciliação sem segunda chamada
  ao provedor após ACK perdido. Lint final e conferência de espaços aprovados.
- B continua ABERTA. Ainda há envio direto em gatilhos imediatos fora da espera;
  faltam identidade durável do evento nos produtores, congelar plano/ordem da
  automação em replay, identidade do agendamento, revalidar condição de espera e
  configuração antes do efeito e recuperar claims/leases. Não anunciar todas as
  automações como protegidas, nem avançar C. Sem novo build global do checkout
  compartilhado; pacote exato e build integrado são requisito preservado de F.
- Ledger relido: US$ 0,002858 acumulados calculados, US$ 2,997142 restantes,
  duas chamadas e zero reservas. Nenhum modelo pago, mensagem real, pedido, estoque,
  pagamento ou publicação nesta unidade. Acesso real foi só metadado/configuração.
- Próxima unidade B: identidade de evento/ação e migração dos gatilhos imediatos,
  incluindo origem WhatsApp/Meta; recuperação e revalidação antes de fechar o gate.

## Retomada — correção e retomada entre processos novos

- Turno anterior: progresso (dois cenários e oráculos ampliados, falhas registradas).
  A permanece aberta; nenhuma implementação de B/C/D iniciada ou publicada.
  Conferidos processos; nenhum executor anterior seguia ativo antes dos novos testes.
- Usuário confirmou assumir validação das regras LF e revisão das respostas antes
  do piloto. Atualizados missão, decisões A e manifesto; escolha de responsável não
  é aceite de regras/conversas nem autorização para ativar/envios/publicação.
- Implementados `cold-handler-turn.mts` e `cold-handler-worker.mts`: um processo
  Node novo por entrada do cenário original `shop-correction-and-restart`, sem
  agentes de IA adicionais. Cada processo importa handler/SDK do zero e lê o mesmo
  estado persistido no projeto demo. HTTP vai por IPC ao transporte fictício com
  negação por padrão do pai; gRPC só no emulador local. Credenciais do worker são
  fictícias; modo pago deste cenário é recusado antes de qualquer chamada.
- Limites: quatro IDs de fixture vinculados ao mesmo prefixo, projeto/host fixos,
  no máximo 50 requisições HTTP por turno e 2 MB por resposta, 45s por worker.
  Timeout espera término do filho antes da limpeza; queda do pai encerra o filho;
  erro/resultado inválido não volta a executar o turno no processo principal.
  Registra PID/bootId fora da saída do modelo; os quatro workers terminaram.
- Artefato `.qa-artifacts/ai-rebuild/handler-baseline-1792452890806.json`, versão
  do caso 57252f4baeff0b5d099227e9bc9d960032ffcee60dd2e8fa87f128de168c6934.
  Quatro entradas originais, quatro PIDs distintos, protocolo sem erro, fonte de
  aplicação inalterada e nenhuma rede não autorizada. Resultado da jornada FAILED,
  código 2: correção, produto preservado e retomada/consulta final reprovados.
- Primeiro processo salva Aurora preta G. Segundo lê contexto, mas “Na verdade GG”
  vira busca por `verdade`, sem resultado; grava descoberta com produto/selecao
  vazios e handoff. Terceiro/quarto leem esse estado e pausa, não uma memória local
  do processo anterior. Não concluir que reiniciar apaga memória por si: o código
  escreveu uma interpretação errada no estado durável. Não simula dias decorridos.
- Novo oráculo de reinício e cinco testes unitários; teste de integração roda os
  quatro workers reais e confere ordem, provas de processo, transporte, isolamento,
  seleção inicial e consistência do diagnóstico, sem exigir perpetuar o bug.
  Regressão pura: 36/36 em 4,03s. Integração inicial: 1/1 em 43,97s; jornada segue
  reprovada. Tipagem ampliada e lint dos nove arquivos aprovados nessa execução.
- Após tornar explícita a recusa de resultado inválido/duplicado e eliminar até
  fallback acidental para execução no pai, integração repetida: 1/1 em 41,39s;
  cinco unitários repetidos, tipagem e lint final aprovados. Sem workers pendentes.
- Inventário agora registra quatro adaptadores PARCIAIS, incluindo cold restart;
  zero executores integralmente verificados. Contagem de inferência passa a null
  quando o inventário não carrega histórico de execuções, em vez de anunciar zero
  incorretamente. Especificações e hashes permanecem iguais: 104 casos/30 reservados,
  514 repetições planejadas. Artefato corpus-1792453008028.json. Não equivale a
  quatro casos homologados nem aprovação de naturalidade, canal ou loja reais.
- Ledger relido: custo acumulado calculado US$ 0,002858, saldo US$ 2,997142,
  duas chamadas, zero reservas; nenhuma chamada paga nesta unidade. Nenhum cliente,
  Shopify real, estoque, pagamento ou dados de produção alterados; sem deploy.
- Próxima unidade: consolidar evidência por tentativa/versão no inventário, completar
  setups/oráculos ainda pendentes e auditar critérios originais de saída A. Não
  repetir corpus para ajustar holdout nem transferir falha de contexto para modelo caro.

## Retomada — preço alterado e produto sem publicação

- Turno anterior: progresso (manifesto e oráculo de link implementados/verificados).
  Nesta retomada a fase A continua aberta; B não começou. Conferidos instruções,
  plano, missão, progresso e processos: nenhum executor de cenário anterior ativo.
  Emulador Firestore confirmado escutando em 127.0.0.1:8080 (PID 5356).
- Executados os adaptadores de `shop-price-changed-before-link` e
  `shop-product-unpublished`, com quatro entradas exatas, handler/provider reais,
  modelo/DNS/GraphQL/canal fictícios, em processos dedicados. Nenhum dado LF usado.
- Preço: artefato inicial `handler-baseline-1792452309671.json`. A jornada falha
  ANTES de testar atualização de preço: “Qual preco da Aurora G?” produz consulta
  `title:qual* AND title:aurora*`, sem produto, seguida de handoff e pausa nos outros
  três turnos. Não afirmar que o sistema confirmou preço vencido: essa condição
  não foi alcançada; a jornada e a recuperação conversacional é que reprovaram.
- Acrescentado `returnedProductIds` às interceptações de GraphQL. Preço/URL definidos
  na fixture não comprovam exposição se a busca não retornou o produto. Nova captura
  `handler-baseline-1792452428455.json`: zero produto devolvido, primeiro preço e
  preço atualizado sem evidência, variante não retida, nenhum valor comunicado.
  As seis checagens correspondentes falham; tentativa permanece no denominador.
- Produto não publicado: captura com instrumentação
  `handler-baseline-1792452456334.json`. Produto ACTIVE retornado com URL ausente;
  razão `shopify_live_unpublished`, sem URL inventada nem mudança para ganho.
  Porém entrega apenas reconhecimento genérico de handoff e pausa os turnos
  restantes; não explica a ausência de publicação/link ao comprador.
- Inspeção confirma caminho de perda da informação: resolveCatalogConversation
  em `lib/shopify-conversation-catalog.ts` produz explicação de publicação ausente;
  handoff em `ai/agent.ts` compõe `handoffAcknowledgement` genérico em vez dessa
  explicação. Não atribuir essa omissão à capacidade do modelo, que aqui é simulado.
- Implementados dois oráculos estreitos adicionais em `journey-outcome.mts`,
  oito testes em `ai-rebuild-catalog-risk-outcome.test.mts` e dispatch explícito.
  Rejeitam evidência de produto errado/consulta falhada, condição não exposta,
  versão antiga, preço não comunicado, URL inventada e silêncio como sucesso.
  Checagens textuais são auxiliares, não juízes semânticos de todas as alegações;
  qualidade/humano/canal real continuam sem aprovação mesmo quando elas passam.
- `verify-ai-rebuild-handler.mts` agora inclui `journeyOutcome` no artefato dos
  três casos explícitos e retorna código 2 se objetivo reprovar. As sondas default
  continuam diagnóstico, não aceite. Prova integrada após mudança:
  `handler-baseline-1792452558310.json`, código 2, apenas
  `publicationLimitationExplained=false`; rede bloqueada vazia, sourceUnchanged=true,
  paidModelCalls=0. Não alterar condições de sucesso para tornar o baseline verde.
- Regressão pura: 31/31, 2,72 s. Tipagem ampliada aprovada após corrigir união do
  retorno do dispatcher; lint de cinco arquivos sem erros. Sem build da aplicação:
  alterações desta unidade só atingem harness/testes/documentação, não telas/motor.
- Regressão no emulador: 2/2, 29,14 s (handler/base e Shopify). Preservados bloqueio
  de origem de outro tenant/chat, pausa humana, replay sem nova entrega, CRM passivo,
  consulta por tamanho e erro de API seguro. Esses testes aprovam essas sondas e
  a consistência do diagnóstico, não as jornadas comerciais reprovadas acima.
- Ledger relido sem novas chamadas: comprometido/conciliado US$ 0,002858, saldo
  US$ 2,997142, duas chamadas e zero reservas. Nenhum deploy, envio externo, leitura
  de loja real, compra, pagamento, estoque ou exclusão de dados de produção.
- Próximo: integrar os resultados por tentativa ao inventário do corpus, completar
  setups/oráculos pendentes e fechar a auditoria das decisões A. Não transformar
  três adaptadores parciais em 104 casos homologados nem usar baseline reprovado
  para declarar fase de implementação/qualidade posterior concluída.

## Retomada — manifesto contratual e loja escolhida

- Turno anterior: sem progresso técnico novo (resposta esclareceu orçamento já
  autorizado). Retomada fez leitura do código atual, plano e registros concorrentes.
- Usuário escolheu LF Multimarcas para futuro piloto; não nomeou revisor/dono das
  regras nem autorizou envios. Preservar teste exclusivo do trabalho paralelo;
  registro de deploy desse trabalho não confirma estado atual de produção.
- Criado AI_REBUILD_SHOPIFY_CAPABILITY_MANIFEST.md: C01–C21, expansão por três
  canais/tenants sintéticos, consumidor, entradas/saídas, limites e evidência;
  contratos de catálogo/URL/pedido/frete, CRM, envio, transferência e aprendizado.
- Separados decisão técnica local, permissão sintética e aceite operacional real.
  Sem prazo de retenção/permite observar/aprender LF confirmado, não coletar dados
  reais novos para avaliação/aprendizado. Nenhuma exclusão de produção autorizada.
- Inventário é progresso de contrato A, NÃO capacidade entregue. A continua aberta:
  faltam setups/oráculos/executor, responsáveis/acessos/fontes LF e decisões reais
  de operação. Não houve novas chamadas pagas, deploy ou alteração de produção.
- Implementado oráculo estreito `scripts/ai-rebuild/journey-outcome.mts` e replay
  somente leitura `scripts/verify-ai-rebuild-journey.mts`. Compara versão/entradas
  completas, seleção persistida e URL realmente interceptada no último turno;
  falha de infraestrutura permanece tentativa inválida, não some do denominador.
  Não é juiz semântico, recibo autenticado nem aprovação integral do produto.
- Replay do artefato pago anterior: protocolo sem erro; produto/tamanho retidos
  FALSE e URL entregue FALSE; resultado `failed`, qualityApproved=false. Não houve
  nova inferência. Ledger relido: 2 chamadas, 2.858 micros comprometidos/conciliados,
  2.997.142 micros restantes, zero reservas pendentes.
- Testes locais do oráculo/corpus/baseline: 11/11; lint dos três arquivos novos
  aprovado. Verificador considera URL apenas na saída do turno correto, rejeitando
  homepage, domínio atacante, caminho de outro produto, metadado e turno anterior.
  Casos fabricados só testam o oráculo, não contam como atendimento aprovado.
- Tipagem ampliada `tests/tsconfig.ai-rebuild.json` aprovada após corrigir tipo
  literal da fixture de teste; os 5 testes do oráculo foram repetidos e passaram.
  Nenhum arquivo do motor de produção foi modificado nesta unidade.

## Retomada — primeira inferencia real limitada ao teto autorizado

- Turno anterior: progresso (controle duravel inicializado/testado). Integrado
  `paid-model-call.mts` ao modo explicito `--paid-model --case=...` do diagnostico.
  API real apenas para caso ficticio de desenvolvimento, revisao/hash conferidos;
  Shopify/DNS/canal e banco seguem fixtures isoladas. Nao aceita holdout, chave
  ausente, modelo/caminho de saldo arbitrarios nem troca de modelo apos erro.
- Reserva conservadora por chamada: 421.431 micros (US$ 0,421431), cobrindo toda
  a janela do modelo (1.047.576 tokens de entrada) mais teto de saida de 1.500,
  com tarifa uncached Standard. Payload textual local limitado, n=1, sem tools
  pagas, sem redirects, sem armazenamento, tier default e sem retry no transporte.
  Recibo precisa modelo fixado e uso valido; erro/timeout conserva reserva.
- Uso calculado conta completion_tokens totais, nao tamanho de texto visivel;
  ignora desconto de cache por conservadorismo. Valor conciliado e limite superior
  pelas tarifas/uso reportados, nao fatura confirmada da conta.
- Contratos gratuitos do transporte: 4/4; com ledger: 9/9. Regressao com handler:
  5/5 em 11,17 s. Tipagem ampliada e lint aprovados antes de chamada real.
- Executado UMA VEZ `shop-product-direct-link`, quatro entradas exatas, hash
  4f912326b00a83ced28b8549a3cd217883ea26f9927de26c5b5c84c0ca890a63.
  Artefato: `.qa-artifacts/ai-rebuild/handler-baseline-1792451618594.json`.
  Foram duas chamadas GPT-4.1 Mini reais dentro do cenario; turnos de catalogo
  deterministico e sondas auxiliares nao foram rebatizados como inferencia real.
- Resultado da jornada: REPROVADA no objetivo de entregar URL. Primeiro encontra
  Aurora e recebe G; “É essa mesmo” vira busca title:mesmo*, perde produto/selecao
  e termina em handoff. Pedido seguinte de link e ignorado por pausa do handoff.
  Isso localiza desvio do fluxo com modelo real, nao prova limite universal do modelo
  nem que trocar para modelo caro resolveria o caminho deterministico.
- Recibos: 2.923/92 e 3.332/130 tokens entrada/saida; 1.317 + 1.541 micros de USD.
  Registro definitivo lido apos execucao: comprometido/conciliado 2.858 micros
  (US$ 0,002858), saldo 2.997.142 (US$ 2,997142), duas chamadas, zero reservas pendentes,
  sem congelamento. Nenhum erro de API ou rede nao autorizada observado.
- sourceUnchanged=true; nenhum envio externo de WhatsApp, leitura de loja real,
  compra, pagamento, mudanca de estoque ou deploy. O unico efeito externo foi
  inferencia paga autorizada com dados ficticios. Metadados distinguem esse efeito
  de efeitos de negocio; nada declara atendimento/qualidade integral aprovado.
- Proximos traces capturam resposta bruta do modelo por turno para comparar com
  texto final. Nao repetir chamada paga apenas para preencher essa instrumentacao.
- Etapa A permanece aberta. Proxima unidade: fechar auditoria de saida da fase
  contra os requisitos originais, concluir manifesto e oraculos do executor. A
  aprovacao tecnica de A nao pode ser confundida com aprovar as jornadas reprovadas.

## Retomada — contabilidade duravel do teto US$ 3

- Turno anterior: progresso (autorizacao registrada e modelo/estimador reduzidos).
  Implementada a precondicao de custo sem fazer chamadas pagas.
- `spend-ledger.mts`: SQLite do Node 24, transacao exclusiva, WAL e synchronous
  FULL; valores em micros inteiros de USD. Reserva antes do envio conta no saldo
  cumulativo; fechar/reabrir nao renova autorizacao. Mesmo ID nao reenvia e outro
  payload conflita. Queda/timeout conserva reserva; recibo de uso concilia custo.
  Recibo conflitante e rejeitado. Custo acima da reserva e registrado e congela
  novas chamadas em vez de esconder divergencia.
- `mission-spend.mts` e CLI de status/inicializacao unica usam caminho fixo, sem
  parametro de teto/destino. Marcador nasce antes do banco. Ausencia/corrupcao ou
  autoridade/modelo divergentes falham sem saldo novo. Nao apagar para corrigir.
- Inicializado UMA VEZ apos autorizacao humana:
  `C:/Users/Eu/ALTUM/.altum-evaluation/shopify-rebuild/usd3.sqlite`, com marcador
  ao lado. Pasta ignorada pelo Git; preservar banco, WAL/SHM e marcador. Nao
  restaurar copia antiga como saldo novo, nem iniciar outro registro em worktree/
  computador distinto. Controle deste checkout entre processos, nao teto global
  da conta OpenAI nem mudanca de cobranca da IA em producao.
- Estado lido apos testes: teto 3.000.000 micros, comprometido/confirmado zero,
  saldo 3.000.000, chamadas/reservas pendentes zero. Testes usam bancos temporarios
  isolados, nunca simulam consumo no registro definitivo.
- Cinco testes novos: persistencia, dez processos concorrentes (apenas quatro
  reservas US$ 0,75 aceitas), processo encerrado apos commit, dados invalidos/
  corrompidos e congelamento por custo inesperado. Primeira execucao revelou
  handle aberto em erro de SQLite; corrigido, 5/5 aprovado. Regressao: 25/25 em
  6,10 s. Tipagem ampliada e lint aprovados sem alterar dependencias de producao.
- Falta ligar reserva ao transporte pago, limitar modelo/tokens/operacoes e
  capturar uso real. Existencia do registro nao aprova restante do executor.
  Etapa A aberta; nenhum deploy, envio real, compra ou custo externo.

Proxima unidade: executor pago restrito ao corpus ficticio de desenvolvimento,
reserva maxima segura e recibo real de uso; amostra pequena no modelo barato
dentro do teto, sem fornecer holdout ao agente para ajustar comportamento.

## Decisao do usuario — teto acumulado US$ 3 e modelo mais barato

- Usuario autorizou diretamente somente US$ 3 no total e perguntou por alternativa
  ao GPT-5.4. GPT-5.4 nao era obrigatorio e nao foi chamado. Lote inicial passa a
  usar GPT-4.1 Mini, snapshot gpt-4.1-mini-2025-04-14; modelo final do produto ainda
  depende de qualidade medida. Nenhum gasto realizado nesta mudanca.
- `scripts/ai-rebuild/budget.mts` registra autorizacao/escopo e estimativa com
  tarifas Standard oficiais verificadas em 19/10/2026: entrada US$ 0,40 e saida
  US$ 1,60 por milhao. Fonte: https://developers.openai.com/api/docs/pricing;
  snapshot: https://developers.openai.com/api/docs/models/gpt-4.1-mini.
- O teto e acumulado entre processos/rodadas, nao renova em cada teste. Exigir
  reserva/contabilidade duraveis verificadas antes da primeira chamada; saldo nao
  confirmado permanece reservado. Nao ampliar automaticamente se a bateria nao
  couber. Bateria completa, avaliador pago e outros custos nao autorizados.
- Estimador local e testes implementados: 2/2 aprovados. E planejamento por tokens/
  chamadas, nao consumo medido nem garantia de concluir 104 casos dentro de US$ 3.
- Em paralelo foi iniciado adaptador por ID/versao para tres casos do corpus no
  handler. Ainda em validacao: nao contar como execucao integral aprovada. Primeira
  sonda de shop-product-direct-link preservou quatro entradas mas proposta de busca
  do modelo falso citava bloco formatado em vez de mensagem original; corrigido
  no simulador, pendente reexecucao. Nao atribuir falha do simulador ao produto.
- Etapa A permanece aberta, sem deploy ou chamadas reais. Proxima unidade:
  concluir oraculos/registro do executor e barreira duravel de gasto.

## Retomada — corpus de 104 especificações Shopify

- Turno anterior classificado como progresso: provider/handler exercitados com
  três jornadas e duas falhas comerciais reproduzidas. Nesta unidade, preparação
  ampliada de dez para 104 cenários especificados, sem executar inferência.
- 74 de desenvolvimento (dez anteriores + 64 adicionais) e 30 reservados.
  Foram necessários quatro além do mínimo para preencher lacunas detectadas na
  matriz: C11 negativo/recuperação, C14 positivo e C21 positivo. Não reduzir escopo
  para caber exatamente em cem casos. C06/C08 continuam adiados.
- Novas fixtures: `ai-rebuild-corpus-types.mts`,
  `ai-rebuild-shopify-development.mts`, `ai-rebuild-shopify-holdout.mts`.
  Cada caso tem quatro entradas, estado inicial, fato esperado, ao menos duas
  evidências, duas falhas proibidas e critérios de revisão da conversa inteira.
- `scripts/ai-rebuild/corpus.mts` e `verify-ai-rebuild-corpus.mts` auditam duplicação
  de ID/transcrição, integridade, matriz C01-C21, partição e hashes. Executor diário
  retorna somente desenvolvimento; carregamento reservado exige opção explícita.
  Isso evita uso acidental, não é barreira de segurança nem revisão cega independente.
- Matriz estrutural tem positivo/negativo/recuperação para as 19 capacidades
  aplicáveis. É cobertura declarada nas especificações, não prova semântica nem
  teste dos consumidores reais. Fixtures ainda precisam setups e oráculos executáveis.
- Relatório `.qa-artifacts/ai-rebuild/corpus-1792450604152.json`:
  104 casos, 30 reservados, 514 execuções planejadas pelas repetições. Classificação
  conservadora atual marca 101 como críticos e três como comuns; exige revisão de
  risco antes da bateria paga, não representa 101 incidentes P0 existentes. Não
  reclassificar após resultado apenas para melhorar nota ou reduzir repetições.
- Hash do conjunto: f5c20462921a28b86abf392892621b1297ef88d2de0f44c0a6a74f7c3bed9ae5.
  Zero cenários integrais executados pelo registro novo, zero inferências reais,
  revisão humana/independência do holdout pendentes. Três jornadas diagnósticas
  anteriores não foram rebatizadas como execução destes 104 casos.
- Testes do corpus: 3/3. Regressão pura com diagnóstico/verificador: 18/18 em 2,65 s.
  Lint dos seis arquivos novos e tipagem ampliada aprovados; diff sem erros de espacos.
  Sem chamadas pagas, mensagens reais, mudanças no motor ou publicação.
- Etapa A continua aberta: falta executor integral por caso, manifesto por canal/
  conector/ação, resgates, modelo/teto/acessos e demais decisões do gate. Especificar
  cenários não libera B e não demonstra melhora de naturalidade.

Próxima unidade: ligar cenários de desenvolvimento a setups e oráculos de estado
real no emulador, sem fornecer os reservados ao agente; fechar manifesto e método
de custo. O diagnóstico antigo mantém dez casos-semente e não é o resumo do corpus.

## Retomada — Shopify pelo provider no handler completo

- Turno anterior: progresso (baseline completo e contenção P0 comprovados localmente).
  Esta unidade acrescenta três jornadas independentes de três entradas cada:
  produto→G→link, produto→G→correção GG e produto→GG→erro de API.
- `handler-baseline.mts` agora tem opção Shopify: usa lookupConversationCatalog,
  registry e provider Shopify reais, construtor de GraphQL e normalizador reais.
  DNS e transporte GraphQL são fixtures em processo separado. SSRF do produto não
  foi alterado; DNS retorna IP reservado somente para o host fictício; nenhum
  fetch é encaminhado para rede/loja. Modelo e WhatsApp continuam simulados.
- Simulador confere título versus todos os termos da busca e ID do produto:
  não devolve Aurora para qualquer query. Primeiro rascunho do teste devolvia
  produto para `title:verdade*`, mascarando falha; corrigido antes de usar como prova.
  Artefatos exploratórios anteriores a esta correção não homologam a jornada.
- Três achados registrados no artefato final
  `.qa-artifacts/ai-rebuild/handler-baseline-1792450199591.json`:
  `requested_product_link_not_delivered`, `size_correction_not_applied` e
  `correction_searched_as_new_product`. Pedido de link vira unsupported_media;
  “Na verdade GG” produz busca por “verdade”, não correção no produto ativo.
  Com resposta fiel da loja (nenhum resultado), termina em handoff e conserva G.
- Consulta normal de G/GG e preço percorre o provider e entrega sintética;
  consulta não muda estágio para ganho. API 503 não permite afirmar estoque antigo;
  o handler registra encaminhamento sem afirmar aviso WhatsApp confirmado.
- `commerceInterest` ficou nulo no cenário com autonomia híbrida. Ainda é preciso
  avaliar permissões/contrato e observação independente antes de concluir causa ou
  anunciar preenchimento automático de interesse no CRM como funcional.
- Novo teste `ai-rebuild-shopify-handler.emulator.mts` verifica integridade do
  diagnóstico, nove entradas, somente queries de leitura, contexto inicial,
  falha segura, fontes e restauração de DNS/fetch. Não exige manter bugs presentes:
  achados mudam quando a implementação for corrigida. Passar o teste NÃO aprova
  compra assistida, correção ou link; essas jornadas estão reprovadas no baseline.
- Testes integrados intermediários: 2/2 em 28,70 s. Regressão final da reconstrução:
  17/17 em 27,78 s; tipagem ampliada aprovada, lint sem erros. Artefato final confirma
  sourceUnchanged=true e rede não autorizada
  vazia, zero custo pago. Nenhuma mudança em código de produção nesta unidade.
- Etapa A ainda aberta. Os três fluxos não são 100 cenários, holdout, inferência
  real, reinício de processo ou teste de canal real. Não avançar B nem publicar.

Próximo: consolidar corpus/oráculos e matriz C01-C21, reproduzir resgates de resposta
e fechar custo/modelo/acessos da avaliação. Prioridades para motor: intenção de
correção separada de busca, seleção persistente, ação de URL direta e limites de CRM.

## Retomada seguinte — baseline do handler e contenção P0

- Turno anterior: progresso concreto (verificador implementado e executado), não
  aprovação de produto. Esta retomada passou do teste de helpers ao handler real
  `handleIncomingMessage`, usando projeto separado `demo-altum-ai-rebuild` no
  Firestore Emulator. Modelo e endpoint de WhatsApp são interceptados sem qualquer
  pass-through de rede. Nenhuma loja/credencial real é usada.
- Implementados `scripts/ai-rebuild/handler-baseline.mts`,
  `scripts/verify-ai-rebuild-handler.mts` e
  `tests/ai-rebuild-handler.emulator.mts`. O teste percorre quatro entradas,
  captura mensagens efetivamente montadas para o modelo, entrega/outbox persistida,
  replay e observação passiva com resposta pausada.
- Falha reproduzida ANTES de corrigir: mensagem de tenant/conversa diferentes
  chegou ao pedido do modelo simulado; envio foi barrado depois como superseded.
  Evidência: `.qa-artifacts/ai-rebuild/handler-baseline-1792449675638.json`.
  Não é evidência de vazamento ocorrido em produção nem demonstra todos os
  controles de autenticação/webhook; mostra uma precondição ausente no handler.
- Contenção P0 local: `ai/agent.ts` agora exige tenant e chat exatos da mensagem
  ANTES de restaurar estado, enriquecer ou consultar modelo. Ausência de vínculo
  também é rejeitada. Mensagens legadas sem metadados deixam de ser processadas;
  exigem reconciliação explícita, não inferência insegura. Sem alteração de dados.
- Evidência após correção: `.qa-artifacts/ai-rebuild/handler-baseline-1792449793099.json`:
  quatro respostas sintéticas, quatro jobs concluídos; fontes de outro tenant,
  outro chat ou sem chat geram zero chamadas de modelo; replay não chama nem envia;
  observador atualiza cidade para Recife com resposta pausada e zero envio.
- A entrada original/correção G→GG e cidade estão no prompt do último turno;
  isso comprova montagem do contexto neste caso curto, não entendimento do modelo,
  persistência após restart, memória longa nem consulta real à Shopify.
- A contenção corrige defeito crítico encontrado no baseline da etapa A; não
  inicia o motor novo, não aprova B e não encerra o gate de fundação/Conversas.
- Primeiro teste integrado: 1/1, 13,72 s. Regressão final: 31/31 em 15,17 s,
  incluindo verificador, baseline e entregas WhatsApp/Instagram/Messenger.
  Tipagem ampliada aprovada; lint dos novos arquivos sem avisos; agente sem erros,
  com dois avisos preexistentes. Conferência de espaços/diff aprovada.
- Nada publicado; modelo sempre simulado; custo pago zero. Não aprovar qualidade
  pela resposta do modelo falso, pela contagem de jobs ou por teste verde.

Próxima unidade permanece A: ampliar corpus e oráculos Shopify, reproduzir os
resgates de resposta e consultar catálogo simulado pelo conector no mesmo handler;
fechar manifesto, modelo, orçamento e acessos necessários antes de B.

## Retomada da missão persistente nova — contrato de trajetórias

- Implementado `scripts/ai-rebuild/acceptance.mts`: schema estrito de trace,
  cenário/revisão, sequência inteira, fatos com fontes, recibos e alegações operacionais.
  Detecta tenant/canal incorreto, fonte ausente, resultado incerto, objeto/operação
  errados, evidência futura, estoque/preço vencidos e envio durante posse humana.
- Implementados 12 testes do verificador; com os três anteriores: 15/15 aprovados
  (1,94 s na execução final), tipagem direcionada aprovada. Traces fabricados testam
  o verificador; NÃO são conversas atendidas pela IA nem prova de qualidade.
- Baseline atualizado e consumidor do planejador de avaliação: dez especificações
  de desenvolvimento, nenhuma holdout, 50 repetições planejadas conservadoramente.
  Contagem estrutural não prova independência/cobertura; `qualityApproved=false`.
- Novo artefato: `.qa-artifacts/ai-rebuild/baseline-1792449486252.json`. Cinco falhas
  anteriores continuam observadas. Sem chamadas pagas ou efeitos externos.
- Decisão técnica/mapeamento/pendências em `AI_REBUILD_STAGE_A_DECISIONS.md`:
  executor TypeScript único, Firestore e outbox existentes; não instalar outra
  plataforma de atendimento. Modelo/versão e orçamento ainda não congelados.
- Trace estrutural não valida sozinho conteúdo livre, política nem estado externo.
  Captura pelo handler inteiro, oráculos específicos e revisão humana continuam
  pendentes. Nenhum gate aprovado, nenhum motor novo ativo, nenhum deploy.

Próxima unidade: ampliar cenários Shopify com positivos/negativos/recuperação e
oráculos específicos, fechar manifesto por consumidor/canal/ação e executar
baseline do handler completo em ambiente isolado sem chamadas pagas. Não iniciar B.

## Unidade implementada nesta retomada

- Manifesto executável C01–C21, com C06/C08 adiadas e demais capacidades não
  verificadas, em `tests/fixtures/ai-rebuild-shopify.mts`.
- Dez especificações de cenários Shopify, quatro falas por cenário, cobrindo os
  IDs necessários em nível de especificação. Isso não significa cobertura completa
  de variantes/negativos nem 100 cenários completos.
- Diagnóstico executável em `scripts/ai-rebuild/baseline.mts` e
  `scripts/verify-ai-rebuild-baseline.mts`, sem modelo, banco ou canal externo.
- Testes de integridade/limites da ferramenta: 3/3 aprovados. Não são testes de
  aceitação do agente nem prova de fluidez.
- Tipagem do pacote QA (`tests/tsconfig.ai-rebuild.json`), lint dos quatro arquivos
  novos de código e conferência de espaços/diff aprovados nesta unidade. Nenhum
  build ou aprovação global da aplicação é inferido dessas verificações.
- Baseline local: `.qa-artifacts/ai-rebuild/baseline-1792448569591.json`.
  Três comportamentos reproduzidos: quinto documento omitido, fim da política
  cortado e resposta de estoque sem link direto. Dois achados por inspeção:
  corte upstream de 1.200 e busca por grupos fixos de sinônimos.
- Hashes confirmam fonte de aplicação inalterada durante o diagnóstico.
- Zero chamadas pagas, zero escrita Shopify, zero mensagens externas.

Esses testes permitem repetir o diagnóstico após corrigir; não exigem que os
defeitos continuem presentes para aprovar a ferramenta de diagnóstico.

## Próxima unidade de trabalho

Completar o manifesto com mapeamento aos consumidores/funções existentes e contratos
de ferramentas, além das operações/canais/conexão piloto necessários. Expandir os
dez cenários para positivos, negativos e recuperação por capacidade, com oráculos
de estado final e executor isolado; ainda não existe a bateria completa de 100.
Acrescentar reprodução do caminho de reescrita e observação/CRM sem efeitos reais.
Depois consolidar a decisão técnica única, acessos e estimativa da bateria paga.
Não iniciar etapa B antes de aprovar A.

## Dependências e limites ainda abertos

- Teto de gasto para modelos reais: não autorizado; apresentar estimativa antes.
- Conexão/loja e contatos/canais de piloto: confirmar identidade e escopo antes de uso.
- Revisor de políticas/conversas e aceite: precisam ser definidos para prova real.
- Gate 2 de entregas anterior e pendências de fundação continuam sem aprovação nova.
- Áudio adiado; atribuição e outros setores não entram silenciosamente nesta rodada.

## Registro desta atualização

Entrega: continuidade agendada, manifesto/especificações e ferramenta de diagnóstico
local implementados e executados. Não é entrega de novo atendimento com IA.
Evidência: baseline acima e resultado dos testes locais. Verificar retomadas para
confirmar que continuam implementação real e preservam escopo.
Sem orçamento ou acesso, trabalhar no que é local e independente; não repetir
avisos idênticos nem criar novos agendamentos para a mesma missão.
