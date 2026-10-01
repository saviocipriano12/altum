# Experiência móvel do cliente

Esta etapa prepara o caminho público do cliente para uso em telas pequenas:

`altumia.com.br` → Entrar → `/cliente/login` → `/cliente/painel`

## Entregue

- A página de login usa a área segura do aparelho, evita zoom automático em campos no iOS e mantém alvos de toque de pelo menos 44px.
- O portal usa `dvh`, `visualViewport` e `interactiveWidget: resizes-content` para manter a conversa e o compositor visíveis quando o teclado abre.
- O menu do cliente continua disponível até tablets, com acesso explícito à instalação do app, suporte, configurações e encerramento de sessão.
- A barra lateral fechada fica fora da navegação por teclado e é fechada com Escape ou ao mudar de rota.
- O convite de instalação é opaco, não cobre o compositor de uma conversa aberta e desaparece quando o app já está instalado.
- O service worker só trata navegação do portal do cliente, não armazena HTML autenticado e oferece uma página offline legível. A amostra de service worker usada como referência foi copiada de `GoogleChrome/samples`, commit `88046c15e9c3190edb5f875e91b5bb2bb2a5c72b`, sob Apache-2.0; a atribuição está em `lib/vendor/googlechrome-offline/`.
- Erros de carregamento mostram uma ação de recuperação e não deixam uma tela preta sem orientação.

## Verificações

- `tsc --noEmit --incremental false`: passou.
- ESLint nos arquivos da área do cliente e cabeçalho público: passou; o CSS é intencionalmente ignorado pelo ESLint.
- `npm run build`: passou, com 332 páginas estáticas geradas.
- Testes de PWA, redirecionamento de assinatura e perfis de acesso: 13 passaram.

## Validação que ainda depende de dispositivo

É necessário abrir o preview de produção em um Android/Chrome e iPhone/Safari reais para confirmar a instalação, o teclado e as áreas de toque. A instalação não deve ser simulada em código: o navegador precisa emitir o prompt nativo. Também é recomendável testar uma conversa longa com rede intermitente antes da publicação.

## Atualizacao: operacao comercial mobile (2026-09-30)

Escopo: somente `app/cliente/painel`; nenhuma API, autenticacao, rota antiga ou area `app/admin` foi alterada.

- Inbox: lista preserva o formato das conversas enquanto carrega, filtros ativos podem ser limpos na propria faixa mobile, e lista/conteudo fora da viewport usam trabalho de renderizacao reduzido.
- Conversa: viewport acompanha `visualViewport`, compositor e acoes principais preservam area segura e alvo de toque de pelo menos 44px; a navegacao inferior nao aparece quando uma conversa esta aberta.
- CRM: a linha de contato deixa explicito que abre a ficha; a ficha mobile funciona como dialogo, com foco inicial, ciclo de Tab, Escape, bloqueio de rolagem de fundo e retorno de foco ao fechar.
- Agenda e Funil: atalhos para ficha/conversa e mudanca de etapa usam alvo de toque de pelo menos 44px. O Funil deixa explicito que ha etapas horizontais e oferece botoes para avancar ou voltar.
- Componentes compartilhados: botoes, links, campos e seletores de CRM receberam foco visivel consistente. Erros usam anuncio assertivo para leitor de tela; confirmacoes usam anuncio discreto.
- Carregamento percebido: graficos e ferramentas secundarias sao carregados sob demanda; o Inicio libera a operacao diaria sem esperar resumos de automacao e implantacao.

Verificacoes desta atualizacao:

- ESLint dos arquivos alterados: passou.
- `tsc -p tsconfig.release.json --noEmit --incremental false`: passou.
- `node --experimental-strip-types --test tests/client-pwa.test.mts`: 6 de 6 passou.
- `npm run build`: passou, com 336 paginas estaticas geradas.

Risco conhecido: a validacao visual autenticada em dispositivo real ainda depende de navegador/sessao do cliente. Nesta sessao nao havia navegador conectado para executar esse smoke test; nenhuma tentativa foi feita contra dados de producao.
