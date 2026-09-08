# Padrão visual Altum

Este documento define o padrão mínimo compartilhado entre as páginas públicas, autenticação e área privada do cliente. Ele complementa as diretrizes de produto do `AGENTS.md` e evita que novas telas criem identidades paralelas.

## Princípios

- A marca usa azul e índigo como cores principais.
- Verde é reservado para WhatsApp, conversa e sucesso.
- Roxo identifica IA e o Assistente Altum.
- Laranja identifica alerta, pendência e implantação.
- Vermelho identifica erro, risco ou ação destrutiva.
- Cards usam superfícies claras na área privada e superfícies escuras controladas nas páginas públicas.
- Toda tela deve deixar evidente a ação principal, reduzir textos genéricos e ocultar informação técnica do cliente comum.

## Base compartilhada

Os tokens globais ficam em `app/brand.css`, importado por `app/layout.tsx`:

- `--altum-primary`, `--altum-primary-hover` e `--altum-primary-soft`
- `--altum-ai`, `--altum-success`, `--altum-warning` e `--altum-danger`
- `--altum-public-bg`, `--altum-public-panel` e `--altum-public-muted`
- `--altum-radius-card`, `--altum-radius-control` e `--altum-focus`

A fonte institucional é Manrope, carregada uma única vez no layout raiz. Estados de foco devem permanecer visíveis e animações respeitam `prefers-reduced-motion`.

## Páginas públicas

- Usar `SiteShell` para cabeçalho, navegação, CTA e rodapé consistentes.
- Marcar a raiz com `data-altum-surface="public"` quando a página tiver uma experiência própria, como o diagnóstico.
- Fundo principal azul-marinho, texto branco e CTA azul.
- Cores de Meta, Instagram, Google e WhatsApp aparecem somente no contexto do respectivo canal.
- Páginas de preço só podem anunciar capacidades já entregues ou explicitamente condicionadas à confirmação comercial.

## Autenticação

- Marcar o contêiner principal com `data-altum-surface="auth"`.
- Usar a mesma assinatura azul da marca, formulário claro, foco acessível e mensagens de erro objetivas.
- Login, cadastro, recuperação e ação de e-mail devem parecer etapas da mesma jornada.

## Área privada do cliente

- Usar `.client-portal` e os tokens `--client-v3-*` já mapeados para a marca.
- Priorizar navegação e operação diária: Início, Conversas, Clientes & Oportunidades e Agenda.
- Cards brancos, bordas sutis, sombras leves e densidade menor que a área pública.
- Informações técnicas, logs, filas e controles avançados permanecem em Configurações ou perfis técnicos.
- Novas telas precisam oferecer estados de carregamento, vazio, erro, sucesso e responsividade móvel.

## Revisão antes de publicar

1. Conferir desktop e celular, com teclado e foco visível.
2. Confirmar contraste, hierarquia e apenas uma ação principal por contexto.
3. Verificar os estados de carregamento, vazio, erro e permissão negada.
4. Rodar `npm run typecheck`, `npm run lint`, `npm run test:smoke` e `npm run build`.
5. Validar visualmente as rotas públicas, autenticação e o painel autenticado em homologação.
