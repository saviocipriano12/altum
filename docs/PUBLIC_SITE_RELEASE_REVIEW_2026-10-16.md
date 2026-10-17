# Revisão das páginas públicas — 16/10/2026

## Escopo

Revisão local do site público, navegação móvel, caminhos comerciais, conteúdo, SEO básico e carregamento. Sem alteração de autenticação, APIs, banco, cobrança, admin ou área do cliente. Nenhuma publicação realizada nesta revisão.

## Ajustes

- O CTA de Estrutura Assistida usa um interesse comercial reconhecido (`plataforma`), preserva o plano na URL e abre a seção do formulário.
- O formulário apresenta uma mensagem editável com o plano escolhido. Links anteriores com o plano no parâmetro `interest` continuam reconhecidos na interface.
- Corrigida a resposta compartilhada que dizia que a implantação poderia ser decidida depois. Operação e Escala exigem implantação assistida, apresentada separadamente.
- Criada imagem de compartilhamento de 1200 × 630, com identidade Altum, e aplicada aos metadados das páginas de marketing. Artigos mantêm suas imagens próprias.

## Evidências locais

- 36 páginas: HTTP 200, um H1 e estrutura pública compartilhada.
- 90 links/arquivos internos: HTTP 200, incluindo cadastro, políticas, RSS, robots e sitemap.
- 18 imagens referenciadas nas páginas verificadas: arquivos presentes.
- Títulos, descrições e canonical presentes nas 36 páginas; JSON-LD parseável.
- 390 px: home, planos, blog, plataforma e contato sem transbordamento horizontal da página.
- 1440 px: home, planos, blog e contato sem transbordamento; navegação de desktop visível e textos sem filtro de desfoque.
- Menu móvel: abertura, Escape, retorno do foco e desbloqueio da rolagem.
- Demonstração: CTA chega com assunto `demonstracao` selecionado.
- Cadastro: Operação e Escala mantêm o plano escolhido após hidratação.
- Contato: nome obrigatório e exigência de pelo menos WhatsApp ou e-mail; erro visível. Não houve envio de contato válido.
- Blog: filtro WhatsApp retorna sete artigos; carrossel avança por seta e chega ao oitavo artigo por teclado.
- Logos: botão de pausa interrompe a animação; demonstração automática também permite pausar.
- Nenhum erro/aviso de console nas transições observadas.
- Imagens da home usam carregamento adiado; a demonstração é renderizada em HTML, sem vídeo pesado. Há regras de redução de movimento no CSS e nos componentes.

Arquivos de evidência e logs locais em `.qa-artifacts/public-release-review/`.

## Validação após os ajustes

- ESLint dos três arquivos TypeScript alterados: aprovado.
- Build de produção, checagem de tipos e geração de 369 páginas: aprovados.
- Verificações de 36 páginas e 90 links repetidas na versão compilada: aprovadas.
- CTA real de Estrutura Assistida: assunto `plataforma`, plano preservado e mensagem editável confirmados no navegador. Link antigo também reconhecido.
- Imagem Open Graph de 1200 × 630 disponível e referenciada no HTML final (aproximadamente 66 KiB).
- Prévia reiniciada nas portas 3000 e 3001; override de viewport removido.

## Limites e publicação

- Os tempos de resposta medidos em localhost não representam velocidade em celular real ou internet móvel. Não foi atribuída pontuação Lighthouse nem desempenho em produção.
- Criação de conta, aceite de termos, assinatura, pagamento e envio real do formulário não foram executados. A revisão cobre os caminhos até essas etapas e a validação anterior ao envio.
- O ambiente local define a URL do site como localhost. Na publicação, `NEXT_PUBLIC_SITE_URL` deve apontar para o domínio público para gerar canonical, Open Graph, robots e sitemap corretos. Isso requer a configuração do ambiente de publicação e uma verificação posterior no domínio final.
- Links de redes sociais usam os endereços oficiais fornecidos pelo usuário; disponibilidade/autenticação das plataformas externas não foi auditada.
