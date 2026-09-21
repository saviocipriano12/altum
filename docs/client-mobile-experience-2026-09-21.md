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
