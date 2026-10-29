# Progresso da missão CRM Altum

## Estado atual

### Correção da fonte comercial vigente — 23/10/2026

Execução retomada após cobrança do usuário. Referência principal de produto:
Kommo, com comparação em `CRM_REFERENCIA_KOMMO_2026-10-23.md`.
Entrega local e limites em `CRM_CORRECAO_FONTE_COMERCIAL_2026-10-23.md`.

- Cinco regressões novas falharam antes da correção; um sexto teste reproduziu
  a desatualização das projeções já gravadas.
- Leitura comum dos campos atuais em qualificação, dossiê, memória e evidência;
  proteção humana propagada ao escritor de perfil e aos dados usados pelo agente.
- Revisão atualiza qualificação e dossiê existente atomicamente; preserva análise
  anterior no histórico e omite seus textos desatualizados da projeção atual.
- Suítes locais: 33/33, 11/11 e 11/11; uma repetição específica do executor com
  novas verificações 1/1; defesas adicionais de documento/legado 2/2 e geração 1/1.
  Fluxo HTTP real no servidor local: nove respostas 200, com correção, ficha,
  lista, limpeza e restauração conferidas. Tipagem e lint do recorte aprovados.
- Nenhuma chamada a modelo, envio, migração ou publicação em produção nesta unidade.
- Fechamento da unidade: execução conjunta final 58/58, sem falhas/ignorados,
  88,5 segundos; tipagem e lint finais aprovados. Evidências e hashes em
  `.qa-artifacts/crm-current-facts-20261023/`. As contagens anteriores são
  subconjuntos/execuções sobrepostas, não testes adicionais.
- CRM integral ainda reprovado para expansão. Próxima unidade: confirmação,
  correção e retirada semântica com evidência e atualização coerente.

Serviços locais restaurados: Firestore 8080, Auth 9099, Storage 9199. Prévia
na porta 3199; dados fictícios, conta `crmrotina@qa.invalid`. Build otimizado
interrompido por consumo de recursos, sem aprovação. Navegador integrado não
anexou a aba em duas tentativas; abertura pela aplicação ficou em fila. Não houve
homologação visual.

Processos para continuidade: Firestore PID 10356; Auth PID 1880 (sessão 84324),
Storage PID 11848 (sessão 6936); prévia via `serve-inbox-qa.mjs` (sessão 55561).
Compilador otimizado PID 8036 foi encerrado após confirmar que era o filho do
launcher desta unidade. Não reiniciar sob a mesma pressão de recursos.

### Auditoria aprofundada — 23/10/2026

Diagnóstico ampliado em `docs/CRM_DIAGNOSTICO_PROFUNDO_2026-10-23.md`.
Base ainda reprovada para expansão; nenhuma correção de lógica do produto nesta rodada.

- Trinta jornadas fictícias, 210 turnos anotados: caminho determinístico 87/210 conferências corretas; 10/30 estados finais; 9/30 jornadas sem erro em nenhuma etapa. Conferências sucessivas são correlacionadas, não precisão representativa de produção.
- Mesmas trinta jornadas com histórico completo, fornecedor real e observador real: 18/30 estados finais corretos, trinta chamadas. Não foram avaliados 210 turnos semânticos individuais.
- Revisão humana transacional reproduz divergência: ficha 3000/limpa, qualificação ainda 9000 e pontos do dossiê ainda 7000, devido à precedência de atributos antigos/memória.
- Modelo real gravou ausência de orçamento como valor e qualificação somou dez pontos por “investimento compreendido”. Também classificou faturamento como tipo de negócio.
- Instruções/testes, outra pessoa ou outra compra podem virar orçamento por regras antigas mesmo quando o modelo não confirma. Retirada de prazo, interesse e objeção também não invalida o registro.
- Confirmação contextual por “sim” não cabe no contrato de citação de uma mensagem só. Respostas parcialmente rejeitadas e conteúdo cortado continuam podendo aparecer como conferidos.
- Mensagem de 4033 caracteres perde fato depois de 4000 sem pendência. Estados `not_enabled`, `disabled`, `outside_scope` e desconhecido assumem leitura conferida.
- Simulação de erro do modelo: cinco de dez verificações de defesa falharam; isto não é frequência de erro do modelo. Barreiras a origem inválida, preço do vendedor e valor inventado continuam aprovadas na amostra.
- Nenhum envio para cliente foi criado, nenhum estágio proibido apareceu na amostra. Produto, canais, UI, variação do modelo e cenários combinados permanecem sem homologação integral.

Prioridade de base: fonte comercial comum e estados explícitos de informação
(confirmada, indefinida, retirada, conflitante), evidência composta e propagação
coerente da intervenção humana para qualificação, resumo, funil e relatórios.

### Diagnóstico exigido antes de novas funcionalidades — 22/10/2026

Prioridade atual: corrigir qualidade do preenchimento antes de continuar a expansão.
Diagnóstico em `docs/CRM_DIAGNOSTICO_FUNCIONAL_2026-10-22.md`.
Não aprovado como preenchimento automático confiável nem como experiência homologada.

- Novos casos anotados: 19/35 com resultado esperado na ficha do emulador; 16 falhas, incluindo os três exemplos fornecidos pelo usuário.
- Fornecedor real, dados sintéticos: extrator 8/8; observador completo até o cadastro 6/8. Rejeição semântica não remove o candidato das regras; hipótese e retirada chegam como orçamento confirmado.
- Jornada real do modelo, três turnos: 5000 → correção para 3000 → retirada mantém 3000 com leitura `checked`, sem pendência. Histórico deve ser preservado com invalidação visível, não tratado como fato vigente.
- Áudio/imagem sintéticos, fornecedor real e CRM local: dois cenários aprovados, três chamadas; não houve webhook real ou homologação visual.
- Regressões: lotes 166/169 e 61/62. Quatro falhas passaram isoladamente; uma expectativa depende de dados anteriores da suíte e três subprocessos estouraram tempo sob carga. Não somar como suíte integralmente verde.
- Login/perfil HTTP local 200; navegador permaneceu nas telas de preparação/abertura da conta. Rotina visual e build completo seguem sem aprovação; disco abaixo de 150 MB nesta rodada.
- Operação real consultada somente para leitura pelo conector Altum: estados armazenados de canal estão desatualizados; isso não confirma saúde atual nem preenchimento semântico ativo em produção.
- Nesta rodada foram adicionados três scripts e relatório de diagnóstico. Nenhuma correção de lógica, publicação, migração, cobrança ou envio a cliente real.

Próxima frente: confirmação/rejeição/retratação dos fatos, degradação segura e
estado de leitura coerente, antes de novos recursos. A missão completa permanece aberta.

### Acompanhamento local e requisito do agente — 2026-10-22

- Usuário pediu aplicativo local para acompanhar e reiterou que o agente deve ler
  conversas reais, inclusive áudio/imagem, e preencher fatos verdadeiros no CRM.
- Servidor completo iniciado via `scripts/serve-inbox-qa.mjs`, porta 3199,
  projeto isolado `demo-altum-qa-lab`; serviços externos/modelos desligados.
  Seed `seed-conversation-preview.mjs` usa dados fictícios; nunca contar essa
  demonstração como prova de extração pelo modelo.
- Login e `/api/client-portal/me` responderam 200; primeira compilação lenta.
  `/cliente/painel/crm?view=pipeline` respondeu HTTP 200 (38.434 bytes);
  navegação autenticada da conta fictícia também chegou à área do cliente.
  Automação do navegador sofreu timeouts, sem conferência visual final do CRM;
  sem homologação integral. Servidor 88223 permanece ligado para acompanhamento.
- Achado inicial de código (tratado na unidade 22): `multimodal.ts` gravava `aiNormalizedText`,
  `aiMultimodalSummary` e `aiVisualAnalysis`, mas a normalização de mensagens e
  a fonte textual em `crm/conversation-intelligence.ts` usavam apenas
  text/message/body/caption. Isso demonstra lacuna nesse observador; não prova
  que todos os outros caminhos do agente falham ou que a integração funciona.
- Próxima prioridade de produto: rastrear enriquecimento → disparo da observação
  → evidência por campo → gravação → atualização da ficha. Validar texto, áudio,
  imagem e erro/baixa clareza, inclusive quando humano atende; preservar edição
  humana e vínculo correto da oportunidade. Modelo real e canais reais ainda
  exigem avaliação própria; teste sintético não cumpre essa aceitação.

- Missão ativa: MISSAO_CRM_ALTUM.md.
- Plano integral aberto; lotes locais e evidências registrados abaixo.
- Validações locais por unidade abaixo; conjuntos têm sobreposição e não devem ser somados.
- Sem publicação, migração real ou homologação integral no aplicativo completo.

## Unidade em andamento

Prioridade corrigida por orientação do usuário: agente do CRM, preenchimento
verdadeiro pelas conversas e rotina do vendedor. Não continuar reuniões agora.
Unidade 46: memória de conversa por seleção, com origem/gerações conferidas e
preservação da memória anterior. Trabalho em execução perde autorização ao trocar
a escolha; finalização/recuperação preservam controle humano. Rodadas 24/24 e
26/26 aprovadas, com verificações finais específicas, tipos e lint aprovados. Não habilita respostas
automáticas ou seletor antes de fechar os demais leitores/escritores.
Unidade 45: seleção transacional da negociação e isolamento de histórico no
observador, resumo e passagem para vendedor, com vínculo verificável e ocorrência
própria. Servidor implementado; regressão final 96/96 e conferência de contrato
1/1 aprovadas, com tipos/lint finais aprovados. Sem seletor na UI
ou rollout real. Resposta automática fica bloqueada para escolha explícita até
isolar sua memória; pendências históricas, mídia e outros escritores ainda abertos.
Unidade 44: identidade e valor da oportunidade preservados nas leituras da lista,
ficha, funil, família e conversa. Títulos ligados à busca/apresentação; vazio não
vira zero na edição/criação manual. Regressão 27/27 e cobertura limitada 1/1
aprovadas, assim como tipos e lint finais. Seleção explícita da compra na conversa
e interface de nova oportunidade continuam abertas.
Unidade 43: liberação explícita de campos corrigidos para novas atualizações com
evidência. Valor e autoria humana permanecem até mensagem posterior comprovada;
memória antiga do agente não pode substituir esse valor. Código e interface
implementados; regressão ampliada 54/54 e rodada final específica 13/13 aprovadas,
assim como tipos e lint. Aceite visual, canais reais e build integral pendentes.
Unidade 42: confirmação por ID após salvar/concluir e preservação do retorno
recém-salvo fora da primeira página. Regressão 42/42, tipos, lint e conferência
HTTP local aprovados. Descoberta periódica continua ativa. Aceite visual e
desempenho integral permanecem abertos. Build 44067 terminou com falha; cache
sem espaço e timeout de PostCSS registrados, limpeza automática bloqueada.
Unidade 41: paginação e seletor ligados à rotina no código, mantendo modo
compatível antes do rollout. Regressão final 44/44, tipos e lint aprovados.
Demonstração própria e fluxo HTTP autenticado local verificados. Preservação
entre abas implementada; aceite visual e desempenho integral continuam abertos.
Unidade 40 com backend e seletor verificados localmente: leitura paginada com
limite por pedido, cursores protegidos e conferência atual da carteira;
interface e seletor ligados na unidade 41, com aceite visual ainda pendente.
Consulta independente do seletor passou em teste HTTP com autenticação fictícia;
inclui clientes sem tarefa e busca além de uma página. Não é integração visual.
Unidade 39 com testes funcionais e tipagem aprovados: recomposição dos índices
ao restaurar tarefas, fatos arquivados preservados e revisão de estados legados
inválidos. Lint aprovado; cobertura global e entrega integral da paginação continuam abertas.
Unidade 38 com regressão de regras aprovada: contrato optativo de escrita direta
de tarefas, desligado por padrão, sem implantação. Nova execução conjunta passou
19/19 após recuperação do Storage local; tipos e lint próprios passaram.
Unidade 37 com regressão aprovada: metadados comuns para ordenar tarefas antigas/novas,
prévia local e aplicação/reversão transacional no laboratório. Paginação ainda
não ativada; regras de escrita direta e cobertura final permanecem abertas.
Unidade 36 validada em código: busca e filtros da rotina no servidor, com fuso e
preferências de visualização por usuário/empresa. Paginação/custo limitado ainda
não entregues; o leitor compatível continua percorrendo o conjunto acessível.
Unidade 35 implementada: atualização e gravação dos retornos na ficha/Agenda
com isolamento de contexto, prazo de resposta e preservação de rascunhos.
Contratos, tipagem e lint passaram; aceite visual permanece pendente.
Unidade 34 validada em código: fila vinculada à geração/revisão da origem e ao contexto
comercial; tentativa antiga não finaliza a tarefa nova nem reativa origem recriada.
Unidade 33 validada em código: recibos e histórico separados por identidade/geração,
para não ignorar edição ou recriação da origem nem colidir empresas.
Unidade 32 validada em código: identidade exata na observação/fila, sem recortar IDs
longos nem normalizar uma origem inválida para outro registro.
Unidade 31 validada em código: acesso direto à mensagem vinculada ao CRM,
separado do histórico, com conferência de geração e aviso de revisão alterada.
Unidade 30 validada em código: lista paginada de pendências e conferência humana
explícita na ficha do CRM, com autoria e validação das fontes/permissões atuais.
Aceite visual permanece pendente.
Unidade 29: pendências de leitura por mensagem preservadas mesmo após uma mensagem
nova conferida; regressão, lint e tipos finais passaram. Unidade 28
permanece com aceite visual pendente.
Unidade 27: áudio e imagem em arquivos fictícios lidos por modelos reais até o
CRM local; recebimento por canal real e aceite visual ainda pendentes.
Unidade 26 verificada localmente: extrator ligado ao observador contínuo, com prova real
textual no CRM local isolado.
Unidade 25 validada isoladamente: extrator semântico com evidência e avaliação real limitada.
Unidade 24 validada em código, com aceite visual pendente: revisão humana dos fatos comerciais diretamente no CRM.
Unidade 23 implementada e verificada em código, com aceite visual pendente: atualização automática da ficha aberta sem substituir
rascunhos ou aceitar resposta de outro cliente/usuário/empresa. Unidade 22
implementada localmente, com aceite visual/real pendente: interpretação de mídia → observação durável → campos
com origem → apresentação em CRM/Conversas. A unidade 21 permanece validada
apenas em seu escopo anterior, sem significar conclusão do CRM.
Próxima ação de produto: recuperação supervisionada da leitura automática e
validação do acesso à origem na interface; depois
piloto de recebimento real e seleção explícita da oportunidade. Validar ficha no navegador
quando o acesso local estiver habilitado (Work está com browser use desativado).
Ampliar avaliação semântica além dos cenários iniciais,
revisão/edição de fatos e vínculo explícito da oportunidade. Recuperação de
reuniões continua no backlog, sem precedência sobre esses itens.
Expiração SLA foi tornada atômica;
entrega/recuperação causal de notificações e paginação do worker continuam abertas.
O POST da Agenda já usa reserva comum. Efeitos tardios de conversão/aprendizado
e resumo ainda precisam de recuperação causal; recibo pending não é prova de execução.

### Unidade 42 — confirmação do registro salvo sem recarregar toda a janela

- POST activities/refresh lê até 100 IDs exatos e até 100 pais efetivos. A política
  atual, o módulo e o escopo da consulta são conferidos antes dos registros.
  Hash de escopo não concede autorização; não substitui a conferência do cliente
  atual. Não há tarefa, evento comercial, envio ou chamada de modelo nessa leitura.
- Ausente, fora da empresa/carteira ou fora do filtro retorna a mesma ausência
  genérica para o ID solicitado. Diagnósticos de quantidade de leitura ficam
  internos. Casos de revisão e correções seguem o mesmo contrato da página.
- A rotina usa o ID confirmado pela criação/edição/conclusão. Atualiza/remove
  apenas o registro verificado, preserva as outras linhas e a continuação, e
  não transforma falha de conferência posterior em pedido para criar de novo.
  Caminho compatível e ficha por cliente mantêm a atualização anterior.
- Registros confirmados nesta consulta ficam rastreados somente no navegador.
  Se saírem do prefixo de páginas por prazo/ordem, nova atualização os relê em
  lotes de até 100; não desaparecem silenciosamente nem permanecem por cache
  depois de perder acesso/deixar o filtro. Falha em um lote não publica metade
  da janela. IDs conhecidos após o commit podem ser recuperados na próxima leitura.
- Consulta atual tem precedência sobre callback antigo de salvamento. Busca
  pendente não ganha estado vazio falso. Conferência visual da corrida entre
  digitar busca/concluir e da preservação da posição continua no aceite local.
- Descoberta de novos resultados ainda percorre as páginas já visitadas. Ler
  somente IDs carregados esconderia alterações de outros registros; isso não
  foi ativado como substituto. Custo agregado/p95 e carteira de 10 mil continuam
  requisitos, sem conclusão de desempenho por este lote.
- Primeira regressão 69081: 38/38, TEST_EXIT=0 em 494,43s. Tipos 12510 e lint
  41890 passaram. Teste focal de leitura 65578: 1/1 em 13,49s, lendo como viewer
  e recusando PATCH sem alterar o registro; não é uma rodada de todos os perfis.
- Fonte final com recuperação de registros fora do prefixo: sessão 79469,
  TEST_EXIT=0, 42/42 em 70,17s. Tipagem 9033 e lint 16110 terminaram zero.
  Logs crm-activity-record-refresh-{final-tests,window-types,window-lint}.log.
  Captura de getAll verificou chamadas de 1 controle, 100 tarefas e 1 pai no
  caso esparso; não substitui medição de latência no volume final.
- Sonda HTTP inicial 6821 expirou no primeiro GET; servidor registrou 2,4min,
  com 2,3min de código de aplicação. Não atribuir toda a lentidão à compilação.
  Repetição 84564 passou; sonda final com revalidação fora do prefixo também
  HTTP_EXIT=0, sem escritas comerciais. Logs crm-activity-record-refresh-http*.
  Isso verifica API e função de reconciliação, não cliques/foco no navegador.
- Build 44067 terminou BUILD_EXIT=1: timeout do worker PostCSS em globals.css e
  erro 112 ao persistir cache. Relação causal não isolada. Cache medido em
  3.505.349.286 bytes; espaço livre observado 206.958.592 bytes. Duas tentativas
  de limpeza, geral e restrita à versão, bloqueadas por política; nenhum cache
  removido e nenhuma tentativa por outro mecanismo. Diagnóstico e retomada em
  CRM_BUILD_DIAGNOSTICO_2026-10-22.md. Prévia/emuladores preservados.
- Guard de espaço no launcher de revisão exige 6 GiB livres antes de iniciar
  compilador; execução real rejeitou o ambiente atual como esperado. Isso é
  validação do preflight, não build aprovado. Fonte da unidade 42 mudou após o
  início de 44067; nova compilação atual permanece obrigatória após liberar espaço.

### Unidade 41 — paginação e seleção na rotina do vendedor

- CommercialActivities usa paging=auto somente na rotina global. Antes do
  rollout, mantém contrato 1. Depois da ativação, falta da chave/configuração
  gera erro explícito, sem esconder a falha com uma varredura integral. Leitura
  por cliente e callback de próxima ação mantêm o contrato compatível anterior.
- A lista consome continuações, mantém páginas vazias consultáveis e identifica
  contagem como retornos carregados. Itens de revisão têm linguagem comercial
  e ação para abrir o cliente. Não há total da carteira fabricado.
- readActivityWindow prepara todas as páginas visitadas antes de substituir a
  janela, deduplica identidades, reconcilia revisão/correção e não altera dados
  anteriores quando falha. A atualização conserva âncoras visíveis quando ainda
  presentes; foco, celular, chegada tardia e posições extremas exigem aceite real.
  Atualizar muitas páginas visitadas ainda exige medição de custo/latência.
- ActivityLeadPicker busca sob demanda, separa seleção de busca e mantém opção
  escolhida fora da página atual. Resposta antiga/cancelada não troca opções do
  contexto novo. Escolha inclui título da negociação; cliente sem tarefa pode
  ser selecionado. O servidor continua conferindo autoridade na criação.
- DTO paginado agora retorna somente contexto dos clientes presentes na página,
  marcado leadsCoverage=page; não é usado como seletor completo. Nome do cliente
  vem do registro atual, em vez do nome em cache na tarefa.
- Testes 82718 terminaram TEST_EXIT=0: 29/29 em 46,62s, incluindo nove casos
  HTTP da paginação/admissão automática, oito do carregamento de janela e doze
  de cancelamento/timeout/continuidade. Tipagem 81694 e lint 4905 passaram.
  Fontes com o seed/launcher tiveram tipos 15873 e lint 14446 também aprovados.
- Ajuste posterior da Agenda mantém Retornos montados após a primeira visita,
  pausa consultas com a aba escondida e preserva rascunho/seleção/janela ao
  alternar Compromissos. Começar em Compromissos não monta Retornos. Tipagem
  própria 34042 e lint 96368 passaram, incluindo Agenda no projeto de testes.
