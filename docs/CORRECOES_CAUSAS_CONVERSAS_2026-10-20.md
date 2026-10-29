# Conversas — revisão das causas de mídia e operação

Rodada de 20/10/2026 após o vídeo do iPhone e o pedido de revisar o fluxo completo. As alterações estão no checkout local; não houve publicação, mudança de credenciais ou envio a clientes reais. O checkout já contém outras alterações, inclusive em áreas fora desta tarefa. Este relatório não atribui essas alterações à rodada atual.

## Causas encontradas e alterações

| Causa no código | Consequência possível | Correção |
| --- | --- | --- |
| O processamento de imagens/documentos/vídeos do WhatsApp gerava URL assinada mesmo depois de verificar e baixar os bytes originais. | Falha de assinatura, credencial ou acesso público podia bloquear o envio antes do provedor. | Entregar os bytes verificados aos conectores Meta/Evolution. A Meta recebe upload e ID de mídia; a Evolution recebe base64. O gateway legado continua recebendo URL, gerada apenas quando precisa dela. |
| Recebimento/análise usavam exclusivamente o bucket público configurado; envio já considerava configuração de servidor e buckets legados. | Receber e abrir podiam falhar enquanto outro fluxo de mídia funcionava. | Escrita e leitura compartilham a resolução de armazenamento. Recebimento funciona com apenas a configuração de servidor. |
| Abertura de vídeos e documentos ainda dependia de resolver link temporário, e os downloads não tinham cancelamento/limite próprios na tela. | Erro de assinatura, arquivos carregando indefinidamente e requisições antigas após trocar de conversa. | Todos os anexos da conversa usam bytes autenticados, com limite de tempo, cancelamento ao desmontar e rejeição de respostas HTML/JSON. O endpoint conserva `resolve=1` para consumidores antigos. |
| Abrir áudio OGG/WebM podia substituir `mediaUrl` pelo MP3 de reprodução. | Leitura e entrega compartilhavam uma referência mutável; um áudio da fila podia perder sua referência original de apresentação. | MP3 de reprodução tem referência e hash próprios. O original permanece intacto. Preparos concorrentes na mesma instância compartilham o trabalho; cache opcional indisponível não esconde bytes já obtidos. |
| Atualização após envio acionava o carregamento visual do histórico inteiro. | A parede de mensagens e os players eram desmontados, reaparecendo em preparação. | Histórico existente permanece montado; atualização agrega alterações e preserva mensagens carregadas. Lista e detalhe são atualizados em paralelo. |
| Controles nativos de áudio e nomes técnicos disputavam uma bolha com duas restrições percentuais de largura; a composição não tinha colunas fixas no celular. | Player pouco utilizável, área perdida e ação de envio comprimida. | Player com tocar/pausar, progresso, duração e velocidade; nome técnico removido da apresentação principal. Dimensões da bolha e da linha de escrita ajustadas apenas na área do cliente. Imagem pode ser ampliada e baixada. |
| Transferência alterava conversa/lead sem alterar o responsável humano da IA. | Estados podiam continuar apontando para o atendente anterior. | Atualização conjunta em transação, conferindo o proprietário esperado. Devolução à fila própria é permitida ao atendente; transferência a outra pessoa mantém a exigência de gestor. A devolução mantém a IA pausada. |
| PATCH operacional sem `tags` era interpretado como lista vazia. | Devolver/editar outro campo podia apagar marcadores. | Só altera marcadores quando enviados explicitamente. |
| Uma nova mensagem recebida reiniciava o prazo de uma solicitação ainda sem resposta. Reabrir conversa podia manter a fila como resolvida. | Prazo mascarado e fila incoerente. | Preservar prazo do turno pendente; iniciar outro depois de resposta ou reabertura; alinhar status e fila. Isso não prova qual era a regra contratada da ESB. |

Também foram retirados marcadores automáticos ao final de legendas na apresentação, preservando o texto do cliente.

## Evidências de teste

Os testes usam empresas fictícias e Auth, Firestore e Storage Emulator. Conectores externos são interceptados; não houve tráfego para clientes nem prova de entrega na conexão da ESB.

- Meta: documento chega ao conector por upload/ID com os mesmos bytes aceitos, sem assinatura de URL. Áudio usa FFmpeg real, sai como OGG/Opus e mantém reprodução em MP3.
- Evolution: imagem, vídeo e documento chegam ao conector com os bytes originais em base64 e uma única chamada de envio por tentativa aceita.
- Alteração dos bytes após aceite é bloqueada antes de entrega. Repetição de pedido aceito não substitui o arquivo nem cria outra mensagem.
- Perda de confirmação e interrupção do processo após envio não provocam reenvio automático. A simulação de interrupção foi atualizada para observar também o novo upload de mídia antes da mensagem.
- Imagens, áudio e vídeo continuam legíveis quando o cache opcional falha. Imagem Evolution também foi testada nessa condição. Uma segunda abertura usa o arquivo persistido quando o provedor está indisponível.
- Duas aberturas concorrentes de áudio produzem MP3 sem alterar bytes, MIME ou referência do áudio original pendente. `resolve=1` continua retornando URL e MIME de reprodução.
- Conta autenticada de outra empresa, mensagem de outra conversa, conversa de outro vendedor e falta de autenticação continuam recusadas.
- Devolver atendimento próprio mantém marcadores e não retoma IA. Transferir como gestor sincroniza conversa, lead e estado humano. Transferência de vendedor e alteração concorrente de responsável são recusadas.
- Prazo já vencido não é prorrogado por outra mensagem; novo turno e reabertura recebem novo prazo.
- Regressões anteriores de mensagem enviada pelo WhatsApp, atualização ao vivo, paginação, gravação, teclado, contexto do funil e marcadores continuam cobertas.

