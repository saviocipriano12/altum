# CoreAI → páginas públicas da Altum: análise de referência

Data: 16/10/2026. Referência: https://coreaitemplate.webflow.io/.

## Resultado e escopo

A direção recomendada é uma experiência pública predominantemente clara, azul, com tipografia menos pesada, demonstrações do produto como centro da narrativa e movimento aplicado à explicação do funcionamento da Altum. O posicionamento continua sendo **operação comercial com IA**.

Esta entrega documenta a engenharia reversa da apresentação pública observável: navegação, DOM renderizado, CSS publicado, scripts públicos e interações. Não representa acesso ao projeto Webflow original ou à plataforma que o template ilustra.

Nenhuma implementação da Altum foi alterada nesta etapa. O pedido atual autoriza estudar as páginas públicas, ampliando o escopo anterior do AGENTS.md específico do painel do cliente. Admin, painel, autenticação, APIs e dados permanecem fora da intervenção proposta.

## 1. Cobertura e evidências

| Página | Verificação realizada | Papel |
| --- | --- | --- |
| `/` | Navegador desktop; seções, abas, carrossel, rolagem e rodapé; home móvel; HTML/CSS/JS | Apresentação e conversão |
| `/about` | Navegador desktop; estrutura e fonte pública | Empresa, propósito e equipe |
| `/pricing` | Navegador desktop e móvel; FAQ e comparação; fonte pública | Escolha e comparação de planos |
| `/features` | Navegador desktop; seções intermediárias e fonte pública | Explicação das capacidades |
| `/blogs` | Navegador desktop; categoria Agents acionada; fonte pública | Conteúdo e descoberta |
| `/contact-us` | Navegador desktop; campos, layout e destinos; sem enviar formulário | Destino dos CTAs |
| `/blogs/how-ai-agents-are-reshaping-modern-business-operation` | Navegador desktop; abertura e corpo editorial; fonte pública | Template de artigo |
| Seis outros artigos listados abaixo | HTTP 200, HTML, títulos e estrutura editorial | Variações do mesmo template |
| `/utilities/style-guide` | Navegador e HTML | Estilos reutilizados |
| `/utilities/instructions` | Navegador e HTML | Documentação do movimento e componentes |
| `/utilities/license` | Navegador e HTML | Identificação das fontes dos recursos |
| `/utilities/changelog` | Navegador e HTML | Versão publicada do template |

Os seis artigos adicionais consultados pela fonte pública:

- `/blogs/how-automated-workflows-reduce-human-error`
- `/blogs/building-smarter-workflows-with-intelligent-automation`
- `/blogs/scaling-operations-without-increasing-headcount`
- `/blogs/how-ai-can-improve-customer-response-times`
- `/blogs/10-repetitive-tasks-every-business-should-automate`
- `/blogs/the-future-of-workflow-automation-for-growing-teams`

Foram consultadas 17 URLs internas, todas com resposta HTTP 200. Links externos de suporte, redes sociais, autoria do template e Webflow foram identificados, mas seus sites de destino não foram auditados: não são páginas da plataforma apresentada.

As capturas usadas para inspeção foram exibidas durante a sessão. Não foi criado um arquivo local de capturas. As medições desktop ocorreram com viewport de 1920 × 963; a verificação móvel usou 390 × 844, com largura útil reduzida pela barra de rolagem. A configuração temporária foi restaurada.

Evidências técnicas locais em `.qa-artifacts/coreai-reference/`:

- `source-inventory.json`: rotas, status, títulos, links e estrutura de headings.
- `reference.css`: folha de estilos pública consultada.
- `component-rules.txt`: regras de componentes selecionadas para estudo.
- `animation-config.json`: extração estática de 29 timelines e 29 definições de interação, mais configuração legada encontrada no bundle.
- `animation-summary.json`: resumo das ações, alvos, propriedades e tempos.
- `inline-reference.js`: scripts inline consultados para os efeitos adicionais.
- HTML das páginas sem scripts embutidos, para consulta técnica local.

Limites: não houve envio de contato, teste de backend, compra, verificação das promessas comerciais ou auditoria completa de acessibilidade/performance da referência. Mobile foi inspecionado em home, menu e preços; não houve validação visual de todas as páginas em todos os breakpoints. As seis variantes de artigo tiveram inspeção estrutural, não uma revisão visual individual completa.

