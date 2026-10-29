# Missão de Execução — Altum Admin e Agência Autônoma

**Status:** plano mestre executável  
**Data:** 11 de outubro de 2026  
**Visão de referência:** `docs/ALTUM_ADMIN_PRODUCT_VISION.md`  
**Portfólio externo:** `docs/ALTUM_EXTERNAL_CAPABILITY_PORTFOLIO.md`  
**Auditoria ativa da Fase 0:** `docs/ALTUM_PHASE_0_AUDIT.md`  
**Escopo:** área admin, runtime de agentes e operação interna da agência Altum

## 1. Missão-mãe

Transformar a área admin da Altum no sistema operacional interno de uma agência de IA capaz de receber objetivos empresariais, planejar o trabalho, formar equipes de agentes especializados, executar tarefas digitais e na internet, produzir entregáveis, solicitar aprovações nos pontos de risco, medir resultados e aprender com a operação.

O produto final deve permitir que a Altum opere muitas empresas sem multiplicar a equipe humana na mesma proporção, mantendo isolamento entre clientes, qualidade, controle financeiro, segurança e rastreabilidade.

## 2. Resultado final esperado

Ao final desta missão, um administrador deverá ser capaz de:

1. selecionar uma empresa ou operar o tenant interno `ALTUM_AGENCY`;
2. descrever um objetivo em linguagem natural no Comando Altum;
3. receber diagnóstico, plano, orçamento, riscos, indicadores e entregáveis;
4. aprovar o plano ou ajustar suas restrições;
5. permitir que o sistema monte uma equipe de agentes adequada;
6. acompanhar tarefas, dependências, custos, evidências e bloqueios;
7. revisar e aprovar ações externas, gastos ou publicações;
8. receber ativos e resultados reais, não apenas textos simulados;
9. entregar os resultados aos módulos corretos da área do cliente;
10. comparar o resultado com a meta e iniciar a próxima iteração;
11. auditar integralmente quem solicitou, decidiu, executou e alterou cada ação.

## 3. Limite permanente de produto

### Permanece na área do cliente

- atendimento e conversas;
- SDR, closer e operação comercial cotidiana;
- CRM, clientes, oportunidades e funil;
- agenda, retornos e follow-ups;
- produtos, serviços e catálogo;
- propostas e atividades comerciais do cliente;
- campanhas e relatórios usados diariamente pelo cliente;
- configuração comercial do Assistente Altum.

### Pertence à área admin

- gestão multiempresa;
- onboarding e implantação;
- comando e supervisão da agência;
- catálogo e organização de agentes;
- missões, tarefas, execuções e automações;
- ferramentas, conexões, modelos e permissões;
- aprovações, risco, segurança e auditoria;
- produção criativa para clientes;
- custos, planos, margem e capacidade;
- saúde dos clientes, qualidade e incidentes;
- operação técnica e evolução da plataforma.

Se uma capacidade cotidiana já existe melhor na área do cliente, o admin deve abrir, supervisionar ou intervir nessa capacidade com escopo autorizado — não reconstruí-la.

## 4. Princípios obrigatórios de execução

1. **Resultado antes de quantidade:** provar um fluxo completo antes de criar dezenas de telas ou centenas de agentes.
2. **Vertical slices:** cada fase deve entregar algo utilizável da interface até a persistência, execução, evidência e teste.
3. **Autonomia progressiva:** começar em modo rascunho, depois aprovação obrigatória, aprovação por amostragem e somente então autonomia limitada.
4. **Multiempresa desde a origem:** todo dado, job, memória, conexão e evidência deve possuir escopo explícito de tenant.
5. **Ações reais são tipadas:** agentes só agem por ferramentas registradas com schema, identidade, escopo, timeout e política.
6. **Execução durável:** missões longas sobrevivem a reinício, falha temporária e novo deploy.
7. **Idempotência:** repetir uma tarefa não pode duplicar cobrança, mensagem, publicação ou ativo.
8. **Humano nos pontos de risco:** gastos, publicação, contato externo, exclusão e mudanças sensíveis exigem política e aprovação.
9. **Evidência, não promessa:** toda conclusão deve apontar para artefato, fonte, evento ou efeito verificável.
10. **Segurança por padrão:** menor privilégio, credenciais fora de prompts, isolamento de execução e proteção contra prompt injection externa.
11. **Compatibilidade:** não quebrar rotas atuais, dados existentes ou fluxos do cliente.
12. **Adotar antes de reconstruir:** quando um repositório já entrega a capacidade necessária, a primeira opção é executar e validar o projeto original, preservando sua arquitetura e seus testes; só depois integrar e adaptar.
13. **Adoção governada:** nenhuma dependência é levada ao núcleo da Altum sem revisão de licença, segurança, maturidade, manutenção e aderência multiempresa.

