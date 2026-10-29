# Respostas enviadas pelo aplicativo do Instagram

## Ocorrência ALT-018 — ESB Variedades

Em 22/10/2026, o usuário mostrou a conversa de Jefferson Martineli com mensagens recebidas na Altum e respostas da loja ausentes. A consulta autenticada à Meta confirmou oito mensagens recentes nesse trecho: três recebidas e cinco enviadas pela conta comercial. As cinco respostas estavam ausentes do armazenamento da Altum.

### Causas comprovadas

- O webhook descartava incondicionalmente `message.is_echo`, que identifica mensagens da própria conta.
- A recuperação complementar consultava somente dez conversas recentes. A conversa do exemplo não era recuperada, embora a consulta filtrada por `user_id` retornasse seu histórico.
- Mensagens enviadas há menos de um minuto eram descartadas pela recuperação para evitar duplicar confirmações de envio da Altum.
- Duas das cinco respostas têm `is_unsupported: true` na consulta individual da Meta, sem texto, anexos, compartilhamento ou story. Isso é uma limitação dos dados históricos fornecidos pelo serviço, não evidência de expiração ou exclusão.

### Correção

1. Registrar respostas da conta como mensagens de saída. Validar assinatura e identidade da conta; nunca executar IA, automação de entrada ou criar lead a partir de um eco.
2. Compartilhar uma identidade determinística entre recebimento e recuperação. Conciliar o eco com a confirmação de envio da Altum nos dois sentidos de chegada, preservando um único balão.
3. Ao abrir uma conversa social, consultar seu histórico pelo contato, independentemente da posição na lista recente; recuperar até 200 mensagens por execução, com limite de páginas, controle de concorrência e intervalo mínimo.
4. Preservar autoria, datas, responsável e estado. Não reenviar mensagens ao cliente.
5. Mostrar explicitamente as ocorrências cujo conteúdo não foi disponibilizado pela Meta, sem inventar o conteúdo original. Se um evento posterior fornecer o conteúdo, atualizar a mesma ocorrência.

### Evidências

- Cinco respostas voltaram ao histórico da conversa real: três textos e duas indicações de conteúdo não disponibilizado. Nenhuma mensagem foi enviada ao cliente durante a recuperação.
- Dezoito cenários distintos aprovados: recebimento, áudio, recuperação, autenticação, isolamento, concorrência e representação de conteúdo não disponibilizado.
- Cinco cenários também executados novamente com o webhook e a confirmação de envio da versão preparada para publicação. Incluem atualização de uma ocorrência sem conteúdo quando chega um evento posterior com conteúdo.
- Publicado em 22/10/2026, conferido às 14h11 (Brasília): `dpl_4ZpbLKqYmTub5FovdEgWNPydqwAP`. Sete arquivos com hashes verificados; 1.507 arquivos restantes preservados.
- API pública autenticada: nove mensagens, cinco respostas da loja e duas indicações de conteúdo não disponibilizado; recuperação direcionada HTTP 200; tentativa sem autenticação HTTP 401.
- Artefatos: `.qa-artifacts/instagram-native-replies-release-20261022/`.

### Limites de validação

A consulta, a recuperação do exemplo real e a leitura autenticada da publicação foram realizadas. Um novo envio pelo aplicativo do vendedor ainda precisa confirmar a chegada do evento real após a publicação; esse teste foi solicitado ao usuário. A recuperação complementar continua disponível quando a Meta não entregar um evento. Não há promessa de recuperar mídias que a Meta não fornece; o histórico identifica esses casos expressamente.

A publicação usa sete arquivos revisados sobre a versão vigente, mantendo os demais arquivos dessa versão. Alterações de outras tarefas presentes no diretório local são excluídas da publicação.
