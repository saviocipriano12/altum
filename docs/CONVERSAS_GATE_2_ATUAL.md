# Conversas: gate 2 atual

Atualizado em 19/10/2026. **ABERTO**. Nao autoriza avancar para a fase 3.
Publicacao parcial do funil e independente; as mudancas desta fase continuam locais.

20/10 — incidente de mídia relatado em produção tem prioridade. Falha de cache
opcional após download Meta reproduzida localmente (baseline 3/6), corrigida na
rota de leitura preservando autorização. Regressão 26/26; repetição final 9/9,
tipagem/lint aprovados. Ainda não comprova causa do relato, reprodução em browser,
codecs ou funcionamento no domínio. Nenhuma publicação desta correção. Manifesto
restrito e limites no progresso; gate permanece ABERTO.
Atualização 16:48 UTC: rota recebeu alteração concorrente após o lote 26/26;
manifesto anterior invalidado para a versão atual (hash 1c375f...). Alterações
preservadas, sem editar runtime nesta retomada. Teste ampliado para 12 casos,
tipagem/lint aprovados, integração ainda não executada por emuladores em
inicialização sem portas prontas. Não reaproveitar a aprovação da versão antiga.

Atualização 17:03 UTC: versão concorrente atual 6765cc... revalidada localmente:
12/12 de leitura; regressão sobreposta 29/29; playback sintético 2/2 preservando
fonte original. Não é prova de browser/produção nem pacote de arquivo único.
Tipagem atual REPROVADA por dois TS2339 no webhook WhatsApp (556/1200); ESLint
ainda em execução na sessão 39686 na última conferência. Não publicar nem avançar
o gate com essa dependência. Detalhes/hashes/logs no progresso.

Atualização 17:18 UTC: os dois tipos do webhook foram corrigidos por trabalho
concorrente; nova tipagem e lint aprovados, sessões 81421/63393 encerradas.
Testes independentes Inbox/conexão 28/28 (sete de roteamento). Nova integração
interrompida com emuladores indisponíveis, sem aprovação do caso Evolution novo.
Próxima execução deve exigir prontidão antes de iniciar. Nenhum deploy; ABERTO.

Atualização 17:48 UTC: ambiente recuperado; leitura/playback 18/18 e regressão
ampliada sobreposta 36/36, sem skips/falhas, snapshot 6765cc.../teste 684acfa...
estáveis. Resolve=1/cache indisponível e recuperação Evolution agora exercitados.
Não comprova browser/produção nem autoriza release; causa do relato real pendente.
Emuladores existentes sessão 51171 disponíveis. B permanece ABERTO.

Atualização 18:03 UTC: helper de chave chat_state separado do agente, mantendo
reexport legado e IDs idênticos. Outbox/dispatch/Shopify authority usam o módulo
leve. Unitários 2/2; regressão parcial 68/68, incluindo os dois workers antes
instáveis no mesmo lote, limite 25s mantido. Não comprova causa/ganho geral ou
aprovação da bateria integral. Lint completo falhou por dois avisos em outras
linhas do agente; tipagem explícita aprovada, sessão 14073 encerrada. Sem deploy;
ABERTO.

Atualização 18:18 UTC: lint completo e tipos da extração aprovados, 14/14 de
ofertas/chave. Regressão inicial 159/172 falhou por fixture omnichannel sem host
local/credenciais vazias; isolamento corrigido, sem alterar asserções/limites.
Repetição integral **171/171 em 117,92s**, incluindo os workers sob 25s. As 20
atualizações de contato levam 40,61s: carga/latência ainda é risco, não SLA aprovado.
Próximo B: levar ocorrência durável aos gatilhos imediatos ainda com envio direto
em automations.ts, preservando funcionalidades. Não avançar C/D nem publicar por
esta bateria. Incidente real de mídia e demais requisitos seguem abertos.

Atualização 18:33 UTC: nova regressão de proposta Shopify reproduz a lacuna do
send_message imediato: tentativa direta de provedor antes do enqueue durável,
baseline 0/1 com transporte bloqueado. O 171/171 anterior não cobre esse caso.
Próxima unidade: propagar a ocorrência crm_proposal_mutation ao plano/outbox e
revalidar autoridade antes do envio; runtime dessa migração ainda não alterado.
Teste não será enfraquecido para aprovar. Gate B permanece ABERTO.

Atualização 18:48 UTC: envio imediato de budget_approved ligado à ocorrência de
proposta/plano congelado/outbox, com revalidação pré-provedor e destino vinculado.
Propostas 24/24 locais, incluindo incerteza/replay e dez revogações. Lote misto
78/80 expôs erro de asserção do recibo (corrigido) e CRM passivo recomendando
contato em vez de provador (pendente, sem enfraquecer teste). Tipagem/lint finais
aprovados, sessão 8497 encerrada. Esperas/outros gatilhos e regressão ampla continuam
obrigatórios. Sem publicação; gate B ABERTO, C/D não iniciadas.

Atualização 19:04 UTC: falha passiva reproduzida isoladamente. Qualificação perdia
descrições/flags do funil e inventava IDs padrão ausentes; corrigido, fixture agora
declara explicitamente significado de qualificação (sem presumir segunda coluna).
Asserções de posse humana/score/cidade mantidas; isolado 1/1, unitários 13/13,
regressão ampla atual 245/245 em 198,44s, zero skips/falhas. Tipagem/lint aprovados.
Esperas/efeitos internos/cota de budget_approved e outros gatilhos continuam B;
não é aceite de conversa natural nem prova de mídia/produção. Sem deploy; ABERTO.

Continuação autorizada em 20/10: cota budget_approved agora tem recibo por
ocorrência/automação congelada no contador existente, revalidando autoridade antes
de reutilizar. Tipagem/lint aprovados; cenário de cinco concorrentes reserva uma
vez e revogações/teto/recibo alterado recusados. Bateria ampla **245/246 em 327,36s**:
worker Shopify em processo novo ultrapassou 25s. Isolado 1/1 com mesmo limite não
apaga falha conjunta; diagnóstico de inicialização/concorrência volta a prioridade.
Logs/hashes no progresso. Não avançar B, não publicar; esperas/efeitos internos
de proposta e incidente real de mídia permanecem pendentes.

Diagnóstico posterior: medições do worker adicionadas só ao fixture, timeout/JSON/
asserções preservados. Import residual do agente para ID removido em
automation-message-delivery; contrato 1/2→2/2. Baterias instrumentadas 246/246
antes (223,56s) e depois (192,45s), sem prova causal de ganho/eliminação do timeout.
Tipos/lint aprovados. Nova lacuna funcional reproduzida: DUAS propostas adiadas
continuam chegando ao provedor falso após exclusão da fonte ou alteração da
proposta (baseline 0/2). Correção de autoridade adiada ainda não implementada;
246 não cobre esses novos casos. Sem chamadas externas, sem publicação. ABERTO.

Implementação posterior: proposta adiada tem job determinístico + manifesto de
aceite na fonte, prazo original, autoridade no claim/cota/enqueue/pré-provedor,
e reuso da reserva sem cobrança dupla. Fonte/configuração/destino/pausa alterados
recusados; incerto não reenvia, retomada em processo novo reutiliza outbox. Legado
sem vínculo exige conciliação. 16/16 específicos; conjunto 165/166 por import
intermitente; final 265/266 em 331,15s por lock timeout nas 20 atualizações do
contato (propostas passaram, worker passou nesta rodada). Tipos/lint aprovados.
Isolados de contato passaram, mas continuam lentos (71,28s/38,44s) e NÃO apagam
falha conjunta. Fixture local deixa de sondar metadados de nuvem; app/auth real
intactos. Próximo B: contenção de contact-profile, depois efeitos internos da
proposta. Sem publicação deste pacote; C/D não iniciadas, gate ABERTO.