## 5. Estado inicial que deve ser preservado

O repositório já possui componentes relevantes que devem ser auditados e evoluídos, não recriados sem necessidade:

- Comando Altum e conversas persistentes;
- missões, tarefas e estados básicos;
- aprovações e políticas;
- memória por empresa e conversa;
- registro de capacidades e provedores;
- conexões e verificações de saúde;
- roteamento de modelos;
- projetos, jobs e ativos criativos;
- workers de mídia e retomada de jobs;
- perfis e consentimento de avatar;
- MCP administrativo e MCP por tenant;
- testes de qualidade de IA, contratos e smoke tests;
- cockpit, prospecção, campanhas, clientes e operação administrativa existentes.

Esses itens são uma linha de base, não prova automática de prontidão produtiva. A Fase 0 determinará o que está realmente concluído, parcial, simulado ou sem integração.

## 6. Definição global de pronto

Uma capacidade só pode ser marcada como pronta quando possuir:

- caso de uso e usuário responsável claramente definidos;
- tela ou entrada compreensível para a equipe Altum;
- autorização e isolamento por tenant;
- persistência real e contrato validado;
- execução real ou rascunho explicitamente identificado;
- estados de carregamento, vazio, sucesso, falha, retry e cancelamento;
- custo e efeitos externos registrados quando aplicável;
- evidências e auditoria suficientes para reconstruir o ocorrido;
- política de aprovação proporcional ao risco;
- métricas operacionais e alertas mínimos;
- testes automatizados do contrato e do caminho crítico;
- verificação visual responsiva quando houver interface;
- documentação da operação e recuperação;
- `lint`, `typecheck`, testes relevantes e `build` aprovados.

Uma fase não termina com “a tela existe”. Ela termina quando o fluxo correspondente funciona de ponta a ponta e seu critério de saída foi demonstrado.

## 7. Estratégia de entrega

### Unidade de execução

Cada fase será dividida em lotes revisáveis. Um lote deve:

- ter um resultado observável;
- evitar alterações gigantes em muitos domínios ao mesmo tempo;
- incluir migração aditiva quando necessária;
- preservar compatibilidade;
- possuir verificação proporcional ao risco;
- atualizar este documento com evidências e pendências reais.

### Ordem dos ambientes

1. desenvolvimento local;
2. testes automatizados e emuladores;
3. tenant interno `ALTUM_AGENCY`;
4. cliente piloto com baixo risco;
5. rollout gradual para mais empresas;
6. autonomia progressiva somente após dados de qualidade.

### Regra de gate

Não iniciar a expansão ampla de uma fase se o fluxo crítico da fase anterior ainda possuir perda de dados, vazamento entre tenants, duplicação de ações externas, custos sem limite ou falhas sem recuperação.

### Estratégia padrão para projetos externos

O caminho padrão não será observar um repositório e reconstruí-lo do zero. Será:

1. **Identificar:** confirmar o repositório canônico, versão, licença, mantenedor e capacidade que desejamos aproveitar.
2. **Executar original:** subir o projeto sem modificações em ambiente isolado e reproduzir seus exemplos e testes oficiais.
3. **Validar:** confirmar que a capacidade funciona com dados controlados, medir requisitos, limitações, custo e riscos.
4. **Encapsular:** conectar o projeto à Altum por um adapter, worker, API, MCP ou processo separado, mantendo uma fronteira clara.
5. **Integrar:** adicionar tenant, autenticação, permissões, orçamento, aprovação, observabilidade e auditoria na camada Altum.
6. **Adaptar:** modificar somente depois que a versão original estiver funcionando e houver uma necessidade comprovada da Altum.
7. **Manter:** fixar versão ou commit, registrar alterações locais e definir como receber atualizações do upstream.

