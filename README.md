# ALTUM

Plataforma operacional da ALTUM com duas superficies principais:

- `Admin interno ALTUM`: backoffice para clientes, comercial, financeiro, operacao, IA e campanhas.
- `Portal cliente multi-tenant`: workspace restrito para CRM, inbox, go-live, automacoes, conhecimento, metricas e canais.

O projeto suporta tanto onboarding assistido pela ALTUM quanto cadastro self-service com trial de 7 dias e assinatura recorrente via Asaas.

## Stack

- Next.js App Router
- TypeScript
- Firebase / Firestore
- Jobs agendados em VPS com systemd timers
- Integracoes Meta, Google Ads, WhatsApp, Asaas e web push

## Estrutura principal

- `app/`: paginas e API routes
- `lib/`: regras de dominio, normalizacao e servicos do servidor
- `docs/`: runbooks, governanca, onboarding e go-live
- `scripts/`: verificacoes e automacoes operacionais
- `tests/`: smoke tests do dominio e das rotas criticas

## Rodando localmente

```bash
npm install
npm run dev
```

Servidor local padrao:

```bash
http://localhost:3000
```

## Variaveis de ambiente

O projeto depende de chaves de plataforma e segredos operacionais. Os grupos mais importantes sao:

- Firebase cliente e admin
- `SECRET_ENCRYPTION_KEY`
- `SHOPIFY_ADMIN_API_VERSION` (opcional, padrao `2026-07`)
- `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` (conexao OAuth gerenciada)
- `SHOPIFY_OAUTH_SCOPES` (opcional)
- `NUVEMSHOP_USER_AGENT` (opcional, identificacao da integracao Commerce)
- `NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET` (conexao OAuth gerenciada)
- `NUVEMSHOP_AUTH_BASE_URL` (opcional, padrao `https://www.nuvemshop.com.br`)
- `COMMERCE_SYNC_TOKEN` (opcional; fallback para `CRON_SECRET`)
- `ECOMMERCE_WEBHOOK_TOKEN` (fallback global para webhooks de loja)
- `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`
- `META_WA_TOKEN` e/ou `META_ADS_ACCESS_TOKEN`
- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` (conexao QR gerenciada pela Altum)
- `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`
- `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`
- `AI_JOBS_PROCESS_TOKEN`, `AUTOMATION_JOBS_PROCESS_TOKEN`, `CAMPAIGN_SYNC_TOKEN`, `CHAT_OUTBOUND_PROCESS_TOKEN` ou `CRON_SECRET`
- `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`

Sem esses segredos, parte da plataforma abre, mas canais, jobs e automacoes entram em modo degradado.

Para midias de conversa, a Altum registra a mensagem antes de tentar a entrega e tem uma rota de recuperacao autenticada: `GET /api/internal/jobs/chat-outbound/process`. Em producao, agende-a a cada minuto em um worker ou Vercel Cron com `CRON_SECRET`; a tentativa imediata continua ocorrendo apos cada envio.

## Comandos de validacao

```bash
npm run lint
npm run typecheck
npm run test:smoke
npm run test:agent-closure
```

Verificacao de deploy:

```bash
POST_DEPLOY_BASE_URL=https://SEU_DOMINIO npm run verify:postdeploy
```

## Jobs internos

As rotas dos jobs continuam na aplicacao, mas os agendamentos de producao sao
executados pelos timers definidos em `infra/jobs/`. Essa separacao permite
frequencias menores que um dia mesmo quando o frontend esta no plano Hobby da
Vercel. Os jobs cobrem:

- processamento da fila de IA
- processamento de automacoes e watchdog do inbox
- sincronizacao de campanhas
- push critico do portal do cliente
- cobranca recorrente de contratos
- sincronizacao de commerce, relatorios e processamento de campanhas outbound

Se algum token de job nao estiver configurado, as rotas internas respondem `503` e a operacao fica incompleta.

O indice composto usado pela fila outbound fica versionado em
`firestore.indexes.json`. Para publicar e validar o indice e consultar somente
as contagens da fila:

```bash
npm run firestore:indexes:deploy
npm run outbound:queue:check
```

O runbook da VPS esta em `infra/jobs/README.md`.

## Go-live por tenant

A liberacao comercial/operacional passa por `/cliente/painel/go-live` e pela rota:

```bash
POST /api/tenant/:tenantId/readiness
```

Gates criticos atuais:

- canal conectado
- IA habilitada
- minimo de 3 documentos na base de conhecimento
- owner e handoff definidos
- limites de custo e uso configurados

Referencia principal: `docs/CLIENTE_FECHADO_CHECKLIST_OFICIAL.md`

## Onboarding de cliente

Geracao da ficha operacional:

```bash
npm run cliente:onboarding:new -- --cliente "NOME" --tenant "TENANT_ID" --ownerAltum "SEU_NOME" --ownerCliente "NOME_CLIENTE" --fechamento "YYYY-MM-DD" --kickoff "YYYY-MM-DD" --prazo "YYYY-MM-DD" --escopo "PLANO"
```

Isso cria um arquivo em `docs/clientes/` a partir do template oficial.

## Documentos importantes

- `docs/CLIENTE_FECHADO_CHECKLIST_OFICIAL.md`
- `docs/go-live-definitivo-checklist.md`
- `docs/go-live-runbook.md`
- `docs/go-live-incident-playbook.md`
- `docs/POST_DEPLOY_CHECKLIST.md`
- `docs/LGPD_OPERACAO_E_GOVERNANCA.md`
- `docs/INTEGRATIONS_OAUTH_MANAGED.md`
- `docs/AGENT_CLOSURE_MODE.md`

## Estado atual de qualidade

O baseline esperado antes de considerar uma entrega pronta e:

- lint verde
- typecheck verde
- smoke tests verdes
- agent closure gate verde
- validacao de post-deploy executada no ambiente alvo

Quando a mudanca toca go-live, inbox, IA, canais ou cobranca, tambem vale executar um teste ponta a ponta real com tenant controlado.