## 2. Por que o conjunto funciona

O template mantém uma gramática visual de página para página. Header, botões, etiquetas, títulos, superfícies e rodapé repetem a mesma linguagem. As páginas têm conteúdos diferentes, mas pertencem claramente ao mesmo produto.

A narrativa alterna promessa, demonstração, benefício, prova e ação. A imagem do produto aparece cedo. Depois, recursos são explicados em composições menores, evitando depender apenas de uma lista de módulos.

O ritmo combina grandes áreas claras com seções escuras pontuais. Há espaço generoso entre blocos e concentração de informação dentro de cada composição. Animações revelam conteúdo, sugerem conexão entre elementos e dão profundidade às demonstrações.

O acabamento vem da combinação de escala tipográfica, espaçamento, bordas, sombras e estados interativos. Trocar apenas a cor de fundo da Altum não reproduziria esse resultado.

## 3. Sistema visual medido

### Cores

| Função | Valor da referência | Observação |
| --- | --- | --- |
| Fundo base | `#eaf0f3` | Cinza muito claro e frio |
| Títulos | `#011032` | Azul-marinho quase preto |
| Texto secundário | `#6b738b` | Cinza azulado |
| Azul de ação | `#0552fc`, `#024bf6` | Degradês e CTAs |
| Luz do azul | `#51a2ff` | Extremidade luminosa dos degradês |
| Etiquetas | `#c8e3f3` | Fundo azul claro |
| Fundo escuro | `#0b0f1a` | Benefícios e preços na home |
| Superfície branca | `#ffffff`, `#fcfeff` | Cartões e elementos destacados |
| Borda discreta | `#01103214` e opacidades similares | Separação sem peso excessivo |
| Verde de confirmação | `#51fa41` | Checkmarks, bastante saturado |

Parte da atmosfera vem de imagens de fundo WebP e gráficos sobrepostos, além de gradientes CSS. O fundo suave não deve ser interpretado como um único degradê simples.

Para a Altum, a recomendação é preservar seu azul `#2563eb`, roxo de IA e verde contextual. Usar uma base fria e clara semelhante, com contraste próprio, em vez de importar literalmente a paleta inteira.

### Tipografia

| Elemento | Referência desktop | Mobile observado / CSS |
| --- | --- | --- |
| Títulos | Inter Display, peso 500 | Mesma família |
| Corpo | Geist, 18 px, peso 500, linha 1,5 | Base de 18 px |
| Etiquetas | Geist Mono, 14 px, caixa alta | 12 px no breakpoint pequeno |
| H1 | 62 px; linha 65,1 px; tracking −0,04 em | 48 px até 991 px; 42 px no menor breakpoint |
| H2 | 50 px; linha 55 px; tracking −0,04 em | 40 px até 991 px; 38 px no menor breakpoint |
| H3 base | 36 px | Vários cartões sobrescrevem para 28 px |
| Links do header | 14 px | Menu móvel com links de 22 px |

A sensação é mais leve do que a home atual da Altum, que usa peso extrabold, entrelinhas bastante fechadas e títulos que chegam a 124,8 px no limite do clamp.

### Layout e superfícies

- Container principal: máximo de 1280 px; espaçamento lateral global de 4%.
- Header desktop: começa com largura de 1280 px e contrai para 1072 px durante a rolagem.
- Hero: 160 px de padding superior e inferior no CSS desktop base.
- Escala de espaçamento por seção: 90, 120, 136 e 160 px.
- Raios frequentes: 6, 8, 10, 14 e 20 px; abas e indicadores usam cápsulas.
- Botão principal atual `.btn`: 54 px de altura; variante do header: 46 px.
- Botão: degradê radial, borda inferior sutil e sombra azul de 8 × 12 px.
- FAQ: controles de 52 × 52 px no desktop; linhas divisórias, em vez de uma pilha de caixas independentes.
- Tela do produto na home: imagem WebP, máximo de 1152 px, dentro de um contêiner com perspectiva de 800 px.

## 4. Header, navegação e conversão

Desktop: logo à esquerda, navegação central, CTA à direita. O item ativo recebe fundo próprio e pequeno ícone contextual. Durante a rolagem, o header fica mais compacto e ganha superfície branca destacada, preservando contraste sobre as seções escuras.

