# Fundação B — produtores de automação ainda sem contrato causal completo

Inventário de código local em 20/10/2026. Não é aprovação de gate ou retrato de
produção. Complementa, não substitui, a missão e o progresso contínuos.

## Checkpoint atual de saída de B — 22/10

Consolidação do contrato original da seção 10 do plano, não plano novo nem
aprovação. As unidades abaixo são provas locais por versão; contagem de testes
não substitui aprovação do conjunto. Pendências históricas mais abaixo não devem
ser executadas de novo sem confrontar o progresso posterior.

| Contrato original | Evidência localizada | O que ainda impede o gate |
| --- | --- | --- |
| Entrega e ações, inclusive queda/replay/ACK incerto | Produtores e checkpoints migrados em unidades anteriores; agente de etapa 44/44 + confirmação 3/3; waiting 88/88, tipos/lint 0/0 e 60 fontes registradas. Mensagem enfileirada não é entrega confirmada. | Cobertura remanescente de produtores autorizados, ciclo de vida/retenção dos novos registros e cruzamento integrado das famílias. Não repetir lead sem chatId como se a correção inicial estivesse por fazer. |
| Ordem e progresso dos turnos/filas | Corpus existente: ai-turn-coordinator, ai-rebuild-restart-handler, chat-outbound e agendados. Watchdog: baseline 0/3, paginação/admissão conjunta v4/progresso corrigidos; casos de concorrência e avanço aprovados no integrado 96/98. Duas reprovações adicionais diagnosticadas; confirmação/rota próprias corrigidas e focado 12/12. | Aguardar integrado atual e estáticos (sessão 9104), incluindo ciclo de vida/ACK compartilhado; depois consolidar prova de ordem/restart por consumidor no conjunto. As duas reprovações históricas permanecem registradas; não inferir aprovação B pelos focados. |
| Controle humano | Guardas de posse/revogação/propriedade manual presentes nos cenários já registrados. | Cruzar retomada/filas com exclusividade humana básica no gate B. Operação completa, telas e transferência continuam E; não antecipar critérios de E nesta fase. |
| Identidade básica e isolamento | Origem, tenant, lead/chat/contato e gerações validados por família; corpus omnichannel-identity e chat-state-identity existente. Novo baseline 0/2 puro + 0/2 pelo enqueue real demonstra colisão da chave tenant/chat e sobrescrita do coordenador, em projeto isolado. | Corrigir identidade da coordenação e provar migração/locks/consumidores legados, preservando controle humano e funções existentes. Aguardar fim da sessão 9104 antes de alterar suas dependências. Depois consolidar exclusão/recriação no conjunto. Provas de canal/loja reais ficam nas autorizações e etapas próprias. |

Lote atual: capacidade/concorrência corrigidas e ciclo de vida/retenção em execução
na sessão 9104, com tipos/lint encadeados após runtime. Não duplicar processos ou
editar suas fontes. Próximo: resultado/drift e auditoria integrada dos quatro
contratos. Não reiniciar diagnóstico A, não reduzir critérios e não prolongar B
com capacidades conversacionais pertencentes a C–G.

## Evidência e próxima prioridade

22/10, retomada de espera em validação: baseline real 0/1 (tarefa gravada, nota
posterior perdida após interrupção); focado 1/1 usando runtime novo v3 e recibos
existentes. Não promove legado. Watchdog/worker periódico compartilham ocorrência
do intervalo persistido, com contexto/gerações/SLA/acesso; sender novo usa causa
waiting nos recibos, mantendo mensagens legadas. Integrado ativo 91414, snapshot
57 fontes, sem estáticos desta versão ainda. Casos v2/mistos preparados em arquivo
separado, não executados. Falta hardening do payload waitingSince/plano vazio,
validação de revogações/legado/mensagens, tipos/lint e drift. Não aprovar unidade
ou B pelo focado. Não editar fontes de runtime ativo ou iniciar outro lote igual.