Sempre que possível, a Altum deve preservar o projeto externo como componente atualizável, em vez de espalhar cópias de seu código pela base. Um fork ou vendor só será usado quando for tecnicamente necessário e permitido pela licença.

Existem três formas preferenciais de adoção:

- **Conteúdo versionado:** agentes, skills, templates e SOPs importados com origem, licença, hash e revisão humana.
- **Serviço isolado:** runtimes, motores criativos e ferramentas executados separadamente e acessados por contrato estável.
- **Dependência direta:** biblioteca incorporada ao produto quando licença, segurança e acoplamento forem adequados.

A ordem de preferência para decidir entre elas é: menor risco jurídico, menor acoplamento, melhor possibilidade de atualizar e maior isolamento operacional.

## 8. Fases da missão

---

## Fase 0 — Auditoria, inventário e contrato de arquitetura

### Objetivo

Estabelecer a verdade do sistema atual e impedir que a nova arquitetura seja construída sobre telas simuladas, contratos duplicados ou funcionalidades incompletas.

### Entregas

- inventário de rotas, telas, coleções, jobs, workers, ferramentas e integrações do admin;
- mapa “real, parcial, mock, legado e duplicado”;
- mapa de dependências entre admin, runtime compartilhado e área do cliente;
- catálogo das coleções atuais e respectivos campos de tenant;
- decisão documentada sobre o motor de workflows duráveis;
- decisão sobre filas, scheduler, sandbox e armazenamento de evidências;
- matriz de riscos técnicos, jurídicos e operacionais;
- consolidação do portfólio completo de repositórios, removendo duplicatas e identificando upstreams canônicos;
- ficha de adoção e teste de contrato para cada componente da Onda 1;
- baseline executado de lint, tipos, build e testes;
- lista explícita de dívidas que bloqueiam as fases seguintes.

### Decisões obrigatórias

- evoluir o runtime próprio ou adotar um motor durável complementar;
- como tarefas serão reservadas, renovadas, retomadas e encerradas;
- como garantir idempotência de ações externas;
- onde armazenar eventos, evidências, custos e logs;
- como separar tenant, plataforma e tenant interno da Altum;
- quais rotas antigas serão mantidas por compatibilidade.

### Critério de saída

Existe um relatório verificável do estado atual, um diagrama do fluxo principal e nenhuma dúvida estrutural que obrigue a reescrever as fases 1 a 3.

---

## Fase 1 — Modelo canônico do Control Plane

### Objetivo

Criar contratos únicos para os objetos que sustentam toda a agência.

### Entregas

- schemas versionados para Empresa, Objetivo, Programa, Missão, Tarefa e Execução;
- schemas para Agente, Skill, Ferramenta, Conexão e Política;
- schemas para Aprovação, Artefato, Avaliação, Incidente, Memória e Auditoria;
- máquina de estados explícita para missões e tarefas;
- relações e índices necessários;
- validação de tenant em toda leitura e escrita;
- camada de compatibilidade para dados atuais;
- migrações aditivas e scripts de verificação;
- eventos de domínio versionados.

### Estados mínimos de tarefa

`draft → ready → claimed → running → waiting_approval → completed`

Saídas alternativas:

`paused`, `retry_scheduled`, `failed`, `cancelled`, `rejected`, `expired`.

### Critério de saída

Uma missão de teste pode ser criada, decomposta, executada por tarefas, pausada, retomada, aprovada e encerrada sem estados impossíveis ou perda de histórico.

---

## Fase 2 — Runtime durável de missões e tarefas

### Objetivo

Garantir que a agência continue trabalhando com segurança mesmo após falhas, reinícios e tarefas longas.

### Entregas

