# Commerce Providers

## Contrato comum

Os conectores de loja usam `CommerceProvider` para validar credenciais e sincronizar recursos. O motor legado de eventos continua responsavel por persistir produtos, espelhar catalogo, atualizar CRM e gerar acoes comerciais.

## Conectores atuais

- Shopify: Admin GraphQL API; produtos, pedidos e rastreio.
- Nuvemshop: API v1; produtos, pedidos e rastreio.
- WooCommerce: REST API `wc/v3`; produtos, pedidos e rastreio quando fornecido pela loja/plugin.
- VTEX, Tray e Loja Integrada: webhook compativel; sincronizacao direta por API ainda nao habilitada.

## Credenciais por empresa

As credenciais ficam em `ecommerce_connections.apiCredentials`, criptografadas com `SECRET_ENCRYPTION_KEY`. A API publica apenas `hasApiCredentials`; tokens e segredos nunca retornam ao navegador.

- Shopify: dominio `*.myshopify.com` e token da Admin API com leitura de produtos e pedidos.
- Nuvemshop: ID numerico da loja e access token OAuth com `read_products` e `read_orders`.
- WooCommerce: URL HTTPS publica, consumer key e consumer secret com permissao de leitura.

Shopify e Nuvemshop tambem oferecem conexao gerenciada por OAuth na area do cliente. O fluxo usa estado descartavel, com validade de 15 minutos e consumo atomico; Shopify valida ainda o HMAC e o dominio `*.myshopify.com`. A conexao manual foi preservada como contingencia.

## Sincronizacao

`POST /api/tenant/:tenantId/ecommerce/connections/:connectionId/sync` busca um lote limitado e converte cada registro em evento interno idempotente. A mesma esteira de webhook atualiza:

- `ecommerce_products`
- `ecommerce_orders`
- `kb_docs` para o catalogo comercial
- contatos, leads, tarefas e acoes de WhatsApp quando aplicavel

URLs WooCommerce sao validadas como HTTPS e bloqueadas quando apontam para localhost ou redes privadas.

Webhooks Shopify sao validados pelo `X-Shopify-Hmac-Sha256` usando o segredo do app e o corpo bruto. Webhooks WooCommerce usam `X-WC-Webhook-Signature` com o segredo individual da conexao. Conexoes manuais e outros provedores continuam aceitando o token Altum, preservando compatibilidade. Requisicoes rejeitadas registram apenas metadados tecnicos, nunca o payload comercial completo.

Depois do OAuth Shopify, a Altum lista as assinaturas existentes e cria apenas as ausentes para produtos, pedidos e fulfillments. O provisionamento e idempotente, fica registrado na conexao e nao impede a primeira sincronizacao quando algum topico e recusado temporariamente.

Na Nuvemshop, o OAuth inclui e valida `state`; os webhooks sao provisionados para alteracoes comerciais especificas e verificados pelo `x-linkedstore-hmac-sha256`. Como esses eventos carregam principalmente IDs, a Altum consulta o recurso completo antes de atualizar catalogo, CRM ou automacoes.

No WooCommerce, a validacao das chaves REST provisiona automaticamente eventos de produto e pedido. A chave individual gerada pela Altum e enviada como segredo do webhook; quando ela e rotacionada, as assinaturas existentes sao atualizadas em vez de duplicadas. Integracoes pausadas confirmam o recebimento, mas nao processam novos dados.

O job `GET /api/internal/jobs/commerce/sync` reutiliza a mesma esteira e roda de hora em hora pelo Vercel Cron. Ele processa apenas conexoes ativas, com credenciais de API e modulo Commerce contratado, respeitando intervalo minimo e limite de lojas por execucao. Cada execucao e registrada em `internal_job_runs`; cada sincronizacao gera auditoria sem expor credenciais ou dados pessoais.

## Variaveis de ambiente

- `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`: app externo Shopify.
- `SHOPIFY_OAUTH_SCOPES`: opcional; padrao de leitura para produtos, pedidos, fulfillment e clientes.
- `NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET`: app parceiro Nuvemshop.
- `NUVEMSHOP_AUTH_BASE_URL`: opcional; padrao `https://www.nuvemshop.com.br`.
- `COMMERCE_SYNC_TOKEN`: opcional; se ausente, o job usa `CRON_SECRET`.
- `APP_URL`: URL publica usada nos callbacks OAuth.

Callbacks que devem ser cadastrados nos paineis dos provedores:

- `/api/integrations/commerce/shopify/callback`
- `/api/integrations/commerce/nuvemshop/callback`