Continuação da unidade: primeiro integrado 77/78 revelou que o enqueue próprio
era confundido com resposta externa pelo horário operacional. Corrigido com
job da mesma causa/regra/cliente/conversa e timestamp exato. Baseline integridade
0/2 para manifesto vazio/tempo adulterado e baseline confirmação final 0/1;
validação do payload/receita e revalidação final transacional implementadas.
Focado v2/integridade 8/9 teve uma expectativa incorreta de estado de outbox,
corrigida para o contrato completed existente, sem reduzir prova de envio único.
Integrado verificado 88/88 em 343,29s, 60 fontes drift=0; estáticos 32321 em
execução. Reprovações preservadas no progresso. Não tratar resumo anterior desta
unidade como aprovação nem repetir o baseline. Ainda sem release/uso real/aceite B.
Estáticos finais encerrados 0/0 (20041), após ajuste somente de anotação do
interceptor de teste; 88/88 funcionais preservados. Snapshot final de 60 fontes e
delta somente nesse teste registrados no progresso. Unidade local encerrada nesse
recorte; não equivale a gate de capacidade/retencão/concorrência ou aprovação B.

22/10, produtor de etapa do agente: alteração e evento/raiz causal agora usam
o mesmo commit pelo projector existente. Hooks retomam pelo consumidor de conversa;
sync de score não faz segunda transição da mesma mensagem. Shopify já usava
orderSource; fallback genérico de outros providers foi preservado fora do recorte.
Baseline 0/2, focado 2/2, integrado inicial 54/55 (reprovação preservada), diagnóstico
5/5. Expiração de lease antes de efeito foi reproduzida separadamente (0/1):
era confundida com revogação e colocava trabalho pendente em revisão. Consumidor
agora interrompe worker expirado e só volta a ready com token ainda próprio,
autoridade atual e canResumeStageHooks/recibos. Contexto revogado e posse de outro
worker continuam bloqueados. Integrado final 44/44 em 190,20s, 55 fontes drift=0;
estáticos iniciais pós-lease types=2/lint=0 por tipagem do interceptor de teste;
final 43836 types=0/lint=0 e repetição dos três casos de lease 3/3. Não inferir que esse defeito sozinho
explique a falha temporal anterior. Nenhum limite/permissão/timeout ampliado.
Próxima unidade após estáticos: retomada interna waiting_for_reply com causa real,
legado/retencão/capacidade e gate integrado B. Inicialização sem etapa anterior
conserva comportamento anterior; não há prova nova para outros providers ou release.

22/10, consumidor social misto: baseline 0/1 provou que v1 readmitia preparo novo
após lease. Novo preparationProtocol=2 é recusado por claim v1 histórico real,
sem alterar posse; atual lê v1/v2, não promove registro v1 e exige v2 para novos
efeitos genéricos. Respostas aceitas mantêm protocolo/identidade. Final social
41/41 e caso misto com retry manual 1/1, tipos/lint 0/0, 50 fontes sem drift.
Logs/reprovações preservados no progresso; sem release. A pendência de handler
social v1 descrita abaixo foi resolvida nesse recorte local, não para todos os
consumidores do sistema. Próximo: fallback genérico de etapa sem causa; depois
retomada interna waiting_for_reply, retenção e auditoria integrada do gate B.

22/10, comentário/seguidor público: service passa claim do log social; ocorrência
social tem autoridade de conta/canal/ator, opt-out, gerações e regras atuais.
Não é mensagem privada do cliente. Executor causal extraído da origem da IA e
reutilizado com callbacks próprios; efeitos internos retomam por recibos, enquanto
respostas ficam no executor social autorizado e DM genérica não é agendada.
Preparos antigos sem marcador ficam em revisão para efeitos genéricos, mantendo
resposta social própria. Final 70/70 (IA/criação/social/legado/respostas), tipos e
lint 0/0, 48 fontes sem drift, tudo local. Histórico de fixture/reprovações no
progresso. Pendência de publicação: consumidor antigo ainda reconhece
preparationProtocol=1; provar recusa/migração do contrato novo antes de liberar.
Depois fallback de etapa sem causa e retomada interna do watchdog. B aberta.

22/10, watchdog waiting_for_reply: catálogo por gatilho paginado em empresa e
global; runtime usa componentes completos em hash e trava legada transacional
para consumidores antigos, sem sobrescrever colisão de outra ocorrência. Registros
antigos claimed/done/error não reabrem. Baseline 0/2, recorte 2/2, global isolado
1/1, legado 3/3 e regressão completa de entrega/inbound 60/60; tipos/lint 0/0,
índice local automations(tenantId,trigger) validado e snapshot de 40 fontes sem
drift. Não publicado. B segue aberta: próximas lacunas concretas são social
message_received sem sourceMessageId, fallback genérico de etapa sem origem e
retomada parcial das ações internas do watchdog; retenção/consumidores mistos
continuam requisitos do gate, sem declarar todas as famílias prontas.

