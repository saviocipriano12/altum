# Prévia de respostas a stories em vídeo — 20/10/2026

Conta: ESB Variedades. O usuário confirmou que nomes e fotos passaram a aparecer e enviou novo print: uma resposta a um story recente mostrava “Prévia do story indisponível ou expirada”.

## Causa comprovada

O endereço recebido no evento retornou **HTTP 200, `video/mp4`**. A interface usava esse endereço como `src` de uma imagem, provocando erro de carregamento. O erro era apresentado como possível expiração sem prova de que o story tivesse expirado.

A consulta autenticada do story na Meta retornou `media_type: VIDEO`, `media_url`, `thumbnail_url`, `permalink` e proprietário correspondente ao Instagram da ESB. A capa retornou HTTP 200 `image/jpeg` e o vídeo HTTP 200 `video/mp4`. O conteúdo continuava disponível.

## Correção

- Contexto da mensagem conserva tipo de mídia, fonte do vídeo, capa e link do Instagram separadamente.
- Vídeos usam player com controles e reprodução no celular; imagens continuam como imagens. Um vídeo com apenas capa disponível usa essa imagem e o link do Instagram.
- Mensagens antigas obtêm contexto atualizado quando a prévia entra na área visível. A consulta exige sessão, acesso à empresa, permissão da conversa e correspondência da mensagem/canal.
- O servidor confirma que o story pertence à conta de Instagram conectada antes de enriquecer uma resposta ao story do negócio. URLs de mídia e links são validados.
- Eventos novos enriquecem o contexto após a resposta do webhook, sem aguardar essa consulta para receber a mensagem.
- Metadados válidos são reutilizados por dois minutos. Um erro de carregamento permite renovar o endereço e tentar novamente. Uma consulta malsucedida não marca o cache como renovado.
- Removida a afirmação especulativa de expiração. A interface informa falha de carregamento e permite nova tentativa.

A mensagem existente do print foi enriquecida sem reenviar conteúdo, gerar outra mensagem ou executar IA/automação.

## Validação

14 testes aprovados: vídeo/capa distintos, imagem, vídeo apenas com capa, preservação do contexto, URLs rejeitadas, proprietário de outra conta, autorização revogada, cache, falha de renovação, autenticação, isolamento por empresa e roteamento de eventos. Lint dos arquivos alterados sem erros.

Os artefatos da publicação e da consulta real ficam em `.qa-artifacts/instagram-story-release-20261020/`. A publicação é restrita aos seis arquivos relacionados à prévia, contexto e recepção do story; as demais alterações locais permanecem fora dela. O acesso futuro ao conteúdo depende de sua disponibilidade e autorização na Meta.

Versão publicada: `dpl_4MQLfSm1pdrFhNszbip6D7FYZJrj`, sobre `dpl_EFdhs1Dxn8Nzg84HMB8Xc7ccPahd`. Build de produção, verificação de tipos e lint aprovados. Conferência em 20/10/2026 às 23h25 (Brasília): seis arquivos com conteúdo verificado e 1.504 arquivos anteriores preservados; Inbox pública HTTP 200 e rotas de eventos/recuperação sem sessão HTTP 401.

Consulta autenticada publicada da mensagem real: endpoint do story HTTP 200, histórico HTTP 200 com contexto `VIDEO`, capa JPEG HTTP 200 e vídeo MP4 HTTP 200. O endpoint do story sem sessão retornou HTTP 401. Nenhuma mensagem foi enviada na validação.
