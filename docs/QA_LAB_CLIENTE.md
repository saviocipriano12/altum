# Altum QA Lab — primeiro ciclo

## Resposta social por comentario — 19/10/2026

Nova social-reply-delivery.emulator cobre publico IG/Facebook, privado por comentario,
concorrencia, texto aceito, opt-out/regra/conta/autor/tenant alterados, claim vivo/
expirado, commit nao aceito/perdido, recibo perdido, job removido, timestamp novo,
read antecipado, retry seguro e processo filho exit 71 apos aceite ficticio nos dois
modos. Fluxo completo handleMetaSocialEvent com regra e replay executado no emulador.
O teste nao chama modelo e nao representa conversa de IA completa com cliente real.

Historico desta retomada: 17/17 (5471); 22/22 em 35,61 s (75130); 73/73 em
119,52 s (30874), social+campanhas+aceite atomico+IA social+crashes; apos ledger/retry
40/40 em 62,07 s (28935), 29 sociais e 11 aceite atomico/IA social. Casos finais
de recibos divergentes acrescentados depois; execucao final registrada abaixo.
Regressao comum: 72/72 em 66,33 s (5014), MCP/handoff/ecommerce/voz/materiais.
Contratos sociais/Shopify/campanha: 31/31 em 1,98 s.
Execucao social FINAL apos todos os ajustes: 31/31 em 66,55 s (31467), incluindo
ledger independente e recusa de recibo divergente mesmo com job completed. Tipos
finais aprovados (21926), lint zero erros/avisos e diff --check aprovado (66399).

Credenciais removidas do processo de teste, projeto demo e Firestore local fixos;
fetch fail-closed com Meta ficticia. Limpeza restrita aos documentos do tenant QA
desta suite e seus filhos. Sem deploy/indices publicados/build global/HTTP atualizado
ou UI autenticada. Tipos inicialmente apontaram nulabilidade e foram corrigidos;
as execucoes finais, nao as anteriores ao ajuste, devem sustentar a aprovacao.
Gate 2 aberto: send_message de automations.ts ainda direto, inclusive quando o
gatilho vem deste fluxo social. Nao afirmar idempotencia ponta a ponta completa.

## Campanha por destinatario: outbox e recibo vinculados — 19/10/2026

Atualiza a limitacao historica abaixo: envio individual agora foi migrado.
Processos antigos foram conferidos ausentes antes de nova execucao. Firestore e
Storage locais ativos; variaveis de credenciais removidas do processo de testes,
provedores ficticios e downloads externos bloqueados fora dos destinos de QA.

- campaign-recipient-delivery: 26 casos, texto/template/midia/header, concorrencia,
  ACK perdido/sem ID, opt-out/telefone/canal alterados, pausa/horario, reserva do
  mesmo contato entre numeros, social preservado, copia privada reutilizada,
  revogacao durante preparo e na barreira, legacy/Evolution, read antecipado,
  snapshot, contadores, lote pendente e exit 71 apos aceite ficticio.
- campaign-delivery-acknowledgement: 4 casos de recibo/binding/tenant.
- campaign-run-admission: 20 casos, incluindo 500 lotes e finalizacao.
- Total 50/50 em 47,02 s (10929). Contratos de delegacao/ID real, cache, operacao
  e escopo IA: 33/33 em 2,19 s. Lint e tipos direcionados aprovados (19263).
- Regressao worker comum: 83/83 em 55,73 s (34599), aceite atomico, MCP,
  handoff/alertas, ecommerce, voz, materiais e texto social IA.
- Compatibilidade Shopify: 40/40 em 1,52 s (43520), conexao/catalogo/OAuth.
  Nao substitui homologacao com loja real ou conversa completa do tenant.

Sem deploy, indices publicados, build global, HTTP atualizado ou UI autenticada.
Nao usar antigo snapshot HTTP como evidencia deste worker. Gate 2 aberto;
social/service ainda possui envios diretos e retry inseguro, recuperacao integral
de filas/resumos e tratamento de artefatos orfaos permanecem nos respectivos gates.

## Campanhas: admissao idempotente e staging recuperavel — 19/10/2026

Nova suite campaign-run-admission testa run unico, chaves concorrentes, snapshot,
perda do commit, create perdido/nunca aceito, ativacao parcial sem regressao,
pausa, versao alterada, isolamento, 500 lotes, enqueue publico, lista vazia,
manifesto/run alterados, antecipacao e escopo do processador. Cache puro verifica
chave persistente, isolamento, storage indisponivel e confirmacao nao removivel.

Regressao 54/54 (32,22 s, 34814), com recibos de campanha, agendamento e contratos
operacionais. Depois dos ajustes finais: enqueue/contrato 3/3 e cache 4/4 (65266).
Fechamento do run 1/1 (8,50 s): staging/paused impedem conclusao e activeRunId so
e limpo apos tres lotes terminarem. Destinatarios ausentes, sem envio nesse teste;
nao comprova resumo comercial de destinatario nem entrega idempotente individual.
Tipos/lint finais aprovados (21047). Nenhum envio/provedor real; fetch externo
bloqueado, Firestore local. Sem deploy/build global, HTTP autenticado ou UI.

Gate 2 aberto. A entrega por destinatario AINDA nao foi migrada: dispatch continua
direto, receipt delivery aleatoria e conteudo pode vir da configuracao atual.
Reuso de chat por leadId pode alterar canal de conversa social. Proxima retomada
deve tratar texto/template/midia e identidade canonica, nao considerar preparo
como conclusao da idempotencia de campanha. Legado sem chave, claims perdidos e
resumos/contadores exigem migracao/recuperacao posterior devidamente comprovada.

## Mensagens MCP aprovadas: outbox e recibo atomicos — 19/10/2026

Resposta e inicio WhatsApp passam pelo mesmo helper; batch aceita rascunho,
mensagem/job e conversa juntos. Transacao pre-provedor revalida aprovacao/destino.
Recibo e auditoria aplicados juntos, sem segundo envio/evento ao repetir.
77/77 regressao (52,31 s, 55340); 99/99 contratos MCP/operacao/Shopify (34,10 s,
96274). MCP ampliado 22/22 (25,44 s, 86445), com WhatsApp/template, site,
Instagram e Messenger, CAS/commit perdido, revogacao, perda de recibo e child
process exit 71 apos aceite ficticio. Tipos/lint direcionados aprovados (83727).
Repeticao final MCP apos guard de tipo: 22/22 (29,30 s, 43969). Identificador
de rascunho agora e rejeitado se exceder limite; nao e truncado para outra aprovacao.
Contrato final da rota: 1/1 (12698); tipos/lint finais aprovados (24148).

Primeira versao do teste de corrida aguardava escrita bloqueada pela transacao
que ela mesma mantinha aberta. Foi corrigida para revogar apos preflights antes
da leitura transacional da barreira; nao se usa timeout como prova de entrega.
Nenhum processo precisou ser encerrado manualmente; o teste anterior terminou.

Sem provedor real, deploy/build global, HTTP autenticado da rota apply ou UI.
Resolvedor canonico do inicio ligado por contrato estatico, nao por homologacao
de primeira conversa completa. Gate 2 aberto: campanhas/social e homologacao
seguem pendentes; resumos de aprovacao e revisao de legados exigem reconciliacao.

## Acao ecommerce: entrega compartilhada manual/automatica — 19/10/2026