22/10, catálogo inbound e ciclo de vida do sinal: admissão de mensagem pagina
catálogo inteiro, conserva snapshot/updateTime por configuração e limita somente
as 120 regras elegíveis. Baseline 1/2, integrado 2/2 e regressão integral 58/58.
Exclusão/restauração/expurgo da origem de sinal 3/3: raiz/recibos seguem cliente e
conversa, agenda restaurada fica em revisão com prazo original e contexto recriado
não reabre evento. Sem alteração do runtime da lixeira. Tipos/lint 0/0, snapshot
de 36 fontes sem drift; logs/recibos no progresso. B não aprovada/globalmente
paginada: próximo revisar waiting_for_reply/listTenantAutomations(limit120) e
chamadores sem causa, com retenção/compatibilidade mista na saída B. Sem deploy.

22/10, sinal da IA: os dois produtores propagam a mensagem persistida; decisão,
contexto e regras elegíveis são congelados numa ocorrência causal do jobs, usando
runner/recibos/quota existentes. Repetição/concorrência não duplica tarefa; edição
humana, pausa e revogação prevalecem. Sem mensagem imediata ou adiada nesse
gatilho e sem inferir aprendizado/conversão da resposta da IA. Baseline 0/4,
pausa 0/1 e política/contadores 0/2 preservados; final 17/17, tipos com testes e
lint da implementação aprovados; detalhes/limites de versão no progresso.
Snapshot de 33 fontes sem drift. Não repetir essa migração como próximo passo:
validar ciclo de exclusão/restauração/retenção da origem e paginação das admissões
inbound, depois auditar gate B. Sem publicação/modelo real/uso real ou aceite B.

22/10, conversa/ingresso/finance_paid: checkpoints e recibos estendidos aos três
consumidores existentes, sem copiar permissões ou inventar hooks. Conversa mantém
aprendizado/trilha autorizados; criação/pagamento/billing só automations. Retoma
efeitos restantes e posse expirada com provas originais; revogação exige revisão.
Baseline 0/5, integrado 14/14, compatibilidade integral 89/89 (inclui os 14), lint
e tipos escopados aprovados. npm run typecheck completo aprovado após regeneração
oficial next typegen, sem alteração de tsconfigs ou edição manual de next-env;
diagnósticos anteriores preservados. Snapshot de 28 fontes sem drift. Sem release
ou uso real. Próxima unidade: identidade causal e replay de ai_next_action nos
dois chamadores do agente; não reativar envio nem presumir aprendizado a partir
da própria IA. Legado/retenção/capacidade/migração e gates B permanecem abertos.

22/10, etapa manual: consumidor reutiliza runner/checkpoints e recibos, com plano
restrito a automations e fingerprint da origem manual. Retoma efeitos restantes
com decisão/evento/permissão/ator/funil revalidados; preserva tarefas editadas,
propriedade manual e legado. Baseline 0/2, integrado 27/27, compatibilidade de
outras origens 27/27 e rotas autenticadas 5/5. Lint e tipos das fontes alteradas
com dependências aprovados; checagem geral reprovou arquivo gerado concorrente
next-inbox/dev/types/routes.d.ts, preservado sem alterar config/reduzir critérios.
Snapshot de 24 fontes sem drift, logs/recibos no progresso. Sem publicação/uso
real. Não aprova hooks manuais executados fora dessa ocorrência nem fecha B.
Próxima unidade: retomada causal de conversa/intake/finance_paid; seguir depois
legado, retenção/capacidade e gates, sem repetir a migração da automação manual.

22/10, continuação: retomada do próprio budget_approved aprovada localmente para
manifestos novos hook v2 com approvalReceiptRecoveryProtocol=1 e ações cobertas
pelos recibos existentes. Não promove manifesto v1/antigo nem reabre elegibilidade;
mantém origem/acesso/decisão humana, quota, agenda e teto de três tentativas.
Baseline 0/4; integrado inicial 8/9 preservado (ordem da fixture agendada corrigida
explicitamente); final 10/10 e compatibilidade integral 121/121. Tipos/lint 0/0,
snapshot de 22 fontes sem drift. Sem publicação/modelo pago/uso real; B aberta.
Próxima unidade: automação de mudança manual de etapa interrompida, mantendo o
escopo restrito da ocorrência manual e reutilizando checkpoints/recibos existentes.
Conversa/intake/finance_paid e gates B continuam pendentes.