Unidade de contatos posterior: upsert migrou de lock pessimista para batch/CAS
com guardas de todas as versões lidas + coordenação local por identidade. Não
confundir com lock distribuído: CAS preserva correção entre processos. Seis
tentativas mantidas; nenhuma redução das 20 chamadas. Primeiro CAS sem coordenação
reprovou por disputa; ajuste preserva todos os fatos, edições e isolamento. Novos
casos verificam quatro processos, race de alias/raiz/edição humana e rollback.
24/24 específicos; final amplo **278/278 em 204,74s**, zero skips/falhas, tipos/
lint aprovados. Vinte atualizações do mesmo perfil 2,24s neste teste local, não
SLA universal. Hashes/falhas intermediárias no progresso; sem publicação.
Próximo B: efeitos internos/recibos por ação de proposta e demais produtores,
sem esquecer migração/retencão e demais gates. C/D não iniciadas; ABERTO.

Registros imediatos de proposta: duplicação reproduzida (cinco execuções geravam
15 tarefas em vez de três). create_task/follow_up/alert_human/add_note agora têm
identidade por origem/automação/ação e commit único de registros/evento/recibo.
Plano, cota, fonte e posse revalidados até em replay; prazo original preservado,
edição/remoção humana não desfeita, pendência não significa notificação humana.
Específicos 6/6; oito casos novos na ampla **286/286 em 235,14s**, zero falhas/
skips, tipos/lint aprovados. Sem publicação ou prova de qualidade conversacional.
CRM e registros agendados da proposta ainda pendentes, assim como outros produtores,
retenção/migração e backlog anterior. Não reabrir origem parcial para replay cego.
B ABERTA; C/D não iniciadas. Evidências/hashes no progresso.

Registros agendados de proposta: baseline mostrou três tarefas após a origem ser
apagada. Agora os quatro tipos internos usam o manifesto/fonte/cota existentes,
com revalidação no claim/reserva/efeito e recibo atômico. Retomada após commit
com finalização perdida preserva registros/edições/prazos e não cobra novamente.
Legado sem origem comprovada exige conciliação; revisar migração antes de release.
Específicos 7/7; ampla **293/293 em 270,96s**, zero falhas/skips, tipos/lint finais
aprovados. Sem publicação, mensagem a cliente ou qualidade de modelo comprovada.
CRM de proposta por campo, outros produtores, retenção/migração e backlog continuam
pendentes. Não reabrir raiz parcial cegamente. B ABERTA; C/D não iniciadas.

Campos CRM da proposta: baseline mostrou replay trocando prioridade humana low
por high. Baseline/propriedade/funil agora congelados antes de ações novas; campo,
projeção, evento e recibo atômicos. Mudança própria de etapa exige recibo/plano/
autoria exatos; marcador no lead sozinho não concede exceção à fonte. Conflitos
manuais/stale ficam registrados, inclusive em ações agendadas e após processo novo.
Legado não recebe baseline retroativa. Específicos 9/9; ampla **302/302 em 319,40s**,
zero falhas/skips, tipos/lint finais aprovados após correções registradas. Sem
publicação, inferência paga ou prova de conversa natural/CRM passivo completo.
Próximo B: reproduzir hipótese de catch amplo mascarando falha temporária do funil;
demais produtores, autoridade concorrente, retomada, retenção/migração e backlog
continuam pendentes. B ABERTA; C/D não iniciadas, sem marco integrado aprovado.

Classificação de falha do funil em proposta/inbound: baseline confirmou
armazenamento indisponível virando pipeline null, aprovação silenciosa e origem
conciliada antes de qualquer hook. Erro de configuração agora tem classe explícita;
transporte/erro desconhecido não fabrica recusa permanente. Falha pré-claim mantém
ready/tentativa; lote registra failed e continua outras origens. Efeito já iniciado
mantém a regra de conciliação. Classificador da agenda também atualizado após
baseline adicional reprovado; texto localizado e código 14 não viram autorização.
Final **324/324 em 411,62s**, zero falhas/skips, 19 arquivos, tipos/lint finais
aprovados. Sem publicação/efeito externo ou qualidade conversacional comprovada.
Próximo B: causa de lead_stage_changed nos hooks de proposta/pedido e demais
produtores do mapa AI_FOUNDATION_B_REMAINING_PRODUCERS_2026-10-20.md. O catch do
pedido não foi corrigido por inferência. Demais gates/backlog seguem ABERTOS.

Hooks de etapa de proposta/pedido: baseline 0/2 confirmou tentativa direta de
provedor antes do outbox. Origem agora propagada, elegibilidade/plano/cota/execução
congelados no job existente; mensagem imediata com outbox estável e revalidação
pré-provedor. Específicos 26/26; regressão final **349/349 em 522,17s**, zero
falhas/skips/cancelamentos, processo e observador encerrados com código zero.
Tipos/lint finais aprovados, hashes estáveis. Aprovação local apenas desta unidade,
não dos gatilhos inteiros: registros internos/CRM ainda legados, retomada parcial
exige conciliação, agendados causais de etapa e demais produtores pendentes. Build,
publicação, mídia real e qualidade conversacional não comprovados. B ABERTA;
C/D não iniciadas. Próxima unidade: recibos por ação interna/CRM de etapa, sem
reabrir raízes parciais nem sobrescrever decisão humana. Evidências no progresso.

Registros internos/CRM dos hooks de etapa: baseline 0/2 confirmou falta de recibos
e invalidação da própria origem após movimento configurado. Sete tipos imediatos
agora usam executor atômico compartilhado, baseline/propriedade/funil congelados e
prova exata da própria etapa, sem proposta sintética nem notificação fictícia.
Ampla final **376/376 em 615,26s**, zero falhas/skips/cancelamentos, exit=0;
tipos/lint finais aprovados, dez hashes estáveis. Propostas Aprovado/Enviado,
concorrência, rollback, fonte revogada, edição/exclusão humana e processo frio
exercitados. Dois testes intermediários pediam etapas ausentes do funil; corrigidos
para IDs reais e acrescentado negativo de etapa inexistente, sem abrir defaults.
Agendados de etapa ainda sem manifesto causal; raiz/hook parcial não recebe
retomada cega por ter recibos de algumas ações. Pré-claim do pedido, migração/
retenção e demais produtores pendentes. B ABERTA; C/D não iniciadas. Sem build,
publicação, mídia real ou qualidade conversacional comprovada. Evidências no progresso.

Agendamentos dos hooks de etapa: baseline 0/3 confirmou execução após remover
origem e prazo reiniciado. Agora usam manifesto/ID/prazo originais, cota da origem,
executor atômico/outbox e revalidação no claim/efeito/pré-provedor. Leitura transitória
de um claim não consome tentativa nem paralisa o restante do lote. Sete efeitos
internos/CRM, mensagens, propostas Aprovado/Enviado e revogações testados.
Ampla inicial **411/412** reprovou worker frio >25s. Instrumentado sem elevar limite;
contrato adicional reproduziu carga desnecessária do handler Shopify com fila vazia.
Consumidor leve extraído com consultas/efeitos/reexport preservados. Intermediária
107/107; repetição integral **412/412 em 562,07s**, zero falhas/skips, exit=0,
tipos/lint finais aprovados e onze hashes estáveis. Worker no lote 7,13s; não é
prova de causa única do timeout nem SLA de produção. Legado sem fonte, raiz parcial,
ordem/capacidade, pré-claim do pedido e retenção/migração continuam pendentes.
Próximo B: erro transitório de pedido e exclusão/restauração de jobs sem chatId.
Sem build/publicação, mídia real ou qualidade conversacional comprovada. B ABERTA,
C/D não iniciadas. Evidências, falhas e snapshot no progresso.

## Retomada: mensagem de automacao agendada — 19/10/2026

20/10: ações automáticas Shopify agora têm lote causal congelado e autorização
por intenção/conteúdo/destinatário; claim e transação pré-provedor revalidam
controle humano, configuração, fonte e pedido/carrinho. Regressão intermediária
169/169; alterações posteriores de tratamento de I/O ainda em validação final.
Lote adicional 65/72 afetado por queda local Auth/Storage, recuperados sem alterar
produto; repetição final 72/72 em 167,36 s. Regressão principal final 169/171 em
275,55 s: dois workers de retomada excederam 25 s e foram encerrados pelo timeout;
limites mantidos. Diagnóstico isolado terminou 2/2 em 40,85 s, mesmos limites,
mas não elimina a falha conjunta. Tipagem/lint/diff check finais aprovados.
Investigação de inicialização/disputa ainda aberta; isso não aprova o pacote. Evidência
e ponto de retomada em AI_ATTENDANCE_CONTINUOUS_PROGRESS.md. Legado, reconciliação,
ordem/LTV, migração/retencão e índices remotos continuam pendentes. ABERTO.