Links principais: Home, About, Pricing, Features e Blogs. O CTA principal conduz a `/contact-us`. Botões de início, teste e contato dos planos também conduzem ao mesmo formulário. Não foi observado um fluxo real de criação de conta ao clicar nesses CTAs.

No mobile, o header apresenta logo e botão de menu. O menu abre um painel amplo com links empilhados, separadores e área com rolagem própria. O ícone muda de três linhas para um X. Sua implementação depende de click no mobile e não de hover.

Adaptação recomendada: um header público único para a Altum, com Plataforma, Soluções, Integrações, Planos e Conteúdos, além de Entrar e uma ação comercial principal. A seleção final de itens deve ser conferida com a arquitetura atual. Sobre e páginas institucionais podem ficar no rodapé. Login e caminhos existentes de cadastro devem continuar funcionando.

## 5. Página inicial: composição em sequência

| Ordem | Composição | O que faz | Adaptação Altum |
| --- | --- | --- | --- |
| 1 | Etiqueta, título central, ícone em camadas, descrição com pequenas peças visuais, CTA e avaliação | Define promessa e encaminha à ação | Operação comercial com IA; demonstração e teste apenas conforme oferta vigente |
| 2 | Imagem ampla do dashboard com profundidade | Materializa o produto | Captura coerente com a interface real da Altum |
| 3 | Marquee de marcas | Sinaliza familiaridade e confiança | Integrações efetivamente disponíveis; distinguir integrações de clientes |
| 4 | Texto à esquerda, gráfico decorativo à direita e quatro métricas | Explica valor e escala | Benefícios comprováveis; números somente com evidência |
| 5 | Três abas; explicação à esquerda e ilustração à direita | Demonstra capacidades com controle do visitante | Conversas; Clientes e Oportunidades; Assistente Altum |
| 6 | Seção escura com cinco cartões, dois maiores e três menores | Varia o ritmo e mostra capacidades | Qualificar, acompanhar, priorizar, reativar e decidir |
| 7 | Painel lateral sincronizado com cartões sticky | Explica profundidade do produto | Mostrar um fluxo comercial; substituir código por telas e estados do produto |
| 8 | Três planos em área escura; centro destacado | Apoia decisão | Preservar catálogo e preços reais da Altum, mesmo com outra quantidade de planos |
| 9 | Três depoimentos e faixa de ação | Prova social e conversão | Somente clientes e resultados autorizados |
| 10 | Carrossel horizontal de artigos | Aprofunda a descoberta | Conteúdo próprio sobre vendas, atendimento e IA |
| 11 | FAQ em duas colunas, com apoio comercial à esquerda | Resolve objeções | Perguntas reais de compra, adoção e uso |
| 12 | Grande superfície branca com CTA final e rodapé | Fecha a jornada | Demonstração/teste, links úteis e informações reais da Altum |

A home tem aproximadamente 11,5 mil px de altura no desktop inspecionado. Essa extensão é uma característica da referência, não um requisito para a Altum. Cada seção da Altum deve justificar sua presença por benefício, demonstração, decisão ou confiança.

## 6. Páginas internas

### About → Sobre

Abre com etiqueta e título central, seguidos por duas imagens de larguras diferentes. Depois apresenta descrição da empresa, métricas, uma seção de história com visão/missão/impacto, benefícios, equipe, FAQ e rodapé.

As fotografias possuem desfoque e sensação de movimento. Elas fazem parte da direção de arte; não são evidência de que tudo esteja animado em tempo real.

Para a Altum: explicar quem opera o produto, para quem ele foi construído, como implantação e suporte funcionam e como entrar em contato. Fotos de equipe e números exigem material real. A página atual pode ganhar presença visual sem repetir toda a lista de módulos da Plataforma.

### Pricing → Planos

Hero curto, três cartões claros, plano central destacado, comparação detalhada em seção escura, FAQ e CTA final. A comparação agrupa capacidades, limites e suporte/segurança. Os cartões usam listas internas bem alinhadas e ações no final.

Para a Altum: apresentar mensalidade, implantação e custos adicionais com clareza; preservar as regras do catálogo e a distinção entre teste/cadastro e contato comercial. A quantidade de planos deve vir dos dados atuais, não do desenho do template.