Nova suite ecommerce-action-delivery.emulator (14 casos) cobre concorrencia,
perda de ack, HTTP sem ID, conteudo/telefone alterados, escopo estrangeiro, perda
de ack do vinculo antes do enqueue, recuperacao de acao com job ja concluido,
claim legado, pendencia sem consumir tentativas, chat legado/social, remocao da
conversa, perda de propriedade e lead estrangeiro. Contrato estatico liga as duas
entradas ao helper; nao substitui HTTP autenticado da rota manual.

Regressao: 69/69 (16,78 s, 89323), ecommerce/politica/templates/Shopify; guard
final de revisao do claim legado reexecutado 1/1 (8,04 s). Tipos/lint direcionados
aprovados (59764), sem build global. Provedor simulado fail-closed e Firestore
local; nenhum envio externo real. Crash comum de template possui evidencia
anterior, nao foi refeito com processo ecommerce completo nesta rodada.

Indice chats tenantId/contactPhone preparado, nao implantado. Sem deploy/HTTP
atual/UI. Gate 2 aberto; campanhas, MCP apply e automacoes sociais sao as entradas
seguintes. Resumo da acao e reprocessamento confirmado entram na fase 3 apenas
apos o gate 2; tasks pending historicas ainda exigem auditoria de migracao.

## Gateway legado e texto primario site_chat — 19/10/2026

Materiais legacy_gateway usam URL assinada da copia imutavel geracional; Meta e
Evolution mantem buffers, site nao assina. Voz legada nao suportada e classificada
antes do envio, permitindo texto duravel no mesmo canal. Pausa humana durante
preparo continua bloqueando voz/fallback. Texto primario site usa outbox.

Regressao 57/57 (87,11 s, 11846): voz, materiais, texto, social, audio manual,
integridade e crash recovery. Depois dos ajustes finais de testes: 2/2 assinatura
falha/site (12,50 s, 44973), 52/52 voz/compositor/Shopify (4,83 s). Tipos e lint
direcionados finais aprovados (19665); dois avisos preexistentes no agente em
93792. Nenhuma chamada externa real, build global, deploy, HTTP atual ou UI.

Fase 2 aberta. Proximas entradas para auditoria: campanhas, ecommerce-agent,
rascunhos MCP apply e automacoes social/service; nao inferir confiabilidade
integral pela migracao do agente principal. Snapshot/HTTP anteriores sao obsoletos.

## Handoff e Evolution: estado atual local — 19/10/2026

Confirmacao de handoff e alertas migrados para fila; aceite da pausa junto com
mensagem/job, excecao restrita revogavel e alerta interno sem historico/CRM/tail.
Ver gate atual, que substitui as pendencias historicas das secoes abaixo.

Evolution corrigido para nao tentar outro POST apos timeout/rede/5xx ou erro
ambiguo. Fallback legado so apos rejeicao explicita de schema 400/422 sem ID.
Verificacao atual: evolution-text-delivery + messaging-provider 32/32 (3,50 s),
ai-text-delivery emulador 10/10 (16,86 s, 39056), seis suites puras
voz/compositor/Shopify 52/52 (3,63 s). Fetch externo ficticio fail-closed e
Firestore local; nenhum envio real ou chamada LLM/TTS nesta rodada.
Handoff reexecutado: 12/12 (17,35 s, 78698). Typecheck direcionado e lint dos
arquivos alterados aprovados (17844), sem build global do checkout compartilhado.

Sem deploy, novo snapshot HTTP ou homologacao visual. Gate 2 segue aberto;
compatibilidade do gateway legado e texto primario site_chat sao os proximos
defeitos concretos a corrigir antes de concluir inventario/homologacao.

## Materiais da base migrados localmente — 19/10/2026

ai_knowledge_media aceita antes de preparo/envio, copia fonte autorizada para
Storage privado e verifica hash/geracao/tamanho/MIME na retomada. WhatsApp envia
por upload/media ID; Instagram/Messenger mantem legenda e anexo em tarefas
ordenadas; site nao faz envio externo nem precisa de assinatura. Incerteza nao
vira outro envio/fallback. DNS e HTTP(S) de download externo sao simulados e
testados contra redes internas, redirects e excesso de bytes.
Regressao final: 67/67 (79,75 s, 4028), incluindo processo filho encerrado apos
aceite ficticio do material. Seis suites voz/compositor/Shopify: 52/52 (3,32 s).
Tipos/lint aprovados (67985), zero erros e dois avisos preexistentes no agente.
Sem Meta/TTS/download externo real, deploy, novo snapshot ou prova visual.
Snapshot 1792423979159/HTTP anteriores continuam obsoletos. Fase 2 aberta;
proximos caminhos reais: confirmacao ao cliente e alertas de handoff.

## Voz gerada pela IA migrada localmente — 19/10/2026

Aceite de job/mensagem antes de TTS; par OGG/Opus + MP3 salvo/vinculado antes do
envio, com escopo/hash/geracao conferidos ao retomar. Fallback apenas em falha de
sintese comprovada; resultado incerto nao pode enviar outro texto/audio.
Suite ai-voice-delivery e crash fixture incluindo ai_voice; regressao final
50/50 em 86,67 s (14425), incluindo HTTP sem message ID incerto. Seis suites
puras/contratos de voz/compositor/Shopify: 52/52 em 5,92 s.
TTS/Meta simulados, ffmpeg e emuladores reais. Tipos finais aprovados, lint
zero erros e dois avisos preexistentes (18456). Snapshot 1792423979159/HTTP antigos nao
incluem esta migracao. Nenhum deploy, teste visual ou consumo de API real.
Fase 2 aberta; materiais e handoff continuam pendentes. Detalhes na auditoria.

## Barreira duravel e audio manual — 19/10/2026

Worker atual ja nao corresponde ao snapshot 1792423979159: outbox/enqueue/dispatch
mudaram apos os nove HTTP anteriores. Nao reutilizar o resultado para homologa-lo.
Barreira de provedor agora e persistida antes de enviar; encerramento abrupto do
processo e recuperado sem reenvio. Recuperacao segura exige prova vinculada ao lease,
incluindo convivencia de versoes. Mensagem/falha so muda com posse valida.
Audio manual usa bytes + upload + media ID, com OGG/Opus e playback MP3 reais no
teste local, sem URL assinada. Regressao final: 41/41 (61,64 s, handle 30311),
incluindo prova de lease faltante/divergente no rolling deployment. Repeticao final
de tipos/lint no handle 31491 concluida com exit 0, sem diagnosticos; diff check
aprovado. Suites novas crash-recovery e audio.
Sem novo deploy/Meta/TTS real/UI. Fase 2 aberta e voz gerada pela IA ainda direta.

## Retomada local: templates e novo baseline — 19/10/2026

Fase 2 aberta. Templates manuais e follow-up IA por template usam outbox persistente,
sem reenvio automatico em resultado incerto, sem duplicar historico e preservando
recibos antecipados. IA respeita pausa humana e turno supersedido.
19/19 testes de emulador passaram (18,28 s); tipos passaram, lint zero erros e dois
avisos preexistentes no agente. Sete testes puros de texto/chave tambem passaram.
Snapshot 1792423979159: 1.316 arquivos e hashes conferidos, sem .env; Next local
3201, handle 98592. HTTP autenticado 88923 concluido: 9/9 (122,20 s), com fence
externo, attempts=0 e contas ficticias limpas ao final. Templates: 401/403/400,
seis replays de uma mensagem/job e conflito 409; oito regressoes de midia/SDK.
Nao confundir com o snapshot antigo servido em 3199/proxy 3198.
Server aceita ALTUM_QA_PORT; teste HTTP aceita ALTUM_QA_SNAPSHOT e valida 13 fontes
criticas contra o checkout. Nenhuma dessas mudancas foi publicada. Limites e
caminhos diretos ainda pendentes constam na auditoria ponta a ponta.