20/10: root Shopify migrou para admissão imutável/exclusiva em ecommerce_events.
Done não repete intake/handlers; ready retoma no processador periódico existente,
com prova em processo novo. Parcial/expirado não reenvia cegamente: conciliação.
Fonte/conexão por ramo; done/contadores/metadados atômicos. Baseline 0/2, regressão
principal 131/131 em 102,39 s; tipos/lint aprovados. Quatro índices só locais.
Cerca por ação, retomada granular/UX, eventos diferentes/ordem/LTV, release e
retenção/migração continuam pendentes. Gate ABERTO, novo motor não entregue.
Regressão adicional: 81/81 em 125,42 s, automações/produtores/Shopify; tipos/lint
aprovados. Não soma casos distintos à bateria 131 nem elimina o lock timeout anterior.

Projeção Shopify pós-intake migrada nos três caminhos: pedido, carrinho abandonado e
recuperado. Prioridade/tags manuais preservadas; lead/evento/recibo na fonte atômicos,
replay não regrava. Sync usa identidade por snapshot, não só recurso. Baselines 0/3
e 0/1, lote corrigido 11/11; fonte ativa/tenant/objeto e recibos inválidos testados.
Não cobre ocorrência/fan-out integrais nem LTV/valores/ordem/migração de sync; admissão
imutável antes dos efeitos continua necessária. Nada publicado, gate ABERTO.
Regressão ampliada teve 118/119 por lock timeout de contato; caso isolado passou e
reexecução integral idêntica passou 119/119 em 100,92 s. Falha anterior permanece
registrada como risco de carga/concorrência, não correção comprovada.

Convergência do intake em seguida: vínculo email/telefone aceitos no lead_identities
existente, protocolo/namespace separados do social; cadastro/evento/vínculo juntos.
Concorrentes convergem, só um retorna created=true; destino excluído/alterado e
vínculo inválido bloqueiam recriação. Baseline 0/3 e lote corrigido 26/26, com processo
separado; regressão final 108/108 em 91,96 s, tipos/lint aprovados. Não cobre todos
os escritores, sourceId/social-only, conta/loja, retenção
ou ocorrência/fan-out idempotentes. Gate continua ABERTO; nada publicado.

Atualização B/Shopify do intake: seleção por primeiro identificador foi substituída
por verificação de todos, com recusa de duplicata/conflito, escopo tipo/canal para
origem e canal para perfil externo. Revalidação transacional detecta identidade
alterada/duplicata inserida depois da busca inicial. Baseline 0/6, lote corrigido
15/15; regressão final 101/101 em 97,62 s, tipos/lint aprovados; hashes no progresso.
Não homologar identidade canônica,
conta/loja, criação concorrente ou replay por ocorrência por essa proteção. Fluxo
operacional de conciliação/retry ainda pendente; sem novo motor/publicação. ABERTO.

Atualização posterior B/Shopify: message_received com referência persistida agora
usa claim/plano congelado e outbox nos cinco chamadores WhatsApp/DM Meta/sync/widget.
Worker revalida fonte/configuração e espera registro completo do produtor. Regressão
local 35/35; detalhes e limites em AI_ATTENDANCE_CONTINUOUS_PROGRESS.md. Outros
gatilhos/comentários, admissão completa do evento, recuperação por efeito e revogações
continuam pendentes. Este gate segue ABERTO. Nenhuma publicação nova.

Atualização seguinte: admissão transacional agora fixa o conjunto elegível por
evento, inclusive vazio, e versões das configurações antes dos efeitos. Replay
não incorpora automações novas/recém-elegíveis. Mais de 120 configurações bloqueia
admissão parcial; paginação consistente e recuperação dos efeitos ainda pendentes.
Isso não fecha o gate nem comprova a qualidade conversacional.

Recuperação posterior: agendamento inbound tem identidade por execução/ação e prazo
original; scheduler usa lease/token e conclusão condicional. Mensagem com protocolo
novo recupera ocorrência reutilizando outbox; efeito incerto não idempotente/legado
exige conciliação. Cota da ocorrência é transacional e não é reservada duas vezes.
Índices novos locais ainda exigem instalação/validação antes de qualquer publicação.
Revogação na entrega adiada e recuperação completa continuam pendentes: gate ABERTO.

Atualização seguinte: mensagem adiada de evento inbound passou a manter vínculo
com fonte/plano/job até a transação pré-provedor. Revogação/exclusão/edição e root
incerto bloqueiam envio; fingerprint impede remover o guard e cair em legado.
Isso cobre esse produtor específico, não toda automação antiga nem efeito interno.
Recuperação completa, waiting/consentimento e origens legadas ainda mantêm gate ABERTO.

Atualização posterior: tarefas, follow-up, pendência humana e nota de evento inbound
aceito agora têm efeito/evento/recibo atômicos e autoria automática. Replay não
sobrescreve edição humana nem duplica registros. Pendência humana criada não é
notificação entregue. Recuperação do root e demais efeitos/legados ainda pendentes;
gate segue ABERTO, sem publicação nova.

Retomada posterior: planos compostos apenas dos quatro efeitos internos imediatos
com recibo atômico podem ser retomados por lease/token, versão igual e teto de três
tentativas, pelo processador periódico existente. Preservam efeitos/edições/cota;
não acionam automações vizinhas nem reabrem conciliação explícita. Planos legados,
mensagens/agendamentos mistos e demais efeitos continuam pendentes. Índices locais
novos não foram instalados/publicados; gate continua ABERTO.

Atualização seguinte: protocolo 3 novo permite retomar registros de planos mistos
com envio durável/agendamento/efeito interno validado, sem recriar slots ou prazos.
Pré-entrega aguarda posse vencida ainda recuperável; incerteza do provedor continua
em conciliação, sem reenvio. Protocolo 2/legado não recebe ampliação automática.
Isso não aprova execução de todo efeito adiado ou gatilho legado; gate segue ABERTO.

Atualização posterior: os quatro efeitos internos adiados inbound agora usam
efeito/evento/recibo atômicos, protocolo comprovado e retomada com lease/token.
Edição humana/cota/prazo são preservados. Espera legítima não consome tentativa;
revogação bloqueia retry. Retry legado sem prova exige conciliação, não repetição.
Campos/funil, origens legadas e demais gates continuam pendentes; nenhuma publicação.

Atualização B/Shopify: protocolo 4 registra mutações de etapa/prioridade/tag com
recibo/evento atômicos e baseline de campo/funil. PATCH de perfil e POST de etapa
marcam decisão manual; acesso comercial do POST foi antecipado para antes dos
efeitos. Agent/derivação revalidam snapshot. Prova local: 98 testes de regressão e
3 de handlers autenticados no emulador. Outros escritores (pedido/proposta/draft),
origem causal/fan-out, consentimento, retenção e restart real ainda pendentes;
ver AI_REBUILD_CRM_WRITER_AUDIT.md. Gate continua ABERTO; sem publicação nova.

Atualização seguinte: etapa originada de pedido Shopify passou a carregar evento
persistido e recibo com mutação/evento/trabalho atômicos. Respeita etapa humana e
IDs reais do funil; ready retoma no consumidor periódico existente, enquanto efeito
iniciado incerto exige conciliação. Regressão local 123/123; sem publicação. Isso
não homologa todos os efeitos do pedido, cada ação legada, ordem/revisão dos eventos
ou retenção/cron/restart reais. Gate permanece ABERTO.

Nota de estado posterior: a missão Shopify encerrou A em diagnóstico/contratos com
auditoria e decisão explícita do usuário (AI_REBUILD_STAGE_A_EXIT_AUDIT.md). Isso
permite B da missão nova, não aprova este gate nem recupera o objetivo antigo.
`send_message` de waiting_for_reply com espera imediata agora usa a outbox comum;
gatilhos imediatos restantes, identidade de agendamento, leases e revalidação de
condição/configuração continuam pendentes. Histórico abaixo não é estado atual
desse caminho específico. Nenhuma alteração nova publicada.

