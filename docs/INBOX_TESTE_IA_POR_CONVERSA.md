# Teste real de IA por conversa

Implementacao local em 19/10/2026, ainda nao publicada.

- Nas acoes existentes da conversa, gestores com `manage_ai` e `respond_inbox`
  podem iniciar "Testar IA so nesta conversa". Nao cria tela ou endpoint.
- Confirmacao avisa sobre respostas reais, mensagem pendente, remocao da pausa
  humana na conversa escolhida e interrupcao da IA nas demais conversas do tenant.
- Usa settings/ai existente para gravar, no mesmo aceite, enabled, resposta ativa,
  modo automatico, percentual 100 e exclusiveTest com uma unica conversa. A API
  existente mantem permissao, propriedade, bloqueio de grupos e gate de qualidade
  se houver aumento do percentual. O botao nao contorna esse gate.
- So depois da resposta confirmar o escopo exato chama ai-state/resume. Falha
  nao remove restricao, nao tenta liberar todas e nao repete chamadas automaticamente.
- Encerrar pausa respostas globalmente, mantendo o escopo restrito. Nunca restaura
  atendimento geral por timeout ou encerramento; liberacao geral exige configuracao
  explicita na tela existente do Assistente.
- Indicador distingue conversa dentro/fora do teste, pausa global e pausa individual.
- Sem mutacao de tenant real, envio externo ou homologacao visual nesta rodada.
  Testes puros cobrem ordem das chamadas, recusas, escopo inesperado e falha parcial;
  os testes existentes de rollout/contrato cobrem restricao de tenant e runtime.
- Verificacao desta rodada: 23/23 testes (inbox-ai-test, ai-conversation-rollout,
  ai-exclusive-test-contract), typecheck direcionado incluindo a pagina de inbox
  aprovado, lint dos tres arquivos de implementacao/teste sem erros ou avisos.
  Nao foi executado build global do checkout compartilhado.

Riscos: as duas APIs nao formam uma transacao unica; se resume falhar, o escopo ja
esta restrito, e deve ser conferido antes de tentar novamente. Alteracoes simultaneas
de outro gestor continuam sujeitas aos controles existentes. Nao comprova cancelamento
de envio que ja entrou no provedor antes da mudanca de escopo. O fluxo completo
autenticado e a publicacao permanecem pendentes; a fase 2 segue aberta.
