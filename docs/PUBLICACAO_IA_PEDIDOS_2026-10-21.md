# Publicação restrita — recuperação de leitura de pedidos

Pedido humano nesta conversa em 21/10/2026: publicar o que já pode ser publicado.
Não é autorização para publicar o checkout compartilhado nem concluir a reconstrução.

## Escopo congelado

- Base consultada ao vivo: dpl_Cf6MVguX1UQnUYaTSfKwVaetECwv, READY no projeto
  prj_7STDUwhGQa5RcgTfx4elzWpabkbo e domínio altumia.com.br. É posterior aos
  registros de 19/10 e ao primeiro pacote de Conversas de 20/10; preservar tudo.
- Candidata compilada READY, promovida e conferida no domínio:
  dpl_C7LYkuFPnHrujsnL4TERxK4Nhh8o.
- Exatamente um arquivo: lib/server/crm/order-stage-transition.ts.
- SHA256: afb77e7c03465c98f568d5ae854f59587ca0e09ff15c6fb6df5a4e764aa16d61.
- As outras 1.512 fontes permanecem por SHA da produção; não altera agente,
  telas, mídia, admin, autenticação, catálogo, dependências, cron, regras ou índices.

## O que muda e o que não muda

Admissão distingue defeito de configuração de falha de armazenamento; pré-claim
não consome ready/attempt em falha de leitura; lote conta falha por ocorrência e
continua com as demais. Erro após efeito iniciado permanece conservador, sem
reabrir raiz ou repetir envio incerto. Nenhum job antigo é promovido manualmente.

O consumidor periódico publicado já importa processPendingOrderPipelineTransitions;
o produtor geral antigo de mudança de etapa continua sem a migração nova. Este
pacote endurece somente o consumidor/contrato já presente. Não ativa novos
produtores Shopify, ações de compra, aprendizado ou novo motor conversacional.

## Evidências e limitações explícitas

Artefatos em .qa-artifacts/ai-ready-release-20261021-v2/:

- baseline.json/comparison.json: consulta atual e comparação de 28 fontes candidatas.
  Várias correções já estão publicadas; o restante está acoplado à migração incompleta.
- build/: 1.513 arquivos de produção materializados por hash, com somente o arquivo
  candidato substituído. Dependências de produção/local conferidas antes da junction.
- order-release-tests.log: 10/16, seis falhas. NÃO é aprovação da suíte ampla.
- baseline-build/ e order-baseline-tests.log: mesmo teste, sem enfraquecer asserções,
  sobre a árvore genuína da produção: 6/16, dez falhas. As seis falhas restantes
  são idênticas nos nomes/resultados antes/depois; nenhuma passagem virou falha.
- Quatro falhas de leitura/erro desconhecido foram corrigidas. Os cinco cenários
  “order pipeline” passam na candidata, incluindo configuração inválida/estrangeira/
  ambígua. Autoridade, alteração humana entre commit/consumo, interrupção e conflito
  atômico também mantêm aprovação no recorte exercitado.
- Seis falhas preservadas: dois contratos do escritor genérico/etapa manual,
  replay concorrente no produtor, evidência paga por esse produtor, entrega sem
  pagamento e falha parcial por esse produtor. Dependem de stage-transition e
  migrações que este pacote NÃO contém; continuam bloqueadores dessas famílias/B.
- order-release-pure-regression.log: 14/14 (qualificação/funil e jornada ecommerce).
- A tipagem da fixture completa falhou: ela referencia o executor de agendamento
  ainda não publicado. Diagnóstico TS2339 preservado em order-release-types.log;
  não foi removido/ignorado no código de produção nem chamada de suíte aprovada.
- Tipagem do runtime candidato/imports aprovada (order-runtime-only-types.log,
  saída vazia, exit 0); lint do arquivo aprovado, saída vazia, exit 0.
- validation.json registra apenas aprovação restrita do patch, a comparação e
  as reprovações amplas, nunca aprovação integral de B/IA.
- Repetição independente dos cinco cenários “order pipeline”: 5/5 em 39,92 s,
  zero falhas/skips/cancelamentos, log order-release-core-repeat.log. Não substitui
  nem apaga a reprovação ampla; não foi usada para chamar os 16 de aprovados.
- Compilação remota READY confirmada antes da promoção. Domínio, hashes e HTTP
  conferidos após a promoção; recibos promoted.json e verified.json preservados.

## Segurança e continuidade

Nenhuma chamada paga de modelo, leitura de loja real, envio a cliente, compra,
alteração de estoque/pagamento/reembolso ou migração de dados. Testes com fixture
demo e transporte externo bloqueado. Emuladores de outro trabalho preservados.
O código em implementação no outro chat não foi alterado por esta publicação.

Fora do pacote: agente/contexto novos, agendados causais novos, consumidores
Shopify adicionais, draft-mutation, retenção/lixeira em implementação e todas
as alterações alheias. B/gate 2 continuam abertos; não chamar a IA de pronta.

Reversão de código tem como referência a base acima, após reconferir o domínio
para não sobrescrever publicação concorrente. Não desfaz efeitos nem autoriza
reenviar intenções anteriores. Script recusa promoção se a base pública mudar.

## Resultado final

Publicado em altumia.com.br em **21/10/2026, 00h40min51s (Brasília)**, promoção
2026-10-21T03:40:51.507Z. Conferência em 03:41:11.256Z: versão exata
dpl_C7LYkuFPnHrujsnL4TERxK4Nhh8o, um arquivo candidato com SHA256 esperado,
1.512 demais fontes idênticas à base, total 1.513.

Início/login/Inbox/CRM Kanban HTTP 200; chats de tenant fictício sem autenticação
e job de automações sem autenticação HTTP 401. Mesmos códigos medidos antes da
promoção. Isso prova disponibilidade/recusa e integridade do pacote, NÃO uma
conversa ou pedido real autenticado. Nenhum novo teste em cliente/loja real.

Publicação deste patch concluída; reconstrução geral NÃO concluída. O pacote
maior reprovado não foi publicado, e as seis falhas de famílias antigas continuam
registradas para a missão de implementação. Não anunciar melhoria conversacional
ou adaptação universal como resultado deste ajuste de recuperação.
