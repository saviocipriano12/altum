# Shopify como fonte comercial da Altum

## Objetivo e fronteiras

Shopify é a fonte de produtos, variantes, preço e disponibilidade. Altum é a
operação comercial: campanha, conversa, identidade, CRM, funil, tarefas e ações.
Consulta de estoque não cria lead, não muda etapa, não reserva e não cobra.
Este documento é um plano incremental, não uma declaração de entrega completa.

## Mapa da plataforma revisado

| Caminho existente | Responsabilidade preservada |
| --- | --- |
| webhooks WhatsApp -> ai/queue -> ai/agent -> ai/router -> chat-dispatch | pausa humana, autonomia, contexto, resposta e envio |
| ai/agent.fetchKbDocs -> knowledge-context | base interna, ofertas, políticas e catálogo legado |
| commerce/registry -> providers/shopify -> commerce/sync | credencial criptografada, conexão existente e consulta à loja |
| ecommerce.processEcommerceWebhook -> syncOrderToCommercial | vincular pedido ao cliente, contexto e atribuição |
| lead-intake -> contact-profile -> crm/operations | identidade compartilhada entre conversa e compra |
| ecommerce-journey -> setLeadPipelineStageWithEffects | pagamento pendente/pago, cancelamento e reembolso |
| ecommerce -> lead_tasks/commercial_actions -> ecommerce-agent | agenda, tarefas e mensagens controladas |
| ecommerce -> pixels/conversions + native growth events | resultado comercial, atribuição e conversão por pedido |
| cliente/painel/crm | pedido, jornada, histórico e ações na ficha existente |
| specialist-execution/role-operating-contract -> response-composer | ferramentas permitidas por papel, autonomia e validação antes do envio |

## Contratos obrigatórios

- Isolar todas as consultas por tenant e conexão ativa; credenciais somente no servidor.
- Variantes são identificadas por ID e opções reais. Nunca tratar primeira variante
  ou status ACTIVE como disponibilidade do tamanho solicitado.
- Distinguir venda permitida, quantidade online e política de vender sem estoque.
  CONTINUE pode permitir compra sem pronta entrega; quantidade null não é zero.
- Guardar horário/fonte da consulta; não persistir resultados de catálogo na KB.
- Não interpretar descrição de produto como instrução para o agente.
- Resultado incompleto, ambíguo, expirado ou falha de API não autoriza promessa.
- Nenhum pagamento/pedido pessoal deve ser exposto sem vínculo de identidade verificado.
- Campanha é pista e atribuição, não confirmação de produto ou variante.
- CRM mantém origem da campanha e histórico comercial; consulta não é venda.
- Não excluir catálogo legado ou dados já importados na migração.
- Não habilitar envios, descontos, reservas ou reembolsos durante implementação.

## Execução e critérios de aceite

1. **Contrato de consulta dentro do conector existente (implementado localmente; piloto pendente).**
   Busca literal segura, produto por ID, variantes com tamanho/cor, quantidade online,
   preço, imagem e URL. Consulta sem cache persistente nem escrita. API de diagnóstico
   autenticada para validar o mesmo provider que o atendimento usará.
   Aceite: testes de zero, null, CONTINUE, variante errada, paginação, erros e isolamento.
2. **Atendimento integrado.** Ferramentas internas do agente usam o mesmo provider;
   recebem produto/contexto de campanha e memória confirmada da conversa. Seleção
   ambígua pergunta; variante escolhida é reconsultada antes da resposta. Composição,
   autonomia, humano e logs existentes continuam mandando. Não criar segundo chatbot.
   Aceite: conversa de dois turnos (modelo -> tamanho), troca de modelo e falha de API
   no mesmo fluxo de WhatsApp/preview. Não basta testar apenas um endpoint.