Atualização B/Shopify: update_lead/assign_lead/create_proposal aprovados agora usam
commit conjunto de alteração/ownership/evento/auditoria/recibo. Revisão congela
conteúdo e versão do alvo; replay com acesso atual não regrava edição posterior.
Autoria MCP continua distinta de decisão humana. Regressão 157/157, tipagem/lint
aprovados localmente. Propostas gerais, financeiro, intake, outros drafts e provas
operacionais restantes continuam pendentes. Gate ABERTO, sem publicação ou novo motor.

Atualização seguinte: criação POST budgets deixou de regravar etapa ao salvar
rascunho. Proposta/evento/avaliação de etapa agora são atômicos, com acesso atual,
ownership humano e IDs reais do funil respeitados. Regressão local 66/66 e
tipagem/lint aprovados. Retry POST ainda pode criar outra proposta; PATCH de
aprovação/financeiro/efeitos e demais pendências permanecem. Gate ABERTO.

Atualização posterior: POST com Idempotency-Key e formulário existente agora
compartilham intenção persistente e receipt atômico por tenant/ator. Concorrência,
conflito, acesso e replay após reinício em processo separado aprovados; regressão
76/76, tipagem/lint aprovados. Chamadas legadas sem chave continuam sem proteção;
retenção/tombstones, QA visual, PATCH/financeiro e demais gates pendentes.
Sem publicação, inferência ou aprovação da qualidade conversacional. Gate ABERTO.

Atualização seguinte: PATCH de propostas usa commit conjunto de proposta/revisão/
etapa/evento/receita pendente/job causal, impedindo cinco receitas em aprovações
concorrentes. Formulário envia revisão esperada; pendências ready retomam pelo
consumidor periódico existente; efeitos iniciados incertos exigem conciliação.
125/125 testes locais, tipos/lint aprovados. Não é quitação, entrega pelo provedor
ou qualidade de conversação. Callers sem revisão, gatilhos legados por ação,
retenção/saúde/índices/QA/restart reais continuam pendentes. Gate ABERTO.

Atualização posterior: intake passou a reler cliente e gravar cadastro/evento/
submissão juntos, preservando responsável/etapa/tags bloqueadas/cadastro/notas.
Cliente excluído após lookup não é recriado. Entrada usa funil real e projeção
não avança para etapa inexistente. Regressão 91/91, tipos/lint aprovados localmente.
Matching/criação concorrente/replay, customFields conflitantes, efeitos pós-commit
e demais gates continuam pendentes. Sem novo motor/publicação; gate ABERTO.

- A ultima resposta de esclarecimento sobre a missao foi sem progresso no objetivo
  tecnico. Esta retomada revalidou o checkout e o emulador Firestore em 8080 e
  executou a proxima migracao segura. O objetivo antigo segue ativo, sem redefinicao.
- `send_message` do executor de jobs agendados agora aceita mensagem/tarefa na
  outbox atomica, sem chamar o provedor diretamente. Ocorrencia e identificada por
  tenant + job agendado + automacao, nao por lead ou texto: uma ocorrencia futura
  legitima pode repetir o texto, mas retry nao muda conteudo/destino silenciosamente.
- Recibo operacional liga mensagem e outbox ao job; evento no lead e unico por
  entrega. Aceite na fila nao e declarado como entrega. Resultado incerto continua
  exigindo reconciliacao pelo worker comum, sem fallback direto.
- Autoria `automationGenerated`/`automation:<id>` e distinta de IA generativa e
  humano; observacao CRM usa `automation_outbound`. Nao pausa IA, nao assume
  responsabilidade da conversa nem usa texto automatico como confirmacao humana
  para avancar etapa. Isso nao homologa todo o aprendizado por vendedor.
- 19/19 aprovados em 17,88 s: primeira versao com quatro testes novos e regressoes
  AI WhatsApp/social. A ampliacao para cinco testes novos tambem passou; regressao
  CRM separada exigiu configurar explicitamente o emulador (primeira tentativa
  falhou por falta de credencial, nao por assert de produto). Resultado final abaixo.
- Tipagem direcionada (`tests/tsconfig.automation-delivery.json`) e lint dos seis
  arquivos de codigo aprovados. Sem build global, homologacao UI ou publicacao.
- Escopo ainda INCOMPLETO: automacoes imediatas e waiting_for_reply continuam no
  caminho direto; agendamento de uma mesma ocorrencia ainda pode criar dois jobs
  se o gatilho for repetido antes do aceite. Falta identidade duravel desde o evento
  de origem em todos os chamadores. Lease/retry de jobs de automacao pertence a
  fase 3 e ainda nao foi homologado. Nao fechar gate 2 nem avancar.
- Publicacao futura precisa incluir produtor e worker compativeis com origem
  `automation`; worker antigo rejeita esse fingerprint. Nada foi publicado aqui.

## Retomada atual: respostas de comentario social na outbox — 19/10/2026

- Turno anterior classificado como progresso: campanha individual migrada e
  validada localmente. Inspecao atual confirmou envio direto em social/service e
  retry que sobrescrevia sent. Essas rotas de envio agora delegam a reply-delivery.
- Respostas Instagram publica/privada e Facebook publica usam chave fixa por
  tenant/canal/comentario, independente de timestamp, evento repetido ou chat.
  Texto e modo/destino sao congelados no aceite; replay consulta a entrega aceita,
  nao gera outro texto nem transforma comentario publico em DM. Facebook usa
  /comments, Instagram /replies; privado IG continua recipient.comment_id.
  Referencia primaria: SDK oficial Meta, Comment.create_comment e IGComment.
  https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/comment.py
  https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/igcomment.py
  Docs Meta retornaram 429/inacessivel na consulta; nao foi feito teste real da API.
- Mensagem privada, tarefa, ledger social_reply_deliveries e vinculo do log sao
  aceitos juntos. Resposta publica usa operacao interna, sem mensagem agent,
  tail/preview/pausa/CRM artificial de DM. O resumo system do comentario recebido
  que ja existia foi preservado. Ledger separado impede recriacao por outro evento
  se a tarefa aceita for removida. Nao e garantia apos expurgar todo o historico;
  retencao de tombstones integra a fase 6.
- Revalida tenant, canal/conta, comentario/autor, conversa, configuracao, regra,
  horario e opt-out inclusive na transacao da barreira antes da Meta. Aceite usa
  CAS de origem/configuracao/canal/consentimento; contato ausente e criado no mesmo
  batch para nao perder corrida com opt-out. Regra alterada nao reinterpreta envio.
- Claim de preparo com token/prazo impede reentrada viva; callbacks antigos nao
  sobrescrevem outro claim nem entrega aceita. Busca de chat agora exige channelId,
  sem converter conversa de outra conta. Isso nao fecha identidade/deduplicacao
  historica da fase 5. Etapas anteriores de CRM ainda podem repetir se houver
  interrupcao antes do aceite; devem ter seus proprios recibos nas fases 4/5.
- Recibo externo obrigatorio. Fonte, ledger, mensagem privada, tarefa completed e
  liberacao de lock sao confirmados na mesma transacao sob lease/token. Read ja
  registrado nao regride. Sucesso sem ID, ACK perdido e processo morto ficam sem
  permissao automatica de reenvio; retorno sent exige IDs iguais em tarefa/log/ledger.
  Falha posterior nao rebaixa recibo confirmado. Reenvio manual reutiliza a tarefa
  apenas para dead letter comprovadamente anterior a qualquer tentativa externa.
  Logs legados sent/processed/ignored nao sao resetados; legados incertos exigem
  revisao. Nao se habilitou DM de novo seguidor, que segue desativada.
- Evidencia intermediaria: 22/22 social em 35,61 s (75130); regressao ampliada
  73/73 em 119,52 s (30874), incluindo campanhas/aceite atomico/IA social/crashes.
  Depois do ledger e retry seguro: 40/40 em 62,07 s (28935), 29 sociais + 11
  aceite atomico/IA social. Ver QA_LAB_CLIENTE para execucao final apos todos os
  ajustes; estes resultados intermediarios nao substituem a suite final.