## Publicacao parcial do funil — 19/10/2026

Publicada em altumia.com.br a versao dpl_ASLb3ibMcBiRWMXfrLLhR7qWoAqs (READY),
sobre dpl_HdgNAJo5QTyXMNbmRqRGiv4cHSKm. Somente CRM/pipeline e novo helper de
visualizacao; outros 1.422 arquivos mantidos da producao, incluindo Shopify.
Build remoto (TypeScript e 372 paginas), quatro testes e lint aprovados.
Pos-promocao: inicio/login/CRM/funil/inbox HTTP 200; API sem login HTTP 401.
Sem verificacao visual autenticada, sem editar dados reais. Outbox/IA e outras
mudancas locais NAO incluidas. Fase 2 continua aberta. Manifesto/recibo em
.qa-artifacts/client-pipeline-release-20261019; detalhes na auditoria ponta a ponta.

## CRM Kanban reflete funil salvo — 19/10/2026

Correcao solicitada pela captura do usuario: /crm usava rotulos globais mesmo
com etapas do tenant carregadas. Agora nomes, ordem e cores no Kanban; mesmos
nomes em filtros/ficha/mobile. Mantem legados populados, sem mover negocios.
Atualiza etapas ao foco/visibilidade/evento de save; protege resposta por tenant.
Quatro testes crm-pipeline-view.test.mts aprovados; tres testes direcionados de
crm-passive-business.emulator.mts aprovados (19,58 s), incluindo roundtrip de
configuracao para modelo da UI com leads intactos. Tipos e lint aprovados sem
diagnosticos (43621 concluido). Sem prova visual/publicacao.
Nao alterar configuracao real da empresa para demonstrar a correcao.

## Instagram/Messenger texto IA na outbox — 19/10/2026

Ramificacao normal de IA Meta usa slots duraveis e evita addMessage duplicado.
Conector agora recusa canal/conta explicitos que lookup nao resolveu exatamente,
em vez de aceitar fallback para outra conta ativa. Lookup global nao alterado.
Suite social/WhatsApp IA/Shopify **31/31 (18,19 s)**. Nova regressao incluindo canal
de outro tenant, texto/midia e historico **17/17 (30,38 s)**. Banco local real,
Meta simulado: identidade por canal, autoria IA, responsavel, replay e resultado
incerto. Sem OAuth/loja/Meta reais ou exercicio completo do agente.
Arquivos: ai-social-text-delivery.emulator.mts e anteriores citados na auditoria.
Tipos aprovados; lint 45833 concluido zero erros/dois avisos fora da mudanca. Snapshot anterior e gate
aberto. Story/midia social, templates, handoff, voz e demais limites pendentes.

## Resposta IA aguardando: fonte atual e validade Shopify — 19/10/2026

Job IA guarda origem inbound e prazo absoluto de catalogo verificado (checkedAt+30s,
regra ja usada pelo composer). Worker consulta coordenador tenant/chat e bloqueia
resposta supersedida/expirada antes de chamar canal; replay nao renova prazo.
Suite **45/45 (33,64 s)**: ai-text-delivery.emulator.mts,
chat-text-dispatch-integrity.emulator.mts, shopify-conversation-catalog.test.mts,
shopify-live-catalog.test.mts. Banco real de emulador, Meta simulado.
Repeticao com prazo valido/preservado e historico **9/9 (24,09 s)**, handle 66698.
Tipos aprovados; lint 50337 concluido zero erros/dois avisos fora da mudanca. Nao e prova
de cancelamento durante chamada externa ou de toda a IA/Shopify em producao.
Snapshot antigo, gate aberto, sem publicacao.

## Texto normal da IA na outbox — 19/10/2026

Primeira ramificacao migrada: WhatsApp/janela aberta/sem voz, com slots primary,
secondary e checkout. Marca aiGenerated/source ai_outbound e nao duplica addMessage.
Sem pausar IA ou simular dono humano; humano padrao segue pausando e worker impede
IA se pausa ja existe. Resultado incerto nao dispara fallback direto.
Suite **39/39 (36,25 s)**: ai-text-delivery.emulator.mts,
chat-outbound-atomic-enqueue.emulator.mts, chat-text-dispatch-integrity.emulator.mts,
shopify-conversation-catalog.test.mts, ai-conversation-message-history.emulator.mts.
Helper/worker/Firestore reais, destino simulado; nao e teste completo do agente.

Handoff/templates/audio/voz/midia/Meta social ainda fora dessa migracao. Supersessao
e frescor depois de espera, retry da fila IA e fluxo completo Shopify pendentes.
Tipos finais aprovados; lint final emitiu zero erros e os mesmos dois avisos fora
da mudanca (handle 60559). Snapshot anterior, nada publicado.

## Compatibilidade Shopify/historico da IA — 19/10/2026

Suite inicial conjunta **48/48 (13,60 s)**, inspecao sem modificar Shopify.
Gravacao de interesse separada de receita e limitada a tenant/contexto/permissao.
IA ainda envia diretamente fora da outbox: lacuna aberta, nao afirmar mesma
garantia de entrega das mensagens manuais. addMessage tambem cortava texto em
1.800 e achatava linhas; correcao minima preserva o original, sem alterar catalogo.

Suite apos correcao **44/44 (15,15 s)**: ai-conversation-message-history.emulator.mts,
shopify-connection.test.mts, shopify-live-catalog.test.mts,
shopify-conversation-catalog.test.mts, chat-text-dispatch-integrity.emulator.mts.
Dois casos novos exercitam gravador real/export alias no Firestore Emulator:
resposta sintetica longa integral, link/formatacao, contexto commerce intacto,
observador CRM vinculado; audio/sistema e vazio preservam contrato.
Primeira rodada 43/44 por fixture curta (<1.800); ampliada antes de repetir.
Nao e teste de loja, provider ou interface reais. Tipos aprovados; lint zero erros
e dois avisos de variaveis nao usadas fora do trecho alterado (handle 10035).
Snapshot ainda anterior. Gate aberto e sem publicacao.

## Referencias de resposta em preflight — 19/10/2026

Texto revalida mensagem citada antes do canal, nao depois da entrega. Referencias
apagadas/movidas para outro chat/tenant apos aceite agora falham permanentemente
sem chamada ao destino simulado; referencia valida segue unica. Midia ja tinha
preflight e ganhou regressao equivalente. Suite texto/midia/start **25/25 (38,78 s)**;
apos acrescentar caso de midia, texto/midia **11/11 (40,22 s)**.
Sem fetch externo real. Checagem nao e atomica com provider nem prova citacao visual
no WhatsApp; assinatura de URL pode anteceder checagem no caminho de midia.
Tipos e lint aprovados sem diagnosticos (handle 86364 concluido).
Sem snapshot/HTTP/UI novo ou publicacao.

## Integridade de texto no worker — 19/10/2026