22/10, recuperação de runs por recibos implementada para pedido, etapa financeira
e etapa de proposta em admissões novas hook v2. Reutiliza efeitos internos/CRM,
outbox e agendados existentes, com três tentativas e autoridade da origem;
legado v1 continua em conciliação. Aprovação preserva candidatas anteriores à
primeira ação de etapa, avalia condições após as próprias mutações e fecha o
manifesto sem ampliar elegibilidade. Recibo removido não é reconstruído por
suposição; edição humana de efeitos com recibo íntegro é preservada.
Consulta transacional paginada substitui corte em 121 configurações totais,
mantendo teto de 120 planos/candidatas e lease original. Validação desta correção:
15/15 candidatas, 18/18 retomada pedido/financeiro e 106/106 proposta integral,
tipos/lint aprovados; snapshot final de 21 fontes sem drift. Log amplo anterior
interrompido com duas falhas foi preservado e não contado como aprovado.
Detalhes, versões e recibos no progresso contínuo. Sem publicação/prova real.
Próxima unidade: retomada parcial do próprio budget_approved, ainda conservadora;
não repetir o trabalho já concluído de etapa. Demais produtores, capacidade,
retenção, migração/concorrência e gates B continuam pendentes antes de C.

21/10, checkpoints compartilhados: executor do pedido reutilizado pela etapa
financeira e proposta com autoridades próprias. Aprovação tem fase separada,
inclusive com etapa manual preservada; sua elegibilidade é congelada ao terminar
as automações de etapa, antes de aprendizado/trilha. Novo/alterado/habilitado
depois não amplia o evento antigo; manifesto removido exige revisão, sem congelar
prematuramente condições que dependem das próprias mudanças de CRM da etapa.
Baseline 0/4, integrado 8/8 e proteções 17/17; ampla 350/350 no snapshot anterior
ao ajuste final de elegibilidade; fronteira baseline 1/5, integrado 7/7 e revisão
final 25/25, tipos/lint finais aprovados e snapshot de 17 arquivos sem drift.
Falha 0/27 de preparo/limpeza por queda dos emuladores foi preservada como
incidente local; repetição só após prontidão comprovada. Logs/recibos no progresso.
Não repetir migração dessas três origens como próxima tarefa: reproduzir runs
parciais e conciliar cada ação por provas suficientes, mantendo elegibilidade
congelada e controle humano; não reabrir legado ou efeitos externos incertos.
Outros consumidores, retenção, paginação/capacidade e gates B continuam abertos.
Capacidade implementada/testada localmente; sem publicação ou prova em uso real.

21/10, hooks parciais de pedido: checkpoints versionados no próprio job mantêm
automação/conversão confirmadas e permitem retomar aprendizado/trilha idempotentes
com autoridade atual, inclusive após perda do executor. Trilha guarda contagem,
audit causal e recibo no mesmo commit. Ausência/divergência de provas, controle
humano ou plano corrompido bloqueiam; automação ou conversão iniciada sem resultado
conclusivo continua em conciliação. Baseline 0/2 e plano corrompido 0/1 preservados;
ampla 139/139, final 13/13 e tipos/lint finais aprovados. Hashes/logs no progresso. Ainda falta
adotar checkpoints nos outros consumidores e provar recuperação dos próprios runs
parciais de automação, legado, retenção, paginação e capacidade antes de B.

21/10, hook de resultado comercial: baseline 0/2 reproduziu perda dos sinais
após commit do outcome. Plano mínimo no próprio outcome permite concluir o
hook com evidência original congelada e IDs idempotentes, sem contagem dupla,
promoção do legado ou aprovação automática. Final 5/5 e consumidor de etapa
Shopify 6/6; tipos do escopo/lint aprovados, hashes/logs no progresso. Isso não
reabre raízes com ações/CAPI incertos: retomada integral exige reconciliar seus
recibos e autoridade. Sem publicação ou aceite de B.

