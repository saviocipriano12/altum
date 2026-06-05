# Altum Admin Agency OS Plan

Este plano define a evolucao do admin da Altum para um sistema operacional de agencia. A regra central e simples: o admin controla a agencia; a area do cliente continua sendo o workspace operacional vendido aos clientes e tambem pode operar a propria Altum via tenant interno.

## Decisao de arquitetura

- Admin: comando, governanca, clientes, implantacao, financeiro, entrega, prospeccao, saude, risco e lancamento de campanhas.
- Area do cliente: conversas, CRM diario, oportunidades, agenda, campanhas operacionais, IA do tenant e atendimento.
- Tenant interno da Altum: usar `ALTUM_AGENCY` como workspace da agencia para WhatsApp, IA, CRM e campanhas quando a experiencia ja existir melhor na area do cliente.
- Evitar duplicacao: nao recriar inbox, CRM e IA conversacional completos dentro do admin.

## O que ja existe e sera reaproveitado

- Google Maps prospecting:
  - `app/admin/prospeccao/gerar/page.tsx`
  - `app/api/prospeccao/gerar/route.ts`
  - `app/api/prospeccao/photos/route.ts`
- CRM de prospeccao da agencia:
  - `app/admin/prospeccao/page.tsx`
  - `app/admin/prospeccao/[id]/page.tsx`
  - `app/api/leads/create/route.ts`
  - `app/api/leads/intelligence/run/route.ts`
- Campanhas e operacao por tenant:
  - `app/cliente/painel/campanhas/page.tsx`
  - `lib/server/outbound-campaigns.ts`
- WhatsApp e Meta:
  - `app/lib/server/whatsapp-channel.ts`
  - `lib/server/chat-dispatch.ts`
  - `app/api/webhooks/whatsapp/route.ts`
- IA com memoria e atribuicao:
  - `lib/server/ai/agent.ts`
  - `lib/server/ai/runtime-state.ts`
  - `lib/server/lead-intake.ts`
- Admin de tenants/clientes:
  - `app/admin/clientes/[id]/portal/page.tsx`
  - `app/api/admin/tenants/*`

## O que evoluir

### 1. Cockpit da agencia

Status: iniciado.

- Reorganizar dashboard como cockpit executivo.
- Mostrar prioridades, arsenal, saude da IA, funil, leads recentes e agenda.
- Deixar claro quando a acao acontece no admin e quando deve abrir o workspace do cliente.
- Unificar navegacao do admin para sidebar e command palette usarem a mesma fonte.

### 2. Prospeccao Maps para audiencia

Status: iniciado.

- Permitir salvar leads do Maps diretamente em uma lista/audiencia.
- Definir tenant destino, com `ALTUM_AGENCY` como padrao para a propria Altum.
- Permitir filtros por nicho, cidade, score, heat, telefone, rating, origem e status.
- Criar acao "preparar campanha" a partir da lista selecionada.
- Primeira entrega aplicada: a tela de prospeccao permite selecionar leads filtrados, ver qualidade da audiencia e preparar campanha WhatsApp sem sair do CRM.
- Primeira entrega aplicada: `/api/admin/audiences` salva e lista audiencias persistentes com leads, filtros e resumo de qualidade.
- Primeira entrega aplicada: a prospeccao permite salvar a selecao atual como audiencia operacional da Altum.

### 3. Campanhas Meta oficiais

Status: iniciado.