Suite **22/22 (29,07 s)**: chat-text-dispatch-integrity.emulator.mts,
chat-outbound-payload.test.mts, chat-outbound-request-id.emulator.mts e
whatsapp-conversation-start.emulator.mts. Tres casos novos conferem payload Meta
simulado integral/exatamente uma vez e bloqueio permanente de alteracao ou dados
legados invalidos antes do conector. Nenhum trafego externo real.
Primeira execucao 21/22 por expectativa errada processed=0: API retorna skipped
para job terminal; teste corrigido sem mudar o contrato do worker.
Gate atual/pendencias objetivas na abertura de ALTUM_CLIENT_END_TO_END_AUDIT.md.
Nova pendencia encontrada: referencia de resposta de texto e revalidada depois
do provider no conector; precisa passar a preflight e ser testada.
Snapshot servido anterior nao inclui worker/texto/chaves novos. Sem publicacao.

## Texto aceito sem truncamento — 19/10/2026

queueTenantChatText e rota de texto agora recusam texto >4.000 caracteres,
JSON/tipos invalidos e referencias de resposta invalidas antes de escrita. Trim
legado mantido, sem corte de sufixo nem truncamento da referencia. Novo modulo
lib/server/chat-outbound-payload.ts e testes chat-outbound-payload.test.mts.
Suite ampliada texto/chaves/outbox/start **30/30 (37,93 s)**; apos incluir prova de
persistencia no limite, suite direcionada **8/8 (10,07 s)**. Handler autenticado
recusa dez payloads adicionais sem efeitos; servico guarda texto de 4.000 com
emoji/quebra identico no job/mensagem, replay unico e excesso recusado.
Nao confundir invocacao direta de handler com HTTP/browser. Snapshot servido
ainda nao inclui correcao de texto/chave. Gate aberto, nada publicado.

## Identificacao sem truncamento — 19/10/2026

Normalizador e rotas texto/multipart/stored rejeitam identificacao invalida com
400/INVALID_OUTBOUND_REQUEST_ID, sem cortar chaves longas para uma identidade
compartilhada. Teste real autenticado de handlers: 18 recusas em tres rotas, nenhum
efeito duravel ou blob. Invocacao direta, nao HTTP Next. Suite com admissao/
imutabilidade **16/16 (18,97 s)**, com outbox/start **27/27 (25,44 s)** e pura
chaves/upload **30/30**; escopos sobrepostos, nao somar. Lint/tipos aprovados.
Arquivos novos: tests/chat-outbound-request-id.test.mts e
tests/chat-outbound-request-id.emulator.mts. Endpoints locais fixos antes do SDK.

Snapshot servido 1792417470220 ainda nao inclui a correcao de identificacao;
nao usar HTTP anterior ou aba para afirmar homologacao dessa revisao.
Gate 2 aberto, sem publicacao, sem acesso alternativo ao navegador bloqueado.

## Confirmacao perdida do proprio upload — 19/10/2026

Suite conjunta **35/35 (41,92 s)**: HTTP oito, SDK um e digest/retry/rascunho/upload
26. Novo caso junta SDK autenticado + Storage + API HTTP reais com perda injetada
apos commit do objeto e apos aceite 200; reexecucao cria uma operacao, sem reupload,
mesmos bytes/geracao. Worker fenced, sem entrega externa. Nao e falha fisica de rede.
Lint/tipos aprovados. Snapshot novo .qa-artifacts/inbox-snapshot-1792417470220,
1.299 arquivos, hashes verificados, sem .env; servidor 3199 handle 92050.
Repeticao HTTP isolada desse baseline concluiu **8/8 (123,67 s)**, handle 40548.
Primeira chamada compilou a rota (54 s), sem afirmar desempenho de producao ou
comportamento da UI sob timeout. Portas 3199/PID 11912 e 3198/PID 13632 verificadas.

Alpha/Beta novamente semeados com 440 mensagens cada; quatro fences de duas horas
em chats inbox-v1 pelo script qa-fence-inbox-delivery.mjs. Proxy 3198 handle 9131,
sem stdin interativo: comando status falhou; nao afirmar teste de outage ou morte
do servidor a partir disso. Verificar processo/porta antes de reusar ou reiniciar.

CUA bloqueou aquisicao da aba por politica de URL. Nao contornar nem alternar browser.
Pedido de abertura manual de 3198/cliente/painel/inbox?chatId=qa-altum-alpha-chat-1
foi enviado. Nao houve homologacao visual; nao enviar mensagem manualmente.
Gate aberto, sem publicacao; demais limites detalhados na auditoria.

## Admissao de upload direto — 19/10/2026

Servico/rota existentes reforcados com digest do File, leitura de geracao fixa e
admissao imutavel antes do enqueue, sem copiar o arquivo do navegador. Cinco novos
casos de admissao, mais digest no cliente. Suite ampliada **40/40 (27,98 s)**:
`tests/chat-stored-media-admission.emulator.mts`, `chat-outbound-idempotency.emulator.mts`,
`chat-media-dispatch-integrity.emulator.mts`, `inbox-direct-media-retry.test.mts`,
`inbox-direct-media-retry.emulator.mts`, `inbox-media-attempt.test.mts`, `inbox-upload.test.mts`.
Executar com FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 e outros endpoints locais
explicitos antes do Node: o teste antigo de outbox nao os define sozinho. Primeira
rodada sem isso falhou procurando credenciais default (33/8, incluindo hook).
Nao esconder essa falha nem usa-la como prova de comportamento da aplicacao.

Tipos/lint aprovados. HTTP atualizado **7/7 (71,97 s)**, incluindo tres casos reais
de send-stored-media: autorizacao/digest, aceite/replays sem copiar arquivo e
conflitos/adulteracao apos aceite. Worker bloqueado por reserva antes do provider.
Snapshot .qa-artifacts/inbox-snapshot-1792416892131, 1.299 arquivos, hashes
conferidos e sem .env; servidor 3199 (handle 50419), seis fontes backend conferidas
novamente pelo teste. A copia contem UI/helper novos, mas nao houve homologacao
visual. Proxy 3198 nao reativado. Gate 2 aberto; callback perdido do proprio upload,
UI, audio positivo, cloud/Meta real e build global continuam pendentes.

## Retomada de anexos e aceite autenticado — 19/10/2026

Suite conjunta **26/26 (11,47 s)**:
`node --import tsx --test tests/inbox-direct-media-retry.emulator.mts tests/inbox-direct-media-retry.test.mts tests/inbox-media-attempt.test.mts tests/inbox-upload.test.mts tests/chat-media-send.http.mts`.
Endpoints fixos locais 8080/9099/9199 e projeto demo-altum-qa-lab; identidades e
tenants efemeros limpos ao final. Nenhum canal externo configurado, worker HTTP
bloqueado por reserva local. Fontes backend do snapshot conferidas por SHA.

HTTP multipart comprova autorizacao, isolamento, replay concorrente e conflito de
conteudo sem alterar bytes. SDK cliente autenticado reproduz regra create-only
recusando sobrescrita e comprova helper corrigido repetindo apenas o aceite apos
upload concluido; nesse caso aceite e simulado. Ver detalhes/limites na auditoria.
Lint direcionado e typecheck incluindo pagina Conversas aprovados sem diagnosticos.

Gate 2 aberto. Ainda falta admissao/digest no send-stored-media, upload cujo callback
se perdeu e fluxo visual completo. Correcao nova do helper/tela ainda fora do snapshot
1792415777674: HTTP acima nao homologa essa UI. Nenhuma publicacao foi feita.

## Worker de midia verificado — 19/10/2026

