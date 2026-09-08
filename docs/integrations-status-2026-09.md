# ALTUM — Matriz oficial de integrações

Data da revisão: 2026-09-08

Objetivo: manter a comunicação pública alinhada ao que existe no produto. Esta matriz separa implementação técnica de disponibilidade comercial universal. Uma integração pode existir no código e ainda exigir credenciais, aprovação do provider, configuração por tenant ou validação operacional.

## Classificação
- **Disponível com configuração**: implementação concreta verificada; exige conexão/credenciais/configuração do cliente.
- **Parcial / em validação**: há camada funcional ou adapter, mas o fluxo ponta a ponta ainda não foi confirmado para uso como promessa comercial ampla.
- **Não verificada**: não foi encontrada implementação suficiente para afirmar disponibilidade.

## WhatsApp
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- conector `whatsapp` na gestão de canais;
- provider `meta_whatsapp`;
- configuração de `phoneNumberId`, número, WABA e tokens;
- ingestão de eventos e envio via infraestrutura Meta/WhatsApp já presentes no projeto;
- integração do canal ao Inbox, CRM, IA e automações.

Claim público seguro:
> Conecte o WhatsApp à ALTUM para centralizar atendimento, CRM, IA e automações.

Não prometer sem validação específica do tenant:
- ativação instantânea sem aprovação/configuração Meta;
- qualquer volume ilimitado de mensagens;
- todos os templates/categorias de mensagem disponíveis por padrão.

## Instagram
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- conector `instagram` na gestão de canais;
- provider `meta_instagram`;
- suporte a Instagram Business ID e usuário;
- webhook Meta e infraestrutura de mensagens presentes no projeto.

Claim público seguro:
> Centralize mensagens do Instagram na mesma operação comercial da ALTUM.

## Facebook Messenger
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- conector `messenger` na gestão de canais;
- provider `facebook_messenger`;
- configuração por Facebook Page ID;
- suporte de webhook Meta indicado para Messenger.

Claim público seguro:
> Traga conversas do Messenger para a operação centralizada de atendimento e vendas.

## Meta Ads
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- conector `meta_ads` na gestão de canais;
- Ad Account ID, Page ID e Lead Form ID;
- backend de sincronização com Graph API;
- snapshots de campanhas e métricas;
- estrutura de saúde de conversões e eventos.

Claim público seguro:
> Conecte Meta Ads para acompanhar campanhas, leads e métricas dentro da operação comercial.

Observação: disponibilidade efetiva depende de credenciais, permissões e ativos aprovados na Meta.

## Google Ads
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- OAuth próprio em `/api/integrations/google`;
- scope `https://www.googleapis.com/auth/adwords`;
- Customer ID, Login Customer ID/MCC e Conversion Action ID;
- backend para Google Ads API e normalização de snapshots de campanha.

Claim público seguro:
> Conecte Google Ads para acompanhar campanhas, custos, leads e conversões junto ao funil comercial.

## Shopify
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- OAuth Shopify;
- validação HMAC e state;
- troca do código por access token;
- armazenamento de credenciais por tenant;
- criação de webhooks;
- sincronização inicial;
- provider dedicado em `lib/server/commerce/providers/shopify.ts`.

Claim público seguro:
> Conecte sua Shopify à ALTUM para trazer dados de comércio para a operação de relacionamento e vendas.

Evitar até detalhar os eventos sincronizados em uma página própria:
- dizer que “tudo da Shopify” sincroniza;
- prometer estoque, pedidos, clientes ou recuperação específica sem demonstrar o fluxo correspondente.

## Nuvemshop
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- provider `nuvemshop` na camada commerce;
- OAuth e troca de token;
- rotas dedicadas de start/callback/webhook;
- provider dedicado `nuvemshop.ts`.

Claim público seguro:
> Conecte sua Nuvemshop à ALTUM para integrar o contexto do e-commerce à operação comercial.

Recomendação: incluir Nuvemshop na home por relevância para o mercado brasileiro.

## WooCommerce
**Status para marketing:** Disponível com configuração.

Evidências verificadas:
- `CommerceProvider` contempla `woocommerce`;
- registry resolve o provider;
- implementação REST dedicada em `providers/woocommerce.ts`;
- autenticação e operações de catálogo/estoque presentes na camada do provider.

Claim público seguro:
> Integre WooCommerce à ALTUM para conectar dados da loja à sua operação comercial.

## Google Calendar
**Status para marketing:** Parcial / em validação.

Evidências verificadas:
- agenda interna da ALTUM está implementada;
- CRM possui scheduling adapter com estado `google_calendar` e status `not_configured` / `ready`;
- porém o OAuth Google auditado atualmente solicita escopos de Google Ads, não escopos de Calendar.

Conclusão:
Não apresentar Google Calendar como integração plenamente disponível até validar autorização, criação/atualização de eventos e sincronização ponta a ponta.

Claim público seguro hoje:
> Agenda comercial integrada ao fluxo da ALTUM.

Evitar por enquanto:
> Integração completa com Google Calendar.

## Stripe
**Status para marketing:** Não verificada.

Evidências da revisão:
- Stripe aparece na faixa visual de integrações da home;
- não foi encontrado provider Stripe na camada de commerce;
- os providers de comércio verificados são Shopify, Nuvemshop e WooCommerce;
- a busca por `stripe` no repositório não retornou integração de pagamentos, apenas ocorrência textual não relacionada.

Conclusão:
Remover Stripe da lista de integrações públicas até existir implementação verificável ou documentação técnica específica.

## Resumo para a home
### Pode aparecer como integração existente, com nota de configuração
- WhatsApp
- Instagram
- Facebook Messenger
- Meta Ads
- Google Ads
- Shopify
- Nuvemshop
- WooCommerce

### Não apresentar ainda como integração plenamente disponível
- Google Calendar — parcial/em validação
- Stripe — não verificada

## Regra para novas integrações
Antes de adicionar um logo na home ou criar uma página SEO de integração, verificar pelo menos:
1. provider/adapter real no código;
2. autenticação ou configuração por tenant;
3. fluxo de entrada/saída ou sincronização;
4. tratamento de erro/estado;
5. quais dados são efetivamente lidos/escritos;
6. limitações de provider/plano;
7. claim público que não exceda essas capacidades.
