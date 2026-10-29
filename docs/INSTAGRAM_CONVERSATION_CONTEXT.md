# Contexto do Instagram em Conversas

O webhook preserva `reply_to.story` e anexos `story_mention` em `instagramContext`, somente em mensagens do Instagram. A API autenticada de mensagens entrega esse contexto; o Inbox mostra a origem e tenta renderizar a prévia fornecida pela Meta. Respostas com `reply_to.mid` são associadas à mensagem original quando ela está no histórico carregado.

## Limites e validação operacional

- Aplica-se às novas mensagens recebidas após a publicação. Stories descartados pelo código anterior não são recuperados retroativamente.
- URLs de mídia da Meta são temporárias. A interface mantém a origem e mostra uma indicação de prévia indisponível quando a imagem falha, inclusive para formatos não renderizáveis como imagem. Não há arquivamento permanente do story.
- Uma resposta contendo emoji continua sendo resposta ao story; não se infere um tipo de reação que o evento não informou. Eventos separados de reação a mensagens não foram implementados nesta alteração.
- A mensagem original de uma resposta pode estar fora da página carregada; nesse caso a interface informa sua indisponibilidade.
- As prévias aceitam somente HTTPS em domínios de mídia Meta/Instagram, sem credenciais na URL.
- Não houve publicação nem validação em uma conta real nesta tarefa. Após publicar, enviar uma DM comum, uma resposta textual a story, uma resposta com emoji, uma menção e uma resposta a mensagem. Conferir tenant, origem, texto e prévia. Conferir também o estado após expiração da mídia.

Teste local: `node --import tsx --test tests/instagram-message-context.test.mts`.
