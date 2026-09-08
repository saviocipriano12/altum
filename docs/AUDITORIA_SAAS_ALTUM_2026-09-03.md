# Auditoria profissional de prontidão SaaS — Altum

**Data de corte:** 3 de setembro de 2026  
**Parecer geral:** **52/100 — piloto controlado, ainda não pronto para lançamento self-service amplo**  
**Foco:** produto, experiência, segurança, LGPD, IA, monetização, engenharia, operação, crescimento e prontidão de go-live.

> Esta é uma avaliação independente baseada no repositório, na documentação disponível, em verificações locais e em superfícies públicas de produção. Não é pentest, parecer jurídico, auditoria contábil nem certificação. Não foram fornecidos dados reais de clientes, receita, churn, conversão ou suporte; portanto, product-market fit e viabilidade econômica não podem ser comprovados nesta auditoria.

## 1. Resumo executivo

A Altum já ultrapassou o estágio de protótipo. Há um produto amplo, com proposta de valor compreensível — **operação comercial com IA** — e uma combinação relevante de conversas, CRM, funil, agenda, campanhas, propostas, integrações e assistência por IA. A base técnica compila, os testes existentes passam, não há vulnerabilidades conhecidas nas dependências de produção e várias proteções importantes já existem no servidor.

O principal risco é que a profundidade funcional cresceu mais rápido que a maturidade operacional do SaaS. O produto possui 40 páginas apenas no painel do cliente e 208 rotas de API, enquanto isolamento multi-tenant, cobrança, privacidade, recuperação, observabilidade e validação E2E ainda têm lacunas de alta severidade. Isso cria um cenário comum em SaaS jovem: muita capacidade vendável, mas uma superfície operacional difícil de garantir em escala.

Minha recomendação é inequívoca:

- **Pode operar:** piloto controlado, poucos tenants, onboarding assistido, limites de uso conservadores, supervisão técnica e plano de resposta manual.
- **Não deve operar ainda:** aquisição self-service em volume, promessa de alta disponibilidade, expansão de cobrança automática ou acesso amplo de clientes sem fechar os itens P0 deste relatório.
- **Próxima meta:** transformar a Altum de uma plataforma funcionalmente rica em um serviço previsível, mensurável, seguro e contratualmente coerente.

## 2. Scorecard de mercado

| Dimensão | Peso | Nota | Diagnóstico |
|---|---:|---:|---|
| Proposta de valor e produto | 10% | 7,5/10 | Promessa clara e núcleo operacional relevante; ICP e fronteira entre SaaS e serviço ainda amplos. |
| UX, ativação e arquitetura de informação | 10% | 6,0/10 | Nova direção é boa, mas o produto ainda expõe muitas áreas e jornadas concorrentes. Nota visual provisória. |
| Cobertura funcional | 8% | 7,0/10 | Cobertura acima da média de um SaaS inicial; profundidade eleva custo de manutenção. |
| Monetização e billing | 8% | 4,5/10 | Planos evoluíram, porém setup, add-ons, downgrade, fiscal e coerência de limites não estão fechados. |
| Arquitetura e manutenibilidade | 10% | 4,5/10 | Build saudável, mas alta concentração de lógica, excesso de Client Components e superfície muito grande. |
| Segurança e isolamento multi-tenant | 12% | 4,0/10 | Boas defesas no servidor; regras Firestore contêm risco crítico de autorização e mutação de tenant. |
| LGPD, contratos e governança de dados | 10% | 3,5/10 | Existem políticas e rotinas parciais, mas consentimento, retenção, operadores e contratos estão incompletos. |
| IA responsável e qualidade | 8% | 6,5/10 | Handoff, limites, fallbacks e testes de intenção são bons; falta governança formal, avaliação e adversarial testing. |
| Confiabilidade e operação | 10% | 4,0/10 | Jobs e backups locais existem; faltam SLO, telemetria, alertas, backup/restore do Firestore e DLQ robusta. |
| Qualidade e testes | 7% | 5,5/10 | 155 smoke tests passam; cobertura é majoritariamente unitária/estrutural, sem E2E ou rules emulator. |
| Performance e acessibilidade | 4% | 4,0/10 | Build estável, mas sem auditoria autenticada, budgets, monitoramento RUM ou evidência WCAG. |
| Go-to-market e customer success | 3% | 4,5/10 | Há conteúdo e proposta; faltam telemetria de ativação, cohort retention, health score e SLAs de suporte. |
| **Total ponderado** | **100%** | **52/100** | **Pronto para piloto controlado; não para escala self-service.** |

