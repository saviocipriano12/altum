# Altum Growth Intelligence - plano de incorporacao open-source

Data: 2026-09-11

## Decisao de produto

A Altum deve acelerar a nova camada de marketing copiando e adaptando partes de projetos open-source quando a licenca permitir. A estrategia nao e transformar a Altum em uma copia de outro produto. A estrategia e importar bases maduras para ganhar velocidade e concentrar desenvolvimento proprio onde esta o diferencial da Altum: conectar anuncios, origem, conversa, CRM, proposta, venda e receita.

O modulo deve nascer como uma evolucao da Altum, nao como um produto separado. O nome interno recomendado e `Altum Growth Intelligence`.

## O que a Altum ja tem hoje

A Altum ja possui uma base real para essa direcao:

- Captura de UTM, gclid e fbclid em formularios publicos e widget de chat.
- Normalizacao de atribuicao em `lib/server/attribution`.
- CRM e pipeline ja lendo origem, campanha e sourceLabel.
- Relatorios ja cruzando campanha, gasto, leads, qualificados, reunioes, vendas, CPL e custo por venda.
- Sincronizacao de snapshots de campanha para Meta Ads e Google Ads.
- Conversoes server-side para Meta/Google por eventos como lead criado, lead qualificado, reuniao e venda.
- Trilha comercial por etapa do lead.
- MCP da Altum ja criado, com rascunhos e aprovacao para mudancas sensiveis.

Conclusao: nao falta comecar do zero. Falta consolidar essas pecas em uma camada oficial, mais completa, com modelo de dados e experiencia de produto.

## Repositorios avaliados inicialmente

### 1. dittofeed/dittofeed

Repositorio: https://github.com/dittofeed/dittofeed
Licenca indicada pela API do GitHub: MIT
Stack principal indicada: TypeScript
Uso recomendado: copiar/adaptar padroes de eventos, segmentos, jornadas e automacoes de comunicacao.

Alta prioridade. E um dos melhores candidatos para estudar e reaproveitar ideias/codigo porque conversa com jornadas, segmentos, mensagens e automacoes. Tem mais aderencia com a Altum do que uma ferramenta pura de ads.

### 2. PostHog/posthog-foss

Repositorio: https://github.com/PostHog/posthog-foss
Licenca indicada pela API do GitHub: MIT
Stack principal indicada: Python
Uso recomendado: estudar arquitetura de eventos, identity resolution, funis, propriedades e jornada. Copia direta exige cuidado por stack e tamanho.

Alta prioridade como referencia de arquitetura. O valor aqui e aprender como modelar eventos e identidade. A Altum nao deve copiar o PostHog inteiro, mas deve absorver o conceito de event graph.

### 3. mautic/mautic

Repositorio: https://github.com/mautic/mautic
Licenca indicada pela busca: precisa confirmacao manual; ecossistema Mautic frequentemente aparece com licencas GPL em partes do projeto.
Stack principal indicada: PHP
Uso recomendado: estudar campanhas, lead scoring, segmentos e marketing automation. Evitar copiar codigo direto sem auditoria de licenca.

Prioridade media como referencia. Mautic e maduro, mas a stack e a licenca tornam incorporacao direta menos atraente.

### 4. gitroomhq/postiz-app

Repositorio: https://github.com/gitroomhq/postiz-app
Licenca indicada pela API do GitHub: AGPL-3.0
Stack principal indicada: TypeScript
Uso recomendado: estudar produto de social media, calendario editorial, publicacao e operacao agentica. Nao copiar codigo direto para a Altum sem decisao juridica.

Prioridade futura. Social media pode ser uma extensao depois que Ads + CRM + Receita estiverem fortes.

### 5. ynnickw/adport

Repositorio: https://github.com/ynnickw/adport
Licenca indicada pela API do GitHub: Apache-2.0
Stack principal indicada: TypeScript
Uso recomendado: copiar/adaptar arquitetura de ads control plane, MCP/CLI e writes com politica de seguranca.

Alta prioridade para a camada de execucao segura. A ideia de preview, policy guard e aprovacao antes de alterar campanhas encaixa muito bem com o MCP da Altum.

### 6. TheMattBerman/meta-ads-kit

Repositorio: https://github.com/TheMattBerman/meta-ads-kit
Licenca indicada pela API do GitHub: MIT
Stack principal indicada: Shell / automacoes
Uso recomendado: estudar rotina de gestor de ads, briefing, fadiga criativa, vencedores/perdedores e sugestoes de budget.

Alta prioridade para playbooks de trafego. Pode acelerar a camada de recomendacao operacional.

### 7. irinabuht12-oss/google-meta-ads-ga4-mcp

Repositorio: https://github.com/irinabuht12-oss/google-meta-ads-ga4-mcp
Licenca indicada pela API do GitHub: MIT
Uso recomendado: estudar ferramentas MCP para Google Ads, Meta Ads e GA4; avaliar se vale reaproveitar conectores ou apenas mapear tools equivalentes dentro da Altum.

Alta prioridade para MCP de marketing, mas precisa auditoria mais profunda antes de copiar porque expor muitas tools diretamente pode quebrar a experiencia da Altum. A Altum deve oferecer ferramentas curadas por negocio, nao centenas de comandos crus.

