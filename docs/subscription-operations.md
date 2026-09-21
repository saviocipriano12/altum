# Assinaturas — operação e validação

Implementação de 17/09/2026, isolada na branch `release/billing-20260917`.

Publicada após build remoto aprovado e dez verificações HTTP. Commits `284e80d` e `fef7b40`; deployment `dpl_CGiNqsjo6DpMooQF7YCZWDpQY9Q5`, promovido em Production para `altumia.com.br`. O pacote não inclui as demais alterações pendentes do workspace principal.

## Entregas

- Cartão de crédito e renovação mensal; aceite versionado dos termos no checkout.
- Central de assinatura com pagamentos, próxima cobrança, período de acesso, documentos fiscais e protocolos.
- Cancelamento pelo proprietário ou administrador: remove a recorrência no Asaas, mantém o período pago e registra a operação. A garantia comercial de sete dias considera o primeiro pagamento.
- Operações persistidas antes das chamadas financeiras. Um estorno de resultado incerto exige consulta ou revisão; não é enviado novamente às cegas.
- Recibo de cancelamento via Resend, com chave de idempotência.
- Conciliação diária às 08:30 UTC (05:30 Brasília), em lotes de até 100 empresas, com cursor e limite de execução. Operações pendentes têm retomada.
- Proteção contra notificações repetidas e eventos atrasados de cobranças canceladas ou checkouts substituídos.

## Configurações externas

- Webhook Asaas: `https://altumia.com.br/api/webhooks/asaas`, sem `www`. Token deve corresponder a `ASAAS_WEBHOOK_TOKEN`. Reativar a fila penalizada e reenviar eventos pelo Asaas.
- `CRON_SECRET` foi substituído por um segredo aleatório sem espaços em Production, pois a Vercel recusava o agendamento. Consumidores externos desse segredo precisam ser atualizados; a Vercel envia o segredo automaticamente ao cron.
- Nota fiscal: definir `ASAAS_INVOICE_SETTINGS_JSON` somente após validação do contador. O modelo exige serviço municipal, período de emissão e tributos conforme documentação vigente do Asaas. Sem esse modelo, a plataforma exibe documentos existentes, mas não configura emissão automática.
- Credenciais financeiras ficam somente nas variáveis de ambiente. Não copiar chaves para código ou documentação.

## Limites e testes

- 241 testes automatizados passaram antes da última proteção adicional de webhook; lint e typecheck foram executados separadamente.
- Após essa proteção, os 26 testes direcionados passaram novamente. Build remoto, consulta pública dos quatro planos e recusas HTTP 401 para checkout, webhook, histórico, exportação e job sem autenticação também passaram.
- Nenhum pagamento, cancelamento ou estorno real foi realizado durante a validação.
- Confirmar em conta real: pagamento e webhook HTTP 200, acesso liberado, cancelamento no Asaas, período pago preservado, recibo e documentos fiscais.
- Troca de cartão e downgrade continuam pelo suporte; não há formulário nativo para esses fluxos.
- Comunicação automática implementada neste pacote: recibo de cancelamento. Não pressupõe implementação de todos os e-mails de cobrança.
- Emissão fiscal, regras comerciais e termos exigem validação contábil/jurídica específica da empresa.

## Código reaproveitado

Tipos de resposta de notas fiscais copiados de `gusnips/asaas`, commit `235150809ec56f2df0cdc2e7775e011beacac5a8`, com licença MIT e origem preservadas em `lib/vendor/asaas/`. Nenhuma dependência desse repositório foi instalada. Requisições fiscais seguem o contrato atual documentado pelo Asaas.
