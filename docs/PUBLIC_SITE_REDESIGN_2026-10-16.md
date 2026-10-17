# Redesign das páginas públicas da Altum

Implementação de 16/10/2026, baseada no estudo em `COREAI_PUBLIC_SITE_REFERENCE_AUDIT.md`.

## Resultado

As páginas de apresentação da Altum passam a usar uma base clara, azul da marca, tipografia menos pesada e navegação compartilhada. A apresentação se concentra em conversas, clientes, oportunidades, agenda e inteligência aplicada à operação comercial.

A home apresenta o produto, permite alternar entre quatro visões, explica um fluxo comercial com exemplo identificado, mostra o catálogo vigente e encaminha para conteúdo, planos e contato. As imagens e conversas demonstrativas são identificadas como ilustrações com dados de exemplo.

## Cobertura

| Superfície | Alteração |
| --- | --- |
| Home | Narrativa, layout, demonstração, fluxo, capacidades, planos e conteúdo |
| Plataforma | Explicação por tarefas, imagens, catálogo de capacidades e FAQ |
| Planos | Cartões e tabela de capacidade derivados dos mesmos dados; condições de implantação preservadas |
| Integrações | Oito conexões contextualizadas, com condições de disponibilidade |
| Implantação | Etapas e entregáveis conforme escopo contratado |
| Sobre | Propósito e princípios do produto, sem equipe ou resultados inventados |
| Contato | Assunto, formulário e retorno; layout mais direto no celular |
| Blog | Destaque editorial, filtros reais de categorias e cartões |
| Artigos | Abertura, legibilidade, sumário e CTAs com a nova linguagem |
| Portfólio | Onze projetos/referências, filtros, miniaturas e navegação manual; links originais preservados |
| Soluções e ofertas específicas | Componentes públicos, cores, tipografia e navegação consistentes |
| Cidades e segmentos | Adaptação do componente programático à base clara |
| Diagnóstico | Fluxo existente dentro da nova estrutura pública |
| Privacidade, termos, exclusão e 404 | Apresentação compatível com a estrutura pública; conteúdo legal preservado |

As demonstrações de sites de clientes em `/portfolio/advogado*` e os projetos em `/cases/*` mantêm suas identidades próprias. Não são páginas de apresentação da plataforma Altum.

## Implementação

- `components/public/site-shell.tsx`: estrutura, links, rodapé e acesso ao conteúdo.
- `components/public/shared/public-header.tsx`: navegação ativa, menu modal nativo, Escape, retorno de foco e bloqueio da rolagem de fundo.
- `components/public/shared/public-motion.tsx`: revelações progressivas com IntersectionObserver e Web Animations, limpeza ao trocar de rota e respeito à preferência de redução de movimento.
- `components/public/shared/public-sections.tsx`: aberturas, títulos, FAQ e CTA compartilhados.
- `components/public/public-site.module.css`: estilos escopados à superfície pública; sem mudanças em `app/globals.css` ou no tema do painel/admin.
- `components/public/home/altum-live-demo.tsx`: quatro abas com painel associado, setas/Home/End e indicador animado.
- `components/public/pricing-plans.tsx`: consulta e destinos existentes preservados; comparação com os limites do catálogo.
- `components/public/commercial-contact-form.tsx`: contrato de envio, contexto e atribuição preservados; seleção compacta de assunto e validação de canal de retorno antes de enviar.
- `components/public/public-blog-index.tsx`: filtros sem substituir os artigos ou suas rotas.
- `components/public/public-portfolio.tsx` e `data/public-portfolio.ts`: projetos existentes separados da apresentação; referências continuam identificadas como referências.

Os efeitos não impõem um preloader. Texto e conteúdo permanecem visíveis sem a inicialização das animações. Foram utilizados os recursos já disponíveis no projeto, sem nova dependência de execução.

## Compatibilidade