Suite atual 44/44 (worker de midia, imutabilidade, idempotencia, starts e recibos).
Cinco cenarios novos: entrega simulada unica com bytes/nome/geracao corretos,
corrupcao apos aceite bloqueada antes de assinar, admissao estrangeira bloqueada,
corrupcao de audio fora do fallback, legado marcado legacy_unbound. Lint e tipos
direcionados aprovados. Sem trafego externo: assinatura e destino simulados, acesso
ao banco/Storage do emulador real. Nao confundir com comprovacao Meta/cloud real.
Fonte audio normalizada positivamente, API de upload direto e UI ainda pendentes.
Nova copia isolada: .qa-artifacts/inbox-snapshot-1792415777674, 1.293 arquivos
com hashes conferidos e sem .env. Servidor pronto em 127.0.0.1:3199, handle de
execucao 57061 nesta sessao; revalidar antes de usar, nao supor persistencia.
Proxy 3198 e fixtures Alpha/Beta nao reativados. HTTP multipart concluido acima;
upload direto HTTP e UI ainda pendentes.

## Enqueue distribuido e bytes imutaveis — 19/10/2026

Ver ALTUM_CLIENT_END_TO_END_AUDIT.md, revisao subsequente. CAS sozinho passou texto
mas falhou tres operacoes no cenario misto (29/30 total). Nao fechar esse gate com
o primeiro 2/2. Reserva create-only distribuida, fence por updateTime e liberacao
no mesmo commit foram adicionadas: tres cenarios multiprocesso passaram depois.

Storage reproduziu alteracao indevida de bytes de mesmo tamanho. Create-only no
objeto sem admissao nao aprovou corrida (4/5). Admissao imutavel SHA-256 no Firestore
antes do upload corrigiu o caso; replays antigos verificam arquivo antes de vincular
digest. Suite de atomicidade/lease + imutabilidade/retomada/lixeira ficou 13/13.
Suite ampliada final: 58/58, incluindo os tres cenarios multiprocesso junto com
recibos/campanhas/starts/idempotencia/contratos de lixeira (99,5 s). Lint/typecheck
direcionados finais aprovados, zero diagnosticos. Gate 2 ainda exige APIs autenticadas, worker/URLs/digest,
timeout/recarga e experiencia visual. Snapshot QA antigo nao esta sincronizado
com esses modulos; nenhum deploy/indice publicado nem avanco para novas fases.

## CRM passivo, personalizacao e grupos — 19/10/2026

Suite conjunta 39/39 em dados ficticios/emulador, sem chamadas a modelos/provedores:
crm-passive-facts.test.mts, crm-passive-business.emulator.mts,
crm-observation-runtime-contract.test.mts, crm-conversation-observation.emulator.mts,
ai-queue.emulator.mts e messaging-provider.test.mts. Inclui 100 mensagens antigas
mais fatos recentes, pausas, supressao de resposta sem perder job CRM, procedencia,
dados manuais, eventos atrasados, tenant/grupo, mensagem da IA/saida pendente e
personalizacao de funil concorrente com aplicacao de blueprint.

Grupo no gateway generico e JID alternativo validados em unidade; ainda NAO e prova
HTTP de grupo sem criacao de lead. Nome ausente no provedor/renomeacao e revisao de
contatos legados pendentes. Qualidade semantica por negocio, cobertura de todos os
ingressos, distribuicao concorrente omnichannel e contexto visual de story pendentes.
Esta rodada nao iniciou fase 9, nao publicou indices/app e nao alterou app/admin.
Detalhes e ordem de aceite em ALTUM_CLIENT_END_TO_END_AUDIT.md.

## Teste entre processos localizou enqueue_text — 19/10/2026

Harness `whatsapp-start-multiprocess.emulator.mts` e worker em fixtures usam cinco
processos SDK, quatro chamadas cada, liberacao simultanea por IPC. Mesma chave:
20 chamadas geraram um chat/uma mensagem/um job, sem erros. Chaves distintas para
o mesmo destino: nove ABORTED/lock timeout, todos em enqueue_text. Teste de dois
cenarios ficou 1/2. Nao e prova de causa unica das falhas antigas, mas e reproducao
concreta de contenção no enfileiramento entre instancias. Nenhum provider acionado.

Tipos instalados nao aceitam windowsHide em ForkOptions; harness ajustado para
spawn com IPC/janela oculta. Repeticao comportamental dessa versao pendente.
Lint e typecheck do harness/worker aprovados, sem diagnosticos.
Nao serializar o teste nem aumentar tentativas apenas para aprovar. Corrigir o
enfileiramento distribuido mantendo sequencia/idempotencia antes de fechar gate.

## Investigacao do lock de starts — 19/10/2026

Instrumentacao adiciona etapa fixa ao erro SDK sem dados de contato, sem alterar
retentativas. Teste de 20 starts aguarda todas as 20 promessas (allSettled) antes
de falhar/continuar; concorrencia e assercoes preservadas. Regressao repetida
campanhas/recibos/inicio: 28/28, starts em 4,9 s. Falha historica 27/28 com ABORTED
em 37,6 s permanece sem causa/etapa determinada; repeticao verde nao a elimina.
Gate de estabilidade aberto, sem reinicio do emulador ou reducao da concorrencia.
Dois casos direcionados de diagnostico aprovados, incluindo erro imutavel; tipo
do servico/dependencias sem diagnosticos. Nao houve suite conjunta de 30 nesta rodada.

## Campanhas: implementacao em validacao — 19/10/2026

Novo helper de aceite de campanha compartilha resumo transacional com mensagem;
webhook recupera entrega pelo vinculo mesmo com consulta inicial vazia. Numero
remetente legado so e resolvido por canal do proprio tenant. Midia por link agora
preserva resultado/ID/numero no contexto da campanha, sem chamada adicional.
Contrato estatico: 1/1 aprovado. Regressao de campanha/recibos/inicio: 27/28.
Quatro casos de campanha passaram. Falhou o caso de 20 starts simultaneos com
`10 ABORTED: Transaction lock timeout` (37,6 s). Causa/stage pendentes; nao concluir
que e apenas ambiente frio, nem substituir a regressao concorrente por serial
para aprovar. Lint/typecheck aprovados; snapshot ainda sem esta rodada de campanha.

Portas de emuladores estavam sem listener. Processo oficial de emuladores iniciado
em demo-altum-qa-lab confirmou All emulators ready. Acompanhar processos existentes,
nao reiniciar por timeout de observacao. Estado do laboratorio de 17/10 nao comprova
estado atual nem persistencia dos dados ficticios antigos. Nenhuma publicacao.

## Permissoes e assinatura comprovadas via HTTP — 17/10/2026

`whatsapp-delivery-reconciliation.http.mts`: 5/5. Login normal no Auth Emulator,
401 anonimo, 403 atendente e cada permissao isolada, 403 entre empresas; owner
autorizado corrige duas paginas, retoma/repete, sem novos envios. Auditorias e
validacao de body/acao/limite/cursor comprovadas. Contas/fixtures exclusivas foram
removidas no teardown, sem alterar Alpha/Beta. Lint aprovado.

`whatsapp-delivery-webhook.http.mts`: 3/3. HMAC valido aplica read em um registro
e cauda; assinatura ausente/invalida/corpo adulterado 401 sem mutacoes. Repeticoes
e sent atrasado nao regridem. Outro tenant intacto; zero jobs de envio/IA/CRM.
Canal/token/segredo ficticios, somente statuses; nenhuma chamada para Meta real.
Lint aprovado e fixtures removidas. Ambos requerem Next 3199, Firestore 8080;
reconciliacao requer tambem Auth 9099, todos loopback/demo-altum-qa-lab.

Esses criterios HTTP passaram; gate global continua aberto para campanhas,
retencao/lixeira e demais evidencias pendentes. Nao houve publicacao.