3. **CRM e migração do catálogo.** Interesse confirmado registra IDs/referências
   mínimas na ficha do mesmo cliente. Produto não é copiado para kb_docs; ofertas
   internas e políticas continuam. Separar catálogo ao vivo de processamento de
   pedidos; não desligar sync/webhooks comerciais. Preservar retrocompatibilidade.
   Aceite: conversa + compra resolvem o mesmo cliente, origem preservada, sem duplicar
   receita, tarefa ou conversão; catálogo legado não confirma estoque atual.
4. **Compra assistida.** URL da variante correta, validação do redirecionamento ao
   checkout Yampi existente. Carrinho via Storefront somente depois desse teste.
   Aceite: variante/quantidade certas no checkout sem alterar o gateway.
5. **Pós-venda e automação.** Identidade verificada para pedidos; eventos idempotentes,
   reconciliação incremental, cancelamento de recuperação após compra e regras de
   mensagem/consentimento. Guardar somente registros necessários a CRM e relatórios.
   Aceite: eventos repetidos/fora de ordem e indisponibilidade não duplicam ações.
6. **Piloto e publicação gradual.** Preview sem envio -> teste autorizado no WhatsApp
   -> piloto LF Multimarcas -> expansão. Testar catálogo fora do lote importado,
   produto esgotado, M disponível/G esgotado, múltiplas lojas e timeout. Fazer lint,
   typecheck e build. Não publicar o worktree inteiro: há alterações pré-existentes.

## Status inicial

- Auditoria do caminho comercial e IA realizada; CRM/funil já têm processamento de
  pedidos. Isso não comprova reconciliação completa nem todos os cenários em produção.
- O espelhamento atual perde opções das variantes e usa a primeira quantidade.
- A IA atual usa KB, não a Shopify ao vivo. A etapa 1 não deve ser anunciada como
  atendimento ao vivo concluído antes das etapas 2/3 e do piloto.
- Nenhum dado real ou alteração administrativa é necessário para testes de unidade.

## Primeira implementação local (13/10/2026)

- `CommerceProvider.lookupCatalog` implementado no provider Shopify já registrado.
  A rota autenticada da mesma conexão expõe diagnóstico sem escrever documentos.
- Busca literal com variáveis GraphQL (não recebe query GraphQL arbitrária), até
  seis produtos e 50 variantes por produto; paginação incompleta é explícita e
  não permite afirmar ausência/seleção única. Também consulta produto por ID.
- Resultado tipado mantém tamanho/cor, preço decimal, zero e null distintos,
  quantidade online, política de estoque, fonte e horário. Seleção G não casa GG.
- 18 testes do conector/consulta e 25 regressões de conhecimento, resposta e jornada
  passaram. Teste de autorização da rota é estrutural, não um teste de integração
  com Firebase. Consulta real à Shopify e conversa de WhatsApp ainda pendentes.
- ESLint focado, typecheck e build completo passaram. A correção comercial
  adicional passou no teste de regressão; 44 testes distintos passaram nesta etapa.
- Fluxos de atendimento e envio não foram modificados nesta etapa. Não publicado; não remover
  o espelhamento até a substituição no atendimento passar pelo piloto.
- Exceção de correção comercial: `fulfillment_pending` agora é reconhecido como
  estado já pago no processamento de pedidos. Isso evita incrementar novamente
  compras/LTV ao repetir uma atualização de pedido pago aguardando envio. Teste
  de regressão cobre a transição e o vínculo com o handler. Dados históricos não
  foram recalculados; eventual correção retroativa exige auditoria separada.

Referência de schema usada: Shopify GraphQL Admin API 2026-07, ProductVariant.
https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ProductVariant

## Atendimento e publicação controlada (13/10/2026)

- Consulta compartilhada ligada ao fluxo existente `ai/agent` e à rota `ai-preview`.
  Resposta factual de catálogo passa pelo compositor e pelos controles de canal,
  pausa humana, ferramentas/autonomia e modo sombra existentes. Não é outro chatbot.
- Continuidade conserva apenas conexão, ID/nome do produto e opções escolhidas.
  A cada consulta os dados são obtidos novamente; resultado acima de 30 segundos
  não confirma disponibilidade. Modelo ambíguo pede especificação; G não vira GG
  nem L automaticamente. O catálogo LF usa S/M/L/XL, entre outras opções.