### Features → Plataforma

Hero com duas colunas abaixo do título: imagem ampla e depoimento. Em seguida, alterna texto e composição visual, mostra ferramentas, execução, benefícios em seção escura, depoimentos e FAQ.

As ilustrações são composições de interface: prompts, cartões, conexões e estados de execução. O visitante entende o tipo de trabalho realizado sem precisar ler um inventário técnico.

Para a Altum: organizar por tarefas — responder, organizar oportunidades, acompanhar agenda, agir com IA e medir resultado. Cada grupo deve mostrar uma tela correspondente e um exemplo concreto. Produtos disponíveis sob condições específicas precisam ser descritos com precisão.

### Blogs → Conteúdos

Título e descrição centrais; categorias em controle de abas; artigo em destaque; grade editorial em duas colunas. Os cartões têm data, título, imagem e ação. A home usa uma variação horizontal dos mesmos cartões.

Na troca para Agents foi observado o estado selecionado; a fonte contém coleções repetidas entre categorias. Não se deve assumir que o filtro de demonstração representa uma taxonomia editorial final.

Para a Altum: reaproveitar os artigos existentes, categorias reais e rotas `/blog/[slug]`. Oferecer destaque editorial e legibilidade, com links para capacidades relacionadas ao tema.

### Artigos

Título central, autor/data, controles sociais, imagem de capa ampla e corpo com coluna lateral de conversão. O conteúdo usa subtítulos, listas, citações e imagens. A sidebar conserva a chamada comercial durante a leitura em desktop.

O primeiro artigo inspecionado visualmente contém trechos sobre entrega de e-mail e até um item sobre trânsito, incoerentes com a promessa do título. Os outros seis têm conteúdos distintos no HTML, com estrutura semelhante. O template editorial é aproveitável; o conteúdo precisa ser próprio e revisado.

### Contact → Contato / Demonstração

Título central, três cartões de contato e formulário em superfície branca. À esquerda do formulário há título, descrição e três garantias; à direita, nome/sobrenome, e-mail/telefone e mensagem. Os dois nomes e o e-mail estão marcados como obrigatórios; telefone e mensagem não.

Para a Altum: preservar o formulário atual e seu contexto de interesse/atribuição. Tornar explícito o que acontece depois do envio. As garantias comerciais devem corresponder às condições reais. Inspeção visual não confirma entrega do formulário do template.

### Rodapé e utilitários

O rodapé combina chamada final, ilustração de envelope, marca, contatos e colunas de links. Ocupa uma superfície branca arredondada, separada da borda da janela.

Style Guide e Instructions confirmam a intenção de componentes compartilhados. License identifica Geist, Geist Mono e Inter Display; imagens da Lummi AI e ícones da Hugeicons. Changelog apresenta versão 1.0 publicada. Esses utilitários servem ao comprador do template; a navegação pública da Altum precisa privilegiar seu próprio público.

## 7. Engenharia reversa das animações

### Tecnologia confirmada

- Webflow, com interações publicadas no bundle da página e componentes nativos de abas/carrossel.
- jQuery 3.5.1 no conjunto de scripts carregados.
- GSAP 3.15.0 com ScrollTrigger, ScrambleTextPlugin e ScrollToPlugin carregados.
- Lenis 1.3.23 sincronizado ao ticker do GSAP.
- Scripts próprios inline para digitação, revelação de palavras, contadores, tilt, cartões sobrepostos e indicador de abas.

Carregar um plugin não comprova que ele esteja sendo utilizado em todos os efeitos. A tipagem das etiquetas, por exemplo, usa recorte progressivo do texto no script consultado.

### Efeitos e parâmetros recuperados