## 3. O que a Altum faz bem

### 3.1 Produto e posicionamento

- “Operação comercial com IA” é uma promessa melhor que uma lista de módulos. Ela conecta atendimento, venda, acompanhamento e decisão.
- Conversas, Clientes & Oportunidades e Agenda formam um núcleo coerente de trabalho diário.
- A IA aparece em contextos comercialmente úteis: resposta, inteligência, handoff, conhecimento, campanhas e follow-up.
- O repositório demonstra entendimento real dos fluxos de WhatsApp, CRM, automação, ecommerce, mídia, cobrança e relatórios — não apenas telas demonstrativas.
- A documentação interna já reconhece problemas de onboarding duplicado, linguagem técnica e excesso de blocos. Essa autoconsciência acelera a correção.

### 3.2 Engenharia e segurança já presentes

- Build de produção aprovado no Next.js 16.3.2, incluindo TypeScript e geração de 294 páginas estáticas.
- Lint aprovado, com 0 erros e 24 avisos.
- 155 smoke tests aprovados e suíte de fechamento do agente aprovada.
- `npm audit --omit=dev` encontrou 0 vulnerabilidades conhecidas nas dependências de produção.
- Há verificação de token Firebase no servidor, membership de tenant, capacidades, entitlements, limites, validação de webhooks, comparação constante de segredo do Asaas e criptografia de credenciais de integrações.
- A IA já possui limites de uso, fallbacks, handoff humano, sinalização de qualidade e testes determinísticos de comportamentos comerciais importantes.
- A exclusão de leads e conversas possui lixeira, purge permanente e trilha de auditoria, uma boa fundação para lifecycle de dados.