21/10, ingresso Asaas com invoice sem leadId: vínculo único por cobrança e
empresa/valor/prova verificados, pagamento, audit e etapa agora compartilham
transação. Workflow stage_only preserva apenas os hooks de etapa que esse
ingresso já executava; não introduz finance_paid. Repetição, reversão, legado
pago, vínculo ambíguo/estrangeiro e revogações cobertos na ampla 143/144; o caso
restante de assinatura foi corrigido para exigir retomada humana após cancelled,
sem reverter a proteção. Final 45/45 e lint aprovados, snapshot sem drift;
checagem geral de tipos reprovou em dois erros do arquivo de mídia
message-media-source.ts:87/93, preservado por ser trabalho concorrente.
Removido fallback de atualização/audit/etapa diretos do webhook após migração.
Não aprova B inteira, publicação ou qualidade conversacional. Prosseguir por
cobertura de ingressos e hooks parciais/legado/retenção/concorrência/capacidade.

21/10, ocorrência manual: commitManualLeadPatch agora grava decisão/ownership/
audit/raiz juntos; rotas de perfil/etapa e periódico usam o executor causal
existente com origem manual própria, autorização por rota e revisão antes de
efeitos/entrega. Tarefas/recibos, outbox e agenda reutilizados, sem nova fila.
Ampla 206/206 sequencial e integração corrente 38/38; tipos/lint atuais aprovados,
hashes/logs no progresso. Ampla anterior 199/201 reprovada em dois workers frios
sob concorrência/estático permanece registrada, sem elevar os 25s. Não aprova
capacidade sob carga, publicação, hooks antigos ou a família inteira.
Próxima reprodução: criação por recordInboundLead após commit e antes do hook,
incluindo opt-out explícito, usando identidade do evento existente. Não repetir
a implementação manual nem ressuscitar agendamentos/raízes em conciliação.

21/10, legado: manifestos antigos de lead passam a absorver jobs omitidos em
páginas transacionais, preservando IDs/recibos e mantendo pendentes em conciliação.
Retomada reconhece sua própria restauração e recusa alterações humanas ou novas
execuções. Escritas usam criação ou versão esperada, sem sobrescrita cega.
Específico 15/15 e ampla 90/90, tipos/lint aprovados; logs/hashes no progresso.
Sem migração real/publicação. Não repetir reprodução do mesmo legado como
próxima tarefa: implementar causa durável da mudança manual de etapa, preservando
decisão humana/versão/acesso. Recuperação parcial de hooks e fronteiras de
retenção/ingresso continuam pendentes.

21/10, confirmação tardia: baseline 0/1 comprovou recriação de chat após exclusão
durante chamada ao provedor fictício. Dispatcher agora persiste confirmação,
resumo e pausa em transação; conversa ausente só recebe recibo na mensagem/job
de UM manifesto correspondente, com tenant/chat/ID e fence validados. Sem nova
fila. Ampla inicial 77/80; fixtures de recibo sem chat preparadas com conversa
real do tenant, asserções intactas; repetição 80/80, tipos/lint aprovados. Não
equivale a publicação, migração ou qualidade de atendimento. Próxima reprodução:
manifesto histórico de lead sem raiz ready/recibos; depois tombstones/replay de
ingresso e demais famílias. Não religar trabalho legado sem prova.

21/10, unidade seguinte: entrega restaurada da outbox fica em revisão, com
mensagem coerente e recibos terminais preservados. Baseline 1/4; regressão
27/27, tipos/lint aprovados. Reenvio explícito e restauração durante chamada ao
provedor fictício testados sem repetição. Próxima reprodução: excluir DURANTE
envio sem restaurar, para verificar se a confirmação tardia recria dados;
depois manifests históricos de lead sem raízes, tombstones e demais produtores.
Essa aprovação não cobre a lixeira inteira nem a recuperação integral de hooks.

21/10: raízes e recibos de jobs por lead sem chatId agora acompanham o manifesto
da lixeira; restauração conserva recibos terminais e coloca jobs não terminais
em conciliação. Baseline correto 0/2; regressão 8/8, tipos/lint aprovados. Cobertura
local restrita, não aprovação de retenção. Próxima reprodução: entrega já aceita
na outbox após excluir/restaurar e manifests antigos sem raízes. Tombstones,
replay de ingresso e corridas em voo ainda pendentes; não migrar dados reais.