- Rótulos mostram título da negociação também no modo compatível. Responsáveis
  assignedUserId/responsavelId são preservados na normalização e no DTO legado.
  Mapa de contexto evita procurar toda a carteira a cada cartão renderizado.
  Rodada final 68760: TEST_EXIT=0, 44/44 em 106,78s, incluindo os casos anteriores
  de atividades, paginação/admissão, janela, aliases e limites de requisição.
  Tipos 93975 e lint 68657 terminaram zero. Logs crm-activity-ui-integrated-*.
  Teardown de tarefas primitivas da fixture antiga passou a drená-las em conjunto;
  documentos com subcoleções mantêm exclusão recursiva no escopo fictício próprio.
- seed-crm-routine-preview.mts criou somente tenant/usuário fictícios próprios:
  qa_crm_routine_preview_20261022, 205 clientes e 42 tarefas. Conferência em
  transação do conjunto e índices precede a liberação de leitura dessa fixture.
  Casos de revisão são intencionais. Sessão 65497 terminou SEED_EXIT=0; não é
  migração, teste com clientes reais nem prova do agente de IA.
- Launcher QA passou a gerar chave de cursor efêmera, sem imprimir ou salvar
  segredo e sem carregar configuração real. Servidor anterior foi reiniciado
  apenas após conferir cadeia 9288→7560→12800; emuladores preservados. Novo
  servidor: sessão 39160, porta 3199, pronto em 33,7s; compilação da primeira API
  ainda em coleta. Primeira sonda HTTP 40584 terminou HTTP_EXIT=1 por timeout
  durante compilação inicial. Não repetir escrita sem recibo; a sonda não chegou
  ao marcador da primeira página e usa requestId estável para criação fictícia.
- CUA reconsultado: apps=[], browsers=[], erro de browser use desativado no Work.
  Sem conferência visual, navegação com usuário, teclado/celular ou aceite humano.
  Servir HTML ou passar testes de contrato não substitui esses critérios.
- Repetição HTTP 62468 terminou HTTP_EXIT=0 após compilar as rotas: primeiro
  contrato 2 com 20 itens/continuação, página seguinte, busca Acácia além dos
  primeiros 200 clientes, criação com requestId e conclusão do mesmo retorno.
  Agenda respondeu 200 com 38.394 bytes. Apenas fixture própria; nenhum canal,
  modelo ou cliente real. Seed criou 42 tarefas iniciais; a prova deixou um
  retorno fictício adicional concluído (43 ao todo antes de edição manual).
- Tempo frio inicial excedeu a primeira sonda; repetição registrou 7,2s na
  primeira API, dos quais 5,7s de compilação. Páginas seguintes sem compilação
  responderam em 642ms e 208ms no seletor. São amostras locais pequenas, não p95
  nem medição da carteira de 10 mil registros exigida pelo plano.
- Solicitada abertura do login local para Agenda no painel Codex; ferramenta
  retornou queued neste chat. Não declarar que a tela foi vista. Link e conta
  fictícia documentados em CRM_ROTINA_ACEITE_LOCAL.md. Build completo atual ainda
  pendente; a compilação de rotas de desenvolvimento não equivale ao build geral.
- Reexecução do seed em fixture existente preservou usuários, controle, clientes
  e tarefas: comparação de IDs/updateTimes antes/depois aprovada. Sessão 81683,
  PRESERVE_EXIT=0; 205 clientes e 43 tarefas, incluindo o retorno HTTP concluído.
  Nenhum reset da demonstração anterior ou dos dados editados.
- Build geral de revisão iniciado para a fonte desta unidade, sem outro build
  concorrente: sessão 44067, log crm-activity-ui-build-review.log. Configuração
  fictícia, serviços locais e pasta separada do QA. Terminou BUILD_EXIT=1 na
  unidade 42 (PostCSS/cache sem espaço), sem build aprovado. Não publicar esse
  artefato de laboratório como binário real.

### Unidade 40 — leitura paginada de retornos

- Preparado contrato 2 em GET activities, exclusivamente source=task com
  pageSize explícito de 1–50. Pedidos antigos continuam no contrato 1. Nenhum
  tenant real ou de demonstração principal foi habilitado. Protocolo de leitura,
  protocolo de escrita e revisão certificada da cobertura são exigidos juntos.
- Consulta lê no máximo 201 tarefas e resolve no máximo 200 oportunidades por
  pedido, sem varrer a coleção de clientes. Busca, dono e prazo podem resultar
  em página vazia com continuação; isso não vira "zero retornos". Contadores de
  trabalho ficam internos ao servidor, sem expor dimensão da carteira de terceiros.
- Ordem global da consulta: pendentes primeiro, prazo e ID. Usa chave de
  continuação, não offset. Cursor cifrado/autenticado vincula tenant, usuário,
  política, filtros, fuso, tamanho, revisão de cobertura e ordem; expira em dez
  minutos. Chave própria precisa ser configurada; não há segredo padrão.
- Cada página resolve oportunidade e autorização atuais. Dono antigo da tarefa
  não concede acesso; vínculo para outro tenant é descartado. Casos de revisão
  indexados não são escondidos pela consulta: retornam separados e impedem
  declarar fim limpo. Metadado de ordenação corrupto pode bloquear continuação.
- Consistência é live_keyset, não snapshot. Chegar ao fim retorna end_reached,
  nunca prova de varredura estática completa ou auditoria global. Novos itens
  anteriores à posição exigem atualizar. Frontend ainda precisa expor essa
  atualização, preservar contexto e consumir revisão/continuações corretamente.
- Dois índices sem filtro issue preparados no arquivo (seis índices de tarefas
  distintos conferidos por leitura JSON); nenhum índice implantado. Linhas sem
  índice continuam dependendo de backfill e cobertura certificada antes de
  habilitar, não são "recuperadas" por uma leitura parcial silenciosa.
- Testes HTTP com autenticação fictícia, orçamento de leitura, busca esparsa,
  carteira atual, cursor, revisão e compatibilidade em execução na sessão 87580.
  Fontes foram refinadas durante essa primeira coleta; conferir versão carregada
  e repetir a versão final após o término se necessário, sem ocultar resultado.
  Tipagem 13455/lint 71860 em coleta; logs crm-activity-page-{tests,types,lint}.log.
- Primeira coleta 87580 terminou TEST_EXIT=1: 6/7 em 351,53s. O caso de revogação
  usava status=inactive, fora do domínio active/blocked da política existente
  (tenant.ts:229); retornou 200 e a asserção de 403 falhou. Fixture corrigida
  para blocked, com restauração em finally; nenhuma autenticação/política alterada.
  Essa rodada carregou a versão inicial (sete testes), anterior aos refinamentos
  finais de cobertura, métricas e chegada tardia, portanto não prova essa versão.
- Primeira tipagem 13455 terminou TYPE_EXIT=2 por união inferida na tabela de
  parâmetros inválidos do teste. Tabela explicitada como Record<string,string>[];
  sessão 58926 terminou TYPE_EXIT=0. Fontes finais em nova regressão sequencial
  com a suíte de atividades compatíveis: sessão 73833, log
  crm-activity-page-final-tests.log. Não somar rodadas nem antecipar seu resultado.
- Seletor paginado com clientes sem tarefa, integração visual, custo por carteira
  e aceite visual permanecem obrigatórios. Este backend não conclui a rotina.
- Build 66032 foi encerrado deliberadamente depois das alterações de fonte das
  unidades 39/40, por não representar mais uma validação do código atual e manter
  consumo de memória enquanto outros checks executavam. Identidade verificada:
  node 11664 executava next build, filho 13280 do script build-crm-review.mjs;
  somente esse processo de compilação foi encerrado. Não foi reiniciado por
  timeout de observação. Não existe build geral aprovado deste lote; preparar
  nova compilação da fonte final após concluir os checks. QA e emuladores mantidos.
- Rodada final 73833 terminou TEST_EXIT=1: 8/22 passaram em 210,85s. Os oito
  casos novos de paginação passaram, incluindo chegada tardia e bloqueio real.
  Os 14 casos antigos compartilharam falha de preparação: gravação no Firestore
  local excedeu 60,010s (DEADLINE_EXCEEDED, 127.0.0.1:8080). Não equivale a 22
  testes verdes nem a prova de regressão funcional. Nova execução sequencial
  da suíte antiga com o seletor foi iniciada somente após esse término.
- Lint 71860 terminou LINT_EXIT=0. A versão com seletor e fontes finais tem
  verificações próprias em crm-activity-picker-{compat-tests,types,lint}.log.

### Consulta do seletor de cliente (continuação da unidade 40)

- GET activities/clients e activity-lead-page.ts consultam leads diretamente,
  sem depender de tarefas prévias. Leitura de até 201 clientes por pedido, até
  50 opções úteis, busca com acentos normalizados por nome/empresa/contato/título.
  Página vazia pode continuar; não é resultado final zero. Título de oportunidade
  é preservado na opção para não depender apenas do nome da pessoa.
- Política atual da carteira conferida em cada página; cursor com finalidade
  distinta do cursor de tarefas, vinculado a usuário/empresa/política/busca/tamanho.
  Sem contar carteiras alheias, sem escrita comercial, sem ativar protocolos.
- Fixture HTTP prepara 205 clientes, incluindo cliente sem tarefa, e verifica
  busca distante, título, carteira transferida, bloqueio e parâmetros inválidos.
  Execução 23769 terminou TEST_EXIT=0: 18/18 em 487,64s, incluindo os 14 casos
  de atividades e os quatro do seletor. Log crm-activity-picker-compat-tests.log.
  A execução anterior com deadline na preparação permanece como falha; não
  substituir o histórico nem somar os oito casos da outra rodada como 26/26.
  Tipagem inicial 61294 e tipagem da fonte final 78855 terminaram TYPE_EXIT=0;
  lint 68626 terminou LINT_EXIT=0. Logs crm-activity-picker-{types-final,lint}.log.
  Os casos do seletor carregaram a fonte final, incluindo conferência de
  assignedUserId legado no DTO. Diff check passou com aviso LF/CRLF no JSON de
  índices. Não anunciar fluxo de formulário pronto ou aceite visual.

### Unidade 39 — tarefas restauradas e estados inválidos

- Restauração recalcula crmTaskIndex para lead_tasks sem mudar título, prazo,
  estado, versão comercial ou responsável. Mantém a marca restoredAt do
  comportamento de restauração; metadado ausente/antigo não é verdade comercial.
- Retomada aceita tanto cópia já restaurada com o índice atual quanto cópia
  exata do escritor anterior com restoredAt. Edição comercial ou metadado
  arbitrário divergente continuam exigindo conciliação, sem sobrescrever o ativo.
- Construtor do índice deixa de aceitar null/false/0/texto vazio como estado
  válido. A normalização visual compatível permanece; índice sinaliza revisão
  em vez de declarar que o dado malformado foi verificado.
- Testes novos exercitam exclusão/restauração reais no emulador, falta/obsolescência
  do índice, prazo ausente/inválido, estados inválidos, cópia da versão anterior,
  correção humana e perda de confirmação com retomada. Sessão 2602 terminou
  TEST_EXIT=0: 11/11 em 250,71s, incluindo quatro casos novos, três testes puros
  e quatro de preparação da lixeira. Log crm-task-index-restoration-tests.log.
  Tipagem 15581 terminou TYPE_EXIT=0 com o arquivo novo incluído no projeto.
  Lint próprio 60818 terminou LINT_EXIT=0, log crm-task-index-restoration-lint.log.
- Alterações posteriores ao início do build 66032: esse build não comprova a
  compilação deste lote. Aguardar seu resultado antes de planejar uma nova
  compilação; não executar builds concorrentes nem desligar o preview.

### Unidade 38 — contrato optativo de escrita das tarefas

- `firestore.rules` exige índice coerente para novas tarefas apenas quando o
  protocolo do tenant está habilitado. Não concede novas permissões. Contrato
  anterior preservado quando o controle está ausente ou desligado; nenhuma
  ativação, migração ou publicação executada.
- Estado/prazo/índice devem mudar no mesmo commit. Preservados casos antigos de
  edição não relacionada e prazo textual previamente indexado pelo servidor.
  Controle usa getAfter para considerar ativação no mesmo lote. Cliente comum
  não altera o protocolo; Admin SDK continua exigindo auditoria própria.
- Testes específicos: sessão 87778, TEST_EXIT=0, 11/11 em 36,02s; log
  .qa-artifacts/crm-task-index-rules-final-tests.log. Cobrem compatibilidade,
  adulteração de índice, revisão de prazo/estado, permissões, isolamento,
  ativação atômica e rollback do lote rejeitado.
- Primeira regressão conjunta: sessão 18469, TEST_EXIT=1, 17/18; Storage falhou
  com retry-limit-exceeded e status zero. Sonda TCP posterior confirmou ausência
  do serviço 9199, não uma rejeição de regra. Não contar essa execução como verde.
  Auth 9099 também estava ausente; Firestore 8080 e aplicativo 3199 permaneceram
  disponíveis. Recuperação local em andamento, sem encerrar esses dois serviços.
- Storage de teste precisa usar o projeto fictício demo-altum-rules; o aplicativo
  usa demo-altum-qa-lab. Recuperação prepara instâncias separadas, com diretório
  temporário próprio, para não misturar permissões nem apagar arquivos de outra
  instância. Nova regressão sessão 65061 terminou TEST_EXIT=0: 19/19 em 89,89s,
  incluindo o caso de Storage; log crm-task-index-rules-compat-retest.log.
  A primeira execução com falha permanece registrada, não foi substituída.
- Auth fictício recuperado sem reseed do CRM: somente usuário original ausente,
  mesmo UID e projeto demo. Sessão 62739 terminou AUTH_EXIT=0; registros e
  alterações da demonstração preservados. TCP confirmou 9099/9199/9201 ativos.
  Uma tentativa adicional de Storage 9199, sessão 18390, terminou com EADDRINUSE;
  não encerrou nem substituiu o processo existente, identificado como instância
  demo-altum-qa-lab. Não é evidência de aceite visual nem de modelo real.
- As sessões originais de tipos/lint perderam seus resultados finais na coleta.
  Logs vazios não foram tratados como sucesso. Inspeção de processos confirmou
  ausência desses executores antes de iniciar verificações novas, com marcador
  de saída persistido em crm-task-index-rules-{types,lint}-verified.log.
  Sessão 28318 terminou TYPE_EXIT=0; não comprova a versão posterior completa
  da unidade 39, cuja tipagem própria passou na sessão 15581. Lint 58891 terminou
  LINT_EXIT=0. O lint posterior da unidade 39 tem sessão independente, 60818.
- Auditoria de restauração encontrou restoredDocument em tenant-data-deletion.ts
  copiando os campos arquivados de lead_tasks, inclusive índice anterior ausente
  ou obsoleto. Esse escritor ainda impede declarar cobertura indexada completa;
  correção e prova de compatibilidade permanecem na próxima entrega.
- Compilação geral da unidade 37: sessão 66032 reconsultada e confirmada ativa,
  ainda na etapa de compilação. Sem resultado final e sem aceite visual.

### Unidade 37 — preparação compatível da paginação e migração de retornos

- Inventariados produtores de tarefas manuais, agente, observador, CRM legado,
  automações, social, ecommerce, rascunho MCP e ligação. Criação recebe metadados
  de ordenação no mesmo registro/commit. Edição manual recomputa com dado atual;
  conclusão ecommerce usa transação e valida empresa/cliente antes de atualizar.
  Sem terceira coleção de tarefas, alteração de títulos/prazos ou mudança do leitor.
- Índice usa estado normalizado, pendência primeiro e prazo numérico; tarefa sem
  prazo continua sem dueAt inventado. Data/estado inválidos geram pendência de
  revisão. Quatro índices de consulta preparados no arquivo, sem implantação;
  JSON foi lido e conferido localmente (quatro configurações distintas).
- Serviço local de prévia/aplicação/reversão usa geração, revisão e fingerprint
  de todos os campos comerciais. Só altera metadado derivado; preserva versão e
  updatedAt comercial. Auditoria idempotente; rollback exige origem e conteúdo
  atuais e restaura exatamente campo ausente/null/valor anterior. Recusa empresa
  real, projeto não demo e endpoint não local. Não é executor de migração real.
- CLI preview-crm-task-index.mts só prepara arquivo revisável e não sobrescreve
  saída existente. Não contém ação de aplicar/implantar. Página final iniciada
  após cursor não é prova de cobertura global. Relatório não copia títulos ou
  mensagens; artefato/protocolo descritos em CRM_ATIVIDADES_PAGINACAO.md.
- Primeira tipagem 72495 terminou 2 por dois acessos a projectId não expostos pelo
  tipo público Firestore. Corrigido usando configuração pública da app e isEqual
  público nas referências; referência externa não suportada vira revisão.
  Lint inicial 76977 passou. Regressão 19623 terminou TEST_EXIT=0: 139/139 em
  463,62s, incluindo migração/reversão, comando real de prévia e integrações com
  transportes/modelos simulados. Tipos finais 90478 e lint final 66888 passaram.
  Caso extra de empresa/plano divergente entrou na regressão antes de carregar
  sua suíte e passou; tipos de release 38898 e lint do pacote 48999 passaram.
  Diff check passou com avisos LF/CRLF. Nenhuma validação pendente é tratada como aprovada.
- Preparado build-crm-review.mjs: preserva o servidor QA em sua pasta própria,
  sombreia variáveis de .env sem imprimir valores e usa projeto fictício/serviços
  locais no build completo padrão. Resultado não é artefato de implantação.
  Checagens do pacote aprovadas; build completo iniciado após elas. Resultado em
  .qa-artifacts/crm-task-index-build-review.log, sessão 66032, encerrada deliberadamente
  na unidade 40 por fonte desatualizada; BUILD_EXIT=-1, não aprovado. Não equivale a
  publicação, teste de canal real ou conferência visual.
- Inspeção do config de release encontrou inclusão de .qa-artifacts (backups de
  páginas/config e tipos do servidor QA). Adicionado apenas esse diretório ao
  exclude do build de release, mantendo a checagem do código real. Guia local do
  Next sobre typescript/tsconfigPath foi lido. Primeira verificação de seleção
  falhou por procurar app/admin/page.tsx, que não existe; conferência corrigida
  para enumerar os arquivos administrativos reais, sem mudar nem excluir admin:
  seleção confirmou zero arquivos QA, 43 fontes administrativas retidas e CRM
  retido. Isso verifica a seleção, não antecipa o resultado da compilação em curso.
- Leitor atual ainda percorre todas as páginas. Regras Firestore permitem escrita
  direta sem garantir metadados; restauração e executores genéricos/antigos ainda
  exigem cobertura. Não habilitar leitura indexada para excluir legado, não usar
  preview como declaração de prontidão e não declarar redução de custo concluída.
  Sem publicação, dados reais, autenticação/admin ou regras alterados nesta unidade.

### Unidade 36 — busca e filtros da rotina do vendedor

- Agenda de retornos ganha busca por tarefa/cliente, estado, meus retornos/carteira
  acessível e prazo (todos/atrasados/hoje/sem prazo). Consulta aplica filtros no
  servidor depois das verificações existentes de empresa e carteira. Busca ignora
  acentos; parâmetros inválidos retornam 400, sem virar consulta mais ampla.
- Responsável legado é normalizado pelo contrato comum; não confundir dono da
  oportunidade com dono explícito diferente da tarefa. Hoje usa o calendário do
  fuso enviado pelo navegador; atrasados/hoje não incluem retorno concluído.
  Sem prazo continua sem data inventada.
- Escolhas de estado/responsável/prazo são salvas separadamente por usuário/empresa.
  Texto de busca não é persistido. Contagem na Agenda descreve o filtro atual.
  Busca tem debounce de 300ms; filtros ficam protegidos enquanto há formulário ou
  gravação. Ciclo da leitura separado do ciclo do contexto para não abortar
  gravação por uma mudança de consulta. Ficha mantém próxima ação não filtrada.
  Resultado só aparece sob a consulta que efetivamente o produziu; erro ao trocar
  busca não reaproveita a lista anterior como se correspondesse ao filtro novo,
  nem apresenta falta de resultado de carregamento como zero confirmado.
- Compatibilidade: chamadas sem filtros continuam retornando os mesmos estados e
  fontes. Seletor de cliente continua incluindo registros sem tarefa prévia.
  Nenhuma nova coleção ou migração real. Contrato documentado em CRM_CONTRATOS_DADOS.
- Testes novos: limites do calendário local/UTC, prazo ausente, concluídos, dono
  legado, acentos, validação e preferências; emulador com 430 tarefas para buscar
  depois do limite antigo, sem expor carteira alheia nem tarefa de outro responsável.
  Execução 16536 terminou TEST_EXIT=0, 32/32 em 512,93s. Duração inclui o runner,
  preparação e limpeza; não é medida de latência de produção. Tipos 85654 e lint
  41151 passaram. Depois da proteção contra resultado de outra consulta, tipos
  finais 39346 e lint final 5327 passaram. Diff check passou. Nenhum processo
  desta unidade permanece pendente. Logs em
  .qa-artifacts/crm-routine-filters-{tests,types-final,lint-final}.log.
