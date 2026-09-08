# ALTUM — Inventário funcional para produto, site e SEO

Data: 2026-09-08

Este documento separa o que foi verificado no produto atual de ideias/roadmaps. O objetivo é impedir que a comunicação pública prometa algo que ainda é apenas blueprint.

## 1. CRM — implementado no portal
### Evidências funcionais
- cadastro e visualização de leads;
- empresa, telefone, email, origem e canal;
- responsável pelo lead;
- score, temperatura e prioridade;
- valor potencial;
- tags e campos personalizados;
- notas, tarefas, compromissos e timeline;
- resumo de conversas relacionadas;
- qualificação com score, faixa, próxima ação e motivos;
- checklist de informações extraídas pela IA;
- handoff para humano;
- adapter de agenda comercial com Google Calendar previsto no fluxo.

### Valor para comunicação
A Altum não é apenas um chatbot. Existe uma camada de memória comercial que conecta conversa, lead, contexto, qualificação, tarefas e oportunidade.

### Página pública recomendada
`/crm`

---

## 2. Inbox / atendimento — implementado no portal
### Evidências funcionais
- fila de conversas;
- contato, empresa, canal, status e prioridade;
- responsável e atribuição;
- SLA e controle de espera;
- tags;
- mensagens de texto e mídia;
- áudio, imagem e arquivos;
- notas;
- relação entre conversa e lead;
- estado da IA por conversa;
- pausa da IA e propriedade humana;
- handoff e notificações operacionais;
- orçamento e contexto financeiro ligados ao atendimento.

### Valor para comunicação
O diferencial não é só "responder WhatsApp". O atendimento está ligado ao CRM e à operação comercial.

### Página pública recomendada
`/inbox`

---

## 3. IA operacional — implementada em camada de configuração e observabilidade
### Evidências funcionais
- ativar/desativar IA;
- tom de voz e resumo do negócio;
- objetivo;
- guardrails;
- perguntas obrigatórias;
- tópicos de escalação;
- modos copilot, híbrido e autônomo;
- níveis de raciocínio;
- estilos de resposta;
- seleção/fallback entre providers;
- OpenAI, Anthropic, Gemini, Mistral e regras Altum previstos na configuração;
- limite de uso e orçamento;
- logs de decisão;
- confiança;
- extração de campos;
- próxima ação;
- intenção e estado da conversa;
- recomendação de oferta;
- identificação de objeção;
- temperatura comercial;
- score de qualidade e latência;
- cenários de teste antes de liberar comportamento.

### Valor para comunicação
A IA pode ser apresentada como uma camada operacional com contexto, regras, observabilidade e handoff — não como um chatbot genérico.

### Página pública recomendada
`/ia`

---

## 4. Base de conhecimento — implementada
### Evidências funcionais
- documentos do tipo FAQ, catálogo e política;
- tags;
- edição e exclusão;
- vínculo com logs da IA;
- acompanhamento de documentos usados/não usados nas decisões.

### Valor para comunicação
A IA pode responder com conhecimento próprio de cada empresa e há rastreabilidade de quais conteúdos sustentaram decisões.

### Página pública recomendada
Incorporar em `/ia` e futuramente `/base-de-conhecimento` se houver demanda de busca suficiente.

---

## 5. Pipeline comercial — implementado
### Evidências funcionais
- etapas customizáveis;
- nomes, descrições e cores;
- SLA por etapa;
- janela de follow-up por etapa;
- responsável por etapa;
- leads distribuídos em colunas;
- valor total, score e idade média;
- resumo de abertos, ganhos e perdidos;
- valor de oportunidades e win rate.

### Valor para comunicação
A Altum organiza não apenas contatos, mas o processo de venda e a disciplina operacional por etapa.

### Página pública recomendada
`/pipeline-de-vendas`

---

## 6. Follow-ups — implementado
### Evidências funcionais
- tarefas de follow-up ligadas ao lead;
- pendente/concluído;
- atrasado e vencendo hoje;
- prioridade;
- tipo: ligação, reunião, proposta, pendência e follow-up;
- filtros por responsável, status, tipo e prioridade;
- sinais de IA usados no contexto operacional.

### Valor para comunicação
Mensagem principal: menos oportunidades esquecidas e processo comercial com próxima ação clara.

### Página pública recomendada
`/follow-up-de-vendas`

---

## 7. Automações — implementadas
### Gatilhos verificados
- lead criado;
- mudança de etapa;
- mensagem recebida;
- aguardando resposta;
- próxima ação indicada pela IA;
- proposta/orçamento aprovado;
- pagamento confirmado.

### Ações verificadas
- criar tarefa;
- adicionar nota;
- adicionar tag;
- alterar prioridade;
- enviar mensagem;
- esperas e sequenciamento.

### Operação
- ativa/pausada;
- condições por etapa, origem, canal, score e sinais da IA;
- histórico de execuções;
- fila, retry e dead-letter;
- templates de automação para lead quente, recuperação de conversa, pós-proposta, copiloto da IA e pós-pagamento.

### Valor para comunicação
Automação ligada a eventos reais da venda, e não somente sequência de mensagens.

### Página pública recomendada
`/automacoes-de-vendas`

