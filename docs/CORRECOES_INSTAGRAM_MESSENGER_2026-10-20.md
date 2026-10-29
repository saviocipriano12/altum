# Recepção de Instagram e Messenger — 20/10/2026

Conta validada: Savio Cipriano. Escopo: recepção na Inbox, recuperação recente e isolamento entre contas.

## Causa confirmada

Os tokens estavam válidos e a página estava inscrita no aplicativo. Entretanto, as assinaturas do aplicativo Meta para os objetos `instagram` e `page` estavam ativas **sem campos de eventos**. Portanto, aparecer conectado não significava estar recebendo mensagens. O endereço configurado também usava `www` e redirecionava.

As duas assinaturas passaram a usar `messages,messaging_postbacks` e o callback direto `https://altumia.com.br/api/webhooks/meta`. A verificação do callback retornou HTTP 200 e o desafio correto. A configuração foi relida na Meta depois da alteração. As assinaturas de WhatsApp e de usuário foram preservadas.

## Resultado observado na conta real

- A mensagem de teste do Instagram, enviada às **19h56 de 20/10/2026, horário de Brasília**, foi persistida como evento processado e mensagem na conversa correta.
- Foram recuperadas **23 mensagens de histórico do Instagram** disponíveis pela API, sem reenvio, execução da IA ou disparo de automações.
- O usuário confirmou posteriormente que voltou a funcionar. O recebimento de uma mensagem nova pelo Instagram está comprovado nos registros; ainda não foi identificado um evento novo do Messenger nesta verificação, portanto a confirmação específica desse canal permanece pendente. A configuração de recepção foi corrigida para ambos.

## Proteções acrescentadas

- Recuperação recente para Instagram e Messenger, incluindo mensagens com mídia e mensagens enviadas pelo aplicativo de origem.
- Deduplicação por identificação do provedor e preservação do responsável e dos estados de atendimento existentes.
- Uma reconexão conserva os campos já inscritos para a página, evitando que um canal remova assinaturas utilizadas pelo outro.
- Cada evento de um lote da Meta resolve sua própria conta; um primeiro evento desconhecido não descarta os demais. Assinaturas são verificadas antes de persistir mensagens, inclusive quando cada canal usa seu próprio segredo.
- A recuperação exige autenticação, acesso à empresa e módulo Conversas. O conteúdo importado não aciona respostas automáticas.
- Atualização normal por eventos; recuperação complementar em intervalos de 60 segundos enquanto a Inbox está visível e 180 segundos em segundo plano.

## Limites

A recuperação consulta até 10 conversas recentes por canal e 30 mensagens por conversa. Não representa importação integral do histórico. Há uma trava compartilhada e intervalo mínimo de 45 segundos entre tentativas concluídas. Mensagens enviadas pelo próprio negócio nos últimos 60 segundos aguardam a próxima recuperação, dando tempo de registrar o comprovante do envio original e evitando duplicação. Arquivos antigos continuam sujeitos à disponibilidade da Meta.

## Validação e publicação

Os testes cobrem interpretação e segurança das mídias, recuperação dos dois canais, deduplicação, preservação de atendimento humano, permissões, falha parcial do provedor, lotes com contas diferentes e rejeição de assinaturas inválidas. A suíte existente de identidade omnichannel também foi executada.

Resultado: 12 testes específicos e 19 testes de identidade aprovados, lint dos arquivos alterados sem erros e compilação de produção concluída com verificação de tipos.

A publicação é preparada sobre os arquivos da versão em produção, com alteração restrita a 10 arquivos. Não inclui as demais alterações locais do repositório, regras de banco, área administrativa ou autenticação. Manifesto, recibo e verificações de conteúdo ficam em `.qa-artifacts/meta-inbox-release-20261020/`; evidência da configuração Meta em `.qa-artifacts/meta-reception-repair-20261020/`.

Versão publicada: `dpl_7LdJpd5cc4fmBnHeTXCGHSaUaFmz`, sobre a versão anterior `dpl_Ai2Ldw1KfA7n7PydByigDHNzcJLk`. Conferência em 20/10/2026 às 20h15 (Brasília): domínio público na nova versão, conteúdo dos 10 arquivos verificado, 1.496 arquivos anteriores preservados, Inbox HTTP 200 e endpoints de recuperação/eventos sem autenticação HTTP 401.

Conferência autenticada concluída às 20h17: 3 conversas de Instagram e 2 de Messenger disponíveis, com cobertura completa da consulta; conversa do teste Instagram com 24 mensagens; recuperação publicada HTTP 200, ambos os canais com estado `ok` e nenhuma mensagem duplicada; fluxo de eventos Instagram HTTP 200 com `messages` e `ready`. Nenhuma mensagem foi enviada nesta verificação. Uma primeira tentativa de recuperação não passou na verificação; a repetição efetiva retornou sucesso para os dois canais. Não foi capturado detalhe suficiente para atribuir causa à primeira falha, portanto não há alegação de disponibilidade perfeita.

Referência primária para a recuperação: [Meta — Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a).