- fila durável e reserva atômica de tarefas;
- lease com renovação e recuperação de worker abandonado;
- retry exponencial com limite e classificação de falha;
- dead-letter queue e interface de recuperação;
- idempotency key para toda ação com efeito externo;
- heartbeat e timeout por execução;
- cancelamento cooperativo;
- dependências em DAG e execução paralela segura;
- scheduler para tarefas recorrentes;
- gravação de eventos, custo, evidências e progresso;
- replay operacional e reconciliação de estados;
- painel técnico em área avançada.

### Critério de saída

Uma missão de longa duração sobrevive a interrupção proposital do worker, retoma sem duplicar efeitos e termina com histórico, custos e evidências íntegros.

---

## Fase 3 — Segurança, conexões e execução governada

### Objetivo

Criar a fronteira segura entre raciocínio do agente e ações reais.

### Entregas

- registro de ferramentas com schemas de entrada e saída;
- classificação de leitura, escrita reversível, escrita sensível e ação irreversível;
- autorização por tenant, agente, capability e conexão;
- credenciais cifradas e nunca expostas ao contexto do modelo;
- verificação de saúde, expiração e escopos das conexões;
- limites de custo, volume, frequência e horário;
- políticas de aprovação por risco;
- botão de pausa global, por tenant, missão, agente e conexão;
- sandbox para código ou conteúdo não confiável;
- proteção contra instruções maliciosas vindas da web e de documentos;
- auditoria antes e depois de cada ação externa;
- testes negativos de autorização e isolamento.

### Critério de saída

Nenhum agente consegue executar uma ferramenta fora de seu tenant, capability, orçamento ou política; ações sensíveis bloqueiam corretamente e geram uma aprovação compreensível.

---

## Fase 4 — Catálogo de Agentes Altum

### Objetivo

Transformar o Agency Agents em uma biblioteca Altum pequena, governada e realmente executável.

### Fonte principal

`Ado77/agency-agents` será usado como referência de papéis, processos, entregáveis e métricas. Não será importado integralmente nem tratado como runtime.

O primeiro passo será executar o mecanismo original de instalação/sincronização do projeto em um ambiente de avaliação e importar seus arquivos preservando estrutura, proveniência e licença. A curadoria Altum acontecerá sobre essa cópia versionada já funcional, sem redigitar ou reinventar os agentes.

### Primeiro núcleo de agentes

1. Diretor de Estratégia;
2. Gestor de Conta;
3. Pesquisador de Mercado;
4. Estrategista de Growth;
5. Estrategista de Oferta;
6. Planejador de Campanha;
7. Copywriter;
8. Diretor Criativo;
9. Designer de Performance;
10. Produtor de Vídeo;
11. Especialista de Mídia Paga;
12. Especialista de SEO e GEO;
13. Desenvolvedor de Landing Pages;
14. Analista de Dados e Atribuição;
15. Revisor de Marca e Qualidade;
16. Agente de Risco e Conformidade;
17. Coordenador de Operações;
18. Analista Financeiro da Agência.

### Entregas

- processo de ingestão e revisão de fontes externas;
- licença e proveniência registradas por agente e skill;
- manifesto versionado por agente;
- missão, entradas, SOPs, entregáveis e indicadores;
- ferramentas e dados permitidos;
- orçamento, timeout e nível de autonomia;
- critérios de avaliação e promoção;
- fallback, escalada e rollback;
- equipe e organograma digital;
- interface de ativação, teste, versão e desativação;
- suíte de avaliação por papel.

### Critério de saída

Os 18 agentes possuem contrato válido, mas somente os necessários ao primeiro fluxo operacional são promovidos para produção após testes. Nenhum agente “especialista” é apenas um prompt sem ferramentas, métricas ou avaliação.

---

## Fase 5 — Comando Altum e orquestração orientada a objetivos

### Objetivo

Transformar pedidos em planos verificáveis e equipes executoras, sem expor complexidade técnica ao administrador.

### Entregas

