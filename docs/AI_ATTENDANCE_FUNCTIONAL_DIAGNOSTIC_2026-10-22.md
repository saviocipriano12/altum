# Diagnóstico funcional solicitado — IA da Altum — 22/10/2026

Pedido humano: avaliar em testes o que foi construído antes de continuar novas funcionalidades.
Implementação de novas capacidades interrompida durante este diagnóstico. Sem publicação.

## Conclusão do diagnóstico local

O agente integrado ainda não está aprovado. As proteções locais têm evidência,
mas as jornadas completas e a recuperação automática dos efeitos finais revelaram
falhas que impedem tratar a etapa B como encerrada. Tipos/lint verdes não mudam isso.

## O que significa teste real neste diagnóstico

Foram executados o handler de produção, workers, transações, armazenamento e
recibos com dados fictícios em Firestore/Storage locais. Transportes comerciais,
catálogo Shopify e respostas do modelo das jornadas são interceptados. Não houve
envio a clientes, acesso a loja real, compra, estoque, pagamento ou reembolso.
Testes de integridade não comprovam qualidade de conversa com modelo real.

Snapshot: `.qa-artifacts/ai-diagnostic-requested-snapshot-20261022.json`, 49 arquivos;
conferência final: **49/49 sem alteração** durante a avaliação, recibo
`ai-diagnostic-requested-final-drift-20261022.json`.
Fontes de produção não foram corrigidas durante esta avaliação.

## Falhas confirmadas nesta versão

### 1. Transferência humana impede o fechamento do próprio atendimento

Três jornadas pelo handler completo abortaram com `CRM_STAGE_AI_SIGNAL_HUMAN_CONTROL`:
produto/link direto, preço alterado antes do link e produto despublicado.
O caminho de handoff autoriza a pausa humana; depois o plano final executa
`runLeadAutomations(ai_next_action)`, cujo produtor recusa esse controle humano.
A proteção humana não deve ser removida para fazer a jornada passar: o encerramento
precisa distinguir ação revogada de efeito ainda obrigatório e preservar seu recibo.

Provas: `.qa-artifacts/ai-diagnostic-journey-shop-product-direct-link-20261022.log`,
`ai-diagnostic-journey-shop-price-changed-before-link-20261022.log` e
`ai-diagnostic-journey-shop-product-unpublished-20261022.log`.
Falhas não foram introduzidas por injeção de erro nestas jornadas.

### 2. Plano final persistido não é recuperado pelo root expirado

O teste novo cruza claim real, grava plano final e log, interrompe antes do uso,
expira a posse e chama novamente o worker. Há um plano válido e pendente; mesmo
assim o root vai para `reconciliation_required`, enquanto o resultado esperado
é retomar esse plano sem resposta nova. O helper de retomada funciona quando
chamado, mas a seleção de recuperação de `executing` ainda não o integra.

Prova: `tests/ai-handler-recovery-diagnostic.emulator.mts`, **0/1**,
`.qa-artifacts/ai-diagnostic-tail-recovery-20261022.log` e recibo correspondente.
As interrupções `qa injected` são deliberadas; a reprovação é a recuperação posterior.

### 3. Jornada de correção e reinício não concluiu

`shop-correction-and-restart` abortou no processo novo com `Cold handler falhou`.
O worker só comunica `failed`, sem a causa interna no artefato. Esta falha é
distinta das três anteriores; a causa específica ainda não está demonstrada.
Não atribuir o erro à pausa humana sem evidência do processo filho.

Prova: `.qa-artifacts/ai-diagnostic-journey-shop-correction-and-restart-20261022.log`.
As quatro execuções estão em `ai-diagnostic-journeys-receipt-20261022.json`.

## Resultados terminais

- Bateria de 25 arquivos: **169/169**, zero skips, **475,96s**. Fila, identidade/legado, geração de registros, posse,
  decisões humanas, efeitos finais, texto, mídia, voz existente, templates,
  watchdog, exclusão/restauração/retenção e CRM passivo. Sessão 72858 encerrada;
  log/recibo `ai-diagnostic-requested-runtime-20261022`.
- Complemento de seis arquivos: **23/23**, zero skips, **32,91s**. Memória de relacionamento, conhecimento,
  sinais, recuperação de aprendizado, política e aprovação humana. Sessão 10787 encerrada;
  log/recibo `ai-diagnostic-memory-learning-20261022`.
- Tipos/lint: **0/0**, `ai-diagnostic-requested-static-receipt-20261022.json`.

Separadamente: **quatro jornadas completas reprovaram (0/4)** e **um teste
adicional de recuperação reprovou (0/1)**. Não somar grupos heterogêneos para
ocultar os bloqueadores em uma porcentagem média. Nenhuma asserção foi reduzida.
Logs `qa injected` na bateria são injeções deliberadas; as falhas de integração
das jornadas são erros efetivamente observados nesta versão.

## Modelo real e orçamento

Ledger durável consultado em modo somente leitura: teto acumulado US$3,
duas chamadas históricas, compromisso US$0,002858, nenhuma reserva pendente.
Não foi reinicializado e não houve chamada paga nesta avaliação.
Uma sondagem curta foi considerada, mas não executada: o executor exige tarifa verificada na data corrente; configuração ainda registra
19/10. Essa trava foi preservada. Além disso, as jornadas locais já abortam.
Qualidade do modelo real, avaliação completa/reservada, repetições e revisão
humana continuam sem aprovação. Não equivalem aos testes com respostas simuladas.

## Capacidade por capacidade: limites da conclusão

| Capacidade | O que as verificações medem | O que não está aprovado |
| --- | --- | --- |
| Fila/turnos | Deduplicação, isolamento, posse, tentativas e recibos | Root expirado com plano final pendente; jornada com reinício |
| Entrega | Outbox, confirmação incerta, pausa, revogação e ordem | Transporte de clientes reais, piloto e latência em produção |
| Controle humano | Pausa, takeover/resume, conflitos e gravação coerente | Fechamento do handler após handoff; rota ai-state autenticada integral |
| Automações | Watchdog, regras irmãs, autorização, legado e retenção | Integração de ai_next_action depois de posse humana |
| Memória/conhecimento | Persistência, correções e políticas dos cenários locais | Memória por assunto e recuperação empresarial completas de C |
| Aprendizado | Sinais próprios não ensinam, autoria/governança e replay | Perfil de vendedor aprovado e qualidade sustentada em uso |
| Raciocínio/ferramentas | Alguns caminhos reais passam por controles existentes | Loop operacional D completo, qualidade com modelo real e corpus integral |
| Produto/configuração/canais | Evidência histórica preservada | Homologação atual de telas, configuração fim a fim, piloto e aceite |

## Ordem após o diagnóstico

1. Corrigir os bloqueadores confirmados sem enfraquecer pausa, testes ou asserções.
2. Reproduzir o reinício com diagnóstico específico e repetir as jornadas completas.
3. Revalidar o executor/orçamento e realizar a sondagem com modelo real no escopo autorizado.
4. Só então concluir o cruzamento dos contratos de B e avançar conforme A→G.

Limites explícitos: não foram realizados build/publicação, teste visual de todas
as telas, transporte de canal real, avaliação integral dos 30 reservados ou
homologação com modelo real nesta rodada. Isso impede qualquer declaração de
aprovação completa do produto. O diagnóstico local está registrado; essas provas
continuam pendentes e não foram substituídas por testes determinísticos.

A missão completa permanece ativa. Este documento não autoriza produção nem
declara conclusão de C–G ou aceite humano.