- Limite explícito: filtros atuais ainda leem todas as páginas antes de filtrar e
  ordenar globalmente. Não houve redução comprovada de custo/tempo nem paginação
  de servidor. Próxima etapa deve entregar isso mantendo ordem, legado, vínculo e
  autorização atuais; não excluir tarefas antigas para obter consulta mais simples.
  Aceite visual/canais reais e restante do plano integral permanecem abertos.

### Unidade 35 — continuidade dos retornos na ficha e na Agenda

- Confirmado no código atual que ficha e Agenda já usam CommercialActivities e
  os mesmos lead_tasks. Esta unidade aprimora a experiência existente, sem criar
  outra coleção nem declarar integração nova que já havia sido entregue.
- Componentes remontam quando empresa, usuário, cliente ou permissões mudam;
  carregamentos usam o gerenciador comum de contexto e cancelamento. Resposta
  antiga não substitui a leitura nova; 401/403/404 limpa dados e poder de edição.
  Compromissos da Agenda também descartam carregamento antigo e limitam espera.
- Retornos atualizam em foco/visibilidade e a cada 20 segundos na tela visível,
  pausando atualização de fundo durante formulário aberto ou gravação. Atualizar
  manualmente não substitui o rascunho. Edição de item distante traz formulário
  à área visível. Validação com teclado/celular ainda precisa ser executada.
- Escrita tem trava síncrona contra duplo acionamento e limite de 15 segundos
  abrangendo autenticação, resposta e JSON. Criação mantém requestId ao repetir
  o mesmo pedido incerto. Compromissos mantêm a mesma proteção. Ao sair, resultado
  antigo não inicia atualização da ficha de outro contexto. Saída do contexto
  cancela também a requisição de escrita ainda pendente; cancelamento não é
  tratado como prova de reversão de um commit que já ocorreu. Troca apenas da
  aba Retornos/Compromissos cancela leitura, sem abortar a gravação em andamento.
- Erro de callback de atualização após commit não converte sucesso em “falha ao
  salvar”; informa que o retorno foi salvo e que a ficha precisa ser atualizada.
  Erro/revisão concorrente preserva rascunho; cancelamento/reabertura continuam
  no contrato anterior e não recriam tarefa.
- Agenda em Retornos deixa de buscar compromissos/clientes da outra aba sem uso.
  Selecionar Compromissos inicia a leitura correspondente; rotas antigas mantidas.
- Verificação 84020 terminou TEST_EXIT=0: 24/24 em 40,37s (atividades no emulador,
  gerenciador de leituras e limite de espera/JSON). Prova contratos e controles
  compartilhados; não é teste interativo dos componentes. Tipos 58377 e 47940
  passaram, lint inicial 42384 passou. Tipos 73873 e lint 1059 passaram para os
  ajustes de formulário/carregamento por aba. Tipos 18362 e lint 42180 passaram
  para o cancelamento de escrita. Após separar os ciclos da tela e da aba,
  tipos finais 98795 e lint final 98271 terminaram zero. Logs finais:
  .qa-artifacts/crm-routine-refresh-{types,lint}-verified.log. Diff check passou
  com aviso LF/CRLF. Nenhum processo de verificação deste lote pendente; sem
  build completo atualizado ou alteração de contrato de backend nesta unidade.
- Roteiro revisável: CRM_ROTINA_ACEITE_LOCAL.md. Não executado visualmente porque
  browser use está desativado no Work; nenhuma tentativa de contornar o bloqueio.
- Ainda abertos: busca/filtros salvos e paginação no servidor, desempenho de
  carteiras grandes, transferência de carteira/atividades e aceite de uso do
  plano completo. O endpoint ainda lê todas as páginas acessíveis; a paginação
  visual atual não resolve esse custo. Sem backend/admin/auth alterados neste lote.

### Unidade 34 — origem e tentativa vinculadas ao processamento automático

- Produtor lê mensagem, conversa e vínculo comercial dentro da mesma transação
  que prepara a tarefa. Fila guarda geração/revisão da mensagem, geração da
  conversa e hash do cliente/contato e suas gerações. ID estável da tarefa é
  preservado. Recriação ou mudança de contexto vai para awaiting_context;
  não é readmitida automaticamente como se fosse a origem antiga.
- Edição da mesma ocorrência pode ser readmitida pelo produtor, inclusive após
  conclusão. Worker antigo perde sua concessão e retorna skipped sem finalizar
  a versão nova. Mesmo sem outro produtor, mudança da origem durante análise
  impede conclusão e deixa awaiting_context. Observador verifica vínculo antes
  do modelo e antes da gravação; conclusão do recibo também exige token da
  tentativa que gravou os fatos. Isso não substitui recuperação supervisionada.
- Recebimento da conversa prepara a observação mesmo se a tarefa de resposta já
  existir. Worker de resposta tardio usa createTime persistido da própria tarefa
  como limite; não cria observação para mensagem/contexto nascidos depois ou
  mensagem revisada depois, nem chama o agente por essa tarefa obsoleta.
- Interpretação de mídia e reabertura continuam atômicas. Revisão ainda não
  conhecida no commit usa marcador null, aceito somente com token exato e prova
  atual do arquivo. Worker resolve a revisão atual antes de observar. Fonte ou
  token divergentes exigem contexto; sem chamada paga adicional nesse caminho.
- Tarefa legada sem binding só pode ser adotada com vínculo explícito da mensagem
  ao cliente e prova temporal persistida. Binding moderno inválido/null não pode
  cair no caminho de compatibilidade. Dados legados não são apagados/migrados.
- Primeira verificação: 44326 TEST_EXIT=0, 33/33 em 83,19s; tipos 96183 e lint
  21811 terminaram zero. Novos cenários de contato, mídia e fila de resposta
  adicionados depois. Tipos finais 29393 e lint 25660 passaram para essas
  alterações. Não contar a primeira rodada como validação dos casos posteriores.
- Regressão ampliada 49996 terminou TEST_EXIT=1: 72 passaram e sete falharam em
  217,30s. Os sete são seis casos e o hook/arquivo da suíte legada, todos por
  ausência de credenciais padrão: o bootstrap dependia do ambiente externo do
  emulador. Demais casos, incluindo os novos e a saída humana até worker/CRM com
  transporte Meta simulado, passaram. Não é prova de canal real.
- Suíte legada agora fixa projeto demo, endpoint local e credenciais vazias antes
  dos imports. Reteste 81290 terminou TEST_EXIT=0, 6/6 em 14,95s, incluindo vinte
  enfileiramentos concorrentes, repetição sem histórico extra, mensagens humanas
  e IA, concessão vencida, reprocessamento auditado e reconciliação. Lint dessa
  correção 73553 passou. Logs de falha e reteste preservados separadamente em
  .qa-artifacts/crm-source-binding-{regression,bootstrap-retest}.log. Não apresentar
  como uma única rodada integral verde. Nenhum processo desta unidade pendente.
- Diff check passou com avisos LF/CRLF. Sem build completo atualizado, aceite
  visual ou chamadas novas a modelos reais nesta unidade; respostas externas
  dos testes são simuladas. Custos/limites e avaliação real continuam pendentes.
- Ainda abertos: recuperação supervisionada para contexto/generation alterados,
  escolha explícita de oportunidade e limites de histórico, admissão/custo
  multimodal unificados, conferência visual, canais reais, rotina do vendedor e
  Agenda, gestão conciliável e pacote de migração/publicação do plano integral.
  Sem publicação nem alterações em dados reais nesta unidade.

### Unidade 33 — recibos sem colisão e histórico das versões observadas

- Recibo v2 usa composição estruturada/hash de empresa, conversa, cliente,
  mensagem e gerações de mensagem/conversa/cliente/contato. Não usa concatenação
  ambígua tenant_message. Identidade registrada e validada em cada atualização;
  recibo canônico com identidade divergente é recusado, sem sobrescrever o dado.
- Cache exige também revisão exata da mensagem. Edição do texto é observada
  novamente; cada revisão tem evento próprio, sem substituir a versão anterior.
  Repetição da mesma revisão não duplica evento. Logs também usam identidade v2.
  Mesma informação com fonte recriada atualiza prova; correção humana permanece
  protegida. Recibos/eventos legados são mantidos como histórico, sem confiar
  neles como prova de leitura da geração atual. Sem migração real ou remoção.
- Leitores internos que fixavam ID legado em testes passam a consultar identidade
  comercial. Contrato determinístico agora verifica colisão de separadores,
  recriação e revisão por comportamento, sem depender do texto do ID no código.
- Primeira suíte 20148 terminou TEST_EXIT=1, 38/40 em 254,07s. Duas expectativas
  antigas de contagem foram corrigidas: bruto + interpretação conservam duas
  revisões, e eventos de mudança de etapa não são contados como observações.
  Replay continua sem evento extra. Log original preservado.
- Regressão ampliada 68797 terminou TEST_EXIT=1: 55/61. Os 40 casos do núcleo
  passaram; seis falhas ficaram nas suítes antigas de observador/WhatsApp:
  contagem de todos os eventos como uma observação (quatro casos), canal Meta
  fictício não cadastrado e confirmação fictícia sem conversa existente.
  Cenários corrigidos para cadastrar seus recursos, distinguir observação de
  outros eventos e exigir que o histórico inteiro não cresça no replay. Guardas
  de acesso/manifesto permanecem. Confirmação em conversa removida ganhou recusa
  explícita no teste. Sem alteração do serviço de confirmação de mensagens.
- Tipos 69392 e lint 86142 passaram. Reteste de compatibilidade 62657 terminou 0,
  21/21 em 143,15s; tipos finais 53643 e lint 71943 terminaram 0. Os 40 casos
  inalterados do núcleo passaram na rodada ampliada; os 21 de compatibilidade
  foram revalidados após corrigir seus cenários. Não apresentar como uma única
  execução 61/61: os logs das falhas anteriores foram mantidos. Sem checagens
  pendentes do lote; diff check passou com aviso LF/CRLF.
- Próxima etapa obrigatória: ligar geração/revisão ao ciclo da fila, impedir
  reaproveitamento de job antigo para origem recriada e preparar recuperação
  supervisionada/limite de custo multimodal. Recibo correto no observador não
  conclui essas garantias no caminho inteiro. Navegador/canal real ainda pendentes.

### Unidade 32 — identidade exata antes de observar ou recuperar uma conversa

- Auditoria do caminho de recuperação encontrou messageId recortado a 240 no
  observador, criação de job e consumo pelo worker, apesar de API/links aceitarem
  300. Validador comum agora preserva o ID inteiro; rejeita excesso, espaços nas
  extremidades, controle, pontos reservados e caminhos. Texto visível continua
  usando limpeza normal; identidade não usa limpeza de texto.
- Worker põe job com identidade inválida em dead letter antes de consultar fonte,
  gravar cliente ou chamar modelo. Reprocessamento manual não reativa identidade
  inválida. Reconciliação/saúde por empresa validam tenant exato; reconciliação
  conserva chat/message IDs reais. Sem alteração de admin/auth/produção.
- Casos novos passaram: duas mensagens de 300 caracteres com mesmo prefixo de
  240, job/recibo distintos e origem completa; entrada inválida e job legado
  malformado sem chamada paga nem escrita no cliente. Tipos 93135 e lint 47404
  terminaram 0. Suíte 44318 terminou 0, 33/33 em 305,10s. Sem checagens pendentes
  desse lote. Logs crm-observer-identity-* em .qa-artifacts.
- Próxima integridade obrigatória antes de ampliar recuperação: recibo atual
  crm_conversation_observations concatena tenantId_messageId, sem separador
  inequívoco/geração. Fila não distingue recriação da origem. Tornar esses IDs
  canônicos mantendo histórico/compatibilidade e testar colisão/recriação.
  Também falta admissão/contabilidade unificada das chamadas multimodais antes
  de oferecer nova tentativa paga. Não habilitar repetição cega do modelo.

### Unidade 31 — chegar à mensagem que originou um registro comercial

- Links de aviso, evidência por campo e interpretação de mídia passam a incluir
  a mensagem exata, com geração/revisão quando registradas. Observador grava esses
  identificadores a partir dos snapshots de origem validados na transação; não
  aceita geração inventada pelo modelo. Links antigos somente de conversa continuam.
- Conversas abre a mensagem referenciada em bloco separado acima do histórico,
  usando a mesma bolha, imagem, áudio e documento existentes. Consulta protegida
  por ID reaproveitada; não injeta fonte antiga no histórico nem altera seus
  cursores, dando falsa continuidade entre páginas. Sem envio/reação/reenvio no bloco.
- Consulta de mensagens inclui geração da fonte. Mensagem recriada é recusada
  como fonte antiga; revisão posterior aparece com aviso explícito antes do
  conteúdo atual. Data completa visível, erro/repetição/fechar disponíveis.
  Componente chaveado por empresa/usuário/conversa/mensagem/geração/revisão;
  resposta após desmontagem não publica conteúdo em outro contexto.
- Primeira regressão 66321 terminou 0, 22/22; tipos 61259 e lint 91531 terminaram
  0. Teste HTTP com autenticação real do emulador busca origem anterior a outras
  220 mensagens por ID, valida geração e recusa origem de outra conversa/recriada.
  Regressão ampliada 14867 terminou: wrapper 0, TEST_EXIT=1, 43/44 passaram;
  erro restante ABORTED / Transaction lock timeout no emulador durante teste de
  anexo alterado/recriado, sem falha de asserção. Log preservado em
  .qa-artifacts/crm-source-message-final-tests.log. Reexecução 51610 com arquivos
  em sequência, mantendo concorrência interna dos testes; o caso anteriormente
  interrompido passou nessa repetição (1,76s). Tipos finais 90547 terminou 0;
  lint 49437 terminou 0. Suíte 51610 terminou 0, 44/44 em 310,59s.
  Timeout da execução paralela permanece registrado; desempenho sob contenção
  e aceite concorrente do aplicativo completo continuam abertos. Não houve
  mudança no produto para mascarar esse erro.
- Revisão de compatibilidade encontrou IDs maiores que 180 caracteres: acesso
  à origem e conferência agora aceitam até 300, igual à API de mensagens. Teste
  adicional 25809 terminou 0, 10/10 em 203,18s, com ID de 240 caracteres no
  caminho HTTP/lista e limite de 300 no resolvedor. Tipos/lint finais do ajuste
  28280/53906 terminaram 0. Sem checagens pendentes da unidade 31.
- Sem browser habilitado no Work: layout, reprodução no bloco e troca de
  contexto ainda exigem aceite visual. Novas evidências recebem geração/revisão;
  evidência antiga sem esses metadados abre a mensagem atual, sem provar a versão
  histórica. Não houve backfill real, modelo pago, publicação ou dados reais.

### Unidade 30 — lista e conferência humana de pendências no CRM

- Novo GET/PATCH read-issues na ficha: lista lotes de 20 origens, com data/tipo,
  motivo e link para conversa. Cursor avança sobre os documentos examinados,
  sem prometer cobertura integral no primeiro lote. Somente fontes atualmente
  acessíveis são retornadas; a contagem do dossiê pode incluir outras origens.
- Conferência exige capacidade edit_leads, módulo CRM, acesso atual ao cliente,
  à conversa e ao canal (inclusive dono atual do canal pessoal), vínculo da
  mensagem e geração da fonte. Commit valida revisão da pendência/mensagem e
  geração do cliente/conversa/canal; formulário anterior à recriação é rejeitado.
- Humano deve confirmar que conferiu a origem e registrar observação obrigatória.
  Fecha apenas aquela pendência e cria evento com autoria. Não altera fatos nem
  afirma leitura bem-sucedida pela IA: correções usam o editor comercial existente.
  Mesmo resultado automático repetido não reabre origem já conferida; mudança
  posterior da mensagem permite nova pendência. Anotações humanas são preservadas.
- Interface desktop/mobile na ficha, chaveada por empresa/usuário/cliente;
  resposta atrasada não atualiza outro contexto. Lista só aparece sob demanda
  quando há aviso, com próxima página, atualização, erro e formulário explícito.
  Índice de scope/resolved preparado em firestore.indexes.json, sem publicação.
- Primeira regressão 42114 terminou 0, 39/39; lint 90281 terminou 0. Tipos 58346
  identificou perda de estreitamento de input.note dentro da transação, corrigida
  capturando nota validada antes do callback. Regressão final 90027 terminou 0,
  40/40 em 56,46s, incluindo rejeição de revisão anterior à recriação do
  cliente/conversa. Tipos 23474 e lint 38029 terminaram 0. Índice JSON validado
  sem duplicação desta coleção; diff check passou com avisos LF/CRLF.
  Nenhum processo de validação pendente deste lote.
- Limites: navegador desativado no Work; sem aceite visual, canal real ou build
  integral atual. Link abre a conversa; ainda falta navegar diretamente à mensagem
  antiga. Origem removida/inacessível não pode ser conferida por esta ação; revisão
  administrativa e recuperação supervisionada permanecem abertas. Aviso legado
  anterior ao ledger só entra na lista após atualização do observador. Sem modelo
  pago, produção ou migração real neste lote.

### Unidade 29 — pendências por origem, sem desaparecer com a próxima mensagem

- Pendências persistidas na subcoleção commercial_read_issues de cada cliente,
  identificadas por conversa, mensagem e geração da fonte. Projeção no cliente
  mantém contagem e uma origem pendente, sem acumular todo o histórico no documento.
  Mesma transação atualiza origem e contagem, após validar autoridade e fonte.
- Mensagem conferida resolve só sua própria origem. Texto novo não remove aviso
  de mídia anterior; falha tardia fica pendente sem substituir o registro da última
  mensagem processada. Aviso anterior à mudança é preservado na primeira atualização.
- CRM e Conversas usam a pendência persistente e mostram contagem quando há mais
  de uma. Subcoleção sem acesso direto pelo cliente conforme regra padrão existente.
- Primeira regressão 96041 terminou 0, 31/31. Inclui dois áudios pendentes,
  texto posterior, repetição sem duplicar e interpretação individual até zerar.
  Regressão 38948 terminou 0, 32/32, incluindo concorrência e aviso legado.
  Regressão 55984 terminou 0, 33/33, incluindo excluir/restaurar o cliente com
  todas as origens pendentes. Tipos 19773 e lint 49049 terminaram 0 antes da
  última ampliação. Regressão final 76842 terminou 0, 34/34 em 48,92s, incluindo
  isolamento de geração. Lint final 24630 e tipos 91020 terminaram 0.
  Sem processos de validação pendentes deste lote. Diff check passou com avisos
  de normalização LF/CRLF, sem erro de espaço.
- Lixeira inclui a subcoleção no manifesto, guarda de concorrência, remoção e
  restauração. Escopo de geração impede que filhos órfãos de uma exclusão antiga
  sejam apresentados a um novo cliente que reutilize o mesmo ID; restauração
  completa mantém o escopo do dossiê recuperado. Não altera a rota legada de exclusão.
- Sem chamada paga, dados reais, publicação ou inspeção visual. Falta listagem
  de todas as origens com navegação à mensagem e revisão humana explícita; esta
  unidade não afirma recuperação operacional completa. A navegação atual abre
  a conversa. Arquivos apagados/recriados exigem revisão de suas pendências antigas.
- Tipos da unidade 28: handle 18990 não existe mais e log está vazio, sem marcador
  de saída; não atribuir sucesso. Novo check desta unidade valida o estado atual.

### Unidade 28 — leitura incompleta visível para quem atende (aceite visual pendente)

- Nova projeção aiCommercialReadState identifica a última mensagem processada,
  com conversa, instante e ordem da criação até nanossegundos. Estado gravado
  junto aos fatos, sob a mesma cerca da conversa. Erro semântico registra aviso
  separado com cerca, módulos CRM/IA e situação comercial atual; não pode alterar
  cliente com CRM desativado. Resultado de mensagem mais antiga não substitui
  leitura de mensagem mais nova, mesmo em empate no milissegundo.
- Classifica mídia não interpretada, erro de mídia, análise limitada, revisão
  necessária ou conferência concluída. Conferência não afirma que todo o histórico
  foi lido nem que todos os fatos são verdadeiros; também existe leitura por regras
  quando modelo não está habilitado. Não há cartão extra para conferência normal.
- CRM desktop/mobile e Conversas mostram só aviso relevante, com linguagem humana
  e acesso à conversa; detalhes de provider, fila e erro bruto não são exibidos.
  DTO da conversa inclui o estado. Formulário de correção comercial permanece
  disponível conforme permissões. Transcrição posterior válida pode retirar aviso.
- Testes 59142 terminou 0, 27/27; 36904 terminou 0, 29/29; final 22317 terminou 0,
  30/30 em 30,92s. Cobrem mensagem sem interpretação, mídia com erro preservando
  dado manual, fala interpretada, erro semântico visível, falha antiga depois de
  mensagem nova, limite, módulo desativado sem qualquer escrita no cliente,
  estados inválidos, link codificado e guarda de ordem sub-milissegundo.
