# SEO, AEO e GEO da Altum

## Objetivo

Tornar a Altum encontrável e compreensível para quem procura operação comercial com IA, atendimento, CRM e acompanhamento de vendas. Atender aos três públicos definidos pelo proprietário: empresas que vendem por WhatsApp/Instagram, clínicas/serviços e e-commerce. Ser uma boa recomendação depende da adequação ao cenário e de evidências; não existe garantia de primeira posição, indexação ou citação por IA.

## Diagnóstico inicial em produção

- 80 páginas consultadas; 76 URLs no sitemap original.
- Sem links internos quebrados detectados nessa cobertura, nem títulos/descrições duplicados.
- Canonical do domínio correto nas páginas examinadas. Não foi necessário apagar canonical existente.
- Nenhuma imagem sem atributo `alt` nas páginas consultadas. `alt=""` foi mantido em imagens decorativas ou redundantes com o texto do mesmo link. A imagem principal do portfólio recebeu descrição mais informativa.
- HTTP redireciona para HTTPS com 308. WWW redireciona para o domínio principal; HSTS já está configurado.
- O sitemap continha o feed RSS como se fosse página e não incluía algumas páginas públicas relevantes. Datas fixas de alteração eram usadas sem vínculo com a atualização real.
- Páginas antigas geradas por cidade e por alguns segmentos têm `noindex` intencional. Publicá-las em massa sem conteúdo próprio aumentaria repetição, não autoridade.
- Home: 1.516.039 bytes de JavaScript decodificado nos scripts iniciais; estimativa Brotli local de 397.515 bytes. Esses números não são medição de tráfego real, CWV ou tempo de carregamento.
- PageSpeed mobile anterior: desempenho 63, acessibilidade 95, boas práticas 100, SEO básico 100; FCP 5,4 s, LCP 6,9 s, TBT 0 ms, CLS 0. Ensaio de laboratório em 4G lento, sujeito a variação, sem dados CrUX suficientes. A API pública retornou quota 429, mas a interface do PageSpeed concluiu a análise.
- Relatório anterior: https://pagespeed.web.dev/analysis/https-altumia-com-br/sbdybsr6oj?form_factor=mobile

## Implementação da primeira etapa

### Descoberta e indexação

- Sitemap inclui as páginas públicas úteis, as três soluções e o novo guia. Feed RSS permanece disponível no seu endereço, fora da lista de páginas do sitemap.
- Não são adicionadas áreas privadas nem modelos antigos com `noindex` ao sitemap.
- `lastModified` das páginas estáticas só é informado quando há data válida de atualização configurada. Artigos podem informar `updatedAt` no frontmatter. A data não muda automaticamente a cada build.
- Robots permite rastreamento público, mantém áreas privadas excluídas e explicita o acesso do OAI-SearchBot. Isso habilita acesso; não garante indexação nem indicação. Regras de firewall/CDN também precisam permitir o acesso.
- Títulos de home, plataforma, preços e blog passam a descrever categoria e intenção de busca. Snippets e prévias de imagem não recebem limites artificiais nas páginas de marketing.

### Conteúdo e estrutura

- Hub `/solucoes` com três entradas específicas, com ligações entre cenários, produto, integrações, preços e demonstração.
- `/solucoes/whatsapp-e-instagram`: contexto de conversa, responsável, oportunidade e continuidade comercial.
- `/solucoes/clinicas-e-servicos`: recepção, organização comercial, agenda e limites do uso de IA; não se apresenta como prontuário ou ferramenta de decisão clínica.
- `/solucoes/ecommerce`: atendimento e contexto da loja, com disponibilidade de eventos/integrações condicionada à configuração.
- `/blog/como-escolher-crm-com-ia`: critérios de compra e roteiro de teste, com exemplos fictícios identificados e sem comparativos inventados.
- Perguntas e respostas úteis, em HTML visível, com schema correspondente. Não se promete resultado enriquecido de FAQ para um SaaS comercial.
- Breadcrumbs visíveis nas páginas principais e nos artigos, com `BreadcrumbList` correspondente.
- `Article` recebe imagem, data de atualização quando disponível e autoria de organização para “Time ALTUM”. Organização, site e aplicação mantêm identidade coerente. Nenhuma avaliação, prêmio, certificação ou resultado foi inventado.
- JSON-LD escapa `<` para impedir fechamento indevido do elemento de script.
- A interface ilustrativa usa `data-nosnippet` para que nomes e valores fictícios não sejam destacados como evidências do produto. O conteúdo comercial real permanece disponível para snippets.