Revisão no chat de destino: erro transitório do pedido corrigido localmente na
admissão/pré-claim e isolado por item no lote, com contador failed. Arquivo de
regressão 83/83 e classificador 2/2; tipos/lint aprovados. Não repetir a leitura
histórica de catch amplo abaixo como se ainda descrevesse esses pontos do pedido.
Recuperação integral de hooks parciais continua pendente. Próxima reprodução:
exclusão/restauração/invalidação de raízes e recibos por lead sem chatId; não
alterar/limpar dados reais. Revisão geral em AI_ATTENDANCE_RESUMPTION_AUDIT_2026-10-20.md.

`executeImmediateAction` em `lib/server/automations.ts` usa outbox com fonte para
mensagem recebida identificada, proposta aprovada com claim e, na unidade local
atual, mensagens imediatas dos hooks de etapa com origem proposta/pedido. Depois desses ramos
ainda existe chamada direta `sendTenantChatText`, sem identidade da ocorrência.
Não remover esse caminho simplesmente desligando funcionalidades prometidas.

Prioridade seguinte: concluir o contrato de **lead_stage_changed chamado pelos
hooks já protegidos de proposta/pedido**. A integração inicial da mensagem imediata
passou localmente (específicos 26/26, ampla 349/349), não fecha a família:
Recibos imediatos internos/CRM e prova da própria mudança passaram localmente na
unidade seguinte: ampla 376/376, zero falhas/skips, tipos/lint aprovados.
Agendados causais agora aprovados localmente na ampla 412/412, tipos/lint e
worker frio sob 25s. Houve ampla anterior 411/412 reprovada (timeout); histórico
e limites no progresso, sem somar execuções. Recuperação integral segura da raiz/hook continua
pendente. Depois, demais produtores
de mudança de etapa, criação e financeiro. Antes de implementar cada lacuna,
reproduzir com fixtures Shopify e transporte externo bloqueado.

Atualização de 21/10 — observação de assinatura por contato sem invoice ligado:
fato/audit/etapa e pendência atômicos com autoridade asaas_billing_lead_event,
vínculo mínimo no ledger e executor financeStage existente. Projeção de assinatura
continua sem leadId; não inventar invoice comercial ou finance_paid. Valor é
do evento autenticado de plataforma, sem inventar cotação da compra do cliente.
Reativação redundante não desfaz cancelamento; reativação de contrato verifica
fonte/permissão atual e grava tenant/configuração/recibo atomicamente. Histórico
de cobranças é paginado integralmente, sem ignorar atraso além de 200 registros.
Inicial 116/118 preservada (dois defeitos encontrados), final corrigido 42/42 e
revisão de cobertura 15/15, tipos/lint aprovados; detalhes/limites/hashes no progresso. Permanecem
ingressos sem vínculo esperado, ordem global/lifecycle de billing e demais gates.

Atualização de 21/10 — notificação de billing com invoice/cliente vinculado:
contrato e assinatura passam pelo executor existente com origem billing e recibo
asaas_billing_paid_occurrence, sem se passarem por compra comercial. Vínculo de
empresa/invoice/assinatura/flag e propósito revalidado, incluindo conflito de
propósito entre confirmações. Removido emissor direto financeiro após prova de
compatibilidade; integração inicial corrigida 3/3, ampla 100/100 e final 19/19,
tipos/lint aprovados localmente.
Logs, falhas preservadas e limites no progresso. Ainda pendentes: plataforma
sem invoice com cliente vinculado, lifecycle/ordem global de billing, cobertura
integral/paginação e demais gates de B. Não inferir prova de recuperação de
reativação externa, conversões ou todos os hooks a partir desses recibos.

Atualização de 21/10 — criação por agência: POST leads/create usa ocorrência
atômica com cliente/evento e autoridade agency_actor, preservando fonte comercial.
Revalida papel, acesso/capacidade, módulo, responsável e produtor antes do efeito.
ACK perdido, repetição e concorrência cobertos; alterações de legado não criam
aprovação retroativa. Compatibilidade das cinco famílias 65/65; final da agência
19/19, tipos/lint aprovados e hashes sem drift, tudo local.
A pendência da rota de agência na tabela histórica abaixo foi atendida nesse
recorte; perfil auxiliar/conversão/trilha e gates completos continuam abertos.

