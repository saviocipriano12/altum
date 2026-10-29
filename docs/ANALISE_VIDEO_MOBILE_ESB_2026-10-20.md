# ESB Variedades — análise visual do uso no iPhone

Vídeo recebido nesta conversa: `5d20f645-3cf8-469a-a2c3-4b2d39bd9e37.mp4`, duração de 18,6 segundos. Análise de quadros da gravação, com tempos aproximados. O vídeo filma um iPhone acessando a Altum pelo navegador; não é uma captura direta da tela. Os originais e quadros derivados não foram incorporados ao repositório.

Esta evidência mostra o comportamento da versão gravada. Não valida as alterações locais ainda não publicadas. Não houve escuta/transcrição da faixa de áudio, acesso à conta real nem confirmação de recebimento no destinatário.

## Achados

| Trecho aproximado | Evidência visual | Classificação e vínculo |
| --- | --- | --- |
| 0–4 s | Cabeçalho identifica a conversa como “Grupo · Grupo do WhatsApp”. Duas imagens aparecem como indisponíveis, com marcadores de imagem misturados às legendas. | Defeitos já registrados: ALT-010 e ALT-012. |
| 1–4 s | Interface de gravação mostra “Gravando áudio” e “Cancelar”. | O estado de gravação existe. O enquadramento e a duração não permitem comprovar falha de captura, duplicação ou perda do áudio. |
| 5–8 s | Balões de áudio estão visíveis; em seguida o histórico fica vazio por um instante e retorna, com os players em “Preparando audio seguro...”. | Nova evidência de instabilidade da apresentação: ALT-014. Não comprova exclusão de mensagens no servidor nem identifica a causa. |
| 8–13 s | Áudios ocupam balões grandes e mostram nomes como `audio-….webm`, em vez de uma apresentação simples de mensagem de voz. Há indicadores de relógio ao lado dos horários. | Problema de apresentação e clareza do estado: ALT-001/005 e ALT-013. A existência de três balões não comprova duplicação. Não é possível confirmar reprodução ou entrega por esses quadros. |
| 13–15 s | O teclado abre e o campo de escrita aparece acima dele. | Neste trecho o campo está acessível; o vídeo não comprova que fica oculto com o teclado aberto. A estabilidade ao abrir/fechar ainda precisa de teste no aparelho. |
| 16–18 s | O campo contém “Oi”, o teclado está fechado e a ação verde de envio aparece estreita, com formato comprimido em relação ao botão de microfone anterior. O texto permanece no campo até o fim do trecho visível. | ALT-013: ação principal sem área de toque e apresentação consistentes. O vídeo termina sem comprovar se a mensagem foi recebida; não atribuir causa de envio sem resposta da operação. |

## Critérios de aceite para a experiência de Conversas

1. Ao abrir a conversa, cabeçalho, histórico e campo de resposta cabem na área útil. A página não precisa rolar para alcançar a escrita; apenas o histórico tem rolagem própria.
2. Abrir e fechar o teclado mantém o campo de resposta acessível, o botão de envio inteiro e o histórico estável. Ações principais têm área de toque de pelo menos 44 × 44 pixels CSS.
3. Texto no campo troca o microfone por uma ação de envio reconhecível, sem comprimir a linha. Em envio pendente há retorno claro; em falha o conteúdo pode ser recuperado e reenviado sem duplicação.
4. Áudio tem controle simples de tocar/pausar, progresso e duração, sem nome técnico como conteúdo principal. Gravar, cancelar, enviar e ouvir funcionam no Safari do iPhone e no computador. Carregar outra mensagem não reinicia a reprodução em andamento.
5. Atualizações e recuperação de rede preservam as mensagens já exibidas, a posição de leitura e o rascunho. Uma atualização não esvazia o histórico inteiro.
6. Nome real do grupo aparece na lista e no cabeçalho. Imagens abrem, podem ser ampliadas e mostram recuperação ou falha compreensível quando necessário.
7. Uma conversa de teste permite comparar mensagens enviadas pela Altum e pelo WhatsApp: direção, texto, mídia e estado, sem perda ou repetição. A confirmação de entrega depende do evento correspondente, não apenas da presença de um balão.
8. Informações de CRM, funil e IA ficam disponíveis por ação contextual, sem disputar a área necessária para ler e responder. Abrir uma conversa para observar não muda seu responsável.

## Relação com o código local

As correções anteriores de altura, mídia, nome de grupo e sincronização estão descritas em [Correções locais](CORRECOES_CONVERSAS_ESB_2026-10-20.md). O botão de envio local já possui dimensões e proteção contra encolhimento; isso reforça a necessidade de validar a combinação final de estilos no aparelho, em vez de presumir que o vídeo reproduz exatamente o código local atual.

Não foi aplicada nova correção funcional com base apenas nos quadros. ALT-013 e ALT-014 permanecem em investigação. A validação visual da versão ajustada, especialmente no iPhone com teclado e gravação, continua pendente.
