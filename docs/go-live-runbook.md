# Runbook de Onboarding do Tenant

## D0
- Confirmar owner operacional e responsavel pelo handoff da IA.
- Validar 1 canal externo com roteamento pronto.
- Ligar IA e revisar guardrails minimos.
- Publicar pelo menos 3 documentos na base de conhecimento.
- Definir `monthlyBudgetUsd` e `monthlyUsageCap`.
- Ajustar SLA, time padrao e horario operacional.
- Rodar validacao em `/cliente/painel/go-live`.

## D1
- Executar 1 lead teste ponta a ponta.
- Confirmar entrada no inbox, takeover humano e fechamento do handoff.
- Validar distribuicao por time, SLA e backlog.
- Verificar consumo de IA do dia versus budget mensal.
- Registrar qualquer bloqueio encontrado no canal, webhook ou fila.

## D7
- Revisar score do go-live e revalidar gates criticos.
- Auditar custo de IA, volume de execucoes e alertas de contingencia.
- Revisar backlog aberto, chats sem owner e gargalos de SLA.
- Conferir automacoes essenciais, fila de jobs e estabilidade de webhook.
- Confirmar se o tenant continua apto para venda sem acompanhamento manual intensivo.

## Ritual operacional recomendado
- Segunda: revisar score, gates criticos e budget de IA.
- Quarta: revisar backlog, handoffs e automacoes.
- Sexta: revalidar tenant antes de qualquer oferta comercial nova.