| Efeito | Implementação observada na fonte | Adaptação recomendada |
| --- | --- | --- |
| Preloader | Contagem e preenchimento em 3 s; fade de 0,3 s; ocultação em 3,3 s | Entregar conteúdo imediatamente; evitar espera decorativa obrigatória |
| Entrada da home | Título começa na posição 3,31 s da timeline; descrição, ícone, etiquetas, CTA, avaliação e imagem entram em sequência | Sequência curta que não atrase acesso ao produto |
| Ícone do H1 | Camadas entram a partir de 3,66 s; deslocamentos de −15/−30 px; foguete entra na diagonal | Elemento original Altum, se contribuir para a mensagem |
| Etiqueta digitada | Trigger no topo a 85% da viewport; execução única; 0,05 s por caractere | Texto base acessível e efeito opcional |
| Cursor | Alternância de opacidade, espera de 0,5 s e repeatDelay de 0,3 s | Preferir movimento discreto e respeitar redução de movimento |
| Título por palavra | Opacidade 0, blur 10 px e Y de 8 px → estado normal; 0,8 s por palavra; stagger 0,1 s; `sine.out`; trigger 85% | Usar em títulos selecionados, sem esconder a informação se JS falhar |
| Contadores | 2,4 s, `sine.out`, trigger 80%, execução única; preserva casas decimais | Animar apenas números reais e verificáveis |
| Tilt de cartões | `rotateY = x × 8`, `rotateX = −y × 8`; resposta 0,6 s; retorno 0,8 s | Somente pointer preciso; remover em touch e reduced motion |
| Abas | Indicador branco move posição, largura e altura em 0,4 s, `sine.inOut` | Reutilizar estrutura React acessível; seleção manual |
| Marquee | Translação de −100% em 20 s; pausa no hover; desabilitado nos breakpoints small/tiny | Integrações reais; alternativa estática móvel |
| Header compacto | Largura 1280 → 1072 px; overlay branco entra com scrub 1; ações com duração de referência de 1 s | Header público único e estado estável sem JS |
| Entradas laterais | Origem em ±20% de X ou 20% de Y, com opacidade 0 | Reduzir deslocamento quando o conteúdo for denso |
| Grupo de cartões | Origem Y de 50%; duração 0,75 s e stagger total de 0,75 s | Sequência curta e execução única |
| Botão principal | Área branca expande até largura automática em 0,4 s com back.out; texto original desloca 1 rem e apaga em 0,25 s; conteúdo substituto entra em 0,1 s | Preservar rótulo legível e foco; não depender de hover |
| Seta pontilhada | Percurso de −200% a 400% em 3 s, easing por 20 passos | Opcional; ícone original da Altum |
| Menu móvel | Painel aparece e escala em 0,6 s; linha central reduz; externas giram ±45° com deslocamentos de ±7 px | Garantir foco, Escape e retorno ao botão |
| FAQ | Altura 0 → auto em 0,6 s; ícone gira 45°; fundo e texto mudam | Usar botão com expanded/control; click e teclado em todos os tamanhos |
| FAQ por dispositivo | Hover no desktop; click com toggle no tablet/mobile | Não reproduzir a dependência de hover para desktop |
| Gráfico do bloco de valor | Linhas revelam em 1,5 s; stagger de 0,05 s e movimentos de ±7 px com stagger de 0,1 s | Se mantido, ligar visual a um benefício concreto |
| Gráfico do bloco escuro | ScaleY e deslocamento horizontal de −30 rem em 1,5 s; valores aparecem depois | Substituir por dados ilustrativos explicitamente identificados |
| Círculos conectados | Rotações alternadas de 20, 25 e 30 s; centro flutua −10% e escala a 0,95 em 2,5 s com yoyo | Bom padrão para explicar ecossistema; moderar loops |
| Ondas de automação | Camadas aparecem com fades e movimentos verticais opostos de 50% | Associar a uma ação da IA ou a uma mensagem |
| Cartões sticky | Desktop >991 px; card sticky a 300 px; anterior reduz a 0,96 entre top+300 e top+160; scrub 1 | Usar uma história de venda e screenshots sincronizadas |
| Troca do painel sticky | Fade de saída 0,3 s; entrada 0,3 s com delay 0,2 s; reversão ao voltar | Evitar inconsistência entre etapa e imagem |
| Perspectiva do dashboard | Wrapper com 800 px de perspectiva; timeline consultada mantém rotationX em 21°; trigger com scrub 0,8 | Profundidade sutil; não afirmar uma rotação variável não comprovada |
| Planos | Cartões laterais entram de ±20%; central de Y 20% após posição 0,25 | Priorizar comparação e clareza da oferta |
| Card editorial | Imagem amplia a 1,2; overlay entra; seta desloca 0,25 rem; 0,3 s | Zoom menor pode preservar legibilidade e reduzir distração |
| Carrossel | Slide de 500 ms; `ease-in-out-sine`; autoplay false; swipe habilitado; configuração infinite false | Controle manual, controles com nomes e estado acessível |

