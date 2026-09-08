# ALTUM — Recalibração pós-GA4 e release consolidada

Data: 2026-09-08
Base auditada: `release/seo-ga4-20260908`
Branch de ajustes: `chore/recalibrate-seo-ga4-20260908`

## Nova fonte de verdade
A release consolidada e o deployment atual do produto passam a ser a referência. Não restaurar automaticamente estilos, textos ou arquitetura de branches anteriores.

## Identidade pública atual
- domínio canônico adotado: `https://altumia.com.br`
- `https://www.altumia.com.br/*` deve redirecionar permanentemente para o domínio canônico
- linguagem visual atual: navy/azul
- posicionamento: plataforma/operação comercial conectada com CRM, conversas, pipeline, automações e IA

## GA4
O rastreamento existente:
- roda apenas em produção
- respeita consentimento
- exclui áreas privadas/admin
- registra pageviews no App Router

Ajuste desta recalibração:
- evento GA4 `generate_lead` somente após o backend confirmar que o contato comercial foi salvo
- evento Meta Pixel `Lead` no mesmo ponto
- parâmetros de contexto incluem interesse, página de origem e UTMs quando disponíveis

## SEO técnico
Mantidos:
- `noindex` em páginas programáticas por cidade
- `noindex` em verticais genéricas ainda não reescritas
- páginas comerciais P0 no sitemap
- schemas Organization, WebSite e SoftwareApplication

Corrigidos nesta recalibração:
- consolidação www/apex
- fallback canônico de metadata
- fallback do sitemap
- host do robots
- fallback de structured data
- remoção pública do e-mail legado `@altum.ag`

## Páginas comerciais preservadas
- `/crm`
- `/crm-para-whatsapp`
- `/inbox`
- `/pipeline`
- `/follow-up`
- `/ia-para-vendas`
- `/qualificacao-de-leads-com-ia`
- `/automacoes`

## Integrações verificadas no código
Com implementação existente:
- WhatsApp
- Instagram
- Facebook Messenger
- Meta Ads
- Google Ads
- Shopify
- Nuvemshop
- WooCommerce

Não comunicar como integração pronta sem nova validação:
- Stripe
- Google Calendar ponta a ponta

## Pendências imediatas
1. trocar Stripe por Nuvemshop na vitrine pública de integrações sem sobrescrever o redesign atual
2. conectar uma fonte de leitura de GA4 ao ChatGPT para análise de sessões/eventos/conversões
3. após novos dados finalizados, revisar Search Console para confirmar consolidação do domínio
4. evoluir eventos de analytics somente quando houver ação comercial real que justifique o evento
