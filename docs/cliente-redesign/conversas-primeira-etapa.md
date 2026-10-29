# Conversas — primeira etapa do redesign

Escopo: `app/cliente/painel/inbox`. Sidebar, navegação compartilhada, backend, autenticação e contratos de API preservados.

## Comportamento
- Lista com pesquisa, filas, filtro de canal e atrasadas. Filtros adicionais e ações existentes continuam disponíveis.
- Conversa com resolver/reabrir, transferência, anexos, áudio e fluxo de envio existente.
- Contexto resumido de cliente, oportunidade e próxima ação registrada; histórico, propostas e controles existentes ficam em seções recolhidas.
- Contexto lateral a partir de 1440px; gaveta nas telas menores. Chat em tela cheia no celular.
- Sugestão da Altum preenche um rascunho editável; não envia automaticamente nem sobrescreve texto existente.
- Aba de nota interna usa exclusivamente o endpoint de notas da conversa.
- Sem canal de atendimento conectado, abre um diálogo dispensável uma vez por entrada na tela. Falha ao consultar canais não é interpretada como ausência de conexão.
- WhatsApp QR usa os endpoints existentes de canais/sessão, somente após ação explícita. Reutiliza uma conexão pendente acessível; permite criar outro canal quando os anteriores já estão conectados. Canal pessoal respeita o usuário e a permissão existente.
- Instagram/Messenger iniciam o fluxo Meta existente; seleção de ativos e retorno continuam nas configurações de canais. WhatsApp oficial mantém seu fluxo atual nas configurações.
- Sem permissão de conexão, o diálogo orienta procurar o administrador.
- Estilos em CSS Module. A animação de entrada do conteúdo é desativada apenas nesta rota para impedir que seu contexto de empilhamento cubra a gaveta.

## Validação
- ESLint dos dois arquivos TSX alterados: aprovado.
- TypeScript isolado dos arquivos alterados e suas dependências: aprovado.
- 44 testes existentes de rascunhos, carregamento, mídia, mensagens novas e viewport: aprovados.
- Inspeção no navegador com os componentes reais e APIs locais fictícias: desktop, celular, seleção, rascunho de IA, nota interna, gaveta, requisição de transferência, ausência/erro de canais, QR com confirmação simulada, erro Meta e perfil de atendente.
- Nenhuma mensagem real enviada e nenhuma conta externa conectada nos testes.
- Build geral tentado: falhou por timeout do subprocesso PostCSS em `app/globals.css`. O arquivo global não foi alterado. Typecheck geral também encontrou erros de sintaxe em tipos gerados previamente em `.qa-artifacts/next-inbox/dev/types/routes.d.ts`; a checagem isolada evita esse artefato e não substitui o build completo.

## Limites a validar na implantação
- QR e OAuth reais dependem da configuração e disponibilidade dos provedores já existentes; a inspeção local usou dados fictícios.
- A fila “Aguardando cliente” filtra as conversas carregadas, preservando paginação e sem inventar um total global.
- Capturas em `output/conversas-redesign` representam dados fictícios, não a operação de um cliente.

## Ajustes de escrita e filtros
- Campo de mensagem cresce e diminui conforme o conteúdo, inclusive em rascunhos restaurados, colagens e mudanças de largura. Sem altura máxima ou rolagem interna; rascunhos maiores que a tela podem ser lidos pela rolagem externa do atendimento.
- Abaixo da busca ficam somente Todas, Não lidas com contador de conversas e Grupos. Os outros controles aparecem pelo botão de filtros e começam recolhidos.
- Contador, filtro e bolha de não lidas usam `unreadCount` real, sem confundir necessidade de resposta com mensagem não lida. A contagem corresponde às conversas carregadas que atendem aos filtros.
- Validação visual: filtro de não lidas, grupos, abrir/recolher filtros e expansão de mensagem multilinha. O campo de teste expandiu para 192px, com altura do conteúdo igual à área visível e `overflow-y: hidden`.