---

## 8. Campanhas outbound — implementado inicialmente para WhatsApp
### Evidências funcionais
- criar campanha;
- rascunho, ativa e pausada;
- template de mensagem;
- limite de destinatários;
- filtros por pipeline, responsável, origem, tags e temperatura;
- execuções com enviados, ignorados e falhas.

### Limite atual importante
O código do portal define o canal da campanha como `whatsapp`. Não vender como campanhas omnichannel ainda.

### Problema técnico encontrado
Há texto com encoding quebrado em um template padrão (`Ã©`, `vocÃª`), que deve ser corrigido antes de usar a tela em demonstrações públicas.

### Página pública recomendada
Inicialmente usar dentro de `/whatsapp` ou `/campanhas-no-whatsapp`, sem prometer canais não verificados.

---

## 9. Agenda — implementada; integração externa parcial
### Evidências funcionais
- agendamentos ligados ou não a leads;
- responsável;
- tipo;
- status;
- início e fim;
- localização;
- URL de reunião;
- notas;
- métricas de hoje, próximos e concluídos.

### Integração
Existe adapter inicial de Google Calendar no CRM, mas o próprio produto sinaliza estado `not_configured` ou `ready`. Tratar integração Google Calendar como recurso em evolução até validar sincronização ponta a ponta.

### Página pública recomendada
Pode ficar inicialmente dentro de CRM/automação. Página própria apenas se houver intenção de busca ou profundidade suficiente.

---

## 10. Captação — implementada
### Evidências funcionais
- criação de formulários;
- campos customizados;
- obrigatoriedade de telefone/email;
- empresa e mensagem;
- campos condicionais;
- origem;
- etapa padrão do pipeline;
- responsável padrão;
- tags;
- formulário ativo/inativo/rascunho;
- mensagem de sucesso;
- launcher de widget;
- configuração de landing page;
- métricas, depoimentos e FAQ na landing;
- submissões recentes;
- performance por formulário;
- fontes e campanhas principais.

### Valor para comunicação
A Altum consegue captar e levar o lead diretamente para o CRM/pipeline, reduzindo a ruptura entre página, formulário e comercial.

### Página pública recomendada
`/captacao-de-leads`

---

## 11. Métricas — implementadas
### Evidências funcionais
- taxa de conversão;
- tempo médio de primeira resposta;
- ROI e crescimento;
- conversas e handoffs;
- leads ganhos e totais;
- receita paga;
- impressões, cliques, gasto, leads, CTR, CPC e CPL;
- funil;
- desempenho por canal;
- decisões e confiança da IA;
- latência;
- chats ativos, atrasados e sem responsável;
- performance de equipe;
- comparação entre janelas;
- sinais de saúde operacional.

### Canais reconhecidos no produto
- WhatsApp;
- Instagram;
- Facebook/Messenger;
- Google Ads;
- Meta Ads;
- site, chat do site e formulário.

### Cuidado de comunicação
A presença de um canal nos modelos/métricas não prova que toda integração está pronta para qualquer cliente. Validar conectores individualmente antes de transformar cada um em claim comercial.

### Página pública recomendada
`/metricas-de-vendas` ou seção forte dentro de `/plataforma`.

---

# Componentes que NÃO devem ser vendidos como produto final sem validação

## Google Calendar
Adapter e estados de configuração aparecem no CRM, mas validar sincronização ponta a ponta.

## Meta Ads / Google Ads / TikTok Ads / LinkedIn Ads
Existe blueprint e estrutura de campanhas/métricas em partes do projeto. Separar claramente o que está operacional do que é roadmap de conectores.

## Portal financeiro/contratos/entregas de agência
O documento `CLIENT_PORTAL_AND_AI_BLUEPRINT.md` descreve parte disso como arquitetura/roadmap. Não misturar com funcionalidades comprovadas do SaaS até checarmos implementação atual.

---

# Nova narrativa recomendada para o site

## Categoria
Plataforma de vendas e relacionamento com IA.

## Promessa de produto
Centralizar a jornada comercial em uma única operação: captar, atender, organizar, qualificar, acompanhar, automatizar, recuperar e medir.

## Fluxo visual principal
Captação → Inbox → IA → CRM → Pipeline → Follow-up/Automação → Agenda/Vendedor → Venda → Campanha/Reativação → Métricas.

## Páginas prioritárias para a nova arquitetura
1. `/` — home e visão geral;
2. `/plataforma` — visão completa do produto;
3. `/crm`;
4. `/inbox`;
5. `/ia`;
6. `/automacoes-de-vendas`;
7. `/pipeline-de-vendas`;
8. `/follow-up-de-vendas`;
9. `/captacao-de-leads`;
10. `/metricas-de-vendas`;
11. `/ia-no-whatsapp`;
12. `/automacao-com-ia`;
13. `/chatbot-para-empresas`;
14. `/integracoes`;
15. `/segmentos`;
16. `/solucoes`;
17. `/cases`;
18. `/blog`.

## Próximo passo do inventário
Auditar integrações e APIs por canal, validar quais claims podem ser usados hoje e mapear cada módulo para palavras-chave reais, conteúdo e telas que serão usadas na nova home.