- Interesse confirmado escreve referências no mesmo chat/lead, verificando tenant
  e vínculo chat.leadId em transação. Evento determinístico por mensagem; não cria
  cliente, não altera origem, etapa, pedido ou receita. Escrita respeita `crm_write`
  e `update_crm_context`. Simulador não chama essa escrita.
- No turno ao vivo não enviar checkout/mídia de ofertas antigas. Compra assistida,
  paginação completa, linguagem livre mais ampla e consulta pessoal de pedidos
  continuam fases posteriores, não capacidades entregues por este piloto.
- Mensagens personalizadas do simulador deixam de ser substituídas pelo cenário
  oficial. O contexto de produto acompanha testes personalizados subsequentes;
  os testes oficiais em lote continuam sem compartilhar esse contexto.
- `SHOPIFY_LIVE_CATALOG_STORES` delimita a loja piloto. Por padrão a nova consulta
  só opera em preview; atendimento real exige `SHOPIFY_LIVE_CATALOG_MODE=live`,
  após teste de canal e validação da escalada humana. Não altera modos existentes.
- 50 testes focados passaram; typecheck passou. ESLint sem erros, com dois avisos
  anteriores em `ai/agent` não relacionados a esta alteração. Build/publicação e
  teste no simulador hospedado serão registrados após confirmação, não por inferência.
- Consulta real, somente leitura, da LF confirmou a sequência: identificar
  Real Madrid Titular 24/25 -> solicitar tamanho -> L disponível, preço R$ 140 ->
  M esgotado. Estoque é uma observação daquele instante, não promessa permanente.
- Teste real revelou que igualdade `title:"Real"` não encontra palavras dentro do
  título. Busca corrigida para prefixos de termos validados, sem aceitar operadores
  do usuário. Nenhum catálogo novo foi persistido nem dado antigo removido.

### Publicação

- Produção promovida para `dpl_45R6jPbVYD6YXMLmEvdQuTgB7nBQ`, URL canônica
  `https://altumia.com.br`; build completo com 369 páginas concluído.
- Base anterior `dpl_4FQZk2RZcPG5SUE2XJUzdMjXxsCF` preservada para rollback.
  Publicação com 11 arquivos de runtime; deltas desta tarefa aplicados ao snapshot
  hospedado de IA/preview, sem subir alterações administrativas ou locais alheias.
- Preview e rota de catálogo rejeitaram chamadas sem autenticação com HTTP 401.
- Simulador logado em produção confirmou produto e pediu as opções S/M/L/XL/2XL/3XL/4XL.
  Na sequência, apenas `L` confirmou disponibilidade e R$ 140; apenas `M` confirmou
  ausência de estoque online. Ambos tiveram zero documentos de KB recuperados,
  demonstrando que os fatos vieram da consulta e da referência da conversa.
  Evidências: `shopify-live-preview-L.png` e `shopify-live-preview-M.png` no diretório
  de visualizações da tarefa. A tela do simulador foi deixada aberta.
- Nova consulta no atendimento real permanece desativada por padrão. A configuração
  existente de IA e o modo desligado das mensagens ecommerce não foram alterados.
  Responsável humano ainda não configurado na LF; aguardando número autorizado da
  equipe para teste WhatsApp e escalada. CRM novo ainda não testado com cliente real.

## Piloto WhatsApp LF e falha de continuidade (16/10/2026)

- Perfil comercial da LF salvo em produção: perguntas sobre time/modelo, tamanho
  e manga; estoque exige consulta atual, sem promessas de foto/carrinho, sem
  presumir condições da loja nem converter interesse em compra. Modo híbrido
  mantido; responsável humano continua pendente.
- Canary publicado em `dpl_E5rHgdp8ffnzr53HkcEjf6CFaxFj`, sem publicar a árvore
  local inteira. Autorização temporária exige tenant e ID exato da conversa do
  proprietário, final 7782; não autoriza clientes pelo sufixo do telefone. Modo
  global de consulta real permanece desligado. Pausa e controles humanos mantidos.
