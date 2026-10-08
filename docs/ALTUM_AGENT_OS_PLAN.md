# Altum Agent OS — plano mestre de construção

## Resultado que vamos construir

A Altum deixa de ser apenas um painel com recursos de IA e passa a operar como um **sistema de trabalho supervisionado por metas**. Uma missão combina objetivo, empresa, orçamento, prazo, limites e ferramentas permitidas. O sistema planeja, executa tarefas, pede aprovação para ações de risco, registra evidências, mede resultado e aprende para a próxima execução.

O produto não depende de um provedor, modelo ou ferramenta. A Altum escolhe recursos por capacidade, custo, qualidade, privacidade e permissão.

```text
Missão → plano → tarefas/agentes → ferramentas/modelos → execução
       → aprovação quando exigida → evidências e métricas → avaliação → replanejamento
```

## Princípios permanentes

1. **Meta antes de prompt.** O usuário dá um resultado desejado; prompts são implementação interna.
2. **Autonomia com limites.** Ações reversíveis e de baixo risco podem ser automáticas. Comunicação externa, dinheiro, publicação, credenciais, exclusão e compromissos exigem política e, por padrão, aprovação.
3. **Capacidade antes de fornecedor.** Agentes pedem `GENERATE_IMAGE`, `WEB_RESEARCH` ou `CRM_WRITE`; o roteador escolhe o recurso.
4. **Tenant isolado.** Toda entidade operacional possui `tenantId`, autor, rastreabilidade e regras de acesso.
5. **Custo observável.** Nenhuma tarefa executa sem orçamento, limite e registro de consumo.
6. **Evidência antes de conclusão.** Resultado, fonte, saída e alteração ficam ligados à tarefa que os produziu.
7. **Humano no ponto de não retorno.** O produto nunca representa um usuário, contrata, envia campanha ampla, publica, exclui ou movimenta verba sem regra explícita e aprovação aplicável.

## Módulos do produto

### 0. Comando Altum — interface principal

O produto terá uma experiência conversacional permanente, semelhante a este chat. O usuário escreve em linguagem natural, anexa arquivos e escolhe, quando necessário, a empresa/contexto. O Comando Altum entende intenção, faz perguntas curtas somente quando faltar algo material e então:

- responde e pesquisa quando o pedido é informativo;
- cria uma missão quando o pedido envolve trabalho de longo prazo;
- cria rascunhos quando a ação pode afetar clientes, dinheiro, publicação ou sistemas externos;
- mostra plano, agentes, ferramentas, custo estimado, evidências e progresso de forma legível;
- pede aprovação no próprio chat antes de ações relevantes;
- continua a missão em segundo plano e avisa somente em mudança significativa, conclusão, falha ou necessidade de decisão.

Exemplos de comandos: "encontre 20 empresas de marcenaria e prepare abordagens", "crie a campanha de lançamento deste produto", "analise os resultados do mês e diga onde estamos perdendo vendas", "monte um produto digital para este nicho" e "faça um vídeo de anúncio usando a marca da Clínica X".

O chat não substitui as telas especializadas: ele é a porta de entrada. Mission Control, CRM, Creative Studio, relatórios e aprovações oferecem visão, edição e auditoria quando o usuário precisa aprofundar.

### 1. Mission Control — coordenação e auditoria

Central de missões: objetivo, prazo, orçamento, empresa, status, risco, próximo passo, progresso, receita/pipeline atribuídos e aprovações pendentes.

Primeira missão padrão: **Revenue Agent da Altum** — pesquisar, qualificar, preparar abordagem, registrar CRM, sugerir follow-up e gerar reuniões; sem envio externo automático na primeira versão.

### 2. Runtime de tarefas e agentes

Planner cria um grafo de tarefas. Cada tarefa tem entrada, saída esperada, agente responsável, ferramentas permitidas, política, tentativas, checkpoint e evidências. O runtime precisa pausar, retomar, replanejar, cancelar e recuperar falhas.

Agentes iniciais: Manager, Research, Revenue/SDR, Creative, Content, Ads, Analyst, CRM, Developer e Finance/ROI. Eles são perfis e skills reutilizáveis, não microserviços separados no início.

### 3. Registro de capacidades e Tool Hub

Catálogo de capacidades: texto, raciocínio, pesquisa web, browser assistido, código, e-mail, WhatsApp, CRM, anúncios, imagem, vídeo, voz, transcrição, documentos, planilhas, deploy e analytics.

Cada provider declara suporte, limites, preço, saúde, credenciais, política de dados e status. Tool Connections ligam ferramentas à Altum ou a um tenant, com escopo mínimo e health check.

### 4. AI/Model Router