- Regressao comum apos migracao: 72/72 em 66,33 s (5014), MCP, handoff/alertas,
  ecommerce, voz e materiais. Contratos sociais/Shopify/campanha: 31/31 em 1,98 s.
- Suite social FINAL apos ledger e verificacao de recibo consistente: 31/31 em
  66,55 s (31467). Inclui falha de ACK/commit, fluxo completo da regra, dois modos
  de crash, tombstone, claim expirado, retry seguro e read antecipado. Tipos finais
  aprovados (21926); lint final sem erros/avisos e diff --check aprovado (66399).
- A colecao nova social_reply_deliveries precisa entrar no manifesto de lixeira/
  retencao/expurgo da fase 6. Nenhum dado real foi migrado ou expurgado nesta etapa.
- Sem deploy, indice publicado, build global, modelo/Meta real ou UI autenticada.
  Gate 2 ABERTO. Recuperacao automatica de preparo interrompido, reconciliacao de
  resultado desconhecido e observabilidade completa ficam no gate 3, sem avanca-lo.
- Proxima lacuna confirmada em lib/server/automations.ts: acao send_message chama
  sendTenantChatText diretamente, sem chave comum/messageId aceito. Caminhos imediato,
  espera por resposta e agendado compartilham executeAction; agendamento cria job
  aleatorio. Migracao precisa identidade duravel de gatilho/execucao/acao e conteudo
  aceito, nao apenas chave por lead/automacao (que impediria execucoes legitimas).
  runLeadAutomations e chamado pelo fluxo social: por isso ainda NAO se pode dizer
  que todos os envios originados em evento social estao protegidos. Nada publicado.

## Historico: entrega individual de campanha duravel — 19/10/2026

- Retomada anterior classificada como progresso: teste restrito de IA por conversa
  conferido no codigo e 23/23 testes reexecutados. Nesta retomada, processos de
  teste/tipos antigos nao estavam vivos; emuladores locais estavam ativos. As suites
  foram executadas de novo, nao presumidas aprovadas pelo historico.
- Texto, template e midia de campanha agora usam deliverCampaignRecipient e a
  outbox comum. Cada tenant/run/lead tem uma entrega, mensagem e tarefa estaveis.
  Aceite atomico vincula ledger/job/mensagem e CAS das politicas; repetir usa o
  conteudo aceito, nao refaz personalizacao ou troca o destino. Job aceito removido
  nao e recriado. Dispatch usa snapshot/manifesto do run, nao configuracao editada.
- Resolvedor canonico WhatsApp exige o canal original. Chat social do mesmo lead
  nao e reescrito. Antes do provedor, tenant, canal/conta/telefone, lead, run,
  consentimento/frequencia e vinculo imutavel sao revalidados na barreira duravel.
  Reserva transacional do contato impede outra entrega por numero remetente
  diferente enquanto a primeira exige confirmacao.
- Midia e header por URL sao copiados para arquivo privado create-only. Tarefa
  guarda generation/hash/tamanho/MIME e reaproveita a copia; alteracao do link
  depois nao altera os bytes. Link assinado e gerado somente quando o provedor
  precisa dele; legacy e Evolution preservam representacoes suportadas.
- Campanha pausada ou futura aguarda sem consumir tentativas de falha. Texto fora
  da janela nao e substituido por outro template; template Evolution nao suportado
  falha antes da barreira. Consentimento revogado no preparo nao autoriza fallback.
- Recibo externo e vinculado transacionalmente ao ledger, contexto do lead/chat
  e evento unico. Recibo antecipado read nao regride para sent. Falha de confirmacao,
  sucesso sem ID ou queda do processo nao autorizam reenvio nem contagem de sent.
  Lote com filho incerto fica delivery_pending, nao conclui run. Resumo aplica delta
  por lote; repetir nao soma os mesmos envios ou completedJobs novamente.
- Evidencia atual: 50/50 em 47,02 s (10929): campaign-recipient-delivery 26,
  campaign-delivery-acknowledgement 4 e campaign-run-admission 20. Inclui 500 lotes,
  corrida, perda de commit, horario, revogacao dentro da barreira e processo filho
  exit 71 apos aceite ficticio. Contratos/cache/operacao/escopo IA: 33/33 em 2,19 s.
  Contrato estatico antigo de envio direto foi substituido por verificacao de
  delegacao a outbox e vinculacao do ID real na transacao, mantendo a integracao
  de recibos antecipados em emulador. Lint e tipos direcionados aprovados (19263).
- Regressao do worker comum: 83/83 em 55,73 s (34599), cobrindo aceite atomico,
  MCP aprovado, handoff/alerta, ecommerce manual/automatico, voz, material da base
  e texto social IA. Inclui quedas de processo, recibos perdidos e pausas humanas.
- Compatibilidade Shopify: 40/40 contratos de conexao/catalogo/OAuth em 1,52 s
  (43520); nao comprova integracao real da loja nem runtime completo de conversa.
- Sem provedor real, deploy, indices publicados, build global ou UI autenticada.
  Os nove HTTP do snapshot antigo nao comprovam este worker. Gate 2 ABERTO.
- Pendencias: reconciliar automaticamente delivery_pending/resumos quando filhos
  terminarem, recuperar claims/leases dos lotes e revisar runs legados sem protocolo
  (fase 3, sem antecipar seu fechamento); artefatos antes de checkpoint podem ficar
  orfaos (fase 6). Canal canonico pode ser criado antes do aceite da mensagem;
  identidade integral e deduplicacao historica continuam na fase 5.
- Proxima entrada confirmada: lib/server/social/service.ts. claimSocialEvent so
  considera terminais processed/sent/ignored; claimed nao impede segundo chamador.
  Comentario publico, resposta privada por comentario e ramo de follower enviam
  diretamente. retrySocialAutomationLog sobrescreve status antes de chamar de novo,
  inclusive log antes sent. Perda de ack pode repetir; conteudo nao fica congelado
  antes do envio; retorno nao exige ID externo. Migracao precisa preservar destino
  comentario vs DM, canal, regra/consentimento e proibicoes existentes, sem usar
  texto de conversa comum como substituto. Nao declarar gate fechado.

## Historico: admissao e preparo de execucao de campanha

- Turno anterior foi progresso: mensagens aprovadas MCP migradas e testadas.
  Inspecao de campanhas encontrou dois niveis distintos de repeticao: criar outro
  run ao repetir POST e repetir mensagem individual no dispatch. Esta retomada
  implementa a primeira dependencia; NAO fecha a entrega individual de campanhas.
- admitCampaignRun usa chave tenant/campanha/clientRequestId, reserva campanha e
  execucao em transacao e persiste manifesto imutavel de publico, horarios e snapshot
  da configuracao. Repetir consulta o run aceito sem refazer publico; horario/ator
  diferente com a mesma chave conflita. Chaves concorrentes distintas nao reservam
  duas execucoes ativas. Versao da campanha e conferida antes de aceitar o plano.
- Lotes tem IDs deterministas, create-only em staging. Todos precisam existir
  antes de iniciar ativacao condicional. Retomar nunca volta processing/completed
  para ready, nao altera tentativas/dueAt de retry e nao desfaz pausa. Falha de
  create ou perda de ack resolve registro existente no mesmo escopo/manifesto.
  Limite atual de 500 lotes e suportado sem batch Firestore acima de 500 escritas.
- Tela existente guarda identificacao opaca em localStorage por tenant/usuario/
  campanha antes do POST. Falha desconhecida ou reload conserva a chave; so recibo
  com runId/tenant/campanha correspondentes a confirma. Falha ao limpar cache nao
  dispara nova requisicao. Sem storage, falha antes do envio; nenhum dado de lead
  e guardado nesse cache. Mudanca de horario exige resolver tentativa pendente.
- API preserva corpo vazio legado e clientRequestId opcional; JSON/key/data invalidos
  sao recusados. Replay nao roda novamente o processador; inicio imediato so acorda
  o run solicitado, respeitando o horario aceito em vez de outras campanhas.
  Legado sem chave nao tem a garantia completa de replay apos conclusao do run.