- Às 21:30 (São Paulo), a pergunta real sobre Flamengo G manga longa recebeu
  três modelos vindos da Shopify, com motivo `shopify_live_product_selection`.
  Isso valida a busca real e o envio automático, não a disponibilidade de uma
  variante nem o envio de fotos ou carrinho.
- Às 21:31, o pedido real de fotos dos três modelos caiu no fluxo legado e
  recomendou uma camisa do Vasco. Falha confirmada: a seleção ambígua não
  conservava contexto, permitindo a recomendação antiga de outro produto.
  Canary desativado durante a correção; não considerar o atendimento aprovado.
- Mesmo chat e lead preservados, etapa `contato`. Nesse ponto não havia
  `commerceInterest` nem contexto de produto único: sincronização específica do
  interesse de variante ainda precisa de validação real.
- Correção local conserva até quatro referências de modelos (ID/nome) e a
  pergunta inicial limitada, nunca quantidades/preços. Seleção por nome completo
  ou ordinal reconsulta o ID na Shopify. Foto/link/carrinho ficam contidos nesse
  fluxo com limitação explícita, sem selecionar oferta antiga. Contexto pendente
  não escreve interesse de produto no lead; escolha única substitui todo o mapa
  do contexto para não deixar candidatos antigos por merge recursivo.
- 53 testes focados passaram, incluindo a regressão do pedido de fotos e escolha
  ordinal. Publicação corretiva e repetição real serão registradas somente após
  confirmação. Fotos e carrinho continuam não implementados.

### Publicação corretiva confirmada

- `dpl_9qVPGSu4E4yUqdcioUmo9TaXKFrX` compilou com sucesso e foi promovido;
  rollback preservado em `dpl_E5rHgdp8ffnzr53HkcEjf6CFaxFj`. Somente os dois
  arquivos compartilhados de catálogo foram alterados nessa publicação.
- Consulta direta, somente leitura, com dados reais confirmou: pergunta inicial
  retorna três modelos Flamengo; pedido de fotos responde com limitação explícita
  e mantém os modelos; `a segunda` consulta novamente o ID
  `gid://shopify/Product/9515968233718` e pede uma opção real de tamanho.
  Isso não é um teste de envio WhatsApp nem de escrita no CRM.
- Canary exato do proprietário reativado até 23:38 de 16/10/2026, São Paulo
  (`2026-10-17T02:38:30.271Z`), sem ativação global. Repetição real após esta
  correção ainda pendente. ESLint focado sem erros; 53 testes passaram.

## Qualidade comercial do atendimento LF (16/10/2026)

- Conversa real auditada: fluxo antigo chegou a prometer e declarar envio de
  fotos que não enviou. Essa mensagem não é evidência de capacidade de mídia.
- Respostas do catálogo agora acolhem saudações e reciprocidade, sem repetir
  abertura a cada escolha. Primeiro pedido direto recebe acolhimento sem perder
  a pergunta de produto. Quatro opções no máximo, numeradas e em parágrafos.
  Títulos completos permanecem nas referências/CRM; apresentação remove apenas
  redundância de “Camisa” e reposiciona “Manga longa”, sem inventar atributos.
- Compositor mantém quebras de linha somente quando o conteúdo das validações
  permanece idêntico. Reparo de privacidade, correção, dados sensíveis, preço,
  estoque e limite de pergunta continua prevalecendo. Preview usa o mesmo texto
  do catálogo, sem achatá-lo antes do compositor.
- Pedido de fotos sem contexto também fica contido no fluxo da loja: informa
  limitação real e oferece o site. Recusa do site não força link; aceitação de
  um convite explícito consulta o endereço. Foto e carrinho seguem não entregues.