- Tipos iniciais 80586/84033 e lints 56122/47086 passaram. Lint final 2975 passou;
  tipos 76027 terminou 1 por duas assinaturas em social-event-occurrence.ts,
  dependência não editada neste lote. Inspeção posterior encontrou as duas
  chamadas já corrigidas no arquivo atual do workspace (argumentos explícitos).
  Repetição de tipos em andamento; não atribuir essas correções a esta unidade
  nem reverter trabalho compartilhado. Diff check passou com aviso LF/CRLF.
- Não houve chamada paga, alteração de produção ou inspeção visual neste lote.
  Navegador permanece desativado no Work conforme constatação da unidade 27.
- Limite importante: esta projeção é da última mensagem processada. Não é uma
  lista persistente de todas as mídias problemáticas: mensagem nova conferida
  pode substituir o aviso de um arquivo anterior ainda pendente. Consolidar essas
  pendências por origem, com resolução explícita, é o próximo passo necessário;
  não declarar tratamento integral de falhas entregue só por este aviso.

### Unidade 27 — arquivos de áudio/imagem até o CRM local (aceite de canal/UI pendente)

- Arquivos fictícios gerados localmente: WAV pt-BR por voz Windows (345.966B na
  execução) e PNG de proposta de camisetas (39.504B). Imagem foi inspecionada.
  Gerador reproduzível sem API: `scripts/create-crm-media-fixtures.mjs`.
- `verify-crm-media-live.mts --run-synthetic-media` lê os arquivos, persiste
  mensagem no emulador e usa funções reais de enriquecimento + fila de observação.
  Mídia foi fornecida como data URL; isso não valida download remoto/Storage,
  webhook Meta/Evolution, janela do canal nem reprodução pelo usuário.
- Prova real 94055 terminou 0. Três chamadas delimitadas ao provider: uma
  transcrição, uma extração comercial e uma análise visual. WAV foi transcrito
  como orçamento de três mil reais, prazo até sexta-feira e dona da loja; ficha
  e resolvedor usado pela interface confirmaram orçamento e decisor com trecho,
  conteúdo áudio e link da conversa. Não inferir aceite de todos os campos ou
  desempenho universal de voz só por este exemplo claro.
- PNG teve camiseta azul, 100 unidades e R$ 1.200 identificados. CRM preservou
  interpretação da imagem para revisão e não transformou preço da proposta em
  orçamento do comprador. Imagem não confirmou pagamento, aceite ou venda.
  Cache/replay não provocaram novas chamadas nem mensagens de resposta.
- `.qa-artifacts/crm-media-live.json`: passed=true, liveProvider=true,
  localCrmWrite=true, syntheticMedia=true, providerCalls=3, webhookVerified=false,
  browserVerified=false. Nenhum dado de cliente real; registros de teste limpos.
- Correções: mensagem ainda sem texto do comprador não consome reserva/chamada
  do extrator textual; anotação posterior reabre observação. Transcrição vazia
  gera erro explícito e pode ser tentada novamente (não cache de sucesso falso).
  Transcrição/visão têm timeout de 30s. Resposta visual truncada, recusada ou fora
  da estrutura deixa de ser apresentada como interpretação concluída. Prompt
  reforça que texto na imagem não é instrução nem confirmação comercial.
- Regressão inicial 46943 terminou 0, 35/35. Final 35093 terminou 0, 36/36 em
  26,83s (memória, observação semântica, erros e controle positivo de visão).
  Tipos/lint iniciais 25078/88994 e finais 30019/50542 terminaram 0. Diff check
  passou com aviso LF/CRLF. Gerador foi executado sem chamadas externas e lint
  97607 terminou 0. Sem verificações deste lote ainda em execução.
- Tentativa visual CUA retornou literalmente browser use desativado nas
  configurações Work, sem browsers disponíveis. Não contornar por outra
  automação/navegador. Este impedimento é só da validação visual: demais trabalhos
  independentes continuam. Habilitar essa configuração exige ação do usuário.
- Permanecem: avaliação com fala ruidosa/longa e formatos reais do canal,
  unificação de autorização/contabilização/recuperação das chamadas de mídia
  (reserva semântica não cobre sozinha transcrição/visão), recuperação de falhas,
  conferência/edição visual, múltiplas oportunidades e gestão/rotina completas.
  Leitura de vídeo continua baseada em miniatura, não arquivo integral.
  Sem homologação integral, migração, build novo ou publicação.

### Unidade 26 — observação semântica contínua (validação local)

- `semantic-observation.ts` é chamado por `conversation-intelligence.ts`, no
  fluxo que a fila de observação já usa. Fatos retornados e validados entram no
  mesmo patch com origem da mensagem e proteção manual. A extração semântica
  não autoriza por si só mover etapa; compromisso/avanço continua pelo caminho
  comercial existente. O próximo passo recebe fatos atuais, não fato antigo
  atribuído à mensagem nova.
- Ativação controlada por ALTUM_CRM_SEMANTIC_ENABLED=1, lista exata em
  ALTUM_CRM_SEMANTIC_TENANTS e reserva positiva explicitamente configurada em
  ALTUM_CRM_SEMANTIC_RESERVATION_USD. Nenhuma variável real/servidor compartilhado
  foi alterada; testes definem essas opções apenas em seus processos. Sem essa
  admissão, caminho anterior permanece, sem chamadas extras. Ainda falta produto
  de ativação/administração para cliente real; não dizer que já está habilitado.
- Exige módulos CRM/IA, situação comercial permitida, escopo de teste do agente,
  IA habilitada e provider/modelo validado (OpenAI/gpt-4.1-mini). Pausa de respostas
  não pausa registro comercial. Mensagens/gerações/conversa/oportunidade e revisão
  das configurações são verificadas antes e depois; commit verifica novamente
  fontes e autorização do módulo. Texto fabricado pelo chamador não vira fonte.
- Recibo por evidência/configuração/modelo tem claim transacional; cache válido
  evita nova chamada. Contador/reserva mensal bloqueiam novos claims concorrentes
  acima do limite, considerando agregado de uso conhecido. Reserva é configuração
  conservadora, não preço efetivo nem promessa de limite compartilhado com todos
  os outros consumidores (estes ainda não consultam essa reserva). Reserva fica
  retida até conciliação; agregado que inclua essas análises pode contar de modo
  conservador em duplicidade. Conciliação financeira global continua aberta.
- Tokens medidos têm recibo determinístico em ai_usage_ledger. Custo monetário
  desconhecido fica null e costSettlementPending=true, sem fabricar zero. Erro
  ou queda após chamada retém reserva/resultado desconhecido; não repetir cobrança
  silenciosamente. Claim vencido passa a review_required. Fluxo de resolução
  operacional/reprocessamento supervisionado desses estados ainda é pendente.
- Testes iniciais 12965 passou 7/7; regressão 37518 passou 25/25 incluindo revisão
  humana e mídia. Lote 21009 passou 11/11; final 50206 passou 13/13 em 25,61s.
  Cobrem cache, correção humana durante análise, fonte alterada, rollout, reserva,
  entrada fabricada, gasto conhecido, concorrência, worker perdido, erro e módulo
  revogado. Teste de áudio usa transcrição comprovada simulada, não áudio real.
- Tipos inicial 24903 falhou por união de resultado cache sem facts obrigatório;
  corrigido. Tipos/lints 64825/78863, 3452/37763 e 89703/32453 terminaram 0.
  Tipos/lint que incluem o novo script real (39708/50661) terminaram 0.
  Não há verificações deste lote ainda em execução. Sem build integral novo.
- Prova real 61512 terminou 0: script
  `verify-crm-semantic-observer-live.mts --run-synthetic-local` enfileirou texto
  fictício, chamou modelo real uma vez, salvou orçamento '3000 reais', conferiu
  evidência com trecho e link no resolvedor usado pela interface, e replay não
  chamou provider novamente. Nenhuma resposta externa, dado real ou produção.
  `.qa-artifacts/crm-semantic-observer-live.json` registra passed=true,
  providerCalls=1, localCrmWrite=true, mediaFilesRead=false, browserVerified=false.
  Registros exclusivos do teste foram limpos no emulador.
- Pendências prioritárias: áudio/imagem reais desde recebimento, revisão de
  fatos visuais, resultado ausente/contraditório, recuperação supervisionada,
  janela de contexto longa, separação explícita entre oportunidades, piloto
  autorizado, validação visual integral, build e pacote de publicação/migração.

### Unidade 25 — extração semântica com origem verificável (integrada na unidade 26)

- `semantic-extraction.ts` prepara chamada real estruturada e valida fatos contra
  mensagens fornecidas. Somente mensagem do cliente, id existente, campos
  comerciais permitidos, valor dentro de trecho literal, limites de contexto e
  confiança mínima. Correção mais recente prevalece; hipóteses contraditórias
  da mesma mensagem não reintroduzem campo recusado. Recusa/truncamento não
  equivale a extração vazia bem-sucedida. Contexto visual ainda não é fonte de
  afirmação do comprador; contrato aceita texto/transcrição, sem arquivo de mídia.
- Limite: citação literal e confiança do modelo não garantem interpretação
  verdadeira. Teste real mostrou ausência de prazo entrando como dado; adicionada
  recusa explícita de prazo indefinido no prompt e validação. Valor/trecho com
  mudança de caixa é recuperado da mensagem original, sem permitir reescrita.
- Consulta oficial usada para o formato estrito (não como prova da factualidade):
  https://developers.openai.com/api/docs/guides/structured-outputs
- `scripts/verify-crm-semantic-live.mts --run-synthetic` faz duas chamadas
  delimitadas ao modelo já usado no projeto, gpt-4.1-mini, só com texto fictício;
  nenhum cliente real foi enviado, nenhuma ficha gravada. Credencial foi carregada
  sem exposição. Quatro rodadas (8 chamadas) neste lote; relatórios/logs em
  `.qa-artifacts/crm-semantic-live*` registram tokens, não custo monetário inventado.
- Primeira rodada 98082 terminou 1: orçamento/decisor por paráfrase passou, mas
  cenário de correção/ausência de prazo falhou. Saída rejeitada não foi retida
  inicialmente, lacuna corrigida no avaliador; arquivo initial-failed preservado.
- Segunda rodada 41771 terminou 1: correção/negativa passou, decisor foi recusado;
  relatório second-failed preservado. Diagnóstico 41690 terminou 1, expôs motivo:
  value 'aqui...' e trecho 'Aqui...'. Saída third-failed preservada. Essa diferença
  de caixa não altera o conteúdo; novo validador recupera o trecho original.
- Rodada final terminou 0: buyer-paraphrase e correction-and-negative passaram;
  `.qa-artifacts/crm-semantic-live.json` e final.log. São dois cenários textuais,
  não avaliação ampla de precisão, robustez a prompts maliciosos, áudio ou imagem.
- Testes iniciais 7/7 e posteriores 8/8; versão com recuperação de caixa 14170
  terminou 0, 9/9 em 21,73s. Tipos 75472 passou antes da ampliação do conjunto;
  tipos 86561/7122 e lints 51048/40133/54640 terminaram 0, coletados. Diff check
  passou, com avisos LF/CRLF. Sem processos de testes/tipos/lint pendentes deste
  lote. Não confundir conjunto isolado com build integral ou aceite do CRM.
- Até esta unidade 25, o extrator ainda não estava ligado ao observador contínuo;
  a unidade 26 realizou essa ligação. Escopo previsto: autorização/módulo/limites
  de uso, recibo de execução, contexto
  atual da conversa e commit com comparação das revisões. Preservar edição manual,
  distinguir erro/pendência de informação ausente, testar parada/retomada e
  concorrência. Só então avaliar arquivo real de áudio/imagem até a ficha.

### Unidade 24 — correção humana da qualificação (aceite visual pendente)

- Novo fluxo `qualification` GET/PATCH e serviço `qualification-review`: lê
  revisão exata da ficha e salva somente campos comerciais permitidos, com
  autorização atual de módulo/capacidade/acesso no commit. Conflito de revisão
  retorna 409, inclusive troca de proprietário, alteração concorrente ou recriação.
- Campo salvo, evidência manual/autoria e evento com antes/depois compartilham
  transação. Campos alheios são preservados. Limite de 320 caracteres por campo;
  payload não pode definir etapa, autoria nem campos arbitrários. Replay da mesma
  revisão é recusado sem duplicar evento; não há recibo idempotente de sucesso
  após perda de confirmação, portanto UI mantém o rascunho e pede conferência.
- Ficha desktop/mobile oferece revisão de interesse, necessidade, objetivo,
  orçamento, urgência, prazo, decisor e objeção; envia só valores alterados, pausa
  atualização automática durante revisão, preserva rascunho em falha e não aplica
  resposta a outro cliente/empresa/usuário. Campos vazios retiram afirmação errada.
- Resolvido defeito em campo limpo manualmente: resolvedor visual antes podia
  ressuscitar valor de evidência antiga em outra chave. Origem manual não mostra
  frase de áudio antiga; evidência cujo value diverge do valor salvo não é exibida
  como comprovação desse valor. Valores vazios seguem fora do resumo.
- Agente de atendimento passa a respeitar source manual nos customFields;
  observador passivo já tinha essa guarda. Não é prova de que todos os escritores
  existentes ou todas as qualificações derivadas usam essa regra; auditar demais.
- Inspeção adicional encontrou que `setAiFieldEvidence` ainda podia substituir
  a autoria manual ao gravar outro customField. Acrescentada guarda de source
  manual também nessa função. Teste novo no executor real em
  `crm-agent-tasks.emulator.mts` verifica orçamento manual preenchido/vazio,
  autoria preservada e outro fato realmente atualizado (controle positivo).
  Execução 15436 terminou 0, 1/1 em 549,08s incluindo carga/limpeza; controle
  positivo verificou outro fato atualizado. Lint 47962 terminou 0.
- Testes iniciais 3671 terminou 0, 6/6. Regressão 81701 terminou 0, 16/16
  (56,60s): revisão autenticada + observação multimodal. Inclui origem/autoria,
  remoção seguida de conversa nova, conflito, recriação/retry, não autenticado,
  vendedor alheio, vínculo bloqueado, payload e frase divergente. Não somar lotes.
- Tipos inicial 10258 e final 81349 terminaram 0, abrangendo rota, serviço,
  componentes e CRM. Lint final 48886 terminou 0.
  Comando 26537 terminou 0 após encerrar somente lint inicial obsoleto PID 4268,
  com conferência de commandLine; handle 45829 terminou 1 por interrupção
  deliberada, não aprovação. Verificações atuais 48886/47962 foram mantidas.
- Não houve validação visual deste editor nem chamada de modelo real neste lote.
  Perda de acesso durante editor, save concorrente, navegação e erro de rede ainda
  precisam de ensaio no navegador. Possibilidade de liberar campo à IA novamente
  e sugestões futuras conflitantes continuam pendentes; correção não libera
  automaticamente controle humano. Sem build integral/publicação.

### Unidade 23 — atualização automática da ficha (aceite visual pendente)

- CRM consulta a ficha selecionada a cada 20s enquanto a aba está visível e ao
  retornar o foco. Atualização em segundo plano não liga o carregamento da tela.
  A resposta atualiza detalhe e o item correspondente da lista já carregada;
  não equivale a sincronização integral de todo o funil ou relatórios.
- Consulta em segundo plano não substitui leitura inicial em andamento. Trocar
  cliente, usuário ou empresa invalida respostas anteriores; retorno ao mesmo
  cliente também exige a consulta atual. Cleanup cancela apenas seu próprio
  contexto. Detalhe renderizado guarda contexto de empresa/usuário/cliente.
- Timeout de 15s libera consulta travada e permite tentativa no próximo ciclo.
  403/404 remove a ficha/item visível e informa perda de disponibilidade. Falha
  transitória mantém dados anteriores e mostra que a atualização falhou.
- Editor aberto e gravações pausam consulta automática. Resposta que chega
  depois de iniciar edição não substitui dados/rascunho. Efeito de inicialização
  não reinsere dados no formulário enquanto se edita. Escolha de etapa ainda
  não salva é preservada para o mesmo cliente. Trocar cliente fecha editor antigo.
- Desktop e ficha móvel mostram horário de conferência ou aviso de falha/edição,
  sem afirmar que o modelo analisou mensagens novas.
- Testes 9784 passaram 6/6: consulta inicial, resposta atrasada, troca de contexto,
  ida/volta entre clientes, cancelamento/retomada e rascunho de etapa. É prova do
  coordenador e da reconciliação; não prova interação do formulário no navegador.
- Testes finais 76165 passaram 7/7 em 12,99s, acrescentando precedência da
  consulta após salvar sobre resposta antiga em segundo plano.
- Tipos inicial 34989 passou; lint inicial 98386 passou. Tipos finais 14528
  terminou 0 após guarda do detalhe renderizado; lint final 40555 terminou 0.
  Sem testes/tipos/lint desta unidade em execução. Diff check passou.
- Navegador voltou a falhar por timeout nesta unidade; aceite visual e teste
  completo da página com edição + resposta concorrente continuam pendentes.
- Próximo foco permanece CRM: garantir fonte/modelo real e revisar/editar fatos,
  seletor de oportunidade, rotina útil do vendedor e visão conciliável do dono.

### Unidade 22 — conteúdo interpretado chegando ao CRM (validação local parcial)

- Achados confirmados: observador usava apenas texto/legenda originais, podia
  concluir antes da transcrição e não reabrir; evidência passiva não incluía value,
  enquanto interfaces procuravam esse campo. Ficha priorizava lista antiga sobre
  detalhe recém-carregado. Esses comportamentos explicam parte do dado ausente
  ou desatualizado; não são diagnóstico de todas as causas em produção.
- Enriquecimento agora registra prova da geração/conteúdo original e reabre o job
  do CRM na mesma transação. Lease antigo não finaliza a revisão nova. Observador
  compara token na repetição, mantém origem áudio/texto, valor e conversa no campo,
  valida as mensagens usadas como evidência dentro da transação e preserva manual.
- Cache de mídia sem prova atual ou com erro deixa de ser reaproveitado como
  interpretação válida. Sucesso limpa erro anterior; baixa clareza fica explícita.
- Descrição visual/OCR não é declaração do comprador: contexto de imagem,
  documento e miniatura de vídeo fica separado e requer conferência. Vídeo não
  equivale à leitura integral do arquivo; esse limite permanece.
- CRM e Conversas usam o mesmo resolvedor dos valores salvos. Origem e trecho
  podem ser expandidos, com acesso à conversa quando disponível. Campos vazios
  não geram quatro cartões de 'não capturado'. Contexto visual tem apresentação
  própria para revisão; DTO da conversa inclui esse contexto. Detalhe do cliente
  atual passa a ter precedência sobre item antigo da lista.
- Evidência parcial: regressão 28445 terminou 0, 34/34 (memória, observação
  multimodal e CRM passivo). Execução 70805 terminou 0, 7/7 após integração do
  resolvedor visual. Não somar conjuntos sobrepostos. Novo conjunto 40544 inclui
  reabertura de job já concluído, recuperação de erro e interpretações concorrentes;
  terminou 0, 9/9 em 38,76s. Asserções do resolvedor usado nas telas verificam
  valor, origem áudio, trecho, link da conversa e precedência da correção manual.
- Primeira execução 81958 falhou na asserção de um único evento total: o fluxo
  também pode registrar mudança de etapa. Asserção corrigida para evento de
  observação único e total inalterado no replay, preservando a verificação real.
- Tipos inicial 45676 passou sem as telas. Tipos 82288/99152 falharam por declaração
  CSS ausente no tsconfig dedicado; config passou a incluir explicitamente o
  contrato global do Next via files (include era excluído por node_modules).
  Tipos 92701 terminou 0, incluindo CRM, Conversas e DTO da conversa; lint 62068
  terminou 0. Não há testes/tipos/lint deste lote ainda em execução.
- Navegador automatizado continua com timeouts; não houve inspeção visual final
  deste lote. Revisão React aplicada: componente de evidência compartilhado, sem
  provider/biblioteca nova, sem HTML não confiável e com details/summary nativos.
- Limites: saída do modelo é simulada nos testes; nenhuma chamada externa ocorreu.
  Não prova leitura real de áudio/imagem nem precisão semântica universal. Não
  resolve ainda observador baseado em padrões, textos longos, recuperação de
  mídia em todos os cenários, atualização automática da tela, edição de cada fato,
  avaliação real por negócio/canal, build integral ou publicação.

### Unidade 21 — registro e análise de reuniões com fonte

- Helper assisted-meeting-mutation validado por integração local e harness visual
  usa acesso atual, revisão/geração de cliente e compromisso observados antes da
  geração; rejeita vínculo entre clientes distintos, alteração durante análise e
  recriação. Sessão, projeção, documento, nota, evento, auditoria e metadados da
  Agenda compartilham commit; chave estável/replay e recibo impedem ressuscitar
  sessão removida. Texto original mantém quebras de linha no registro.
- Concluir compromisso exige escolha explícita no formulário e intervalo/estado
  válidos. Gerar análise isoladamente preserva status, horário, URL e notas humanas.
  Frontend conserva a chave em perda da resposta e mostra ausência de análise.
  Gate existente de Reuniões para perfis Altum foi preservado, sem liberação ampla.
