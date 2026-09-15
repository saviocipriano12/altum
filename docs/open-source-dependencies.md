# Dependencias open-source incorporadas

Este arquivo registra codigo de terceiros incorporado diretamente ao produto, separado de repositorios usados apenas como referencia.

## PostHog JS - padroes de captura

- Repositorio estudado: `PostHog/posthog-js`
- Licenca: MIT
- Uso: referencia para identidade anonima persistente, sessao com expiracao, captura no navegador e envio tolerante ao fechamento da pagina.

O `Altum Tracking` implementa esses padroes em um coletor pequeno e proprio, adaptado ao isolamento por tenant e ao grafo comercial da Altum. Nenhum servidor do PostHog e necessario e nenhum dado e enviado para terceiros. A implementacao limita eventos e propriedades, remove parametros de URL que podem carregar dados pessoais, exige dominios autorizados e usa uma chave publica separada por tenant.

Arquivos ativos:

- `public/altum-tracker.js`: SDK de instalacao no site do cliente;
- `app/api/growth/collect/route.ts`: ingestao publica com CORS, limite de payload e validacao;
- `lib/server/growth/tracking.ts`: contrato, normalizacao e IDs idempotentes;
- `app/cliente/painel/campanhas/rastreamento/page.tsx`: configuracao e verificacao visual.

A tool MCP `growth_tracking_overview` oferece a mesma leitura para ChatGPT, Codex, Claude ou outro cliente MCP autorizado, respeitando tenant, escopos, permissao de relatorios e cobertura declarada.

## AdPort Core

- Pacote: `@adport/core`
- Versao fixada: `0.6.0`
- Repositorio: https://github.com/ynnickw/adport
- Commit revisado antes da incorporacao: `ed1d0a47d70c32778956d831a0b019b308fa2979`
- Licenca: Apache-2.0
- Licenca distribuida pelo pacote: `node_modules/@adport/core/LICENSE`
- Integridade registrada: `package-lock.json`

Componentes incorporados pelo pacote:

- `PolicyEngine` para o fluxo de validacao e aplicacao em duas etapas;
- limite percentual e absoluto de alteracao de verba;
- contrato `AdProvider`;
- contratos de operacao, previa e resultado;
- identificador temporario de operacao pendente;
- hash canonico da operacao;
- contrato de auditoria;
- motor de recomendacoes e regras de performance disponivel para a proxima integracao.

Uso ativo na Altum:

- `PolicyEngine` valida os rascunhos de pausa e verba;
- `hashOperation` assina os argumentos normalizados da operacao;
- `corePerformancePack` e `AuditRunner` analisam campanhas com gasto sem venda, CTR baixo e CPA fora do padrao;
- os achados do AdPort sao devolvidos em `adportAudit` dentro de `growth_daily_briefing`.

Adaptacoes mantidas pela Altum:

- resolucao de tenant, conta e campanha a partir do Firestore;
- autorizacao por escopo MCP e permissao do usuario;
- persistencia do rascunho para aprovacao humana;
- interface em Configuracoes > MCP;
- adaptador de previa que impede escrita externa enquanto os conectores autenticados nao estiverem ativos.

O codigo compilado do AdPort e instalado como dependencia normal do projeto. Nao deve ser copiado ou modificado dentro de `node_modules`; alteracoes especificas da Altum ficam nos adaptadores em `lib/server/growth`.

## AdPort Meta e Google providers

- Pacotes: `@adport/provider-meta` e `@adport/provider-google`
- Versao fixada: `0.6.0`
- Licenca: Apache-2.0
- Integridade: registrada em `package-lock.json`

Os providers prontos passaram a alimentar a sincronizacao por campanha da Altum. Eles consultam as APIs oficiais, normalizam resultados por `campaignId` e entregam gasto, impressoes, cliques, conversoes e ROAS no mesmo contrato. O caminho antigo do Google permanece como compatibilidade quando existe filtro personalizado de conversao ou configuracao apenas com token de acesso.

O provider Google tambem sustenta o Operador Google Ads em `Campanhas > Operador Google Ads`. A Altum reutiliza o cliente REST e o construtor GAQL prontos do AdPort para consultar campanhas, orcamentos, palavras-chave, termos de pesquisa e anuncios responsivos. Os dados normalizados ficam em um snapshot limitado por conta, sem persistir tokens, e podem ser lidos pela tool MCP `google_ads_operator_report`.

Adaptacoes especificas da Altum no operador:

- isolamento por tenant, canal e conta;
- leitura ao vivo apenas por usuario com permissao de canais;
- diagnosticos de gasto sem conversao, escala gradual, qualidade de palavra-chave, termo possivelmente negativo e forca do anuncio;
- limite de linhas por recurso para respeitar o tamanho do documento e manter a interface responsiva;
- mudancas de pausa e verba encaminhadas para os rascunhos MCP existentes, com validacao do AdPort e aprovacao humana;
- termos negativos e edicao criativa permanecem como recomendacao de revisao nesta entrega.