Política própria da Altum decide por tarefa: modelo local/free, NVIDIA NIM, OpenRouter, Grok, Gemini, OpenAI, Anthropic ou outro endpoint compatível. LiteLLM pode ser o gateway de produção; FreeLLMAPI é laboratório pessoal, nunca dependência crítica multi-tenant.

O roteador usa: capacidade, risco, dados enviados, orçamento restante, qualidade mínima, latência, quota e fallback. OpenJev/modelos pequenos podem resolver classificação, score e roteamento de baixo risco.

### 5. Credential Vault e permissões

Usar a criptografia existente como base, mas armazenar conexões separadas de configurações comuns. Nenhuma tela retorna segredo. Credenciais têm owner, tenant, escopo, data de expiração, rotação, health e log de uso.

### 6. Approval Center e políticas

Políticas por tenant, missão, agente e ferramenta. Estados: `draft`, `pending_approval`, `approved`, `rejected`, `executing`, `completed`, `failed`, `cancelled`.

Exigem aprovação: comunicação externa, publicação, criação/alteração de Ads, gastos, descontos, contratos, exclusões, mudanças de acesso, browser com login e ações irreversíveis.

### 7. Memória, conhecimento e aprendizagem

Memória de trabalho da missão, memória de tarefa, perfil de empresa, conhecimento aprovado, resultados de experiências e padrões agregados por nicho. O agente aprende apenas com resultados rastreáveis; nunca mistura dados privados entre tenants.

### 8. Brand Hub

Perfil de marca por empresa: proposta de valor, público, tom, ofertas, produtos, provas, concorrentes, cores, fontes, assets, CTAs, canais e restrições. É fonte única para agentes comerciais e criativos.

### 9. Asset Factory / Creative Studio

Projetos criativos para imagem, carrossel, copy, roteiro, UGC, vídeo, áudio, anúncio, landing page e packs de conteúdo. Cada output tem briefing, brand kit, origem, custo, versão, direitos/referências, aprovação e métricas.

Imagem: ComfyUI/modelos locais e APIs. Vídeo econômico: Remotion + FFmpeg + templates. Vídeo generativo/voz: providers intercambiáveis. A IA gera estrutura e conteúdo; templates garantem consistência e edição.

#### Avatar Studio — clone autorizado

Um avatar não é um prompt nem uma identidade genérica. É um perfil privado com consentimento explícito e auditável para imagem e voz, usos permitidos, restrições e regra de identificação de conteúdo sintético. Referências visuais, amostras de voz e vídeos de movimento ficam em storage privado; nunca são distribuídos para um provider sem uma conexão aprovada. O fluxo é: perfil autorizado → referências privadas → âncora visual e de voz aprovada → roteiro/cena → render rascunho → revisão → publicação aprovada. A qualidade é validada primeiro em retrato, expressão e voz, antes de produzir vídeos longos ou criativos em escala.

### 10. Content Planner e Social Media OS

Ideias, calendário editorial, aprovação, agendamento, variações por canal, publicação assistida, comentários/DMs autorizados e análise. Conteúdo que performa gera novas hipóteses e templates.

### 11. Growth e Campaign Center

Leitura de Meta, Google, GA4, Search Console, Shopify e CRM. Detecção de queda de CTR, fadiga criativa, CPA/ROAS e lacunas de funil. Agente cria recomendações e rascunhos; alterações de verba, público ou publicação passam por aprovação.

### 12. Revenue OS

Prospecção, enriquecimento permitido, score, CRM, sequência aprovada, follow-up, qualificação, proposta, agenda, onboarding e atribuição de receita. A própria Altum é o primeiro caso de uso.

### 13. Product Factory e Developer Agent

Pesquisa de oportunidade, validação, oferta, identidade mínima, landing page, materiais, analytics, checkout e experimento. Deploy, pagamentos e publicação são sempre ações aprovadas. Sandbox isolado para código e automações.

### 14. Reports, economia e observabilidade

Relatórios por missão/tenant: custo de modelos, ferramentas, mídia e infraestrutura; tempo; falhas; resultados; pipeline e receita atribuída. Logs, traces, evidências, alertas, retries, dead letters e auditoria.

### 15. Integrações e browser assistido

API/OAuth/MCP primeiro; n8n para workflows determinísticos; browser somente como último recurso e dentro de termos, sessão autorizada e política explícita. CAPTCHA, login, representação e confirmações sensíveis param e solicitam intervenção humana.

## Modelo de dados inicial