- Worker recusa lista vazia (antes podia selecionar todo o publico), IDs invalidos,
  run ausente/estrangeiro/inativo/terminal e manifesto adulterado; nao pode antecipar
  horario do plano. Finalizacao conta staging/paused como pendencia, confere total
  do manifesto e nao limpa activeRunId pertencente a outra execucao.
- Evidencia: 54/54 em 32,22 s (34814), incluindo 500 lotes, concorrencia, perda de
  commit/create, ativacao parcial, pausa, escopo/manifesto, recibos e contratos de
  operacao. Contrato/integracao final de enqueue 3/3 e cache puro 4/4 (65266).
  Teste final de fechamento 1/1 (8,50 s): run permanece running com staging/paused
  e so limpa activeRunId apos os tres lotes terminarem, sem provedor (leads ausentes).
  Tipos/lint finais aprovados (21047), sem erros ou avisos nos arquivos desta retomada.
  Provedores externos bloqueados fail-closed; Firestore local, nenhuma mensagem real.
- Sem deploy, build global, HTTP autenticado do POST ou homologacao desktop/mobile.
  Gate 2 ABERTO. Proximo trabalho e migrar template/texto/midia de cada destinatario
  para entrega duravel com chave run/lead, consentimento revalidado e recibo unico.
  dispatchOutboundCampaign ainda chama provider/dispatch diretamente e cria delivery
  aleatoria depois; snapshot do run ainda nao rege o conteudo enviado pelo legado.
- Outra lacuna confirmada: findOrCreateLeadChat pode reescrever channel/channelId
  de conversa encontrada apenas por leadId, inclusive social. Trocar pelo resolvedor
  canonico de canal faz parte da proxima migracao; nao declarar identidade resolvida.
  Claims processing antigos, contadores cumulativos, reprocessamento e staging
  sem cliente para retomar exigem recuperacao da fase 3 apos fechar o gate 2.

## Retomada anterior: mensagens de acoes aprovadas MCP

- Inspecao confirmou envio direto antes do finish em send_or_reply_conversation
  e start_whatsapp_conversation. Ambos agora usam deliverApprovedMcpMessage e a
  outbox comum. Outras operacoes de aprovacao permanecem no contrato anterior.
- Chave e fixa por tenant/rascunho. Batch de aceite grava mensagem/job, estado
  da conversa e rascunho applying/messageDelivery conjuntamente, com CAS real da
  versao aprovada. Rejeicao antes do commit nao deixa mensagem/job/pausa fantasma.
  Conteudo, template/variaveis, reply e destino precisam corresponder ao aprovado.
- Worker verifica aprovacao e destino novamente na transacao da barreira duravel,
  antes do provedor. Revogacao, alteracao de proposta/telefone/canal/conta/lead ou
  alvo fora do tenant bloqueiam. Excecao de aprovacao nao autoriza voz/outros tipos.
  Revogacao depois de entrar na barreira nao e cancelamento de envio em andamento.
- Rascunho so vira applied com job completed no escopo. Recibo e auditoria de ID
  fixo sao gravados juntos em transacao; repetir retorna o mesmo recibo. Falha de
  ack/HTTP sem ID continua applying, sem appliedAt nem novo envio. Dead letter
  retorna bloqueio distinto de pendencia. Applying antigo sem protocolo nao retoma.
- Inicio WhatsApp reutiliza resolvedor canonico, preserva acesso comercial,
  permissao, canal pessoal e regra de template. Alvo aceito nao e trocado ao repetir.
  Nao cria tela; displayText de template e preservado e validado na outbox.
- Evidencias: 77/77 emulador/regressao em 52,31 s (55340), incluindo enqueue
  atomico, templates, handoff, ecommerce e texto IA WhatsApp/social. MCP/contratos
  operacionais/Shopify: 99/99 em 34,10 s (96274). Suite MCP ampliada: 22/22
  (25,44 s, 86445), com Instagram/Messenger/site, perda de commit/recibo,
  revogacao apos preflight e processo filho encerrado com exit 71 apos aceite
  ficticio. Repeticao final apos endurecer validacao de tipo: 22/22 em 29,30 s
  (43969), sem alteracoes de entrega posteriores.
- Tipos/lint direcionados aprovados (83727). Primeiro teste de corrida aguardou
  timeout da propria simulacao pessimista; foi ajustado para revogar depois dos
  preflights e antes da leitura transacional da barreira, que reprovou a entrega.
  Resultado final nao depende de timeout do emulador nem de nova tentativa externa.
  Contrato final da rota reexecutado 1/1 (12698) apos remover truncamento do ID.
  Tipos/lint finais aprovados (24148), sem erros ou avisos nos arquivos desta retomada.
- Provedores ficticios fail-closed, Firestore local. Sem deploy, build global,
  chamada Meta real, HTTP autenticado da rota apply ou UI. Inicio canonico esta
  ligado por contrato de fonte; fluxo completo de primeira conversa pela API
  ainda exige homologacao. Gate 2 aberto; proximas entradas: campanhas e social/service.
- Riscos: workers legados em voo precisam drenagem antes de publicar. Rascunhos
  antigos em applying/apply_failed sem prova nao ganham permissao automatica.
  Auditoria de mensagens historicas incertas e reconciliacao automatica do resumo
  da aprovacao apos worker concluir continuam pendentes. Nao avancar a fase 3.

## Retomada anterior: envios de acoes ecommerce

- Auditoria confirmou que ecommerce-agent e a rota manual send-template enviavam
  diretamente. Expirar claim ou perder resposta podia repetir o template sem chave
  comum. Ambos agora usam deliverEcommerceActionTemplate, com chave por tenant/acao.
- Transacao vincula conversa, destinatario, lead e fingerprint do template antes
  de enfileirar. Vinculo e job/message IDs sao imutaveis; chamada concorrente ou
  retomada reutiliza o mesmo job da outbox. Alterar parametros/destinatario conflita.
  Falha entre vinculo e enqueue nao envia nada; retomar continua o mesmo vinculo.
- Busca mantem chats WhatsApp antigos sem channel e nunca reescreve Instagram.
  Conversas ambiguas, grupos, busca incompleta (50 registros), lead estrangeiro ou
  conversa vinculada removida bloqueiam envio. Nao e deduplicacao omnichannel geral.
- Apenas job completed + mensagem/ID externo no escopo permitem declarar enviada.
  Perda de ack/HTTP sem ID mantem pendencia; repeticao consulta o job, sem reenviar.
  Autor do envio vem do job original. Evento manual tem ID estavel e leitura
  transacional de lead/evento, sem duplicar evento ou escrever em outro tenant.
- Processo automatico novo registra protocolo de entrega. Claims novos vencidos
  podem consultar a outbox; antigos sem prova ficam failed para revisao e tambem
  nao podem ser reenviados manualmente enquanto o resultado for desconhecido.
  Finalizacao/falha confere status e runId em transacao, preservando novo dono.
  Entrega pendente nao consome tentativas de falha nem vira done.
- Evidencia: 69/69 em 16,78 s (89323): ecommerce-action-delivery (14), politica
  ecommerce, templates e tres suites Shopify. Protecao final de revisao legada
  reexecutada 1/1 (8,04 s). Tipos/lint direcionados aprovados (59764).
  Contrato estatico verifica ligacao das duas entradas; teste autentico HTTP da
  rota manual e teste de interrupcao do processo ecommerce completo nao executados.
  Crash de entrega do template comum ja possui testes independentes anteriores.
- Novo indice chats(tenantId, contactPhone) preparado em firestore.indexes.json,
  NAO implantado. Nenhum deploy, build global, UI, LLM ou envio real nesta rodada.
  Gate 2 aberto; proximas entradas: campanhas, MCP apply e automacoes sociais.
- Riscos de publicacao: drenar workers legados que ainda possam estar em envio;
  tarefas pending historicas sem prova de tentativa exigem auditoria propria.
  Mudanca de configuracao apos aceite nao regenera mensagem: exige conferir recibo
  e resolver conflito. Reconciliacao automatica do resumo da acao, observabilidade
  e reprocessamento confirmado completos permanecem na fase 3.

## Retomada anterior: gateway legado e texto primario do site

