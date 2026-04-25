# Meta App Review Playbook (ALTUM)

## Objetivo
Submeter o app principal da ALTUM na Meta com escopo minimo por caso de uso, reduzindo rejeicoes por:
- permissao sem uso valido;
- screencast incompleto;
- mistura de fluxos (Instagram, Messenger, Ads e WhatsApp) em uma unica submissao.

## O que foi ajustado internamente no codigo
- OAuth Meta agora solicita escopos por canal (nao mais um pacote gigante unico):
  - `instagram`: `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`
  - `messenger`: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`
  - `meta_ads`: `ads_read`, `business_management`, `leads_retrieval`
- Callback OAuth Meta agora consulta apenas assets do canal escolhido:
  - Instagram/Messenger: `/me/accounts`
  - Meta Ads: `/me/adaccounts`
- Webhook WhatsApp agora processa `statuses` (`sent`, `delivered`, `read`, `failed`) e persiste status de entrega.
- API de mensagens do inbox agora expoe status de entrega.
- Inbox passou a mostrar selo de entrega em mensagens enviadas pelo time.
- Endpoint de User Data Deletion para Meta:
  - `POST /api/meta/data-deletion`
  - pagina de confirmacao: `/exclusao-de-dados`

## Variaveis de ambiente novas/opcionais
- `META_OAUTH_SCOPES_INSTAGRAM` (csv, opcional)
- `META_OAUTH_SCOPES_MESSENGER` (csv, opcional)
- `META_OAUTH_SCOPES_META_ADS` (csv, opcional)
- `META_INCLUDE_INSTAGRAM_COMMENT_SCOPE=1` (opcional; inclui `instagram_manage_comments`)

Sem override, o sistema usa os escopos minimos padrao listados acima.

## Estrategia de submissao recomendada
Nao reenviar tudo junto. Fazer em blocos:

1. Instagram DM + Messenger
2. Meta Ads (leadgen e leitura de conta)
3. WhatsApp (se realmente necessario no mesmo app)

Se possivel, manter WhatsApp em app separado de Social/Ads para reduzir acoplamento de review.

## Ajustes no painel da Meta antes de reenviar
1. Remover da submissao atual permissoes que nao sao obrigatorias para o bloco em revisao.
2. Validar Business Verification e dominio.
3. Configurar URLs publicas:
   - Privacy Policy: `/politica-de-privacidade`
   - Data Deletion Callback: `/api/meta/data-deletion`
   - Data Deletion Instructions: `/exclusao-de-dados`
4. Garantir que o app esteja em modo Live no momento de teste interno do reviewer (quando aplicavel).

## Roteiro de screencast (formato que costuma aprovar)
Gravar em ingles na UI do app, sem cortes entre etapas criticas:

1. Login completo na ALTUM.
2. Clique em `Conectar Meta` na tela de canais.
3. Tela da Meta OAuth com permissoes solicitadas.
4. Retorno para ALTUM com conta/pagina selecionada.
5. Abrir inbox da ALTUM e enviar mensagem manual pelo app.
6. Mostrar a mesma mensagem chegando no cliente nativo:
   - Messenger/Instagram app, ou
   - WhatsApp app.
7. Mostrar no app ALTUM o status de entrega (`sent/delivered/read`) quando aplicavel.

Se for Ads:
1. Conectar Meta Ads.
2. Mostrar conta de anuncio selecionada.
3. Mostrar dados/snapshot/lead sendo usado na tela de CRM/metricas.

## Mapeamento rapido: permissao -> evidencia no video
- `pages_messaging` / `instagram_manage_messages`: envio real pelo inbox ALTUM + entrega no cliente nativo.
- `pages_show_list`: tela de selecao de pagina.
- `pages_manage_metadata`: assinatura/uso de webhook com evento entrando no app.
- `ads_read` / `business_management`: selecao de ad account + leitura de campanhas.
- `leads_retrieval`: lead de formulario entrando na ALTUM (com origem Meta Ads).

## Erros que mais causam rejeicao
- Pedir permissao que nao aparece em uso no video.
- Video sem fluxo completo de login + consentimento + uso final.
- Mostrar apenas dashboard Meta sem mostrar uso dentro do app.
- Misturar varios casos de uso no mesmo video sem narrativa clara.

## Plano de reenvio sugerido
1. Limpar permissoes para bloco Instagram/Messenger.
2. Regravar screencast com fluxo fim a fim.
3. Reenviar apenas esse bloco.
4. Depois repetir para Meta Ads.
5. Tratar WhatsApp por ultimo, com video dedicado (se necessario).
