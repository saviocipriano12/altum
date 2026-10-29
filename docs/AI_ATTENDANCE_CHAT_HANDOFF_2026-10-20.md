# Passagem de chat — atendimento IA Shopify

Data: 20/10/2026, America/Sao_Paulo. Passagem solicitada pelo usuário para
continuar organizadamente em outro chat, sem reiniciar o projeto ou o plano.
Esta passagem não aprova fase, publicação ou qualidade conversacional.

## 1. Recepção e exclusividade

- Projeto local: C:/Users/Eu/ALTUM. Usar o mesmo checkout, não criar worktree
  vazio de mudanças não commitadas. Há 719 entradas no status na conferência;
  isso inclui MUITO trabalho alheio, não um manifesto de autoria desta missão.
- Chat de origem: 01a12106-8edb-79b1-a5d2-f01f8056ef2f. Não continuar implementação
  nele após esta passagem nem arquivá-lo/apagar seu histórico.
- O aplicativo confirmou objetivo persistente PAUSED. Automação existente
  concluir-atendimento-ia-shopify-da-altum também PAUSED. Preservar ambas as pausas;
  a transferência não é autorização para contorná-las ou criar objetivo concorrente.
- Novo chat: primeiro ler esta passagem e documentos, confirmar a recepção e
  aguardar o usuário mandar continuar antes de implementar. Não religar agendamento
  nem criar outra missão persistente automaticamente.
- Não há teste próprio em andamento na conferência. Portas 8080/9099/9199 sem
  listener nesta passagem; os PIDs/sessões antigos NÃO comprovam emuladores vivos.
  Verificar novamente antes de iniciar qualquer teste; preservar processos alheios.

## 2. Leitura obrigatória e intenção do produto

Ler AGENTS.md e instruções locais aplicáveis; antes de escrever código, o guia
pertinente em node_modules/next/dist/docs/. Depois:

1. docs/AI_ATTENDANCE_CONTINUOUS_MISSION.md — contrato e limites.
2. docs/AI_ATTENDANCE_REBUILD_PLAN_2026-10-19.md — A→B→C→D→E→F→G e C01–C21.
3. docs/AI_ATTENDANCE_CONTINUOUS_PROGRESS.md — histórico/evidências. A unidade mais
   recente está sob “Implementando — B/C09-C10-C16-C17, falhas transitórias do pedido”,
   antes do antigo “Ponto de retomada confirmado”; não presumir que EOF é o mais novo.
4. docs/AI_FOUNDATION_B_REMAINING_PRODUCERS_2026-10-20.md e
   docs/CONVERSAS_GATE_2_ATUAL.md — lacunas de fundação/gate ainda aberto.
5. AI_REBUILD_STAGE_A_EXIT_AUDIT.md, AI_REBUILD_SHOPIFY_CAPABILITY_MANIFEST.md e
   AI_REBUILD_STAGE_A_DECISIONS.md em docs/ conforme dependência da unidade.

O objetivo é conversa fluida e fiel ao negócio, memória por assunto, conhecimento
com fontes, produtos/variantes/preço/estoque e link direto Shopify, ferramentas reais,
CRM passivo durante atendimento humano, copiloto/transferência, observação e estilo
de vendedor com autoria/aprovação, configuração funcional. Não é apenas infraestrutura.
Somente Shopify nesta rodada; LF Multimarcas é candidata ao piloto e o próprio usuário
será revisor. Isso NÃO autoriza piloto, acesso real ou envio por si só.

## 3. Estado verdadeiro

- A encerrada em diagnóstico/contratos. B ABERTA. C/D e entrega integrada NÃO aprovadas.
- Não há novo agente conversacional entregue nem transformação de naturalidade provada.
- Última unidade concluída localmente: agendamentos causais de proposta/pedido,
  efeitos internos/CRM, cota, recibos, proteção humana e recuperação do consumidor leve.
- Ampla anterior 411/412 falhou em worker frio; repetição integral posterior passou
  412/412 em 562,07 s, zero falhas/skips/cancelamentos. Não somar execuções isoladas.
  Log: .qa-artifacts/stage-schedule-lazy-release-full-regression-20261020.log.
  Tipagem/lint aprovados no snapshot desse lote; hashes e sessões no progresso.
- Nenhum novo deploy por essa unidade. Não comprova produção, IA nova, SLA ou
  atendimento de mídia. A correção seguinte já modificou dois arquivos: 412/412
  NÃO aprova automaticamente o checkout atual.

## 4. Unidade interrompida — próxima implementação concreta

Arquivos:
- lib/server/crm/order-stage-transition.ts
- tests/crm-stage-transition.emulator.mts

Três testes novos reproduziram falhas de leitura transitória: admissão congelava
blocked_pipeline; pré-claim consumia ready antes de efeito; lote não isolava falha.
Baseline 0/3 (sessão 18243). Logs em .qa-artifacts/:
order-pipeline-errors-baseline-20261020.log e order-pipeline-errors-first-fix-20261020.log.