O redesign não altera admin, painel do cliente, regras de autenticação, banco de dados ou APIs. O layout raiz utiliza `PublicRenderingBoundary` para renderizar as rotas de marketing sem a espera do Firebase; as demais rotas mantêm o `AuthProvider` existente. A verificação HTTP encontrou o problema anterior: respostas 200 sem corpo público no HTML, porque o provedor ocultava os filhos durante o carregamento. Mantém as rotas e aliases existentes. Os links dos planos continuam respeitando `checkoutEnabled` e `trialEligible`, encaminhando para cadastro com o plano ou contato com o interesse correspondente.

O formulário continua usando o endpoint e os campos existentes, preservando UTM, `gclid`, `fbclid`, origem e interesse. Não foi feito envio real de contato durante a validação para evitar gravar um lead de teste no ambiente conectado.

O repositório já continha alterações e exclusões de outros trabalhos. Elas não foram revertidas. Não houve publicação nem commit nesta entrega.

## Verificação

- `npm run lint`: passou sem erros; 32 avisos nos arquivos existentes fora desta implementação.
- ESLint direcionado aos arquivos novos e alterados: sem erros ou avisos nos conjuntos conferidos.
- `npm run typecheck`: passou.
- Testes existentes de contrato do catálogo de planos: 3 passaram.
- Primeiro `npm run build`: passou, incluindo 369 páginas geradas.
- Abas: clique e navegação por seta conferidos no navegador.
- Menu a 768 px: abertura, Escape e retorno de foco conferidos.
- Home e contato a 390 px: sem overflow horizontal da página nos estados inspecionados.
- Formulário com nome, mas sem canal de retorno: mensagem acessível exibida, sem envio.
- Interesse `demonstracao` preservado a partir da URL.
- Contraste: os tons auxiliares foram escurecidos; o extremo claro do botão passou de contraste 3,88:1 para 5,01:1 com texto branco. Isso não substitui uma auditoria completa de acessibilidade.

Registros em `.qa-artifacts/public-redesign-*` e `.qa-artifacts/public-redesign/`. O teste HTTP verifica status, presença da estrutura pública, um H1 por página e existência dos arquivos locais de imagem.

Validação final de produção concluída: `npm run build` passou após a separação da renderização pública e a inclusão de `Suspense` no diagnóstico; 369 páginas geradas. A checagem HTTP final passou nas 36 rotas, com exatamente um H1, estrutura pública no HTML e 18 imagens locais existentes. Filtros do blog (6 artigos de IA), categorias e seleção do portfólio, abas por clique e seta, menu com Escape e retorno de foco foram conferidos no navegador. Home, plataforma, planos, contato, integrações, sobre, blog, artigo, diagnóstico e exemplos de cidade/segmento foram conferidos a 390 px sem overflow horizontal da página. A tabela de planos tem rolagem própria. Nenhum erro de console foi registrado na aba de validação de produção. Capturas finais em `.qa-artifacts/public-redesign/home-desktop.jpg`, `home-mobile.jpg`, `demo-desktop.jpg` e `precos-mobile.jpg`. Relatórios HTTP e mobile estão na mesma pasta. Isso não constitui auditoria exaustiva de acessibilidade, performance ou de todos os estados de cada página.

## Execução local

Depois de um build válido, `npm run start -- --port 3000` disponibiliza a versão de produção local. Para desenvolvimento, o primeiro processo Turbopack encontrou falha de restauração em cache pré-existente; a revisão inicial usou `next dev --webpack --port 3000`. O build de produção utiliza o comando normal do projeto.

O servidor Turbopack que estava na porta 3000 retornava erro 500 por timeout do subprocesso PostCSS. Essa execução foi encerrada. A revisão temporária usou Webpack; depois do build final, a porta 3000 passou a servir `next start`, sem compilação durante a primeira visita. A prévia local final é `http://localhost:3000`, processo iniciado para esta entrega. Nenhuma publicação remota foi feita.

Não foram alterados os comandos do projeto nem adicionados pacotes ao manifesto. O formatador foi executado como ferramenta temporária.
