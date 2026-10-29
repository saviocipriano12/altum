# Avaliação técnica — atendimento ESB Variedades

Data da avaliação: 20/10/2026. Escopo: código local de Conversas, webhook WhatsApp, mídia, envio, fila e atribuição. Relacionado ao [registro de ocorrências](REGISTRO_PROBLEMAS_CLIENTES.md).

## Conclusão

Há falhas verificáveis no código que podem afetar a operação descrita: atualização incompleta de mensagens existentes, atraso introduzido pela consulta periódica, descarte de mensagens enviadas pelo WhatsApp no caminho Evolution, marcadores de áudio duplicados e falta de uma operação clara de devolução de atendimento. A indisponibilidade específica dos áudios e a falha real de envio da ESB ainda exigem dados da tentativa afetada.

Esta avaliação não alterou código funcional, não publicou versão e não enviou mensagens. Não foram acessados a conta da ESB, logs de produção ou banco real. O código local possui alterações prévias; não foi confirmada sua correspondência com a versão dos prints ou com produção. Os achados abaixo são do código atual, não uma atribuição retroativa de causa a cada incidente.

História avaliada: o cliente manda uma mensagem no WhatsApp → a Altum recebe e armazena conteúdo/mídia → o vendedor vê e ouve → responde → acompanha a entrega → pode transferir ou devolver o atendimento.

## 1. Mensagens já exibidas não recebem atualizações pelo fluxo automático

**Prioridade: crítica. IDs: ALT-001, ALT-005, ALT-007. Confirmado por inspeção do fluxo.**

- `app/cliente/painel/inbox/page.tsx:2890` consulta a conversa com `incrementalMessages: true`.
- `app/cliente/painel/inbox/page.tsx:2610` envia `direction=newer` e cursor.
- `app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts:134` ordena por `createdAt` e ID; `:141` usa `startAfter`.
- O envio é assíncrono (`app/api/tenant/[tenantId]/chats/[chatId]/send/route.ts:40`), e a mídia é persistida depois do primeiro documento da mensagem (`app/api/webhooks/whatsapp/route.ts:653`).

Consequência: se a tela já carregou uma mensagem pendente ou sem mídia, alterações posteriores de entrega ou disponibilidade nesse mesmo documento ficam antes do cursor. A atualização automática não as recupera. Abrir novamente ou recarregar integralmente pode mudar a exibição, dando aparência de inconsistência. Isso pode ocultar uma falha real de envio; não demonstra, sozinho, que a mensagem deixou de ser entregue.

Há ainda risco para mensagens recebidas com atraso: a normalização conserva o horário original do evento (`lib/server/messaging/inbound-event.ts:234`), usado como `createdAt` na persistência. Uma mensagem inserida depois com horário anterior ao cursor também fica fora da busca de novidades.

**Correção necessária:** manter paginação histórica, mas reconciliar alterações em mensagens existentes e novas inserções atrasadas por um mecanismo independente do cursor cronológico do histórico. Não basta apenas reduzir o intervalo de consulta.

**Validação:** abrir antes de a mídia terminar; acompanhar pendente → enviada → entregue ou falha; receber evento atrasado; assegurar atualização sem recarregar, sem perder histórico ou duplicar mensagens.

## 2. O modelo de atualização introduz atraso perceptível

**Prioridade: crítica para atendimento. ID: ALT-006. Configuração confirmada; duração real na ESB não medida.**

- Conversa selecionada: intervalo de 10 segundos (`app/cliente/painel/inbox/page.tsx:2896`).
- Lista: intervalo de 30 segundos (`app/cliente/painel/inbox/page.tsx:2928`).
- O próximo intervalo é agendado após concluir a requisição (`app/cliente/painel/hooks/use-adaptive-polling.ts:133` e `:150`). Portanto, o tempo de rede/processamento se soma à espera. Não são limites máximos de latência.
- A consulta periódica comum é suspensa com a aba oculta; há atualização ao retomar.
- O caminho de mídia Evolution aguarda download com timeout de 25 segundos antes de concluir o processamento (`lib/server/messaging/evolution-provider.ts:213`, `app/api/webhooks/whatsapp/route.ts:660`). A mensagem inicial já pode existir enquanto esse trabalho continua.

**Correção necessária:** entrega de atualizações adequada ao atendimento interativo, reconciliada com o histórico; separar latência do provedor, processamento, mídia e tela. Planejar carga antes de aumentar consultas para toda a base.

**Validação:** medir ponta a ponta envio/recebimento e atualização de estado em aba ativa, retorno de aba e reconexão; definir meta com base em percentis e acompanhar erros. Não declarar tempo real apenas porque um teste isolado foi rápido.

## 3. Mensagens enviadas pelo WhatsApp são descartadas no caminho Evolution

**Prioridade: alta; crítica se a equipe alterna WhatsApp e Altum. ID: ALT-007. Reproduzido com evento fictício.**