Patch parcial aplicado: admissão só captura TenantPipelineConfigurationError;
pré-claim só captura configuração inválida ou códigos explícitos CRM_STAGE_.
Erros de armazenamento preservam identidade e não mudam ready/attempt. Protocolo
inválido usa CRM_STAGE_PROTOCOL_INVALID. Catch após efeitos continua conservador.

Primeiro teste após patch terminou 2/3, uma falha, 43,87 s. Identificador da sessão
perdido, mas log completo existente e nenhum processo restante. Falha restante:
processPendingOrderPipelineTransitions aborta o lote com QA_ORDER_SOURCE_UNAVAILABLE
(código 14); ainda não tem isolamento por item/contador failed. Não foi corrigido.

Após autorização de retomada: corrigir esse lote preservando o ready sem tentativa
consumida quando leitura pré-claim falha; contar erro e permitir outra ocorrência
saudável. Não transformar armazenamento indisponível em defeito de configuração;
não reabrir raiz parcialmente executada nem reenviar efeito incerto.

Reexecutar os três testes com emuladores demo realmente prontos e transporte
externo bloqueado. Filtro: order pipeline admission|order pipeline preclaim|order pipeline batch.
Depois acrescentar prova de configuração inválida/estrangeira/ambígua, erro
desconhecido, preservação humana e efeito iniciado/replay; tipos/lint e regressão
sobre fonte estável. Não editar fontes/testes com o respectivo lote ainda rodando.

Hashes da passagem (reconferir se houve edição concorrente):
- order-stage-transition.ts:
  ff7e9fe9375f9c2c4c7b4654bc958dd2aed2c50b1c032a9d991915302a6ec2e5
- crm-stage-transition.emulator.mts:
  7a31b57b82cbcad3489eaaa0c59d7f3a05dc9205f4f647a7edee9edaf93fee8f

## 5. Lacunas seguintes — não esquecer nem expandir indefinidamente

B: raízes/hooks parciais, produtores manuais/criação/financeiro/sinais da IA ainda
sem contrato causal completo; agendados legados; ordenação/capacidade/concorrência;
retenção/lixeira/migração. Inventário detalhado no documento de produtores.

Exclusão: deleteTenantChat busca jobs por chatId; coletor de deleteTenantLead não
inclui jobs por leadId; internos/raízes chatId=null precisam teste isolado de
exclusão/restauração/invalidação. Leitura de código não comprova incidente real.

Após fechar B com evidência: C memória/casos/conhecimento; D loop operacional e
tools; E humano/CRM/copiloto/canais/configuração; F avaliação integrada; G piloto
e publicação autorizados. O usuário quer mudança percebida na conversa: relatar
qual gate concreto falta, não confundir contagem crescente de testes com essa entrega.

Backlog anterior preservado: áudio adiado, incidente de mídia de produção não
revalidado por este pacote, atribuição Meta/Google separada, grupos/distribuição/
story e desktop/mobile não homologados por testes de fundação. Outros chats estão
corrigindo erros: conferir autoria/diffs sem sobrescrever nem publicar junto.

## 6. Autorizações e aceite preservados

- US$ 3 ACUMULADOS para lote fictício inicial, não por chat/ciclo. Consultar ledger
  durável antes de gasto; a passagem e os testes locais desta unidade custaram zero
  em chamadas de modelo. Não reinicializar contabilidade ou assumir orçamento renovado.
- Sem clientes reais, loja real, compras, alterações de estoque/pagamento/reembolso,
  envio WhatsApp/Meta incidental, CAPI ou publicação nesta passagem.
- Não alterar admin/autenticação/público por conveniência. Não usar subagentes sem
  autorização humana específica. Preservar dados, rotas, funções e mudanças alheias.
- Não reduzir metas/timeout/asserções para aprovar. Avaliação final: corpus Shopify
  preparado de 104 cenários, holdout >=30, repetição >=3 (críticos 5), modelo real,
  metas da missão, revisão humana e piloto autorizado. MVP/deploy não encerram missão.
- Retomar sem novo planejamento do zero; atualizar progresso com arquivo, resultado,
  limite, versão e próxima ação. Publicação futura depende de autorização do pacote.

## 7. Destino da passagem

Novo chat criado no projeto ALTUM, ambiente local (mesmo checkout):
Atendimento IA Shopify — continuidade da implementação.
Identificador: 01a15c2f-6a31-7a93-b4ba-62c32d932d11; host local.

Automação existente redirecionada para esse identificador pelo mecanismo do app;
estado PAUSED e intervalo de 15 minutos preservados, sem automação duplicada.
Vínculo/estado conferidos novamente no arquivo de configuração depois da atualização.
O objetivo persistente do chat antigo NÃO foi movido, recriado ou concluído.

Primeiro snapshot do destino confirmou leitura em andamento, sem implementação/testes.
O usuário deve mandar continuar lá após a recepção; não religar automaticamente
agendamento ou missão pausada. Esta passagem não amplia orçamento nem publicação.
Hashes dos dois arquivos de código/teste reconferidos sem alteração nesta passagem;
checagem de whitespace dos documentos aprovada. Não se executou bateria funcional
nova: último resultado da unidade permanece 2/3. Este chat deixa de ser executor.
