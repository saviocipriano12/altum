# Smoke Test - Portal Cliente Mobile + Push

## Pré-requisitos

- Deploy com PWA publicado.
- Variáveis de push configuradas (`WEB_PUSH_*` e token de job).
- Usuário de cliente ativo no tenant de teste.

## A) PWA (Android / Chrome)

1. Abrir `https://SEU-DOMINIO/cliente/painel`.
2. Confirmar banner de instalação.
3. Instalar app na tela inicial.
4. Fechar Chrome e abrir o atalho instalado.
5. Validar:
   - abre em modo app (sem barra de navegador);
   - barra inferior mobile visível;
   - navegação entre Inbox/CRM/Métricas.

## B) PWA (iPhone / Safari)

1. Abrir `https://SEU-DOMINIO/cliente/painel`.
2. Validar instrução de “Adicionar à Tela de Início”.
3. Adicionar manualmente via botão Compartilhar.
4. Abrir o atalho da tela inicial.
5. Validar comportamento app-like e navegação.

## C) Tempo real adaptativo

1. Em `/cliente/painel/inbox`, abrir uma conversa.
2. Enviar mensagem de teste na conversa (ou simular via backend).
3. Confirmar atualização no painel.
4. Colocar aba em background por 1-2 min.
5. Voltar para aba e confirmar retomada do refresh.

## D) Notificações push (usuário)

1. Conceder permissão de notificação no portal cliente.
2. Verificar que push de teste chega no dispositivo.
3. Clicar no push e confirmar deep link para rota do portal.
4. Recarregar página e confirmar que não repete push de teste sem troca de endpoint.

## E) Job crítico (servidor)

Dry-run:

```bash
curl -X POST "https://SEU-DOMINIO/api/internal/jobs/client-portal/push-critical?tenantId=TENANT_ID&dryRun=1" \
  -H "Authorization: Bearer SEU_TOKEN"
```

Execução real:

```bash
curl -X POST "https://SEU-DOMINIO/api/internal/jobs/client-portal/push-critical?tenantId=TENANT_ID" \
  -H "Authorization: Bearer SEU_TOKEN"
```

Validar resposta:

- `processed` > 0
- `candidateNotifications` coerente
- `dispatches.sent` incrementando quando houver assinatura ativa

## F) Checklist final de aprovação

- [ ] PWA instalável Android
- [ ] PWA instalável iOS
- [ ] Navegação mobile estável
- [ ] Inbox com atualização consistente
- [ ] Push de teste chega no próprio usuário
- [ ] Job crítico rodando por cron sem erro


## G) Limites de teste

- `POST /api/client-portal/push/test` possui cooldown por usuario.
- Se chamar em sequencia, o endpoint responde `429` com `retryAfterSeconds`.