Esses itens são valiosos, mas segurança SaaS deve ser garantida em todas as camadas. Um guard correto na API não compensa uma regra permissiva de acesso direto ao Firestore. A referência adequada para elevar isso a um programa verificável é o [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) e, para APIs, o [OWASP API Security Top 10](https://devguide.owasp.org/en/07-training-education/07-api-top-ten/).

## 4. Bloqueadores P0 antes de lançamento amplo

| P0 | Risco | Evidência | Condição objetiva de aprovação |
|---|---|---|---|
| Isolamento Firestore | Acesso ou alteração cruzada entre tenants; escalada horizontal de privilégio | `firestore.rules` permite updates sem preservar `tenantId` e escrita ampla por membership | Tornar `tenantId` imutável; aplicar capacidades por coleção; negar por padrão; testes no Emulator cobrindo owner, manager, agent, viewer e atacante de outro tenant. |
| Privacidade de tracking | GA/Meta Pixel no portal autenticado sem consentimento identificado; URL completa pode conter contexto sensível | `app/layout.tsx` monta tracking global; `components/analytics/TrackingScripts.tsx` envia `page_location` | Bloquear trackers não essenciais até consentimento; excluir `/cliente`, admin, auth e URLs sensíveis; sanitizar query strings; registrar versão do consentimento. |
| Billing e catálogo | Venda de limites/add-ons que não correspondem à aplicação real; inconsistência entre produção e código local | Catálogo anuncia contas Instagram, pipelines, integrações e automações; mapa efetivo cobre conjunto diferente; endpoint público de produção ainda está no catálogo anterior | Uma fonte de verdade versionada; testes contractuais plano→entitlement→limite→fatura; setup/add-ons/downgrade/falha de pagamento e impostos definidos e testados. |
| Autenticação e pagamentos reais | Falhas apenas em produção podem bloquear cadastro, email ou receita | Checklist externo ainda pede chaves/URLs reais, deliverability e fluxo Asaas completo | Teste E2E em produção controlada: cadastro, verificação, reset, assinatura, webhook idempotente, cancelamento, inadimplência e reconciliação. |
| Recuperação e observabilidade | Perda de dados ou indisponibilidade sem detecção e recuperação comprovada | Sem backup automático/teste de restore do Firestore, SLOs ou telemetria central encontrada | Backup agendado, retenção definida, restore cronometrado; RTO/RPO; alertas por SLO e runbooks ensaiados. |
| Legal/LGPD | Transparência e base legal insuficientes para dados de conversas, IA, anúncios e clientes finais | Política/termos genéricos; operadores, retenções, transferências e IA não detalhados | Revisão jurídica; DPA, RoPA, subprocessadores, retenções, direitos, incident response, cookies e aceite versionado publicados. |
| CI e testes comportamentais | Regressões críticas chegam à produção apesar de testes estruturais passarem | Não foi encontrado CI, E2E de navegador, rules emulator, secret scanning ou teste de restauração | Pipeline obrigatório com lint, typecheck, build, unit/integration, rules, E2E crítico, audit e secret scanning. |
| Configuração pública | SEO/canonical e descoberta quebrados; marca/domínio inconsistentes | `sitemap.xml` e `robots.txt` exibem quebra na URL-base; metadados/`llms.txt` ainda apontam para `altum.ag` | Corrigir e validar `NEXT_PUBLIC_SITE_URL.trim()`, canonicals, OG, sitemap, robots e domínio único em produção. |

O item Firestore é **stop-ship**. Em `leads` e `chats`, o update autoriza pela versão existente do documento sem exigir que `request.resource.data.tenantId` permaneça igual. Em outras coleções — pipeline, conhecimento, estado da IA, logs, automações, jobs, métricas e captura — a regra usa membership ampla, sem refletir as capacidades mais restritas das APIs. Isso permite contornar a interface e os guards do servidor por acesso direto ao SDK. A correção precisa ser validada no [Firebase Rules Emulator](https://firebase.google.com/docs/firestore/security/test-rules-emulator/), não somente por busca textual no código.

## 5. Avaliação detalhada

### 5.1 Estratégia de produto e product-market fit

**Diagnóstico:** a proposta é boa; o foco comercial ainda é amplo demais.

O site e o produto cobrem múltiplos segmentos, cidades, agência, sites, mídia paga, automação, CRM, ecommerce e IA. Isso amplia o mercado aparente, mas dificulta mensagem, onboarding, suporte e roadmap. A Altum precisa definir seu beachhead: tipo de empresa, canal dominante, número de atendentes, volume de leads, dor principal e evento de valor.

Recomendação de foco inicial:

- ICP: PMEs brasileiras com operação comercial dependente de WhatsApp, 2–20 usuários e processo de follow-up ainda manual.
- Job principal: responder rapidamente, organizar oportunidades e garantir a próxima ação.
- Evento de ativação: canal conectado + primeiro lead atendido + oportunidade movida + próxima ação agendada, dentro de 48 horas.
- Resultado vendido: menor tempo de resposta, mais follow-ups cumpridos e mais oportunidades convertidas — não “ter IA”.

Não é possível afirmar PMF sem dados de retenção e disposição a pagar. A próxima decisão estratégica deve usar cohort retention, conversão de trial, churn por motivo, entrevistas de cancelamento e uso recorrente do núcleo operacional.

### 5.2 Experiência, navegação e ativação

**Diagnóstico:** direção correta, execução ainda densa.

A navegação conceitual nova é coerente. Entretanto, 40 páginas no painel e a presença de automações, Instagram, conhecimento, handoffs, go-live, logs, reuniões, disparos e configurações especializadas indicam que o cliente comum ainda pode perceber o sistema como um conjunto de módulos. Inbox, IA e CRM também concentram milhares de linhas, sinalizando telas com muitas responsabilidades.

Prioridades de UX:

1. Aplicar curadoria real por perfil: Atendente, Gestor, Admin do cliente e Técnico Altum.
2. Manter no menu primário apenas trabalho diário; controles de IA, implantação, logs e integrações em segunda camada.
3. Unificar tour, onboarding e go-live numa única jornada orientada a resultados.
4. Substituir cards explicativos por filas de ação: responder, revisar, mover, cobrar, agendar e decidir.
5. Criar estados vazios acionáveis e recuperação clara para erro, limite, integração desconectada e cobrança pendente.
6. Medir time-to-value e abandono por etapa.

A nota visual e de acessibilidade é provisória: os screenshots disponíveis estavam antigos e focados em login/loading, e não havia sessão autenticada atual para inspecionar todos os fluxos. Uma homologação final deve testar desktop e mobile, teclado, foco, contraste, zoom, leitores de tela, mensagens de erro e autenticação acessível segundo [WCAG 2.2](https://www.w3.org/TR/wcag/).

### 5.3 Arquitetura e manutenibilidade

**Diagnóstico:** o sistema funciona, mas o custo de mudança está aumentando.

Indicadores observados:

- Aproximadamente 158,7 mil linhas e 208 rotas de API.
- 37 de 40 páginas do painel são Client Components.
- `lib/server/ai/agent.ts` tem 5.826 linhas; inbox, 4.747; IA, 3.517; CRM, 2.118.
- Apenas quatro índices compostos estão declarados, diante de centenas de consultas/ordenações no código; isso exige validação por query real, não uma conclusão automática de falta de índices.
- Não foram encontrados boundaries globais de erro ou uma plataforma central de observabilidade.

Recomendações:

- Quebrar os arquivos gigantes por domínio, caso de uso e adaptador; definir owners e contratos internos.
- Mover leitura e composição para Server Components quando apropriado, mantendo estado interativo isolado em ilhas de cliente.
- Tornar os módulos server-side explicitamente não importáveis no cliente.
- Criar camada comum para autenticação, autorização, idempotência, erro, auditoria e limites de API.
- Definir budgets: bundle, LCP/INP, chamadas por tela, custo de leitura Firestore e latência p95.
- Registrar Architecture Decision Records para identidade, multi-tenancy, jobs, IA, cobrança e integrações.

### 5.4 Segurança

**Pontos positivos:** tokens verificados no servidor, membership, capacidades, limites, assinaturas de webhook, segredo Asaas em comparação constante, criptografia de integrações e headers como HSTS, CSP, X-Frame-Options e `nosniff` em produção.

**Gaps prioritários:**

- Corrigir as regras Firestore e publicar/testar `storage.rules`.
- Ativar App Check com métricas antes de enforcement; a documentação oficial recomenda observar requisições legítimas antes de bloquear em [Firebase App Check](https://firebase.google.com/docs/app-check/enable-enforcement).
- Implementar MFA para perfis privilegiados, reautenticação para operações sensíveis, revogação/visualização de sessões e alertas de login suspeito.
- Adicionar WAF/rate limiting distribuído para auth, formulários, webhooks, IA, mídia e disparos; proteger contra consumo irrestrito de recursos.
- Remover defaults permissivos de papel; papel desconhecido deve falhar fechado.
- Centralizar gestão de segredos, rotação, inventário de scopes e secret scanning em cada PR.
- Fazer pentest externo com foco em BOLA/BFLA, mass assignment, upload/mídia, SSRF, webhooks, tenant hopping e abuso de IA.
- Reduzir `script-src 'unsafe-inline'` quando tecnicamente viável e validar CSP em modo report-only antes do bloqueio.

### 5.5 LGPD, privacidade e contratos

**Diagnóstico:** há intenção de conformidade, mas ainda não governança comprovável.

O carregamento global de GA e Meta Pixel sem consentimento identificado é incompatível com uma postura conservadora para cookies não essenciais. A ANPD recomenda opção de rejeitar cookies não necessários, desativação por padrão e consentimento específico por categoria no seu [guia de cookies](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf).

A política de privacidade e os termos precisam ser reescritos profissionalmente. Foram observados texto genérico, caracteres corrompidos, contato Gmail e ausência ou baixa precisão sobre entidade legal, finalidades/base legal por categoria, retenção, subprocessadores, transferências internacionais, fornecedores de IA, decisões automatizadas, cookies, SLA, responsabilidade, propriedade de dados, suspensão, exportação, downgrade, setup, add-ons e aceite versionado.

Plano mínimo de governança:

- Inventário de dados/RoPA: fonte, finalidade, base legal, controlador/operador, acesso, retenção e descarte.
- DPA com clientes e DPAs/lista pública de subprocessadores.
- Portal ou processo rastreável para confirmação, acesso, correção, portabilidade, oposição e eliminação. A ANPD descreve atendimento imediato simplificado e até 15 dias para declaração completa em [direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).
- Plano de incidentes com classificação, cadeia de decisão, preservação de evidência e comunicação. A regulamentação da ANPD prevê comunicação de incidentes relevantes em três dias úteis, conforme orientação oficial sobre [comunicação de incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis).
- Política de retenção aplicada por job e comprovada por auditoria, incluindo backups, mídias, logs, prompts e respostas de modelos.
- Não enviar páginas autenticadas nem query strings a plataformas de ads/analytics.

### 5.6 IA, automação e confiança

**Diagnóstico:** bom motor funcional, governança ainda informal.

Handoff humano, limites de uso, fallbacks, qualidade e testes de intenções comerciais são diferenciais reais. Porém, não foi encontrada evidência explícita de um programa de avaliação com dataset dourado, métricas por versão, testes de prompt injection/jailbreak, red team, inventário de modelos, análise de impacto, sampling humano, incidentes de IA ou change control de prompts/modelos.

Adotar o ciclo **Govern, Map, Measure, Manage** do [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) e o perfil específico de IA generativa do [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf):

- versionar prompts, modelos, ferramentas e base de conhecimento;
- criar conjunto de avaliação real anonimizado por segmento e intenção;
- medir alucinação, resposta incorreta, falsa promessa, handoff perdido, conteúdo proibido e custo por conversa;
- testar prompt injection em mensagens, anexos, catálogo e documentos da base;
- aplicar minimização/mascaramento de dados antes dos provedores;
- explicitar ao usuário quando está falando com IA e garantir acesso simples a humano;
- exigir aprovação humana em preço, contrato, pagamento, dado sensível e ação irreversível.

### 5.7 WhatsApp, Instagram e integrações

**Diagnóstico:** integração é uma força comercial e um grande domínio de risco operacional.

Para WhatsApp, registre prova de opt-in por finalidade e canal, identidade da empresa, origem, timestamp e versão do texto; honre opt-out imediatamente; use templates aprovados fora da janela permitida; mantenha escalada humana. Esses pontos derivam da [Política de Mensagens do WhatsApp Business](https://business.whatsapp.com/policy/preview?lang=pt_BR).

Cada integração deve ter:

- máquina de estados explícita e reautorização;
- webhook idempotente e persistido antes do processamento;
- retries com backoff, limite, dead-letter queue e replay seguro;
- reconciliação periódica contra a fonte;
- assinatura/segredo rotacionável;
- dashboard de atraso, falha, duplicidade e última sincronização;
- runbook de indisponibilidade do provedor e degradação clara para o usuário.

A instalação Evolution autogerenciada aumenta a responsabilidade sobre PostgreSQL, Redis, mídia, upgrades, backup, filas e monitoramento. Fixar versão é positivo; ainda é necessário provar restore, alertas e procedimento de rollback.

### 5.8 Monetização e unit economics

**Diagnóstico:** preços parecem plausíveis, mas o contrato comercial ainda não é executável de ponta a ponta.

O catálogo local possui Essencial, Operação, Escala e Estrutura Assistida, setup e add-ons. Entretanto, os limites comerciais de contas Instagram, pipelines, integrações de comércio e outros itens não aparecem no mesmo mapa de enforcement usado pelos limites técnicos. Além disso, a API pública em produção ainda expõe o catálogo anterior. Não se deve vender um limite que o sistema não mede e não bloqueia de forma determinística.

Antes de escalar:

- uma única fonte de verdade para preço, features, entitlement, limites, checkout e comunicação;
- ledger imutável de assinatura, fatura, evento e ajuste;
- idempotência, reconciliação e tratamento de eventos fora de ordem;
- proration, upgrade, downgrade, cancelamento, reativação, inadimplência e período de tolerância definidos;
- setup e add-ons com aceite explícito, nota/fiscalidade definida e histórico;
- limites exibidos com consumo, janela e consequência claros;
- margem bruta por tenant incluindo IA, mensagens, infraestrutura, mídia e suporte humano.

O trial de sete dias pode ser curto para uma solução que exige conectar canais, importar dados e configurar operação. Trate isso como hipótese: medir tempo até ativação e permitir extensão condicionada à conclusão do onboarding ou optar por piloto assistido.

### 5.9 Confiabilidade, suporte e operação

**Diagnóstico:** os jobs existem, mas o serviço ainda não é operado por objetivos de confiabilidade.

A stack possui agendamentos protegidos e uso de lock; a Evolution tem backup local de 14 dias. Não foram encontrados SLOs, alertas centralizados, status page, backup automático do Firestore, restore testado, RTO/RPO aprovados ou telemetria distribuída. Os jobs dependem de uma única VPS, o que concentra risco.

O [Google Cloud Architecture Framework](https://docs.cloud.google.com/architecture/framework/reliability) recomenda ligar confiabilidade a objetivos de experiência, observabilidade, degradação e recuperação; o material de [SLOs do Google SRE](https://sre.google/resources/book-update/slos/) oferece uma base prática.

SLOs iniciais sugeridos:

- Login e painel: 99,9% mensal; p95 de ações críticas definido por fluxo.
- Recepção de webhook: 99,95%; atraso p95 monitorado.
- Envio de mensagem: sucesso e tempo de confirmação separados por provedor.
- Jobs financeiros: 100% reconciliados diariamente, com zero evento silenciosamente perdido.
- RPO/RTO definidos por Firestore, Storage, PostgreSQL/Redis e configuração.

Criar severidades, plantão, canal de incidente, runbook, postmortem sem culpa, status page e SLA de suporte por plano. Alertas devem ser acionáveis para 5xx, latência, backlog, webhook, 401/403/429, falha de provedor, custo de IA e erro de cobrança.

### 5.10 Qualidade, performance e acessibilidade

Os testes atuais dão confiança sobre muitos guards e comportamentos determinísticos, mas várias verificações são estruturais — confirmam que um padrão existe no código, não que a combinação de Firebase, webhook, fila, banco e UI funciona. A pirâmide necessária inclui:

- unitários de domínio;
- integração com Emulator e provedores simulados;
- contratos de webhooks e planos;
- E2E dos fluxos de receita e operação;
- smoke de produção sintético;
- teste de carga em inbox, busca, importação, campanhas e webhooks;
- testes de recuperação e caos controlado.

Fluxos E2E mínimos: cadastro→email→login; convite e papéis; conectar canal; receber/responder conversa; criar/mover oportunidade; agendar follow-up; configurar IA e handoff; exceder limite; assinar/pagar/falhar/cancelar; exportar/excluir dados; desconectar/reautorizar integração.

### 5.11 Analytics, crescimento e customer success

Foi identificado apenas page view genérico, não um sistema de eventos de produto. Sem eventos, a Altum não consegue saber se o redesign aumenta valor ou apenas muda a aparência.

Instrumentação mínima:

- aquisição: visita→cadastro→email verificado→tenant criado;
- ativação: canal conectado→primeira conversa→primeira oportunidade→próxima ação;
- engajamento: WAU/MAU por papel, conversas atendidas, follow-ups cumpridos, uso do funil;
- valor: tempo de primeira resposta, conversão por etapa, receita atribuída, recuperação de oportunidades;
- IA: adoção, aceitação/edição, handoff, erro, custo, latência e qualidade;
- receita: trial-to-paid, MRR, ARPA, margem bruta, churn logo/revenue, NRR, expansão e CAC payback;
- sucesso: time-to-value, tickets por tenant, CSAT, health score e motivo de churn.

O sitemap amplo por cidades, segmentos e verticais precisa de revisão editorial para evitar conteúdo fino e canibalização. Em produção, corrigir imediatamente a quebra de URL observada em [sitemap.xml](https://www.altumia.com.br/sitemap.xml) e [robots.txt](https://www.altumia.com.br/robots.txt), além das referências legadas a `altum.ag` em metadados e [llms.txt](https://www.altumia.com.br/llms.txt).

## 6. Plano de execução recomendado

### 0–14 dias — eliminar risco crítico

1. Congelar expansão funcional e nomear owners de Segurança, Billing, Operação, LGPD e Produto.
2. Corrigir regras Firestore/Storage e criar matriz automatizada de autorização no Emulator.
3. Retirar trackers do portal e implementar consentimento granular.
4. Corrigir domínio, sitemap, robots, canonical, OG e configuração de produção.
5. Fechar uma fonte única de planos/entitlements/limites; não publicar catálogo novo antes dos testes.
6. Configurar backup do Firestore, executar restore e registrar RPO/RTO observado.
7. Centralizar erros/logs e criar alertas para receita, mensagens, webhooks e autenticação.
8. Validar/rotacionar chaves Resend, Asaas, Meta, Firebase e jobs; registrar scopes e owners.

### 15–45 dias — tornar o serviço repetível

1. Implementar CI obrigatório e testes E2E dos fluxos críticos.
2. Fechar cobrança de setup/add-ons, ciclo de inadimplência, downgrade, fiscal e reconciliação.
3. Revisar termos, privacidade, DPA, subprocessadores, cookies, retenção e incident response com jurídico.
4. Consolidar ativação numa única jornada e aplicar navegação por perfil.
5. Definir SLOs, runbooks, status page e rito de incidentes.
6. Instrumentar funil de produto, ativação, retenção, IA, receita e custo.
7. Criar evaluation harness de IA e política de ações que exigem humano.

### 46–90 dias — provar escala

1. Rodar pilotos por coorte com critérios de entrada e saída.
2. Fazer pentest externo e corrigir findings críticos/altos.
3. Testar carga, degradação de provedor, replay de webhooks e desastre completo.
4. Refatorar hotspots por domínio, começando por agente de IA, inbox, CRM e billing.
5. Revisar packaging com dados de custo, adoção e willingness-to-pay.
6. Publicar SLAs de suporte realistas e criar health score de contas.
7. Autorizar self-service amplo somente após duas a quatro semanas sem P0 e com SLOs estáveis.

## 7. Gate executivo de go/no-go

**GO para piloto controlado** somente se:

- regras multi-tenant e Storage aprovadas no Emulator;
- tracking autenticado removido ou consentido;
- backup e restore concluídos;
- auth, email, WhatsApp e Asaas validados com credenciais reais;
- catálogo vendido for exatamente o catálogo aplicado e faturado;
- alertas e runbooks cobrirem os fluxos do piloto;
- contrato, privacidade e DPA estiverem revisados;
- suporte humano e rollback estiverem disponíveis.

**GO para escala self-service** somente se, além do anterior:

- CI/E2E e pentest aprovados;
- SLOs cumpridos por período representativo;
- dunning, reconciliação, downgrade e exclusão/exportação estiverem automatizados;
- onboarding provar ativação e retenção por coorte;
- margem bruta e custo de suporte forem conhecidos;
- incidentes e falhas de provedor tiverem degradação testada.

## 8. Conclusão

A Altum tem mérito de produto: resolve um problema comercial real, possui integração profunda e trata IA como parte da operação. O risco atual não é falta de funcionalidades; é confiança operacional. Continuar adicionando módulos antes de fechar autorização, billing, privacidade, observabilidade e recuperação aumentará custo e risco mais rápido que valor.

O caminho profissional é reduzir a superfície percebida, proteger o tenant em todas as camadas, medir o evento de valor e transformar cada promessa comercial em um comportamento testado. Se os P0 forem tratados nas próximas semanas, a Altum pode evoluir de um piloto tecnicamente forte para um SaaS vendável e escalável sem precisar recomeçar a base.

## 9. Evidências de validação desta auditoria

| Verificação | Resultado |
|---|---|
| Build Next.js + TypeScript | Aprovado |
| Lint | Aprovado; 24 avisos, 0 erros |
| Smoke tests | 155 aprovados, 0 falhas |
| Teste de fechamento do agente | Aprovado |
| Audit de dependências de produção | 0 vulnerabilidades conhecidas |
| Readiness local | Reprovado por chaves Resend/Asaas ausentes; não prova o estado do deploy |
| Checklist externo | 26 concluídos, 61 pendentes |
| Auditoria visual autenticada atual | Não concluída; exige sessão/ambiente de homologação |
| Pentest, jurídico e restore independente | Fora do escopo e ainda necessários |

