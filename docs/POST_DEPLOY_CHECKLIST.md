# Post-Deploy Checklist (Seguranca + LGPD)

Data: 15/04/2026

## 1) Pre-condicoes
- Deploy em producao concluido.
- Segredos configurados no ambiente:
  - `SECRET_ENCRYPTION_KEY`
  - `ASAAS_WEBHOOK_TOKEN`
  - `META_APP_SECRET`
  - `META_WA_TOKEN` ou `META_ADS_ACCESS_TOKEN`
  - `AI_JOBS_PROCESS_TOKEN`, `AUTOMATION_JOBS_PROCESS_TOKEN`, `CAMPAIGN_SYNC_TOKEN` (ou `CRON_SECRET`)

## 2) Rodar verificacao automatica
Comando:

```bash
POST_DEPLOY_BASE_URL=https://SEU_DOMINIO npm run verify:postdeploy
```

O script valida:
- disponibilidade das paginas principais;
- headers de seguranca (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`);
- webhooks com token invalido rejeitados;
- endpoints internos e admin bloqueando requests anonimas.

Arquivo do script: `scripts/post-deploy-verify.mjs`

## 3) Teste manual de webhooks reais
- Meta/WhatsApp:
  - enviar evento de teste pelo provider;
  - confirmar retorno HTTP `200` no provider;
  - confirmar processamento em logs da aplicacao.
- Asaas:
  - enviar evento com token valido;
  - confirmar atualizacao da cobranca vinculada.

## 4) Teste funcional rapido
- Fluxo lead inbound -> chat -> automacao -> inbox.
- Fluxo de envio de mensagem WhatsApp pelo tenant.
- Fluxo painel cliente e operacoes basicas sem erro.

## 5) Confirmacoes LGPD
- Politica publicada e acessivel em `/politica-de-privacidade`.
- Canal de atendimento de titulares ativo.
- Responsavel interno por DSAR e incidente definido.
- DPA minimo revisado para novos contratos.

## 6) Rotacao de credenciais
- Gerar novos tokens de integracao (Meta/Asaas).
- Atualizar no painel.
- Revogar tokens antigos.

## 7) Critero de liberacao
Liberar apenas quando:
- script `verify:postdeploy` passar;
- webhooks reais testados;
- fluxo funcional ponta a ponta aprovado;
- checklist LGPD sem pendencia critica.