## Reconciliar mensagens concluidas sem reenvio — 17/10/2026

Rota existente POST chats/outbound-queue aceita `action=reconcile_delivery`,
`limit` (1..25) e `cursor`. Requer respond_inbox, manage_channels e
view_team_records alem do tenant/modulo. Acao nao aciona after/worker/provider.
Retorna contagens, resultados por mensagem, hasMore e nextCursor escopado ao
tenant; registra auditoria por pagina. Nenhuma execucao em producao.

Regressao completa: 29/29 (quatro testes novos de reconciliacao e um contrato).
Cobertura inclui quatro paginas, repeticao/retomada, rede proibida, dados de outro
tenant inalterados, conteudo/contagem preservados, registro conflitante sem impedir
seguinte, recibo legado tardio apos migracao e recusa de recriar mensagem removida
ou ligar destino alterado. Typecheck da rota/dependencias aprovado.
Lint aprovado; hashes da rota/helper/servico no snapshot iguais ao fonte.

Permissoes da acao ainda exigem teste HTTP autenticado; contrato de fonte nao
equivale a autorizacao comprovada. Campos de destino ausentes sao reportados e
nao inferidos. Campanhas, retencao de recibos e webhook HTTP assinado pendentes.

## Recibos legados recuperados no vinculo — 17/10/2026

Regressao atual recibos + inicio por lead: 24/24. Caso de 205 recibos antigos
reproduziu sent/read e passou com pagina de 200, leitura na segunda pagina,
data/destinatario preservados e isolamento por empresa/numero. Outro caso valida
erro legado, resumo preexistente sem migracao, repeticao e leitura posterior.

Consulta historica ocorre na transacao antes de gravar; marcador de reconciliacao
evita repetir a varredura no mesmo vinculo. Typecheck direcionado zero diagnosticos.
Lint aprovado; snapshot dos helpers/indices com hashes iguais e indices sem duplicatas.
Indice tenant/numero/ID externo declarado, nao implantado. Recuperacao em lote de
mensagens ja concluidas e compatibilidade durante rollout ainda nao homologadas.
Campanhas, retencao e HTTP assinado continuam pendentes. Nenhuma publicacao.

## Recibos precoces recuperados no aceite — 17/10/2026

22/22: suites `whatsapp-delivery-status.emulator.mts` e
`whatsapp-conversation-start.emulator.mts`. Falha inicial sent/read reproduzida;
resumo transacional por empresa/numero/ID externo resolve recibo antes do vinculo
sem segundo webhook. Seis disputas simultaneas entre aceite/recibo aprovadas;
numero diferente isolado e segundo vinculo recusado. Mensagem e cauda convergem.

Colecao existente agora possui `recordType=event` (historico) e `recordType=state`
(resumo/vinculo). Contagens de logs nos testes filtram eventos, nao confundem os
dois tipos. Fixtures de envios distintos tinham ID externo igual e foram corrigidas
apos nova protecao detectar colisao (primeira rodada 20/22; final 22/22).
Lint e typecheck aprovados; snapshot dos helpers com hashes iguais.

Ainda pendentes: historico sem resumo, aceite de campanhas, retencao dos registros,
HTTP assinado e entrega real. Nenhum gate global fechado ou publicacao.

## Webhook: estado nao regride por evento atrasado — 17/10/2026

`whatsapp-delivery-status.emulator.mts`: 6/6. Leitura preservada contra sent,
delivered/failed atrasados; seis eventos concorrentes convergem; isolamento por
empresa/numero e mensagens recebidas; recibo de mensagem antiga nao substitui cauda;
campanhas monotonicamente atualizadas; eventos precoces retidos; duplicata mantem
createdAt e entrega comprovada supera falha. Nenhuma chamada externa.
Normalizacao/contrato de entrada: 9/9; typecheck da rota/dependencias zero.
Lint aprovado; hashes do snapshot iguais para rota/servico/indices, sem indices duplicados.

Webhook usa servico transacional novo; indices tenant/metaMessageId declarados,
nao implantados. Snapshot sincronizado. Ainda falta reconciliar recibo precoce com
vinculo posterior e testar corrida, retencao e HTTP assinado. Legado de campanhas
sem numero permanece vinculado apenas por tenant/ID externo e merece endurecimento.
Gates corretivos seguem abertos; nao iniciar homologacao final.

## Confirmacao nao pode regredir recibo — 17/10/2026

Suite de inicio por lead atual: 13/13. Dois cenarios reproduziram `read` e
`delivered` sobrescritos por `sent` ao retornar o conector simulado; helper
transacional agora preserva estado/data/erro para o mesmo ID externo e bloqueia
outro tenant/chat. Texto e midia com mensagem persistente usam a protecao.
Teste tambem preserva falha terminal conhecida. Sem transporte externo real.

Typecheck direcionado aprovado; snapshot com hashes iguais para dispatch/helper.
Execucao filtrada encontrou dependencia entre testes legados: caso de repeticao
agora prepara sua primeira tentativa, mantendo assercoes. Suite completa passou.
Webhook ainda requer ordenacao monotona e reconciliacao de recibos precoces;
nao considerar gate de entrega encerrado pela protecao do retorno do worker.

## Inicio -> worker -> CRM com Meta simulada — 17/10/2026

`tests/whatsapp-conversation-start.emulator.mts` agora tem 10/10 casos aprovados.
Novo caso usa fila/worker/conector/observacao reais no emulador, interceptando o
transporte externo dentro do processo: nenhuma chamada encaminhada para a Meta.
Comprova uma mensagem, um envio simulado, recibo CRM concluido e um evento mesmo
apos repetir inicio/worker. Nao comprova entrega real ou POST/after do Next.

Assercao de `deliveryStatus` reproduziu estado `queued` apos envio concluido.
Corrigido em chat-dispatch para gravar `sent` e limpar erros. Lint e typecheck de
chat-dispatch/dependencias aprovados (zero diagnosticos). Snapshot sincronizado
com hash igual. Gates gerais continuam abertos.
Regressao paralela fila + observacao CRM: 13/13 aprovados apos a correcao.

## Recuperacao da UI e rascunho do lead — 17/10/2026

Overlay identificou timeout do chunk `app/layout.js`; arquivo depois respondeu
200 pelo proxy e direto. Botao Reload recuperou a UI, sem reiniciar servicos.
Causa inicial do timeout ainda nao determinada, nao declarar ambiente estabilizado.

Fixture `qa-altum-alpha-lead-start-ui`: formulario preenchido e Iniciar conversa
clicado uma vez. Chat canonico abriu com janela fechada. Verificador local apontou
um chat, zero mensagens/jobs. `qa-verify-lead-start-ui.mjs --simulate-inbound`
simulou apenas a janela nesse chat; texto original reapareceu e persistiu apos
reload. Nenhum envio/template clicado. `--close-window` restaurou janela fechada,
novamente com zero mensagens/jobs. Operacoes exclusivamente no emulador.

Evidencias em `inbox-resilience/lead-start-template-gate.png` e
`inbox-resilience/lead-start-draft-after-reload.png`. Caminho de transferencia de
rascunho Meta aprovado; envio efetivo pelo inicio do lead e demais gates pendentes.
O seed agora inclui as duas fixtures (HTTP e UI), sem apagar dados anteriores.

## Inicio por lead: HTTP autenticado aprovado; UI pendente — 17/10/2026