Testes específicos desta rodada: `conversation-assignment.emulator.mts`, `chat-media-playback.emulator.mts`, `conversation-sla.test.mts` e `inbox-media-read.test.mts`, além das suítes de mídia e regressão atualizadas.

## Limites de conclusão

As causas acima foram identificadas no código e reproduzidas em cenários controlados. Não há evidência para atribuir todos os incidentes da ESB a uma única alteração ou versão publicada. Arquivos que o provedor já perdeu não podem ser reconstruídos por esses ajustes. Importar eventos novos também não recompõe automaticamente todo o histórico anteriormente descartado.

A ferramenta de navegador informou **“Local browser use is disabled in Work settings”**. Portanto, a interface ajustada não foi validada visualmente nesta rodada, nem foi testada em um iPhone físico. Os testes de viewport não substituem esse aceite.

Lint dos arquivos alterados aprovado sem erros. A checagem independente de tipos também passou. O build final concluiu com sucesso: compilação, TypeScript e geração das 372 páginas. O pacote foi conferido para incluir o último ajuste da devolução à fila: o atendente sai da conversa devolvida antes da atualização, evitando apresentar a perda esperada de acesso como erro. Os serviços do laboratório foram encerrados.

Os itens do registro de clientes permanecem sem validação operacional real até conferir a versão publicada e a conexão afetada.

## Correção da prévia local após o print

O print posterior mostrou imagem e áudio indisponíveis também na demonstração. Os dois URLs retornavam **404 HTML do Next**, antes de executar o handler de mídia. A tabela de rotas do servidor de desenvolvimento não incluía `/messages/[messageId]/media`, embora o arquivo existisse e estivesse presente no build de produção. Após reiniciar apenas o servidor da prévia, a rota foi registrada e os mesmos URLs autenticados retornaram **200**, `image/svg+xml` com 618 bytes e `audio/wav` com 32.044 bytes. Isso identifica a falha observada na prévia; não determina a causa dos incidentes na conexão real da ESB.

A validação anterior de handlers não cobria essa fronteira do roteador em execução. Foi acrescentado `tests/inbox-preview-media.http.mts`, que obtém os URLs da API real de mensagens e confere status, MIME e assinatura dos arquivos pelo servidor local, além da recusa sem autenticação.

Os dois testes HTTP passaram na prévia em execução, incluindo resposta 401 em JSON sem autenticação. Os três testes existentes de isolamento da configuração de emuladores também passaram, e o lint da configuração e do teste novo não apresentou erros. A primeira execução ainda incluiu o custo de compilação das rotas no servidor de desenvolvimento; os GETs de mídia subsequentes registrados levaram aproximadamente 0,6–0,9 segundo.

O aviso fixo do Firebase Emulator também cobria o rodapé no print. Foi desativado somente no ramo de demonstração local já protegido por projeto fictício, modo de desenvolvimento e endereço local. Não houve alteração de autenticação ou permissão de produção. A atualização completa da aba aplica a mudança e permite nova tentativa dos anexos.

## Nomes de grupos e confirmação do Instagram — conta real

Na consulta de 20/10/2026, os grupos apresentados pela ESB continham `channelId` de conexões removidas de `tenant_channels`. A resolução anterior exigia encontrar exatamente essa conexão e encerrava sem consultar o nome. A conexão Evolution atualmente ativa no cadastro respondeu `500 / Connection Closed` à consulta de grupos; a consulta individual não retornou o nome. Cadastro ativo não comprova sessão conectada. Nenhuma reconexão, envio ou troca de conta foi feita nesta investigação.

A recuperação agora pode consultar conexões Evolution da mesma empresa quando a original não existe, utilizando o JID exato do grupo e conferindo o identificador retornado. Grava apenas o nome, preservando o canal original de envio. A lista também recupera nomes progressivamente, com limite de quatro grupos por página, prazo de consulta, intervalo entre tentativas e compartilhamento de consultas simultâneas. A gravação transacional confere novamente empresa, grupo e nome para não sobrescrever alterações concorrentes. O prefixo redundante `Grupo ·` foi removido. O caractere inválido da velocidade do áudio também foi corrigido.

Os nomes reais continuam dependendo de uma sessão conectada que consiga consultar os grupos correspondentes. Não foram inventados nomes nem migradas conversas para a nova conta. A recuperação para conexões removidas, concorrência, desconexão, escopo e lista passou nos testes com dados fictícios.

O contexto do Instagram já está integrado ao webhook, à resposta da API e ao balão da Inbox: resposta ao story, menção em story e resposta a mensagem, com prévia quando fornecida e disponível. Os quatro testes do extrator passaram novamente. Não houve validação de um novo evento real do Instagram nem publicação nesta rodada. Mensagens antigas sem contexto armazenado não recebem uma origem presumida.

Validação desta rodada: 8 testes novos de nomes de grupos, 6 de sincronização externa/recuperação e 4 de contexto do Instagram aprovados; lint dos arquivos alterados sem erros. Build completo aprovado, incluindo TypeScript e geração das 372 páginas. A primeira checagem independente de tipos observou a assinatura do provedor antes da edição e o chamador depois da edição; o build posterior, feito com as fontes estabilizadas, confirmou os tipos finais. A versão compilada foi reiniciada localmente na porta 3000.
