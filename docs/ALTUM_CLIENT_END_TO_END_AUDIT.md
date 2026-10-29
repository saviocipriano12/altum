# Auditoria ponta a ponta da area do cliente Altum

## Fase 2: comentario social migrado, automacoes genericas ainda diretas — 19/10/2026

Substitui o diagnostico anterior de envio direto em social/service. Resposta publica
Instagram/Facebook e privada IG por comentario agora aceitam outbox/log/ledger
atomicamente, com mensagem apenas para entrega privada. Chave por tenant/canal/
comentario nao muda com horario do webhook ou chat. Conteudo/mode/destino fixados;
ledger impede recriar tarefa removida. Politica/opt-out/conta/autor/regra sao relidos
na barreira. Claim de preparo tem token/prazo, retry nao reseta sent e legado incerto
fica para revisao. Recibo unico confirma job/log/ledger/mensagem/lock juntos.
Sem ID, ACK incerto ou queda do processo nao autorizam reenvio automatico. Retry
manual so retoma falha comprovadamente pre-provedor. DM por follower nao habilitada.

Evidencia e riscos completos em CONVERSAS_GATE_2_ATUAL e QA_LAB_CLIENTE. Regressao
intermediaria 73/73, final do worker comum 72/72; nao e homologacao real da Meta,
build global ou UI. Indice de busca por tenant/canal/conta/autor preparado, nao publicado.
Suite social final 31/31 em 66,55 s (31467); tipos finais aprovados (21926), lint
sem erros/avisos e diff --check aprovado (66399). Ledger novo exige integracao
com manifesto/retencao/expurgo na fase 6; nao houve migracao ou limpeza real.

Gate 2 aberto: automations.ts ainda manda send_message diretamente em executeAction,
usado por gatilho imediato/espera/agendamento e chamado dentro do proprio fluxo
social. Precisa entrega por execucao/acao, sem impedir futuras execucoes legitimas.
Recibos do CRM e identidade historica continuam nas fases 4/5; recuperacao completa
das filas na fase 3. Nao avancar enquanto os criterios integrais do gate 2 faltarem.

## Fase 2: campanha individual migrada, gate ainda aberto — 19/10/2026

Esta secao substitui o diagnostico anterior de dispatch de campanha direto.
Texto/template/midia agora aceitam uma mensagem/job/ledger por tenant/run/lead
na outbox comum, usando snapshot do run. Destino WhatsApp canonico nao converte
chat social. Conteudo aceito e arquivos privados fixados por generation/hash sao
reutilizados; job ausente nao e recriado. Consentimento/escopo/telefone/canal/run
sao relidos na barreira transacional antes do provedor, com reserva do contato.
Pausa/horario nao consomem retry; texto fora de janela nao vira outro template.
Recibo real atualiza ledger, contexto do lead/chat e evento determinista juntos;
read antecipado permanece read. Confirmacao perdida nao vira sent nem reenvio.
Resumo por delta e completionCounted evitam soma duplicada; filho incerto deixa
lote delivery_pending/run aberto. Recuperacao automatica desse resumo e claims
dos lotes ainda exigem fase 3, apos os criterios completos de fase 2.

50/50 emulador em 47,02 s (10929), 33/33 contratos/cache/operacao em 2,19 s,
lint/tipos direcionados aprovados (19263). Nenhum envio real/deploy/build global
ou homologacao autenticada; indices novos nao publicados. Detalhes de casos,
riscos de legado/Storage/identidade e evidencia em CONVERSAS_GATE_2_ATUAL.md.
Regressao do worker comum: 83/83 em 55,73 s (34599), com aceite atomico,
MCP, handoff, ecommerce, voz, materiais e IA social; somente provedores ficticios.
Compatibilidade Shopify: 40/40 conexao/catalogo/OAuth (43520), sem loja real.

Proxima falha confirmada: social/service envia comentario publico e privado
diretamente e nao exige ID de resposta. claimSocialEvent permite reentrar em
claimed; retrySocialAutomationLog troca ate sent para retrying antes de chamar
de novo. Concorrencia/perda de ack/retry podem repetir e regenerar conteudo.
Ainda nao corrigido; nao avancar de fase ou publicar todo o checkout compartilhado.

## Fase 2: execucao de campanha idempotente antes da entrega individual — 19/10/2026

Turno anterior classificado como progresso (mensagens MCP). Campanhas tinham
criacoes aleatorias de run/lotes e uma verificacao de activeRun fora de transacao.
Admissao agora reserva campanha/run atomicamente por chave de requisicao, com
manifesto imutavel, versao da configuracao e criador. Repetir nao refaz a selecao.
Lotes deterministas staging/create-only e ativacao condicional suportam interrupcao
sem sobrescrever processamento/conclusao, pausa ou tempos de retry.

UI existente persiste tentativa por tenant/usuario/campanha antes de POST; resposta
incerta e reload mantem chave. Recibo precisa corresponder ao run/empresa/campanha.
Falha de storage nao autoriza POST sem chave; falha ao limpar apos confirmacao
mantem a identidade e exibe aviso. Corpo vazio/clientRequestId omitido continuam
aceitos por compatibilidade, mas cliente antigo sem chave nao tem replay pleno.

Worker ganhou barreiras para destinatarios vazios (que podiam virar todo o publico),
escopo/run inativo ou terminal, manifesto alterado e antecipacao de horario.
Finalizacao transacional nao conclui com staging/paused nem limpa outra execucao.
API de inicio imediato processa somente o run solicitado e nao repete ao consultar.

Evidencia: 54/54 em 32,22 s (34814), com 500 lotes e falhas de reserva/create/
ativacao, concorrencia e recibos; verificacao final enqueue/contrato 3/3 e cache
4/4 (65266). Teste final 1/1 de fechamento aguarda staging/paused e conclui apenas
apos os tres lotes, sem envio porque os destinatarios do fixture nao existem.
Tipos/lint finais aprovados (21047). Firestore local, sem envio real,
deploy/build global, teste HTTP autenticado ou UI. Gate 2 continua ABERTO.

PENDENTE: dispatch individual de campanha ainda e direto, com delivery aleatoria
apos provedor. Snapshot salvo ainda nao e usado como conteudo imutavel no legado.
findOrCreateLeadChat tambem pode converter/reapontar chat social por buscar apenas
leadId. Proxima retomada deve migrar todos os modos texto/template/midia e destino
canonico, sem substituir o objetivo por apenas admitir uma execucao. Recuperacao
integral de claims/contadores/resumos permanece na fase 3 apos gate 2 fechado.

## Fase 2: mensagens de aprovacao MCP duraveis — 19/10/2026

Turno anterior foi progresso: ecommerce automatico/manual compartilha uma entrega.
Nesta retomada respostas e inicio WhatsApp de rascunhos aprovados foram migrados
do envio direto para outbox comum, preservando permissoes/modulos/acesso comercial.
Aceite de applying + vinculo + mensagem/job no mesmo batch com CAS do rascunho.
Fingerprint aprovado, conteudo real e destino sao verificados; aprovacao e destino
sao relidos na transacao da barreira. Chave fixa por tenant/rascunho impede nova
entrega ao repetir. Inicio agora usa identidade canonica, sem doc aleatorio.

Applied exige job completed no escopo. Recibo e auditoria deterministica sao
transacionais. Repeticao retorna recibo original; resultado incerto permanece
applying, blocked e distinguido de pending. Applying legado sem protocolo nao
retoma automaticamente. Outras operacoes de aprovacao nao foram modificadas.
Template conserva displayText, com fingerprint e verificacao antes do dispatch.

Regressao 77/77 (52,31 s, 55340); 99/99 MCP/operacao/Shopify (34,10 s, 96274).
Suite MCP ampliada 22/22 (25,44 s, 86445), inclusive quatro canais de resposta,
template WhatsApp, revogacao, perda de commit/recibo e processo independente
encerrado depois de aceite ficticio, sem novo envio ao recuperar. Tipos/lint
direcionados aprovados. Repeticao final de MCP 22/22 (29,30 s, 43969) apos
endurecer tipo de tarefa. Corrida corrigida para nao aguardar escrita bloqueada
pela propria transacao pessimista do teste; teste final executa em menos de 1 s.
Contrato da rota final 1/1 (12698); tipos/lint finais aprovados (24148).

Sem admin, tela nova, deploy, build global, provedor real, HTTP autenticado de
apply ou homologacao visual. Ligacao do resolvedor canonico foi inspecionada por
contrato; primeira conversa completa pela API ainda nao e prova concluida.
Workers legados em voo e mensagens historicas incertas requerem plano de rollout.
Gate 2 aberto: campanhas/social e homologacao permanecem; reconciliacao de resumo
de aprovacao e observabilidade completas ficam para a fase 3 apos o gate anterior.

## Fase 2: uma entrega por acao comercial ecommerce — 19/10/2026

Turno anterior classificado como progresso: gateway legado e texto primario do
site corrigidos e testados. Nesta retomada a inspecao confirmou reenvio potencial
nas duas entradas de acao ecommerce (agente e rota manual), fora da outbox comum.
Ambas usam agora helper compartilhado com vinculo transacional de tenant/acao,
chat, telefone, lead, fingerprint e IDs deterministas antes de qualquer envio.
Queue/worker existentes fornecem aceite atomico mensagem/job e barreira duravel.

Envio concluido requer job completed e ID da mensagem no escopo. Pendente nao
declara done nem repete. Payload/destinatario aceitos nao mudam. Claim vencido de
protocolo novo recupera recibo; legado sem prova exige revisao, inclusive no envio
manual posterior. Worker so finaliza/falha se ainda possuir status/runId da acao.
Chats antigos sem channel permanecem compativeis; chats sociais nao sao convertidos
em WhatsApp. Lead/conversa fora do tenant e alvos ambiguos/removidos bloqueiam.

69/69 testes (16,78 s) abrangem helper em emulador, processo ecommerce real local,
politica, templates e Shopify; mais 1/1 da protecao final para claims antigos.
Tipos/lint direcionados aprovados, diff check aprovado. Contrato de fonte confirma
duas entradas; nao houve HTTP autenticado da rota manual nem crash do processo
ecommerce completo. Nada publicado, indice preparado mas nao implantado.

Riscos: workers legados em voo precisam drenagem antes de rollout; pending antigos
exigem auditoria; parametros alterados apos aceite conflitam sem regenerar mensagem.
Resumo comercial apos conclusao do job ainda precisa reconciliacao da fase 3.
Gate 2 segue aberto: campanhas, MCP apply e automacoes sociais ainda em auditoria,
alem de HTTP atualizado e UI autenticada. Sem avancar fases, admin ou novas telas.

## Fase 2: compatibilidade do gateway legado e resposta site — 19/10/2026

Turno anterior classificado como progresso: corrigiu fallback indevido do Evolution
e revalidou handoff. Esta retomada corrige tres lacunas concretas, sem admin/telas:
material KB legado agora usa URL assinada da copia imutavel com generation fixa,
resolvida apenas pelo provider legado antes da barreira; voz nao suportada vira
falha de capacidade pre-entrega elegivel para um unico texto duravel; texto
primario site_chat usa outbox em vez de addMessage aleatorio.

Pausa/origem e revalidada apos TTS antes da classificacao de capacidade. Testes
mantem canal legado no fallback e comprovam zero envios de voz. Sintese ainda
pode ocorrer antes dessa verificacao; nao afirmar economia de TTS. Falha de
assinatura retoma o mesmo artefato, enquanto entrega incerta fica em reconciliacao.

Evidencias: 57/57 emulador/regressao/crash (87,11 s); 2/2 finais assinatura/site;
52/52 contratos voz/compositor/Shopify. Typecheck/lint direcionados aprovados;
dois avisos preexistentes do agente permanecem. Nenhum build global, publicacao,
HTTP atual, LLM/provedor real ou homologacao autenticada. Gate 2 aberto.

Inventario seguinte: campanhas, ecommerce-agent, apply de rascunhos MCP e
automacoes social/service possuem chamadas fora da outbox comum. E necessario
examinar protecoes proprias e janelas de queda; busca isolada nao comprova falha
nem completude. Ver gate para caminhos, evidencias e requisitos ainda pendentes.

## Fase 2: handoff duravel e protecao Evolution — 19/10/2026

Turno anterior classificado como progresso: teste restrito por conversa ganhou
acao no inbox e 23 testes locais. Nenhuma nova publicacao nem alteracao em admin.

Confirmacao de encaminhamento agora aceita pausa/mensagem/job conjuntamente,
com CAS do estado/turno e autorizacao imutavel de uma unica confirmacao. Pausa
humana, troca de dono/prazo e novo turno revogam a excecao. Alertas sao jobs
internos por destinatario/canal, sem historico, preview, sequencia ou CRM do lead.
Fonte autoritativa sao os jobs; resumo de notificacao pode ficar desatualizado.

Nesta retomada foi demonstrado e corrigido reenvio interno indevido no Evolution:
erros genericos contendo text/valid podiam disparar segundo POST. Compatibilidade
de formato antigo agora requer HTTP 400/422 tipado, schema textMessage rejeitado
explicitamente e ausencia de ID. Timeouts, rede, 5xx e respostas ambiguas nao
autorizam fallback. Testes executam o provider real com fetch simulado fail-closed;
tambem exercitam a fila em Firestore local e comprovam um job/mensagem, pendencia
reconciliation_required e ausencia de novo envio no replay.

Evidencias atuais: 32/32 conector/contratos; 10/10 ai-text-delivery em emulador;
52/52 voz/compositor/Shopify; handoff reexecutado 12/12. Tipos e lint direcionados
aprovados; build global nao executado. Nao substituem agente completo com LLM ou entrega
real. Gate 2 aberto: faltam compatibilidade de materiais/voz do gateway legado,
texto primario site_chat, inventario integral de entradas/provedores, HTTP de
snapshot atual e UI autenticada. A publicacao parcial anterior do funil e distinta;
estas alteracoes nao foram publicadas. Ver CONVERSAS_GATE_2_ATUAL.md.

## Fase 2: materiais da base migrados — 19/10/2026

- Turno anterior classificado como progresso: voz da IA e fallback aprovados.
  Nesta retomada materiais selecionados por selectMediaDocForLead foram migrados
  do envio direto para ai_knowledge_media, sem mudar selecao comercial/Shopify
  nem criar telas ou alterar app/admin.
- Aceite atomico mensagem/job, fingerprint de referencia do KB, URL, caminho,
  tipo, legenda e nome. Cada turno possui um slot de material; repeticao com
  outro conteudo conflita em vez de criar outro envio. sourceMediaUrl fica no
  historico para manter a deduplicacao comercial apesar do novo path privado.
- KB precisa pertencer ao tenant, estar ativo e ainda referenciar a midia nao
  bloqueada. Storage fonte so pode ser kb-media/tenant. Copia create-only em
  chat-media/tenant/chat e vinculada por transacao que confere lease/escopo/job;
  retomada verifica hash/geracao/tamanho/bucket/MIME e nao refaz copia aceita.