Executados `node scripts/qa-seed-lead-start.mjs` e, com credenciais externas
removidas do processo, `node --import tsx --test tests/whatsapp-conversation-start.http.mts`.
Resultado 3/3: 401 sem login, 403 acesso Alpha->Beta, 200 autorizado com repeticao
no mesmo chat, template obrigatorio, zero mensagens e nenhum novo job. Canal fake
nao pode ser usado para dispatch. Lint dos arquivos aprovado. Teste requer Auth
Emulator 9099, Firestore 8080 e Next local 3199, todos no loopback.

UI na aba 2/porta 3198 ficou vazia apos recarga do formulario sem texto. Aviso de
montagem React e erro JSON de presence no terminal durante compilacao; causa ainda
nao determinada. Screenshot `inbox-resilience/lead-start-blank-local.png`. Nao houve
clique em Iniciar conversa. Nao aprovar preservacao/transferencia visual por conta
dos testes HTTP. Lead `qa-altum-alpha-lead-start` agora ja possui chat criado pelo
teste: preparar outra fixture exclusiva para verificar o formulario inicial sem
apagar dados desta. Servidor/proxy/emuladores foram mantidos, nao reiniciados.

## Revalidacao adicional de contato — 17/10/2026

Protecao local em `lib/server/contact-profile.ts` recusa aliases e destinos de
outra empresa antes de gravar; leitura canonica nao atravessa tenants. Falha
reproduzida antes da correcao com fixtures ficticias. Tres casos novos aprovados;
regressao paralela fila/identidade 17/17 e contratos 5/5, typecheck direcionado zero.
A falha historica de lock nao reapareceu nas duas repeticoes desta rodada, sem
causa definitivamente estabelecida. Nenhum gate aprovado por isso.

Revisao seguinte reproduziu retorno ao contato antigo em cadeia de unificacoes e
aceitacao de ciclo. Correcao percorre e valida a cadeia na transacao, seleciona
raiz definitiva deterministica, compacta intermediarios e recusa ciclo/destino
ausente antes de gravar (limite de 32). Seis casos direcionados aprovados. Snapshot
recebeu a protecao atual; hash do arquivo de contato igual ao fonte. Isso nao
comprova a jornada HTTP ou visual ainda pendente.

Regressao paralela da versao com cadeias: 19/19 aprovados. Lint do lote e
typecheck do arquivo de contato/dependencias aprovados (zero diagnosticos).

## Gate corretivo do inicio pelo lead — 17/10/2026

- Implementacao atual no codigo e copia isolada usa destino canonico, permissao
  comercial do chat resolvido e outbox existente. Nao chamar provider na rota.
- `tests/whatsapp-conversation-start.emulator.mts`: 9/9, incluindo 20 chamadas
  simultaneas com um chat/um job, resposta perdida, template sem envio de texto,
  canal/vendedor indevidos e repeticao apos mudanca do telefone do lead.
- Rascunhos: mais cinco testes; suite direcionada 75/75. Contrato de prontidao
  atualizado 1/1. Lint aprovado e typecheck direcionado sem diagnosticos.
- Filas/identidade em sequencia: 14/14; CRM 6/6. A execucao paralela anterior
  teve um lock timeout no perfil concorrente (13/14). O caso isolado passou,
  mas a estabilidade sob carga paralela continua pendente e nao deve ser omitida.
- Proxima verificacao: autenticacao/POST HTTP da rota e fluxo visual pelo lead.
  Para o caso de template, usar somente canal Meta ficticio no emulador; nao
  reutilizar credenciais nem canais reais. O caso `requiresTemplate` nao pode
  criar mensagem de texto nem job de dispatch, e deve preservar o rascunho.
- Testes de captura de audio e teclado real continuam pendentes, sem avancar
  Fase 9. Nenhum envio externo nem deploy foi realizado nesta correcao.

## Retomada do teste de microfone — 17/10/2026

- Autorizacao do usuario: aproximadamente dois segundos de gravacao local,
  com envio interrompido; nao autoriza enviar audio ao WhatsApp ou outro servico.
- Antes de clicar em Gravar audio, confirmar `outage` no proxy da porta 3198.
  A gravacao conclui com tentativa automatica: nao testar com proxy liberado.
- Preservar o rascunho de texto antes de limpar o compositor; concluir ou
  cancelar rapidamente, nao reproduzir o audio e nao reenviar depois de restore.
- Se o navegador aguardar permissao, Cancelar deve estar disponivel. Nao
  contornar bloqueios do navegador nem automatizar permissoes nativas do Windows.
- Na retomada atual, os cinco servicos estavam desligados. Emuladores foram
  reativados, seed confirmou 440 mensagens por empresa, Next anunciou Ready;
  aquecimento HTTP do login excedeu 55s enquanto o compilador continuava ativo.
  Nao reiniciar por esse timeout nem considerar Ready como pagina homologada.
- Retomada da aba antiga recusada pela politica do navegador. Aguardar abertura
  manual do usuario antes de novas acoes de interface; microfone ainda nao usado.
- Revalidacao atual: suite direcionada 57/57; sessao/handler de mensagens no
  emulador 5/5; typecheck direcionado e lint aprovados. Nenhum envio externo.
- Protecao adicionada contra pedidos simultaneos e permissao que chega apos
  cancelar/desmontar; tracks tardios sao encerrados. Evidencia atual e de testes
  de codigo, nao de captura real. Fase 8 aberta; Fase 9 nao iniciada.

## Diagnostico de recompilacao — 17/10/2026

- O cache QA fica em `.qa-artifacts/next-inbox`. O Webpack desta versao do Next
  ignora `.next`, `.git` e `node_modules`, mas nao esse diretorio customizado.
- O trace comprovou recompilacoes disparadas pelos proprios manifestos, bundles
  e arquivos de trace gerados. Configuracao QA agora estende o filtro existente
  para ignorar `.qa-artifacts` do projeto atual, sem ignorar o codigo-fonte da
  copia isolada quando ela tambem esta dentro de uma pasta `.qa-artifacts`.
- Para observar a causa de recompilacoes: `node scripts/serve-inbox-qa.mjs --trace-watch`
  no diretorio da copia de teste, com os tres emuladores oficiais ja prontos.
  Sem o argumento, o registro fica desligado; a exclusao da pasta gerada continua.
- O registro mostra caminhos relativos, nao conteudo de arquivos ou credenciais.
- Nao ignorar toda pasta `.qa-artifacts` por nome em qualquer ancestral: isso
  esconderia o proprio codigo da copia isolada e invalidaria a verificacao.
- O aviso `Local QA upstream unavailable` e HTTP 502 do proxy local ao nao
  conseguir conectar ao Next; nao e um diagnostico de conta/canal de producao.

## Segurança
- Navegação automatizada apenas no servidor local (localhost/127.0.0.1).
- Não criar empresa nem usuários reais; não enviar mensagens nem realizar cobranças.
- Testes autenticados exigem Firebase Emulator e contas fictícias isoladas.

## Laboratorio autenticado da Inbox — 16/10/2026

- Configuracao `firebase.qa.json`: Auth 9099, Firestore 8080 e Storage 9199,
  todos vinculados a `127.0.0.1`, projeto exclusivo `demo-altum-qa-lab`.
- `node scripts/qa-seed-isolated.mjs`: duas empresas com IDs separados, dois
  contatos/conversas e 440 mensagens por empresa, sem limpeza de dados globais.
  A versao anterior chamava seed de demonstracao que limpava o mesmo marcador
  para todos os tenants e reutilizava IDs; esse caminho foi removido deste script.