Atualização de 21/10 — ordem comercial Asaas: implementada para invoice e
cobrança diretamente no cliente, com índice persistente por cobrança, reversão
invalidando efeitos pendentes e conciliação em vínculos/conteúdo/horários
ambíguos. Pagamento antigo não sobrescreve estorno novo; repetição não desfaz
correção humana. Relógio civil sem fuso independe do servidor e não se compara
cegamente a instante com offset. Compatibilidade inicial 82/82; revisão final
do relógio/protocolo 67/67, tipos/lint aprovados. Provas/logs/hashes no progresso.
A pendência de ordem/reversões na linha financeira abaixo foi atendida nesse
recorte local; notificação legada de assinatura com lead, rota de agência,
ingressos integrais, partial hooks, retenção/capacidade e gates seguem abertos.
Não há publicação, chamadas pagas nem qualidade conversacional comprovada.

Tabela histórica da evolução por família: confrontar cada pendência com as
unidades posteriores e com o checkpoint atual acima antes de tratá-la como aberta.

| Família | Evidência na revisão histórica | Contrato ainda necessário naquela revisão |
| --- | --- | --- |
| Mudança de etapa por proposta/pedido | Claim causal propagado a runLeadAutomations; planos/eligibilidade inclusive vazia, quota e marcador por automação no job de origem. Mensagem imediata e sete efeitos internos/CRM com baseline/recibo; manifesto/ID/prazo/cota dos agendados revalidados no claim/efeito/outbox. Ampla atual 412/412, tipos/lint e processo frio aprovados localmente; fila Shopify vazia não carrega handler completo e eventos reais de fixture continuam processados. | Recuperação integral do hook, legado, ordem/capacidade e retenção continuam pendentes. Recibo por ação não autoriza reabrir raiz parcialmente executada com outros hooks legados; sem aprovação da família ou publicação. |
| Mudança manual de etapa | Commit grava lead/propriedade/evento/raiz e retorna identidades. Duas rotas e periódico integrados; origem manual mantém capacidade exigida, autoria, versão do funil e decisão travada. Efeitos usam recibo, outbox e agenda existentes. Ampla 206/206 e integração atual 38/38 locais; tipos/lint aprovados. | Hooks de aprendizado/trilha/conversão/dossiê ainda não têm essa prova integral. Inventariar outras entradas manuais e concluir retomada parcial/legado/retenção/capacidade antes do gate; nenhum uso real/publicação aprovado. |
| Criação por intake | Ocorrência e evento de criação gravados atomicamente com lead/identidades; periódico retoma lead_created com autorização própria, opt-out original e recibos/outbox/agenda existentes. Específicos e compatibilidade manual 34/34; worker antigo isolado 1/1. Tipos/lint aprovados, runtime sem drift, logs/hashes no progresso. | Próxima entrada: criação manual autenticada tenant/leads, com causa/autoria/permissão próprias antes do efeito. Demais hooks de perfil/conversão/trilha não recebem prova integral deste recibo; não reabrir conciliação cegamente. Sem publicação/uso real. |
| Criação por outras entradas | POST tenant/leads migrado: ocorrência/audit/cliente atômicos com autoridade humana própria no executor de criação. Compatibilidade 29/29, tipos/lint aprovados; sem drift. Perfil atendimento sem responsável preservado, revogação e reatribuição testadas. | MCP apply create_lead migrado: draft/aprovação/cliente/audit/ocorrência atômicos, recibo de repetição, hash revisado e revalidação do autor/revisor ou política. Compatibilidade 49/49, tipos/lint aprovados, snapshot sem drift. Formulários/chat já usam recordInboundLead migrado (inspeção de código; integração completa pendente). Rota leads/create é interna de agência e continua pendente com sua autorização própria; perfil auxiliar e demais hooks seguem separados. |
| Criação social Meta | Webhook e sync Messenger optam explicitamente por ocorrência atômica com identidade/cliente/evento. Executor existente revalida canal/conta/perfil e aguarda conversa; histórico sem opt-in não vira nova automação. Compatibilidade final 28/28, identidade legada 1/1, tipos/lint aprovados e snapshot sem drift; logs no progresso. | Provar produtores inteiros e entrega social de ponta a ponta; gates de retenção/concorrência/capacidade permanecem abertos. Não modificar recovery histórico para disparar campanhas. |
| Financeiro pago | PATCH tenant/finance agora grava lançamento/audit/ocorrência finance_paid atomicamente com CAS. Periódico e efeitos revalidam fonte, status, valor, método/data, cliente, ator, módulo e manage_commercial; usa recibos/outbox/agenda existentes. Compatibilidade 27/27, tipos/lint e snapshot sem drift. | Etapa agora tem decisão/audit/ownership/ocorrência atômicos com pagamento; executor causal financeStage recupera hooks e preserva controle humano. Compatibilidade 41/41, tipos/lint aprovados. Asaas com invoice comercial vinculado agora grava fato/audit/etapa/ocorrências juntos, após prova autenticada mínima; só consome após ledger completo, sem reativar assinatura Altum por compra comercial. Regressão inicial 45/45 e final Asaas/checkout 28/28, tipos/lint aprovados. Cobrança sem invoice agora usa fato/audit/etapa atômicos e executor financeStage, com recibo próprio e sem inventar finance_paid. Compatibilidade 61/61, tipos/lint e snapshot sem drift. Próximo: ordem/reversões e conciliação/vínculos; notificação legada de assinatura com lead segue pendente, além de paginação e partial hooks. Nenhum pagamento real autorizado. |
| Sinal de IA | Dois produtores propagam mensagem original; ocorrência causal congela decisão/contexto/planos e reutiliza recibos de ações. Final 17/17 cobre replay, concorrência, pausa/posse humana, regra/mensagem/recibo, transporte, contadores e agenda interna. Mensagem recusada antes de agendar. | Provar ciclo de exclusão/restauração/retenção da origem; concluir migração/capacidade e gates B. Não usar resposta da IA como aprendizado/conversão nem inferir publicação ou prova em uso. |