- Download externo usa Node HTTP(S), IP publico resolvido e fixado em lookup,
  agent:false, sem credenciais/cookies, redirecionamentos verificados individualmente,
  timeout e limite de bytes; rejeita enderecos internos/reservados e downgrade.
  Referencias de API consultadas: [Node HTTP request](https://nodejs.org/api/http.html#httprequesturl-options-callback)
  e [Node BlockList](https://nodejs.org/api/net.html#class-netblocklist). Mecanismo Node existente,
  sem nova dependencia. DNS e sockets externos sao simulados nos testes.
- Dispatch de midia agora preserva isolamento de conta/canal Instagram/Messenger,
  como o de texto. Legenda e anexo usam duas tarefas persistentes encadeadas,
  preservando a experiencia anterior. Anexo nao passa por legenda nao confirmada;
  reprocessar nao repete legenda ja entregue. Nao e transacao atomica multi-envio.
  WhatsApp usa upload + media ID; site_chat grava localmente sem URL assinada.
- onDeliveryAttempt revalida KB e barreira de IA antes do provedor. Falha de preparo
  comprovada permite apenas o slot asset_failure; incerteza, escopo, pausa, fonte
  revogada ou integridade nao disparam texto alternativo. Fallback deixou de prometer
  equipe avisada sem recibo. Metodo do agente foi verificado por contrato estatico,
  nao por execucao completa do LLM.
- Novos testes: ai-knowledge-media (11), chat-public-asset (5), crash incluindo
  ai_knowledge_media. Regressoes finais 67/67 em 79,75 s, handle 4028; cobre
  concorrencia, quatro canais, fonte alterada, midia/metadados adulterados, links
  com DNS fixado, pausa/novo turno/revogacao durante preparo, falta de ID e queda
  abrupta apos aceite ficticio. Seis suites puras/contratos voz/compositor/Shopify:
  52/52 em 3,32 s. Tipos e lint aprovados (67985), dois avisos anteriores no agente.
  Diff check final aprovado.
- Sem entrega real Meta, download externo real, TTS real, novo deploy, novo snapshot
  HTTP ou homologacao visual. Orfaos antes do checkpoint e inventario/quotas/expurgo
  ficam registrados para a fase 6; nao declarar retencao pronta. Gate 2 aberto,
  handoff/alertas e criterios de homologacao ainda pendentes; sem avancar fases.

## Fase 2: migracao da voz gerada pela IA — 19/10/2026

- Turno anterior foi progresso comprovado: barreira duravel + correcao audio manual.
  Nesta retomada agent.ts chama deliverAiConversationVoice em vez de enviar/salvar
  depois do provedor. Sem mudar configuracao de voz, chamada TTS, Shopify ou admin.
- Aceite atomico antes de sintese: job ai_voice e uma mensagem com transcricao,
  autoria IA e estado queued; fingerprint de origem/texto/voz/limite/transcricao.
  Worker guarda par OGG/Opus + MP3 unico por preparo, vincula ambos com lease/token,
  e publica o caminho de playback na mensagem ANTES de qualquer envio externo.
- Retomada verifica escopo tenant/chat/mensagem, bucket permitido, geracao, tamanho
  e SHA dos dois arquivos. Artefato aceito nao e regenerado/sobrescrito por replay.
  Queda antes do checkpoint pode gerar novo par e deixar staging orfao; prefixo
  chat-media/tenant/chat mantido para inventario/expurgo posterior (fase 6 aberta).
- Guardas de pausa humana/turno/preco-estoque sao repetidas apos preparo. Confirmacao
  usa a barreira persistente anterior; HTTP sem identificador nao completa a voz.
  AiVoicePreparationError so nasce em falha de sintese antes do provedor; so esta
  classe permite fallback no agente. Erros incertos/de integridade nao viram texto.
- Fallback textual e antigos ramos secondary/checkout de voz agora usam slots de
  deliverAiConversationText. Mensagem de audio nao e acrescentada novamente pelo
  agente depois do worker. AI enabled/owner/contexto commerce preservados.
- Nova suite ai-voice-delivery: concorrencia/replay, aceite antes do TTS, arquivos
  antes do provedor, autoria, duracao WAV, perda de ack, preparo falho + texto
  idempotente, pausa/novo turno durante TTS, retomada e artefatos adulterados.
  Contrato do callsite do agente e estatico, NAO execucao completa com modelo.
- Fixture de queda inclui ai_voice: processo filho encerra com exit 71 apos aceite
  ficticio do provedor; outro processo recupera sem segundo TTS/upload/voz.
  Primeira regressao 49/49 (76,57 s). Revisao final com HTTP sem message ID:
  50/50 (86,67 s), handle 14425 concluido com exit 0. Outras seis suites puras
  voz/compositor/Shopify: 52/52 (5,92 s), sem consulta a loja ou modelo reais.
  Tipos iniciais corrigidos (Record<string, unknown> convertido em entrada explicita);
  repeticao final de tipos passou, lint zero erros e dois avisos preexistentes
  (doc/incompatibleIds no agente, handle 18456 concluido). Diff check aprovado.
- Provedores TTS e Meta simulados fail-closed; ffmpeg/Firestore/Storage reais locais.
  Sem envio/cobranca real, nova publicacao, homologacao UI ou novo snapshot HTTP.
  Helpers legados sem chamador nao foram removidos por compatibilidade.
- Gate 2 aberto. Proximos caminhos reais: materiais da base e handoff; fases 3–9
  nao aprovadas. Nao somar testes antigos como se fossem nova homologacao completa.

## Fase 2: barreira duravel antes do provedor e audio manual — 19/10/2026

- Turno anterior classificado como progresso: templates e HTTP autenticado aprovados.
  Gate continua aberto. Inspecao do audio encontrou barreira apenas em memoria e
  incompatibilidade entre URL de audio enviada pelo worker e conector Meta.
- Dispatch aguarda callback assincrono que registra providerAttemptStartedAt/Id/Count
  por transacao, validando dono, prazo, tenant, conversa, mensagem e fingerprint da
  operacao. Nenhuma chamada ao conector pode preceder essa gravacao.
- Pos-queda: tarefa com tentativa persistida vai para reconciliation_required, sem
  chamada externa. Lease vencido anterior ao protocolo ou prova de posse divergente
  tambem e incerto. Prova de protocolo e vinculada ao token do lease, nao so a versao
  do enqueue (um worker antigo pode processar uma tarefa criada por versao nova).
- Finalizacao usa posse da tarefa E lock; worker antigo nao pode sobrescrever
  novo dono. Falha/mensagem sao atualizadas na mesma transacao. Leitura/entrega ja
  confirmada permanece. Confirmacao humana obrigatoria antes de reprocessar tentativa
  incerta; contador cumulativo e ultima tentativa anterior sao mantidos.
- Audio manual envia os bytes verificados/convertidos para upload do conector e
  depois media ID, em vez de URL nao suportada. OGG/Opus nativo + MP3 no player,
  com tamanho do playback correto. Testes usam ffmpeg e Storage Emulator reais;
  assinatura de URL propositalmente proibida no teste positivo de audio.
- Novas suites: chat-outbound-crash-recovery (7 casos) e chat-audio-dispatch (2).
  Processo filho encerra com exit 71 apos aceite ficticio, sem catch/finally; outro
  processo recupera sem segundo envio. Testes cobrem tambem perda do ack da gravacao
  da barreira, posse perdida, legado/rolling deployment e preservacao de leitura.
- Iteracoes de teste: prefixo errado da fixture corrigido antes de provar queda;
  suite antiga idempotency sem FIRESTORE_EMULATOR_HOST falhou procurando credencial
  padrao. Fixada para sempre usar projeto demo/emulador e zerar credenciais.
  Primeira regressao completa posterior: 41/41 (57,27 s). Repeticao final apos prova
  de protocolo vinculada ao token (incluindo prova antiga divergente): 41/41,
  61,64 s, handle 30311 concluido. Ultima repeticao direcionada de tipos/lint
  no handle 31491 concluida com exit 0, sem diagnosticos; diff check aprovado.
- Snapshot QA 1792423979159 e os 9 HTTP da rodada anterior estao desatualizados
  para os tres modulos alterados. Servidores QA continuam isolados; nenhum deploy
  ou alteracao de app/admin, conta de cliente, Meta ou OpenAI nesta rodada.
- Audio gerado pela IA, fallback de voz, materiais e handoff ainda exigem migracao
  e testes. Fases 3–9 nao foram iniciadas/aprovadas por conta destas correcoes.

## Retomada da fase 2 apos publicacao — 19/10/2026

- Progresso do turno anterior: publicacao parcial concluida, sem encerrar a missao.
  Fase 2 permanece aberta; nenhum avanco para fila/CRM/identidade/retencao seguintes.
- Templates manuais passaram pelo aceite atomico mensagem/job, fingerprint de
  nome/idioma/variaveis/cabecalho e estados persistentes. Chave repetida com conteudo
  diferente gera conflito; sem confirmacao do provedor exige reconciliacao, sem
  reenvio cego. Preview enfileirado diz Template, nao Template enviado.
- Migrado tambem o follow-up por template da IA fora da janela de 24h. A configuracao
  whatsappTemplateFollowUpEnabled/Name/Language/Params do agente foi preservada.
  Identidade estavel por tenant/chat/origem/slot, aiGenerated, sem pausar a propria
  IA ou atribuir o lead a altum_ai. Agente reutiliza o registro persistido em vez
  de acrescentar outra mensagem depois da chamada externa.
- Worker aplica a templates a mesma barreira de turno mais novo/pausa humana dos
  textos. Fingerprint da origem protege alteracoes apos aceite. Confirmacao usa
  persistChatMessageAcknowledgement: leitura recebida antes do ack nao regride.
- Evidencia atual: 19/19 em tres suites de emulador (18,28 s), incluindo templates
  manuais, template IA, recibo antecipado, perda de ack, pausa/supersessao e regressao
  dos textos IA WhatsApp/Instagram/Messenger. Conector Meta simulado fail-closed;
  sem entrega real ou chamada a modelos/Shopify. Tipos direcionados passaram;
  lint sem erros (dois avisos anteriores doc/incompatibleIds no agente).
- Novo snapshot QA 1792423979159, 1.316 arquivos conferidos por hash, sem .env,
  servidor independente 127.0.0.1:3201 (handle 98592). Teste HTTP 88923 concluido:
  9/9 passaram (122,20 s), com contas ficticias e fence de entrega. Inclui API real
  de templates com 401/403, entradas invalidas sem efeitos, seis replays convergentes,
  conflito 409 e uma mensagem/job; oito regressoes de midia/Storage/SDK passaram.
  Nenhuma tentativa de envio externo (attempts=0). Servidor antigo 3199/proxy 3198 e aba
  do usuario nao foram substituidos. Teste valida hashes de 13 arquivos criticos.
- Limites: nao e prova do agente completo com LLM, nem de UI/refresh da pagina ou
  envio real Meta. Cabecalho por URL fixa a referencia, nao bytes remotos imutaveis.
  Faltam migrar/validar audio e fallback de voz, materiais da base, handoff/alertas
  e demais caminhos diretos; CRM observer dos templates fica como pendencia da fase 4.
  Nenhuma mudanca desta retomada foi publicada em producao ou feita em app/admin.

## Publicacao parcial estavel — 19/10/2026

- Pedido: publicar o validado para configurar clientes e continuar depois.
  Escopo comunicado: apenas a correcao do funil; outbox/IA e demais alteracoes
  locais pendentes NAO foram publicadas nesta entrega.
- Baseline: dpl_HdgNAJo5QTyXMNbmRqRGiv4cHSKm (lf-response-pause-control).
  Promovida: dpl_ASLb3ibMcBiRWMXfrLLhR7qWoAqs, READY, dominio altumia.com.br
  confirmado pela API apos promocao. Shopify e demais 1.422 arquivos preservados
  por referencia exata da producao anterior.
- Tres arquivos publicados: app/cliente/painel/crm/page.tsx,
  app/cliente/painel/pipeline/page.tsx e lib/crm-pipeline-view.ts. Conteudo
  normalizado comparado com os arquivos testados: identico. Sem deploy do checkout
  inteiro ou mudancas de banco, regras, indices, variaveis ou credenciais.
- Build remoto aprovado: compilacao, TypeScript e 372 paginas. Quatro testes de
  visualizacao passaram novamente; lint direcionado sem diagnosticos.
  Candidato: login/CRM/funil HTTP 200 e API sem autenticacao HTTP 401.
  Pos-promocao: inicio, login, CRM Kanban, editor de funil e inbox HTTP 200;
  API de pipeline sem autenticacao HTTP 401. Prova de disponibilidade, NAO de
  sessao autenticada/interacao visual. Nenhum dado de cliente editado.
- Candidata anterior nao promovida dpl_3eyokrVcvAL6xPNuTycheytNpALv descartada
  na revisao: git apply em subdiretorio nao aplicou deltas. Destino explicitado e
  verificacao de aplicacao adicionada antes de gerar a candidata final.
- Evidencias: .qa-artifacts/client-pipeline-release-20261019/manifest.json e
  receipt.json; scripts/release-client-pipeline.mjs. Baseline concorrente
  conferida antes do deploy e da promocao. Rollback de referencia: baseline acima,
  condicionado a conferir versao atual antes de qualquer reversao.
- Fase 2 permanece aberta. Esta publicacao nao homologa a missao inteira nem
  envios reais Meta, CRM passivo, campanhas, retencao ou testes visuais pendentes.

## Atualizacao de execucao — 19/10/2026

### Correcao priorizada pelo usuario: funil salvo versus Kanban do CRM

- Evidencia: CRM ja buscava /pipeline, mas chamadas getPipelineStageLabel omitiam
  etapas do tenant e usavam rotulos globais. stageOptions ainda injetava captado
  antes do funil customizado. Assim, salvar nomes nao atualizava cabecalhos/seletores.
- CRM agora resolve nomes com configuracao carregada em desktop/mobile, filtros,
  ficha e seletores. Colunas seguem position salvo e cor configurada; Captado nao
  e forcado se nao configurado/populado. Etapas legadas com negocios sao mantidas
  depois das configuradas, sem mover, excluir ou reescrever leads existentes.
- Ao voltar a janela/aba, etapas sao recarregadas. Editor emite evento local de
  sucesso por tenant; CRM escuta, aborta consulta substituida e protege resposta
  tardia de outro tenant. Falha ao carregar /pipeline mostra erro em vez de assumir
  silenciosamente etapas vazias. Novo cliente inicia na primeira etapa configurada.
- Quatro testes puros/contratos passaram; tres testes reais Firestore Emulator
  passaram (19,58 s), incluindo salvar/ler nomes/ordem/cor e usar mesmo modelo de
  colunas, sem reescrever etapa do lead. Tipos do CRM/pipeline aprovados sem
  diagnosticos; lint inicial e repeticao apos ajuste de cor/abort sem diagnosticos
  (43621 concluido). Nao houve validacao visual no browser ou publicacao.
- Escopo: somente UI cliente/helper e testes, sem modificar admin, API, banco real
  ou configuracao da empresa mostrada na captura. Usuario priorizou essa correcao;
  nao representa encerramento ou avanco do gate 2 da missao maior.

### Texto IA Instagram/Messenger na outbox e vinculo explicito da conta — gate 2 aberto

- Ramificacao de resposta normal Meta social agora chama deliverAiConversationText
  para primary e usa mesmos caminhos secondary/checkout ja protegidos. Nao cria
  addMessage duplicado apos worker. Conector preserva channel, metaMessageId e
  aiGenerated, com observacao ai_outbound, sem pausar IA ou alterar responsavel.
- Encontrado fallback perigoso: getMetaChannelForTenant pode devolver outro canal
  ativo quando channelId explicito nao e encontrado/pertence a outro tenant. Sem
  alterar lookup global, conector de envio agora exige correspondencia com ID da
  conversa e, se presente, conta externa. Divergencia e preflight permanente antes
  da chamada externa. Legado sem identificacao explicita mantem comportamento
  anterior; escolha ambigua de conta legada ainda pertence a revisao de identidade.
- Suite social+WhatsApp texto IA+Shopify **31/31 (18,19 s)**. Regressao seguinte
  incluindo canal estrangeiro real de fixture, texto/midia e historico **17/17
  (30,38 s)**. Destino Meta simulado/fetch externo nao encaminhado: duas redes
  usam mesmo ID ficticio de destinatario com tokens distintos; verificam payload,
  chave/slots, texto original, autoria IA, continuidade habilitada e responsavel
  humano preservado. Resultado incerto fica reconciliation_required com uma
  chamada; canal/conta ausente ou estrangeiro nunca vira envio por outra conta.
- Testes exercitam helper/conector/worker reais e banco emulador, nao decisao
  completa handleIncomingMessage/modelo, login/OAuth ou mensagens reais Meta.
  Midia social/story visual, handoff, templates, voz/fallback e campanhas ainda
  fora desta migracao. Nao afirmar suporte completo de todos os envios sociais.
- Typecheck concluiu sem diagnosticos; lint concluido zero erros/dois avisos
  fora da mudanca (handle 45833).
  Lint anterior (50337) concluiu zero erros/dois avisos existentes fora da mudanca.
  Diff check sem erros. Snapshot servido antigo, sem HTTP/UI/build atuais e sem
  publicacao. Gate 2 continua aberto.

### Supersessao e validade do catalogo durante espera na outbox — gate 2 aberto

- Job de texto IA agora guarda aiSourceMessageId; worker consulta coordenador
  tenant/chat antes da chamada externa e recusa resposta vinculada a mensagem
  anterior quando latestMessageId mudou. Coordenador com escopo estrangeiro e
  bloqueado como falha de integridade; ausencia do coordenador mantem compatibilidade
  com fluxo legado, portanto nao e garantia absoluta em todos os pontos de entrada.
- Agente transmite prazo absoluto checkedAt+30s quando resposta usa preco/estoque
  Shopify verificados, reutilizando validade ja existente no composer. Worker
  recusa apos expirar, antes de chamar canal. Prazo e gravado no primeiro enqueue;
  replay nao o estende. Resposta generica de recuperacao sem preco/estoque verificados
  nao recebe esse prazo de catalogo. Nenhuma mudanca na consulta/credenciais Shopify.
- Fonte inbound participa do fingerprint ai-text-v1; humano permanece text-v1,
  preservando compatibilidade. Verificacao e preflight, nao lock distribuido com
  provider: nova mensagem/expiracao durante chamada externa ainda exige tratamento
  proprio; nao prometer cancelamento de uma entrega ja aceita.
- Suite **45/45 (33,64 s)**: texto IA/worker + Shopify conversa/live. Novos casos
  simulam espera por predecessor, nova mensagem enquanto aguardando, liberacao e
  bloqueio antes do provider; prazo expirado e replay tentando renova-lo; escopo
  estrangeiro do coordenador. Destino simulado, banco real no emulador.
- Repeticao direcionada incluindo prazo valido/preservado e historico concluiu
  **9/9 (24,09 s)**, handle 66698. Typecheck concluiu sem diagnosticos; lint
  concluido zero erros/dois avisos fora da mudanca (50337). Suites se sobrepoem,
  nao somar como cenarios independentes.
- Escopo segue parcial: WhatsApp texto normal; handoff/templates/audio/voz/midia/
  Meta social e teste completo agente+Shopify ainda pendentes. Job invalidado fica
  dead_letter com erro permanente, nao e reenviado automaticamente nem se diz
  entregue. Regeneracao/substituicao da resposta exige proximo fluxo/revisao.
  Snapshot servido anterior, sem HTTP/UI/build atuais, nada publicado, gate aberto.

### Primeira integracao real da IA com a outbox — gate 2 aberto

- Texto normal da IA no WhatsApp com janela aberta (sem resposta em voz) passou
  a usar deliverAiConversationText, nao sendText direto. Nessa ramificacao,
  secundaria e checkout usam slots duraveis separados e nao criam outro addMessage.
  Chave e SHA-256 da origem inbound+slot, isolada por tenant/chat no ID da outbox;
  retry com texto diferente conflita, nao cria nova entrega.
- Outbox recebeu origem interna ai: mensagem aiGenerated, fingerprint ai-text-v1,
  worker/CRM com source ai_outbound. Enqueue e worker nao pausam IA nem atribuem
  atendimento a altum_ai; comportamento humano padrao continua pausando. Worker
  revalida pausa humana antes de entregar IA e bloqueia permanentemente se pausada.
- Helper exige job completed antes de permitir fluxo posterior; ready/retrying/
  reconciliation_required/dead_letter geram erro de entrega nao confirmada, sem
  fallback direto. Outbox continua responsavel por retry/reconciliacao. Interacao
  com tentativas e limite da fila de IA ainda precisa de homologacao abrangente.
- Suite inicial **36/36 (14,10 s)**; apos incluir pausa humana, fingerprint
  separado e historico, **39/39 (36,25 s)**: helper com worker/Firestore reais,
  slots unicos, contexto commerce preservado, IA habilitada sem humano artificial,
  observador correto, resultado incerto com uma chamada apenas, humano pausa e
  IA respeita pausa. Destino Meta simulado; nenhuma entrega externa real.
- Tipo/lint da primeira revisao concluidos: sem erro de tipos, zero erros lint e
  os mesmos dois avisos do agente fora desta alteracao. Typecheck final com
  fingerprint/pausa concluiu sem diagnosticos; lint final emitiu zero erros e os
  mesmos dois avisos fora desta mudanca (handle 60559). Diff check sem erros.
- Escopo NAO migrado: handoff/alertas, templates fora da janela, audio e fallback
  de voz, midia proativa, Meta Instagram/Messenger e ramificacoes legadas ainda
  enviam diretamente. Tambem falta tratar supersessao/frescor depois de espera
  na outbox, retry do agente e teste real de handleIncomingMessage com Shopify.
  Os testes exercitam helper real, nao toda a decisao/modelo da IA.
- Nao alteradas funcoes de consulta/estoque/preco Shopify. Codigo novo nao esta no
  snapshot servido, sem prova HTTP/UI/build atuais, sem publicacao. Gate aberto.

### Compatibilidade Shopify e historico integral da IA — gate 2 aberto

- Revisao local solicitada pelo usuario, sem atribuir autoria das mudancas pelo
  simples diff: catalogo vivo filtra conexao/tenant, consulta sob ferramentas
  permitidas e grava commerceInterest/contexto separado, sem tratar consulta como
  venda/receita. Essa separacao e compativel com observador CRM passivo existente;
  falta prova ponta a ponta com loja real e todos os caminhos comerciais.
- Suite inicial Shopify + texto/midia **48/48 (13,60 s)**, sem mudar Shopify.
  Detectadas duas lacunas reais no agente: envio direto ao provider fora da
  outbox reforcada e gravacao de historico por sanitizeText(text,1800), que tambem
  achata quebras de linha. Envio direto ainda NAO foi unificado nesta rodada.
- Correcao minima no gravador addMessage: preserva texto original e formatacao,
  recusando apenas texto vazio sem midia. Nenhuma mudanca de consulta de catalogo,
  filtros de estoque, preco, interpretacao, configuracao de tenant ou credenciais.
  Exporta alias recordAiConversationMessage para exercitar gravador real.
- Suite atual **44/44 (15,15 s)**: Shopify, worker texto e dois casos de historico
  real no Firestore Emulator. Resposta sintetica >1.800 caracteres fica integral
  no documento e lastMessage, incluindo link final, emoji, linhas e espacos;
  commerceConversationContext preservado e observacao CRM vinculada ao mesmo ID.
  Sem envio a loja/WhatsApp real. Audio sem texto e sistema continuam registrados;
  texto so com espacos nao cria mensagem. Teste nao prova tela nem envio real da IA.
- Primeira rodada 43/44 por erro de fixture (texto sintetico ainda <1.800), antes
  de chamar gravador nesse caso; ampliado fixture para realmente cruzar limite.
  Nao contar primeira rodada como sucesso nem como defeito do produto.
- Typecheck concluiu sem diagnosticos; lint concluiu com zero erros e dois avisos
  de variaveis nao usadas em trechos do agente nao alterados nesta correcao
  (doc e incompatibleIds). Handle 10035 concluido. Lint anterior (86364)
  concluiu sem diagnosticos. Snapshot servido nao inclui estas mudancas.
  Pendente integrar a IA na entrega duravel sem alterar logica Shopify, preservar
  flags aiGenerated/CRM e tratar resultado incerto. Gate aberto, nada publicado.

### Referencia de resposta validada antes do canal — gate 2 aberto

- sendTenantChatText agora revalida tenant/chat/existencia da mensagem citada
  ANTES de selecionar/chamar canal, em vez de depois do retorno do provider.
  Resolve o caso em que referencia removida/movida durante espera na fila causava
  envio externo seguido de falha local e reconciliation_required desnecessario.
- Testes reais de enqueue/worker/Firestore, destino Meta simulado e nenhum fetch
  externo encaminhado: referencias apagadas, movidas para outro chat ou outro
  tenant ficam dead_letter/PREFLIGHT_PERMANENT antes da chamada; mensagem visivel
  fica failed e reconciliationReason permanece null. Referencia valida envia uma
  vez, preserva replyToId e worker repetido retorna skipped sem segunda entrega.
- Regressao ampliada de texto/midia/inicio WhatsApp **25/25 (38,78 s)**. Depois
  incluido o mesmo caso em midia, cujo conector ja validava antes de provider:
  suite texto/midia **11/11 (40,22 s)**, incluindo tres mutacoes por tipo. URL de
  midia ainda pode ser assinada antes dessa checagem; teste nao afirma ausencia
  de assinatura. Nao e prova de exibicao da citacao no WhatsApp real.
- Limite: validacao e preflight, nao transacao distribuida com provider. Mudanca
  concorrente apos a leitura e durante chamada externa continua possivel; nao
  prometer rollback de entrega ou lock de banco abrangendo uma chamada de rede.
- Typecheck e lint dessa rodada concluiram sem diagnosticos (handle
  86364). Lint anterior de integridade do texto (12860)
  concluiu sem diagnosticos. Codigo novo ainda fora do snapshot servido; HTTP/UI/build atuais
  continuam pendentes. Gate permanece aberto e nada publicado.

### Gate atual: integridade do texto ate o conector e pendencias objetivas

- Worker deixou de cortar claimed.text/claimed.replyToId silenciosamente. Valida
  limites e referencia antes do conector e compara fingerprint text-v1 persistido
  com conteudo atual quando disponivel. Divergencia e falha permanente de
  integridade antes da tentativa externa, sem retry automatico. Legado sem
  fingerprint ainda passa por validacao de formato; nao comprova bytes anteriores.
- Suite texto/handlers/start **22/22 (29,07 s)**, tres novos casos no worker:
  texto no limite chega integral ao payload Meta simulado uma unica vez; alteracao
  de mesmo tamanho apos aceite e bloqueada; job legado com excesso ou referencia
  invalida e recusado antes do provider. Nenhuma chamada externa e encaminhada.
- Primeira execucao 21/22: teste esperava processed=0 para job terminal, mas a API
  existente retorna um resultado skipped (processed=1). Ajustado somente o teste
  para assertar skipped + contador de chamadas ao provider inalterado; nao foi
  mudado o comportamento do worker para esconder a falha.
- Criterios atuais da fase 2, sem substituir o objetivo:
  - aceite persistente/atomicidade, chave estavel, concorrencia e conflitos:
    evidencias locais existentes; falta repetir HTTP no baseline com texto/chaves novos;
  - integridade de anexo e texto, recuperacao de confirmacoes: provas locais e
    destino simulado; audio positivo e assinatura/download cloud reais nao comprovados;
  - comportamento visivel de estados, retry, rascunho e recarga: homologacao
    desktop/mobile ainda pendente; acesso automatizado bloqueado, sem bypass;
  - verificacoes de codigo: typecheck direcionado concluiu sem diagnosticos;
    lint daquela revisao concluiu sem diagnosticos (handle 12860);
    build global atual pendente.
- Inspecao do conector identificou outra pendencia concreta (corrigida e testada
  na rodada acima): texto validava a
  referencia da mensagem respondida APOS chamar o provider. Enqueue ja valida no
  aceite, mas referencia removida/movida entre aceite e entrega precisa de teste
  e validacao antes da tentativa externa. Ver escopo/limite na rodada acima.
- Titulos APROVADA EM CODIGO E EMULADOR de 13/10 mais abaixo sao historicos, nao
  aprovacao atual nem autorizacao para pular fases. Gate 2 segue reaberto; gates
  posteriores nao estao homologados por estas suites. Nada publicado.

### Texto sem corte silencioso e referencia de resposta validada — gate 2 aberto

- Confirmada outra divergencia no aceite: queueTenantChatText usava clean(text,
  4000), cortando o final sem avisar. Novo validador recusa texto acima do limite
  existente, vazio ou de tipo invalido. Preserva trim legado nas extremidades e
  todas as quebras/Unicode internos. Nao implementa segmentacao de mensagens.
- Referencia replyToId no texto agora e validada sem truncamento; tipos invalidos,
  mais de 180 caracteres, barra/quebra de linha sao recusados. Referencia valida
  ainda passa pelos controles de pertencimento tenant/chat do enqueue existente.
- Rota de texto trata JSON malformado, null, array e primitivos com 400 /
  INVALID_OUTBOUND_PAYLOAD, em vez de erro 500 ou coercao. Mesmo validador no
  servico protege chamadas internas antes de qualquer escrita.
- Suite de regressao texto/chaves/outbox/start **30/30 (37,93 s)**. Teste ampliado
  depois com persistencia de texto no limite: **8/8 (10,07 s)**. Teste autenticado
  invoca handlers reais (nao servidor HTTP): dez recusas de payload adicionais,
  alem das 18 de chave, sem efeito duravel; depois servico grava 4.000 caracteres
  com quebra e emoji identicos em mensagem/job, replay retorna mesma operacao,
  texto com um caractere extra e recusado sem incrementar sequencia.
- Lint/tipos da implementacao e verificacao final com a assercao adicional de
  persistencia aprovados sem diagnosticos. Snapshot servido continua revisao anterior, sem
  novas correcoes de chave/texto. Sem prova visual nova e sem publicacao.
  Homologacao autenticada desktop/mobile, build global e demais gates pendentes.

### Identificacoes de envio sem truncamento — gate 2 aberto

- Confirmada falha: normalizador e rotas de midia cortavam clientRequestId em
  180 caracteres, permitindo que chaves longas diferentes compartilhassem a mesma
  identidade. Valores nao-string podiam virar nova identidade aleatoria.
- Normalizador agora recusa tipos invalidos, caracteres invalidos e comprimento
  fora de 8–180; erro tipado INVALID_OUTBOUND_REQUEST_ID. Texto e ambas as rotas de
  midia devolvem 400; multipart/JSON sao validados sem truncamento antes de upload/
  admissao. Omissao/null/branco continuam gerando UUID para clientes legados;
  esses clientes sem chave estavel NAO ganham deduplicacao entre requisicoes.
- Teste autenticado com Auth/Firestore/Storage locais e handlers reais: 18
  requisicoes invalidas (seis por rota) retornaram 400, nenhuma mensagem/job/
  admissao/lock/blob ou incremento de sequencia. Handlers invocados diretamente:
  NAO e teste HTTP atraves do servidor Next nem evidencia visual.
- Suite admissao/imutabilidade/chaves: **16/16 (18,97 s)**. Suite seguinte de
  outbox/inicio WhatsApp/chaves: **27/27 (25,44 s)**. Suite pura de chaves e upload/
  tentativa: **30/30**. Ha sobreposicao; nao somar como 73 cenarios independentes.
  Lint e typecheck direcionados incluindo novos testes e tres rotas sem diagnosticos.
- Nova correcao ainda NAO esta no snapshot 1792417470220 servido no laboratorio.
  HTTP anterior continua evidencia da revisao anterior, nao desta. Sem publicacao.
  Validacao visual, build global e demais criterios abertos seguem pendentes;
  nao houve nova tentativa de contornar a protecao do navegador nesta rodada.

### Recuperacao da confirmacao do proprio upload — gate 2 aberto

- Tela agora consulta metadados autenticados do mesmo objeto quando o upload
  falha/expira. Somente storage/object-not-found prova ausencia. Erro de rede ou
  permissao durante essa consulta preserva arquivo/tentativa e nao escolhe outro
  transporte. Se objeto existe, prossegue pelo aceite original; presenca NAO e
  prova de integridade: API continua verificando SHA-256 do File original.
- `sendInboxDirectMedia` compartilha upload/consulta entre tentativas simultaneas
  e reaproveita o recibo apos recuperacao. API rejeitando conteudo divergente nao
  dispara fallback. Bytes privados continuam apenas em memoria no cliente.
- Suite conjunta **35/35 (41,92 s)**: 26 testes de digest/tentativa/upload,
  um caso SDK autenticado e oito casos HTTP. Caso novo faz upload SDK real,
  injeta perda da conclusao APOS commit real, consulta Storage real e chama API
  autenticada real. Injeta perda do primeiro aceite APOS resposta 200 real e
  retenta: uma subida, uma consulta, duas chamadas HTTP, uma mensagem/job/admissao,
  mesmos bytes e geracao. Worker bloqueado por reserva antes de qualquer provider.
  Injecoes nao equivalem a falha fisica de rede ou crash de navegador.
- Lint/tipos incluindo pagina e testes aprovados. Nova copia isolada
  .qa-artifacts/inbox-snapshot-1792417470220, 1.299 arquivos e hashes conferidos,
  sem .env; servidor 3199 pronto (handle 92050, PID 11912).
  Repeticao HTTP desse baseline concluiu **8/8 (123,67 s)**, incluindo recuperacao
  SDK/API com as duas perdas injetadas. Primeira etapa incluiu compilacao lazy:
  65 s para checagens de autorizacao, primeira chamada ~60 s/54 s de compilacao.
  Isso nao e medida de desempenho de producao nem prova do timeout visual.
- Seed Alpha/Beta restaurado: dois chats/440 mensagens por empresa, ambos
  preservados. `qa-fence-inbox-delivery.mjs` criou quatro reservas de entrega de
  duas horas em chats verificados inbox-v1; nao afirma ausencia de canais cadastrados.
  Proxy 3198 reativado (handle 9131, PID 13632); portas 3198/3199 verificadas ouvindo.
  Stdin desse handle fechado: comando status
  nao foi executado; isso NAO prova encerramento do proxy nem teste de outage.
- UI nao homologada: CUA recusou adquirir a aba existente por URL policy; nenhum
  navegador alternativo, leitura de DOM por outro meio ou bypass tentado.
  Solicitada abertura manual de 3198/cliente/painel/inbox?chatId=qa-altum-alpha-chat-1,
  sem enviar mensagem. Recarga/reinicio, desktop/mobile, audio positivo, assinatura/
  Meta real e build global continuam pendentes. Nao fechar fase por estes testes.

### Admissao verificada para upload direto — continuidade do gate 2

- `queueTenantChatStoredMedia` agora calcula SHA-256 de uma leitura presa a geracao
  do objeto ja enviado pelo navegador, verifica tenant/chat/job e tamanho, e cria
  admissao imutavel antes do enqueue. Nao copia nem regrava o objeto do cliente.
  Worker existente passa a validar esses novos envios como upload_admission.
- Conversas calcula SHA-256 do File original via WebCrypto (resultado reutilizado
  por File). API compara digest recebido com bytes do Storage; digest malformado
  e 400; alteracao e 409. Parametro opcional para clientes legados: nesse caso
  vincula bytes existentes no aceite, nao comprova conteudo anterior ao aceite.
- Replays validam metadados de job legado antes de vincular admissao, para impedir
  que legenda/nome divergentes contaminem a operacao. Mesmo caminho com bytes
  alterados apos aceite e bloqueado. Sem relaxar regras create-only do Storage.
- Suite ampliada corrigida: **40/40**, 27,98 s: admissao direta cinco, worker cinco,
  outbox sete, SDK autenticado um, digest/retry seis, tentativas sete e upload nove.
  Recuperacao admissao-sem-job usa estado reconstruido, NAO simula crash real.
- Primeira execucao ampliada falhou (33 passaram/8 falhas, incluindo hook): teste
  antigo de outbox dependia de FIRESTORE_EMULATOR_HOST externo. Falhou ao procurar
  credenciais default; nao e evidencia de regressao funcional nem teste aprovado.
  Reexecucao acima usou todos os endpoints locais explicitos e projetos demo.
- HTTP autenticado atualizado: **7/7 (71,97 s)** em `tests/chat-media-send.http.mts`,
  quatro casos multipart e tres de send-stored-media. A nova rota rejeita anonimo
  401, viewer/outro vendedor 403, caminho/digest malformados 400 e digest divergente
  409 sem criar job/admissao. Aceite e seis replays mantem um objeto original,
  geracao, job, mensagem e admissao; legenda/nome/hash alterados e adulteracao
  administrativa dos bytes apos aceite retornam 409 sem mudar o digest aceito.
  Requisicao legada sem digest continua compativel. Nenhuma tentativa de provider.
- Nova copia isolada .qa-artifacts/inbox-snapshot-1792416892131: 1.299 arquivos,
  hashes conferidos, sem .env; seis fontes backend conferidas novamente pelo teste
  HTTP. Servidor 3199 pronto, handle 50419 nesta sessao. Fonte inclui a nova tela/
  helper, mas tela NAO foi aberta/homologada. Proxy 3198 segue nao reativado.
- Tipos incluindo a pagina e rota, e lint dos arquivos alterados sem diagnosticos.
  Callback perdido do proprio upload, UI desktop/mobile e build global pendentes.
  Assinatura/acesso real Meta/cloud, audio positivo e provas amplas dos demais
  criterios da fase nao sao substituidos por estes testes. Gate aberto, sem publicacao.

### API autenticada e retomada do upload direto — gate 2 ainda aberto

- Suite conjunta desta rodada: **26/26**, 11,47 s: quatro casos HTTP de
  `tests/chat-media-send.http.mts`, um caso real de SDK/Auth/Storage em
  `tests/inbox-direct-media-retry.emulator.mts` e 21 testes de tentativas,
  legenda, transporte e progresso. Nao somar com suites anteriores como cenarios
  independentes; nao equivale a homologacao global ou entrega externa.
- API multipart real, login normal no Auth Emulator, Firestore e Storage reais
  do laboratorio: anonimo 401; viewer/outro vendedor/outro tenant 403; seis
  replays concorrentes mantem uma mensagem/job/admissao/blob; bytes ou legenda
  diferentes retornam 409 preservando original/geracao/sequencia. Vazio/sem arquivo
  nao cria envio fantasma. Worker bloqueado por reserva antes de qualquer provider.
- Primeira chamada da rodada anterior levou cerca de 56 s, com compilacao inicial;
  rodada aquecida mais rapida NAO comprova comportamento da tela sob timeout.
- Falha encontrada no caminho usado pela tela para videos/arquivos >= 3 MB:
  depois de upload concluido e confirmacao da API perdida, retry tentava sobrescrever
  o mesmo objeto create-only. Reproduzido com SDK cliente autenticado e regras reais
  do emulador: segundo upload recebe storage/unauthorized.
- `sendInboxDirectMedia`, integrado em Conversas, guarda recibo em memoria por
  tentativa/caminho/mesmo File. Retry apos upload concluido refaz somente aceite
  da API, compartilha upload concorrente e preserva fallback escolhido apos
  resultado incerto. Sem gravar bytes privados no navegador persistentemente.
  Teste real comprova uma subida, duas tentativas de aceite (API simulada neste
  caso), mesmos bytes e geracao; nao afirma aceite HTTP de send-stored-media.
- Limites/pendencias: recibo dura enquanto o rascunho em memoria; nao resolve
  upload cujo proprio callback de conclusao se perdeu, recarga ou troca de sessao.
  API send-stored-media ainda usa queueTenantChatMedia sem admissao SHA-256;
  requer vinculo/verificacao de bytes e provas autenticadas desse caminho antes
  de fechar gate. Homologacao visual desktop/mobile e build global pendentes.
- HTTP desta rodada usou snapshot 1792415777674 com cinco fontes backend conferidas
  por hash. A nova correcao da tela/helper esta no workspace, ainda NAO nessa copia;
  nao usar a aba antiga como evidencia da interface corrigida. Sem publicacao.
- Lint direcionado e typecheck (`tsconfig.crm-passive.json`, agora incluindo a
  pagina Conversas e os novos testes) concluidos sem diagnosticos.

### Worker de midia: integridade ate o destino simulado

- Worker agora valida escopo tenant/chat do caminho, admissao/digest/bucket,
  tamanho (antes de baixar, teto 32 MB) e SHA-256 dos bytes. Leitura usa geracao
  especifica do objeto; URL de entrega usa V4 e inclui generation na assinatura.
  Arquivo alterado/incompativel e bloqueado antes de assinar ou chamar o canal,
  como falha permanente de preflight, sem retentativa de provider.
- Normalizacao de audio usa os bytes ja verificados; erro de integridade fica
  fora do fallback de codec, para nao enviar audio corrompido. Geracao da variante
  e validada antes de substituir a referencia da fonte; fallback mantem fonte e
  geracao originais. Conversao positiva de audio/microfone ainda pendente.
- Aceite concluido registra sourceSha256/sourceGeneration/deliveryGeneration e
  origem da verificacao. Midia legada sem admissao continua compativel, marcada
  legacy_unbound: verifica bytes/versionamento atuais, nao inventa hash original.
- Suite conjunta atual: 44/44, incluindo cinco cenarios novos do worker, seis
  de imutabilidade/retomada/lixeira, idempotencia, starts/worker/CRM e 11 casos de
  recibos. Lint e typecheck direcionado sem diagnosticos. Nao somar com 58 da rodada
  anterior como se fossem 102 cenarios diferentes nem afirmar mesmo escopo.
- Teste faz upload/download reais no emulador, worker real e payload real do
  conector Meta, mas assinatura e resposta do destino sao simuladas. Nenhum fetch
  externo e encaminhado pelo teste. Prova bytes/nome/revisao/chamada unica e bloqueio
  de corrupcao/tenant estrangeiro; NAO prova assinatura criptografica real, acesso
  da Meta ao bucket, comportamento de cache/cloud ou entrega no WhatsApp real.
- Verificacao seguinte: nova copia isolada do codigo (sem .env) concluida:
  .qa-artifacts/inbox-snapshot-1792415777674, 1.293 arquivos com hashes conferidos.
  Servidor dessa copia pronto em 127.0.0.1:3199 (Next 16.3.8/webpack, 35,1 s),
  usando apenas emuladores locais. Naquele ponto HTTP/UI novos ainda pendentes;
  porta 3198/proxy e fixtures Alpha/Beta nao foram reativados nesta etapa.
  Laboratorio anterior nao e fonte valida para homologar os novos modulos.
  Aceite multipart autenticado foi verificado na rodada acima; upload direto,
  UI/timeout/recarga e build global continuam pendentes. Gate aberto.
- Contrato consultado: [query parameters em URLs V4](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)
  e [canonical request com generation](https://docs.cloud.google.com/storage/docs/authentication/canonical-requests).

### Revisao subsequente: reserva distribuida e admissao imutavel de upload

- A primeira versao otimista NAO bastou: suite ampliada ficou 29/30. Texto e
  repeticao passaram, mas texto/midia mistos em cinco processos tiveram tres
  FAILED_PRECONDITION apos esgotar o budget. Falha mantida como evidencia; nao
  aumentados timeout/limite nem reduzidos concorrentes para aprovar.
- Acrescentada reserva distribuida create-only por tenant/chat, com token, validade
  de 30 s e takeover condicionado a updateTime. Evita disputa quadratica de CAS.
  Commit inclui delete condicionado da propria reserva: mensagem/job/chat/pausa e
  liberacao acontecem juntos. Holder antigo nao grava nem apaga reserva nova.
  CAS no chat continua protegendo coexistencia com versao antiga durante rollout.
- Com reserva: tres cenarios entre cinco processos passaram (mesma chave, vinte
  chaves distintas, dez textos + dez midias), sem falhas/cadeia quebrada. Harness
  preserva 20 submissões e assertivas originais. Duracoes incluem startup do SDK;
  nao usar esses testes como prova de SLA HTTP de 25 s ou performance de producao.
- Reproducao real em Storage Emulator confirmou a troca de bytes no fluxo antigo:
  arquivo de 12 bytes foi substituido por outro de 12 bytes sob a mesma chave.
  Primeira correcao create-only + verificacao de bytes resolveu repeticao serial,
  mas teste concorrente ainda aceitou os dois arquivos (4/5). Nao assumida
  exclusividade do upload apenas pela opcao declarada no SDK/precondicao GCS.
- Adicionada admissao Firestore create-only chat_media_uploads por tentativa,
  com SHA-256 do buffer e fingerprint de nome/tipo/legenda/resposta. Vinculo e
  persistido ANTES de mutacao do objeto. Concorrentes de outro conteudo sao
  recusados antes de escrever no Storage, independentemente de limitacoes do
  emulador. Novo caminho e estavel .bin; Content-Type/nome de download preservados.
  Replays legados mantem extensao/caminho e verificam bytes originais primeiro,
  evitando envenenar a admissao com tentativa conflitante. Arquivo ausente nao e
  recriado silenciosamente para um envio ja existente.
- Upload sem job apos interrupcao fica registrado, pode retomar com o mesmo
  conteudo e entra no manifesto da lixeira/restore/expurgo. Manifesto passa a incluir
  chat_media_uploads e chat_outbound_locks; indices tenant/chat declarados para
  ambos, nao publicados. Isto nao prova completude de toda a retencao historica,
  limpeza de objetos antigos sem registro ou seguranca de exclusao concorrente.
- Verificacao final ampliada: 58/58 em uma unica execucao (99,5 s), incluindo os
  sete cenarios atomicidade/lease, seis imutabilidade/compatibilidade/restauracao,
  tres cenarios entre cinco processos, recibos precoces/concorrentes, campanhas,
  idempotencia, start/worker/CRM e contratos de lixeira. Preservados todos os
  concorrentes, sem provider real e sem reduzir as assertivas. Testes nao provam
  envio real ou SLA de producao. Lint e typecheck direcionado finais aprovados,
  zero diagnosticos; git diff --check sem erros (somente aviso de conversao LF/CRLF).
- Gate 2 nao fechado apenas por essa suite: falta homologar APIs autenticadas e
  experiencia de texto/midia com esses novos caminhos, conferir resposta em
  timeout/recarga, e revalidar worker/URLs de midia/digest de ponta a ponta. Snapshot
  QA anterior ainda nao contem esses modulos. Build global atual nao executado.
  Indices/banco/codigo nao publicados. Fases posteriores continuam sem avancar.
- Contratos consultados: [precondicoes do SDK Firestore](https://github.com/googleapis/nodejs-firestore/blob/main/dev/src/index.ts)
  e [precondicoes de objetos GCS](https://docs.cloud.google.com/storage/docs/request-preconditions).
  As opcoes existem tambem nos tipos locais instalados; os testes de emulador sao
  evidencia do comportamento da aplicacao, nao validacao de toda a plataforma cloud.

### Fila de envio: gravacao atomica otimista — gate ainda em validacao

- Substituido o trecho de enqueue pessimista de texto/midia por lote atomico com
  precondicao lastUpdateTime no chat. Leitura nao mantem locks enquanto instancias
  calculam a sequencia. Se outra gravacao vencer, todo o lote e recusado e a
  sequencia/predecessor sao relidos. Nao existe mutex em memoria nem reducao de carga.
- Mensagem e job usam create (nao sobrescrevem existentes); chat, job, mensagem e
  pausa humana sao gravados juntos. Mensagem respondida usa atualizacao logica
  neutra + versao como precondicao, bloqueando remocao/reassociacao concorrente.
- Apos erro do commit, consulta a operacao duravel: um aceite cuja confirmacao
  se perdeu retorna replay da mesma operacao. Demais falhas nao acionam provider.
  Colisoes 6/9/10 tem backoff com jitter, no maximo 32 tentativas e budget de 15 s
  entre tentativas (nao e hard timeout dos RPCs). Erros de conteudo/tenant nao
  entram no loop. Mensagem orfa/contador invalido exigem reconciliacao, nao overwrite.
- Primeira execucao apos mudanca: cinco processos independentes, 20 chamadas da
  mesma chave e 20 chaves distintas passaram (2/2, 15,6 s / 14,2 s incluindo
  inicializacao). O cenario antes com nove ABORTED passou sem falhas, com cadeia
  completa. Isso nao fecha sozinho estabilidade nem prova ausencia de falhas em
  producao. Foram adicionados teste misto texto/midia entre processos e cinco
  cenarios de falha/intercalacao/confirmacao perdida; execucao completa pendente.
- A interrupcao encerrou os processos do laboratorio: ausencia de Node/Java e
  porta 8080 foi verificada antes de iniciar novo emulador, sem importar estado
  antigo. Inicializacao oficial acompanhada pelo mesmo handle; nao reiniciada por
  timeout de observacao. Fixtures novas continuam isoladas por tenant/demo project.
- Inspecao adicional identificou lacuna de fase 2: queueTenantChatMediaBuffer
  salva no caminho deterministico antes de verificar replay, e saveChatMediaBuffer
  nao exige criacao exclusiva. Outro buffer do mesmo tamanho/extensao/chave pode
  sobrescrever bytes ja referenciados sem mudar fingerprint atual. Causa confirmada
  no codigo, reproducao em Storage Emulator e correcao ainda pendentes. Nao tratar
  idempotencia do job como prova de imutabilidade do arquivo.
- Gate 2 permanece aberto (concorrencia em validacao + imutabilidade de midia);
  nenhuma avancada para distribuicao, stories ou homologacao final. Nada publicado.

### Novo pedido: CRM observador, funil por negocio, grupos e roteamento

Inspecao solicitada pelo cliente antes de adicionar funcionalidades. Nao estamos
na ultima fase: fase 8 e gates corretivos anteriores continuam abertos; fase 9
nao iniciada. Esta rodada nao publica nem altera app/admin.

Correcoes locais deste bloco:

- A fila inbound agora grava o job de observacao na MESMA transacao do job de
  resposta. A substituicao por uma mensagem mais recente/debounce nao elimina a
  analise individual do CRM. Worker comercial existente drena os registros sem
  depender da decisao de responder. Isso nao prova cobertura de caminhos que
  sequer chamam enqueueIncomingMessageJob (automacoes sociais e sincronizacoes
  ainda precisam ser auditadas), nem observacao de mensagens humanas fora da Altum.
- Observador consulta mensagens por tenant/chat/data, mais recentes primeiro,
  ate 80 por analise, limitado a data da mensagem de origem. Nao escolhe os primeiros
  IDs arbitrarios nem perde fatos novos em conversas com mais de 80 mensagens.
  Dados ja extraidos permanecem no lead; nao e leitura integral ilimitada por chamada.
- Extracao passiva conservadora separada do heuristico de respostas. Orcamento
  exige declaracao explicita, nao telefone/ano/quantidade/preco do vendedor.
  Registra necessidade, interesse, objetivo, prazo, decisor e objecao quando
  explicitos, com ID, trecho e data reais do cliente. Nao usa fala do vendedor como
  fato do comprador. Protege campos manuais/legados sem procedencia e fatos mais
  recentes contra jobs atrasados. Saudacao nao apaga proxima acao util.
- Pergunta/negacao/hipotese nao confirma compromisso automaticamente. Proposta ja
  enviada pede acompanhamento, nao preparar a mesma proposta. Declaracao gerada
  pela IA nao autoriza avancar etapa so pelo texto. Ainda NAO e extracao semantica
  completa, nem comprovacao de qualidade comercial por segmento: avaliacao pendente.
- Salvar funil (interface e rascunho supervisionado) marca personalizacao manual
  e retira blueprintManaged/starterKitManaged. Aplicacao do blueprint le/grava
  transacionalmente, preserva personalizacao mesmo concorrente e funis legados.
  Payload de etapas invalido/duplicado e recusado em vez de salvar defaults.
- Grupos Evolution: reconhece JID alternativo antes do telefone do participante;
  nao usa participante como fallback da identidade da conversa. Gateway generico
  tambem identifica grupo; grupo declarado sem JID valido e recusado. Preserva nome
  conhecido quando evento nao envia assunto; desvincula lead/contact de chat de
  grupo legado na nova ingestao. Observador recusa grupo mesmo vinculado a lead.
  Nao apagados cadastros antigos: uma pessoa pode ter conversa individual legitima.

Evidencias locais finais: suite conjunta 39/39 (5 unitarios novos + 7 cenarios novos
de emulador + 27 regressoes existentes), incluindo
100 mensagens antigas + fato recente, IA pausada, evidencia exata, inversao de ordem,
edicao manual, mensagem de outro tenant/grupo, supressao de resposta e tres corridas
entre salvar funil/aplicar blueprint. Inclui refinamento de negacoes/intencao/trecho,
marcacao de mensagens futuras da IA com aiGenerated e recusa de compromisso ainda
na fila de envio. Lint sem erros (dois avisos preexistentes no agent.ts sobre doc e
incompatibleIds). Typecheck direcionado final aprovado, zero diagnosticos.
Typecheck amplo do laboratorio falhou em arquivo GERADO antigo malformado
(.qa-artifacts/next-inbox/dev/types/routes.d.ts); nao foi editado para esconder erro.
Config direcionada tsconfig.crm-passive.json verifica fontes/imports e testes novos,
sem incluir snapshots gerados. Build completo e navegador atual ainda pendentes.
Indice messages(tenantId,chatId,createdAt DESC) declarado, nao publicado.

Ordem restante, sem fechar etapa por existencia de codigo:

1. Completar cobertura passiva de todos os ingressos/automacoes/sincronizacoes;
   avaliar fatos e recomendacoes uteis por negocio, respostas curtas em contexto,
   correcao/retratacao de fatos e dados manuais. Expor evidencias na ficha existente.
2. Homologar funil pela interface/API autenticada, recarga e troca entre empresas;
   revisar starter-kit com sobrescrita explicita e rotulos/etapas personalizados
   usados por IA, CRM e relatorios. Grupos: recuperar assunto ausente no provedor,
   tratar renomeacao, provar webhook sem criacao de leads e auditar contaminacao
   antiga antes de qualquer limpeza.
3. So entao completar distribuicao. JA existem modo manual/round_robin/least_loaded,
   autoAssignOnInbound em Configuracoes > Operacao e opcao por canal compartilhado.
   resolveInboundAssignment le cursor fora de transacao: concorrencia pode selecionar
   mesmo vendedor. lead-intake central nao chama o resolvedor; cobertura depende
   de cada ingresso. Auditar todos, preservar dono atual, contas pessoais,
   indisponibilidade, permissao e repeticao de webhook; testar simultaneidade.
4. Instagram: reply_to atual preserva mid/texto, nao story.id/url/contexto visual.
   Capturar contrato oficial, renderizar na conversa existente com seguranca e
   fallback de expiracao; incluir outros conteudos suportados. Nao prometer recuperar
   stories antigos/expirados nem contexto que o provedor nao entrega.
5. Reabrir gates afetados, fechar concorrencia enqueue_text/campanhas ainda pendente,
   terminar fase 8 e depois executar homologacao final fase 9.

### Concorrencia entre instancias: falha localizada no enfileiramento

- Novo harness usa cinco processos Node/SDK independentes, cada um com quatro
  chamadas liberadas por barreira IPC. Nao sao agentes IA e nao compartilham
  cache/cliente Firestore. Fixture exclusiva, sem provider/worker de entrega.
- Vinte repeticoes da MESMA chave: aprovadas, uma conversa, uma mensagem e um job,
  zero erros. Primeira execucao isolada e repeticao no teste de dois cenarios
  passaram (32,8 s e 15,3 s incluindo inicializacao dos processos).
- Vinte chaves DISTINTAS para o mesmo lead/chat: falhou. Nove operacoes retornaram
  `10 ABORTED: Transaction lock timeout`, todas com etapa `enqueue_text`. Localiza
  um cenario concreto de contenção no enfileiramento; nao prova que toda falha
  historica ocorreu na mesma etapa. Nao reduzido o numero de concorrentes.
- Harness valida ausencia de duplicatas e encadeamento completo quando todas as
  operacoes passam. SDK/processos finalizam antes do teardown; worker nao reinicia
  chamada falha automaticamente. Diagnostico registra contagens e falhas por etapa.
- Typecheck do harness encontrou windowsHide ausente em ForkOptions dos tipos
  instalados; inicializacao ajustada para spawn com IPC e janela oculta, sem mudar
  concorrencia. Lint e typecheck dessa versao aprovados, zero diagnosticos.
  Versao spawn ainda requer repeticao do teste comportamental.
- Correcao da contenção, preservando idempotencia/ordem e funcionamento em varias
  instancias, permanece pendente. Gate nao aprovado. Nada publicado.

### Timeout concorrente: diagnostico por etapa, causa ainda aberta

- Servico de inicio agora anota a etapa fixa no erro original do SDK: permissao
  do lead, consulta de tentativa, identidade canonica, permissao do chat, consulta
  final de tentativa ou enfileiramento. Nao inclui dados do contato e nao altera
  codigo/mensagem do erro, numero de tentativas ou comportamento do envio.
- Teste de 20 starts agora aguarda `allSettled` das 20 operacoes ANTES de avaliar
  falhas, informando etapa/codigo. Mantem 20 concorrentes e todas as assercoes;
  evita operacoes remanescentes interferirem nos casos seguintes apos falha precoce.
- Repeticao completa com campanhas/recibos/inicio: 28/28, incluindo 20 starts em
  4,9 s. Isso nao resolve nem invalida a falha anterior de lock em 37,6 s; ela nao
  reapareceu com a instrumentacao, portanto a etapa causadora ainda e desconhecida.
- Gate de estabilidade continua aberto. Nao reiniciado emulador nem reduzida
  concorrencia para obter aprovacao. Caso de erro SDK simulado valida diagnostico
  sem retentativa, mas nao reproduz a causa do timeout real.
- Dois testes direcionados do diagnostico passaram, incluindo erro SDK imutavel:
  instrumentacao nao pode mascarar a falha original. Typecheck direcionado sem
  diagnosticos. Regressao 28/28 acima foi anterior a esses dois testes adicionais;
  nao apresentar como suite completa de 30 executada.

### Campanhas: aceite e recibos precoces — em validacao

- Revisao atual confirmou que a campanha gravava a entrega apos o dispatch sem
  recuperar o recibo precoce. Texto com midia por link executava o conector mas
  descartava seu resultado, persistindo metaMessageId nulo no contexto da campanha.
- Implementado `persistCampaignDeliveryAcknowledgement` com o mesmo resumo
  transacional por tenant/numero/ID externo, preservando vinculo de mensagem e
  entrega da campanha. Webhook consulta tambem entrega vinculada no resumo quando
  a consulta inicial ocorreu antes da gravacao. Recibos legados de campanha agora
  exigem numero comprovado diretamente ou pelo canal do proprio tenant.
- Dispatch de midia agora conserva ID externo e numero remetente; campanha usa
  o resultado da chamada unica, nao objeto substituto sem ID. Nao mudou o numero
  de chamadas ao conector. Contrato de fonte novo: 1/1 aprovado.
- Quatro casos de emulador preparados: recibo precoce compartilhado com mensagem,
  quatro corridas entre webhook/gravação, repeticao/conflito/tenant e canal legado.
  EXECUCAO EM ANDAMENTO, SEM RESULTADO FINAL: laboratorio estava desligado (portas
  8080/9099/9199 sem listeners). CLI oficial iniciada em demo-altum-qa-lab confirmou
  All emulators ready; processos existentes foram acompanhados sem reiniciar por
  timeout. Resultado final: 27/28; os quatro casos de campanha passaram. Falhou
  `20 starts of the same lead create one canonical chat and one durable outbound
  operation` com `10 ABORTED: Transaction lock timeout` (37,6 s), na regressao
  concorrente apos inicializacao fria do laboratorio. Nao atribuir automaticamente
  ao ambiente nem aprovar por passar os casos isolados. Causa/stage da falha ainda
  precisam ser estabelecidos. Lint aprovado; typecheck de campanhas/dependencias
  com zero diagnosticos; diff check sem erros. Snapshot de QA ainda nao recebeu
  estas alteracoes de campanha.
- Gate segue aberto. Nao afirmar entrega real nem idempotencia completa do lote
  de campanhas: esta correcao trata vinculacao/recibos, nao prova o despacho em
  lote contra interrupcao entre destinatarios. Retencao/lixeira permanece pendente.

## Atualizacao de execucao — 17/10/2026

### Webhook HTTP assinado de recibos — 17/10/2026

- `whatsapp-delivery-webhook.http.mts`: 3/3 via rota Next local, sem chamar funcao
  interna diretamente. Canal ficticio com segredo local e token explicitamente
  invalido; payload contem somente statuses, nunca mensagem recebida.
- Assinatura ausente, invalida e assinatura de outro corpo: 401, zero eventos
  persistidos e mensagem original inalterada. HMAC SHA-256 valido: 200,
  ok_status_update, um match, mensagem e cauda em read; outro tenant intacto.
- Repeticao de read e sent atrasado mantiveram read, com dois logs de eventos
  distintos (read/sent), sem criar jobs de envio, IA ou observacao CRM.
- Lint aprovado; fixtures removidas no teardown. Nao usou Meta real, nao testa
  origem de rede da Meta nem entrega real. Criterio de autenticidade/integracao
  HTTP para recibos desta rota comprovado pelos casos acima.
- Pendencias principais do gate continuam: campanha/aceite, retencao e lixeira
  dos registros, casos legados sem destino comprovavel e entrega real. Nenhuma
  publicacao e nenhum fechamento global de fase nesta rodada.

### Autorizacao HTTP da reconciliacao — 17/10/2026

- `whatsapp-delivery-reconciliation.http.mts`: 5/5 via Next local 3199 e Auth
  Emulator. Contas/empresa exclusivas criadas para teste, sem credenciais reais.
  401 sem login; 403 para atendente, perfil com apenas manage_channels e perfil
  com apenas view_team_records; todos sem auditoria ou alteracao da mensagem.
- Administrador da empresa nao acessou outra empresa (403). Na propria, corrigiu
  duas mensagens em paginas, retomou/repetiu cursor e preservou quantidade/conteudo;
  zero jobs de envio e tres auditorias para tres paginas processadas com sucesso.
  Bodies nulo/array, acao desconhecida, limite e cursor invalidos deram 400.
- Servidor confirmou codigos; primeira requisicao gastou 43 s, 42 s compilando.
  Paginas autorizadas levaram 210/220/179 ms nessa execucao local. Nao inferir
  performance de producao. Lint do teste aprovado; fixtures e usuarios removidos
  no teardown, sem tocar nos tenants Alpha/Beta usados no navegador.
- Criterio de autorizacao HTTP desta acao comprovado. Nao equivale a migracao em
  producao ou ao fechamento dos demais criterios do gate de entrega.

### Reconciliacao paginada de mensagens concluidas — 17/10/2026

- Rota existente `POST /chats/outbound-queue`, acao `reconcile_delivery`, agora
  permite reparar metadados de recibo sem chamar provider/dispatch/worker. Exige
  autenticacao, tenant/modulo Inbox/respond_inbox e, adicionalmente, manage_channels
  e view_team_records. Fluxo antigo de reprocessamento mantido. Nenhuma tela nova.
- Servico le mensagens por tenant/ID em paginas de 1 a 25 (padrao 10), retornando
  cursor com tenant e hasMore. Cursor invalido/de outra empresa e recusado.
  Cada pagina registra auditoria com contagens, cursores e IDs com falha. Repetir
  pagina apos interrupcao nao envia mensagens nem duplica os registros existentes.
- So corrige mensagens de agente com comprovacao de envio e vinculo completo
  WhatsApp. Recebidas, pendentes ou sem numero comprovado sao reportadas como
  ignoradas. Registros conflitantes falham individualmente sem impedir os seguintes.
  Transacao revalida destino/ID/estado e existencia: nao recria mensagem removida.
- Reconciliacao forca leitura historica mesmo apos migracao anterior, recuperando
  recibo legado que replica antiga possa ter gravado tardiamente. Nao marca o lote
  como entrega real nem inventa informacoes de destino que estejam ausentes.
- Quatro testes de emulador e um contrato estatico cobrem paginacao/retomada,
  repeticao, rede proibida, conteudo e contagem preservados, isolamento, falha por
  registro, auditoria, recibo tardio e destino removido/alterado. Typecheck da
  rota/dependencias sem diagnosticos. Autorizacao HTTP desta nova acao ainda
  precisa de prova real no emulador; contrato estatico nao a substitui.
- Regressao conjunta atual: 29/29. Lint aprovado. Rota/helper/servico no snapshot
  com hashes iguais ao fonte.
- A migracao em producao NAO foi executada. Campanhas, retencao dos recibos e
  HTTP assinado seguem pendentes; gate corretivo de entrega continua aberto.

### Compatibilidade com recibos historicos no vinculo — 17/10/2026

- Reproduzido caso legado sem resumo: 205 eventos antigos, com leitura somente
  apos a primeira pagina, terminavam em `sent` no aceite. Teste falhou antes da
  correcao e passou apos recuperar o `read`, data e destinatario originais.
- `readWhatsAppDeliveryHistory` consulta dentro da transacao por tenant, numero e
  ID externo, ordenando pelo ID do documento em paginas de 200 ate o fim. Ignora
  resumos e dobra eventos antigos/novos no estado mais forte. Campos antigos
  `recipientId/errorCode/errorMessage` continuam reconhecidos.
- Aceite reconcilia historico tambem se ja existia resumo sem marcador de migracao;
  grava `legacyHistoryReconciled` e contagem inicial, evitando varredura repetida
  nos proximos aceites do mesmo vinculo. Indice composto declarado, nao implantado.
- Teste complementar cobre falha legada com erro/destinatario, repeticao e leitura
  posterior. Regressao completa: 24/24. Lint aprovado; typecheck de
  dispatch/webhook/dependencias com zero diagnosticos. Snapshot sincronizado com
  hashes iguais; JSON de indices valido e sem duplicatas.
- Limite desta evidencia: recuperacao NO VINCULO, nao varredura automatica de todas
  as mensagens antigas ja concluidas. Migracao/reconciliacao desses registros e
  rollout com replicas antigas ainda precisam de gate proprio. Campanhas, retencao
  dos resumos/logs e HTTP assinado continuam pendentes. Nenhuma publicacao.

### Recibo precoce e vinculo concorrente — 17/10/2026

- Caso novo reproduziu perda de leitura: recibo chegava sem mensagem vinculada;
  aceite posterior gravava `sent` e nao recuperava o `read` registrado. Antes da
  correcao, teste falhou `sent !== read`; apos, passou sem segundo webhook.
- Mesma colecao `whatsapp_delivery_events` agora distingue log `recordType=event`
  de resumo `recordType=state`. Resumo tem chave SHA-256 de tenant, numero e ID
  externo. Webhook e aceite leem/escrevem esse mesmo documento na transacao:
  conflito provoca nova leitura, inclusive quando a consulta inicial de mensagens
  ocorreu antes do vinculo. Nao depende de polling nem cria outro envio.
- Aceite recupera estado/data/erro mais forte e vincula ID local/chat; webhook
  recupera a mensagem pelo vinculo mesmo se sua consulta inicial estava vazia.
  Mensagem e estado da cauda do chat convergem. Outro numero nao compartilha
  recibo; tentativa de ligar o mesmo recibo a segunda mensagem e recusada.
- Regressoes: 22/22 (9 recibos + 13 inicio/fila/CRM), incluindo seis disputas
  simultaneas alternando ordem de chamada. Primeira regressao deu 20/22: fixtures
  de tres envios distintos reutilizavam ID externo ficticio. Nova protecao recusou
  colisao; fixtures ganharam IDs distintos, sem retirar a protecao ou assercoes.
- Lint aprovado e typecheck de dispatch/webhook/dependencias zero diagnosticos.
  Snapshot dos dois helpers sincronizado com hashes iguais. Testes somente em
  emulador, transporte Meta simulado; nada publicado.
- PENDENTES DO GATE: recibos historicos anteriores sem resumo, aceite de campanhas
  que ainda nao usa o mesmo protocolo, cobertura de retencao/lixeira dos novos
  resumos e logs, HTTP com assinatura valida/invalida e prova de entrega real.
  Nao aprovar Fases 2/3 por completo nem avancar Fase 9 por estes testes isolados.

### Eventos de entrega fora de ordem — implementacao incremental 17/10/2026

- Webhook WhatsApp agora delega a `whatsapp-delivery-status.ts`; preservadas as
  verificacoes de assinatura/canal da rota. Aplicacao revalida documentos em
  transacao em vez de sobrescrever por ordem de chegada. Prova de leitura vence
  entrega, que vence falha, que vence somente aceite/envio; evento mais fraco nao
  rebaixa o estado. Entrega comprovada pode superar falha anterior.
- Consulta de mensagens/campanhas inclui tenant antes do limite. Numero remetente
  tambem e conferido: mensagens sem mapeamento de numero comprovavel ficam apenas
  no log, sem adivinhacao. Campanhas legadas sem campo de numero mantem o vinculo
  existente por tenant/ID externo; fechamento desse legado ainda merece cobertura.
- Recibo antigo atualiza sua mensagem, nao a cauda mais recente da conversa.
  Eventos recebem ID SHA-256 deterministico sem truncar identidades; repeticao
  preserva o createdAt original. Eventos sem mensagem correspondente permanecem
  registrados, MAS ainda nao sao reconciliados automaticamente no aceite posterior.
- Cinco testes iniciais e nove regressoes de normalizacao/contrato aprovados.
  Suite ampliada: 6/6, incluindo repeticao de horario e entrega depois de falha.
  Lint aprovado. Snapshot da rota, servico e indices com hashes iguais ao fonte;
  JSON dos indices valido e sem indices duplicados.
  Typecheck de webhook/dependencias com zero diagnosticos. Indices declarados
  para consultas tenant/ID externo; nenhuma implantacao de indices realizada.
- PENDENTE: recuperar recibo precoce no vinculo posterior, validar a corrida entre
  essas duas operacoes, ligacao do recibo com retencao/lixeira e homologacao HTTP
  assinada do webhook. Gate corretivo de entrega permanece aberto.

### Gate corretivo de confirmacoes fora de ordem — 17/10/2026

- Dois casos novos reproduziram regressao: recibos `read`/`delivered` gravados
  antes do retorno do conector eram sobrescritos por `sent` na confirmacao.
- `persistChatMessageAcknowledgement` agora grava em transacao, valida tenant/chat
  e preserva entrega/leitura/falha terminal ja conhecida para o mesmo ID externo,
  incluindo data e detalhes do recibo. Integrado ao texto e midia por link com
  mensagem persistente. Nao altera a fila ou os conectores.
- Antes da correcao: 0/2; apos: suite de inicio 12/12, incluindo os dois casos.
  Teste adicional de falha terminal e bloqueio de tenant/chat passou. Execucao
  filtrada tambem selecionou teste legado dependente de outro caso e falhou por
  falta da primeira tentativa; fixture do caso ajustada para ser independente,
  sem remover assercoes de repeticao/conflito. Regressao completa atual: 13/13.
- Typecheck de dispatch/dependencias zero diagnosticos. Copia isolada de dispatch
  e novo helper sincronizada, hashes iguais. Sem chamadas externas nos testes.
- PENDENTE SEPARADO: webhook Meta aplica eventos por batch sem comparar estado
  atual. `read` seguido por `sent` atrasado pode regredir; recibos que chegam antes
  de existir o vinculo com ID externo tambem precisam reconciliacao. Esta correcao
  de confirmacao do worker NAO aprova esses casos nem o gate geral de entrega.

### Inicio por lead ate worker/CRM com transporte simulado — 17/10/2026

- Teste integrado novo executa servico de inicio, fila real no emulador, worker,
  conector Meta e observador CRM. Somente o transporte HTTP externo e simulado
  dentro do processo de teste: nenhuma requisicao para Meta e encaminhada.
  Nao equivale a entrega em numero real nem ao POST HTTP/after do Next.
- Encontrada falha reproduzida: job concluia e CRM atualizava, mas mensagem
  persistia com `deliveryStatus=queued`, que tem precedencia na UI. Assercao nova
  falhou com `queued !== sent`. `chat-dispatch.ts` agora grava estado enviado e
  limpa erros anteriores na confirmacao do conector, tambem para texto comum.
- Suite inicio por lead: 10/10. Caso novo comprova um unico transporte simulado,
  mensagem enviada com ID retornado, job concluido, observacao/recibo CRM concluidos
  e um evento de evidencia; repeticao do inicio e worker nao reenviam nem duplicam.
- Copia isolada recebeu `chat-dispatch.ts` atual; igualdade de hash verificada.
  Lint e typecheck de dispatch/dependencias aprovados, zero diagnosticos.
  Regressao paralela de fila e observacao CRM: 13/13 aprovados.
  Sem nova tela, publicacao ou alteracao em app/admin. Nao aprovar gates gerais
  somente com esta evidencia; fluxo HTTP com dispatch efetivo continua pendente.

### Recuperacao visual e rascunho do inicio por lead — 17/10/2026

- Erro visual identificado no overlay: `ChunkLoadError`, timeout do arquivo
  `/_next/static/chunks/app/layout.js`. Apos a falha, diagnostico HTTP do mesmo
  arquivo retornou 200 e 343052 bytes pelo proxy (364 ms) e direto (294 ms).
  Recuperacao pelo botao Reload funcionou sem reiniciar processos. Isso explica
  a falha imediata de montagem, nao determina a causa original do timeout.
- Nova fixture `qa-altum-alpha-lead-start-ui`, mesmo canal Meta ficticio, sem
  conversa preexistente. Pela UI autenticada: texto digitado, clique unico em
  Iniciar conversa, POST 200, abertura do chat canonico e aviso de janela fechada.
  Nao clicado Enviar follow-up/template nem Enviar mensagem.
- `qa-verify-lead-start-ui.mjs` confirmou um chat, zero mensagens e zero jobs.
  Janela de atendimento foi simulada somente nesse chat no emulador (nao houve
  webhook real). Campo reapareceu com texto exato `QA visual: preservar este texto
  sem enviar ao WhatsApp.`. Recarga completa manteve o mesmo texto e conversa.
- Evidencias `inbox-resilience/lead-start-template-gate.png` e
  `inbox-resilience/lead-start-draft-after-reload.png`. Ao concluir, restaurada
  janela fechada na fixture e novamente confirmados zero mensagens/jobs.
- Aprovado especificamente o caminho Meta sem janela com transferencia e
  persistencia de rascunho. Nao comprova dispatch externo, inicio por lead com
  envio efetivo, recebimento real nem estabilidade completa do ambiente visual.
  Gates corretivos gerais seguem abertos; nao avancar para Fase 9.

### Rota HTTP autenticada do inicio por lead — 17/10/2026

- Fixture exclusiva `lead-start-template-v1`, somente em `demo-altum-qa-lab`,
  preparada por `scripts/qa-seed-lead-start.mjs`. Canal Meta com ID e token
  explicitamente invalidos; nao enviar template nem abrir janela para dispatch.
  Script cria apenas documentos ausentes e recusa colisao com outra fixture.
- `tests/whatsapp-conversation-start.http.mts`: 3/3 contra Next local na porta
  3199. Login normal no Auth Emulator, sem desabilitar autenticacao da rota:
  sem token 401; operador Alpha para Beta 403; Alpha autorizado 200 duas vezes,
  mesmo chat, `requiresTemplate=true`, sem mensagem nem incremento de jobs.
- Servidor confirmou POSTs 401/403/200/200. Primeira requisicao demorou 41 s,
  dos quais 40 s em compilacao local; as autorizadas levaram 444 e 240 ms.
  Isso nao caracteriza desempenho de producao. Lint dos dois arquivos aprovado.
- Navegador abriu formulario do lead, mas canal ainda aguardava compilacao. Apos
  recarga intencional do formulario vazio, pagina ficou sem formulario. Console
  capturado pela API do navegador nao mostrou erros; terminal registrou aviso
  React de atualizacao antes da montagem e erro JSON em rota de presence durante
  recompilacao. Causa nao estabelecida; nao atribuir automaticamente ao produto
  ou somente ao emulador. Nao reiniciado servidor e nao repetidos cliques cegos.
- Evidencia `.qa-artifacts/inbox-resilience/lead-start-blank-local.png`.
  Nenhum clique em Iniciar conversa ocorreu. Rascunho/transferencia visual ainda
  nao comprovados. O teste HTTP criou a conversa da fixture; para testar o
  formulario do zero na UI, usar outra fixture exclusiva, nao apagar a atual.
- Gates corretivos permanecem abertos; Fase 8 nao encerrada, Fase 9 nao iniciada.

### Revalidacao adicional de isolamento de contatos — 17/10/2026

- Segunda reproducao local: cadeia com cinco contatos retornava o registro antigo;
  ciclo nao era recusado. Resolucao transacional agora percorre a cadeia completa
  (limite explicito de 32 registros), valida cada tenant/destino e so seleciona
  raizes definitivas. Raizes sao ordenadas de forma deterministica; registros
  intermediarios conhecidos sao compactados para a raiz escolhida. Leitura usa
  o mesmo limite e recusa ciclos/destinos ausentes. Nao repara dados corrompidos
  automaticamente: recusa a atualizacao sem gravar.
- Seis casos direcionados passaram, incluindo cadeias, ciclos, referencia ausente,
  isolamento e uniao legitima de canais. A copia isolada do navegador recebeu a
  versao atual de `contact-profile.ts`, com igualdade de hash verificada.
- Regressao paralela apos esta correcao de cadeias: 19/19 aprovados; caso de 20
  atualizacoes de contato concluiu em 22,8 s. Falha historica de lock continua
  registrada sem causa definitivamente determinada.
- Teste novo reproduziu falha local com alias corrompido apontando para contato
  de outro tenant: a consolidacao nao recusava o vinculo. Nao ha evidencia aqui
  de ocorrencia em producao; fixtures usam somente empresas e dados ficticios.
- `contact-profile.ts` agora valida o tenant dos aliases, contatos mapeados,
  redirecionamentos e destino antes de gravar. Consulta canonica tambem interrompe
  travessia entre empresas, ciclos e referencias sem destino valido.
- Tres regressoes novas cobrem contato estrangeiro, tenant divergente no alias e
  redirecionamento que atravessa outra empresa e volta. Protegem dados e verificam
  que os documentos originais nao foram alterados.
- Regressao paralela atual de fila + identidade: 17/17 aprovados, incluindo 20
  atualizacoes concorrentes de perfil (22,9 s). Repeticao anterior desta rodada,
  antes da protecao adicional, passou 14/14 (perfil: 34,2 s). A falha historica de
  lock nao foi reproduzida nessas duas execucoes, mas sua causa ainda nao esta
  determinada; nao confundir repeticoes aprovadas com garantia de estabilidade.
- Lint dos dois arquivos aprovado. Typecheck de `contact-profile.ts` e dependencias: zero diagnosticos. Contratos
  de identidade: 5/5. Sem publicacao, sem alteracao de dados reais. Snapshot visual
  atualizado posteriormente conforme registro acima; gates corretivos continuam abertos.

### Gate corretivo prioritario — iniciar conversa a partir do lead

**Status atual: retorno corretivo aos gates anteriores; Fase 8 nao encerrada,
Fase 9 nao iniciada. Aprovacoes historicas abaixo nao cobrem este caminho.**

Implementacao corretiva atual:

- Rota antiga agora delega a `startTenantWhatsAppConversation`: destino canonico,
  verificacao comercial apos resolver o telefone e mesma outbox `queueTenantChatText`.
  Nao existe chamada direta ao provider nem observador de CRM paralelo nessa rota.
  Worker existente continua responsavel por entrega e observacao recuperavel.
- Identidade WhatsApp e revalidada dentro da transacao (empresa, canal, telefone),
  inclusive depois de consultar candidatos legados. Saida exige canal exato;
  modo de entrada legado continua coberto sem adotar canal desconhecido na saida.
- Inicio por lead tem escopo de idempotencia estavel por lead/canal, usando a
  mesma colecao de jobs, sem criar fila ou colecao paralela. Se o telefone do
  lead mudar apos perda da confirmacao, a repeticao encontra o job/conversa
  originais: nao cria outro envio nem uma conversa vazia para o novo telefone.
- Cliente usa tentativa persistente, canal original e prazo de requisicao. Se o
  seletor mudar de canal numa tentativa pendente, pede o canal original antes
  de reenviar; nao envia silenciosamente por outro WhatsApp. Caso Meta exija
  template, transfere o texto ainda nao enviado para o rascunho da conversa,
  sem sobrescrever rascunho ja existente. Confirmacao preserva texto novo.
- Nove testes novos no emulador aprovados, incluindo 20 inicios simultaneos:
  um chat, uma mensagem e um job, sem dispatch. Incluem conflito de texto,
  resposta perdida, template, troca de telefone, vendedor/canal/tenant indevidos,
  identidade corrompida, grupos e compatibilidade da entrada legada.
- Suite direcionada do cliente: 75/75. Cinco testes novos cobrem canal imutavel,
  transferencia de rascunho, confirmacao tardia, destino ja preenchido e falha de
  persistencia. Contrato de prontidao atualizado: 1/1. Lint do lote aprovado e
  typecheck direcionado da rota/Inbox/dependencias com zero diagnosticos.
- Regressao de fila e identidade: primeira execucao paralela teve 13/14, com
  `ABORTED: Transaction lock timeout` em 20 atualizacoes de perfil. Mesmo caso
  isolado passou; repeticao completa em sequencia passou 14/14. Falha inicial
  permanece como risco de estabilidade sob carga, nao foi descartada nem atribuida
  a codigo preexistente sem comprovacao. Regressao CRM: 6/6 aprovados.
- Esta rodada nao comprova login/POST HTTP completo da nova rota, uso visual do
  inicio pelo lead, entrega externa ou estabilidade do perfil sob carga paralela.
  Gates corretivos seguem em revalidacao; nao retomar encerramento da Fase 8 nem
  iniciar Fase 9 com base apenas nessas suites. Nenhuma publicacao realizada.

Diagnostico da versao anterior: a acao `handleStartLeadConversation` usava a rota
`app/api/tenant/[tenantId]/whatsapp/send/route.ts` fora da arquitetura de saida
implantada para `/chats/[chatId]/send`:

- Cliente nao envia `clientRequestId` nem usa a tentativa persistente do rascunho
  nesse caminho; requisicao tambem nao tem o limite de prazo da Inbox.
- Servidor chama `provider.sendText` diretamente, antes de gravar mensagem,
  estado da conversa e observacao comercial. Perda da confirmacao ou falha entre
  essas etapas pode causar envio externo sem registro e repeticao duplicada.
  Gate de idempotencia/outbox/recuperacao das Fases 2 e 3 precisa incluir a rota.
- Criacao ainda usa consulta seguida de `chats.add`, nao o resolvedor canonico
  transacional. Chamadas concorrentes podem criar duas conversas para o mesmo
  contato/canal. Gate da Fase 5 tambem precisa incluir esta entrada de saida.
- Observacao de CRM e executada diretamente com catch que apenas registra log;
  nao usa o recibo recuperavel da fila de observacao. Revisar cobertura da Fase 4.
- Controle comercial e verificado para `body.chatId` ou `body.leadId` antes de
  resolver destino. No formato legado `to`, um chat existente pode ser encontrado
  sem nova verificacao comercial sobre o chat resolvido. Nao concluir isolamento
  desse caminho somente pela verificacao de tenant/canal.
- Novo chat Meta retorna `requiresTemplate` sem enviar texto; cliente hoje limpa
  o compositor mesmo nesse caso. Correcao deve preservar/transferir esse rascunho
  ao mudar para a conversa e nao tratar preparacao de template como envio.

Sequencia corretiva antes de retomar o gate diario:

1. Resolver destino com identidade transacional existente, manter canal exato e
   verificar acesso comercial sobre a conversa resultante, inclusive formato `to`.
2. Enfileirar pelo mesmo mecanismo `queueTenantChatText`, com identidade estavel
   por tentativa e compatibilidade de resposta (`chatId`, `requiresTemplate`).
   Nao adicionar uma segunda fila nem enviar diretamente pelo provider na rota.
3. Fazer o cliente persistir/repetir a mesma tentativa, limitar prazo e preservar
   texto novo, alvo de resposta e contexto ao trocar conversa/usuario/tenant.
4. Provar em emuladores: concorrencia cria um chat/um job, repeticao com mesmo ID
   nao duplica, conflito de conteudo e chat inacessivel sao recusados, caso Meta
   nao cria envio sem template, e CRM fica recuperavel pelo processamento padrao.
5. Revalidar os gates afetados e documentar evidencias; so entao continuar Fase 8.

Na descoberta, a evidencia era apenas inspecao das duas rotas e do cliente.
Os 70 testes da rodada anterior nao cobriam esta entrada; a implementacao e as
evidencias corretivas atuais estao registradas acima. Nenhum envio real foi feito.

### Area visivel e teclado mobile — Fase 8

- Conversa em tela cheia usava apenas `100dvh`. Adicionado acompanhamento de
  `visualViewport.height/offsetTop` limitado ao workspace da Inbox abaixo de
  1280px. Desktop mantem a medicao anterior; ausencia da API preserva CSS;
  pinch zoom nao aplica o ajuste de altura. Nenhuma mudanca em autenticacao,
  backend, admin, CSS global ou configuracao de viewport do site inteiro.
- Referencia tecnica: [MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).
  Teclado pode reduzir a area visual sem reduzir a area de layout; medidas de
  janela comum nao substituem a validacao de teclado iOS/Android.
- Eventos de resize/pan agrupados por animation frame; desmontagem cancela
  trabalho pendente, remove listeners e restaura propriedades anteriores.
  Nove testes novos aprovados; suite direcionada 70/70, sem falhas. Lint do
  lote aprovado e typecheck da Inbox/dependencias com zero diagnosticos.
- No navegador autenticado, area reduzida 390x480 manteve 100 mensagens e
  rascunho, body 390px, campo e envio y422..470 dentro da janela. Propriedades
  de viewport foram observadas no elemento do workspace, nao apenas em fixture.
- Matriz de geometria da versao atual (sem toque ou teclado real):

  | Viewport | Body | Base do campo | Base do envio | Override mobile |
  | --- | --- | --- | --- | --- |
  | 390x844 | 390 | 834 | 834 | 844px |
  | 768x1024 | 768 | 1014 | 1014 | 1024px |
  | 1366x768 | 1351 | 719 | 718 | removido |
  | 1920x1080 | 1905 | 1031 | 1030 | removido |

- Nos quatro tamanhos: 100 mensagens e rascunho preservados, sem overflow
  horizontal; envio com altura 48px e largura minima 48px. Isso comprova
  geometria responsiva, nao abertura de teclado virtual, captura real de audio,
  eventos de toque ou a jornada completa exigida para homologacao.
- Hashes dos quatro arquivos de produto conferiram com a copia isolada.
  Captura desktop: `.qa-artifacts/inbox-resilience/inbox-viewport-desktop-1366.png`.
  Fase 8 permanece aberta; Fase 9 nao iniciada; nada publicado.

### Chegada de mensagens durante leitura — Fase 8

- Adicionado aviso de novas mensagens na propria conversa, com acao explicita
  para ir ao fim. Contagem usa apenas IDs novos da sincronizacao incremental;
  atualizacao de status, pagina repetida e carregamento de historico nao contam.
  Estado visivel e vinculado a tenant/operador/conversa. Foco no campo de texto
  nao forca mais o historico ao fim.
- Quatro testes novos aprovados; suite direcionada 61/61. Lint e typecheck
  direcionados aprovados. Nenhuma alteracao de backend, admin ou rota.
- Na Inbox autenticada, uma mensagem ficticia foi adicionada diretamente ao
  Firestore local. Historico passou de 100 para 101 itens; ancora `message-0185`
  permaneceu em -7 px e scrollTop 5085, com rascunho intacto. Aviso mostrou
  `1 nova mensagem`. Nenhum job de saida foi criado.
- Em 390x844: largura do body 390, aviso y742..778 e botao Enviar y786..834.
  Botao mobile corrigido de 16 para 48 px de largura, mantendo altura 48.
  Captura `.qa-artifacts/inbox-resilience/inbox-new-message-preserved.jpg`.
- Primeiro teste de Ir para o fim falhou: aviso sumiu, mas ResizeObserver
  restaurou a ancora antiga (gap final 2843). Corrigido registrando a decisao
  explicita de acompanhar o fim antes da mudanca de altura do compositor.
  Reteste apos recarga completa aprovado: segunda chegada incremental manteve
  ancora `message-0185` em -7.28125 px; clique levou gap a zero, removeu aviso e
  preservou rascunho. Redimensionamento de volta ao viewport normal manteve
  gap zero. Captura `inbox-new-message-jump-verified.jpg` na mesma pasta QA.
- Alteracao de hooks gerou erro de ordem durante Fast Refresh; recarga completa
  foi realizada. Carga inicial excedeu prazo no laboratorio e recuperou 100
  mensagens pela acao Atualizar, sem perder rascunho nem a ancora do historico.
- Usuario reabriu a aba e a observacao foi permitida. Tentativas de microfone
  nao produziram gravacao/pedido visivel; ultima acao teve timeout de input.
  Verificacao posterior nao mostrou gravacao/pedido pendente. Proxy permaneceu
  interrompido durante tentativas, sem POST de midia; depois foi restaurado.
  Audio real continua nao homologado, sem afirmar que houve permissao negada.
- Aviso do Auth Emulator cobre controles inferiores no viewport mobile: limite
  do laboratorio, nao removido nem usado como prova de teclado virtual real.
- Duas mensagens adicionais ficaram no emulador alpha para essa verificacao
  (442 registros, contra 440 do seed inicial); beta nao foi alterada. Nao
  confundir esse incremento ficticio com envio externo ou volume produtivo.
- Fase 8 aberta; Fase 9 nao iniciada; nada publicado.

### Evidencia autenticada e protecao do microfone

- Na aba HTTP aberta pelo usuario, a Inbox ficticia alpha restaurou a sessao.
  Anexo `qa-attachment.txt` foi submetido duas vezes com a API do tenant
  interrompida no proxy: duas requisicoes POST `send-media` interceptadas,
  arquivo e rascunho preservados, sem chegada ao backend de envio.
- Depois da primeira tentativa, texto e alvo de resposta foram alterados.
  A interface avisou que a repeticao manteria legenda/resposta originais.
  A recuperacao de rede manteve as 100 mensagens carregadas e o novo texto.
  Consulta ao emulador nessa rodada: zero jobs de saida, 440 mensagens alpha.
- Leitura autenticada antes/depois de recarga completa: 100 mensagens,
  ancora `qa-altum-alpha-chat-1-message-0196`, deslocamento -54 px,
  scrollTop 7193 e rascunho `Novo rascunho QA — não apagar` preservados.
  Nao e apenas fixture de hook.
- Antes de acionar o microfone, revisao identificou permissao assíncrona que
  poderia retornar depois de cancelar/desmontar, alem de pedido duplo pendente.
  Gate agora invalida callbacks antigos, encerra tracks retornados tardiamente
  e impede pedidos simultaneos; cancelamento fica acessivel enquanto aguarda
  permissao. Seis testes novos aprovados; suite direcionada de 55/55 revalidada.
- Usuario autorizou gravacao local de aproximadamente dois segundos. Na retomada,
  servicos 3198/3199/8080/9099/9199 estavam ausentes. Emuladores oficiais foram
  reativados, anunciaram prontidao, seed confirmou novamente 440 mensagens por
  empresa e Next isolado anunciou Ready em 3199. Proxy local esta em 3198.
  Retomada da aba antiga foi recusada pela politica do navegador; nenhuma
  tentativa de contornar foi feita. Nenhuma gravacao ocorreu nessa retomada.
  Nao declarar microfone, codec ou envio de audio homologados.
- Falha de rede de midia agora recebe aviso acionavel em portugues, sem afirmar
  que uma requisicao incerta nao foi enviada nem prometer arquivo salvo apos
  recarga. Mensagens especificas de formato/prazo e bloqueio de Storage continuam.
  Mais dois testes aprovados; suite atual 57/57, typecheck direcionado zero
  diagnosticos e lint aprovado. Hashes da Inbox e dos dois helpers conferem
  na copia isolada.
- Fase 8 continua aberta; Fase 9 nao iniciada; nenhuma publicacao nesta rodada.

### Correcao de repeticao de midia

- Revisao encontrou ID de tentativa preservado, mas legenda e `replyToId`
  recalculados pelo compositor atual. Uma repeticao incerta podia trocar o
  conteudo vinculado ao mesmo ID e receber conflito de idempotencia.
- Cada arquivo selecionado agora guarda snapshot imutavel da primeira tentativa:
  legenda normalizada, mensagem respondida e texto original exato do compositor.
  Repeticoes reaproveitam esse snapshot, inclusive audio e lote parcialmente
  enviado. A fila permanece isolada por tenant/usuario/conversa e em memoria.
- Confirmacao limpa apenas o texto original correspondente; um novo rascunho
  nao e consumido por uma tentativa antiga. Arquivo removido nao pode gerar
  tentativa fantasma. Mudanca de contexto fica explicita em aviso na area atual
  de anexos, sem criar tela ou alterar API/backend/admin.
- Sete novos testes aprovados. Suite direcionada completa ampliada para 49
  testes: todos aprovados, zero falhas. ESLint dos tres arquivos de produto
  aprovado, typecheck da Inbox/dependencias com zero diagnosticos.
- Codigo atualizado tambem na copia isolada; hashes de Inbox,
  `use-inbox-media-draft.ts` e `inbox-upload.ts` conferiram com a origem.
- Evidencia e de codigo e testes dos mecanismos: ainda nao comprova repeticao
  visual de anexos/audio nem entrega real por provedor. Abertura manual da pagina
  apos correcao do laboratorio continua aguardando confirmacao do usuario.
- Fase 8 aberta; Fase 9 nao iniciada; nada publicado nesta rodada.

- Usuario autorizou seguir sem o teste real de atribuicao Meta. Essa excecao
  permite continuar a Fase 8, mas nao transforma atribuicao de campanha em
  resultado homologado; nenhum evento de conversao foi enviado nesta rodada.
- Fase 8 continua aberta; Fase 9 nao iniciada e nenhuma publicacao realizada.
- Suite direcionada atual: 32 testes aprovados, zero falhas, executando
  `node --import tsx --test tests/inbox-network-recovery.test.mts tests/inbox-load-gate.test.mts tests/inbox-request.test.mts tests/inbox-upload.test.mts tests/inbox-drafts.test.mts tests/conversation-pagination.test.mts`.
- Dois testes novos usam HTTP loopback real, servidor de falha controlada e os
  mecanismos reais de rascunho, requisicao e exclusao mutua de carregamentos:
  perda da confirmacao preserva texto e identidade para repeticao explicita;
  interrupcao libera o carregamento para uma consulta posterior bem-sucedida.
- O servidor desses dois testes e uma fixture, nao a rota real de envio. Nao
  comprova idempotencia do backend, entrega no WhatsApp nem recuperacao da tela.
- Corrigida a escolha da carga de mensagens: atualizacoes manuais e apos envio
  agora usam modo incremental quando existe historico e cursor, preservando as
  paginas antigas. Apos falha da carga inicial, mesmo o polling incremental deve
  fazer carga inicial completa, recuperando tambem cursores e `hasMore`.
- Tres testes novos cobrem essa politica, incluindo recarga completa explicita.
- Protecao de midia: fallback de video pequeno so pode ocorrer se o upload nao
  concluiu. Falha de confirmacao apos upload nao dispara outro transporte.
- Confirmacao de midia limpa somente a legenda original, preservando novo texto
  digitado durante o envio e um novo alvo de resposta em outra conversa.
- Tres testes adicionais cobrem fallback antes/depois do upload e preservacao
  exata de texto novo. Nao substituem comprovacao com arquivos no navegador.
- Nova rodada de `tests/inbox-session.emulator.mts`: cinco aprovados, incluindo
  token real do Auth Emulator, acesso por tenant e 220 mensagens em tres paginas.
- Servicos oficiais Auth, Firestore e Storage locais prontos; seed conferiu 440
  mensagens em cada uma das duas empresas ficticias, sem dados de producao.
- Navegador local nao homologado nesta rodada: comandos de navegacao/foco
  excederam o prazo; isso nao e evidencia de defeito nem de sucesso da interface.
  A alternativa documentada `browser.tabs.get` + DOM recuperou a leitura da
  pagina. Login ficticio foi submetido, mas exibiu erro generico enquanto o
  servidor compilava `/api/client-portal/me`; causa ainda nao comprovada.
  Captura: `.qa-artifacts/inbox-resilience/login-local-pendente.jpg`.
- Logs posteriores mostraram `/api/client-portal/me` HTTP 200 em 118s e 90s,
  acima do limite de 20s do login. Evidencia de lentidao no laboratorio, nao de
  senha invalida; nao extrapolar esse tempo para producao. Nova tentativa iniciada
  apos resposta da API: login concluido; painel autenticado mostrou Empresa QA
  alpha e operador QA. API aquecida respondeu em 925ms. Conversas respondeu HTTP
  200, mas a transicao de tela ainda nao foi comprovada nesta anotacao.
- Copia isolada recebeu a mesma correcao em Inbox e `inbox-load-gate.ts`; hashes
  atuais dos dois arquivos conferem com a origem. O manifesto original da copia
  e historico, nao descreve esses dois arquivos apos a atualizacao.
- Typecheck direcionado da Inbox e dependencias aprovado, zero diagnosticos.
  Primeira tentativa encontrou sintaxe invalida em tipos automaticos antigos do
  laboratorio; `next typegen` regenerou os tipos e a segunda tentativa passou.
- Apos protecoes de midia: ESLint direcionado aprovado (exit 0), e nova
  verificacao de tipos da Inbox/dependencias aprovada com zero diagnosticos.
- Copia isolada atualizada tambem com as protecoes de midia; hashes da Inbox,
  `inbox-upload.ts` e `inbox-load-gate.ts` conferem com origem nesta rodada.
- Durante a navegacao, Next dev registrou `Manifest file is empty` e HTTP 500
  em `ai-proactive`. Inspecao posterior de 32 arquivos de manifesto nao encontrou
  nenhum vazio; evidencia transitoria, nao motivo suficiente para apagar cache
  ou atribuir defeito ao backend de producao. Nenhum cache foi apagado.
- Navegacao direta para a conversa exibiu recuperacao de conta por erro de
  carregamento; acionado `Tentar novamente`, que mostrou `Preparando seu dia`.
  Recuperacao completa e falha controlada de mensagens continuam pendentes.
- Evidencia posterior da mesma rodada: conta recuperada e Inbox autenticada
  carregou 100 mensagens. Selecionado arquivo ficticio `qa-attachment.txt` pelo
  seletor real do navegador e digitada legenda QA; nenhum dado de cliente usado.
- Proxy local interrompeu efetivamente requisicoes (`interrupted` 0 -> 43).
  Durante falha, 100 mensagens, arquivo selecionado e legenda permaneceram na
  tela. Apos `restore` e atualizar, APIs de detalhe/mensagens responderam 200;
  DOM confirmou novamente 100 mensagens, mesmo arquivo/legenda e nenhum alerta
  naquele momento. Sem reiniciar Next durante a interrupcao/restauracao.
- Leitura somente no Firestore Emulator apos esse ciclo: zero
  `chat_outbound_jobs` para alpha e 440 mensagens preservadas. O contador do
  proxy e agregado, nao comprova sozinho quais metodos/rotas foram interrompidos.
- Carregada pagina anterior real: DOM passou de 100 para 200 mensagens. A
  verificacao imediata excedeu o prazo do seletor, mas leitura posterior e log
  da API `direction=older` HTTP 200 confirmaram os 200 itens.
- Corrigido carregamento manual que desmontava temporariamente a parede de
  mensagens: atualizacao incremental agora mantem o historico montado. Nova
  acao Atualizar confirmou 200 elementos durante a consulta, sem remover arquivo
  ou legenda. Botao de recuperacao respeita tambem `loadingDetail`.
- Separado erro de consulta da conversa de erros de envio: sucesso de consulta
  limpa apenas o primeiro, sem esconder pendencias de envio. Nova interrupcao
  mostrou aviso e preservou os 200 itens; proxy restaurado em `interrupted=66`.
  Confirmacao da limpeza automatica do aviso ainda pendente nesta anotacao.
- Suite de 32 testes reexecutada apos essas correcoes: todos aprovados.
- Ultima versao (incluindo separacao de erros e parede montada): lint direcionado
  exit 0 e typecheck direcionado zero diagnosticos.
- Viewport 390x844: 200 mensagens no DOM, rascunho preservado, largura de corpo
  390 e textarea entre y=786 e y=834. Nao prova teclado virtual ou toque; banner
  obrigatorio do Auth Emulator sobrepoe o rodape da captura e nao e UI de producao.
- Remocao apenas da selecao temporaria do arquivo ficticio foi observada; arquivo
  local original permanece. Recarga explicita da pagina concluida para eliminar
  estado anterior preservado por HMR. Resultado da nova carga ainda pendente.
- Resultado observado da recarga: apenas ferramentas dev/banner do emulador,
  sem Inbox. Console forneceu causa concreta: `Internal Next.js error: Router
  action dispatched before initialization`, originada em `hmrRefresh` do Next.
  Interrompida a homologacao nesse limite. Nao declarar recarga estavel ou Fase
  8 aprovada. Proximo passo e estabilizar o laboratorio/atualizacao automatica e
  repetir com a versao congelada antes da homologacao final.
- Viewport temporario restaurado ao padrao; proxy confirmado restaurado, com
  `unavailable=false` e 66 interrupcoes acumuladas; nenhum cache ou dado apagado.

### Diagnostico seguinte do laboratorio

- Usuario informou `Local QA upstream unavailable`: mensagem do proxy local,
  nao bloqueio de autenticacao. Portas 3198/3199 e tres emuladores acessiveis;
  HEAD direto e pelo proxy excederam 15s durante compilacao inicial do login.
- Acrescentado trace opcional de Webpack (`--trace-watch`): guardado por QA demo
  e opt-in, registra apenas nomes de dependencias modificadas/removidas.
- Trace real identificou ciclo de compilacao nos proprios arquivos gerados em
  `.qa-artifacts/next-inbox/dev`, incluindo manifestos, CSS/JS, trace e cache.
  Codigo do Next confirmou que o filtro padrao inclui `.next`, nao a saida QA.
- Correcao aplicada somente na configuracao QA: preserva regex original e ignora
  a pasta de artefatos do projeto atual por caminho absoluto ancorado. Nao ignora
  codigo-fonte de snapshots aninhados. Preserva a configuracao normal de producao.
- Novos testes cobrem Windows/POSIX, pasta ancestral QA, limites do nome, filtros
  anteriores e opt-in. Suite ampliada: 42 aprovados, zero falhas; lint e typecheck
  direcionados da configuracao aprovados.
- Runtime apos correcao: carga inicial HEAD de login completou em 42s. Apos
  compilacao, HEAD direto 3199 retornou 200 em 348ms, proxy 3198 em 355ms.
  Observacao HMR por 20s, com IDs independentes: conexoes abertas em 23/44ms,
  apenas `sync`/`isrManifest`, zero `serverComponentChanges`/`building`/`built`.
  Trace do servidor nao mostrou novas alteracoes nos artefatos nesse intervalo.
  Evidencia limitada a esse intervalo/rota, nao homologacao completa da Inbox.
- Falha de laboratorio identificada e correcao com evidencia runtime. Continua
  faltando reabrir manualmente a pagina HTTP e repetir recarga/recuperacao da
  Inbox autenticada; nenhum acesso automatizado ao navegador bloqueado ocorreu.
- Criado diagnostico tecnico loopback de HMR, sem sessoes de navegador ou dados
  da aplicacao. A primeira comparacao reutilizou `id` e nao e conclusiva: o Next
  indexa clientes por HTML request ID (`hot-middleware.js`). Corrigido para UUID
  independente por conexao; ambos caminhos agora recebem recompilacoes repetidas
  `serverComponentChanges`/`built`/`building`. Nao atribuir a causa apenas ao proxy.
- Corrigida inconsistencia real do proxy: HTTP e WebSocket agora reescrevem Host
  para o mesmo upstream loopback. Dois testes com HTTP/WebSocket reais verificam
  cabecalhos, eco do payload, interrupcao restrita ao tenant QA e restauracao.
- Proxy passou a contar interrupcoes por metodo/caminho, sem registrar query;
  CLI continua fixa em 3198 -> 3199, sem host externo. Instancia antiga encerrada
  deliberadamente e nova iniciada, `unavailable=false`, contadores reiniciados.
- Suite direcionada incluindo proxy: 34 testes aprovados, zero falhas.
- Recarga do navegador foi recusada pela politica de seguranca de URL/protocolo.
  Nao houve tentativa de contornar por outro navegador, CDP ou navegacao indireta.
  Solicitado ao usuario abrir manualmente a URL HTTP local da conversa ficticia.
- Gate continua aberto: causa da recompilacao repetida nao identificada, recarga
  e limpeza automatica do erro ainda nao comprovadas na versao congelada.
- Captura `inbox-proxy-recovered-200.jpg` mostra historico/anexo/legenda, mas
  ainda contem aviso de consulta; nao usar como prova de ausencia de erro.
- Pendente: completar falha/recuperacao controlada no navegador autenticado,
  recuperacao de midia e validacao de uso mobile com teclado/toque.

Status inicial da auditoria: fase 0 em andamento (historico abaixo)  
Escopo: `app/cliente/painel`, rotas consumidas pelo cliente e processamentos posteriores  
Regra: nenhuma area e considerada pronta somente porque a tela ou a rota existe.

## Objetivo

Descobrir o que funciona de verdade, o que funciona parcialmente, o que depende de
operacao manual e o que ainda e somente promessa de interface. A evolucao deve
preservar as telas e rotas existentes sempre que possivel.

## Criterio universal de pronto

Uma funcao so recebe estado `PRONTA` quando houver evidencia para todas as camadas:

1. a interface permite executar a acao no desktop e no mobile;
2. a API autentica, autoriza e valida o comando;
3. o dado e persistido com tenant, identidade, origem e horario corretos;
4. filas, automacoes e integracoes posteriores concluem ou tentam novamente;
5. o resultado reaparece na interface correta;
6. duplicidade, evento atrasado e repeticao nao corrompem o estado;
7. a falha e visivel, acionavel e recuperavel;
8. o historico pode ser consultado, exportado, arquivado e excluido corretamente.

Estados usados na auditoria:

- `PRONTA`: jornada comprovada de ponta a ponta.
- `CONTRATO_OK`: regras e contratos automatizados passam, sem prova externa completa.
- `PARCIAL`: parte da jornada funciona, mas existe uma lacuna confirmada.
- `NAO_HOMOLOGADA`: ha implementacao, mas falta evidencia real.
- `PROMESSA`: exibida ou implementada parcialmente, indisponivel ao cliente comum.
- `QUEBRADA`: o comportamento comprovadamente diverge do esperado.

## Evidencia executada em 12/10/2026

### Testes selecionados da area do cliente

- 92 testes executados.
- 92 aprovados.
- Cobertura: formularios, PWA, ecommerce, rastreamento, Inbox, roteamento,
  WhatsApp oficial e por sessao, Instagram, jornada comercial e operacao.
- Limite da evidencia: sao principalmente testes de contrato e unidade; nao provam
  um tenant autenticado usando provedores externos reais.

### Suite completa do repositorio

- 706 testes executados.
- 701 aprovados.
- 5 falharam.
- Duas falhas tocam contratos de IA da area do cliente; a primeira inspecionada e
  um teste textual desatualizado diante de uma validacao mais restritiva no codigo.
- Tres falhas pertencem ao runtime administrativo/criativo e devem permanecer
  separadas da avaliacao do cliente.

### Typecheck e lint

- A geracao de tipos do Next concluiu.
- O typecheck global falhou em arquivos de admin/runtime que ja estavam em alteracao.
- Nenhuma falha de tipo da area do cliente apareceu no resultado emitido.
- O lint global foi interrompido apos varios minutos sem emitir diagnostico. Deve ser
  substituido, durante a auditoria, por lint por area e depois voltar ao gate global.

## Descobertas transversais confirmadas

### 1. Historico de conversas nao garante acesso integral

- A listagem de chats permite no maximo 200 registros e nao possui cursor.
- A abertura de uma conversa carrega ate 500 mensagens e nao possui `carregar antigas`.
- O fallback sem indice pode selecionar um recorte sem ordenacao confiavel.
- As mensagens permanecem no banco, mas podem deixar de aparecer para o usuario.
- Midias persistidas em `chat-media` nao possuem ciclo de vida sincronizado com o chat.

Estado: `PARCIAL`.

### 2. Exclusao e restauracao possuem limites silenciosos

- O snapshot de lixeira e limitado.
- A exclusao processa ate 1.000 documentos em uma passagem.
- Conversas grandes podem ser restauradas incompletas ou deixar documentos e arquivos
  de Storage orfaos.

Estado: `PARCIAL`, risco alto de integridade e privacidade.

### 3. CRM durante atendimento humano tem observacao, mas nao tem recuperacao garantida

- Nova mensagem do cliente passa pelo observador comercial mesmo com resposta
  automatica pausada.
- Mensagem enviada pelo atendente tambem executa o observador e pausa a resposta
  automatica por 30 minutos.
- Se o observador falhar depois do envio, a falha e apenas registrada no log. Nao ha
  fila dedicada, recibo nem reprocessamento garantido para completar o CRM.
- Portanto, o caminho normal cobre compromissos escritos pelo humano, mas uma falha
  transitoria pode deixar etapa, tarefa ou proxima acao incompletas.

Estado: `PARCIAL`.

### 4. Sugestao de resposta existe, mas ainda nao e um copiloto contextual

- A sugestao atual e derivada por regras e modelos de jornada.
- A acao principal copia o texto, em vez de inserir uma sugestao contextual editavel
  no compositor.
- Nao ha ciclo claro de aceitar, editar, rejeitar e medir o resultado.

Estado: `PARCIAL`.

### 5. Atribuicao Meta/WhatsApp nao fecha o ciclo exato

- O webhook de WhatsApp recebe `ctwa_clid` e contexto de campanha.
- Esse contexto nao percorre integralmente o intake do lead.
- A conversao Meta e emitida como `website`, inclusive para origem de mensagem.
- O retorno pode depender de correspondencia probabilistica do telefone, sem a
  atribuicao deterministica do clique para WhatsApp.

Estado: `PARCIAL`, prioridade critica.

### 6. Metricas e buscas usam amostras silenciosas

- Metricas leem no maximo 700 leads, 350 chats, 1.800 mensagens, 500 compromissos e
  outros limites fixos antes de calcular resultados.
- A busca global examina ate 180 registros de cada tipo, sem indice de busca completo.
- Follow-ups leem ate 300 tarefas e 1.200 chats.
- A Agenda verifica conflitos em um conjunto de ate 500 compromissos sem consulta
  temporal especifica.
- Em tenants maiores, os numeros e resultados podem ficar incompletos sem aviso.

Estado: `PARCIAL`, risco cresce com o uso.

### 7. Reunioes assistidas possuem implementacao oculta

- Cliente comum recebe pagina `Em breve`.
- Perfis Altum acessam implementacao com transcricao, resumo, coach ao vivo, bot e
  finalizacao.
- A existencia das rotas nao comprova providers, custo, qualidade ou persistencia em
  uma reuniao real.

Estado: `PROMESSA` para o tenant e `NAO_HOMOLOGADA` internamente.

### 8. Mobile possui estrutura, mas nao jornada comercial autenticada comprovada

- Existem navegacao e componentes responsivos.
- Os E2E atuais cobrem login publico e bloqueio de acesso anonimo.
- Inbox, CRM, Agenda, campanhas e configuracoes ainda nao possuem evidencia de uma
  jornada autenticada completa nos viewports principais.

Estado: `NAO_HOMOLOGADA`.

## Matriz de auditoria por area

| Area existente | O que deve ser comprovado | Estado inicial |
| --- | --- | --- |
| Inicio | prioridades reais, links acionaveis, contagens completas, atualizacao apos eventos | NAO_HOMOLOGADA |
| Conversas | entrada, historico, midia, audio, reacao, template, envio, atribuicao, handoff, busca e retencao | PARCIAL |
| CRM | criacao, dedupe, identidade, edicao, IA, tarefas, notas, etapa, distribuicao, importacao e desfazer | PARCIAL |
| Agenda | criacao, conflito, timezone, edicao, cancelamento, lembrete, vinculo com lead e sincronizacao | NAO_HOMOLOGADA |
| Produtos e servicos | CRUD, importacao, midia, estoque, precos, uso pela IA e exclusao | CONTRATO_OK |
| Captacao | formulario, UTM persistente, consentimento, spam, dedupe, dono e resposta posterior | PARCIAL |
| Campanhas | audiencia, preview, janela WhatsApp, fila, pausa, retry, opt-out, metricas e conversao | CONTRATO_OK |
| Meta Ads | leitura, recomendacao, rascunho pausado, aprovacao, aplicacao e atribuicao de receita | PARCIAL |
| Google Ads | leitura, recomendacao, rascunho, aprovacao, aplicacao e conversao offline | NAO_HOMOLOGADA |
| Relatorios | cobertura completa, timezone, filtros, receita, amostra e exportacao | PARCIAL |
| Perguntar a Altum | escopo, fontes, cobertura, incerteza, permissoes e atualidade dos dados | NAO_HOMOLOGADA |
| Assistente Altum | configuracao efetiva, papeis, preview/producao, memoria, voz, handoff e rollback | CONTRATO_OK |
| Automacoes | gatilho, condicao, idempotencia, espera, retry, opt-out, auditoria e simulacao | CONTRATO_OK |
| Instagram | DM, comentario, resposta privada, janela Meta, midia, opt-out, falha e reprocessamento | NAO_HOMOLOGADA |
| Comercial | proposta, aprovacao, cobranca, conciliacao, cancelamento, estorno e historico | CONTRATO_OK |
| Ecommerce | OAuth/webhook, pedido, carrinho, estoque, rastreio, recompra, refund e dedupe | CONTRATO_OK |
| Equipe | convite, perfil, capacidade, carteira, offboarding, transferencia e auditoria | CONTRATO_OK |
| Configuracoes | salvamento parcial, concorrencia, validacao, permissao e efeito real no runtime | PARCIAL |
| Lixeira | snapshot completo, restauracao, expurgo, Storage e comprovante de exclusao | PARCIAL |
| Reunioes assistidas | captura real, consentimento, bot, transcricao, CRM, falha e custo | PROMESSA |

## Testes ponta a ponta obrigatorios

### Jornada A — aquisicao ate venda

1. Criar campanha de teste pausada.
2. Simular clique com identificadores reais de teste.
3. Entrar por WhatsApp e por formulario.
4. Confirmar identidade, lead, conversa, origem e campanha.
5. Qualificar por IA e por humano.
6. Criar compromisso e proposta.
7. Confirmar pagamento ficticio no emulador/sandbox.
8. Confirmar CRM, relatorio, receita e evento de conversao no destino.

### Jornada B — conversa longa

1. Criar mais de 220 conversas.
2. Criar uma conversa com mais de 550 mensagens e diferentes midias.
3. Buscar a conversa antiga e carregar o inicio do historico.
4. Arquivar, restaurar e excluir.
5. Verificar documentos, indices, anexos e Storage orfaos.

### Jornada C — humano com copiloto

1. Cliente envia necessidade, orcamento e prazo.
2. Atendente assume a conversa.
3. Copiloto sugere resposta baseada em mensagem, playbook e catalogo.
4. Atendente edita e envia.
5. CRM registra fato do cliente e compromisso do atendente.
6. Aceite, edicao e resultado da sugestao ficam mensuraveis.

### Jornada D — falhas e recuperacao

1. Repetir o mesmo webhook.
2. Entregar eventos fora de ordem.
3. Simular timeout do provedor.
4. Simular token expirado e cota encerrada.
5. Confirmar retry, dead letter, alerta e reprocessamento sem duplicidade.

### Jornada E — desktop e mobile

Executar A, B e C em 390x844, 768x1024, 1366x768 e 1920x1080, incluindo
teclado virtual, retorno de navegacao, audio, upload, modais e perda de rede.

## Referencias tecnicas a comparar

### Chatwoot

Usar como referencia para Inbox, paginacao de mensagens, colaboracao, notas privadas,
atribuicao, capacidade de agentes, respostas prontas, workflows e copiloto no compositor.
Nao copiar integralmente: a Altum tambem precisa conduzir venda e CRM.

### Twenty

Usar como referencia para eventos explicitos de timeline, modelo de dados relacionado,
workflows, permissoes e automacoes disparadas por alteracao de registros.

### Frappe CRM

Usar como referencia para Deal como agregado comercial, SLA, dono, contato principal,
probabilidade e enriquecimento que preserva campos preenchidos pelo usuario.

### Typebot

Usar como referencia para playbooks executaveis com blocos, variaveis, condicoes,
webhooks, retomada e versionamento. Tratar isolamento de tenant e autorizacao de
callbacks como requisito explicito.

## Direcao arquitetural sem reescrita

Adicionar progressivamente um nucleo operacional entre os canais e as funcoes atuais:

`evento recebido -> identidade -> timeline -> projecoes -> acoes -> resultado`

- Eventos canonicos e imutaveis para mensagem, lead, etapa, tarefa, agenda, proposta,
  pagamento, handoff e conversao.
- Outbox transacional para que salvar o evento e agendar efeitos ocorram juntos.
- Processadores idempotentes com retry, dead letter e recibo de execucao.
- Projecoes separadas para Inbox, CRM, Agenda, Relatorios e atribuicao.
- Adaptadores de provider para WhatsApp, Meta, Google, ecommerce e pagamentos.
- Politicas por tenant para IA, playbook, retencao, horario e permissao.
- Migracao em modo sombra, comparando estado antigo e novo antes da troca.

## Ordem das proximas auditorias

1. Conversas, identidade, historico, midia e retencao.
2. Lead, CRM, atendimento humano, tarefas e agenda.
3. Atribuicao, Meta/Google, campanhas e receita.
4. IA, copiloto, handoff, memoria e playbooks.
5. Produtos, ecommerce, propostas, cobranca e pos-venda.
6. Relatorios, busca, readiness, configuracoes, equipe e lixeira.
7. Homologacao desktop/mobile e falhas de integracao.

Cada item deve produzir: evidencia, defeito reproduzivel, impacto, proposta incremental,
teste de regressao e criterio objetivo de encerramento.

## Fase 1 — auditoria profunda de Conversas

Data da auditoria: 13/10/2026.

### Evidencia executada

- 42 de 42 testes focados passaram para evento canonico, idempotencia de entrada,
  providers, grupos, janela de 24 horas, escopo comercial, roteamento e observabilidade.
- A suite completa do projeto executou 706 testes: 701 passaram e 5 falharam. Uma
  falha e um contrato textual antigo de handoff; as outras quatro pertencem a areas
  internas/admin fora deste escopo. Nao apareceu falha funcional nova da Inbox nessa
  execucao.
- Typecheck gera os tipos do Next corretamente, mas termina com erros em arquivos
  internos/admin ja modificados na arvore de trabalho. Nenhum erro apontou para a
  Inbox do cliente.
- A validacao com emuladores Firestore/Storage nao foi concluida porque a ferramenta
  Firebase nao esta instalada localmente e a preparacao via `npx` nao chegou a iniciar
  os emuladores. Java 21 esta disponivel. Isto e um bloqueio de infraestrutura de QA,
  nao uma aprovacao das regras.
- Nao existe hoje uma jornada E2E autenticada de Conversas. Os testes de navegador
  existentes comprovam apenas login publico e bloqueio de acesso anonimo.

### O que esta realmente funcional

| Capacidade | Evidencia | Estado |
| --- | --- | --- |
| Isolamento por empresa | Rotas validam tenant, modulo, perfil e acesso comercial ao chat | FUNCIONAL |
| Identidade WhatsApp | Identidade deterministica considera tenant, canal e telefone; grupos mantem JID | FUNCIONAL |
| Webhook repetido | Evento recebido e mensagem usam chaves deterministicas; claims evitam repeticao comum | FUNCIONAL |
| Evento atrasado | Cursor da conversa nao retrocede quando chega mensagem antiga | FUNCIONAL |
| Janela WhatsApp | Backend impede midia fora da janela e usa template no texto quando aplicavel | FUNCIONAL |
| Recibos WhatsApp | Status enviado, entregue, lido e falhou atualizam mensagem e conversa | FUNCIONAL |
| Resposta humana e CRM | Envio humano pausa resposta automatica e executa observador comercial | FUNCIONAL COM RISCO |
| Rede lenta e aba oculta | Polling evita sobreposicao, respeita offline, visibilidade e economia de dados | FUNCIONAL |
| Historico completo | Somente as 500 mensagens mais recentes; nao ha carregar anteriores | INCOMPLETO |
| Lista completa | Somente as 100 conversas mais recentes; filtros e busca sao locais | INCOMPLETO |
| Envio exatamente uma vez | Nao existe chave idempotente fornecida pelo navegador no envio de texto | INCOMPLETO |
| Fila de midia recuperavel | Retry existe, mas job preso em processamento nao e retomado | INCOMPLETO |
| Exclusao e restauracao completas | Snapshot, exclusao e Storage possuem limites e cobertura diferentes | INCOMPLETO |
| Mobile autenticado | Estrutura responsiva existe, mas jornada real nao foi executada | NAO_HOMOLOGADO |

### Defeitos e riscos confirmados

#### C1 — conversa antiga fica invisivel

- A Inbox carrega no maximo 100 conversas.
- Busca, canal, responsavel, prioridade, temperatura, fila e status sao aplicados no
  navegador somente sobre essas 100.
- Nao ha cursor, `hasMore` ou busca remota para chegar na conversa 101.

Impacto: atendente pode concluir incorretamente que uma conversa ou cliente nao existe.

Prioridade: `P0`.

#### C2 — inicio de conversa longa nao pode ser acessado

- A primeira carga retorna as 500 mensagens mais recentes.
- Nao existe cursor para buscar mensagens anteriores.
- O fallback sem indice retorna ate 1.000 documentos sem ordem garantida.

Impacto: historico, consentimento, promessa e contexto comercial antigos podem ficar
inacessiveis mesmo continuando armazenados.

Prioridade: `P0`.

#### C3 — polling incremental pode perder rajada acima de 200 mensagens

- A consulta incremental retorna no maximo 200 itens.
- O proximo cursor e calculado a partir do item mais novo recebido.
- Se mais de 200 mensagens entrarem entre duas atualizacoes, itens intermediarios
  podem nunca ser solicitados novamente.

Impacto: perda silenciosa de mensagens na tela em picos, importacoes ou grupos ativos.

Prioridade: `P0`.

#### C4 — reenvio humano pode duplicar a mensagem externa

- O navegador envia texto sem uma chave idempotente.
- A mensagem e persistida somente depois da confirmacao do provider.
- Em timeout depois do provider aceitar, a interface exibe falha. Um novo clique pode
  enviar novamente sem que o servidor reconheca a repeticao.

Impacto: mensagem duplicada para o lead, desgaste comercial e risco juridico em
comunicacao sensivel.

Prioridade: `P0`.

#### C5 — fila de midia pode ficar presa

- Jobs possuem claim transacional e tres tentativas.
- A busca de jobs prontos nao ordena por `dueAt`; jobs futuros podem ocupar a janela
  lida e atrasar jobs vencidos.
- Nao existe recuperacao de status `processing` antigo. Uma interrupcao apos o claim
  pode deixar a mensagem presa indefinidamente.
- Nao existe dead letter operacional nem acao de reenviar na Inbox.

Impacto: anexo aparece como enviando para sempre ou falha sem caminho claro de
recuperacao.

Prioridade: `P0`.

#### C6 — exclusao pode apagar mais do que consegue restaurar

- O snapshot guarda ate 400 documentos por colecao relacionada.
- A exclusao remove ate 1.000 em uma unica consulta.
- Restauracao le ate 5.000 documentos, mas nao consegue restaurar o que nunca entrou
  no snapshot.
- Arquivos de `chat-media` no Storage nao sao apagados junto com a conversa.
- O texto da Inbox comunica exclusao definitiva, embora o backend mova para lixeira
  por 30 dias.

Impacto: restauracao parcial, arquivos orfaos, custo e risco de privacidade.

Prioridade: `P0`.

#### C7 — criacao concorrente no Instagram/Messenger pode duplicar conversas

- O WhatsApp possui identidade canonica transacional.
- Instagram/Messenger consultam e depois criam um chat com ID aleatorio.
- Dois webhooks simultaneos do primeiro contato podem nao enxergar um ao outro e criar
  duas conversas para a mesma conta e pessoa.

Impacto: historico dividido, atribuicao e CRM inconsistentes, dois atendentes falando
com o mesmo lead.

Prioridade: `P1`.

#### C8 — detalhes laterais usam amostras silenciosas

- Timeline do lead: 8 eventos; documentos: 20; notas/tarefas: 16; notas do chat: 100;
  propostas e financeiro: consulta de 24 e exibicao de 6.
- Algumas consultas limitam antes de ordenar e podem selecionar um subconjunto
  arbitrario.
- Nao existe indicacao de que ha mais registros.

Impacto: decisao comercial baseada em ficha aparentemente completa, mas truncada.

Prioridade: `P1`.

#### C9 — nova mensagem pode interromper leitura do historico

- Sempre que a quantidade de mensagens muda, a interface rola para o fim.
- O comportamento nao verifica se o atendente estava lendo mensagens antigas.

Impacto: perda de posicao e erro de contexto durante atendimento ativo.

Prioridade: `P1`.

#### C10 — observador comercial nao tem entrega garantida

- O envio humano chama o observador corretamente.
- A falha e capturada e registrada, mas o envio continua concluido sem job de retry.

Impacto: conversa enviada com sucesso e CRM desatualizado sem sinal para o atendente.

Prioridade: `P1`.

#### C11 — upload direto pode virar arquivo orfao

- Videos e arquivos maiores sobem primeiro ao Storage.
- Se a chamada seguinte para criar o job falhar, nao ha limpeza automatica desse
  upload.
- A regra de Storage nao permite ao navegador apagar o arquivo.

Impacto: consumo acumulado de Storage e dados sem referencia operacional.

Prioridade: `P1`.

#### C12 — fallback de audio pode produzir experiencia diferente por aparelho

- Audio e convertido para voz WhatsApp e MP3 de reproducao.
- Se a conversao falha, o worker continua com o formato original.
- Um formato aceito no upload pode nao tocar em todos os navegadores moveis.

Impacto: audio entregue ao canal, mas impossivel de ouvir em alguns aparelhos dentro
da Altum.

Prioridade: `P2`.

### Plano de correcao incremental

#### Bloco 1 — historico e descoberta sem perda

1. Criar paginacao por cursor para chats, com filtros e busca executados no servidor.
2. Criar paginacao para mensagens antigas usando cursor estavel composto por data e ID.
3. Trocar o incremental limitado por cursor paginavel ate esgotar o intervalo.
4. Remover fallbacks sem ordem; erro de indice deve ser observavel, nao silencioso.

Criterio de pronto:

- localizar e abrir a conversa 1.001;
- navegar da mensagem 2.000 ate a primeira sem lacunas ou duplicatas;
- receber rajada superior a 200 mensagens sem perder nenhuma;
- filtros exibirem total/cobertura e continuarem corretos apos paginacao.

#### Bloco 2 — envio confiavel e fila recuperavel

1. Gerar `clientRequestId` no compositor e tornar envio de texto idempotente no servidor.
2. Persistir estado `sending` antes do provider e reconciliar resposta/timeout.
3. Ordenar jobs de midia por `dueAt`, recuperar claims antigos e criar dead letter.
4. Expor reenviar/cancelar para mensagem falha, reutilizando a mesma chave idempotente.
5. Enfileirar o observador comercial com recibo e retry independente do envio externo.

Criterio de pronto:

- repetir a mesma requisicao 10 vezes produz uma unica mensagem externa;
- matar o worker durante o claim recupera o job automaticamente;
- falha definitiva fica visivel e reprocessavel;
- CRM converge depois de falha temporaria sem exigir nova mensagem do cliente.

#### Bloco 3 — retencao, lixeira e Storage

1. Substituir limites unicos por paginacao completa no snapshot e na exclusao.
2. Gravar manifesto e contagens por colecao; impedir exclusao se snapshot estiver
   incompleto.
3. Vincular objetos do Storage ao manifesto e apaga-los apenas no expurgo definitivo.
4. Criar limpeza de uploads sem job e politica de retencao configuravel por tenant.
5. Corrigir a linguagem da Inbox para `Mover para a lixeira` e mostrar prazo de 30 dias.

Criterio de pronto:

- conversa com 2.000 mensagens e anexos restaura 100% antes do vencimento;
- expurgo remove Firestore e Storage e gera comprovante com contagens;
- nenhuma conversa e removida quando snapshot e manifesto divergem.

#### Bloco 4 — identidade social e ficha completa

1. Aplicar identidade deterministica/transacional tambem a Instagram e Messenger.
2. Migrar duplicidades existentes com alias e trilha de auditoria.
3. Paginar ou resumir explicitamente timeline, tarefas, notas, documentos, propostas e
   financeiro; nunca apresentar amostra como total.

Criterio de pronto:

- 20 webhooks simultaneos do primeiro contato geram um chat;
- nenhuma mensagem fica orfa durante merge;
- cada bloco lateral informa total, itens exibidos e caminho para ver o restante.

#### Bloco 5 — experiencia diaria desktop e mobile

1. Preservar posicao quando o atendente estiver acima do fim e exibir `novas mensagens`.
2. Manter rascunho por conversa e restaurar apos troca de chat/rede.
3. Mostrar estados enviando, entregue, lido, falhou e tentativa de recuperacao de modo
   consistente para texto e midia.
4. Executar jornada autenticada nos quatro viewports definidos, incluindo teclado,
   audio, upload, retorno e queda de rede.

Criterio de pronto:

- nenhuma nova mensagem arranca o atendente do ponto que esta lendo;
- rascunho sobrevive a troca de conversa e recarga;
- mesmas acoes essenciais funcionam em 390x844 e desktop;
- Playwright autenticado cobre sucesso, offline, retry e permissao.

### Gate para encerrar a fase

A fase Conversas so pode ser marcada `PRONTA` quando todos os criterios dos cinco
blocos passarem em testes automatizados e numa jornada autenticada com providers de
teste. Ate la, seu estado permanece `AUDITADA, NAO CORRIGIDA`.

### Execucao da missao — gate da Fase 1

Status: `APROVADA EM CODIGO E EMULADOR` em 13/10/2026. A homologacao visual
autenticada permanece concentrada na Fase 9, sem bloquear o inicio da engenharia da
Fase 2.

Entregue:

- cursor opaco e versionado composto por timestamp e ID do documento;
- paginação de conversas em ordem estavel, sem fallback desordenado;
- busca e filtros enviados ao servidor, com varredura paginada automatica;
- enriquecimento de lead e estado da IA limitado a pagina examinada, sem teto global
  de 500 registros nesse caminho;
- paginação para mensagens antigas;
- atualização incremental paginada ate esgotar cada rajada;
- desempate por ID para documentos com o mesmo timestamp;
- preservacao da posicao ao inserir mensagens antigas;
- lista carregada nao volta para a primeira pagina durante o polling;
- indicador e acao para continuar carregando quando ainda existe cobertura pendente.

Evidencias:

- ESLint dos arquivos alterados: aprovado;
- typecheck completo: aprovado;
- build Next de producao: aprovado, 367 paginas estaticas geradas;
- contratos direcionados: 44 de 44 aprovados;
- emulador Firestore: 1.501 conversas acessadas exatamente uma vez;
- emulador Firestore: 2.001 mensagens antigas acessadas sem lacuna ou duplicidade;
- emulador Firestore: rajada de 2.001 mensagens drenada para frente sem perda,
  incluindo timestamps repetidos.

Suite global observada antes da atualizacao do ultimo contrato legado: 713 testes,
707 aprovados e 6 falhas. Uma das seis era a expectativa antiga de limite da Inbox e
foi corrigida e reexecutada com sucesso; as outras cinco ja existiam e pertencem aos
contratos de IA/admin/runtime fora desta fase.

### Execucao da missao — gate da Fase 2

Status: `APROVADA EM CODIGO E EMULADOR` em 13/10/2026.

Entregue:

- texto e midia recebem uma chave de requisicao mantida pelo navegador em repeticoes;
- IDs de outbox e mensagem sao deterministicos por tenant, conversa e requisicao;
- mensagem visivel, pausa da IA, estado da conversa e job sao gravados em uma unica
  transacao antes da chamada ao provedor;
- repeticoes concorrentes devolvem a operacao existente; conteudo diferente com a
  mesma chave retorna conflito;
- o worker processa texto e midia usando o mesmo registro persistido;
- falha com resultado externo incerto nao e reenviada cegamente: fica como
  `reconciliation_required` e aparece ao atendente como entrega em confirmacao;
- o timestamp original da mensagem na fila e preservado depois da confirmacao.

Evidencias:

- testes puros de identidade e fingerprint: 3 de 3 aprovados;
- emulador Firestore: 3 de 3 aprovados, incluindo 20 requisicoes concorrentes de
  texto gerando exatamente um job e uma mensagem e deduplicacao de midia;
- contratos direcionados de Conversas e prontidao: 47 de 47 aprovados;
- ESLint e typecheck completos: aprovados;
- build Next de producao: aprovado, 367 paginas estaticas geradas.

Limite deliberado: provedores de mensagens nao oferecem transacao atomica com o
Firestore. Por isso a Altum garante aceitacao idempotente e evita reenvio cego; a
confirmacao/reconciliacao de resultados ambiguos pertence a Fase 3.

### Execucao da missao — gate da Fase 3

Status: `APROVADA EM CODIGO E EMULADOR` em 13/10/2026.

Entregue:

- sequencia monotona e encadeamento de predecessor por conversa;
- exclusao mutua por conversa com lease de cinco minutos;
- retomada automatica de job `processing` cujo lease venceu;
- retry exponencial somente quando nenhuma tentativa externa ocorreu;
- erro definitivo e esgotamento em `dead_letter`;
- resultado possivelmente aceito pelo provedor em `reconciliation_required`, sem
  repeticao automatica;
- reprocessamento autenticado e auditado; reconciliacao exige confirmacao humana
  explicita de que a mensagem nao foi entregue;
- estado de retry, falha e confirmacao refletido na mensagem e na Inbox;
- resumo operacional por tenant e health check global autenticado;
- indice de operacao da fila declarado e worker existente preservado.

Evidencias:

- classificacao deterministica de falhas: 4 de 4 testes puros aprovados;
- Firestore Emulator: 7 de 7, cobrindo concorrencia, ordem, lease ativo, lease
  vencido, dead letter e reprocessamento seguro;
- contratos direcionados: 48 de 48 aprovados;
- ESLint e typecheck completos: aprovados;
- build Next de producao: aprovado, 367 paginas estaticas geradas.

### Execucao da missao — gate da Fase 4

Status: `APROVADA EM CODIGO E EMULADOR` em 13/10/2026.

Entregue:

- mensagens recebidas, respostas humanas e respostas da IA alimentam a mesma fila
  duravel de observacao comercial;
- identidade deterministica por tenant e mensagem impede jobs, recibos e eventos
  comerciais duplicados;
- atualizacao principal do lead, recibo intermediario, log da IA e evento de CRM sao
  gravados atomicamente antes das projecoes comerciais derivadas;
- pausa da resposta automatica nao interrompe o aprendizado comercial do CRM;
- fatos extraidos continuam vinculados ao texto do cliente, enquanto compromissos do
  atendente e da IA sao registrados como acoes da conversa;
- worker com lease, retomada apos interrupcao, retry exponencial e `dead_letter`;
- reprocessamento manual autenticado com trilha de auditoria;
- reconciliador por tenant encontra mensagens antigas sem job e reconstroi a fila;
- health check global e por tenant integrado ao worker existente;
- indice operacional declarado e contrato automatico contra regressao dos tres
  pontos de entrada.

Evidencias:

- Firestore Emulator: 6 de 6 aprovados, incluindo 20 enfileiramentos concorrentes,
  deduplicacao de evento, mensagens humana/IA, lease vencido, dead letter auditada e
  reconciliacao com isolamento entre tenants;
- contratos direcionados: 46 de 46 aprovados;
- ESLint e typecheck completos: aprovados;
- build Next de producao: aprovado, 367 paginas estaticas geradas.

### Execucao da missao — gate da Fase 5

Status: `APROVADA EM CODIGO E EMULADOR` em 13/10/2026.

Entregue:

- identidade de contato por aliases deterministas e transacionais, sem varredura de
  ate 2.000 contatos;
- telefone e e-mail normalizados unem canais quando existe evidencia real da mesma
  pessoa;
- IDs externos sao escopados por canal, evitando unir por engano perfis com o mesmo
  valor bruto no Instagram e Messenger;
- contatos, leads e chats recebem `contactId` canonico;
- criacao social de lead e chat e transacional e resiste a webhooks simultaneos;
- webhook ao vivo e sincronizacao historica do Messenger usam o mesmo contrato;
- WhatsApp consulta a identidade canonica antes de criar outro lead;
- reconciliacao autenticada por tenant cria aliases para legado e informa cobertura;
- chats sociais duplicados migram todas as mensagens antes de o alias antigo ser
  escondido da Inbox, preservando trilha de auditoria e sem mensagem orfa;
- nomes reais ja conhecidos nao sao substituidos por rotulos genericos do canal.

Evidencias:

- Firestore Emulator: 7 de 7 aprovados, incluindo 20 operacoes concorrentes de
  contato, 20 criacoes concorrentes de chat, 20 criacoes concorrentes de lead,
  isolamento por tenant/conta/canal e migracao de duplicidade legada;
- contratos direcionados: 51 de 51 aprovados;
- ESLint, typecheck e verificacao de diff: aprovados;
- build Next de producao: aprovado, 369 paginas estaticas geradas.

### Excecao autorizada e inicio da Fase 8 — 16/10/2026

O usuario autorizou explicitamente avancar sem o teste real de atribuicao via
anuncio WhatsApp. Essa dispensa permite iniciar a Fase 8; nao comprova atribuicao
nem transforma o gate externo da Fase 7 em aprovado. Preservar essa ressalva na
homologacao final, sem dados ficticios ou reenvio indiscriminado de conversoes.

Fase 8 em implementacao incremental, gate ainda aberto:

- rascunhos de texto isolados por tenant/operador/conversa, persistidos no navegador
  por ate sete dias; armazenamento indisponivel nao bloqueia a digitacao e gera aviso;
- identidade de tentativa nao confirmada e alvo de resposta preservados apos recarga,
  sem reenvio automatico; confirmacao atrasada nao apaga outro contato ou texto novo;
- ponto de leitura guardado por sessao e usuario, com ancora por mensagem, busca de
  paginas antigas e cancelamento pelo operador; ainda sem homologacao visual;
- polling opt-in da Inbox retoma imediatamente ao recuperar rede/visibilidade;
  aviso offline e manutencao do texto, sem envio automatico ao reconectar;
- anexos separados por conversa na memoria enquanto a pagina esta aberta; aviso
  antes de fechar com anexos pendentes, sem prometer persistencia dos bytes na recarga;
- gravacao de audio interrompida e descartada ao trocar contato/sair; permissao
  de microfone que chega depois da troca nao inicia gravacao no contato errado;
- Enter durante composicao IME nao envia texto incompleto;
- 15 testes direcionados aprovados (oito de rascunhos e sete de regressao de
  paginacao/idempotencia); lint do lote aprovado; typecheck direcionado da Inbox
  e hooks aprovado, sete arquivos-raiz e zero erros; typecheck global tambem
  aprovado no lote intermediario;
- nenhum deploy deste lote executado; `app/admin` nao alterado nesta etapa.

Verificacao de navegador em laboratorio local (16/10/2026, BRT):

- `scripts/serve-inbox-resilience-lab.mjs` serve apenas em `127.0.0.1:3188`;
  fixture importa os hooks reais, sem Firebase, autenticacao simulada ou envio externo;
  nao cria rota nem tela de produto;
- navegador confirmou isolamento de rascunho por conversa/tenant/operador,
  confirmacao atrasada sem apagar outro contato e mesmo ID de tentativa apos recarga;
- anexos selecionados em A somem ao abrir B e retornam ao reabrir A, na mesma sessao;
- ancora `A-185`, offset `-42`, preservada ao trocar conversa;
- ancora `A-121`, offset `1`, restaurada buscando automaticamente pagina anterior,
  com 120 mensagens renderizadas e retomada encerrada;
- teste de midia reproduziu falha: ancora mudou de `A-230/-45` para `A-226/-25`;
  corrigido com ResizeObserver e compensacao de altura, sem depender da ancora
  automatica do navegador; repeticao manteve `A-230/-45`, scroll 2839 -> 3087;
- mensagem nova tambem preservou `A-230/-45`; evento `online` simulado pelo botao
  de laboratorio acionou uma atualizacao imediata (0 -> 1), sem esperar dez minutos;
- viewport desktop observado 1280px e mobile observado 375px, sem overflow
  horizontal no laboratorio; rascunho mobile preservado ao alternar conversa;
- evidencias locais `.qa-artifacts/inbox-resilience/hooks-mobile.jpg` e
  `hooks-desktop.jpg`; sao imagens do laboratorio, nao da Inbox autenticada;
- 15 testes de unidade/contrato repetidos e aprovados apos a correcao;
- limites: evento online sintetico nao prova desconexao real; largura mobile nao
  prova teclado virtual; laboratorio de hooks nao prova layout completo ou APIs.

Preparacao da Inbox autenticada em 16/10/2026:

- Auth, Firestore e Storage Emulator iniciados e confirmados pelo hub local;
- fixture dedicada corrigiu a colisao/limpeza entre tenants do seed anterior;
  ambas as empresas ficticias preservadas, cada uma com 440 mensagens;
- SDK cliente com opt-in restrito a projeto demo, loopback e desenvolvimento;
  nenhuma alteracao no contrato de autenticacao ou autorizacao produtivo;
- Next local em 3199 com credenciais neutralizadas, cache e tipos separados;
- 21 testes direcionados aprovados; lint do preparo e tipos de configuracao
  aprovados; primeira compilacao de login ainda em andamento;
- navegador nao concluiu a navegacao inicial dentro do prazo; nenhum login
  efetuado; detalhes e comandos em `docs/QA_LAB_CLIENTE.md`.

Recuperacao de requisicoes e sessao em emulador — 16/10/2026:

- lista, detalhe, mensagens, paginas antigas/incrementais e envio de texto agora
  limitam a espera a 25 segundos, incluindo restauracao do token, fetch e leitura
  do JSON; timeout aborta a requisicao sem apagar rascunho/ID de tentativa;
- cinco testes novos aprovados: token/fetch travado, corpo travado, HTTP 403 com
  erro preservado, recuperacao depois de timeout e JSON invalido sem confirmacao;
- 20 testes direcionados aprovados (os 15 anteriores mais cinco de rede);
- sessao real do backend exercitada com Auth/Firestore Emulator: login do alpha
  verificado por `requireRequestUser`, membership proprio autorizado, acesso ao
  beta negado e tokens ausentes/malformados recusados; tres testes aprovados;
- lint do lote e typecheck direcionado (tres arquivos-raiz) aprovados;
- limite: os testes de sessao importam o codigo real do servidor; nao comprovam
  ainda a jornada HTTP/DOM inteira da Inbox;
- processo Next local permanece vivo; nova leitura HTTP do login excedeu 90s,
  sem resposta completa, e compilacao continua sem comprovacao de conclusao.

Complemento de recuperacao de midia (16/10/2026):

- audio gravado entra na fila local da conversa antes do envio automatico;
  so sai depois de confirmacao; erro/offline preserva arquivo e request ID para
  tentativa manual, mantendo legenda vazia e sem limpar texto digitado separado;
- limite de dez anexos e tamanho maximo de audio verificados antes da fila;
- POST/JSON de midia limitado a 60s; upload Storage cancelado apos 60s sem
  progresso real de bytes; notificacoes repetidas nao prorrogam o prazo;
- quatro testes de upload aprovados, incluindo progresso que dura mais que o
  prazo ocioso e limpeza de observers; conjunto rede/rascunhos/idempotencia/upload
  21/21 aprovado; lint do lote aprovado. Testes nao provam microfone/upload real
  no navegador;
- checagem de tipos desta rodada NAO aprovada: nove erros de sintaxe em
  `.next/dev/types/routes.d.ts`; inspecao confirmou comentario/bloco duplicado
  apos fechamento do arquivo, referenciado pelo `next-env.d.ts` atual;
- nenhum arquivo gerado foi corrigido manualmente; necessario restabelecer
  geracao consistente antes do gate final; nao reutilizar typecheck anterior
  como evidencia dos ultimos ajustes;
- verificacao ponta a ponta interrompida na fronteira de renderizacao: webpack
  segue compilando login sem sinal suficiente. Nao repetir navegacoes nem
  ultrapassar essa fronteira como se a tela tivesse carregado.

Revalidacao posterior do ambiente e rota autenticada (16/10/2026):

- `next typegen` finalizou com sucesso; tipos regenerados oficialmente, sem
  edicao manual. Nova checagem da Inbox e imports terminou com zero erros;
- login local respondeu HTTP 200; DOM exibiu formulario de email/senha e aviso
  explicito de emulador. Console revelou sender ID publico ausente na fixture;
  launcher QA corrigido com valor ficticio, sem importar segredo produtivo;
- servidor reiniciado apenas para aplicar essa mudanca concreta de ambiente;
  apos isso navegador excedeu prazo durante compilacao e recuperacao da aba;
  nao marcar login no navegador ou Inbox visual como aprovados;
- `tests/inbox-session.emulator.mts`: 5/5 aprovados, incluindo chamada ao handler
  real de mensagens com token do Auth Emulator: 220 mensagens, tres paginas,
  nenhum ID repetido; tenant estrangeiro e chat estrangeiro recusados sem items;
- limite: handler importado diretamente, sem camada HTTP Next, browser ou rede
  externa. Aumenta evidencia de autorizacao/persistencia, nao substitui E2E;
- habilidades de verificacao e ambiente mantiveram o gate visual aberto e os
  valores de QA separados dos dados/credenciais produtivos.

Inbox completa autenticada — evidencias posteriores (16/10/2026):

- login ficticio submetido pelo formulario; primeira tentativa excedeu 20s com
  API compilando; segunda passou com `/api/client-portal/me` HTTP 200 em 741ms;
- Inbox exibiu a empresa alpha e suas duas conversas; aberturas por teclado
  verificadas, sem envio de mensagens a provedores;
- falha real reproduzida: primeira carga falhava e retorno antecipado mostrava
  apenas "Nenhuma conversa encontrada", escondendo erro e atualizacao. Retorno
  removido, mantendo lista/busca/acoes de recuperacao no estado vazio;
- segunda falha visual confirmada por screenshot: no mobile o painel fixo cobria
  o aviso externo. Aviso e botao `Atualizar conversa` movidos para dentro do painel;
- novo botao recuperou historico apos erro: 100 mensagens inicialmente, depois
  200 e 220 com `Carregar mensagens anteriores`; ao final botao ausente;
- rascunho `Rascunho real da Inbox — conversa 1` preservado ao ir para conversa 2
  (inicialmente vazia, depois com outro texto) e voltar; tambem recuperado apos
  recarga com restauracao real da sessao;
- selecao inicial passa a usar `chatId` do link desde a montagem, evitando corrida
  com sincronizacao da URL que removia o parametro antes da lista chegar;
- mobile observado 390x844 sem overflow horizontal; campo do rascunho observado
  entre y=786 e y=834. Desktop observado 1265px de area util sem overflow horizontal;
- inspecao da captura desktop contradiz prontidao de layout: cabecalho da conversa
  quebra em muitas linhas e consome quase toda a altura em viewport 1280x900;
  ausencia de overflow horizontal nao aprova usabilidade. Corrigir antes do gate;
- screenshots da tela real: `.qa-artifacts/inbox-resilience/inbox-authenticated-mobile.jpg`
  e `inbox-authenticated-desktop.jpg`; nao confundir com screenshots do laboratorio;
- 16 testes de regressao e lint do ultimo lote aprovados; teclado Enter foi usado
  para ativar controles apos cliques do navegador sem efeito, nao prova de toque;
- login/rotas de sessao/lista/detalhe/mensagens passaram pela camada HTTP Next e
  Auth/Firestore Emulator; nenhuma credencial/contato de producao usado;
- limite: fixture nao possui canal com credencial; upload/envio, rede realmente
  desligada e teclado virtual ainda nao homologados. Fase 8 permanece aberta.

Correcao do layout desktop em 1280x900 (16/10/2026):

- acoes podem ocupar segunda linha, sem espremer identidade do contato;
- empresa e cards comerciais preservados em `Contexto comercial` expansivel,
  com rolagem interna limitada; nenhuma tela, rota ou acao removida;
- altura da mesa calculada a partir de sua posicao real e viewport, via hook
  local, em vez de subtracao fixa que empurrava o compositor abaixo da janela;
  dimensionamento desktop nao e aplicado ao mobile;
- navegador autenticado mediu cabecalho com contexto fechado em 198px e area
  de mensagens em 391px; campo de resposta com bottom 851 em viewport 900;
- expandir contexto manteve resposta dentro da janela; no mobile 390x844,
  campo com bottom 834 e mesmo rascunho, sem regressao observada nessa dimensao;
- screenshot `inbox-desktop-header-fixed.jpg` e `inbox-mobile-layout-rechecked.jpg`
  em `.qa-artifacts/inbox-resilience`; estas substituem a captura desktop anterior
  como evidencia do layout corrigido;
- 16 testes direcionados aprovados, lint do lote aprovado e checagem de tipos
  da Inbox/imports com zero erros; nenhum deploy ou alteracao de app/admin.

Teste controlado de indisponibilidade do servidor local:

- antes: Inbox autenticada aberta, 100 mensagens renderizadas e rascunho presente;
- somente servidor Next QA encerrado; conexao a porta 3199 confirmou recusa;
  emuladores e rede do computador permaneceram intactos;
- com servidor fora, tela preservou 100 mensagens e texto; envio por botao
  falhou com aviso de confirmacao ausente, sem travar botao nem limpar rascunho;
- servidor QA restaurado; banco local continuou com zero `chat_outbound_jobs`
  e as mesmas 440 mensagens do tenant alpha, sem reenvio automatico;
- recuperacao completa da interface NAO aprovada: compilacoes/respostas lentas
  apos reinicio, ultima medicao do DOM com zero mensagens e rascunho preservado;
  leitura HTTP adicional tambem excedeu cinco segundos;
- codigo permitia polling iniciar nova leitura antes de terminar a abertura,
  invalidando respostas lentas. `InboxLoadGate` agora evita concorrencia no mesmo
  tenant/chat e permite troca de escopo sem aceitar finalizacao de dono antigo;
- lifecycle invalida gate ao reinicializar efeito, cobrindo StrictMode/HMR;
  quatro testes especificos aprovados. Teste de unidade nao comprova recuperacao
  real do navegador; manter esse item aberto;
- tipos da Inbox/imports aprovados com zero erros e lint do lote aprovado;
- `inbox-server-outage.jpg` registra a falha esperada; imagem denominada
  `inbox-server-restored.jpg` foi capturada durante recuperacao incompleta e NAO
  deve ser usada como comprovacao de retorno do historico;
- nao confundir indisponibilidade de servidor com dispositivo realmente offline;
  teclado virtual, midia no navegador e desconexao do dispositivo ainda pendentes.

Diagnostico posterior da recuperacao:

- terminal revelou causa de limite de erro: Fast Refresh preservou instancia
  anterior de `InboxLoadGate`, sem metodo `invalidate` recem-adicionado;
- recarga completa instanciou a versao atual: 100 mensagens, rascunho preservado,
  sem alertas. Nao confundir artefato de HMR com falha de deploy produtivo;
- repeticao sem edicao de codigo ainda misturou indisponibilidade com recarga/
  recompilacao automatica do Next. Gate de recuperacao automatica continua aberto;
- `scripts/serve-inbox-qa-proxy.mjs`: proxy fixo 127.0.0.1:3198 -> 3199, com
  comandos stdin `outage`, `restore`, `status`; modo de falha encerra somente
  requisicoes dos tenants ficticios alpha/beta, sem alterar rede/seguranca do SO;
  preparado, mas teste browser pelo proxy ainda NAO concluido;
- `scripts/prepare-inbox-qa-snapshot.mjs`: cria copia em `.qa-artifacts` sem
  `.env*`, valida hashes de todos os arquivos copiados e reutiliza dependencias;
  preparacao em andamento na ultima observacao, sem comprovacao final de copia;
- nove testes direcionados de prazo e gate repetidos e aprovados; sintaxe do
  proxy aprovada; nada publicado. Nenhum requisito foi dispensado nessa etapa.

Base isolada confirmada para continuar a homologacao:

- `.qa-artifacts/inbox-snapshot-1792206495735/qa-source-manifest.json` presente;
  1.252 arquivos copiados, nenhum arquivo `.env*` no manifesto;
- hashes da Inbox, `InboxLoadGate` e launcher conferidos contra manifesto e fonte
  atual: correspondencia integral nos tres arquivos;
- suite executada de dentro dessa copia: 24/24 aprovados, incluindo paginacao,
  rascunhos, gate concorrente, prazos de requisicao e upload sem progresso;
- processo anterior de copia nao estava mais disponivel; manifesto final e
  arquivos permitiram comprovar conclusao, sem reiniciar a copia;
- verificacao local encontrou portas 8080/9099/9199/3198/3199 fechadas; nenhum
  processo anterior de servidor/proxy/copia em execucao. Emuladores reiniciados
  no projeto demo explicito; inicializacao ainda ativa na ultima observacao;
- nao declarar dados ficticios anteriores preservados em memoria apos parada
  dos emuladores; seed deve ser reaplicado quando anunciarem prontidao;
- nenhuma falha de API foi provocada nesta rodada sem baseline carregada;
  recuperacao via proxy, midia e teclado virtual permanecem nao homologados.

Pendentes: teclado virtual, desconexao real e recuperacao
de upload/voz e homologacao mobile/desktop. Nao declarar a fase encerrada nem
iniciar a Fase 9 antes de aprovar seu gate.

### Execucao da missao — Fase 7 em validacao

Status: `IMPLEMENTADA, GATE AINDA ABERTO` em 13/10/2026.

Implementado:

- referral do WhatsApp preserva `ctwa_clid` separado de ID de anuncio/campanha;
- contexto de campanha passa da mensagem ao lead em WhatsApp, Instagram e Messenger;
- identificacao de campanha usa snapshot de anuncio do proprio tenant, sem tratar
  titulo de anuncio ou parametro `ref` como nome/ID comprovado de campanha;
- primeiro toque preservado e ultimo toque protegido contra mensagens atrasadas;
- conversao inicial WhatsApp recebe atribuicao antes do disparo; conversas sociais
  passam a solicitar a conversao inicial com deduplicacao;
- outbox por evento/provedor/canal registra os dados antes de chamar APIs;
- snapshot de venda preserva valor, moeda, data e atribuicao durante recuperacao;
- destino de conversao (dataset, Page ID, modo de teste ou conta/acao Google)
  permanece fixo por evento; mudanca posterior do conector nao redireciona retries;
- lease com identificador de dono, timeout de rede, retry progressivo e dead letter;
- `force` nao repete evento processado; IDs longos usam hash para impedir colisao;
- erro de projecao interna nao recoloca conversao confirmada na fila;
- worker existente recupera pendencias e leases vencidos, com consultas por prazo
  e indices declarados para evitar bloqueio por jobs ainda nao vencidos;
- recibo Meta exige `events_received`; Google exige resultado sem erro parcial;
- payload de mensageria inclui `business_messaging`, `messaging_channel`,
  `ctwa_clid` e Page ID quando configurado;
- health informa estados da fila e declara explicitamente cobertura parcial.

Evidencias atuais:

- 24 testes direcionados aprovados, incluindo 11 cenarios de Firestore Emulator;
- concorrencia de 20 envios, isolamento, ordem de toque, retry, lease vencido,
  fencing, dead letter, identidade longa, recibo ausente e erro parcial Google;
- ESLint dos arquivos da Fase 7 aprovado; verificacao de diff aprovada;
- build final de producao aprovado, exit code 0, incluindo TypeScript e 369 paginas;
- source map do modulo de conversoes comparado com o arquivo atual: correspondencia
  integral confirmada; builds intermediarios de versao anterior nao contam no gate.

Limites e itens para fechar o gate:

- confirmar configuracao real do dataset/Page ID e recibo de um evento de teste
  na homologacao autenticada; teste com fetch simulado nao prova atribuicao Meta;
- validar acesso Google: a documentacao atual restringe novos tokens no caminho
  legado `UploadClickConversions`; nao declarar conector operacional apenas por
  existir token OAuth;
- nenhum deploy desta Fase 7 foi executado nesta rodada.

Diagnostico real de conectores (13/10/2026, 14:32 BRT):

- script somente leitura `scripts/audit-conversion-readiness.mts --verify-datasets`;
- quatro conectores examinados, cobertura completa;
- dois Meta com token legivel e dataset configurado, ambos sem Page ID;
- ambos os datasets rejeitaram a credencial: HTTP 401, codigo Meta 190;
- apenas um dos dois tem codigo de evento de teste cadastrado;
- conectores Meta/Google de demonstracao nao possuem credenciais operacionais;
- nenhuma credencial foi exposta e nenhum evento de conversao real foi enviado;
- homologacao externa depende de reconectar Meta na tela existente de Canais,
  configurar Page ID e codigo de evento de teste da conta correta.
- piloto escolhido pelo usuario: propria Altum, tenant `SAVIO CIPRIANO`
  (`26fNj8YEmY7qBOgnQ0Xv`); usuario informou que preenchera os dados manualmente.
- campo preenchido ou promessa de preenchimento nao e prova de conexao pronta;
  aguardar verificacao real apos a reconexao, sem avancar a Fase 8.

Referencias primarias consultadas:

Revalidacao apos reconexao informada pelo usuario (16/10/2026, BRT):

- apos confirmacao explicita do usuario, pagina `Altum Ia` verificada por GET
  Graph (`id,name`) e vinculada ao conector Meta Ads do piloto, em `pageId` e
  `metadata.pageId`, com transacao que valida tenant/tipo e impede conflito;
- leitura apos gravacao confirmou ambos os campos; auditoria persistida em
  `audit_logs/btSbZmdl0HGN1MYv4BTA`; nenhum token alterado ou exposto;
- leitura paginada de todos os 235 leads do piloto, incluindo `first_touch`,
  `last_touch`, atribuicao aninhada e toques assistidos legados, encontrou zero
  leads com `ctwaClid`/`ctwa_clid`; nao foi inventado identificador de clique;
- configuracao de pagina resolvida; falta evidencia real de entrada via anuncio
  WhatsApp e recibo de conversao de teste; nao houve reenvio de eventos legados.

- consulta somente leitura ao dataset Meta aprovada: HTTP 200, sem codigo de erro;
- conector Meta Ads do piloto agora consta `active`, com dataset e codigo de teste;
- Page ID ainda ausente no conector Meta Ads; canais Instagram/Messenger possuem
  mapeamento, mas nao foi copiado automaticamente entre conectores;
- `/me/accounts` retornou 12 paginas, sem proxima pagina; entre elas `Altum Ia`,
  Page ID `1071844249348392`;
- nenhum POST de conversao foi executado: acesso ao dataset nao comprova recibo
  de evento nem atribuicao campanha/receita; gate da Fase 7 continua aberto.

Revalidacao do piloto (13/10/2026, 15:00 BRT):

- auditoria somente leitura com `--verify-datasets --history`, escopo exclusivo
  `26fNj8YEmY7qBOgnQ0Xv`; nenhum evento foi reenviado;
- credencial ainda recusada com HTTP 401/codigo 190; Page ID continua ausente;
- historico de conversoes percorrido por paginas de 250, sem teto de amostragem:
  331 documentos, 187 `failed` e 144 `processed`;
- os 144 processados possuem recibo Meta `events_received >= 1`, mas isso nao
  comprova correspondencia de campanha, clique ou receita;
- 91 falhas classificadas como autenticacao; 96 outras ou sem erro classificavel;
  erros brutos, credenciais e dados pessoais nao foram exibidos;
- leitura paginada nao e snapshot atomico: alteracoes concorrentes podem ocorrer;
- Fase 7 permanece aberta; Fase 8 nao iniciada.

- Meta: https://github.com/fbsamples/lead-ads-webhook-sample/blob/main/postman/FB%20Conversions%20API%20%28Part%201%20-%20online%29.postman_collection.json
- Google: https://developers.google.com/google-ads/api/docs/conversions/upload-offline

### Execucao da missao — gate da Fase 6

Status: `APROVADA EM CODIGO E EMULADOR` em 13/10/2026.

Entregue:

- snapshot integral e paginado, sem tetos silenciosos de 400, 1.000 ou 5.000 itens;
- manifesto versionado com contagem por colecao e objetos do Storage;
- exclusao original somente depois de o manifesto ser contado e validado;
- restauracao e expurgo bloqueados quando o manifesto estiver incompleto;
- anexos permanecem no Storage durante a retencao e voltam acessiveis na restauracao;
- expurgo definitivo remove Firestore e Storage e gera comprovante auditavel;
- prazo de lixeira configuravel por tenant entre 7 e 365 dias, com padrao de 30;
- expurgo expirado preservado no worker diario existente;
- auditoria identifica ator humano na restauracao/expurgo e worker na retencao;
- Inbox comunica corretamente `Mover para a lixeira`, sem prometer exclusao imediata.

Evidencias:

- Firestore e Storage Emulator: 3 de 3 aprovados;
- conversa com 2.001 mensagens e dois anexos restaurada integralmente;
- segundo ciclo expurgou 2.002 documentos, dois objetos e gerou certificado;
- manifesto incompleto bloqueou restauracao e expurgo;
- contratos direcionados: 20 de 20 aprovados;
- ESLint e typecheck completos: aprovados;
- build Next de producao: aprovado, 369 paginas estaticas geradas.