- Site obtido de `shop.primaryDomain.url` na consulta autenticada Shopify;
  apenas HTTPS sem credenciais. Compositor autoriza aquela URL exata, não abre
  URLs gerais nem transforma navegação em checkout. Fonte do campo:
  https://shopify.dev/docs/api/admin-graphql/latest/objects/domain
- Falta de modelo não afirma ausência absoluta; oferece outra busca ou site.
  Variante sem estoque oferece alternativas sem inventar substituição disponível.
  G não vira L: explica a outra numeração e mostra as opções reais.
- Tom e estilo atualizados nos campos comerciais existentes da LF, com backup
  local dos três valores anteriores. Autonomia, pausa, rollout, guardrails,
  responsável e demais configurações preservados. Não criado assistente paralelo.
- WhatsApp e webhooks Meta (Instagram/Messenger) entram na mesma fila/motor;
  envio por canal e respectivos controles permanecem separados. Isso não prova
  conexão/entrega Meta nem libera o canary fora do ID WhatsApp autorizado.
- Sequência somente leitura, sem envio de teste nem escrita em CRM, com Shopify
  real: Olá -> tudo bem -> três Flamengo manga longa -> pedido de fotos -> sim
  -> site oficial `https://lfmultimarcasonline.com.br/` -> “a segunda” identifica
  24/25 Torcedor -> pede numeração real -> L sem estoque naquele instante -> site.
  Texto passou pelo compositor final sem bloqueios e conservou parágrafos.
- 58 testes focados passaram; 36 testes de catálogo/composição foram repetidos
  após os últimos ajustes e passaram. Typecheck e ESLint focado passaram.
  Publicação e novo teste WhatsApp serão registrados após confirmação.

### Publicação da qualidade comercial

- Produção promovida para `dpl_FdNCRRTaXu1uDDJYXHYRZQbJ7a6v`; baseline anterior
  `dpl_9qVPGSu4E4yUqdcioUmo9TaXKFrX` preservado. Seis arquivos de runtime,
  com deltas desta tarefa aplicados ao snapshot publicado. Não foram publicados
  os demais arquivos locais alterados. Build completo, inclusive TypeScript e
  geração das 369 páginas, concluído. Build intermediário G5Av não foi promovido.
- 11 testes adicionais de contratos de compositor/plano/especialistas/webhooks
  passaram, totalizando 69 testes distintos nesta etapa. ESLint dos scripts passou.
- Leitura das configurações em produção confirmou tom salvo, enabled=true,
  responsePaused=false, autonomia hybrid e rollout existente inalterado.
- Inventário da LF mostrou somente `WhatsApp LF VITORIA` ativo. Instagram e
  Messenger compartilham o motor no código, mas não há canal desses tipos nesta
  empresa nessa consulta. Não anunciar entrega Meta validada.
- Canary não ampliado nem renovado: somente conversa final 7782 até 23:38 de
  16/10/2026 (São Paulo). Novo teste WhatsApp com a versão publicada pendente;
  consulta direta com Shopify não substitui a comprovação da conversa real.

## Configuração de vendedora e reinício solicitado (16/10/2026)

- Proprietário solicitou explicitamente melhorar configurações e apagar somente
  a conversa pessoal de teste final 7782 para recomeçar. Nenhum outro cliente,
  canal, pedido ou dado Shopify colocado no escopo de exclusão.
- Papel `sales`, objetivo de vendedora de camisas (não SDR de serviços), tom
  acolhedor e estilo `premium_sales`. Movimento comercial existente configurado
  em `businessContext.sales.motion=assisted_purchase`, antes resolvido como
  consultivo genérico. Não criado businessProfileId sem suporte na plataforma.
- Resumo e nove campos do cérebro comercial revisados; instruções explícitas
  de interpretação contextual de erros, confirmação de ambiguidades, saudação
  sem repetição, não reutilizar atributos antigos e só narrar ações executadas.
  Sem promessas de foto/carrinho, preço/estoque sem fonte ou notificação fictícia.
