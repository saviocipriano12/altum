# Refinamento da identidade pública da Altum

Pedido: substituir o azul da apresentação pública por laranja e chumbo, ampliar e animar as demonstrações e apresentar os preços em carrossel.

## Implementação

- Base clara, títulos em chumbo `#292a2d`, acentos em laranja `#f07832` e botões principais em chumbo com texto branco. Laranja aparece nos fundos, indicadores, bordas, gráficos e destaques. Roxo da IA e verde de conversa/sucesso mantêm seu significado.
- A paleta foi aplicada no módulo CSS público e nas classes das páginas e componentes públicos. `app/globals.css`, a identidade do painel e o admin não foram alterados nesta etapa.
- As imagens ilustrativas rasterizadas da home e da página Plataforma foram substituídas por `ProductPreview`: composições originais em HTML/CSS, com quatro visões responsivas e dados fictícios identificados. Não são capturas de uma conta real. A estrutura acompanha os conceitos existentes do produto: conversas, clientes e oportunidades, agenda e IA.
- As prévias ocupam toda a largura do bloco; a explicação fica acima. O hero também recebeu uma prévia mais ampla. Textos e ícones não dependem da resolução de um PNG.
- Movimento em gráficos, sinal de atividade, mensagens e elementos de apoio. A demonstração alterna a cada oito segundos enquanto visível; possui pausa/reprodução e interrompe a alternância ao escolher uma aba ou focar no painel. `prefers-reduced-motion` desativa a reprodução automática e as animações CSS.
- O efeito de entrada por rolagem mantém o conteúdo visível e usa deslocamento/opacidade, sem desfocar o texto.
- Os preços usam carrossel com scroll snap, setas, indicadores de posição, teclado e deslizamento nativo em telas de toque. Cards maiores, destaque em laranja e limites de navegação calculados conforme a largura disponível. Todos os planos permanecem no DOM e a tabela de comparação continua disponível.
- O catálogo, as regras `checkoutEnabled`/`trialEligible`, os valores, os destinos dos CTAs e o endpoint de planos foram preservados.

## Verificação

Na revisão de desenvolvimento, o carrossel foi conferido em 1440, 792 e 390 px, incluindo o último plano e os estados dos controles. A alternância automática foi observada no navegador; o gráfico apresentou transformação CSS ativa. Não houve overflow horizontal da página nos estados inspecionados.

Resultados finais:

- Lint direcionado: passou sem avisos. `npm run lint`: passou sem erros, mantendo os 32 avisos existentes no projeto.
- TypeScript: passou. O build normal do projeto também passou, incluindo sua checagem de tipos e a geração de 369 páginas.
- Testes de contrato do catálogo de planos: 3 passaram.
- HTTP de produção: 36 rotas, sem falhas, um H1 por página, estrutura pública presente no HTML e 18 imagens locais encontradas. Home e Plataforma também foram verificadas quanto à presença das prévias nativas; home e preços, quanto ao carrossel.
- Navegador em produção: carrossel até o último plano, setas de teclado, limite dos controles, alvo de 24 px dos indicadores, seleção das abas, reprodução automática e pausa conferidos. Depois de pausar e aguardar, a seleção permaneceu estável. Nenhum erro de console foi registrado na aba.
- Após o feedback sobre nitidez, foi removida a configuração temporária de viewport usada nos testes. A revisão e as capturas finais usam a escala normal da janela. A inspeção do conteúdo principal encontrou zero elementos com `filter` aplicado.

Evidências: `.qa-artifacts/public-refinement/` (`http-results.json`, `browser-final.json`, `home-final.jpg`, `precos-final.jpg` e `demo-final.jpg`) e logs `.qa-artifacts/public-refinement-*`.

A versão final de produção local está em `http://localhost:3000`, iniciada com `next start`. O servidor temporário de desenvolvimento da porta 3001 foi encerrado após a validação.

Sem publicação remota ou envio de formulários nesta etapa. A prévia usa dados de exemplo; não foi feita uma auditoria exaustiva de todos os estados de acessibilidade ou performance.
