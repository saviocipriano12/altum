# Áudio nativo e atualização das conversas — 20/10/2026

Atualização posterior: [versão publicada e verificada em produção](PUBLICACAO_CONVERSAS_2026-10-20.md). O histórico abaixo registra a investigação e os testes anteriores à publicação.

## Evidência real

Na conversa indicada pelo usuário na conta Savio Cipriano, a conexão Evolution estava `open`. O webhook estava habilitado, apontando para `altumia.com.br`, com `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `SEND_MESSAGE_UPDATE`, mas sem `SEND_MESSAGE`. Isso difere da conta ESB examinada anteriormente, cuja sessão consultada estava fechada.

O provedor tinha o áudio enviado pelo celular às 16:18:39, mas o histórico da Altum não o continha. O envio pelo PC usou `@s.whatsapp.net`; o celular usou `@lid`, com `remoteJidAlt` correspondente ao mesmo destinatário. Consultar apenas o JID de telefone deixava esse áudio fora do resultado. A presença de `MESSAGES_UPSERT` na configuração significa que apenas adicionar `SEND_MESSAGE` não comprova a correção do evento móvel: o processamento publicado também precisa ser atualizado e validado.

Após os testes controlados, o áudio faltante foi importado uma única vez na conversa existente como mensagem do atendente, com origem WhatsApp. Não houve reenvio, acionamento de IA, troca de responsável ou migração para outra conta. O arquivo OGG/Opus tinha 4.291 bytes e duração de 2 segundos. A versão MP3 de reprodução foi gerada e conferida, com 29.301 bytes, preservando o original.

## Mudanças

- Player integrado ao balão, sem cartão interno: tocar/pausar, duração, busca, velocidade e ondas medidas a partir do arquivo. Quando a decodificação das ondas não estiver disponível, o controle de reprodução continua funcionando. A transcrição fica em uma ação expansível.
- O pacote `ffmpeg-static` passa a ser carregado nativamente pelo servidor. O pacote anterior continha um caminho compilado `/ROOT/node_modules/ffmpeg-static`, inexistente no Windows local, impedindo a conversão em execução apesar de o arquivo binário estar instalado.
- Atualização por SSE autenticado no servidor: escuta de mensagens e da lista, alterações e exclusões, verificação de empresa e atribuição, revalidação de acesso, expiração, reconexão e cancelamento das inscrições. Os eventos transportam identificadores; o conteúdo e as mídias continuam vindo das APIs autorizadas. O acesso direto do navegador ao Firestore deixa de determinar se a Inbox recebe as notificações.
- Filas independentes para mensagens e lista. Uma resposta lenta da lista não bloqueia as mensagens seguintes. Eventos recebidos durante uma requisição ficam pendentes e são processados depois; falhas são repetidas com espera limitada.
- Recuperação complementar dos envios recentes pelo aplicativo: considera `remoteJid` e `remoteJidAlt`, exige o destinatário exato e a mesma conta, elimina duplicatas e não executa IA nem envia mensagens. Consulta no máximo 100 registros recentes do provedor; não é uma importação integral de histórico. Há um bloqueio compartilhado por conversa e intervalo de 10 segundos entre tentativas. Seu estado acompanha a exclusão/restauração da conversa.

## Validação e limites

Os testes de SSE mediram 65 ms, 142 ms e 173 ms entre a gravação no Firestore e a notificação autenticada no laboratório, em execuções distintas. Isso não mede o trajeto completo celular → WhatsApp → provedor → webhook → navegador. Os testes também verificam recebimento de alterações/exclusões, recusa sem autenticação, isolamento entre empresas/vendedores e interrupção do acesso após transferência.

Os testes da recuperação incluem o caso real reproduzido com dados fictícios: áudio móvel com LID e telefone alternativo, mensagem já existente do PC, mensagem de outro destinatário e repetição da consulta. Apenas o áudio móvel correspondente é importado. Os testes de filas comprovam a entrega de mensagens enquanto a lista continua carregando.

O endereço público continua recebendo os eventos reais enquanto o usuário testa o localhost. Sem publicar o processamento atualizado, a recuperação complementar pode levar até o intervalo da próxima consulta, além do tempo de rede. Portanto, o fluxo completo de mensagens móveis por evento ainda depende da publicação e de um teste real posterior. Nenhum webhook foi redirecionado para localhost e nenhuma publicação foi feita nesta rodada.

A automação de navegador disponível informou que o controle local está desativado nas configurações de Work; o resultado visual deve ser conferido pelo usuário no localhost. Os testes não substituem a validação em iPhone físico.

## Resultado final desta rodada

- 11 testes de stream, filas, formas de onda, recuperação e exclusão aprovados; os 6 testes existentes de sincronização externa também passaram. Lint dos arquivos alterados sem erros.
- Build completo aprovado, incluindo TypeScript e 372 páginas. A checagem anterior encontrou tipos de uma automação em edição concorrente; a fonte já havia sido corrigida e o build final confirmou os tipos atuais. Nenhuma alteração nessa automação foi feita nesta tarefa.
- Teste HTTP da versão compilada executado na porta 3198 com Auth, Firestore e Storage exclusivamente em emuladores do projeto fictício. O SSE respondeu 200 e notificou uma mensagem nova em 218 ms, sem aguardar um intervalo de consulta. A rota autenticada de áudio converteu uma amostra OGG em MP3 e respondeu 200, `audio/mpeg`, com 15.038 bytes. Esse teste cobre o empacotamento real do conversor e a transmissão HTTP, além dos handlers isolados.
- O servidor auxiliar de verificação foi encerrado. O servidor da porta 3000 foi reiniciado com as configurações reais. Login e Inbox responderam 200; a nova rota de eventos respondeu 401 JSON sem autenticação, conforme esperado.
