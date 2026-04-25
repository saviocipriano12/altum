# Integracoes OAuth Gerenciadas (Meta + Google)

## Objetivo
- Eliminar configuracao manual de segredos da plataforma na UI do cliente.
- Padronizar onboarding "quase 1 clique" para Meta e Google Ads.
- Manter compatibilidade com conectores legados.

## Modelo de Credenciais

### Segredos globais da plataforma (somente servidor)
- `META_APP_ID`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `META_GRAPH_VERSION` (opcional, default `v21.0`)
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_API_VERSION` (opcional, default `v22`)
- `SECRET_ENCRYPTION_KEY` (obrigatorio para criptografia de tokens tenant)

### Credenciais por tenant/canal (`tenant_channels`)
- `accessToken` (criptografado)
- `refreshToken` (criptografado, Google)
- `externalAccountId` (asset principal: IG/Page/Ad Account/Customer)
- `pageId`, `username` e metadados de roteamento
- `status` operacional (`active|inactive|draft|error`)
- `connectionStatus` de integracao (`auth_pending|connected|ready|degraded|reauth_required|...`)
- `lastSyncAt`, `lastError`

## Rotas Novas
- `POST /api/integrations/meta/start`
- `GET /api/integrations/meta/callback`
- `POST /api/meta/data-deletion`
- `POST /api/integrations/google/start`
- `GET /api/integrations/google/callback`
- `GET /api/tenant/:tenantId/channels/health`
- `GET|POST /api/internal/jobs/integrations/health` (batch health check, opcional)

## Fluxo Resumido
1. Front chama `start` com `tenantId` e tipo de canal.
2. Backend cria `state` anti-CSRF em `integration_oauth_states` (TTL e uso unico).
3. Usuario autoriza no provider.
4. `callback` valida `state`, troca `code` por token, busca assets e vincula automaticamente.
5. Canal e salvo/atualizado em `tenant_channels` com `oauthManaged=true`.
6. Meta: tenta assinatura de webhook da pagina automaticamente.
7. Google: tenta sync inicial de campanha e ajusta `connectionStatus`.

### Asset Picker (quando ha mais de uma conta)
- Se callback encontrar multiplos assets elegiveis, a integracao entra em modo de selecao:
  - redireciona com `result=select&pendingId=...`
  - UI busca o pendente e exibe lista de ativos
  - usuario confirma o ativo e o backend conclui o vinculo
- Endpoints:
  - `GET /api/integrations/pending/:pendingId`
  - `POST /api/integrations/pending/:pendingId/complete`
- Preview enriquecido:
  - Meta: nome da pagina/conta, IDs de referencia, IG vinculado quando aplicavel.
  - Google: nome descritivo da conta (quando disponivel), customer ID, moeda e timezone.

## Webhook Meta (Atual)
- `GET /api/webhooks/meta` valida por `META_VERIFY_TOKEN` global.
- Mantem fallback legado por `verifyToken` por canal quando necessario.
- `POST /api/webhooks/meta` valida assinatura com `META_APP_SECRET` global.
- Mantem fallback legado para `appSecret` por canal se o global nao existir.
- Roteamento continua por IDs do asset (`externalAccountId`, `pageId` etc.).

## UI de Canais (Cliente)
- Removeu necessidade de informar `App Secret`, `Verify Token`, `Client Secret` no fluxo Meta/Google.
- Adicionados controles:
  - Conectar/Reconectar Meta
  - Conectar/Reconectar Google
  - Testar conexao
  - Desconectar
- Mantido formulario de mapeamento para compatibilidade e ajustes finos.

## Escopos OAuth Meta por canal (padrao)
- Instagram: `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`
- Messenger: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`
- Meta Ads: `ads_read`, `business_management`, `leads_retrieval`
- Opcional: `META_INCLUDE_INSTAGRAM_COMMENT_SCOPE=1` para incluir `instagram_manage_comments`.
- Overrides por ambiente:
  - `META_OAUTH_SCOPES_INSTAGRAM`
  - `META_OAUTH_SCOPES_MESSENGER`
  - `META_OAUTH_SCOPES_META_ADS`

## Health Check
- Endpoint valida token por canal e atualiza `connectionStatus`.
- Meta: valida token em `/me`.
- Google: valida refresh token no endpoint OAuth.
- Estados esperados: `ready`, `connected`, `webhook_pending`, `reauth_required`, `degraded`.
- Com `attemptRepair=1`, tenta re-assinar webhook da pagina Meta automaticamente quando o canal estiver `webhook_pending`/`degraded` e em modo `oauthManaged`.

## Precisao de Conversoes
- Google Ads: suporta filtro por `conversionActionId` (e variantes) para evitar contagem de conversoes fora do objetivo comercial.
- Meta Ads: suporta filtro opcional por tipos de acao no metadata do canal:
  - `primaryActionType`
  - `leadActionTypes` (csv)

## Compatibilidade Legacy
- Canais antigos continuam funcionando.
- Webhook ainda aceita verify token/app secret por canal como fallback.
- Possivel migrar gradualmente para `oauthManaged=true`.

## Troubleshooting Rápido
- `state_ausente` ou `oauth_state_*`: sessao OAuth expirada ou invalida.
- `reauth_required`: token revogado/expirado, usar Reconectar.
- `webhook_pending` (Meta): OAuth ok, mas assinatura de webhook da pagina falhou.
- `degraded` (Google): OAuth ok, mas sync inicial com falha.
