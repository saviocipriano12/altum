# Missão modular de conclusão da Altum

## Regra de execução

A Altum só avança para o próximo módulo quando o anterior tiver evidência de conclusão ponta a ponta: ação iniciada pelo usuário, execução real, persistência, progresso/erro compreensível, recuperação, resultado reutilizável e testes proporcionais. Uma interface, mock, documento ou teste unitário isolado não encerra um módulo.

Cada módulo preserva rotas e funções legadas. Antes de construir integração, agente ou executor novo, adotar SDK/repositório oficial ou uma base open source já validada, respeitar contrato e licença, executar teste real e somente então adaptar a UX da Altum.

## Módulo 1 — Estúdio de mídia e identidade

**Objetivo:** gerar imagem, vídeo, áudio, avatar e composição de ponta a ponta pelo Comando, usando roteamento real, workers e biblioteca privada.

**Documento de execução:** `docs/MODULO_01_MIDIA_EXECUCAO.md`.

**Só termina quando:** imagem, vídeo, fallback, escolha manual, identidade autorizada, worker VPS e MCP de mídia tiverem evidência real de ponta a ponta.

---

## Módulo 2 — Comando, orquestrador e memória durável

**Objetivo:** transformar o Comando na casa principal do usuário: conversa natural, contexto persistente, planejamento, missões e entregas sem exigir navegação por ferramentas.

### Entregas

- Histórico de conversas, projetos, arquivos, resultados e ideias em todos os dispositivos.
- Memória explícita de marca, preferências, decisões, pessoas, empresas, campanhas e aprendizados; possibilidade de consultar, corrigir, esquecer e limitar memória.
- Orquestrador que interpreta intenção, separa plano em tarefas, dependências, agentes e pontos de decisão.
- Missões longas com estado, responsáveis/agentes, progresso, logs humanos, retomada, cancelamento e resumo automático.
- Aprovações dentro da mensagem que originou a ação; sem obrigar o usuário a abrir uma página de aprovação.
- Contexto lateral útil: arquivos, identidade ativa, missão atual, entregas e custo; detalhes técnicos escondidos por padrão.
- Busca global por conversa, arquivo, ativo, missão, cliente, decisão e ideia.
- Experiência responsiva de desktop e celular no mesmo modelo de conversa.

### Provas de conclusão

1. Uma missão com múltiplas tarefas continua após fechar sessão, reiniciar worker e retomar conversa.
2. O usuário consegue pedir, alterar prioridade, cancelar e retomar uma missão somente pelo chat.
3. A Altum usa memória autorizada em nova conversa e mostra a origem quando a decisão depender dela.
4. Uma decisão aprovada/falha chega de volta à conversa com próximo passo compreensível.

---

## Módulo 3 — Roteador universal de modelos e ferramentas

**Objetivo:** qualquer capacidade conectada — texto, pesquisa, código, imagem, vídeo, áudio, documentos e ação — ser escolhida por capacidade real, qualidade, custo, privacidade, saúde e disponibilidade.

### Entregas

- Catálogo unificado de conexões, modelos, capacidades, limites, preços conhecidos, saúde e contratos.
- Descoberta segura de modelos quando o provider oferecer catálogo; modelo manual quando não oferecer.
- Estratégias por objetivo: rápido/econômico, equilibrado, alta qualidade, privado/local e manual.
- Fallback por provider e por modelo; cooldown, retries, quotas, rate limit, timeout e circuit breaker.
- Medição de custo, token, duração, falha e qualidade por missão/ativo, sem expor credenciais.
- Um contrato de executor para providers oficiais, FreeLLMAPI, NVIDIA/NIM, Alibaba, OpenRouter, Groq, modelos locais e futuras APIs.
- Interface simples no chat: a Altum decide; usuário pode dizer “usar X” ou fixar preferência por projeto.
- Painel avançado somente para configurar conexões, limites, alertas e testes reais.

### Provas de conclusão

1. Cada modalidade usa somente provider com contrato certificado.
2. Uma quota/erro de provider causa fallback real e registra a rota efetiva.
3. Preferência manual é respeitada sem destruir fallback seguro.
4. Custo/uso e saúde de cada conexão podem ser auditados sem revelar segredo.

---

## Módulo 4 — Skills, agentes, OpenClaw e execução extensível

