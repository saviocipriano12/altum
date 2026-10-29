# Cor, movimento e conteúdo das páginas públicas

## Implementação

- Topo da home com luz laranja/pêssego atrás da demonstração; áreas de leitura mantêm texto chumbo e tipografia forte.
- Heróis das páginas internas com fundo quente discreto, sem alterar as cores das reproduções do produto.
- Fluxo comercial em chumbo, planos em lavanda e artigos em fundo quente. Cards de leitura continuam claros.
- Faixa contínua de nove plataformas: WhatsApp, Instagram, Messenger, Meta Ads, Google Ads, Shopify, WooCommerce, Nuvemshop e VTEX. VTEX identificado como conexão via webhook. Nuvemshop usa nome textual, sem criar um símbolo de marca fictício.
- Pausa das logos pelo botão ou ao passar o mouse. A faixa para fora da área visível; com movimento reduzido, as plataformas aparecem em grade estática, sem duplicatas.
- Oito artigos reais na home em carrossel manual, com capas existentes, categorias, tempo de leitura, setas, teclado e arraste nativo no celular. Sem avanço automático durante a leitura.
- Corrigida a capa do artigo de follow-up: a captura antiga de portfólio foi substituída pela capa existente de operação comercial, sem alterar o conteúdo do artigo.
- Seção de redes sociais com os quatro perfis fornecidos pelo usuário: Instagram, X, LinkedIn e YouTube. Links também no rodapé público e no schema da organização. Nenhum post, número de seguidores ou promessa de frequência foi inventado.

## Escopo e fontes

Alterações limitadas aos componentes e ao CSS das páginas públicas, à configuração dos perfis públicos e ao schema da organização. Não foram alterados admin, painel do cliente, autenticação, banco ou APIs.

Integrações conferidas na página pública, nas configurações do cliente e no registro de provedores de comércio. A faixa informa que disponibilidade depende do plano, das permissões e da configuração; não significa que todas as conexões estão ativas em qualquer conta.

Os endereços sociais foram fornecidos diretamente pelo proprietário. O parâmetro `isSelfProfile` foi retirado do LinkedIn e o YouTube usa HTTPS. Não foram importados conteúdos das redes sociais.

## Verificação

Lint e build registrados em `.qa-artifacts/public-life/`. Verificados desktop e celular de 390px: sem rolagem horizontal na página e sem conteúdo excedendo os quatro cards sociais. A faixa foi observada com transformação em andamento e depois com `animation-play-state: paused` ao acionar o controle. O carrossel avançou por seta e atingiu o último artigo pelo teclado. Os links sociais e sua presença no schema foram conferidos; 36 rotas públicas responderam corretamente.

No caminho de demonstração, o formulário abriu com o assunto correto, rejeitou nome sem canal de retorno e o menu compacto abriu e fechou. Nenhum contato válido foi enviado. A confirmação de entrega real continua dependendo de uma submissão de teste autorizada para esse fim; não foi declarada como testada.

Esta etapa permanece local, sem publicação remota. Não constitui uma auditoria integral de acessibilidade, SEO ou produção.
