# Setup - Push Web do Portal do Cliente

## 1) Gerar chaves VAPID

```bash
npx web-push generate-vapid-keys
```

ou via script do projeto:

```bash
npm run push:vapid
```

Copie os valores de `publicKey` e `privateKey`.

## 2) Variáveis de ambiente

Defina no ambiente de deploy:

- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT` (ex.: `mailto:suporte.altum@gmail.com`)
- `CLIENT_PORTAL_PUSH_JOBS_TOKEN` (token forte para job interno)
- `CRON_SECRET` (opcional, pode ser usado no lugar do token acima)

## 3) Fluxo de assinatura

Quando o usuário cliente concede permissão:

1. o navegador cria/recupera `PushSubscription`;
2. a assinatura é salva via `POST /api/client-portal/push/subscription`;
3. um push de teste é enviado por `POST /api/client-portal/push/test`.

Observação:

- o push de teste é disparado apenas para as subscriptions do usuário autenticado (não para todo o tenant).

## 4) Job interno de disparo crítico

Endpoint:

- `POST /api/internal/jobs/client-portal/push-critical`

Autorização:

- `Authorization: Bearer <CLIENT_PORTAL_PUSH_JOBS_TOKEN>`
ou
- header `x-client-portal-push-token`
ou
- `Authorization: Bearer <CRON_SECRET>`
ou
- header `x-cron-secret`

Opcional:

- `tenantId` na query para forçar um tenant específico.
- `maxTenants` na query para limitar processamento.
- `dryRun=1` para simular regras sem enviar notificações nem gravar estado.

## 5) Sugestão de agenda

Executar a cada 2-5 minutos para alertas críticos operacionais.

O repositório já inclui cron no `vercel.json` para:

- `/api/internal/jobs/client-portal/push-critical?maxTenants=80` a cada 3 minutos.

## 6) Comandos de validação

Dry-run para um tenant específico:

```bash
curl -X POST "https://SEU-DOMINIO/api/internal/jobs/client-portal/push-critical?tenantId=TENANT_ID&dryRun=1" \
  -H "Authorization: Bearer SEU_TOKEN"
```

Execução real para um tenant específico:

```bash
curl -X POST "https://SEU-DOMINIO/api/internal/jobs/client-portal/push-critical?tenantId=TENANT_ID" \
  -H "Authorization: Bearer SEU_TOKEN"
```

## 7) Notas de resiliencia

- `POST /api/client-portal/push/test` possui cooldown por usuario; chamadas em sequencia curta retornam `429` com `retryAfterSeconds`.
- O job `POST /api/internal/jobs/client-portal/push-critical` usa lock distribuido para evitar concorrencia do cron.
- Quando o lock estiver ativo, a resposta sera `202` com `reason: "job_already_running"`.
- Para execucao manual de suporte, use `force=1` na query string.