**Objetivo:** a Altum ter um exército extensível de especialistas, sem fazer o usuário escolher ferramentas manualmente.

### Entregas

- Registro de skills com origem, licença, versão, permissões, entradas, saídas e testes.
- Agentes especialistas: pesquisa, estratégia, copy, design, vídeo, vendas, tráfego, analista, produto e desenvolvimento.
- Criação de agente/tarefa especializada quando não existir skill adequada, sempre dentro de políticas e limites.
- Runtime OpenClaw/alternativo como executor isolado de missões, não como dono de dados/UX da Altum.
- Eventos assinados de progresso, cancelamento, resultado e erro entre Altum e runtime.
- Sandboxing, limites de tempo/custo, allowlist de ferramentas e bloqueio de ações externas sem autorização.
- Avaliação de qualidade e rastreabilidade: qual skill, modelo, agente e fonte contribuíram para a entrega.

### Provas de conclusão

1. Uma missão complexa é dividida entre pelo menos dois agentes e volta consolidada ao Comando.
2. Falha de agente pode ser retomada sem duplicar ações ou perder evidências.
3. Skill instalada é escolhida automaticamente quando apropriada e não acessa dados fora de sua permissão.

---

## Módulo 5 — Pesquisa, documentos, conhecimento e análise

**Objetivo:** a Altum ler, pesquisar, organizar e responder com base em informação verificável do usuário e da web.

### Entregas

- Pesquisa web com fontes, data, resumo e distinção entre fato, inferência e opinião.
- Ingestão privada de PDF, DOCX, PPTX, XLSX, áudio, vídeo, imagem e links.
- OCR, estrutura de tabelas, transcrição, diarização, timestamps e busca semântica usando workers adequados (Docling/AnyDoc, WhisperX ou equivalentes validados).
- Base de conhecimento versionada por empresa/projeto, permissões, expiração, exclusão e origem.
- Resumos, comparações, extrações e relatórios reutilizáveis no Comando.
- RAG com citações de trecho/origem e defesa contra instruções maliciosas dentro de documentos.

### Provas de conclusão

1. Um PDF e uma reunião gravada viram conhecimento pesquisável com fontes e permissões corretas.
2. Pergunta no chat responde com trechos/origens, sem inventar conteúdo ausente.
3. Exclusão/revogação de arquivo remove o acesso da memória e da busca.

---

## Módulo 6 — Product Factory e campanhas completas

**Objetivo:** pedido de uma oferta/campanha virar estratégia e ativos reais prontos para revisão, publicação e medição.

### Entregas

- Diagnóstico de público, oferta, posicionamento, concorrência, promessa e funil.
- Estratégia de campanha e matriz de ângulos, copies, criativos, vídeos, carrosséis e calendário.
- Landing pages, formulários, ebooks, produtos digitais, capas, apresentações, checkout e materiais de venda como arquivos/sites reais.
- Vinculação de todo ativo à marca, identidade, campanha, versão, público e objetivo.
- Fluxo de revisão e publicação conversacional.
- Experimentos, variações, métricas, aprendizado e recomendação de próxima versão.

### Provas de conclusão

1. “Lance a oferta X” gera campanha revisável com landing, captura e ativos reais.
2. Leads da landing aparecem no CRM com origem da campanha.
3. Métricas de campanha produzem recomendação explicável de melhoria.

---

## Módulo 7 — Operação comercial, CRM e atendimento com IA

**Objetivo:** fortalecer as áreas legadas de Empresas, Conversas, CRM, Funil, Agenda, Produtos, Propostas, Financeiro e Relatórios, fazendo-as operáveis pela Altum.

### Entregas

- Conversas omnicanal, inbox, WhatsApp, anexos, atribuição, SLA, handoff e histórico de cliente.
- Clientes, oportunidades, etapas, score, tarefas, follow-ups, agenda e propostas conectados entre si.
- IA comercial que pesquisa contexto, prepara resposta, classifica intenção, sugere próximo passo e respeita guardrails.
- Produtos/serviços, catálogo, preço, objeções, condições e materiais usados pelas respostas e propostas.
- Financeiro, contratos, cobrança e indicadores sem confundir dados sensíveis com automação de venda.
- Relatórios acionáveis de operação, funil, conversão, canal, campanha e receita.
- Tudo editável via chat e pelas áreas legadas aprimoradas; nenhuma rota antiga quebrada.