### Desempenho e experiência

- Autenticação carregada sob demanda nas rotas que a utilizam, em vez de trazer seu SDK na entrada do site público. O mecanismo da área privada permanece o mesmo.
- Logo do cabeçalho tem prioridade de carregamento. Imagens de artigos abaixo da dobra continuam com carregamento adiado e dimensões definidas.
- Capas SVG existentes têm cerca de 1 KiB; recomprimi-las não seria um ganho relevante. Fotos em componentes Next Image já usam tamanhos responsivos e otimização de imagem.
- Cache explícito para capas e imagens públicas, sem alterar cache de API, service worker ou páginas privadas.
- Corrigidos contraste do avatar de exemplo e salto inicial de títulos na demonstração.
- A validação de código não substitui ensaio Lighthouse nem os dados reais de LCP, INP e CLS.

## Próxima etapa com Search Console e Bing

O proprietário autenticou a sessão do Google Search Console durante a revisão. Os dados de desempenho e indexação foram consultados e registrados apenas nos artefatos locais de QA; eles não são enviados ao site ou ao repositório.

1. Selecionar a propriedade correta e enviar `https://altumia.com.br/sitemap.xml`.
2. Inspecionar home, plataforma, preços e as três soluções: canonical declarado/selecionado, possibilidade de indexação e HTML renderizado.
3. Investigar URLs excluídas, erros de rastreamento e eventuais ações manuais antes de pedir novas indexações.
4. Exportar 28 dias e 90 dias de consultas, páginas, países e dispositivos. Registrar data do deploy como marco de comparação.
5. Configurar Bing Webmaster Tools com a participação do proprietário na verificação ou no consentimento de importação. Não conceder acesso à conta Google sem revisar esse consentimento.
6. Acompanhar indexação e relatório de Core Web Vitals; os dados de campo têm janela de coleta e não mudam imediatamente após o deploy.

## Plano editorial e de autoridade

| Público | Intenção prioritária | Conteúdo de comprovação a produzir |
| --- | --- | --- |
| WhatsApp/Instagram | CRM com IA, múltiplos atendentes, funil e follow-up | Demonstração narrada de conversa até oportunidade e retorno; limites por plano |
| Clínicas e serviços | Recepção, contato, agendamento e propostas | Fluxo aprovado pela equipe, com dados fictícios, limites de atuação e sistemas utilizados |
| E-commerce | Atendimento com contexto da loja, dúvidas e campanhas | Demonstração de uma integração validada, dados disponíveis e tratamento de falhas |

Priorizar um material próprio verificável por público. Estudos de caso devem registrar cenário inicial, período, método e resultados reais, com autorização do cliente. Não transformar a conta fictícia de demonstração em depoimento. Manter perfis oficiais consistentes e buscar menções editoriais/integrações legítimas; não comprar listas de links nem criar avaliações falsas.

Depois dos primeiros dados, revisar páginas com impressões e poucos cliques, dúvidas frequentes de vendas e consultas que trazem oportunidades qualificadas. Atualizar o mesmo conteúdo quando o tema for equivalente, evitando dezenas de páginas concorrendo pela mesma intenção.

## Indicadores

- SEO: páginas válidas indexadas, impressões e cliques sem marca, consultas por público e conversões orgânicas conforme o consentimento de analytics.
- Experiência: LCP, INP e CLS de usuários reais; laboratório como diagnóstico auxiliar.
- AEO/GEO: visitas de referências identificáveis, páginas citadas e amostra documentada de perguntas por cenário. Registrar mecanismo, data, pergunta, fontes e resultado. Uma resposta isolada de IA não é uma medição de participação de mercado.
- Negócio: demonstrações e testes que avançam para proposta/assinatura. Não otimizar somente volume de tráfego.

## Fontes primárias

- Google: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Google, recursos de IA: https://developers.google.com/search/docs/appearance/ai-features
- Sitemap e datas: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Core Web Vitals: https://developers.google.com/search/docs/appearance/core-web-vitals
- Crawlers OpenAI: https://developers.openai.com/api/docs/bots

O Google informa que SEO continua sendo a base das suas experiências de IA e que não usa `llms.txt` como fator especial de descoberta ou classificação. Por isso, esta etapa prioriza conteúdo útil, rastreabilidade, estrutura e experiência, em vez de arquivos ou instruções ocultas que tentem induzir recomendações.