As 29 timelines extraídas do bundle não equivalem a 29 efeitos independentes percebidos: há variantes por dispositivo, alvos compartilhados e ações compostas. Os scripts inline acrescentam efeitos fora desse conjunto.

A maioria das entradas genéricas laterais do Webflow é desabilitada abaixo de 992 px. O stagger possui variante própria para telas menores. Os efeitos inline de palavras e contadores têm seus próprios gatilhos. Não foi identificada uma política de reduced motion nos scripts inline nem na folha publicada consultada; isso não constitui auditoria de todo o runtime Webflow.

### Limitações a corrigir ao adaptar

Conteúdo importante não pode depender de uma animação terminar. A referência apresenta estados intermediários com blur, opacidade zero e grandes espaços durante a entrada. Na Altum, a base deve continuar legível se houver falha de JS, preferência por menos movimento ou navegação rápida por âncora.

Evitar instalar uma segunda infraestrutura de animação sem necessidade. A Altum já possui `framer-motion` e `gsap`; pode usar CSS para estados simples, Framer Motion onde já existe interação e GSAP/ScrollTrigger apenas para sequências sincronizadas que justifiquem isso. Lenis deve ser uma decisão específica, após testar âncoras, foco, sticky e rolagens internas.

## 8. Leitura inicial do código atual da Altum

Esta parte é um diagnóstico preliminar por leitura de código, não uma comparação visual com a versão publicada.

| Área | Situação encontrada | Consequência para o redesign |
| --- | --- | --- |
| Home | `app/page.tsx` renderiza `components/public/home/product-home.tsx` | Ponto principal da narrativa pública |
| Navegação | Home possui `Header`/`Footer` locais; internas usam `SiteShell`; existe ainda `shared/site-header.tsx` | Unificar linguagem e conteúdo sem criar uma quarta solução |
| Tablet | Home e SiteShell usam nav `lg:flex` e menu `md:hidden` | Entre 768 e 1023 px, ambos os acessos à navegação principal ficam ocultos pelas classes; confirmar visualmente e corrigir |
| Base visual | `app/brand.css` aplica fundo público `#07111f`; páginas têm vários pretos locais | Mudança para base clara exige revisar cores de texto e superfícies, além do fundo |
| Legado cromático | Sobre e Blog ainda têm laranja; Sobre/Planos usam bege `#f3f1ec` | Eliminar rupturas entre páginas durante a revisão |
| Tipografia | Manrope compartilhada por aplicação; home usa peso 800 e tracking muito fechado | Escopar decisões públicas para preservar painel/admin |
| Demonstração | `AltumLiveDemo` já usa AnimatePresence/Motion e troca de 0,24 s | Reaproveitar lógica e conteúdo, revisando acabamento e coerência com produto real |
| Imagens | Home e Plataforma usam `/images/platform/marketing/` | Conferir qualidade, atualização e correspondência com o produto |
| Planos | `PricingPlans` consulta `/api/public/platform-plans` e usa defaults existentes | Preservar contrato, valores e destinos conforme flags do plano |
| Conversão | CTAs carregam `interest`; contato usa formulário existente com estados de envio | Alterar apresentação sem perder intenção, atribuição e retorno ao visitante |
| Contato | `CommercialContactForm` preserva UTM, gclid/fbclid e contexto de origem | Testar continuidade do fluxo após mudanças visuais |
| SEO | Metadados e schema já existem | Preservar rotas, canonicals e conteúdo indexável |

Arquivos centrais para a próxima etapa:

- `components/public/site-shell.tsx`
- `components/public/home/product-home.tsx`
- `components/public/home/altum-live-demo.tsx`
- `components/public/shared/site-header.tsx`
- `components/public/pricing-plans.tsx`
- `components/public/commercial-contact-form.tsx`
- `app/brand.css`
- `app/plataforma/page.tsx`, `app/precos/page.tsx`, `app/sobre/page.tsx`
- `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`, `app/contato/page.tsx`