| Coleção | Finalidade |
|---|---|
| `agent_missions` | Meta, contexto, orçamento, status, política e resultados. |
| `agent_tasks` | Grafo de execução, dependências, entradas, saídas e tentativas. |
| `agent_runs` | Execuções, modelos, ferramentas, custo, trace e evidência. |
| `agent_approvals` | Ações que aguardam decisão humana. |
| `agent_profiles` | Papéis, skills, instruções e limites dos agentes. |
| `agent_skills` | Procedimentos reutilizáveis e versionados. |
| `tool_providers` | Catálogo global de providers e capacidades. |
| `tool_connections` | Conexões/credenciais criptografadas e escopadas. |
| `brand_profiles` / `brand_assets` | Contexto de marca e ativos aprovados. |
| `creative_projects` / `creative_jobs` / `creative_outputs` / `creative_assets` | Produção criativa, versões e mídias entregues. |
| `avatar_profiles` / `avatar_profiles/{id}/references` | Perfis de clone consentidos e referências privadas de imagem, voz e movimento. |
| `content_plans` / `content_items` | Calendário, aprovação e publicação. |
| `agent_memories` / `agent_experiments` | Aprendizado rastreável e isolado por tenant. |

## Fases e ordem de entrega

### Fase 0 — fundação segura

- Contratos de domínio e Mission Control.
- Comando Altum inicial: interpretar pedidos, apresentar plano e criar missão em vez de exigir formulários técnicos.
- Runtime de tarefas manual/estruturado, sem execução autônoma externa.
- Orçamento, logs, aprovação, auditoria e isolamento por tenant.
- Registro de capacidades e providers em modo catálogo.

### Fase 1 — Creative Engine (prioridade atual)

- Brand Hub, Creative Studio e biblioteca de outputs.
- Copy, imagem, carrossel, vídeo por template, áudio, roteiro e landing page rascunho.
- Jobs rastreáveis por formato, provedor, custo, versão, direitos/referências e aprovação.
- Primeiro executor conectado para imagem e vídeo; avatar somente com consentimento verificável.

### Fase 2 — primeira máquina de receita

- Revenue Agent da Altum: pesquisa, score, dossiê, CRM e sugestão de abordagem.
- Aprovação humana antes de qualquer envio.
- Métricas de reunião, pipeline e custo por oportunidade.

### Fase 3 — contexto operacional

- Brand Hub e Asset Factory.
- Copy, imagem, carrossel, vídeo por template, landing page rascunho.
- Biblioteca de outputs, aprovação e aprendizagem por desempenho.

### Fase 4 — growth operacional

- Content Planner, Campaign Center, Reports e Marketing Manager.
- Integrações oficiais, recomendações, experimentos e ações em rascunho.

### Fase 5 — extensão geral supervisionada

- Product Factory, Developer Agent, sandbox, browser assistido e catálogo de skills.
- Opportunity Agent somente após métricas e limites comprovados nas fases anteriores.

## Fundação implementada neste ciclo

1. Comando Altum em `/admin/comando`, com conversa persistente por administrador, contexto de empresa e criação supervisionada de missão por linguagem natural.
2. Mission Control em `/admin/missoes`: criação, início, pausa, avanço de etapas, cancelamento, progresso e próxima etapa visível.
3. Approval Center em `/admin/aprovacoes`: checkpoint de alto risco e decisão auditada que libera ou pausa a missão.
4. Políticas por empresa em `/admin/politicas`: comunicação externa, publicação, gastos, exclusões e navegador autenticado são travas permanentes; a revisão de alterações internas de CRM é configurável.
5. Tool Hub e Conexões: catálogo de capacidades/providers e cofre de conexões com segredo criptografado e nunca retornado à interface.
6. Entidades novas bloqueadas para acesso direto pelo cliente em Firestore; apenas handlers autenticados de administração podem operá-las nesta fase.
7. Sem credenciais inseridas, automação externa, browser, publicação ou envio de mensagens automático nesta etapa.
8. Creative Studio cria rascunhos e jobs de geração com conexão de mídia, aprovação auditável e estado rastreável. O executor de cada provedor ainda é habilitado separadamente, depois de a conexão e suas credenciais serem configuradas.
9. A Central FreeLLMAPI foi instalada como runtime local e ganhou uma ponte segura para o Comando Altum: depois de conectada pelo cofre, ela recebe a conversa, escolhe automaticamente um modelo disponível e devolve à Altum somente a resposta e a rota usada. O histórico recente da conversa também é levado para a resposta, sem expor chaves.

## Critérios para avançar de fase

- Toda ação tem tenant, autor, política e log.
- Nenhuma chave é exposta ao cliente ou ao navegador.
- Toda execução tem limite de custo e resultado observável.
- Ações externas passam por aprovação verificável.
- Falhas são recuperáveis ou chegam a uma fila de exceção clara.
- Um fluxo prova resultado de receita antes de ampliar o número de agentes.