- seleção obrigatória ou inferida de empresa;
- interpretação estruturada do objetivo;
- diagnóstico de contexto faltante;
- plano com tarefas, dependências, responsáveis e entregáveis;
- estimativa de custo, duração e risco;
- indicadores de sucesso e definição de pronto;
- seleção explicável de agentes, skills, ferramentas e modelos;
- aprovação do plano quando necessário;
- progresso em tempo real ou atualizações incrementais;
- pausa, correção, replanejamento e cancelamento;
- resumo final com resultados, evidências, custo e próximo passo;
- retomada da mesma missão em outra sessão sem perder contexto.

### Critério de saída

Um administrador cria pelo Comando uma missão completa, entende o plano, aprova o necessário, acompanha a execução e recebe um resultado verificável sem escolher manualmente modelos ou endpoints.

---

## Fase 6 — Primeiro fluxo completo da agência

### Objetivo

Provar uma agência funcional com um serviço concreto antes de ampliar o sistema.

### Serviço piloto recomendado

**Campanha de aquisição completa**, criada para o tenant interno `ALTUM_AGENCY` e depois aplicada a um cliente piloto.

### Fluxo obrigatório

1. diagnóstico de empresa, marca, oferta, público e meta;
2. pesquisa de mercado e concorrência com fontes;
3. hipótese de posicionamento e oferta;
4. plano de campanha e orçamento;
5. conceitos, copy e direção criativa;
6. landing page em rascunho;
7. criativos em formatos definidos;
8. configuração de mensuração;
9. revisão de marca, factualidade, risco e compliance;
10. aprovação humana;
11. entrega ou publicação autorizada;
12. leitura de resultados;
13. recomendação da próxima iteração.

### Entregas

- template de missão “Campanha de aquisição”;
- equipe digital mínima necessária;
- handoffs claros entre os agentes;
- pacote final de artefatos;
- custo previsto e realizado;
- relatório de qualidade e resultado;
- integração com os módulos de campanha e relatório da área do cliente;
- execução demonstrável com dados controlados.

### Critério de saída

A Altum conclui uma campanha de ponta a ponta com entregáveis reais, aprovações, evidências, custos e handoff para a área do cliente. Nenhuma etapa crítica depende de copiar manualmente contexto entre telas.

---

## Fase 7 — Estúdio criativo multimodal

### Objetivo

Construir uma fábrica de ativos de marketing integrada às missões da agência.

### Referência

O OpenMontage será primeiro executado sem modificações em ambiente isolado, usando seus próprios exemplos, pipelines e verificações. Depois de provarmos o funcionamento, a preferência é integrá-lo como serviço ou worker separado, por uma fronteira estável. Como usa AGPL-3.0, qualquer modificação, incorporação ou oferta em rede deve passar por decisão jurídica e arquitetural; copiar seu código para o núcleo proprietário não é o caminho padrão.

### Entregas

- briefing criativo estruturado;
- conceitos e variações versionadas;
- pipelines para imagem, carrossel, áudio e vídeo;
- roteiro, shot list e storyboard;
- seleção de provider por qualidade, custo, prazo e disponibilidade;
- previsão de custo antes de gerar;
- aprovação de conceitos e cenas antes do gasto alto;
- continuidade visual e identidade de marca;
- composição, legenda, áudio e renderização;
- QA técnico e criativo;
- biblioteca privada de ativos, versões e direitos de uso;
- reaproveitamento de um ativo em múltiplos formatos;
- entrega rastreável para campanhas do cliente.

### Critério de saída

Uma missão gera um pacote multimodal aprovado, com identidade consistente, custo registrado, versões recuperáveis e arquivos finais utilizáveis em campanha.

---

## Fase 8 — Execução na internet e ações externas

### Objetivo

Permitir que agentes pesquisem e operem sistemas externos com segurança e evidências.

### Entregas

- pesquisa web com fontes, data e trechos de evidência;
- browser isolado por tenant ou identidade operacional;
- allowlist de domínios e ações por ferramenta;
- proteção contra prompt injection e exfiltração;
- captura de estado antes e depois de ações relevantes;
- formulários e navegação com timeout e recuperação;
- publicação e alterações externas em modo rascunho/aprovação;
- detecção de login expirado, captcha e bloqueio humano;
- credenciais sem acesso direto pelo modelo;
- replay e auditoria das ações;
- testes com sites e contas de sandbox antes de produção.