- Contingência do meeting-assistant deixou de inventar dores/objeções/etapa e
  temperatura por palavras isoladas. Salva análise indisponível, qualificação
  não identificada/confiança zero e não substitui campos de qualificação da ficha.
  Caminho do modelo recebe origem explícita; saídas reais de modelo não foram
  avaliadas neste lote. Live coach e demais classificadores seguem fora deste ajuste.
- Dossiê pós-commit recebe fence da sessão, autoridade atual, geração/revisão de
  pai e compromisso; done é gravado com a projeção. Registro analisado não força
  gatilho de reunião concluída. Pending ainda exige worker/revisão causal: a
  recuperação automática não está concluída e o recibo não prova entrega.
- GET passou a conferir os pais de cada sessão/gerações, evitando que sessão de
  cliente removido apareça no novo registro com mesmo ID; paginação/ordenamento
  integral da listagem ainda permanecem abertos.
- Testes novos em tests/crm-assisted-meeting.emulator.mts. Rodada 59789 saiu 1
  por emuladores indisponíveis (ECONNREFUSED), não por prova funcional do produto.
  Antigo servidor 23684 sem handle/portas. Primeira restauração 13134 foi parada
  para configurar Java local; restauração 35879 saiu 1 por BindException 8080:
  Firestore já estava ouvindo no processo 9164. Nenhum dado real foi tocado.
- Servidor Auth/Storage 24438 iniciado separado, com Java 21 local e projeto demo;
  prontidão anunciada em meeting-auth-storage.log; Auth 9099 respondeu 200. Firestore
  8080 inicialmente demorou a responder, mas a rodada de regressão recuperada usou
  esse banco e passou. Storage 9199 está no anúncio de prontidão. Não matar
  servidor 9164 só por não haver handle: reutilizar se continuar saudável.
- Tipos 20227 saíram 2 (literal analysisMode inferido string), corrigido com literal
  const. Lint 20228 saiu 0 mas precede ajustes finais. Tipagem corrigida 78199 saiu
  0; lint corrigido 97533 saiu 0 antes do último guard de geração/GET teste.
  Logs meeting-* em .qa-artifacts/crm-media-reference. Sem publicação/migração,
  chamada real de IA ou canal externo. Coletar processos vivos antes de qualquer rerun.
- Regressão recuperada 1880 saiu 0: 19/19 em 43,76 s (9 casos de reunião, 10 de
  dossiê conversacional). Inclui contingência pela API real, replay, preservação de
  alterações humanas, pai recriado, vínculo inválido, conclusão explícita, rollback,
  dossiê com revisão/autoridade atual e GET sem exposição entre gerações. Dados de
  saída model usados nas transações são fixtures, não avaliação real de IA.
  Tipagem final ampliada 8765 e lint 74904 saíram 0 (meeting-final-*).
- Browser em .qa-artifacts/crm-meeting-ui usa a página real com contexto visual de
  perfil Altum, token real de Auth do emulador e APIs reais. Não altera o gate de
  cliente comum nem substitui autorização. Browser final 40328 saiu 0: desktop e
  viewport 375, perda da resposta/replay com mesma chave, três POST 200, contingência
  preservando qualificação e conclusão somente por checkbox. Nenhum erro de página
  ou transporte externo; result.json e screenshots em crm-meeting-ui. Desktop e
  mobile foram inspecionados; isso não prova o shell autenticado inteiro ou o modelo real.
- Browsers 89392/89795 saíram 1: harness não fornecia configuração do SDK cliente
  Firebase usado pela página (auth/invalid-api-key). O harness agora usa o ramo QA
  real de firebaseConfig, com chave fictícia, projeto demo e emuladores, sem mock
  desse SDK. Rodada 30448 saiu 1 por overflow no viewport 375; fluxo de persistência,
  repetição e conclusão explícita passou antes da asserção visual. Ajustadas larguras
  de campos/labels somente no workspace de reuniões; não alterado globals.css.
  Browser 69408 saiu 0, mas inspeção da captura revelou corte interno do painel de
  chamada que a largura global não detectava. Grids receberam coluna base minmax(0,1fr)
  e min-w-0 locais. Browser 40328 e inspeção final confirmaram painel/campos inteiros.
  Tipos 7060/lint 7691 saíram 0; lint final da grade 21241 saiu 0. Logs meeting-browser-final,
  meeting-release-types/lint e meeting-grid-lint. Registros legados sem origem de análise e qualidade
  das saídas reais do modelo ainda exigem auditoria/migração/eval próprios.

### Unidade 20 — distribuição e desfazer coerentes com a operação

- Substituídos bulkWriter e pós-gravações independentes por transação: planejamento
  atual, autoridade, responsável, ficha, conversas ativas, compromissos, retornos
  pendentes, propostas, financeiro, histórico e comprovantes compartilham commit.
  Query de destinatários/clientes/vínculos não trunca nos antigos 100/500/1000.
  A seleção por ação continua limitada a 100 oportunidades, como no contrato anterior.
- Dono/gestor deve manter edit_leads e poder de gestão; visibilidade da equipe
  isolada não autoriza escrever. Destinatário é vendedor ativo com acesso atual,
  incluindo as restrições atuais de canais pessoais. Tela aplica o mesmo critério.
- Desfazer usa comprovante por registro com geração, campos anteriores e revisão
  real de gravação. Não usa só igualdade do dono. Remove campos que antes não
  existiam e preserva os originais individuais; não supõe um dono único para todo
  o histórico. Alteração posterior, exclusão/recriação ou novo trabalho ligado à
  oportunidade preservam aquele grupo inteiro. Outros grupos intactos podem voltar.
  A resposta e a tela informam quantos foram preservados. Replay não repete efeitos.
- Calendário é validado no estado final do lote: colisões de destino e no desfazer
  recusam todo o commit; trocas simultâneas válidas não acusam conflito com o dono
  antigo. Remover responsáveis não transforma todos os sem dono no mesmo vendedor.
  Agenda/retornos incrementam versão ao distribuir/restaurar.
- Chave estável na tela conserva a mesma operação em repetição após perda da resposta.
  Fingerprint impede reutilização para outro payload. Mobile recebeu seleção,
  atribuição/remoção, avisos e desfazer que estavam ausentes; usa os mesmos controles
  e callbacks do desktop. Perfil sem operação não ganha controles de gestão.
- Regressão integrada 98650: saída 0, 36/36 em 106,57 s (distribuição, Agenda e SLA).
  Políticas 5/5, saída 0, assignment-policy-regression.log. Restrição de leitura da
  equipe 89976: saída 0, 1/1 em 19,19 s após reforço de edit_leads.
  Rodadas têm sobreposição; não somar como cobertura integral da missão.
- Browser 60305 saiu 0: página CRM real em harness + APIs reais e emuladores, 1440
  e viewport 375, perda da resposta, duas chamadas 200 com mesma chave/um evento,
  desfazer parcial com aviso e atribuição no celular. Nenhum erro de página ou
  transporte externo; result.json e screenshots em .qa-artifacts/crm-assignment-ui.
  Mobile e desktop inspecionados visualmente. Não equivale ao shell autenticado completo.
- Tipagem 69890 e lint 99056 saíram 0 (assignment-release-*). O teste ampliado 84000
  saiu 0, 1/1 em 139,60 s incluindo limpeza de fixtures: alvo comprovadamente após
  500 registros, 1002 compromissos e 1006 vínculos atualizados. A asserção de posição
  foi reforçada: a fixture anterior podia ordenar antes dos 500 e não provar o corte.
- Falhas registradas: 89958 e 5691 saíram 1, 6/9, por comparação indevida entre
  serverTimestamp (precisão diferente) e updateTime no desfazer. Corrigido para
  revisões de gravação do registro e recibo criado no mesmo commit; caso isolado
  75944 e regressão integrada passaram. Tipagem inicial 84455/90102 saiu 2 por
  inferência estreita do overlay de dono, corrigida com tipo de dados do Firestore.
- Browser 29483 falhou ao resolver marcador server-only; alias de servidor é
  aplicado apenas no harness, sem substituir auth/rotas. Rodadas 6519/80069 acharam
  ausência dos controles móveis; após implementação, 92697 falhou por seletor de
  texto duplicado entre superfícies escondida/visível. Harness seleciona aviso
  visível; somente 60305 é aprovação visual final. Artefatos de falha foram mantidos.