- Modelo, tier growth, orçamento, autonomia híbrida, rollout, pausa, ativação,
  credenciais e funil preservados. Mudanças de configuração entram em vigor
  sem deploy. Isso NÃO corrige sozinho o roteamento lexical da consulta: o erro
  “casa muda” ainda exige implementação e teste próprios antes de ser declarado
  resolvido. Nenhuma promessa de qualidade perfeita com base apenas em prompt.
- Script `configure-lf-seller-reset.mts` valida tenant, loja, telefone completo,
  chat/lead exatos, ausência de outra conversa ligada ao lead, limites dos campos
  e jobs não terminais. Fase configure executada/verificada antes de reset.
- Conversa movida à lixeira existente, ID `JhQhfVX7Ez7fGBktQTR0`: 36 documentos
  relacionados além do chat. Três documentos extras de contexto/memória/turno
  incluídos no mesmo manifesto recuperável antes de limpar o contexto ativo.
  Mantidos logs de auditoria/idempotência, que não são histórico do prompt.
- Removidos 36 campos derivados da IA no lead e cinco campos customizados com
  evidência da própria IA, inclusive cidade capturada incorretamente no teste.
  Cadastro, identidade, origem, atribuição e etapa do lead preservados. Resumos
  derivados de jornada/sinais limpos; não apagado o contato nem a conta WhatsApp.
- Backup privado das configurações e dos campos de contexto em pasta temporária
  local `altum-lf-seller-reset-20261016`. Conversa/memórias recuperáveis pelo
  manifesto da lixeira, sujeito ao prazo configurado. Isso não apaga o WhatsApp
  do telefone do proprietário nem esta conversa do Codex.

## Busca robusta e recuperação comercial (16/10/2026)

- Pedido explícito do proprietário: corrigir busca/interpretação e outros pontos
  que bloqueiam a venda; quando não houver opção adequada, buscar alternativas e
  encaminhar ao vendedor em vez de encerrar o lead. Luiz indicado expressamente
  pelo proprietário, WhatsApp final 4048. Configurados os campos existentes
  `responsiblePhone`, `handoffNotifyPhones` e `handoffNotifyEnabled` somente na LF.
  Não criado usuário/convite sem e-mail; recebimento externo não dá acesso ao CRM.
- Causa reproduzida: `estou buscando camisa atletico mineiro` não encontrava
  produtos; `camisa Atlético Mineiro` encontrava dois. Extração agora remove
  palavras conversacionais sem remover acentos; variantes ortográficas limitadas
  no filtro Shopify cobrem Atlético/Atletico e outros casos conhecidos. Valores
  continuam variáveis sanitizadas, sem aceitar operadores do cliente.
- O modelo pode propor busca estruturada com evidência da mensagem atual, mas
  só leitura real autoriza fatos. Parser aceita confiança mínima, âncora literal
  ou correção de um caractere e rejeita atributos novos, pedidos privados,
  pagamento, humano e operadores. Proposta também pode vir do campo existente
  `serviceInterest`, sujeita à mesma validação. Nenhuma troca de modelo ou tier.
  Orientação usada: https://developers.openai.com/api/docs/guides/tools
- Primeira sonda do modelo não forneceu intenção utilizável e pediu confirmação
  inadequada de “casa muda”. Instrução e contrato de busca foram revisados. Nova
  sonda com o modelo configurado `gpt-4.1-mini` gerou busca `camisa Flamengo`;
  consulta real retornou modelos Flamengo. A resposta verbal não verificada do
  modelo é descartada quando a ferramenta retorna, não usada como dado de estoque.
- Consultas reconhecidas continuam no caminho rápido. Busca vazia pode ter uma
  segunda interpretação; erros/limites de consulta não significam ausência.
  Produtos incompletos mantêm referências para escolha ou escalam, sem prometer
  estoque. Variante Default Title sem tamanho não comprova um G solicitado.
- Continuidade: número, nome e especificação parcial dos modelos; refinamento de
  manga/versão conserva a busca atual. Um produto explicitamente novo não herda
  o clube anterior. Numeração mais recente substitui a antiga. Referências de
  busca são mínimas, sem espelhar preços ou quantidades na base.