### Critério de saída

Um agente conclui uma tarefa externa autorizada em ambiente controlado, registra evidências, não revela credenciais e não ultrapassa o escopo definido.

---

## Fase 9 — Empresa 360, onboarding e operação da carteira

### Objetivo

Dar à equipe Altum uma visão operacional completa de cada empresa sem duplicar seu workspace diário.

### Entregas

- lista de empresas com saúde, risco, plano e responsável;
- Empresa 360 com contexto, contrato, autonomia, integrações e histórico;
- onboarding configurável por segmento;
- coleta de marca, oferta, público, metas e restrições;
- prontidão de canais e conexões;
- missões, entregas, custos e resultados vinculados;
- pendências, incidentes e aprovações;
- acesso assistido à área do cliente com auditoria;
- score de saúde e próximas melhores ações;
- renovação, expansão e risco de churn.

### Critério de saída

Um gestor compreende a situação de qualquer cliente e consegue iniciar a ação correta em poucos minutos, sem consultar sistemas ou planilhas paralelas.

---

## Fase 10 — Qualidade, memória e aprendizado controlado

### Objetivo

Fazer a agência melhorar com resultados reais sem permitir aprendizado silencioso ou degradação não detectada.

### Entregas

- memória global, por tenant, missão e agente;
- fontes, validade, versão e política de retenção;
- resumos duráveis de decisões e resultados;
- avaliações automáticas e humanas por tipo de entrega;
- datasets de casos reais anonimizados quando permitido;
- baselines e regressão para agentes, skills e modelos;
- comparação A/B controlada;
- sinais de aceitação, retrabalho, falha e resultado empresarial;
- propostas de melhoria revisáveis;
- promoção, rollback e quarentena de versões;
- suporte técnico opcional ao Codebase Memory MCP após auditoria.

### Critério de saída

Uma mudança em agente, skill ou modelo só chega à produção após superar o baseline definido, e pode ser revertida sem perder histórico ou resultados anteriores.

---

## Fase 11 — Custos, margem, planos e capacidade

### Objetivo

Garantir que a empresa autônoma seja economicamente sustentável e previsível.

### Entregas

- custo por tenant, missão, tarefa, agente, modelo e ferramenta;
- orçamento reservado, consumido e restante;
- limites e alertas de anomalia;
- custo previsto versus realizado;
- receita, custo operacional e margem por cliente;
- planos, créditos, excedentes e bloqueios;
- previsão de capacidade de workers e equipe humana;
- estimativa antes de aprovar uma missão;
- painel executivo financeiro;
- exportação e conciliação.

### Critério de saída

Nenhuma missão consome recursos sem atribuição de custo e limite; a Altum consegue saber quais clientes, serviços e agentes geram ou destroem margem.

---

## Fase 12 — Consolidação da experiência admin

### Objetivo

Transformar as capacidades construídas em uma experiência clara, madura e operável.

### Navegação-alvo

- Início;
- Comando Altum;
- Empresas;
- Agência;
- Missões;
- Estúdio;
- Força de trabalho;
- Automações;
- Capacidades;
  - Agentes;
  - Skills;
  - Ferramentas;
  - MCPs;
  - Conexões;
  - Modelos e roteamento;
- Operação;
  - Implantações;
  - Escaladas;
  - Incidentes;
  - Jobs;
- Qualidade;
- Custos e planos;
- Equipe;
- Segurança;
- Configurações;
- Avançado.

### Entregas

- arquitetura de informação unificada;
- navegação e command palette com uma única fonte;
- remoção ou ocultação de telas duplicadas e mocks;
- aliases e redirects para rotas antigas;
- dashboards orientados a decisão e ação;
- estados vazios úteis e linguagem comercial;
- curadoria de acesso por perfil;
- responsividade e acessibilidade;
- detalhes técnicos apenas em áreas avançadas;
- tour operacional e documentação contextual.

### Critério de saída

Usuários de cada perfil encontram seu trabalho sem conhecer a arquitetura técnica, enquanto operadores avançados preservam acesso a diagnóstico, jobs e auditoria.

---

## Fase 13 — Piloto, segurança e go-live

