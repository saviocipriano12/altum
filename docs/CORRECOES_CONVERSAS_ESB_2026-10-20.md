# Conversas e funil — correções locais de 20/10/2026

As alterações tratam os relatos da ESB Variedades sem acessar ou modificar dados dessa empresa. Não houve publicação nesta tarefa. O checkout já continha alterações anteriores; este documento descreve o trabalho específico desta rodada.

## Mudanças

- **Área de escrita:** a grade ocupa a altura disponível e usa uma linha que pode encolher; removidos a altura mínima indevida da lista e deslocamentos dos painéis laterais. Campo de resposta permanece fora da rolagem do histórico. O cabeçalho expandido tem limite de altura. O espaçamento inferior foi ajustado somente no layout de Conversas.
- **Grupos:** nome genérico pode ser resolvido no provedor ao abrir ou receber mensagem, com verificação da empresa/canal e intervalo de nova tentativa em caso de falha. O nome obtido fica persistido para lista e cabeçalho. Se o provedor não retornar nome, não se inventa um nome.
- **Mensagens próprias do WhatsApp:** eventos `fromMe` passam a ser importados como saída. Eventos repetidos usam a mesma identidade externa. Um eco que chega antes da confirmação da Altum é fundido à mensagem da fila; se chega depois, usa a mensagem já conhecida. Não vira mensagem do cliente e não dispara automação de entrada.
- **Atualização:** listener das mensagens no intervalo do histórico carregado identifica inclusão, alteração e remoção, inclusive mensagens atrasadas. A API autenticada retorna os IDs alterados com serialização de mídia protegida. Continua havendo consulta periódica de recuperação quando o listener falha; mensagens recentes são reconciliadas nessa consulta. Histórico paginado é preservado.
- **Imagens/áudios:** a abertura pode recuperar mídia Evolution antiga pelo ID já armazenado. Novas mídias preservam referência mínima para nova tentativa. A referência não é exposta pela API de mensagens. Imagens e áudio são carregados por bytes autenticados, sem depender de link assinado no player. Há nova tentativa manual. Áudio armazenado em OGG/WebM passa pelo caminho de compatibilidade móvel; se a conversão falhar, o arquivo original permanece disponível.
- **Marcadores:** normalização elimina a diferença entre `[Audio recebido]` e `[Áudio recebido]`; a tela reconhece formatos legados/repetidos sem tratá-los como transcrição.
- **Funil e IA:** cada turno recebe a configuração atual com identificador, nome, descrição e ordem. Uma etapa personalizada não herda descrição, terminalidade ou prazos por posição em um funil padrão. A IA pode propor etapa existente com trecho literal e confiança; o código valida a proposta, respeita autonomia, propriedade manual e progressão existentes e protege etapas finais. Descoberta inicial não é automaticamente classificada como negociação por ser a próxima coluna. Edição do funil altera o contexto e sua assinatura.

## Validação realizada

Passaram os testes de regressão de parser, normalização e contexto de IA, além dos testes existentes de envio, identidade, recuperação de rede, paginação, viewport e CRM. O teste real de conversão de áudio também passou. A checagem de tipos passou, inclusive na etapa TypeScript do build final. O lint dos arquivos alterados não apresentou erros; apontou dois avisos anteriores em `agent.ts` fora das regiões desta mudança.

`npm run build` concluiu com sucesso: compilação, TypeScript e geração das 372 páginas estáticas. O servidor e os serviços de teste foram encerrados após os testes.

Também foi testado que uma resposta HTTP antiga não regride a revisão de uma mensagem já atualizada ao vivo. IDs removidos na reconciliação não são reinseridos por respostas antigas.

Integração em **Auth, Firestore e Storage Emulator**, projeto `demo-altum-qa-lab`, com credenciais e empresas fictícias:

- Mensagem própria repetida importa uma vez e não cria job de IA de entrada.
- Eco antes da confirmação é fundido; eco depois da confirmação preserva a entrega já registrada.
- Imagem antiga é recuperada por referência, e os bytes persistidos correspondem ao arquivo retornado pelo provedor simulado.
- Nome real de grupo substitui o genérico; leitura posterior usa o valor salvo.
- Listener com usuário autenticado recebe mudança de entrega e inclusão com horário anterior às mensagens recentes.
- API por IDs entrega a atualização e URL protegida; ID de mensagem de outra empresa é recusado.
- Rota de mídia autenticada entrega `image/png` com os bytes esperados, sem assinatura de URL.
- Paginação existente continua retornando as 220 mensagens fictícias sem perda ou repetição.

Testes novos: `customer-conversation-regressions.test.mts`, `whatsapp-external-sync.emulator.mts` e `inbox-live-messages.emulator.mts`.

## Limites e pendências

- Não houve validação na conexão real da ESB nem no dispositivo do vendedor. Eventos de provedor nos testes foram simulados; persistência, regras e autenticação usaram emuladores reais.
- A ferramenta de navegador não respondeu às tentativas de abrir o laboratório local. Não foi confirmada visualmente a posição final do campo de resposta; precisa ser conferida em 1920×1080, notebook com zoom, celular e com teclado aberto, após iniciar a versão ajustada.
- A recuperação de mídia depende de a Evolution ainda conseguir obter o arquivo original. Não restaura um arquivo removido ou expirado no provedor. Não houve migração destrutiva nem reconstrução em massa de históricos antigos.
- Importação de mensagens próprias cobre os eventos novos recebidos. Mensagens próprias descartadas antes desta publicação não são automaticamente reconstruídas em massa. Tipos suportados pelo parser: texto, áudio, imagem, vídeo e documento.
- A configuração de novas conexões inclui `SEND_MESSAGE`; não foram alteradas assinaturas de webhook nem reconectadas contas reais. Confirmar recebimento dos eventos na conexão existente após publicação.
- Os controles de devolver/transferir e a regra de prazo avaliados na rodada anterior continuam demandando trabalho próprio; esta rodada não os declara resolvidos.
- A proposta de etapa da IA é validada, mas não é garantia de classificação perfeita. Validar conversas representativas do funil do cliente antes de ampliar autonomia. Etapas finais não são fechadas por essa proposta.

Referência técnica: o [código oficial da Evolution para mídia](https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts) admite recuperar mensagem pela chave quando o corpo não é fornecido; os [eventos oficiais de webhook](https://github.com/evolution-foundation/evolution-docs/blob/main/docs/02-Configuration/Webhooks.md) distinguem recebimento e envio.