### Provas de conclusão

1. Lead entra por canal, vira conversa, oportunidade, tarefa e próximo passo sem perda de contexto.
2. A Altum prepara e, quando autorizada, executa follow-up/ação comercial com auditoria.
3. Gestor enxerga resultado e atendente vê somente a interface necessária ao trabalho diário.

---

## Módulo 8 — Browser supervisionado e integrações externas

**Objetivo:** permitir que a Altum trabalhe em ferramentas externas com segurança, evidência e controle humano.

### Entregas

- Integrações oficiais para CRM, e-mail, WhatsApp, calendário, anúncios, analytics, e-commerce e pagamentos quando API disponível.
- Browser-use/runtime isolado para sites sem API, com sessão separada e registros de evidência.
- Allowlist de domínios, stop-points obrigatórios em login, CAPTCHA, publicação, mensagem, pagamento, exclusão e alteração de produção.
- Plano no chat antes da ação, screenshots/registro durante execução e resultado ao final.
- Webhooks, sincronização, idempotência, retries e resolução de conflito para integrações.

### Provas de conclusão

1. A Altum executa uma tarefa externa supervisionada, mostra evidência e para no ponto de confirmação correto.
2. Integração caída entra em retry e não duplica ação remota.
3. Nenhuma sessão, senha ou token é exposto no chat, log ou MCP.

---

## Módulo 9 — MCP público, permissões e interoperabilidade

**Objetivo:** ChatGPT e outros clientes MCP autorizados poderem usar a Altum como conjunto real de ferramentas, sem expor dados ou credenciais indevidas.

### Entregas

- OAuth compatível, escopos completos e reautorização clara.
- Catálogo de ferramentas baseado em capacidades reais, não placeholders.
- Ferramentas para mídia, missões, conhecimento, campanhas, CRM, agenda e integrações, respeitando tenant e política.
- Ações de alto impacto com confirmação contextual, não bloqueio em páginas desconectadas.
- Auditoria, revogação, expiração, least privilege e testes de isolamento entre tenants.
- Resultados retornam para o ChatGPT e permanecem na Altum quando apropriado.

### Provas de conclusão

1. Novo OAuth recebe escopos completos e ferramentas corretas.
2. ChatGPT cria, acompanha e recebe um ativo real da Altum.
3. Tentativas sem escopo, token revogado ou tenant errado são bloqueadas.

---

## Módulo 10 — Produto, UX, segurança e operação de produção

**Objetivo:** transformar as capacidades concluídas em um produto coerente, seguro, observável e agradável de usar.

### Entregas

- Comando como experiência principal; configurações, conexões, skills, MCP, marca e políticas como segunda camada simples.
- Áreas legadas redesenhadas sem perder funções: foco em trabalho diário, não em dashboards técnicos.
- Design system consistente: tipografia clara, dark chat-first no Comando; SaaS comercial limpo nas áreas operacionais; estados vazios, carregamento, erro e sucesso úteis.
- Acessibilidade, responsividade, busca global, atalhos e desempenho.
- Observabilidade: health checks, fila, custo, latência, falhas, alertas, logs auditáveis e dashboards internos.
- Backups, recuperação, índices, rate limit, isolamento de tenant, rotação de segredo, LGPD, políticas de retenção e testes de restore.
- CI/CD, testes de contrato/E2E, staging, deploy, rollback e checklist de lançamento.

### Provas de conclusão

1. Fluxos dos módulos anteriores funcionam em produção e mobile sem páginas técnicas obrigatórias.
2. Erro de provider, worker, banco ou integração produz alerta, contexto e recuperação definida.
3. Auditoria de segurança, permissões, backup/restore e release gates aprovada antes de escalar.

## Definição final de “Altum pronta”

A Altum estará pronta quando uma pessoa puder dar uma ordem natural, a plataforma escolher e coordenar as capacidades necessárias, executar com serviços reais, preservar contexto e ativos, pedir autorização somente nos momentos materiais, entregar resultado reutilizável e continuar operando com segurança depois que o chat for fechado. Nenhum módulo será declarado pronto por aparência ou código não validado em ambiente real.