- Riscos abertos: recibos legados não provam versões/gerações e exigem revisão
  manual em vez de desfazer cego; leituras de carga ainda percorrem a base e pedem
  verificação de desempenho em escala real. Papel do responsável operacional e
  crédito histórico de venda/financeiro ainda precisam separação no modelo final.
  Sem promessa de escala ilimitada: transações continuam sujeitas a tamanho/tempo
  documentados em [Firestore Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
  e [Quotas](https://firebase.google.com/docs/firestore/quotas). A revisão de gravação
  é distinta do campo transformado; referência [WriteResult](https://docs.cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1#writeresult).
- Sem publicação, migração, operação em canais reais ou chamada de modelo.

### Unidade 19 — aprovação e criação MCP sem estado intermediário parcial

- create_appointment deixou de usar claim applying, criação isolada e finish
  separados. Aprovação atual, autoridade, criação, reserva, evento, auditoria e
  comprovante aplicado compartilham transação. Falha não deixa criação órfã ou
  aprovação marcada como aplicada sem compromisso. Origem continua identificada MCP.
- Criação manual e MCP usam o mesmo serviço transacional de criação e reserva;
  disputas entre duas aprovações ou aprovação e criação manual respeitam o horário.
  Chave do rascunho gera compromisso estável; repetição conserva edição humana e
  não recria compromisso removido. Recibo verifica geração de draft e do cliente.
- Revisão humana registra fingerprint, versão e geração do cliente. Aplicação
  exige aprovação correspondente ao conteúdo e vínculo atuais, e verifica acesso
  atual do executor, do aprovador e do responsável. Aprovação legada sem esses
  dados deve ser revista novamente pela mesma rota; não é presumida válida.
- Modo autônomo verifica política atual, autor/ator, elegibilidade e permissões
  calendar:write/crm:read. A rota de aprovação automática registra contexto atual
  na transação e a aplicação confere novamente. Nenhuma autenticação foi alterada.
- Início precisa ser explícito e válido, com fuso; datas impossíveis são recusadas.
  Cliente opcional e duração padrão de uma hora do fluxo manual/MCP são preservados.
  Criação aplicada não equivale a confirmação do cliente, venda ou receita.
- Regressão final 75798: saída 0, 48/48 em 55,48 s, incluindo APIs reais de revisão/
  aplicação, token MCP validado pelo código real, concorrência, permissões revogadas,
  falha de auditoria, geração trocada, recibo malformado, datas, Agenda, SLA e criação
  de clientes. Bloqueio de transporte externo ativo; nenhum transporte externo tentado.
- Lint final 36894 e tipagem final ampliada 40985 saíram 0. A tipagem
  anterior 8120 também passou antes de guardas finais de referência/aprovador. Logs
  appointment-draft-release-* em .qa-artifacts/crm-media-reference.
- Primeira rodada 88232 saiu 1 (24/25): harness Node precisava mapear marcador
  server-only ao alias vazio de servidor do Next; nenhum código real de auth ou
  provedor substituído. Tipos 42058 saíram 2 por narrowing de Timestamp unknown,
  corrigido com verificação explícita. Rodada corrigida 48751 passou 8/8.
  Rodada 75323 saiu 1 (47/48): token fictício omitira context:read obrigatório;
  fixture corrigida, validador mantido. Somente a rodada 75798 é evidência final.
- Sem mudança visual neste lote e sem publicação, migração, chamadas de modelo
  ou operação em canais reais. Outros escritores e pós-commit continuam abertos.

### Unidade 18 — expiração SLA respeita decisão humana

- Avaliação usa revisão/geração exatas do candidato observado e calcula prazos
  dentro da transação. Alteração de prazo/aprovação/exclusão posterior à leitura
  impede aquele candidato de escrever; a próxima varredura lê o estado atual.
- Expiração da revisão, cancelamento de rascunho, incremento de versão/reserva
  e evento da ficha agora compartilham commit. Falha no histórico desfaz tudo.
  Não há mais leitura de draft seguida de set fora de transação que possa
  cancelar uma confirmação humana concorrente.
- Pai atual deve existir na empresa; geração de origem é conferida quando
  registrada. Objetos vinculados exigem empresa/lead correspondentes, reviewActionId
  correspondente quando presente, geração compatível e estado ainda tratável.
  Compromissos confirmados, propostas enviadas e aprovação humana são preservados.
- Preenchimento de prazos faltantes e escalada também usam revisão atual e update;
  não recriam revisão removida. Dois workers não repetem expiração/evento.
- Regressão integrada 26334: saída 0, 33/33 em 35,69 s (15 agenda, 9 SLA funcional,
  9 contratos/políticas). Inclui confirmação entre scan e leitura do compromisso,
  replay concorrente, falha de histórico, pai recriado/removido, prazo alterado,
  proposta enviada e worker real. Transportes externos bloqueados, zero tentativas.
- Tipagem ampliada 64955 e lint 79066: saída 0. Logs commercial-sla-final-* em
  .qa-artifacts/crm-media-reference. Emuladores locais continuam disponíveis.
- Primeira regressão 95762 saiu 1: 16/17, por teste textual antigo procurando
  implementação de draft/conflito no agente/rota após extração aos serviços.
  O teste foi atualizado para os serviços reais; prova funcional vem dos casos
  de emulador. A rodada com falha não é aprovação e não deve ser somada à final.
- Limites: avisos internos/push ainda são pós-commit, sem outbox recuperável;
  fila limitada pode precisar cursor para não bloquear candidatos posteriores.
  Registros legados sem geração não ganham evidência retroativa. Aprovações de
  proposta/cobrança fora do helper da Agenda ainda exigem revisão transacional.
- Sem mudanças visuais neste lote; sem migração/publicação/canais reais.

### Unidade 17 — criação manual, reserva e repetição do pedido

- POST e confirmação/edição passam pela mesma reserva transacional por empresa.
  Duas criações ou criação e confirmação concorrentes para o mesmo vendedor e
  faixa aceitam apenas uma reserva. Consulta não fica limitada aos primeiros 500.
- Criação verifica autoridade atual, módulo, responsável e acesso ao cliente no
  commit, inclusive geração do cliente quando há snapshot inicial. Nome e dono
  vêm do registro atual; Agenda não envia dono derivado de cache antigo.
- Pedido opcional estável gera o mesmo compromisso em repetição de transporte.
  Payload diferente é recusado; replay preserva edição/cancelamento humano;
  recibo impede ressuscitar compromisso removido. Agenda conserva chave e campos
  após perda da resposta, e limpa apenas após confirmação bem-sucedida.
- Compromisso, versão inicial, reserva, recibo e evento da ficha são atômicos.
  Efeitos existentes pós-commit continuam fora dessa garantia e permanecem abertos.
- Regressão final 36762: saída 0, 15/15 em 27,63 s; inclui disputa concorrente,
  rollback por falha da auditoria, replay da API, cliente recriado e ator bloqueado.
  Lint 63864 saiu 0. Tipagem corrigida 96956 e final ampliada 28086 saíram 0.
  Logs appointment-create-final-* em .qa-artifacts/crm-media-reference.
- Browser verificado: appointment-create-browser-verified.log e
  .qa-artifacts/crm-appointment-ui/result.json, desktop/mobile, campos vazios,
  faixa inválida, fuso, Escape/foco, perda da confirmação e nenhum erro de página.
  As duas chamadas POST precisam retornar 200, com uma única criação persistida;
  transporte externo bloqueado e contador zero. Harness da Agenda real com APIs
  e emuladores; não equivale à homologação do shell completo autenticado.
- Primeira rodada de API/tipos encontrou ownerName ausente após commit; corrigido
  para usar o nome devolvido pelo commit. Browser antigo appointment-create-browser.log
  foi rejeitado como evidência: mascarava primeiro POST 500 como perda de conexão.
  O harness agora exige [200, 200], e a rodada verificada passou. Não somar rodadas.
- Sem publicação, migração, chamadas de modelo ou alterações em canais reais.

Contrato manual de retornos ligado à ficha/Agenda. Backend de múltiplas
oportunidades e primeira admissão conservadora de contexto implementados;
seleção explícita e interface das oportunidades ainda não liberadas.

Nota histórica da unidade 16 (POST já tratado na unidade 17): fazer demais escritores de compromissos usarem reserva/versão,
e fechar pós-commit de learning/conversão com fonte causal. Manter emuladores
23684 vivos; Auth/Firestore/Storage foram verificados prontos após reinicialização.
Browser 16311 passou com saída zero: Agenda real em harness + APIs/emuladores,
desktop e viewport 375, ISO/fuso, campos vazios, erro de intervalo e Escape/foco.
Screenshots mobile/desktop foram inspecionados; result.json em crm-appointment-ui.
Regressão recuperada 92571 passou 27/27 em 75,86 s; ampliação 26304 passou 9/9 em
23,56 s. Tipos 81275 e lint 8692 passaram, mas antecedem correção da aba inicial.
Falhas 75411/61939 foram indisponibilidade local; ambas saíram 1, sem aprovação.
Browser 56762 saiu 1: view=appointments era ignorado. Corrigido antes da rodada
16311. Browser 4943 foi interrompido para pôr bloqueio de transporte externo;
fixture interrompida foi identificada e limpa (uma empresa QA, sem dados reais).
Horário inventado foi removido; review removida usa recusa terminal do executor.
Regressão 64122 passou 38/38 em 107,81 s; tipagem ampliada 45227 e lint 82352
passaram com saída zero. Nenhum desses processos continua em execução.
Rascunhos/revisões receberam commit com fonte e outcome neutro na unidade 15.
Depois revisar horário de draft/confirmação humana na Agenda (incluindo faixa,
fuso, capacidade e consultas truncadas) e auditar também notificações
operacionais fora do executor (createAiInternalNotification/Once e seu lock).
Nove grupos de nota/evento/aviso do executor foram migrados na unidade 14.
Regressão 32449 passou 28/28 em 65,30 s; tipos 46108 e lint 75131 terminaram com
saída zero (agent-signals-release-*.log). Nenhum desses processos continua vivo.
Depois fechar causalidade e
autoridade atual dos callers manuais/agenda de upsertLeadCommercialDossier,
incluindo rejeição de gatilho ganho/agendado obsoleto.
Regressão 55761 passou 33/33 em 78,25 s; tipos 83541/81993 e lint 11478 passaram
com saída zero. Logs agent-dossier-release-* e agent-dossier-executor-types.log
em .qa-artifacts/crm-media-reference. Nenhum processo desse lote continua vivo.
Resumo/dossiê recebeu fonte nos quatro ramos e commit atômico (unidade 13).
Depois proteger eventos/propostas/notificações/etapas e fontes de agenda/humano.
Tipagem final 95375 e lint do último teste 52613 passaram com saída zero.
Regressão integrada de tarefas 50851 passou 55/55 em 121,53 s, saída zero
(agent-tasks-integrated.log). Tipagem da suíte 10979 passou com saída zero.
Regressão de contexto/memória 3696 terminou
49/49 em 121,07 s, saída zero (agent-context-regression.log).
Os dois executeAltumAgentActions já recebem
conversationFence; a projeção principal verifica essa fonte dentro de
commitAutomaticLeadPatch. Tipagem 8292 e lint 76697 passaram com saída zero.
Quatro chamadas de ensureAiLeadTask já usam fonte e tarefa/auditoria transacionais;
seis casos novos passaram (58675), tipagem do agente 41520 e lint 48811 aprovados.
Três casos do executor real foram adicionados: handoff válido/replay, mudança de
fonte durante claim do handoff e mudança durante derivação do perfil. Suíte final
39183 aprovada 9/9 em 26,72 s (agent-tasks-executor-final.log).
Depois continuar nos eventos/propostas/notificações/etapas. Preflight isolado
não prova esses efeitos tardios; o commit do dossiê está descrito na unidade 13.
Tipagem final 43594, lint 52843 e tipagem da tela 20189 terminaram com
saída zero; logs em .qa-artifacts/crm-media-reference. Nenhum desses processos
permanece em execução.
A regressão final de referências/reprodução/sincronização passou 16/16 em 86,09 s,
sessão 91957 saída zero. A associação tardia de mídia reproduzida em
crm-media-identity/stale-cache-probe.json recebeu proteção por fonte e geração
nos caches de entrada/Evolution, reprodução e rota GET; ver unidade 11.
Ampliação de autoridade: 32/32 em 52,46 s (3336, saída zero), incluindo fundação
CRM, transferência/canal pessoal e payload legado obsoleto. Tipagem 49611 e lint
2881 aprovados com saída zero, sem processo vivo desses conjuntos. Logs
authority-regression-final.log, authority-types.log e authority-lint.log.
Depois migrar ExecuteAltumAgentActions: perfil/resumo/aiMemory no leads, tarefas,
propostas, dossiê, eventos, notificações e etapas para o contexto capturado no turno.
A memória nos três ramos de handleIncomingMessage já carrega esse contexto.
Observer agora grava
projeção/tarefas/históricos juntos e tem fonte causal para automações de etapa,
inclusive agenda/envio. Isso NÃO cobre todos os escritores do agente nem autoriza
liberar o novo fluxo na UI. Auditar também hooks de aprendizado/conversão e sua
idempotência/fronteira própria antes de afirmar cobertura completa dos efeitos.
Depois implementar seleção auditada de
negociação, versão e fronteira temporal das mensagens, autorização corrente de
conversa/canal e oportunidade e retomada das observações awaiting_context.
Build configurado 46565
terminou com saída zero: bundler 6,6 min, tipos 3,3 min e páginas geradas. Log
build-configured.log em crm-activities-build-1792561854842. Os quatro erros de Next
foram corrigidos; o segundo build tinha parado por API key pública ausente na cópia
sem .env. A terceira execução usou valores fictícios demo, sem mudar autenticação.
Esse build configurado é histórico e não prova o código da unidade 8. A cópia foi
atualizada com 1788 arquivos e a compilação context-stage terminou com saída zero,
sessão 10790 coletada. Ela antecede o ajuste final do limite de messageId e as
unidades 9/10. Essas unidades têm verificações específicas; não apresentar o build
histórico como prova de compilação global do código atual. Não há build vivo.
Depois integrar criação/listagem/edição de oportunidades à ficha desktop/mobile,
preservando título, contactId, recordKind e valor desconhecido nos DTOs e nas métricas.
Reservas de restauração/expurgo e pendências de integridade continuam obrigatórias
antes da entrega integral. Nenhuma fase ampla está encerrada por este lote.

## Unidade 16 em andamento — escolha humana de horário

- Removido findNextAvailableAiSlot do agente. Novo draft sem slot fornecido tem
  startAt/endAt/slotSource null. Teste correspondente adicionado na suíte de drafts.
- Agenda desktop/mobile usa AppointmentTimeDialog nativo, campos início/fim sem
  preencher datas ausentes, validação local e envio ISO no fuso do dispositivo.
  Captura revisão da ficha aberta; erros ficam na janela para corrigir/repetir.
  Escape/foco e largura mobile passaram no navegador; screenshots inspecionados.
- commitAppointmentChange revalida autoridade, acesso ao compromisso e cliente,
  geração/revisão e versão; registro/revisões pendentes/evento são uma transação.
  Agenda PATCH e review_appointment passam pelo helper. Scheduled/confirmed exigem
  intervalo válido; aprovação antiga não reabre compromisso tratado.
- Gate crmCalendarMutationVersion usa tenant_settings, serializando chamadas desse
  helper. Consulta de conflitos cobre todos os registros sem limite 500/200. Isso
  NÃO cobre concorrência com POST, importações ou outros escritores que ainda não
  usam o gate. Medição/capacidade por calendário e pós-commit (learning/conversão)
  continuam abertos; não alegar atomicidade desses efeitos externos.
- GET entrega expectedRevision; Agenda envia versão/revisão. Nova janela compartilha
  componentes existentes. Revisão React aplicada conforme skill react-best-practices.
- API inicial passou 5/5: ambas rotas negam draft sem data, commit conjunto, edição
  obsoleta/exclusão/revogação, concorrência de dois horários e rollback de evento.
  Acrescentado teste de revisão pendente antiga sobre completed, ainda a executar.
- Ambiente caiu após os primeiros testes. Browser 75411 saiu 1 com ECONNREFUSED
  Auth 9099 antes de criar usuário; regressão 61939 saiu 1 por infraestrutura.
  Emuladores 23684 reiniciados e prontidão das três portas confirmada. Rodada
  recuperada 92571 passou 27/27 em 75,86 s. Nova ampliação 26304: 9/9 em 23,56 s,
  com conflito após posição 500, data impossível/sem fuso, gestor rebaixado não
  remove responsável e revisão antiga não reabre completed.
- Browser isolado inicial 56762 mostrou aba view=appointments ignorada; corrigida.
  Rodada 16311 passou: página Agenda em harness com contexto de autenticação
  substituído, APIs reais e dados fictícios nos emuladores. Desktop/375 px, campos
  vazios não salvam, erro de intervalo, UTC esperado a partir de São Paulo,
  Escape restaura foco ao botão e nenhuma exceção de página. Transporte externo
  bloqueado/contado (zero tentativas). Não é homologação do app Next autenticado.
- Capturas desktop.png/mobile.png inspecionadas; diálogo cabe na tela e erro fica
  legível junto aos campos. result.json registra casos; fixture interrompida
  anterior foi limpa por identidade QA estrita. Tipos 72455 e lint 36338 aprovados
  com saída zero (appointment-confirmation-verified-*). Apenas emuladores 23684
  seguem vivos para as próximas unidades; nenhum teste/check deste lote vivo.
- Riscos abertos: todos os escritores de agenda cooperarem com a reserva, duração
  legada/fuso da empresa, snapshots de pós-commit, feedback/conversão causal,
  confirmação sem repetir ações humanas e performance da consulta de conflitos.

## Unidade 15 — rascunhos e revisão humana com origem

- createConversationCommercialDraft cria proposta/agendamento, revisão pendente,
  evento e outcome neutro na mesma transação validada pela conversationFence.
  ID por geração/conversa/mensagem/tipo evita duplicação em concorrência/replay.
  Pai recriado ou mensagem alterada não recebem o resultado antigo.
- Responsável e identificação vêm do cadastro atual, sem atribuir a negociação
  ao usuário técnico da IA. Proposta permanece Rascunho, valor/validade desconhecidos
  ficam null. Agendamento permanece draft, slotSource availability_suggestion e
  requiresCustomerConfirmation true. Não houve envio, aceite ou receita.
- prepareConversationCommercialAction compartilha a transação do draft. Três
  chamadas recordCommercialAgentAction do executor agora levam fence e validam
  referência por empresa/oportunidade/coleção. Decisões e campos humanos não são
  sobrescritos no replay. Caminho manual legado sem fence permanece e ainda exige
  fechamento de autoridade/concorrência na sua rota.
- Receipt de draft impede ressuscitar proposta excluída; reviewActionId impede
  recriar revisão removida após aceitação. Resíduo/confirmação incompatível exige
  revisão em vez de adotar/reescrever referência de outra negociação.
- prepareNeutralDraftOutcome mantém outcome e contador existentes no commit,
  sem sinal positivo nem atribuir a criação da própria IA como sucesso comercial.
  Esse caminho neutro não precisa disparar aprendizado externo depois do commit.
  Formato legado dos contadores/dia/fuso e conciliação geral continuam na fase de
  métricas/migração; não alegar reconciliação histórica com base neste lote.
- syncLeadCommercialState final do executor agora recebe fence, usa seu commit
  protegido já existente e só relata sync_crm_state quando houve commit aceito.
- Sete testes iniciais passaram. Probes do executor real (43538): proposta com
  revisão humana pendente, replay sem duplicar, mudança após draft válido impede
  dossiê/avisos antigos; ambos passaram. O draft válido anterior é preservado.
- Conjunto ampliado com receipt/exclusão e executor real: 64122 aprovado 38/38 em
  107,81 s. Tipagem ampliada 45227 e lint 82352 aprovados com saída zero; sem
  processo vivo. Logs agent-drafts-final-regression.log, agent-drafts-release-types.log
  e agent-drafts-final-lint.log. Sem modelo/canal real nem publicação.
- Não fecha a qualidade da sugestão de horário: findNextAvailableAiSlot ainda usa
  horário padrão, fuso do runtime, limite de 500 e fallback; aprovação/conflito de
  agenda também precisa revisão completa. Não apresentar isso como disponibilidade
  verificada da empresa. Planejar remoção de horário inventado com UX para escolher
  data ao revisar e validação de capacidade/versão na confirmação.
- Permanecem etapas diretas/efeitos do agente, ações/alertas operacionais fora do
  executor, liberação por módulo e callers manuais/agenda com causalidade atual.

## Unidade 14 — notas, eventos e avisos internos do executor

- Novo commitConversationAgentSignal: fonte/generações/revisão da mensagem no
  commit, identidade estável por turno/tipo e fingerprint do conteúdo. Evento,
  nota opcional e notificação são uma única transação. Falha de uma escrita desfaz
  todas; replay/concorrrência não duplicam o conjunto. Recusa de contexto usa o
  tratamento de claims skipped já presente no executor.
- Nove grupos migrados: handoff copiloto, recomendação, lacuna de contexto para
  fechamento, retorno, proposta, rascunho de agenda, fechamento pendente, possível
  objeção e handoff normal. Fonte e IDs completos são preservados.
- Receipt não reabre aviso dispensado, não recria aviso apagado nem sobrescreve
  nota corrigida pelo humano. Resíduo sem receipt exige revisão e não é adotado
  silenciosamente. Uma nova revisão capturada pode registrar sua interpretação
  mantendo o histórico anterior; isso não comprova o fluxo inteiro de reanálise
  de mensagens editadas (claims e alterações auxiliares ainda exigem auditoria).
- evidenceKind distingue ai_interpretation de operational_event. Recomendação
  não é automaticamente rotulada como lead quente; objeção é apresentada como
  possibilidade para revisão, sem atribuir a interpretação como fala literal.
- Seis testes iniciais e executor/tarefas: 16/16. Ampliação posterior: 28/28 em
  80,01 s (82920), com revisão nova, dossiê e executor real. Probe 1167 passou:
  mudança de mensagem depois do commit da tarefa impede evento/aviso posterior,
  preservando a tarefa que foi válida no instante anterior.
- Conjunto release 32449 aprovado: 28/28 em 65,30 s. Tipos 46108 e lint 75131
  aprovados com saída zero. Nenhum processo desse lote em andamento; não somar
  conjuntos sobrepostos nem repetir verificações sem nova alteração/risco.
- Não cobre notificações operacionais criadas fora de executeAltumAgentActions,
  os locks de dedupe delas, propostas/agendamentos, commercial-agent-actions,
  syncLeadCommercialState nem efeitos de etapa. Revogação de módulo/autoridade
  automática em todos os escritores e qualidade comercial continuam abertas.

## Unidade 13 — dossiê comercial com revisão e origem

- upsertLeadCommercialDossier sempre lê o cadastro persistido; input.lead fica
  como parâmetro compatível, sem substituir fatos atuais por snapshot antigo.
  Nome atual prevalece sobre preferredName da memória; memória persistida tem
  precedência sobre a cópia do chamador. Pai ausente/estrangeiro não é recriado.
- Quatro ramos do executor passam conversationFence. Fonte e revisão do cadastro
  são verificadas no commit. Recusa no agente interrompe os efeitos subsequentes;
  isso não desfaz uma projeção anterior que foi válida quando gravada.
- Ficha, documents/commercial_dossier e evento com tenant/evidência/fingerprint
  são uma única transação. Identidade por conteúdo/geração permite replay e
  concorrência sem duplicar revisão/histórico; documento de geração anterior é
  preservado e exige revisão, incluindo legado anterior ao pai recriado.
- Ausência de score não vira zero. Retirados resumo sintético, razão do planner
  como suposto resumo, perguntas padrão de orçamento/decisor e instruções genéricas
  para preencher lacunas. Pergunta sugerida exige nextQuestion do plano; documento
  omite títulos sem conteúdo. Isso não prova precisão semântica do modelo.
- sourceId não vira appointmentId. Rascunho do agente tem trigger appointment_draft,
  status meeting_draft e rótulo "Agendamento a confirmar", em vez de reunião marcada.
  Registros históricos não foram migrados nem reescritos.
- Sete casos iniciais passaram. Conjunto ampliado anterior: 31/31 em 62,04 s
  (49890), com tarefas e fundação. Probe do executor real (65435): fonte muda depois
  da projeção válida e antes do dossiê; dossiê/documento/eventos não são salvos.
- Conjunto final ampliado com draft e executor: 55761, 33/33 em 78,25 s, saída
  zero. Tipos 83541 (dossiê/agente), 81993 (testes do executor) e lint 11478 passam
  com saída zero. Nenhum desses processos está vivo. Não somar os conjuntos.
- Continuam abertos: autorização atual/causalidade de callers manuais e de agenda,
  efeitos após o dossiê, notas/notificações/propostas/agendamentos, leitura multicanal
  completa e avaliação de fatos vs inferências. Atomicidade não encerra esses itens.

## Unidade 12 em andamento — projeção do agente ligada ao turno

- Ambos os ramos de executeAltumAgentActions recebem conversationFence capturada
  pelo agente. Admissão recusa oportunidade sem contexto correspondente antes de
  criar aprovações/claims. A projeção principal passa verifyContext à transação
  existente, junto da versão do cadastro e proteção de campos humanos.
- Não é fechamento dos efeitos: dossiê/propostas/notificações,
  stage side effects e gravações depois da projeção ainda precisam usar a mesma
  fonte no próprio commit. Os testes de memória pausada não exercitam todos esses
  ramos e não devem ser apresentados como cobertura integral do executor.
- Tipagem/lint 8292/76697 passaram. Regressão de memória/contexto 3696 aprovada:
  49/49 em 121,07 s. Sem chamada real a canal/modelo.
- ensureAiLeadTask encaminha as quatro criações ao novo agent-commercial-task.
  Fonte revalidada dentro da transação, ID estável por geração/conversa/mensagem/
  chave, consulta de todas as pendências (antes limitava 30). Tarefa e evento de
  criação atômicos, versão 1, responsável atual do cadastro, prazo opcional.
  Conclusão/edição humana não é reaberta no replay. Recusa de contexto não é
  confundida com tarefa já existente; encerra claims como skipped, sem retry cego.
- Seis testes novos: responsável atual/sem prazo, concorrência/conclusão humana,
  mensagem/pai/pessoa alterados, dedupe além de 30, rollback de auditoria e fonte
  ausente/incompatível. 6/6 em 21,13 s. Tipagem do agente 41520 e lint 48811 passam;
  suíte de contratos existente 9/9. Nenhum teste aqui prova a qualidade dos textos
  genéricos ou critérios comerciais; essa aceitação continua aberta.
- Tipagem da nova suíte 10979 aprovada. Regressão integrada memória/tarefas/contexto
  50851 aprovada 55/55 em 121,53 s, saída zero. Conjuntos se sobrepõem.
- executeAltumAgentActions tem export nomeado de módulo servidor para exercitar
  o executor efetivo, sem criar rota pública. Três testes adicionais passam por
  claims e pelas ações reais, sem modelo/canal: handoff válido e replay único;
  mensagem alterada durante o claim não cria tarefa/evento/notificação e encerra
  claim como skipped_precondition; mudança durante loadTenantPipelineConfig impede
  salvar o perfil derivado, mantendo a revisão anterior do cadastro.
- Suíte final 39183: 9/9 em 26,72 s. Tipagem final 95375 e lint 52613 aprovados
  com saída zero. Sem processo dessas verificações em andamento. Não repetir
  regressão integrada sem mudança de runtime.

## Unidade 11 — referência de mídia e estados honestos na ficha

- message-media-source captura gerações de mensagem/conversa/canal e identidade
  do anexo antes do download. A referência só é gravada na mesma fonte vigente;
  receipts/texto/anotações auxiliares não invalidam o anexo por si só.
- Caches inbound/Evolution, recuperação e reprodução usam essa fonte. Os webhooks
  capturam antes do trabalho tardio; falha antiga não recria mensagem nem substitui
  um cache novo. Referências novas registram a geração; legado continua legível.
- GET autenticado verifica acesso corrente em transação, incluindo escopo do canal,
  antes de retornar bytes ou URL. Revogação durante assinatura retorna 403 sem URL.
  URLs já emitidas conservam expiração legada; não alegar revogação retroativa.
- Sete testes de fonte incluem download real do cache com transporte fictício e
  recriação durante espera, exclusão, edição, pai recriado, convergência e caminho
  de outra conversa. Com reprodução e sync: 16/16, 86,09 s, saída zero.
- Tipagem inicial identificou variável inferida incorretamente no novo helper e
  doc(undefined) em conversion-trail; ambos corrigidos. Tipagem final do conjunto,
  tipagem da tela e lint aprovados com saída zero. Nenhum canal/modelo real acionado.
- Ficha CRM remove padrões enganosos: ausência de data não vira "agora", resumo
  ausente não vira "ao vivo" nem "contexto pronto", objetivo/oferta ausentes não
  recebem instruções genéricas, dores ausentes aparecem como não identificadas.
  É correção de apresentação; não comprova atualização automática ou qualidade IA.
- Ampliação: produtor legado com URL diferente da persistida é recusado antes
  de download; payload parcial sem conflito continua compatível. Produtores que
  transformam bytes carregam a fonte capturada antes da transformação.
- Transferência de conversa de equipe e mudança do dono do canal pessoal são
  revalidadas ao gravar/ler mídia. Probe adicional revelou que assertChatCommercialAccess
  podia aceitar cache antigo do chat sem consultar o canal atual (rejeição esperada
  ausente em channel-access-probe.log). Agora toda admissão com canal consulta sua
  autoridade atual, valida empresa e então verifica o acesso do vendedor.
- Regressão ampliada final: 32/32 em 52,46 s (3336 saída zero), incluindo os 13
  cenários da fundação CRM. Tipagem 49611 e lint 2881 aprovados. O conjunto de
  19 testes anterior precede a última asserção da permissão geral; usar o final.

## Unidade 9 — memória do agente e anotação multimodal

- handleIncomingMessage captura contexto antes de análise e passa a mesma fronteira
  às três chamadas de upsertLeadMemory (pausa, handoff e resposta). Escrita da
  memória confere contexto dentro da transação; fonte/negociação alterada não cria
  nem atualiza ai_lead_memory. Ainda NÃO protege todos os efeitos de ExecuteAltumAgentActions.
- Memória registra geração do cadastro; leitura/escrita recusam outro tenant/lead,
  geração anterior e legado anterior à recriação do pai. Registro recusado fica
  preservado para revisão. Legado criado sob o pai atual continua compatível.
- IDs completos de evidência de até 240 caracteres são preservados na memória e
  normalização de relationship-state, sem truncar a referência em 180.
- Anotação de áudio/imagem/vídeo/documento tem preflight da fonte persistida e
  transação por geração/revisão. Não ressuscita documento nem sobrescreve edição.
  A escrita própria pode avançar sua versão com token de autoria, comparação do
  corpo e das anotações aceitas e contexto revalidado; nunca aceita revisão nova
  arbitrária após uma transcrição. Cached/texto mantêm versão; fallback permanece.
- O token técnico aiMediaWriteToken prova somente autoria da anotação, NÃO que
  descrição visual/transcrição seja fato comercial correto ou fala literal do cliente.
  Precisão de extração e atribuição de fatos ainda exigem avaliação da fase de IA.
- Helper novo: lib/server/ai/inbound-enrichment-write.ts. Cache físico de mídia é
  outro caminho e não foi protegido por esse helper: seus produtores são parciais.
- 17 casos iniciais aprovados. Dois casos reais adicionais exigiam canal de teste;
  a fixture passou a configurar canal fictício ativo, sem afrouxar o runtime.
  Ambos passaram, incluindo agente pausado com texto/vídeo e mudança posterior de
  negociação. Configuração altum_rules e bloqueio/contagem de transporte externo;
  nenhuma chamada real a modelo/canal. Não é avaliação de qualidade de modelo.
- Regressão final: 73/73 em 125,37 s, sessão 65710/PID 10576 saída zero; nove
  arquivos (memória, relação/contexto, extração, restrição de testes e reprodução).
  Tipagem/lint finais aprovados: 68004/69038, saída zero. Logs e recibo em
  .qa-artifacts/crm-agent-memory. Sem processo desta unidade em execução.

## Unidade 10 — identidade e imutabilidade do arquivo recebido

- Probe no Storage emulado confirmou dois IDs de 240 caracteres com mesmo prefixo
  de 180 apontando ao mesmo objeto; salvar B alterava arquivo de A. Evidência
  media-path-probe.json. O probe limpou apenas seus arquivos fictícios.
- saveChatMediaBuffer agora calcula identidade com identificadores COMPLETOS,
  papel, MIME e bytes, mantendo prefixo apenas legível. Usa gravação imutável já
  existente; repetição reutiliza geração e conteúdo diferente não substitui aceito.
  Leitores e links antigos permanecem; não migrou arquivos existentes.
- Probe posterior: caminhos distintos e original preservado
  (media-path-probe-verified.json). Sete testes novos e reprodução/resolve=1:
  9/9 em 20,49 s, sessão 43093 saída zero.
- Regressão adicional com voz e idempotência de envio em execução: sessão 34057,
  PID 9584: terminou 30/30 em 172,48 s, sessão 34057 saída zero, log
  .qa-artifacts/crm-media-identity/regression-final.log. Tipagem inicial (7849)
  encontrou inferência Buffer<ArrayBuffer> estreita na fixture antiga de playback;
  anotação explícita Buffer, sem alterar bytes ou lógica. Tipagem/lint finais
  71591/75417 aprovados com saída zero; lint inicial 80181 também aprovado.
  Nenhum teste, compilação ou check deste lote permanece em execução.
- Continuação obrigatória: arquivo imutável não basta para impedir referência
  tardia errada no banco. Conferir snapshots anteriores aos downloads em cache
  multimodal, Evolution, rota media GET e reprodução. saveChatMediaBuffer não é
  autoridade para associar arquivo a uma mensagem. Não habilitar nova UI por este lote.
- Probe adicional depois da correção confirmou a pendência de referência: cache
  de A termina após recriar mensagem como B, e associa arquivo de A ao novo
  documento porque confere somente tenant/chat. stale-cache-probe.json registra
  messageRecreated=true, generationChanged=true e staleFileAssociated=true.
  Script isolado limpou apenas sua mensagem/arquivos fictícios. Isto é reprodução
  de defeito ainda ABERTO, não teste aprovado da associação. Priorizar sua correção
  em todos os produtores antes da integração de nova negociação na UI.

## Unidade 8 — projeção e efeitos de etapa da observação

- Projeção do observer, tarefas derivadas, evento de etapa e histórico de cada
  tarefa passam pelo mesmo commit transacional, com contexto e funil correntes.
  Erro na gravação de qualquer item desfaz também a projeção e a ocorrência.
- Tarefas novas têm ID por mensagem/geração/chave, fonte/evidência, versão 1 e
  responsável atual do cadastro. Repetição não reabre, reagenda ou reescreve tarefa
  revisada pelo vendedor. Deduplicação olha todas as pendências, não só 24.
- commitAutomaticLeadPatch prepara leituras/efeitos internos antes da primeira
  escrita. Chamadas legadas sem esse plano preservam seu caminho anterior;
  cobertura não é uniforme apenas por existir o helper.
- Avanço do observer persiste crm_conversation_stage_transition junto da etapa.
  Consumidor imediato/periódico usa fonte conversation no protocolo existente de
  automações; revalida mensagem, gerações, contato, evento, responsável, autoria
  manual da etapa, funil, módulo CRM e bloqueio comercial da empresa.
- Automação interna, quota, agendamento e envio usam essa fonte. Um novo negócio
  depois do enqueue impede tentativa no provedor; prazo original ainda válido não
  substitui autorização. O provedor dos testes é simulado, sem conta real.
- Interrupção depois de iniciar efeitos fica reconciliation_required, sem repetir
  efeitos incertos automaticamente. Retomada assistida e curadoria dessa pendência
  ainda precisam de experiência operacional; não descrever como recuperação total.
- Hooks existentes de aprendizado/conversão são mantidos, com conferência antes
  de cada chamada. Essa conferência não prova atomicidade/idempotência dentro dos
  próprios hooks; ainda auditar até seus pontos de escrita/tentativa externa.
- Arquivos novos: conversation-projection-effects e conversation-stage-transition.
  Integração em operations, field-ownership, stage-source-contract,
  automation-stage-delivery e consumidor periódico automations. Sem alteração em
  admin, autenticação, dados reais ou interface de oportunidades.
- Casos específicos finais: 29/29 em 71,39 s (stage-delivery), com fluxos reais do
  worker/outbox e provedor falso. Tipagem e lint do recorte final aprovados (sessões
  62726/16887, typecheck-final/lint-final, saídas zero). Teste final acrescentou
  somente asserção de rollback da ocorrência. Regressão integrada terminou 115/115
  em 364,60 s, sessão 63281 saída zero (crm-projection/regression-final.log):
  contexto/projeção, observer passivo, ocorrência manual e entrega de automações.
  São conjuntos sobrepostos; não somar com 29 como casos únicos adicionais.
- Cópia integral atualizada para compilação: 1788 arquivos, sem .env; snapshot
  crm-activities-build-1792561854842/source-manifest.json. Refresh inicial parou
  porque git listava arquivo já removido no checkout; cópia respeitou a remoção,
  sem recriar arquivo no projeto. Build context-stage: sessão 10790, PID 13448,
  build-context-stage.log nesse snapshot e build-context-stage-result.json. Sessão
  10790 coletada com saída zero; bundler, tipos e geração de páginas concluídos.
  Nenhuma compilação ou teste desta unidade permanece em execução.
- Revisão após congelar a cópia reproduziu um limite incompatível: observer aceita
  messageId de até 240 caracteres, mas o consumidor usava limite de identidade
  de contato (220). Teste isolado reprovou antes da correção; validação da mensagem
  agora segue 240 sem ampliar tenant/lead/chat. A cópia em compilação ANTECEDE essa
  correção pequena e o teste adicional. Conjunto atual: 30/30 em 108,57 s
  (context-compatible-final), sessão 63115 saída zero; tipagem e lint direcionados
  aprovados (33517/73553, typecheck/lint-compatible-final). Não apresentar o build
  congelado como prova dessa última alteração. A compilação congelada passou por
  bundler (5,6 min), tipos (2,2 min) e geração de páginas; resultado final zero.

## Unidade 7 — identidade no intake e admissão de contexto

- Repetição da criação de oportunidade agora resolve o contato canônico atual,
  inclusive após unificação; não regrava negociação nem desfaz edição humana.
  Falha reproduzida antes da correção; teste isolado posterior aprovado.
- Intake distingue cadastro de entrada legado de compras explícitas. Consulta
  todas as páginas de candidatos em vez de tomar o primeiro ou rejeitar uma pessoa
  só por possuir compras diferentes. Contato canônico e vínculo recíproco precisam
  concordar; pessoas diferentes continuam sendo conflito e oportunidade isolada
  não vira cadastro de entrada. Cobertura inclui 201 compras e conflito na última.
- Com vários vínculos, intake devolve requiresOpportunityContext, mantém campos
  comerciais recebidos na evidência do evento e não substitui customFields nem
  chama derivação comercial do cadastro antigo. Perfil/atribuição de entrada
  preservam compatibilidade. Isso não escolhe a oportunidade da conversa.
- Observer e entrada do agente aguardam contexto quando há múltiplas compras,
  contato inconsistente ou uma oportunidade sem seleção explícita suportada.
  Guardas do observer conferem mensagem e geração de lead, conversa e contato
  canônico nas gravações de fatos e projeção e na conclusão do recibo.
- Fila conserva awaiting_context com completedAt=null e sem consumo periódico de
  tentativas. Saúde sinaliza pendência. Retomada após seleção ainda NÃO entregue;
  não reprocessar mensagem antiga em uma compra nova sem fronteira/evidência.
- Helpers novos: contact-links e conversation-commercial-context. A função
  commitAutomaticLeadPatch admite verificação transacional opcional; observer
  passa seu contexto à derivação. Demais escritores ainda precisam de migração.
- Índices do intake preparados em firestore.indexes.json, sem publicação. Testes
  em emulador não comprovam índices prontos no ambiente real.
- Janela após projeção, efeitos causais e escritores tardios de memória do agente
  continuam abertos. Vínculos antigos a negócios excluídos são conservadoramente
  pendentes; recuperação/migração desses vínculos deve ser explícita.
- Validação inicial: 57/57 para intake, ocorrência e oportunidades antes da última
  ampliação (log intake-context-regression). Regressão ampliada terminou 131/132
  em 435,06 s, com somente a fixture descrita abaixo reprovada. Não apresentar
  essa execução como integralmente aprovada.
- Regressão de automação encontrou fixture antiga que dependia do funil deixado
  por outro teste (e falhava isoladamente). Agora prepara seu próprio funil válido;
  não afrouxou validação de etapas nem autoridade. Isolado corrigido: 1/1.
- Após a correção da fixture, arquivo completo de automações: 58/58 em 202,02 s
  (automation-context-final), saída zero. Não apenas o teste isolado.
- Admissão final verificada: 11/11, 25,69 s (conversation-context-verified), inclui
  recriação de conversa/contato, reassociação do lead a outra pessoa e vínculos
  malformados. Tipagem final aprovada (typecheck-conversation-context-verified,
  saída zero). Lint amplo anterior aprovado; checagem final dos dois arquivos
  ampliados aprovada em lint-contact-links-verified, sessão 37526 saída zero.
  Conjuntos sobrepostos; não somar contagens.
- Snapshot de hashes em crm-opportunities/context-source-manifest.json identifica
  fontes locais deste recorte. Nenhuma tela nova ou ambiente real validado aqui.

## Unidade 2 — avanços locais

- Missão registrada como meta ativa da conversa e em MISSAO_CRM_ALTUM.md.
- Inventário inicial em CRM_MATRIZ_CAMINHOS.md; cobertura ainda parcial.
- Direção de modelagem em CRM_CONTRATOS_DADOS.md: aproveitar contacts, leads e
  fontes de atividade existentes, sem duplicar sistemas.
- Exclusão em lote de conversas agora autoriza a seleção inteira e revalida o
  acesso antes de preparar cada exclusão, incluindo canais pessoais.
- Remoção compara arquivo e dado atual, usa transações por página e mantém a
  raiz até o fim; também verifica registros vinculados novos antes de remover a raiz.
- Cadastro pai é conferido antes de remover conversas filhas.
- Conflito devolve 409 nos endpoints de exclusão e preserva versão recente.
- Manifesto registra progresso/interrupção/conflito; cópia de exclusão incompleta
  não pode ser expurgada. Retenção sinaliza revisão e continua outros itens elegíveis.
- Recuperação de exclusão parcial identifica o documento original por createTime;
  recriar o mesmo ID/valores não autoriza sobrescrever o novo cadastro.
- Três reproduções iniciais de perda de atualização falharam antes da correção.
- Regressão: 53/53 em 329,71 s. Testes específicos finais: 7/7 em 66,12 s,
  incluindo falha após remover 200 de 220 anotações e recuperação das 220.
  Há sobreposição entre os conjuntos; não somar como 60 casos únicos.
- Logs: .qa-artifacts/crm-deletion/{baseline,regression-final,concurrency-latest,
  typecheck-latest,lint-latest}.log.
- Lint e tipagem finais do lote anterior aprovados (sessões 95120 e 92854).
- Autoridade da exclusão agora identifica usuário e capacidade nas quatro rotas
  públicas e nas conversas filhas. Cada página transacional lê as fontes de acesso,
  confere capacidade/módulo atuais e usa o dono atual do canal pessoal.
- Três novas falhas de revogação reproduzidas antes da correção; conjunto específico
  posterior aprovado: 10/10 em 29,36 s. Tipagem e lint deste recorte aprovados.
  Logs authority-{baseline,latest,regression}, typecheck-authority e lint-authority.
- Regressão da autoridade concluída: 57/57 em 107,25 s; sessão 76232 saída zero.
- Exclusão concorrente reproduzida com dois manifestos para o mesmo documento.
  A cópia agora reserva de forma atômica a geração original (createTime), sem
  permitir que outra chamada tome uma operação parcial. Proteção de geração
  também cobre raízes, pais, mensagens e demais documentos arquivados.
- Específicos da reserva: 11/11. Casos adicionais de geração, exclusão após
  restauração e perda de confirmação no preparo: 3/3 em 29,18 s. Há sobreposição
  com a regressão ampliada; não somar contagens como casos únicos.
- Regressão final da reserva: 61/61 em 157,85 s, saída zero (87829).
  Tipagem (5773) e lint (93513) aprovados. Logs reservation-regression,
  typecheck-reservation e lint-reservation. Nenhum processo deste recorte pendente.
- No lote 2, falha de preparo mantinha originais e reserva; a verificação da
  preparação encerrada foi acrescentada na unidade 3 abaixo.
  A reserva não expira automaticamente: não permitir nova exclusão até recuperar
  ou conciliar a anterior. Essa proteção ainda exige uma saída acionável na UI.

## Unidade 3 — recuperação e Lixeira

- Escritas da cópia são aguardadas individualmente antes de marcar falha de preparo.
  Um erro individual não vira sucesso silencioso nem permite iniciar a remoção.
- Preparação encerrada com erro pode ser verificada: se todos os documentos e
  objetos esperados foram persistidos, a cópia é habilitada para recuperação.
  Há atualização condicional para impedir duas verificações de mudar o mesmo recibo.
- Cópia realmente incompleta continua protegida; versões humanas recentes bloqueiam
  sobrescrita. Processo travado em creating não é tomado por este fluxo.
- Lixeira apresenta exclusão pendente, motivo comercial e ação de recuperação;
  exclusão definitiva só aparece para árvore com cópias completas e remoção concluída.
  Prazo de retenção não é mais anunciado como 30 dias fixos.
- Listagem completa paginada no servidor e agrupamento de filhos sem varredura
  quadrática. Retenção percorre todas as páginas, mantém itens pendentes protegidos
  e continua após falha individual (retorna failed e needsReview).
- Índice tenant_trash(tenantId,expiresAt) preparado em firestore.indexes.json.
  Não publicado. Emulador não substitui verificação do índice no ambiente entregue.
- Falhas reproduzidas antes: recuperação com confirmação perdida e listagem de
  pendência; retenção parava nos primeiros 200. Novos casos específicos: 4/4.
- Regressão completa deste recorte: 65/65 em 154,16 s, sessão 82632 saída zero.
  Tipagem 77644 e lint 25700 aprovados; logs preparation-regression,
  typecheck-preparation-final e lint-preparation-final em .qa-artifacts/crm-deletion.
- QA em navegador da página real e componentes compartilhados com transporte e
  contexto fictícios isolados: 8 jornadas (desktop, celular 390px, proteção de expurgo,
  recuperação com erro/sucesso, confirmação de exclusão, perfil restrito, vazio/erro).
  Não é prova de autenticação/API/integração reais nem do layout completo com menu.
  Fontes, screenshots e result.json em .qa-artifacts/crm-trash-ui.
- Inspeção visual encontrou texto comprimido no celular; grade responsiva coloca
  ações abaixo dos detalhes e os testes verificam largura de leitura e dos botões.
  Rechecagem final: 8/8, nenhuma exceção no navegador; imagem mobile revisada.
  Lint da tela após o ajuste responsivo aprovado (91074). Servidor/Chromium do QA encerrados.

## Riscos ainda abertos nesta frente

- Restauração/expurgo ainda precisam de auditoria de revogação e reserva durante operações longas.
- Reserva de exclusão implementada e testada localmente; resolução de operações
  interrompidas ainda necessária antes de fechar a frente integral.
- Falha entre páginas pode exigir recuperação; não há atomicidade global nem
  conciliação automática de mudanças humanas ocorridas durante a exclusão.
- Restauração de árvore e interrupção durante preparo do manifesto precisam de
  retomada exclusiva e testes adicionais de falha de armazenamento.
- Estender a prova de geração original usada na recuperação de leads também
  para conversas e registros filhos recriados com o mesmo ID/dados na restauração.
- Conflito com dado humano recente deve oferecer conciliação que preserve essa
  versão. Hoje há bloqueio seguro, mas ainda não há resolução completa na interface;
  não trocar por sobrescrita ou liberar reserva sem prova de recuperação.
- Retenção agora pagina tudo; medir duração e carga com volume alto e definir
  orçamento/retomada do worker antes de homologar desempenho.
- Lixeira sinaliza revisão; conciliação campo a campo e preparo realmente incompleto
  ainda exigem fluxo adicional. Não apresentar verificação da cópia como recuperação garantida.
- Sem build global, QA visual, publicação, dados reais ou aceite humano neste lote.

## Unidade 4 — retornos comerciais

- Nova fronteira manual activity-mutation.ts: criação/edição/status com permissão
  corrente na transação, responsável explícito, prazo opcional, datas inválidas
  rejeitadas e evento no mesmo commit. Cancelamento/conclusão têm instante real.
- Criação com requestId retorna o mesmo taskId em repetição, protege contra trocar
  o conteúdo do pedido e preserva edições humanas posteriores. Caminho legado sem
  requestId mantém deduplicação pendente por título/tipo/prazo/responsável.
- PATCH aceita edição/reagendamento sem reabrir; corpo sem ação e estado inválido
  não viram pending. Versão otimista e revisão real updateTime impedem sobrescrever
  escritores legados que ainda não incrementam version. Pedido já aplicado é no-op.
- GET activities adapta lead_tasks e appointments, sem terceira coleção, com IDs
  estáveis, instante ISO, origem manual/ai/legacy, escopo e lista de oportunidades
  acessíveis completa. Tarefas e oportunidades alheias não são expostas.
- A API informa capacidade de escrita atual; cliente bloqueado perde controles e
  limpa dados da atividade ao receber negação, mesmo com sessão de UI antiga.
- CommercialActivities é usado na ficha desktop, ficha mobile e Agenda. Criar,
  editar, reagendar, concluir/cancelar/reabrir alteram o mesmo lead_tasks; alterações
  sincronizam instâncias abertas via evento. Lista não é cortada em 100 registros.
- Agenda distingue Retornos e Compromissos; links antigos com leadId continuam
  abrindo compromissos. Retornos sem prazo são planejamento, não reunião com data inventada.
- Próximo retorno registrado precede texto automático no destaque da ficha desktop;
  a ficha mobile mostra atividades reais no lugar de confiar só em aiNextAction.
- Horários de retornos convertidos do fuso local do navegador para ISO explícito;
  formulário de compromissos também teve default e envio corrigidos. Fuso do
  negócio distinto do dispositivo ainda exige configuração/UX e homologação própria.
- Sete falhas de baseline de tarefas reproduzidas antes da correção. Regressão
  atual: 30/30 em 73,67 s (54416), incluindo 12 casos de atividades e 18 de fundação/
  rotas manuais. Logs em .qa-artifacts/crm-activities. Há sobreposição com lotes anteriores.
- Tipagem/lint do recorte aprovados nos processos 92641 e 71334. Tipagem após
  ajuste final de formulário de compromisso aprovada (48157); lint final da Agenda
  também aprovado (83750). Nenhum processo de testes/lint/tipagem do recorte pendente.
- QA de navegador: componente real -> handlers reais via HTTP -> Auth/Firestore
  emulados; contexto externo da sessão substituído. Dez jornadas aprovadas em
  crm-activities-ui/result.json. Inclui perda de confirmação, escritor legado sem
  version, perfil revogado e página real de Agenda. O caso de horário de compromisso
  intercepta o transporte antes dos efeitos e confere o ISO enviado; não prova os
  hooks ou criação/delivery real do compromisso.
  A página real de Agenda foi verificada; ficha completa/Next shell não foram homologados.
- Build congelado com 1.763 arquivos, sem .env reais: .qa-artifacts/
  crm-activities-build-1792561854842. Next 16.3.8 webpack: bundler aprovado em 8,7 min,
  mas tipagem global rejeitou quatro contratos de rotas/páginas fora do novo endpoint
  de atividades. Sessão 87414 concluída com saída 1. Manifesto identifica as fontes.
  Diferenças dos dez arquivos de runtime deste lote em build-source-differences.json
  (na pasta crm-activities). Build terminal, já pode atualizar fontes congeladas.

## Pendências específicas de atividades

- Leitores/escritores a migrar e auditar: crm/operations, crm/handoff, ai/agent, proactive-processor,
  automations, automation-internal-effect, automation-proposal-delivery, ecommerce,
  social/service, MCP drafts/apply e calls/start. Não estão todos na nova fronteira.
- A revisão real protege o formulário novo de mudanças legadas; não significa que
  todos os escritores já respeitam decisões humanas, autoridade, efeitos e recibos.
- Compartilhamento por atividade/transferência de carteira ainda precisa de contrato.
  Atribuição atual só permite vendedor ativo que já tenha acesso à oportunidade.
- Reuniões mantêm API antiga e efeitos; reserva concorrente de horário, idempotência
  e mutação unificada não estão concluídas. Conversão, agendamento e venda continuam distintos.
- Homologar páginas completas com shell, menu e autenticação reais; configurar
  fuso do negócio; medir leitura integral e paginação por período com carga.

## Pendências integrais

Todas as frentes 0–7 permanecem abertas até seus critérios completos. Não converter
o primeiro lote ou a criação desta missão em conclusão do CRM.

## Unidade 5 — contratos do Next e compilação

- Guias locais page.md/route.md lidos. listRecentChats/listChatMessages movidos
  literalmente para lib/server/conversation-queries.ts; handlers e ordenação preservados.
  Testes e importadores usam o serviço. Nenhuma função extra é exportada pelas rotas.
- Corpo da assinatura extraído para components/client/subscription-screen.tsx.
  Página é wrapper sem props arbitrárias; Faturamento usa o componente com tenantId.
  Comparação contra cópia anterior provou corpo idêntico, exceto nome da função;
  não foram alterados autenticação, regras de cobrança ou endpoints financeiros.
- Paginação: 6/6 (1.501 conversas, 2.001 mensagens, empates e chegada tardia).
  Sincronização externa: 6/6. Tipagem/lint aprovados (3549/57474), logs em crm-build-repair.
- Primeiro snapshot: bundler aprovou, quatro erros de contrato de Next na tipagem.
  Segundo (34564): bundler 7,8 min e tipagem global 4,8 min aprovados; prerender
  rejeitou Firebase auth/invalid-api-key pois nenhum .env real foi copiado.
  Não corrigir esse erro desativando auth nem copiando credenciais de produção.
- Build configurado usa valores públicos fictícios e serviços demo. Processo 46565
  concluído com saída zero, incluindo geração das páginas; logs/resultados distintos
  dos anteriores. Nenhum processo desta unidade permanece pendente. Não é prova
  de configuração, acesso ou publicação em produção nem da alteração posterior de valor null.

## Unidade 6 — pessoa com várias oportunidades (backend local)

- Nova rota GET/POST leads/[leadId]/opportunities e serviço opportunities.ts.
  Referência inicial exige acesso atual ao registro; mesma pessoa reutilizada via
  contacts/aliases. Não passa pelo intake que deduplica por telefone.
- Nova negociação tem ID próprio, título, responsável, etapa aberta real da empresa,
  valor previsto opcional e evento/auditoria. Não copia proposta, financeiro, resultado,
  resumo da IA ou tarefas da venda anterior; não agenda welcome/conversão como novo cliente.
- Criação, vínculo com a pessoa e histórico são atômicos. requestId reutiliza a
  ocorrência sem sobrescrever correção posterior; revisão real protege a origem.
  Etapa manual explícita recebe autoria existente; default permanece etapa aberta.
- Mesmo nome não une pessoas. Contato sem identificador recebe identidade própria
  por geração do registro; primeira identificação posterior mantém as negociações.
  Alias interno type=lead no armazenamento existente coordena essa associação por
  CAS, sem criar terceira coleção nem alterar a versão do lead só para enriquecer pessoa.
- Mantido upsert otimista anterior (sem locks pessimistas). Perfil/aliases continuam
  atômicos e respeitam rejeições de armazenamento e alterações humanas concorrentes.
- Leitura segue redirects, recusa ciclos/empresa divergente/identificadores conflitantes
  e filtra cada negociação pela carteira atual. Acesso a uma não expõe as outras.
- Leitura de família é transação readOnly; caminhos ligados não fazem três buscas
  legadas desnecessárias. Índices de contacts/leadIds/leadId/primaryLeadId e leads/contactId
  preparados em firestore.indexes.json; não implantados.
- Valor desconhecido é null na criação e na família, distinguindo zero informado.
  Esta última alteração ainda não está no snapshot do build em andamento.
- Novas oportunidades: 13/13 em 72,91 s (24426). Regressão de identidade/perfis:
  35/35 em 89,29 s (64587), anterior ao caso adicional de valor ausente. Não somar
  os conjuntos. Tipagem/lint finais aprovados (33348/80810).
- Uma execução sob compilação concorrente encerrou o teste de quatro processos
  no timeout original de 25 s (31/32). Repetição isolada passou em 9,24 s, com o
  limite preservado; regressão final sequencial passou nos 35. Registrar carga do host
  antes de atribuir isso a garantia de desempenho de produção.
- Logs: .qa-artifacts/crm-opportunities/{first,optimized,identity-regression,
  distributed-isolated,identity-final,opportunities-final,typecheck-final,lint-final}.log.

## Pendências de contato/oportunidade antes de habilitar o fluxo completo

- Nenhuma UI de nova oportunidade entregue neste lote. Não anunciar fluxo pronto.
- Resolver contexto de conversa/intake/observação/agente com múltiplas negociações;
  suporte, continuação e nova compra não podem ser escolhidos só pelo telefone.
- Replay da criação após merge retorna a pessoa canônica na regressão atual;
  conferir os demais consumidores de identidade antes do rollout integral.
- Unidade 44 preserva título/kind/contactId e valor desconhecido nos principais
  DTOs, busca e apresentação. Exportação, demais consumidores e indicadores
  ainda exigem fechamento próprio antes da homologação integral.
- Separar contagem de pessoas de negociações, quota contacts, aquisição/recompra,
  ganho e receita; nova negociação não é novo cliente ou novo pagamento.
- Migração/preview de referências legadas e compartilhamento por perfil ainda abertos.
  Alias interno não transforma dados antigos em identidade ou fatos verificados.
- Exclusão de oportunidade deve preservar pessoa e demais negócios; ação de excluir
  pessoa inteira exige escopo, árvore e restauração próprios. Corrigir rótulos e caminhos.

## Leituras do baseline de atividades (superadas parcialmente pela unidade 4)

- tasks/route.ts: aceita dueAt, mas data inválida vira null; criação não grava
  responsável explícito e usa duas gravações independentes para tarefa/evento.
- tasks/[taskId]/route.ts: apenas status; corpo desconhecido reabre tarefa;
  não permite reagendar, alterar título ou responsável. Leitura/gravação separadas.
- appointments/route.ts: já lista todas as páginas e filtra proprietário; consulta
  de conflito e criação ainda não são um commit exclusivo. Não modificar efeitos
  de conversão/aprendizado sem recibo causal e teste.
- agenda/page.tsx: só carrega appointments. As tarefas comerciais da ficha
  continuam fora da Agenda. Contrato de integração previsto em CRM_CONTRATOS_DADOS.

## Unidade 43 — liberar informações corrigidas para novas atualizações da IA

- Problema: a revisão humana protegia o campo, mas não havia opção para devolver
  sua atualização à IA mantendo a origem verdadeira e impedindo reuso de análises
  antigas. Os dois escritores conhecidos de `aiFieldEvidence` foram examinados.
- Revisão GET expõe campos protegidos; PATCH recebe liberações selecionadas na
  mesma transação de autorização, revisão exata, correções e evento. Sem escrita
  fora da carteira, campos arbitrários, autoria inventada ou liberação/correção
  simultânea do mesmo campo. Repetição de revisão salva retorna conflito.
- Liberação preserva valor, fonte manual e autor. Um horário de commit do banco
  estabelece o limite: só uma mensagem do cliente realmente armazenada depois
  dele pode substituir o campo. O observador confere a origem e conserva o limite
  nas evidências posteriores. Atualizar ou reprocessar mensagem antiga não basta.
- O agente baseado em memória não tem prova de ocorrência e permanece bloqueado
  nesses campos, mesmo após a substituição pelo observador. Uma nova correção
  humana restabelece a proteção. A liberação não chama modelos nem envia mensagens.
- Interface permite selecionar a liberação por campo protegido; editar esse campo
  desmarca sua liberação. A seleção só produz efeito ao salvar, sem descartar os
  outros rascunhos. Interface implementada, mas não homologada visualmente.
- Rodada ampliada: **54/54**, exit 0, 193.744 ms, incluindo observação, extração
  semântica simulada, filas, mudanças de origem, permissões, falhas e extração
  determinística. Log `.qa-artifacts/crm-qualification-release-regression.log`.
  Após endurecer a rejeição de liberação sem limite e acrescentar cenários de
  campo vazio e disputa simultânea, rodada específica final **13/13**, exit 0,
  40.204 ms: `.qa-artifacts/crm-qualification-release-final-tests.log`.
  As rodadas se sobrepõem; não somar seus resultados como casos distintos.
- Tipagem final com `tests/tsconfig.crm-qualification.json`: exit 0;
  `.qa-artifacts/crm-qualification-release-final-types.log`. Lint dos sete arquivos
  de implementação/testes: exit 0;
  `.qa-artifacts/crm-qualification-release-final-lint.log`.
- Provas com banco/autenticação locais e provedor simulado; nenhuma nova chamada
  paga ou envio ao cliente. Não comprovam canais reais, precisão do modelo real,
  experiência visual ou desempenho integral. Roteiro manual recebeu cenário 19.
- Sem alteração em admin/autenticação/rotas antigas, migração ou publicação real.
  Build completo não repetido: disco C: conferido com 193.024.000 bytes livres,
  abaixo do mínimo de 6 GiB. Limpeza anteriormente bloqueada não foi contornada.
- Contrato, limites e reversão em `CRM_QUALIFICACAO_CONTROLE_HUMANO.md`.
  Plano integral permanece aberto: múltiplas oportunidades, cobertura de todos
  os caminhos de escrita, gestão conciliável, avaliação real, experiência e
  desempenho, pacote de publicação/migração e aceite completo.

## Unidade 44 — identidade da negociação e valor desconhecido nas leituras

- Corrigidos os DTOs de lista, ficha, funil, busca e contexto comercial da conversa:
  preservam título, tipo e vínculo de pessoa da oportunidade. Nome do cliente não
  é substituído pelo título. Identificador estruturalmente válido não comprova
  identidade entre canais; serviço de identidade mantém suas verificações.
- Leitura comum preserva valor desconhecido como null e zero declarado como zero.
  Um null explícito não ressuscita valorPotencial antigo. A família usa a mesma
  regra. Não houve transformação em massa dos registros existentes.
- Formulário preserva zero ao abrir e envia vazio como null. APIs manuais de
  criação/edição aceitam vazio como desconhecido e rejeitam valor malformado,
  negativo ou acima de 1e12 antes de gravar. Histórico não chama null de zero.
- Título aparece na lista, cartão do funil, ficha, desenho móvel e contexto da
  conversa; busca global pesquisa/apresenta título. Seletores acessíveis também
  distinguem as negociações pelo título. Aceite visual/teclado ainda pendente.
- Totais locais e do funil informam valores conhecidos/ausentes. Métrica da visão
  não afirma tratar só de oportunidades abertas. Funil mantém totalLeads legado,
  acrescenta contagens de registros/tipos e coverage; até 241 leituras de registros
  na consulta para devolver 240 e informar hasMore. Não é paginação integral nem
  contagem de pessoas únicas, aquisição, receita ou resultado global.
- Primeira execução: 20/21, falha no novo teste que procurava a propriedade leads
  em vez do contrato real items. Corrigido o teste, preservada a API. Log
  .qa-artifacts/crm-commercial-record-tests.log.
- Regressão autenticada/pura: **27/27**, exit 0, 70.476 ms, incluindo permissões,
  histórico atômico, concorrência, mesma pessoa/várias compras, replay canônico,
  contrato entre as cinco leituras, busca por título, desconhecido versus zero
  e rejeição sem gravação. Log .qa-artifacts/crm-commercial-record-regression.log.
- Caso posterior de cobertura com 245 registros: **1/1**, exit 0, 38.932 ms;
  .qa-artifacts/crm-commercial-record-coverage.log. Não é benchmark com 10 mil
  registros nem medida de latência de produção. Não somar rodadas sobrepostas.
- Lint completo dos 12 arquivos desta unidade aprovado, exit 0:
  .qa-artifacts/crm-commercial-record-final-lint.log. Tipagem inicial com inclusão
  da página de conversas apontou declarações CSS do Next ausentes no tsconfig de
  teste; incluído next-env.d.ts oficial, sem ignorar erros. Repetição passou,
  exit 0: .qa-artifacts/crm-commercial-record-final-types-retry.log. Verificação
  final após rótulos/tipos adicionais também aprovada, ambos exit 0:
  .qa-artifacts/crm-commercial-record-verified-types.log e
  .qa-artifacts/crm-commercial-record-labels-lint.log. Processos encerrados.
- Provas em Auth/Firestore locais e transporte restrito a localhost. Nenhum
  envio, modelo pago, migração/publicação real ou alteração em admin/autenticação.
  Build completo não repetido por espaço insuficiente (203.747.328 bytes livres
  conferidos em C:). Não houve tentativa de contornar a limpeza bloqueada.
- Contrato/reversão: CRM_IDENTIDADE_VALORES_LEITURA.md. Cenário visual 20 preparado
  e não executado. Plano integral continua aberto, incluindo interface de nova
  compra, seleção explícita da oportunidade na conversa e seus limites históricos,
  exclusão de compra versus pessoa, todos os escritores, gestão conciliável,
  exportação/migração, avaliação real, experiência, desempenho e publicação.

## Unidade 45 — escolha da negociação e limite histórico da conversa (servidor)

- GET/PATCH chats/[chatId]/commercial-context e serviço transacional implementados.
  Exigem autenticação, módulos CRM/Conversas, carteira atual da conversa/registro,
  canal pessoal atual e, para gravar, edit_leads + respond_inbox. Grupos recusados.
  Negociação diferente exige pessoa canônica comum e vínculo recíproco; nome e
  telefone não selecionam compra. Corpo com autoria/campos extras é rejeitado.
- Revisão do chat protege concorrência. RequestId e geração do chat identificam a
  escolha; replay não renova horário nem restaura uma associação superada. Evento
  e associação são gravados juntos. Não copia dados da compra anterior nem retoma IA.
- Observador exige evento correspondente e gerações atuais, e limita suas fontes
  à criação real e à data de ocorrência posteriores ao commit da escolha. Importação
  tardia e alteração da data de uma mensagem antiga não atravessam esse limite.
- A escolha integra binding de fila, identidade de recibos, extração semântica,
  projeções e etapas. Trabalho antigo/reseleção/resultado tardio não podem gravar
  na nova escolha; tentativa paga simulada já iniciada fica registrada e não repete.
- Resumo comercial e handoff receberam janela da compra selecionada: não reciclam
  texto, última resposta ou contador anterior. Conversa explicitamente de outra
  compra não entra por telefone. IDs reais dos documentos prevalecem sobre campo id
  armazenado. Transcrição normalizada com prova passa pela leitura existente.
- Achado adicional no teste: fonte com data numérica era omitida pela consulta com
  limite Timestamp, embora a observação pudesse terminar. A fonte exata agora é
  incluída, com geração/revisão conferidas, também no conjunto semântico. Não prova
  cobertura completa de histórico com tipos de data mistos; normalização pendente.
- Agente que responde continua bloqueado antes de restaurar memória/chamar modelo
  para seleção explícita, com motivo selected_commercial_context_agent_pending.
  Isolar memória, mídia, callbacks e todos os escritores é requisito antes do rollout.
- Primeira rodada: 5/7, dois erros nos novos testes (retorno results, não array;
  escopo de canal personal, não seller_private). Testes corrigidos sem enfraquecer
  acesso; rodada de contexto/seleção/identidade passou 44/44 (146.242 ms).
  .qa-artifacts/crm-conversation-selection-{tests,regression}.log.
- Rodada posterior de seleção/qualificação/semântica: 53/53 (152.477 ms), antes dos
  últimos casos de data/rollback e da inclusão da fonte exata.
  .qa-artifacts/crm-conversation-selection-final-tests.log.
  Rodada de datas: 10/11, revelou a omissão real da fonte numérica, corrigida acima;
  .qa-artifacts/crm-conversation-selection-acceptance.log. Resultados finais abaixo.
- Tipagem identificou metadados opcionais de DocumentSnapshot após ampliar a fonte
  e o tipo do mock de falha. Foram acrescentadas verificações de existência/versão,
  sem ignorar erros de compilação. Lint completo anterior passou; verificações
  finais com correções e regressão ampliada aprovadas, conforme evidências abaixo.
- Não há seletor na interface nem rollout real. Contextos explícitos ainda dependem
  de fechamento da memória de resposta, mídia independente, avisos de origem após
  troca, gerações históricas completas, associação dos canais, entregas pendentes,
  exclusão/restauração e recuperação. Atendimento sem negociação não deve gerar
  alerta de falta de escolha; conferir a finalização desses jobs antes de habilitar.
- Contrato/limites/reversão: CRM_CONTEXTO_CONVERSA_OPORTUNIDADE.md. Plano integral
  continua aberto, incluindo nova oportunidade na UI, todos os escritores,
  gestão conciliável, avaliação real, experiência, desempenho e publicação/migração.
- Apenas dados próprios fictícios e provedor simulado; nenhum novo envio ou modelo
  pago real. Sem admin/autenticação/rotas antigas alterados nesta unidade. Build
  completo não repetido: C: conferido com 194.777.088 bytes livres; limpeza bloqueada
  anteriormente não foi contornada. Acesso ao navegador continua sem aceite visual.

### Evidência final da unidade 45

- Regressão ampliada: **96/96**, exit 0, 294.509 ms; processo 99104 encerrado.
  .qa-artifacts/crm-conversation-selection-release-tests.log. Inclui 13 casos da
  seleção, contexto/projeção/etapas/recuperação, semântica simulada, revisão humana
  e identidades. Falhas injetadas de evento/hook foram esperadas e seus testes
  confirmaram rollback/recuperação; não são falhas reais ocultadas do resultado.
- Após a correção de metadados opcionais da fonte e do tipo do mock, tipagem
  passou, exit 0: .qa-artifacts/crm-conversation-selection-release-types-fixed.log.
  Lint das correções passou, exit 0:
  .qa-artifacts/crm-conversation-selection-source-fix-lint.log. Lint completo dos
  15 arquivos já havia passado em crm-conversation-selection-release-lint.log.
- GET agora distingue histórico legado do limite de novas mensagens aplicado
  após seleção. Conferência posterior **1/1**, exit 0, 22.286 ms:
  .qa-artifacts/crm-conversation-selection-boundary-dto.log. Tipagem final exit 0:
  .qa-artifacts/crm-conversation-selection-checked-types.log. Lint final exit 0:
  .qa-artifacts/crm-conversation-selection-boundary-lint.log. Processos encerrados.
- Rodadas têm sobreposição e não equivalem a 97 casos distintos. Não foram
  executadas validação visual, canais reais, modelo real, benchmark, migração
  ou publicação. Não fechar etapas integrais com base nessa regressão local.
- Leitura das regras atuais: chats permite atualização comercial, mas a nova
  subcoleção de escolhas não tem regra de escrita cliente e cai no deny global.
  O observador verifica seu evento, não apenas o campo editável no chat. Regras
  em produção e cobertura de todos os escritores ainda precisam ser auditadas;
  não houve alteração/implantação de regras nesta unidade.

## Unidade 46 — memória de conversa e execução vinculadas à escolha

- Memória runtime de conversa agora é lida/escrita em transação com pai atual,
  escopo empresa/conversa, geração e, quando explícita, fonte e seleção atuais.
  Chave por hash empresa/conversa/seleção preserva memória legada e cada escolha
  anterior. Sem fence elegível não acessa/escreve memória de seleção explícita.
- Colisão de identidade, pai ausente/recriado, geração divergente ou negociação
  diferente não autorizam memória. Fontes antigas e reseleção recusam leituras e
  gravações tardias. Agente encaminha o fence na leitura e nos efeitos runtime;
  bloqueio de resposta em seleção explícita permanece até fechar os demais caminhos.
- Claim da fila registra seleção atual. Autorização comum recusa efeito de worker
  cuja seleção mudou. Finalização/recuperação não publicam diagnóstico de compra
  anterior sobre controle humano atual; ocorrência exige conciliação.
- Continuação de efeitos finais confere seleção na admissão, antes/depois de cada
  efeito e no fechamento. Escrita runtime recusada por contexto não é marcada done.
  Não cancela mensagem previamente aceita nem assegura isolamento de todo efeito
  externo; leitores, memória de pessoa, catálogo e entregas ainda precisam fechar.
- Regressão de autoridade e seleção: **24/24**, exit 0, 125.283 ms;
  .qa-artifacts/crm-runtime-selection-regression.log (20363 encerrado).
- Recuperação/finalização/continuação/relacionamento: **26/26**, exit 0, 82.538 ms;
  .qa-artifacts/crm-runtime-selection-recovery.log (75679 encerrado). Provas incluem
  falha e perda de confirmação injetadas e esperadas. Teste de relacionamento
  recebeu pai de conversa e configuração explícita demo/localhost, credenciais
  vazias e encerramento do banco para respeitar o novo contrato de geração.
- Novo caso de seleção após claim: **1/1**, exit 0, 20.770 ms;
  .qa-artifacts/crm-runtime-selection-finalization.log (31095 encerrado).
  Controle humano e sua versão permaneceram intactos; job exige conciliação.
- Ajuste final exige geração armazenada no documento de seleção. Repetição de
  memória **2/2**, exit 0, 35.951 ms, em
  .qa-artifacts/crm-runtime-selection-final-memory.log. Tipagem ampliada final
  exit 0 em .qa-artifacts/crm-runtime-selection-verified-types.log e lint final
  exit 0 sem avisos em .qa-artifacts/crm-runtime-selection-verified-lint.log.
  Todos os processos de verificação desta unidade encerraram. Rodadas têm
  sobreposição; não somar como total de casos distintos.
- Tipagem ampliada revelou literal decision inferido como string num fixture de
  continuação existente; corrigido para o literal real. Lint inicial teve cinco
  imports sem uso no agente após a introdução de efeitos de continuação; removidos
  somente esses imports. Não foram removidos efeitos nem relaxada a checagem.
- Contrato documentado em CRM_CONTEXTO_CONVERSA_OPORTUNIDADE.md. Sem alterações
  visuais/admin/auth, migração/publicação ou novos modelos pagos/envios reais.
- Build geral continua pendente: disco C: conferido com 155.217.920 bytes livres,
  abaixo de 6 GiB. Limpeza previamente bloqueada não foi contornada.
- Missão integral aberta: seletor e nova oportunidade na UI, memória de pessoa e
  demais consumidores, mídia independente, efeitos pendentes, histórico acessível,
  todos os escritores/permissões, relatórios conciliáveis, experiência, avaliação
  real, desempenho e pacote de publicação/migração revisável.