- Evoluir campanhas de texto livre para templates oficiais da Meta.
- Suportar `templateName`, `languageCode`, variaveis, categoria, objetivo e oferta.
- Suportar header de imagem, video ou documento quando o template exigir.
- Separar campanha comercial de follow-up utilitario.
- Primeira entrega aplicada: `/api/whatsapp/bulk-send` aceita modo `template`, parametros de BODY e header de imagem, video ou documento.
- Primeira entrega aplicada: `sendMetaTemplateMessage` e `sendTenantChatTemplate` suportam header media mantendo compatibilidade com chamadas antigas.
- Primeira entrega aplicada: `/admin/templates` lista templates oficiais do WABA por tenant, mostra status/categoria/idioma, variaveis e tipo de header.
- Primeira entrega aplicada: `/api/admin/whatsapp/templates` consulta o canal WhatsApp do tenant e retorna biblioteca de templates com resumo operacional.
- Primeira entrega aplicada: `/api/admin/whatsapp/templates` tambem sincroniza templates operacionais padrao no WABA quando solicitado pelo admin.
- Primeira entrega aplicada: `/admin/templates` copia pacote de campanha com template, idioma, categoria e variaveis para reduzir erro operacional.
- Primeira entrega aplicada: a prospeccao carrega templates aprovados e permite aplicar template/idioma/header sem digitacao manual.
- Primeira entrega aplicada: o motor tenant `outbound_campaigns` aceita `deliveryMode: "template"`, template Meta, idioma, variaveis e header media, mantendo `text` como legado compativel.

### 4. Contexto de entrega para IA

Status: iniciado.

- Registrar cada envio por lead/chat com campanha, template, midia, oferta, texto renderizado e status Meta.
- No webhook de resposta, localizar o ultimo disparo relevante.
- Entregar esse contexto para a IA continuar a conversa sem perder o assunto.
- Evitar pausa longa da IA em campanhas onde a IA deve responder.
- Primeira entrega aplicada: envios em lote gravam `outbound_campaign_deliveries`, `lastOutboundCampaignContext` no lead/chat e mantem `aiCampaignFollowupMode`.
- Primeira entrega aplicada: status Meta atualiza entregas por `metaMessageId`, e a memoria da IA resume o ultimo disparo enviado.

### 5. Compliance e qualidade de disparo

Status: parcial aplicado.

- Consentimento, origem do contato, opt-out e lista de bloqueio.
- Frequencia maxima por lead.
- Janela de envio e limites por lote.
- Tratamento de "PARAR" e termos equivalentes.
- Painel de falhas, bloqueios, qualidade e entregabilidade.
- Primeira entrega aplicada: o disparo em massa bloqueia leads com opt-out/lista de nao contato e respeita intervalo minimo de 72h entre campanhas por lead.

### 6. Saude de clientes e entrega

Status: futuro.

- Implantacao por cliente.
- Risco de churn.
- Pendencias de canal, IA, CRM e campanhas.
- Projetos atrasados.
- Receita, inadimplencia e margem.
- Recomendada proxima acao da Altum por cliente.

## O que criar novo

- Central de disparo da agencia no admin.
- Biblioteca de templates Meta com status e midia.
- Modelo de entregas por campanha, por lead e por chat.
- Resolvedor de contexto de campanha no webhook.
- Pipeline Maps -> lista -> template -> disparo -> resposta -> IA.
- Cockpit de saude dos clientes e da operacao interna.

## Ordem recomendada de implementacao

1. Cockpit e navegacao do admin.
2. Mapeamento Maps -> audiencia. Parcialmente aplicado.
3. Modelo de entrega de campanha. Parcialmente aplicado.
4. Template Meta com midia. Parcialmente aplicado.
5. Disparo por template oficial. Parcialmente aplicado no bulk admin.
6. Contexto de campanha na IA. Parcialmente aplicado.
7. Compliance, opt-out e limites. Parcialmente aplicado.
8. Saude de clientes, entrega e receita.

## Proxima fronteira

- Persistir opt-out automaticamente quando o contato responder "PARAR" ou equivalente.
- Criar painel de qualidade de entregabilidade e falhas de disparo.
- Transformar audiencias salvas em campanhas reutilizaveis com historico e comparacao de resultado.
- Amarrar saude de clientes, implantacao, receita e risco no cockpit.
- Adicionar janelas de envio e limites diarios por numero antes de escala.

## Criterio de qualidade

- Cada tela deve responder o que aconteceu, qual acao tomar, onde configurar, qual risco existe ou qual resultado foi gerado.
- Nao duplicar funcionalidades completas da area do cliente quando ela ja faz melhor.
- Nao quebrar rotas antigas.
- Validar lint, typecheck e comportamento visual a cada fase relevante.