### 8. markifact/markifact-mcp

Repositorio: https://github.com/markifact/markifact-mcp
Licenca indicada pela API do GitHub: MIT
Uso recomendado: estudar MCP multi-plataforma para anuncios e human-in-the-loop.

Prioridade alta para comparar com adport e google-meta-ads-ga4-mcp.

## Regras de incorporacao

1. MIT e Apache-2.0 podem ser candidatos a copia/adaptacao, preservando copyright, notices e licencas.
2. AGPL/GPL devem ser usados apenas como referencia de arquitetura, salvo decisao juridica especifica.
3. Antes de copiar codigo, criar pasta de staging com arquivo de origem e licenca.
4. Nada deve entrar no fluxo principal da Altum sem adaptacao para tenant, permissoes, auditoria, logs e aprovacao.
5. Toda acao que altere campanhas, orcamento, publico, criativo ou conversao deve nascer como rascunho aprovado por humano.
6. A Altum deve esconder complexidade tecnica do cliente comum; controles avancados ficam em Configuracoes > Avancado ou perfil tecnico.

## Arquitetura alvo

```text
Altum Growth Intelligence
  Capture & Attribution
    - UTM
    - gclid/fbclid
    - landing page
    - origem
    - first/last/assisted touch

  Revenue Graph
    - campanha
    - conjunto/ad group
    - anuncio/criativo
    - clique
    - visitante
    - lead
    - conversa
    - qualificacao
    - oportunidade
    - proposta
    - venda
    - receita
    - recompra/recorrencia

  Ads Control Plane
    - leitura de campanhas
    - snapshots
    - fadiga
    - vencedores/perdedores
    - recomendacoes
    - rascunhos de alteracao
    - aprovacao humana

  Marketing Automation
    - segmentos
    - jornadas
    - gatilhos
    - follow-up
    - reativacao
    - campanhas de relacionamento

  MCP Operator
    - perguntar desempenho
    - investigar queda
    - listar campanhas ruins
    - recomendar redistribuicao
    - criar rascunho de mudanca
    - acionar follow-up/agenda/CRM
```

## Primeira versao recomendada

### Entrega iniciada em 2026-09-11 - Altum Tracking

- SDK publico por tenant em `/altum-tracker.js`;
- coleta de pagina, CTA, WhatsApp, formulario, produto, checkout e venda;
- UTM, gclid e fbclid persistidos por sessao;
- chave publica e lista de dominios autorizados por tenant;
- modo de consentimento obrigatorio ou implicito;
- deduplicacao por identificador deterministico de evento;
- painel em `Campanhas > Rastreamento` com saude, eventos, conversoes e receita;
- endpoint pronto para alimentar o Revenue Graph e as ferramentas MCP de Growth.

### Entrega seguinte - Revenue Graph operacional

- coorte de leads adquiridos em 7, 30 ou 90 dias;
- uniao de eventos web, campanha, lead, conversa, qualificacao, reuniao, proposta, venda e pagamento;
- receita paga, investimento, valor potencial e ROAS por campanha;
- cobertura explicita de eventos ligados diretamente a leads;
- escopo de equipe ou carteira conforme a permissao comercial;
- endpoint `/api/tenant/[tenantId]/growth/revenue-graph`;
- tool MCP `revenue_graph_report` para analise pelo ChatGPT, Codex ou Claude;
- funil e comparacao por campanha na interface de Campanhas > Rastreamento.

### Entrega seguinte - Operador Google Ads

- leitura ao vivo pelo provider `@adport/provider-google` do AdPort;
- campanhas, status, estrategia, orcamento, gasto, conversoes, CPA e ROAS;
- palavras-chave, correspondencia e indice de qualidade;
- termos pesquisados com identificacao de gasto sem conversao;
- anuncios responsivos, titulos, descricoes, URL e forca do anuncio;
- recomendacoes estruturadas para reduzir desperdicio, melhorar qualidade e escalar vencedores;
- tela em `Campanhas > Operador Google Ads`;
- tool MCP `google_ads_operator_report`;
- pausa e alteracao de verba somente por rascunho aprovado; nenhuma alteracao ocorre na consulta ao Google.

### Entrega seguinte - Operador Meta Ads

- leitura ao vivo de campanhas, conjuntos e anuncios pelo `@adport/provider-meta`;
- estado efetivo, investimento, leads, compras, CPL, CTR, frequencia e ROAS;
- alerta de campanha ativa com gasto sem leads e de fadiga criativa;
- tela em `Campanhas > Operador Meta Ads`;
- atualizacao acoplada ao job seguro de campanhas;
- tool MCP `meta_ads_operator_report` e rascunhos de pausa/verba com aprovacao.

A primeira entrega deve melhorar o que ja existe na Altum, antes de criar um monstro novo.

### Fase 1 - consolidar atribuicao