- Material KB continua sendo verificado e copiado para chat-media/tenant/chat.
  Dispatch resolve o provider normalizado e so para legacy_gateway assina URL
  da copia imutavel, com generation fixa. Meta/Evolution continuam usando bytes;
  site nao assina URL. Assinatura ocorre antes da barreira duravel do provedor.
  Falha da assinatura retenta preparo sem recopiar o artefato aceito; perda de
  confirmacao de entrega nao repete assinatura ou envio.
- Gateway legado nao suporta audio. Dispatch reconhece essa capacidade antes
  da barreira de entrega e produz AiVoicePreparationError para a voz da IA,
  permitindo o fallback textual duravel ja existente no mesmo canal. Nao afirma
  voz enviada. A sintese pode ja ter ocorrido; esta mudanca nao elimina esse custo.
  Worker revalida pausa/origem apos preparo antes de classificar capacidade;
  pausa humana durante TTS nao pode ser confundida com erro seguro de preparo.
- Resposta primaria site_chat do agente usa deliverAiConversationText, como os
  canais sociais; teste de contrato confere o ramo e o emulador comprova uma
  mensagem/job completed com replay sem chamada externa. Nao e teste do LLM completo.
- Evidencias: regressao 57/57 em 87,11 s (11846), incluindo voz/materiais/texto,
  redes sociais, audio manual, integridade e crash de texto/template/media/voz/KB/
  handoff. Dois testes finais 2/2 (44973) cobrem assinatura falha e contrato do site.
  Seis suites puras voz/compositor/Shopify: 52/52 (4,83 s). Tipos e lint finais
  aprovados (19665); lint anterior do agente mantem dois avisos preexistentes.
- Sem novo deploy, build global, HTTP de snapshot atual, UI autenticada ou chamadas
  reais Meta/Evolution/gateway/OpenAI. ffmpeg/Firestore/Storage locais; provedores,
  TTS e assinatura simulados fail-closed. Gate 2 continua ABERTO.
- Inventario identificou outras entradas a auditar: outbound-campaigns,
  ecommerce-agent, rascunhos MCP apply e social/service chamam dispatch/provedor
  sem passar pela outbox comum. Nao concluir por busca que nao possuem protecao
  propria; verificar aceite atomico, chave estavel e janela de queda em cada fluxo.
  Helpers antigos exportados tambem precisam verificacao de chamadores.

## Retomada anterior: handoff e repeticao interna do Evolution

- Confirmacao do handoff e alertas agora passam por tarefas persistentes. Pausa
  de encaminhamento e aceite da confirmacao sao gravados no mesmo batch com
  precondicoes de versao; queda antes do commit nao deixa pausa sem mensagem/job.
  Token/origem/prazo/responsavel sao congelados. Essa excecao autoriza somente a
  confirmacao, nao respostas comuns sob pausa. Controle humano/novo turno revogam.
- Alertas internos usam uma tarefa por destinatario normalizado, sem mensagem no
  historico do lead, sem alterar preview, sequencia/tail ou CRM. Posse de entrega
  usa canal/destinatario; alerta incerto nao bloqueia confirmacao ou outro receptor.
  Aviso positivo ao cliente exige tarefa de handoff registrada ou alerta confirmado.
- Evolution tinha fallback pelo texto generico do erro (`text`, `valid`, `400`).
  Agora exige erro HTTP tipado 400/422, rejeicao explicita do campo textMessage e
  ausencia de ID externo. Rede/timeout/5xx/erro ambiguo/200 sem ID nao reenviam.
  Compatibilidade antiga fica limitada a rejeicoes de schema reconhecidas; erros
  nao reconhecidos exigem revisao, nunca um segundo envio especulativo.
- Evidencia desta retomada: 32/32 testes de conector e contratos; 10/10 em
  ai-text-delivery com Firestore local, incluindo Evolution rede/500/schema e
  replay real da tarefa. Seis suites puras voz/compositor/Shopify: 52/52.
  Handoff reexecutado: 12/12 em 17,35 s (78698), incluindo corrida com pausa
  humana e batch nao confirmado. Tipos direcionados e lint dos arquivos desta
  retomada aprovados (17844); nenhum build global executado.
  Chamadas externas simuladas fail-closed; nenhuma mensagem real enviada.
- Acao de teste por conversa implementada localmente reutiliza API de escopo
  restrito existente; ver INBOX_TESTE_IA_POR_CONVERSA.md. Nao e homologacao visual.
- Gate continua ABERTO. As falhas de gateway legado e site_chat identificadas
  nesta retomada foram corrigidas localmente na secao acima. Permanecem inventario
  de entradas/provedores, novo snapshot/HTTP e UI autenticada.
- Resumo lastHandoffNotify no estado pode permanecer pendente apos worker concluir;
  jobs sao fonte autoritativa. Reconciliacao/observabilidade entram na fase 3 apenas
  depois do gate 2. Artefatos orfaos/retencao permanecem na fase 6.

## Retomada atual: materiais da base

- Agent passou a deliverAiKnowledgeMedia. Cada material tem chave estavel por
  turno, fingerprint de doc/URL/path/tipo/legenda/nome e uma tarefa/mensagem
  persistida antes de buscar/copiar/enviar. Nao acrescenta outra mensagem depois.
- Origem precisa ser referencia ativa do KB do tenant. Storage aceita apenas
  kb-media/tenant; copia imutavel fica em chat-media/tenant/chat, com hash,
  geracao, bucket, tamanho e MIME conferidos ao retomar. Alterar o original nao
  muda a copia da conversa. Pausa/novo turno/revogacao antes do envio bloqueiam.
- URLs externas usam download publico limitado, DNS validado e IP fixado no
  socket. Rejeita redes privadas/reservadas, credenciais, portas alternativas,
  downgrade HTTPS, redirecionamentos excessivos e corpos acima do limite.
  Tests de DNS/HTTP sao simulados fail-closed; nenhuma URL externa real baixada.
- WhatsApp usa bytes + upload/media ID. Instagram/Messenger preservam legenda
  e anexo como tarefas distintas, ordenadas, com IDs proprios. Legenda incerta
  impede anexo; anexo incerto nao repete legenda nem dispara fallback textual.
  Sao duas operacoes sequenciais, nao uma transacao atomica de multiplos envios.
  Conversa do site persiste o material sem provedor/assinatura de URL.
- So falha comprovada de preparo permite texto alternativo (slot asset_failure).
  Permissao/escopo/integridade/confirmacao incerta nao podem virar esse fallback.
  sourceMediaUrl preserva reconhecimento do material ja enviado, apesar da copia
  privada ter outro path. Mensagens failed nao bloqueiam futuras selecoes.
- Regressoes: 67/67 em 79,75 s (4028), incluindo concorrencia, todos os canais,
  copia imutavel, download publico simulado, fonte revogada, metadata adulterada,
  anexo/legenda sem ack e processo filho encerrado apos aceite de ai_knowledge_media.
  Seis suites voz/compositor/Shopify: 52/52 em 3,32 s. Tipos aprovados; lint zero
  erros e dois avisos preexistentes (67985). Sem novo deploy/HTTP/UI/provedor real.
- Staging sem checkpoint pode deixar orfaos no prefixo da conversa, como na voz;
  inventario/quotas/expurgo completos permanecem pendentes da fase 6. O gate 2
  continua aberto: proximos caminhos reais sao confirmacao e alertas de handoff.

## Retomada atual: voz gerada pela IA

- Agente passou a deliverAiConversationVoice. Uma mensagem/tarefa ai_voice e aceita
  antes de TTS; fingerprint cobre origem, texto, voz, limite e transcricao. Chave
  estavel por turno; replay nao chama novamente TTS/provedor quando ja preparado.
- Preparacao salva OGG/Opus e MP3 em par unico no prefixo de midia da conversa.
  Ambos os arquivos precisam existir antes de vincular o par por transacao ao job
  e a mensagem. Posse/token/prazo/escopo sao conferidos; bytes, hashes e geracoes
  sao verificados ao retomar, sem sobrescrever artefato aceito.
- Barreira de IA e repetida antes do provedor, depois de TTS: pausa humana,
  mensagem mais recente e validade comercial continuam valendo. Nao pausa a
  propria IA, nao atribui lead a altum_ai e mantem contexto de commerce existente.
