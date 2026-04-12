# Incident Playbook de Go-Live

## 1. Quota ou budget de IA
- Sinal: custo mensal acima do budget ou execucoes acima do cap.
- Acao imediata:
  - Revisar `/cliente/painel/go-live` e `/cliente/painel/ia`
  - Confirmar se o tenant entrou em contingencia
  - Reduzir autonomia ou pausar IA se o custo estiver sem controle
- Encerramento:
  - Atualizar budget ou cap apenas com aprovacao operacional
  - Revalidar o go-live apos estabilizacao

## 2. Falha de webhook
- Sinal: canal ativo sem novas mensagens, erros de autenticacao ou falha de verify token.
- Acao imediata:
  - Revisar configuracao do canal e status de roteamento
  - Confirmar tokens, app secret e mapping externo
  - Reenviar evento teste e validar chegada no inbox
- Encerramento:
  - Registrar causa raiz
  - Rodar novo teste ponta a ponta antes de liberar o tenant

## 3. Fila ou backlog fora de controle
- Sinal: muitas conversas abertas, jobs travados ou takeover sem owner.
- Acao imediata:
  - Priorizar chats sem owner e filas acima do SLA
  - Revisar time padrao, distribuicao e usuarios online
  - Conferir se automacoes e jobs estao processando normalmente
- Encerramento:
  - Rebalancear filas
  - Revalidar criterios de owner, handoff e cobertura humana

## Criterio para voltar a operar
- Gate critico sem bloqueio
- Ultima validacao do go-live aprovada
- Evidencia de canal, IA, conhecimento e limites dentro da zona segura