`lib/server/messaging/evolution-webhook.ts:170` retorna `null` para `key.fromMe === true`. O webhook, nesse caminho, responde com evento ignorado (`app/api/webhooks/whatsapp/route.ts:838`). Assim, mensagens enviadas diretamente pelo celular/WhatsApp Web não são importadas por esse fluxo.

Isso é uma limitação concreta para comparar os dois históricos. É preciso confirmar se o canal afetado da ESB usa Evolution. O achado não prova perda de mensagens recebidas nem deve ser generalizado para outros provedores.

**Correção necessária:** reconciliar mensagens próprias recebidas do provedor com os envios já registrados na Altum, preservando remetente e ID externo. Simplesmente remover a condição pode duplicar mensagens e acionar automações indevidas.

**Validação:** enviar pela Altum, pelo celular e pelo WhatsApp Web em conversa de teste; cada mensagem deve aparecer uma vez, como saída, sem disparar automação de entrada.

## 4. Áudio pode ficar sem recuperação após falha de processamento

**Prioridade: crítica. ID: ALT-001. Fragilidade confirmada; causa da ESB pendente.**

O caminho genérico salva o documento antes do download. No caso Evolution, sempre tenta baixar a mídia original. Se o download ou armazenamento falhar, registra `mediaProcessingError` e continua (`app/api/webhooks/whatsapp/route.ts:682`). Ao final pode marcar o evento como processado (`:736`); uma reentrega comum de evento já processado é descartada (`:313`). Portanto, repetir o webhook não garante recuperação da mídia. Nesse tratamento de erro não há uma tarefa persistente específica de retry de mídia.

A API considera pronta a mídia quando encontra origem ou ID (`app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts`, função `inferMediaAvailability`). O estado não distingue adequadamente processamento pendente de ausência definitiva. O balão de áudio não oferece recuperação específica (`app/cliente/painel/inbox/page.tsx:1656`).

Há outra fragilidade de compatibilidade: o player atual solicita bytes diretamente (`page.tsx:1474`); a rota devolve o arquivo original antes da conversão (`messages/[messageId]/media/route.ts:169`), e a conversão de OGG/WebM fica no caminho `resolve=1` (`:185`). Esse caminho de compatibilidade não é usado pelo player de áudio atual. A existência de falha em um navegador concreto exige teste com arquivo e dispositivo.

**Correção necessária:** estados explícitos de processamento, recuperação de mídia idempotente e observável, referência segura para nova tentativa, reprodução compatível e distinção entre erro transitório e arquivo irrecuperável. Não mascarar ausência de áudio com transcrição.

**Validação:** áudio real em computador e iPhone; falha temporária de download/Storage e posterior recuperação; recarga; arquivo antigo; integridade, tipo MIME e acesso entre empresas. Confirmar os erros das mensagens da ESB antes de escolher a causa.

## 5. A duplicação dos marcadores foi reproduzida

**Prioridade: alta. ID: ALT-002. Confirmado por execução local com dados fictícios.**

- Parser Evolution usa `[Audio recebido]` (`lib/server/messaging/evolution-webhook.ts:185`).
- Normalização acrescenta `[Áudio recebido]` (`lib/server/messaging/inbound-event.ts:180` e `:250`).
- Como os textos diferem pelo acento, a deduplicação por igualdade exata mantém os dois.
- O filtro visual aceita apenas `audio recebido` sem acento (`app/cliente/painel/inbox/page.tsx:774`). Também não reconhece marcadores repetidos.

Resultado observado ao executar os módulos reais com uma mensagem de áudio fictícia:

```json
{"parsedText":"[Audio recebido]","storedText":"[Audio recebido] [Áudio recebido]","selfMessage":null}
```

O helper real de apresentação reconheceu apenas `[Audio recebido]` como marcador; os formatos acentuado e repetidos não foram reconhecidos. Isso explica a representação duplicada, mas não comprova duplicação do arquivo nem do evento.

**Correção necessária:** evitar inserir rótulos de apresentação no conteúdo como se fossem legenda/transcrição; reconhecer os formatos legados sem apagar falas reais do cliente.

**Validação:** áudios com/sem texto, novos e legados, marcadores com/sem acento e eventos repetidos.

## 6. Assumir, devolver, transferir e retomar IA não formam um fluxo coerente

**Prioridade: alta. IDs: ALT-004 e ALT-009. Confirmado por inspeção.**

- O cabeçalho oferece Assumir ou um selo Humano (`app/cliente/painel/inbox/page.tsx:5449`), sem ação direta correspondente para devolver.
- Transferência está no seletor Responsável em opções secundárias (`:4429`). A interface habilita o campo para `respond_inbox`; a API permite a alteração apenas a gestores (`app/api/tenant/[tenantId]/chats/[chatId]/route.ts:637`). O vendedor pode encontrar um controle que termina em recusa ao salvar.
- `takeover` define tanto a atribuição em `chats` quanto o responsável humano em `chat_state` (`ai-state/route.ts:264`).
- Transferir/limpar o responsável atualiza `chats` e o lead, mas não sincroniza `chat_state.humanOwnerUserId` no fluxo revisado (`chats/[chatId]/route.ts:658` até `:747`). Pode permanecer uma referência ao responsável humano anterior.
- `resume` limpa o responsável humano da IA, mas mantém a atribuição do chat (`ai-state/route.ts:334`). Pode também processar uma mensagem pendente. Logo, Retomar assistente não equivale a devolver à fila e não deve ser usado como um simples desfazer.