### Objetivo

Validar o sistema em condições reais e liberar autonomia de forma gradual.

### Entregas

- threat model e revisão de segurança;
- testes de isolamento multi-tenant;
- testes de carga e concorrência;
- testes de falha de provider, worker e conexão;
- recuperação de desastre e backup;
- observabilidade e alertas com responsáveis;
- runbooks de incidentes;
- piloto completo no `ALTUM_AGENCY`;
- piloto com um cliente de baixo risco;
- shadow mode antes de qualquer autonomia;
- rollout por feature flag;
- métricas e critérios de rollback;
- treinamento da equipe Altum;
- aceite executivo de produção.

### Critério de saída

Os cenários finais são demonstrados em produção controlada, não há falha crítica aberta, os runbooks foram exercitados e o sistema possui métricas suficientes para aumentar ou reduzir autonomia com segurança.

## 9. Cenários finais obrigatórios de aceite

### Cenário A — Campanha completa

O administrador solicita uma campanha de aquisição. A Altum pesquisa, planeja, produz ativos, pede aprovações, entrega/publica conforme permissão, acompanha resultados e recomenda a próxima iteração.

### Cenário B — Produção de vídeo

O administrador solicita um vídeo de campanha. A Altum cria briefing, roteiro, storyboard, amostra, custo previsto, solicita aprovação, renderiza, avalia e salva a versão final na biblioteca do cliente.

### Cenário C — Operação multiempresa

Dois clientes executam missões simultaneamente sem compartilhar memória, credenciais, arquivos, custos ou eventos.

### Cenário D — Falha e retomada

Um worker é interrompido durante uma missão. A tarefa é retomada sem duplicar gasto ou publicação e mantém todo o histórico.

### Cenário E — Ação de alto risco

Um agente tenta publicar, enviar mensagem ou gerar gasto acima do limite. A ação é bloqueada, uma aprovação contextual é criada e somente a decisão autorizada libera a execução.

### Cenário F — Aprendizado seguro

Uma nova versão de agente é proposta. Ela passa por avaliação, comparação com baseline, piloto limitado e promoção; uma regressão posterior aciona rollback.

### Cenário G — Empresa 360

Um gestor abre uma empresa e identifica objetivo, saúde, entregas, custos, risco, pendências e próxima melhor ação sem recorrer a planilhas externas.

## 10. Métricas de prontidão

### Confiabilidade

- taxa de conclusão de missões;
- taxa de recuperação automática;
- tarefas duplicadas com efeito externo;
- tempo médio para detectar e recuperar falhas;
- disponibilidade de workers e conexões.

### Qualidade

- aceitação na primeira revisão;
- taxa de retrabalho;
- regressões por versão;
- factualidade e aderência à marca;
- satisfação da equipe e do cliente.

### Autonomia

- percentual de tarefas executadas sem intervenção;
- percentual de intervenções realmente necessárias;
- tempo humano por missão;
- taxa de escalada correta;
- incidentes por nível de autonomia.

### Negócio

- custo por entrega;
- margem por cliente e serviço;
- prazo previsto versus realizado;
- retenção e expansão;
- resultado comercial atribuído às missões.

### Segurança

- violações de isolamento entre tenants;
- ações externas sem aprovação exigida;
- segredos expostos;
- tentativas bloqueadas por política;
- tempo de resposta a incidentes.

## 11. Uso dos repositórios de referência

O catálogo integral não se limita aos quatro projetos destacados nesta tabela. Todos os runtimes, frameworks, skills, ferramentas criativas, sistemas de growth, memória, observabilidade, navegação, CRM, voz e padrões de interoperabilidade discutidos estão registrados em `docs/ALTUM_EXTERNAL_CAPABILITY_PORTFOLIO.md`. Esse catálogo deve ser consultado antes de qualquer decisão de construir uma capacidade nova.