- AiVoicePreparationError e a unica falha que o agente pode converter em texto;
  perda de ack, artefato alterado, pausa, supersessao e HTTP sem ID de mensagem
  permanecem pendentes/bloqueados. Fallback textual, segunda mensagem e checkout
  usam slots de texto duraveis, inclusive nos antigos ramos de voz.
- Regressao final: 50/50 (86,67 s, 14425), incluindo processo filho encerrado com
  exit 71 apos aceite ficticio da voz e resposta HTTP sem ID tratada como incerta.
  Tipos aprovados; lint zero erros e dois avisos preexistentes no agente (18456).
  Outras seis suites puras/contratos: 52/52 (5,92 s), voz/compositor/Shopify.
- TTS/Meta simulados fail-closed; ffmpeg e Storage reais locais. Nao prova agente
  completo com LLM, UI autenticada nem envio real. Snapshot/HTTP anteriores obsoletos.
- Risco conhecido: interrupcao antes de vincular o par pode deixar arquivos de
  staging orfaos; permanecem no prefixo tenant/chat para inventario/expurgo da fase 6.
  Sintese pode ser repetida se o processo cair antes do checkpoint, nunca como
  consequencia de repetir uma entrega ja iniciada. Nenhuma mudanca publicada.

## Retomada: interrupcao de processo e audio

- A barreira de tentativa passou a ser persistida e aguardada antes da chamada ao
  provedor. Recuperacao de processo que ja iniciou tentativa exige reconciliacao;
  nao repete automaticamente. Prova de protocolo e vinculada ao token da posse,
  inclusive quando versoes antigas/novas de workers convivem durante publicacao.
- Finalizacao/falha so altera tarefa e mensagem se o worker ainda e o dono. Recibo
  entregue/lido nao regride. Reprocessar resultado incerto exige confirmacao e
  conserva a ultima tentativa anterior, alem do contador cumulativo.
- Corrigido audio manual: MetaCloudMessagingProvider rejeita URL de audio. Worker
  agora usa os bytes verificados/conversao real, upload + media ID, sem assinar URL
  desnecessaria; player guarda MP3 com tamanho correto. Texto, template e documento
  conservam seus caminhos existentes.
- Testes novos encerram um processo independente apos o aceite do provedor simulado,
  depois recuperam a tarefa em outro processo. Tambem cobrem perda do ack da propria
  barreira, posse perdida, leitura antecipada e convivencia de versoes de worker.
- Regressao final: 41/41 (61,64 s), em sete suites, incluindo crash/lease, audio,
  idempotencia, texto IA WhatsApp/social, templates e integridade da midia.
- Na retomada anterior, a migracao de voz da IA ainda estava pendente por causa
  dessas falhas previas. Foi implementada e testada na retomada descrita acima;
  nao tratar este registro historico como uma pendencia ainda aberta de voz.
- Snapshot 1792423979159/HTTP 9 testes e anterior a esta retomada: nao comprova o
  worker atual. Sem novo deploy, teste visual ou chamada real Meta/TTS nesta rodada.

## Requisitos e evidencia atual

| Requisito | Evidencia | Situacao |
| --- | --- | --- |
| Aceite atomico de mensagem e tarefa, chave estavel e conflito por conteudo diferente | chat-outbound-atomic-enqueue/idempotency e testes HTTP de midia/templates | Implementado nos caminhos migrados; cobertura integral pendente |
| Texto preservado, sem truncar texto/referencia/chave silenciosamente | chat-text-dispatch-integrity e chat-outbound-payload/request-id | Testes direcionados aprovados; UI autenticada pendente |
| Midia aceita com bytes imutaveis e vinculacao de Storage verificavel | chat-media-immutability/dispatch-integrity/stored-media-admission e testes de voz/materiais | Caminhos migrados e gateway legado testados localmente; demais entradas e HTTP atual pendentes |
| Resultado incerto nao dispara reenvio cego | ai-text-delivery, ai-social-text-delivery, chat-template-outbound e chat-outbound-crash-recovery | Caminhos migrados protegidos inclusive contra queda do processo; legados pendentes |
| Autoria e estados persistentes, recibo antecipado sem regressao | chat-template-outbound e whatsapp-delivery-status | Template antecipado aprovado; nao substitui entrega real |
| Isolamento de acesso e tentativa repetida pela API real | chat-media-send.http: 9/9, snapshot 1792423979159 | Midia/templates aprovados, envio externo bloqueado |
| Todos os pontos de envio da conversa passam pelo mesmo contrato | Inspecao de agent.ts e demais entradas | Incompleto: ver matriz abaixo |
| Comportamento autenticado na interface desktop/mobile e recuperacao de falha | Homologacao visual de composer e estados persistentes | Nao provado; nao contornar bloqueios anteriores do navegador |

## Matriz dos caminhos da IA em agent.ts

| Caminho | Situacao atual |
| --- | --- |
| Resposta textual comum WhatsApp, Instagram e Messenger | Outbox; testes com conector simulado |
| Segunda mensagem e checkout quando o principal foi enfileirado | Slots estaveis; testes com conector simulado |
| Follow-up WhatsApp por template fora de 24h | Migrado nesta retomada; origem, pausa e supersessao testadas |
| Audio gerado e texto apos erro/pedido de voz | Migrado; fila, artefatos, fallback seguro e queda de processo testados localmente |
| Segunda mensagem/checkout em ramificacoes legadas de voz | Agora usam os mesmos slots de texto duraveis |
| Material da base e fallback de material indisponivel | Migrado; artefato privado, legenda social ordenada e fallback seguro testados |
| Confirmacao ao cliente no encaminhamento humano | Migrado; aceite atomico pausa/mensagem/job e autorizacao restrita revogavel |
| Alerta de handoff aos responsaveis | Migrado; outbox interna isolada por destinatario, sem historia/CRM/tail do lead |
| Resposta primaria site_chat | Migrada para texto duravel; uma mensagem/job, replay sem chamada externa testados |
| Template de acao ecommerce manual/automatica | Mesma chave por acao e outbox; vinculo imutavel, pendencia e recuperacao testados localmente |
| Mensagem/resposta e inicio WhatsApp aprovados por MCP | Outbox com aceite atomico da aprovacao, barreira revogavel e recibo/auditoria unicos; primeira conversa via HTTP ainda nao homologada |
| Inicio/preparo e entrega individual de campanha | Run/manifesto e entrega texto/template/midia na outbox; 50/50 locais; reconciliacao do resumo e homologacao pendentes |
| Resposta social a comentario publico/privado | Migrada para outbox/ledger; publicacao, HTTP autenticado e homologacao pendentes; follower continua sem DM |
| Acao generica send_message de automacoes | Jobs agendados usam outbox; imediatas/espera e identidade do evento desde a origem ainda pendentes |

## Ultima execucao verificavel

As execucoes abaixo sao historico da retomada de templates. Para worker atual,
considerar as suites da retomada atual no inicio; os nove HTTP sao anteriores.

- 19/19: chat-template-outbound, ai-text-delivery e ai-social-text-delivery,
  emuladores e conector Meta simulado fail-closed, 18,28 s.
- 9/9: chat-media-send.http, Next local 3201, contas de Auth Emulator, Firestore
  e Storage locais; 122,20 s. Sem provedor: fence mantida, attempts=0.
- 7/7: testes puros chat-outbound-payload e chat-outbound-request-id.
- Typecheck direcionado aprovado apos migracao de template; lint zero erros,
  dois avisos preexistentes no agente. Nao e build global do checkout atual.
- Snapshot possui 1.316 arquivos sem .env; teste HTTP compara hashes de 13 fontes
  criticas com o checkout. Nao prova UI nem agente completo com modelo/Shopify.

Proximo trabalho: migrar mensagens das automacoes genericas, completar inventario de demais
entradas/provedores, corrigir lacunas e atualizar homologacao. O helper antigo
sendAltumVoiceReply permanece exportado por compatibilidade, sem chamador atual
encontrado; nao confundir com o caminho do agente, que foi substituido. O gate so fecha quando todos
os requisitos acima estiverem demonstrados, nao apenas quando novas suites passarem.