**Correção necessária:** definir ações distintas e permitidas por perfil: visualizar, assumir, devolver à fila, transferir e retomar assistente. Sincronizar responsabilidade comercial e humana conforme a transição, com atualização consistente e proteção contra duas tomadas simultâneas.

**Validação:** vendedor próprio/outro, gestor, canal pessoal/compartilhado e dois vendedores simultâneos; conferir responsável, fila, IA, histórico e ausência de resposta automática inesperada.

## 7. Campo de resposta existe; ausência no desktop não foi reproduzida

**Prioridade: alta. ID: ALT-008. Funcionalidade presente; problema visual/perfil pendente.**

O formulário existe para a conversa selecionada (`app/cliente/painel/inbox/page.tsx:5624`), com textarea e envio por Enter (`:5839`). Sua desabilitação depende de permissão, seleção e envio em andamento; não exige necessariamente clicar em Assumir. A tomada de atendimento controla atribuição/IA, não é a única condição para responder.

O código local já contém ajustes de altura e viewport. A foto parcial e a revisão estática não demonstram que o layout atual esconde o campo. A hipótese deve ser testada na resolução, zoom, perfil e versão usados pela equipe.

**Validação necessária:** janela do vendedor, zoom e rolagem, campo sempre alcançável, Enter/Shift+Enter, bloqueio por permissão, envio em curso e retorno de rede. O teste de viewport executado cobre geometria móvel simulada, não a renderização real no computador da ESB.

## 8. Prazo não está demonstrado como incorreto

**ID: ALT-003. Pendente de regra e reprodução.**

A tela encerra a contagem para conversa resolvida/arquivada ou resposta posterior à entrada; usa `slaDueAt` e, na ausência, fallback de 15 minutos (`app/cliente/painel/inbox/page.tsx:1168`). O backend lê uma duração configurável e usa aritmética de tempo corrido no helper de entrada (`lib/server/chat-operations.ts:10` e `:59`). Esse helper não calcula expediente.

É necessário confirmar se o prazo contratado deve considerar horário comercial, primeira resposta ou cada mensagem. Também verificar se uma tentativa aceita pelo provedor, mas não entregue, deveria encerrar a pendência comercial. Os prints com prazos diferentes em conversas diferentes não provam erro.

## Envio: o que está presente e o que falta provar

Há fila persistente, identidade de tentativa, proteções contra reenvio ambíguo, estados de entrega e mensagem de erro na UI. A API confirmar aceite na fila não comprova entrega ao cliente. Os testes locais de idempotência e do provedor passaram; não confirmam conexão, worker ou entrega da ESB.

Para ALT-005, coletar a tentativa afetada: conversa, ID da mensagem/job, estado atual, retorno do provedor e horários de aceite/processamento/confirmação. Conferir execução do worker no ambiente real. Há configuração de job externo em `infra/jobs/run-job.sh`; sua instalação/atividade não foi verificada. Não afirmar que o worker está ausente apenas porque não aparece como cron específico no `vercel.json`.

## Verificações executadas

40 testes passaram, sem falhas:

```text
node --import tsx --test tests/evolution-text-delivery.test.mts tests/inbox-load-gate.test.mts tests/inbox-network-recovery.test.mts tests/inbox-viewport.test.mts tests/chat-outbound-idempotency.test.mts
```

Também foram executados os módulos reais do parser e normalizador com áudio e evento próprio fictícios, e o helper de apresentação extraído do código atual. Nenhuma chamada de envio ao cliente foi feita.

Sem validação: navegador real da ESB, fluxo com WhatsApp real, worker de produção, recuperação dos áudios originais e correspondência do checkout local com produção. Não foram executados lint, typecheck ou build nesta avaliação documental; não houve alteração funcional a compilar.

## Sequência de correção recomendada

1. **Confiabilidade visível:** reconciliar mensagens alteradas/atrasadas, para que mídia pronta e erro de envio cheguem à tela.
2. **Áudio e envio reais:** diagnosticar exemplos ESB, implementar recuperação de mídia e validar a entrega ponta a ponta em contato autorizado.
3. **Sincronização e latência:** importar/reconciliar mensagens próprias e melhorar propagação das novidades com medição de carga e atraso.
4. **Operação do vendedor:** ações claras para assumir/devolver/transferir; permissões coerentes; atribuição e IA sincronizadas; campo de resposta validado em desktop.
5. **Conteúdo e prazo:** eliminar marcadores duplicados, confirmar regra de prazo e testar os limites.

Critério de encerramento: uma mensagem de teste pode ser recebida, ouvida e respondida, com entrega e estado corretos sem recarregar; alternar entre WhatsApp e Altum mantém um histórico íntegro; o vendedor sabe quem atende e consegue executar as transições autorizadas.