- Recuperação tenta outros modelos/temporadas preservando termos de clube,
  público, manga e opções informadas. Uma alternativa com tamanho solicitado só
  é apresentada após variante disponível confirmada. A troca de modelo não é
  silenciosa: pede escolha. Recusa das alternativas aciona atendimento humano.
- Handoff reutiliza controles, tarefa, alertas e CRM existentes. Em recuperação
  comercial, destinatários explicitamente configurados têm preferência sobre
  números inferidos. Aviso leva pedido original, consulta e motivo da limitação;
  não cria reposição ou prazo. Confirmação ao cliente vem depois do resultado do
  envio e da tarefa, distinguindo enviado, só registrado e falha. Não é prova de
  leitura/retorno do vendedor. IA só pausa se houver aviso ou tarefa registrados;
  checagem de turno mais recente evita confirmação antiga após nova mensagem.
- Compositor bloqueia alegações de consulta em andamento, fotos enviadas,
  notificação e retorno “em instantes” sem execução confirmada. Não há venda
  ganha, receita ou pedido novo por interesse, alternativa ou encaminhamento.
- Shopify real, somente leitura: a frase natural de Atlético Mineiro retornou
  os dois produtos com e sem acento; clube inexistente gerou decisão de handoff;
  Flamengo titular 77/78 manga longa L encontrou duas alternativas atuais com L
  verificado. Esses testes não enviam WhatsApp nem escrevem no CRM.
- 75 testes focados passaram; typecheck passou após corrigir tipo do vetor de
  termos. ESLint sem erros, com dois avisos preexistentes do agente. Publicação
  será baseada no snapshot atual `dpl_GwiCEfG7Ub8GP6N1b4U1wJcfPCCA`, preservando
  o redesign público publicado simultaneamente. Apenas sete deltas de runtime.
- Entrega real de aviso ao Luiz e assunção humana ainda precisam ser testadas
  com uma nova mensagem autorizada do proprietário. Não ampliar piloto por isso.
- Revisão final: 75 testes passaram novamente, incluindo troca curta de clube
  dentro de menu pendente e flexões feminino/feminina na busca. O typecheck da
  publicação passou no build remoto; uma repetição local encontrou corrupção no
  arquivo gerado `.next/dev/types/routes.d.ts` (comentário duplicado após a linha
  525), não alterado por esta tarefa. Não houve reparo de cache compartilhado.
- Antes da promoção, uma segunda publicação concorrente de SEO/AEO/GEO mudou
  a produção para `dpl_36fR9LYcq6TjxHBQWGjXPH9EQ8F5`. A candidata anterior
  `dpl_8mdcSQjxuK29pY3vL3zSJJcZJLzH` passou no build, mas não foi promovida;
  os mesmos sete deltas foram reaplicados sobre a produção mais recente.
- Publicação concluída: `dpl_DjsA2pdNQhAuXX74Jtbq185jqBXx`, URL técnica
  `https://altum-6hn6qvpje-savio-ciprianos-projects.vercel.app`. Build remoto,
  TypeScript, geração de páginas e promoção concluídos; o domínio
  `altumia.com.br` foi consultado novamente e aponta para esse deployment READY.
  Snapshot anterior para rollback de código: `dpl_36fR9LYcq6TjxHBQWGjXPH9EQ8F5`;
  rollback não desfaz configurações no Firestore e exige verificar publicação
  concorrente antes de executar. Backup privado de destinatários preservado.
- Piloto renovado somente para a conversa existente final 7782 até
  `2026-10-17T04:08:21.126Z` (01:08 de 17/10, America/Sao_Paulo).
  Modo global inalterado. Nenhum aviso real enviado ao Luiz por estes scripts;
  nenhuma mensagem de cliente simulada, replay de webhook ou limpeza adicional.
  Entrega ao vendedor e tarefa no CRM continuam pendentes do novo teste real.
