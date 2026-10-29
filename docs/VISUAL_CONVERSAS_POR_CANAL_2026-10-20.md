# Visual das conversas por canal — 20/10/2026

O usuário solicitou familiaridade com as DMs do Instagram dentro da Inbox, preservando a experiência atual do WhatsApp, e ícones pequenos para identificar a rede social.

## Alterações

- Instagram: fundo sem textura, recebidas em superfície neutra, enviadas em violeta, balões arredondados e controles de envio/gravação na cor do canal. Contraste de áudio e respostas citadas acompanha o balão.
- Instagram e Messenger: sem relógios ou tiques do WhatsApp. Um status ausente no histórico não é apresentado como envio pendente. “Enviando…” e avisos de falha dependem do status efetivamente informado. “Visto” aparece somente com confirmação de leitura e na última mensagem enviada.
- WhatsApp: conserva seus indicadores de envio, entrega, leitura e falha.
- Ícones existentes de WhatsApp, Instagram e Messenger reaproveitados ao lado do nome da rede. Na lista móvel, um ícone pequeno fica sobre o avatar porque o rodapé da conversa é ocultado pelo layout compacto.
- Cabeçalho sem repetição do rótulo Instagram. Informações de conexão pessoal/compartilhada e conta continuam disponíveis.

Implementação restrita à página de Conversas, dois componentes de apresentação e um módulo CSS com seletores limitados à Inbox do cliente e ao canal Instagram. Não exige biblioteca visual nova.

## Validação

Quatro testes de renderização aprovados: histórico Instagram sem status não inventa envio pendente; falhas e envios reais permanecem visíveis; confirmação de leitura não é inventada; estados do WhatsApp permanecem disponíveis. Lint dos arquivos alterados aprovado. A compilação de produção valida os tipos e o módulo CSS.

Manifesto, recibo e conferência da publicação em `.qa-artifacts/inbox-channel-appearance-release-20261020/`. Escopo de publicação: quatro arquivos, sobre a versão publicada que já contém as correções de perfis e stories. A conferência de código e compilação não substitui a avaliação visual no dispositivo do usuário.

Publicação concluída em 20/10/2026 às 23h39 (Brasília): `dpl_Cf6MVguX1UQnUYaTSfKwVaetECwv`, sobre `dpl_4MQLfSm1pdrFhNszbip6D7FYZJrj`. Conteúdo dos quatro arquivos verificado na publicação, 1.509 arquivos anteriores preservados, Inbox HTTP 200 e verificações de autenticação das rotas de eventos e recuperação HTTP 401 sem sessão.