## O que não deve ser inferido deste inventário

As observações de código abaixo pertencem à revisão histórica. Correções e
validações posteriores estão no progresso; não são novos pedidos de reprodução.

- Nem todo produtor está quebrado da mesma maneira. Leitura de código local não
  prova que uma mensagem duplicou em produção; cada alteração exige reprodução.
- `processOrderPipelineTransition` ainda tem catch amplo no pré-claim. A correção
  de classificação de proposta/inbound não comprova o mesmo contrato no pedido;
  reproduzir indisponibilidade também ali ao migrar esse consumidor. Não promover
  status de conciliação antiga para ready por conta desta leitura.
  Também há catch amplo do funil no commitOrderPipelineTransition (antes da
  criação da origem), ainda sem teste de indisponibilidade nessa fronteira.
- stage-effects também chama aprendizado/trilha/conversões. Recibo de automação
  não comprova que esses demais hooks são atômicos ou retomáveis. Preservar a trilha
  separada de atribuição e não enviar CAPI real para testar o motor.
- Lacuna de agendados reproduzida (baseline 0/3): execução após excluir origem e
  prazo reiniciado. Unidade atual substitui esse caminho apenas para as duas
  famílias protegidas, sem apagar agendamentos legados nem promover seus dados.
- Leitura adicional de tenant-data-deletion.ts: deleteTenantChat reúne jobs por
  chatId, mas deleteTenantLead lista lead_notes/tasks/events/appointments/budgets/
  finance_entries, sem jobs por leadId. Raízes, recibos e internos chatId=null não
  estão comprovados no manifesto da lixeira. Reproduzir exclusão/restauração e
  definir invalidação/retomada antes de alterar, sem apagar dados reais. Esta
  leitura não comprova reaparição/execução em produção nem autoriza limpeza.
- `waiting_for_reply`, mensagem recebida, Shopify e proposta têm provas parciais
  anteriores; ainda precisam do gate integrado, retenção, migração e reconciliação.
- Não promover planos antigos sem prova de efeito. Não reabrir raiz parcialmente
  executada para repetição cega; um envio incerto exige conciliação.
- O inventário registra agora a integração local inicial descrita acima; não é
  aprovação de todos os produtores. Nenhum deploy, acesso à loja, envio a cliente
  ou nova capacidade conversacional demonstrada.

## Fontes inspecionadas

- lib/server/automations.ts: tipos/contexto e executeImmediateAction.
- lib/server/crm/stage-effects.ts: automate e beforeEffect.
- lib/server/crm/stage-transition.ts: mutação não vinculada a pedido e hooks.
- lib/server/crm/proposal-mutation.ts e lib/server/crm/manual-update.ts.
- lib/server/lead-intake.ts: commit e tarefas pós-commit.
- app/api/tenant/[tenantId]/leads/[leadId]/route.ts.
- app/api/tenant/[tenantId]/finance/[financeId]/route.ts.
- Demais chamadores identificados por busca de runLeadAutomations, a revisar
  integralmente antes de mudar cada consumidor. Admin/auth/site público fora.