- Criar camada `lib/server/growth`.
- Criar contrato unico para `GrowthEvent`, `RevenueGraphNode`, `CampaignPerformance`, `LeadQualitySignal`.
- Padronizar eventos: `ad_click`, `lead_created`, `conversation_started`, `lead_qualified`, `meeting_scheduled`, `proposal_sent`, `sale_won`, `sale_lost`, `revenue_recorded`.
- Backfill dos leads existentes usando os campos atuais de UTM/origem.
- Garantir que formulario, widget, diagnostico, contato e prospeccao gravem a mesma estrutura.

### Fase 2 - intelligence de campanhas

- Criar endpoint `/api/tenant/[tenantId]/growth/overview`.
- Unificar campanha + CRM + reuniao + venda + receita.
- Gerar score de qualidade por campanha.
- Mostrar campanhas que trazem leads ruins, boas conversas e vendas reais.

### Fase 3 - MCP de Growth

Adicionar tools MCP curadas:

- `growth_daily_briefing`
- `campaign_quality_report`
- `revenue_by_campaign`
- `lead_journey_by_source`
- `stale_paid_leads`
- `draft_campaign_budget_change`
- `draft_campaign_pause`
- `draft_followup_sequence`

### Fase 4 - importar padroes open-source

Ordem recomendada de estudo/copia:

1. adport: writes seguros, policy guard e aprovacao.
2. meta-ads-kit: playbook de gestor, fadiga e briefing.
3. dittofeed: eventos, segmentos e jornadas.
4. google-meta-ads-ga4-mcp / markifact-mcp: desenho de tools MCP e conectores.
5. PostHog FOSS: arquitetura de eventos e identity.
6. Mautic/Postiz: referencia futura, sem copia direta por licenca/stack.

## Modelo comercial recomendado

Vender primeiro como servico premium e transformar em produto em paralelo.

### Altum Software

Plataforma base: CRM, WhatsApp, IA, funil, agenda, relatorios e MCP.

### Altum Growth Intelligence

Modulo de dados: origem, campanhas, qualidade de lead, receita e recomendacoes.

### Altum Managed Growth

Servico premium: gestao de trafego e operacao comercial baseada nos dados da Altum.

Essa oferta permite vender antes de o produto estar 100% self-service, gerar cases reais e descobrir quais automacoes realmente importam.

## Decisao recomendada

Seguir com incorporacao open-source, mas de forma controlada.

Comecar copiando/adaptando o que for MIT/Apache e tiver encaixe direto:

- adport para seguranca de alteracoes e operacao de ads.
- meta-ads-kit para rotina de analise de campanha.
- dittofeed para estrutura de jornadas/segmentos.
- MCP ads projects para desenho de tools.

Manter proprio da Altum:

- Revenue Graph.
- Ligacao com WhatsApp/conversas.
- Qualificacao comercial.
- Recomendacao por receita e qualidade.
- Experiencia do cliente final.

## Incorporacao iniciada em 2026-09-11

O primeiro padrao incorporado veio do AdPort, revisado no commit `ed1d0a47d70c32778956d831a0b019b308fa2979` (Apache-2.0). A implementacao da Altum foi escrita para o modelo de permissao, tenant e auditoria ja existente, aproveitando estes conceitos arquiteturais:

- toda acao externa nasce como previa ou rascunho;
- alteracoes de verba possuem limite percentual;
- o alvo fica vinculado a plataforma, conta e `campaignId` conhecidos;
- argumentos e alvo geram uma assinatura estavel da operacao;
- aprovacao humana e validacao no provedor precedem qualquer escrita;
- mudancas rejeitadas pela politica falham de forma fechada.

Entregue nesta etapa:

- `draft_campaign_pause`;
- `draft_campaign_budget_change`;
- limite de 25% por mudanca de verba;
- bloqueio de campanhas ausentes ou ambiguas;
- motivo, evidencias, alvo e hash persistidos no rascunho;
- exibicao dos rascunhos de campanha na central MCP.

### Meta Ads Kit incorporado

O playbook de fadiga do `TheMattBerman/meta-ads-kit` foi adaptado do commit `dffa0daf6ed1e278481e9408af3be6aaf9709b28` (MIT). A Altum passou a sincronizar anuncios Meta por dia e disponibilizar a tool MCP `creative_fatigue_report`, com queda de CTR, frequencia, gasto, CPC, evidencias e cobertura. A licenca original foi preservada em `third_party/meta-ads-kit/LICENSE`.

### Dittofeed incorporado

O matcher de eventos, o modelo de jornada e os operadores declarativos de segmentos do `dittofeed/dittofeed` foram adaptados do commit `52b2bee909744d07dd5d409fd3974d4b95c66766` (MIT). A tool MCP `lead_journey_by_source` reconstrui a sequencia conhecida entre origem, lead, conversa, qualificacao, reuniao e venda. A tool `segment_leads_preview` permite combinar campos comerciais com operadores seguros e visualizar a audiencia antes de qualquer automacao. As duas informam cobertura parcial e nao criam datas ausentes.

A aplicacao externa foi concluida depois desta primeira etapa. Rascunhos aprovados usam o provider do AdPort para reler o estado, executar a previa, validar o hash e aplicar pausa ou mudanca limitada de verba. A execucao continua condicionada a credencial valida, permissao, aprovacao humana e verificacao do alvo.