O projeto possui muitas alterações pré-existentes em outras áreas. Esta análise não as modifica nem pressupõe que devam ser revertidas.

## 9. Proposta de adaptação

### Mensagem e demonstração

Mensagem central: **uma operação comercial com IA para responder, vender, acompanhar e decidir**. Os exemplos visuais devem acompanhar o caminho de uma oportunidade: mensagem recebida → contexto entendido → oportunidade organizada → próxima ação → acompanhamento do resultado.

Home: abertura clara, demonstração do produto, três capacidades principais em abas, um fluxo comercial animado, integrações verificadas, oferta, prova real, FAQ e CTA final. Usar seção escura pontual para IA ou inteligência aplicada, mantendo a experiência predominantemente clara.

Plataforma: aprofundar as capacidades por trabalho realizado. Sobre: identidade e confiança. Planos: decisão e condições. Conteúdos: descoberta e educação. Contato: demonstração contextualizada e próximo passo claro.

O site também possui páginas de integrações, implantação, soluções, segmentos e ofertas específicas. A nova linguagem deve alcançá-las através dos componentes compartilhados, com revisão de conteúdo por rota. Nenhuma rota antiga deve desaparecer como efeito colateral da unificação.

### Execução em etapas revisáveis

1. Inspecionar a Altum em navegador: home, internas principais, tablet e mobile. Registrar evidências e fechar o inventário das rotas e seus objetivos.
2. Definir tokens públicos e consolidar header, footer, botões e superfícies dentro da estrutura existente.
3. Construir a home como referência de qualidade, reaproveitando demonstrações e conteúdo válidos.
4. Aplicar o sistema às internas: Plataforma, Planos, Sobre, Blog/artigos, Contato; depois Integrações, Implantação, Soluções e páginas específicas.
5. Revisar todos os caminhos de navegação, cadastro, demonstração e contato; preservar SEO e atribuição.
6. Validar responsividade, acessibilidade, movimento, performance e checks do repositório antes de considerar o site pronto.

## 10. Critérios para considerar as páginas prontas

- Header e footer consistentes e utilizáveis em desktop, tablet e celular.
- Conteúdo adequado em 360/390, 768, 1024 e 1440+ px, sem overflow acidental.
- Uma mensagem principal por página e uma ação comercial predominante.
- Imagens do produto nítidas, atuais e compreensíveis; exemplos ilustrativos identificados quando necessário.
- Navegação por teclado, foco visível, menu com Escape e retorno de foco.
- Abas com semântica/teclado e FAQ com controles acessíveis.
- Reduced motion tratado nas animações JavaScript e CSS; conteúdo visível como base.
- Animações limpas ao desmontar/trocar de rota; sem duplicar ScrollTriggers ou listeners.
- CTAs com destinos corretos; parâmetros de interesse, origem e campanha preservados.
- Estados de formulário vazios, inválidos, enviando, sucesso e erro verificados em ambiente controlado.
- Planos e condições coerentes com o catálogo vigente; sem números, clientes ou resultados inventados.
- Rotas, metadados, schema, sitemap e links internos revisados.
- Imagem principal carregada com prioridade adequada; demais imagens dimensionadas e carregadas conforme necessidade.
- Lint, typecheck e build executados quando a implementação for alterada; falhas pré-existentes separadas dos novos problemas.
- Comparação visual final em navegador, incluindo header sobre seção clara e escura, menu móvel aberto e páginas longas.

Não há código de produto alterado neste relatório, portanto lint/typecheck/build não foram executados nesta etapa documental.

## Fontes principais

- [Home](https://coreaitemplate.webflow.io/)
- [About](https://coreaitemplate.webflow.io/about)
- [Pricing](https://coreaitemplate.webflow.io/pricing)
- [Features](https://coreaitemplate.webflow.io/features)
- [Blogs](https://coreaitemplate.webflow.io/blogs)
- [Contato](https://coreaitemplate.webflow.io/contact-us)
- [Guia de estilos](https://coreaitemplate.webflow.io/utilities/style-guide)
- [Instruções dos efeitos](https://coreaitemplate.webflow.io/utilities/instructions)
- [Recursos identificados pelo template](https://coreaitemplate.webflow.io/utilities/license)
- CSS e bundle Webflow publicados pelo próprio site, registrados no diretório local de evidências.