| Repositório                           | Papel na missão                                        | Fase principal | Regra                                                                     |
| ------------------------------------- | ------------------------------------------------------ | -------------: | ------------------------------------------------------------------------- |
| `Ado77/agency-agents`                 | Papéis, SOPs, entregáveis e métricas dos especialistas |              4 | Sincronizar original, preservar origem e curar sobre a base existente     |
| `DeusData/codebase-memory-mcp`        | Memória e inteligência do código para agentes técnicos |             10 | Executar como MCP isolado após auditoria; evitar reimplementação          |
| `orca-cli/orca` ou `orka-agents/orka` | Orquestração, isolamento e retomada                    |            0–2 | Confirmar o repositório, executar original e comparar com o runtime atual |
| `calesthio/OpenMontage`               | Motor e pipelines de produção de vídeo                 |              7 | Executar isolado primeiro; integração condicionada à AGPL-3.0             |

## 12. Ordem prática dos primeiros lotes

Para evitar uma reconstrução ampla sem resultado, os primeiros lotes devem seguir esta ordem:

1. auditar o que já existe e publicar o mapa real do sistema;
2. fechar schemas e máquina de estados de missão/tarefa/execução;
3. provar reserva, retry, retomada e idempotência;
4. fechar autorização por tenant e política de aprovação;
5. criar o manifesto padrão de agente;
6. implementar somente os agentes necessários à campanha piloto;
7. completar o Comando para gerar e aprovar o plano dessa campanha;
8. executar a campanha internamente no tenant `ALTUM_AGENCY`;
9. completar os ativos criativos faltantes;
10. integrar resultados à área do cliente;
11. medir custo, qualidade e tempo humano;
12. corrigir o fluxo antes de adicionar novos serviços ou agentes.

## 13. Protocolo para executar esta missão em novos chats

Ao continuar esta missão, o agente responsável deve:

1. ler `AGENTS.md` e os documentos de visão e missão;
2. verificar o estado atual do Git e preservar mudanças do usuário;
3. localizar a fase e o lote ativos;
4. confirmar no código o que já existe antes de implementar;
5. escolher o menor vertical slice que avance o critério de saída;
6. documentar riscos e decisões estruturais;
7. implementar sem quebrar compatibilidade;
8. executar verificações proporcionais ao risco;
9. atualizar checklist, evidências e pendências reais;
10. não marcar uma fase como concluída por aparência visual ou código não exercitado.

## 14. Checklist de progresso

- [~] Fase 0 — Auditoria e contrato de arquitetura (portfólio e primeiro piloto concluídos; validação de runtime e inventário completo pendentes)
- [~] Fase 1 — Modelo canônico do Control Plane (schemas de Empresa, Objetivo, Programa, Missão, Tarefa, Execução e Evidência definidos; manifestos, máquina de estados e eventos versionados já registram criação, início e callbacks de execução; artefatos de callbacks agora são evidências idempotentes por missão e visíveis no Histórico; `/admin/objetivos` permite criar e acompanhar Objetivo → Programa → Missões, com escopo por empresa; migrações e cobertura append-only das demais transições ainda pendentes)
- [ ] Fase 2 — Runtime durável
- [ ] Fase 3 — Segurança e execução governada
- [ ] Fase 4 — Catálogo de Agentes Altum
- [ ] Fase 5 — Comando e orquestração por objetivos
- [ ] Fase 6 — Primeiro fluxo completo da agência
- [ ] Fase 7 — Estúdio multimodal
- [ ] Fase 8 — Execução na internet
- [ ] Fase 9 — Empresa 360 e carteira
- [ ] Fase 10 — Qualidade, memória e aprendizado
- [ ] Fase 11 — Custos, margem e capacidade
- [ ] Fase 12 — Consolidação da experiência admin
- [ ] Fase 13 — Piloto e go-live

## 15. Condição de encerramento da missão

Esta missão só poderá ser encerrada quando:

- os sete cenários finais de aceite forem demonstrados;
- as métricas de prontidão estiverem visíveis;
- não houver falha crítica aberta de segurança, isolamento ou duplicação;
- a campanha piloto tiver sido executada com resultado real;
- a equipe Altum conseguir operar e recuperar o sistema;
- a experiência admin estiver consolidada;
- a área do cliente continuar responsável por sua operação cotidiana;
- a autonomia puder ser aumentada ou reduzida por política, com evidências.
