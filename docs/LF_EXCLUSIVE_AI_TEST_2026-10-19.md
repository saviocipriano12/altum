# LF — teste exclusivo da IA

Pedido: testar apenas a conversa do proprietário final 7782 e voltar ao normal
somente depois de aprovação explícita. Nenhuma ampliação automática por prazo.

## Publicação

- URL: https://altumia.com.br
- Target: production
- Status: READY e promoção verificada no domínio principal
- Deployment final: `dpl_4BVJ4FomrEm3XPwp2R9hSmLcdq5s`
- Primeira publicação: `dpl_AF6d4sNC8tbCKwtPp1gCAvyhG9ub`; a final adicionou
  apenas dois bloqueios se a leitura de configurações retornar nulo, tanto na
  entrada quanto na rechecagem anterior aos efeitos. Domínio principal
  consultado novamente: final READY. Nova checagem de tipos remota passou.
- Baseline preservado: `dpl_22uNJsPKwJpVXq5Dfdt2p8EPsVtk`
- Proveniência: quatro deltas desta tarefa sobre o snapshot de produção, não o
  checkout compartilhado e sujo. Commit público da base:
  `8488c6a7d878fa13bdc1d618a07af130f8a0b905`.
- Framework: Next.js 16.3.8; build remoto compilou e passou no TypeScript.
- Rollback de código exige antes pausar a IA: a versão anterior ignora o campo
  novo de isolamento. Não promover baseline antigo deixando respostas ligadas.

## Controles

- `ai.rollout.exclusiveTest` é opt-in por empresa, com tenantId e IDs exatos.
- Quando presente, vazio/malformado bloqueia em vez de liberar para todas.
- API exige `manage_ai` e valida existência, tenant e ausência de grupo.
- Alterações em outros campos preservam a restrição. Remoção é explícita e usa
  exclusão do campo no Firestore, pois merge de mapa não remove campo omitido.
- Sem efeito para empresas que não têm teste exclusivo configurado.
- A trava é anterior a restauração de estado, análise multimodal, modelo,
  catálogo e ações da IA. Checagens de turno anteriores aos efeitos releem
  ativação/pausa/escopo, para reduzir risco de trabalho já em andamento.
- Pausa humana, modo sombra e percentual zero não são ignorados pelo teste.
- Campo técnico fica no controle avançado existente; não é uma nova navegação.
- 100% neste controle significa 100% das conversas autorizadas, não dos clientes.

## Aplicação operacional

Pela sessão autorizada do navegador, respostas gerais foram pausadas primeiro.
O contato Savio Cipriano foi localizado pela busca 7782 e o ID completo da
conversa foi conferido. Depois o teste exclusivo foi salvo ainda pausado; só
então respostas foram ligadas, e o painel foi relido confirmando a restrição
marcada e um único ID. A configuração comercial anterior foi preservada.

Não foram enviados testes a clientes, mensagens artificiais, fotos ou avisos ao
Luiz. Campanhas, mensagens manuais e automações independentes não foram alteradas;
o escopo desta trava é o agente de atendimento conversacional.

## Verificação e limites

- 62 testes focados passaram (34 de escopo/estoque/qualidade e 28 de contratos
  do agente, composição de resposta e webhooks).
- Os nove testes de escopo/contrato foram repetidos após os bloqueios por
  indisponibilidade de configuração e passaram. A conversa do proprietário
  mostrou “IA pronta para respostas automáticas nesta conversa”, sem pausa
  humana ativa. Não foi necessário alterar nem limpar o histórico.
- Typecheck local e remoto passaram; lint sem erros e dois avisos preexistentes.
- Testes incluem outro tenant, outro canal, outro número com sufixo 7782,
  lista malformada, preservação em edição e retirada explícita da restrição.
- Consulta real da Shopify, envio de foto e entrega de aviso ao Luiz não foram
  validados nesta publicação. A autorização anterior de catálogo ao vivo era
  temporária e precisa de conferência própria; não confundir com esta trava.
- Não existe prova de mensagem real recebida/respondida após esta configuração
  enquanto o proprietário não enviar uma nova mensagem. Nenhum replay realizado.
- Observabilidade: build e domínio conferidos; auditoria completa de erros de
  produção e configuração de drains não realizada nesta tarefa.

## Retorno ao normal (apenas após aprovação)

Desmarcar “Teste exclusivo por conversa” e publicar no painel autorizado,
preservando pausas humanas e demais regras. Não trocar o percentual para tentar
remover a restrição. Antes de liberar, validar conversa, estoque, fotos, CRM e
encaminhamento. Não apagar o histórico de teste para mascarar falhas.

## Primeiro teste real: Olá recebido, envio pausado

O proprietário enviou “Olá” às 10:45 de 19/10. A mensagem apareceu no inbox,
mas não houve resposta. Auditoria filtrada pela conversa exata mostrou
`tenant_ai_response_paused`, decisão skip, entrada Olá, sem saída, latência
725ms. A fila chegou ao agente; a falha confirmada foi o bloqueio operacional
`ai.responsePaused`, não o webhook, interpretação do texto ou a Shopify.

O painel antigo exibia “Assistente ativo” olhando apenas `enabled`, não
`responsePaused`; a conferência anterior foi insuficiente. A página foi
ajustada para mostrar o estado real no cabeçalho e no comando, além de expor
a pausa operacional nos controles avançados existentes. Não se altera essa
pausa implicitamente ao ligar/desligar o assistente, nem se remove o teste.

Dez testes de isolamento/contrato passaram após essa correção de interface.
Correção de interface publicada em `dpl_HdgNAJo5QTyXMNbmRqRGiv4cHSKm`, sobre
`dpl_4BVJ4FomrEm3XPwp2R9hSmLcdq5s`; build remoto/TypeScript e lint passaram.
Ao recarregar para retirar a pausa operacional pela UI autorizada, o navegador
retornou “Local browser use is disabled in Work settings”. Portanto a pausa
`responsePaused` NÃO foi retirada e novo teste real continua pendente. Não
usar acesso alternativo para contornar essa desativação. O teste exclusivo
permanece configurado, sem liberar clientes gerais.
Um recorte de logs error-level de 13:44–13:47 UTC retornou sem registros;
isso não prova ausência de falhas gerais. Eventos de outros números não foram
usados para atribuir causa a esta mensagem. Não houve resposta manual,
replay de webhook nem limpeza de idempotência para maquiar o resultado.
