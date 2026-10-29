# Nomes e usuários de Instagram na Inbox — 20/10/2026

## Evidência e causa

Conta afetada: ESB Variedades. Os dois contatos do print apareciam como `Instagram 092201` e `Instagram 732863`.

A consulta real dos perfis e dos participantes das conversas retornou HTTP 401, código Meta 190, subcódigo 460: autorização invalidada pela Meta. O recebimento dos eventos de mensagens continuava funcionando. Não é possível distinguir, apenas por essa resposta, entre mudança de senha e invalidação de segurança.

Após a reconexão feita pelo usuário, as mesmas consultas retornaram HTTP 200 com nome, usuário e foto dos dois perfis. Nenhum dado de perfil foi inventado ou obtido fora da API oficial.

Havia também uma limitação no código: a recuperação de mensagens não enriquecia o perfil das conversas já existentes, e uma consulta malsucedida podia substituir o nome da conversa pelo identificador genérico.

## Correção

- Busca do perfil com tempo limitado, autorização no cabeçalho e versão da API normalizada.
- Consulta alternativa de nome/usuário sem depender do campo opcional de foto; autorização invalidada encerra a tentativa sem repetir a mesma falha em todos os conjuntos de campos.
- Reuso do nome, usuário e foto já conhecidos quando a consulta não está disponível.
- Enriquecimento das conversas, contatos e oportunidades existentes durante a recuperação recente, mesmo sem importar mensagens novas.
- Gravações verificam empresa, canal, identidade externa e referências associadas. Não alteram responsável, estado do atendimento, etapa, mensagens ou controle da IA.
- A lista da Inbox exibe o `@usuário` abaixo do nome para Instagram. A atualização do perfil também dispara a atualização da lista.

## Dados corrigidos

Foram examinadas as 10 conversas de Instagram existentes na ESB. Nove receberam atualização de perfil, incluindo as duas do print, com nome e usuário disponíveis pela Meta. Uma já tinha nome conhecido e não recebeu alteração: o usuário não estava disponível nessa consulta. Nenhuma mensagem foi enviada e nenhuma automação foi disparada pelo reparo.

## Validação e publicação

- 11 testes aprovados: consulta de perfil e campos alternativos, autorização vencida, reparo de registros existentes, cache, nomes cadastrados pela equipe, proteção entre empresas, recuperação de histórico, permissões e roteamento de eventos.
- Lint dos arquivos alterados sem erros; build de produção e verificação de tipos aprovados.
- Publicação `dpl_EFdhs1Dxn8Nzg84HMB8Xc7ccPahd`, sobre `dpl_7LdJpd5cc4fmBnHeTXCGHSaUaFmz`.
- Publicação conferida em 20/10/2026 às 23h02 (Brasília): conteúdo dos 5 arquivos conferido e 1.502 arquivos anteriores preservados. Inbox pública HTTP 200, recuperação e eventos sem autenticação HTTP 401.
- Consulta autenticada da Inbox publicada HTTP 200: 10 conversas Instagram listadas; os dois exemplos do print retornaram nome real, usuário e foto.
- Evidências de dados corrigidos, consulta autenticada e recibo em `.qa-artifacts/instagram-profile-release-20261020/`.

Os nomes dependem da autorização e dos dados disponibilizados pela Meta. Uma nova revogação exige reconexão; os dados já conhecidos são preservados.