- Contas locais `owner-alpha@qa.invalid` e `owner-beta@qa.invalid`, senha ficticia
  `QaLabLocalOnly2026!`; nao sao credenciais de producao.
- `node scripts/serve-inbox-qa.mjs`: exige as tres portas de emulador antes de
  iniciar Next em `127.0.0.1:3199`, remove credenciais herdadas e neutraliza todas
  as chaves dos arquivos `.env*` antes do carregamento automatico do Next.
- Flag explicita de QA, projeto demo e hostname loopback sao obrigatorios para
  conectar o SDK cliente aos emuladores; builds de producao sao recusados.
- Cache `.qa-artifacts/next-inbox` e `tsconfig.inbox-qa.json` separados; CSP
  permite portas locais apenas neste modo de desenvolvimento.

Evidencia desta rodada:

- os tres emuladores anunciaram prontidao e o hub confirmou os servicos;
- seed concluiu e verificou 440 mensagens para alpha e 440 para beta, depois
  de gravar ambos, comprovando que o segundo nao apagou o primeiro;
- servidor Next pronto; primeira compilacao de `/cliente/login` ainda em curso
  na ultima observacao; nao confundir servidor pronto com tela homologada;
- primeira navegacao do navegador excedeu timeout, aba permaneceu `about:blank`;
  tentativa de recuperar a aba tambem excedeu timeout; nenhum login foi submetido;
- 21 testes direcionados aprovados, incluindo protecao de producao/CSP e rascunhos;
- lint do preparo aprovado e typecheck de tres arquivos-raiz aprovado, zero erros;
- Fase 8 permanece aberta; isto nao e aprovacao da homologacao final da Fase 9.

Complemento de sessao (mesma rodada):

- `node --import tsx --test tests/inbox-session.emulator.mts`: 3/3 aprovados;
- login ficticio passou pela verificacao de token e autorizacao reais do backend;
  alpha autorizado em alpha, negado em beta; tokens ausentes/invalidos recusados;
- nenhum bypass de autenticacao foi criado; teste nao usa credenciais produtivas;
- esse teste nao equivale a login submetido no navegador nem a HTTP completo da
  Inbox. Uma leitura HTTP de aquecimento do login terminou com timeout de 90s;
  servidor e compilador continuaram ativos, sem reinicio baseado no timeout.

Diagnostico posterior do compilador:

- Next emitiu erro explicito de avaliacao de `app/globals.css`: subprocesso
  PostCSS/Turbopack sem resposta. Isso e falha de compilacao, nao gate aprovado.
- apos esse resultado terminal da compilacao, o servidor QA foi encerrado; porta
  3199 confirmada liberada. Auth/Firestore/Storage permaneceram ativos e os dados
  ficticios nao foram descartados.
- launcher QA passa a usar a opcao oficial `next dev --webpack`, confirmada pelo
  `--help` desta versao instalada. Nenhum CSS ou build de producao foi alterado.
- nova instancia confirmou `Ready` em modo webpack; aguardando resposta real da
  pagina antes de iniciar testes de interface.
- primeira leitura HTTP em webpack tambem excedeu 90s enquanto o servidor
  registrava `Compiling /cliente/login`; nenhum erro de conclusao foi emitido
  nessa observacao. Instancia mantida ativa, sem reinicio por timeout de leitura.

Recuperacao de rede da Inbox:

- lista/detalhe/historico/paginacao e envio de texto usam prazo de 25s incluindo
  token, fetch e corpo JSON, preservando rascunho e identidade de envio;
- cinco testes novos de prazo/erro/recuperacao aprovados; junto com regressao,
  20/20 aprovados. Sessao em emulador: mais 3/3 aprovados;
- lint do lote e typecheck direcionado de tres arquivos-raiz aprovados;
- nenhum desses resultados substitui a verificacao autenticada da tela completa.

Revalidacao de tipos e pagina (16/10/2026):

- geracao oficial `next typegen` reparou os tipos; typecheck da Inbox aprovado;
- login local retornou HTTP 200 e formulario visivel, com aviso de emulador;
- sender ID ficticio adicionado ao launcher QA apos erro no console; nenhuma
  credencial real usada. Reinicio apenas para aplicar essa configuracao;
- nova compilacao apos reinicio ainda nao homologada; navegador perdeu resposta;
- teste de sessao ampliado: 5/5 aprovado; handler real de mensagens entregou
  220 registros em tres paginas sem repeticao; duas tentativas de cruzar tenant/
  chat estrangeiro recusadas sem vazamento de items. Handler invocado diretamente,
  nao teste HTTP completo; login visual e Inbox autenticada continuam pendentes.

## Execução
1. Iniciar o servidor local com `npm run dev` em outra sessão.
2. Instalar navegador com `npx playwright install chromium`.
3. Executar `npx playwright test`.
4. Ver screenshots e rastros em `.qa-artifacts/playwright-results`.
5. Relatório: `npx playwright show-report .qa-artifacts/playwright-report`.

## Próximos testes
- Empresa fictícia somente em emulador, dono, gestor e vendedores A/B.
- Jornada lead -> conversa -> CRM -> tarefa -> proposta -> indicadores.
- Controle de acesso negativo e isolamento entre empresas.
- Regressão visual, responsividade e acessibilidade.
- Diferenciar testes simulados de integração com provedores externos reais.

## Critério de aceite
Uma funcionalidade só está concluída se interface, persistência, isolamento, integração e recuperação de falhas forem comprovados.

## Execução em 09/10/2026
- Chromium do Playwright instalado e servidor local iniciado na porta 3099.
- Primeira rodada: 4 falhas por timeout enquanto o Next compilava /cliente/login e compactava cache. Evidência no relatório Playwright.
- Após aquecimento da rota: 4/4 testes da interface passaram (desktop + mobile).
- Testes de requisições sem autenticação para leads e chats de tenant fictício: 4/4 passaram.
- Total dessa rodada: 8/8 aprovados. Estes são testes iniciais, não homologação completa.
- Atenção: aceitar 404 no teste de API significa que não comprovamos isolamento entre dois tenants existentes; testar autenticação e autorização com usuários reais do emulador.
- Nenhum seed de dados foi aplicado; Firebase Emulator ainda não preparado; nenhuma integração externa disparada.
- Versão atual não deve ser publicada só com base nesses resultados.

## Próxima barreira
Criar e isolar Firebase Auth + Firestore Emulator, prover usuários e tenants fictícios, testar role matrix e a jornada comercial entre páginas, coletando evidências da persistência real.

## Tentativa de laboratório isolado — 09/10/2026
- Criado `scripts/qa-seed-isolated.mjs`, que exige portas locais 9099 (Auth) e 8080 (Firestore), sobrescreve variáveis de projeto com `demo-altum-qa-lab` e remove credenciais de service account do subprocesso antes de executar o seed.
- O script prevê tenants distintos `qa-altum-alpha` e `qa-altum-beta` com emails de teste `@qa.invalid`.
- Primeira execução do guard bloqueou corretamente o seed: `QA blocked: local emulator on port 9099 is not running.`
- Tentativas de iniciar Firebase Emulator via npx e CLI local em cache não retornaram confirmação de prontidão; testes de porta indicaram 8080/9099 inacessíveis.
- Nenhum dado fictício foi gravado e nenhum tenant de produção foi alterado.
- Não marcar testes autenticados, isolamento entre tenants ou jornada CRM -> Inbox como aprovados.
- Investigar inicialização de Firebase Emulator e executá-lo em processo com logs antes de rodar `node scripts/qa-seed-isolated.mjs`.