O pacote Google foi ampliado com rascunhos para palavra-chave negativa, pausa de palavra-chave, grupo de anuncios, anuncio responsivo, campanha pausada e estrategia de lance. Cada operacao guarda o payload normalizado e seu hash; depois da aprovacao, o provider executa a previa ao vivo antes da aplicacao.

O provider Meta tambem alimenta `Campanhas > Operador Meta Ads`, consultando insights de campanhas, conjuntos e anuncios e os estados efetivos dos objetos. A Altum calcula investimento, leads, compras, CPL, CTR, frequencia e ROAS, aponta campanhas sem leads e criativos com sinais de fadiga, persiste o relatorio sem credenciais e o disponibiliza pela tool MCP `meta_ads_operator_report`.

As operacoes de escrita do Meta reutilizam os contratos `meta_create_campaign`, `meta_create_ad_set`, `meta_set_ad_set_status` e `meta_api_create` do AdPort. A Altum acrescenta validacao contra o ultimo relatorio autorizado, URLs HTTP/HTTPS, limites de verba, hash imutavel, isolamento por tenant e uma sequencia visual em quatro etapas: campanha, conjunto, criativo e anuncio. Criacoes de campanha, conjunto e anuncio sao sempre pausadas. Criativos e anuncios so sao enviados depois de revisao humana e uma segunda validacao da conta no momento da aplicacao.

Depois da aprovacao humana, pausa e mudanca de verba usam os providers do AdPort para:

1. reler o estado atual no provedor;
2. executar a previa suportada pela Meta ou Google;
3. aplicar os limites do `PolicyEngine` sobre o valor real;
4. rejeitar alvo alterado, credencial ausente ou limite excedido;
5. aplicar a operacao idempotente de status ou verba;
6. registrar previa, resultado, hash e auditoria na Altum.

## Meta Ads Kit

- Repositorio: https://github.com/TheMattBerman/meta-ads-kit
- Commit incorporado: `dffa0daf6ed1e278481e9408af3be6aaf9709b28`
- Licenca: MIT
- Copyright: Matt Berman, 2026
- Copia da licenca: `third_party/meta-ads-kit/LICENSE`

Codigo e regras adaptados:

- agrupamento de insights diarios por `ad_id`;
- exigencia de pelo menos tres pontos diarios antes de concluir fadiga;
- comparacao entre o primeiro e o ultimo CTR;
- estado `FATIGUED` quando a queda de CTR chega a 20%;
- estado `HIGH_FREQUENCY` acima de 3,5;
- referencia de CTR minimo de 1% e gasto minimo de 10.

A Altum converteu o playbook Shell/JQ em uma implementacao TypeScript estruturada. A sincronizacao Meta, feita sobre o provider pronto do AdPort, agora persiste dados diarios por anuncio em `ad_creative_snapshots`. A tool MCP `creative_fatigue_report` consulta apenas dados do tenant autorizado, aceita limites ajustaveis e nao altera anuncios.

Adaptacoes adicionais da Altum:

- isolamento por tenant, conta e canal;
- evidencias estruturadas e cobertura explicita;
- limite de 1.500 snapshots por analise;
- estado `LOW_CTR` para criativo com gasto e CTR abaixo do minimo;
- ordenacao por risco e gasto;
- nenhuma conclusao de fadiga com menos de tres dias.

## Dittofeed

- Repositorio: https://github.com/dittofeed/dittofeed
- Commit incorporado: `52b2bee909744d07dd5d409fd3974d4b95c66766`
- Licenca: MIT
- Copyright: Idea Market Inc., 2023
- Copia da licenca: `third_party/dittofeed/LICENSE`

A funcao de correspondencia de eventos exatos ou por prefixo (`evento_*`) foi adaptada de `packages/isomorphic-lib/src/events.ts`. A modelagem de uma jornada formada por eventos foi adaptada aos objetos que a Altum ja possui: lead, conversa, qualificacao, agenda e venda.

Uso ativo na Altum:

- tool MCP `lead_journey_by_source`;
- tool MCP `segment_leads_preview` com combinacao `all` ou `any`;
- tool MCP `draft_lead_segment`, sempre sujeita a revisao humana;
- filtro por origem, campanha e padrao de evento;
- operadores de segmento `Equals`, `NotEquals`, `Exists`, `NotExists`, `GreaterThanOrEqual`, `LessThan` e `Includes`;
- eventos normalizados `lead_created`, `conversation_started`, `lead_qualified`, `meeting_scheduled` e `sale_won`;
- exclusao de etapas sem data conhecida, sem inventar historico;
- isolamento pelas permissoes comerciais e pelo tenant do MCP.

Depois da aprovacao, a Altum salva a definicao em `growth_segments` com origem, autor, rascunho e auditoria. Salvar o segmento nao dispara campanha nem envia mensagem.

Os segmentos salvos tambem podem ser listados por `list_growth_segments` e ligados a uma campanha pelo rascunho `draft_segment_campaign`. Depois da aprovacao, a Altum cria uma entrada em `outbound_campaigns` com estado `draft`. O operador ainda precisa revisar e agendar o disparo na area de Campanhas; a aprovacao MCP isoladamente nunca envia a mensagem.
