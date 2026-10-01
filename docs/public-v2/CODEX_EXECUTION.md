# Plano de execução para Codex — ALTUM Public V2

## Regra principal
Não reescrever o produto interno. A missão é reconstruir a camada pública e preparar o produto para aquisição/conversão mantendo compatibilidade com a aplicação atual.

## Stack atual
- Next.js 16
- React 19
- Tailwind CSS
- Framer Motion
- Firebase
- aplicação multiárea já existente

## Fase 0 — auditoria
Antes de alterar páginas:
- listar todas as rotas públicas;
- classificar em marketing, auth, legal, SEO, case, conteúdo e aplicação;
- localizar referências a altum.ag;
- localizar "Altumia";
- localizar "Premium Web Agency";
- localizar "Engenharia de Vendas High-Ticket";
- identificar CTAs e links antigos;
- identificar metadata/canonical/OG inconsistentes;
- inventariar screenshots/assets atuais;
- mapear componentes públicos reutilizáveis.

Gerar relatório em:
docs/public-v2/AUDIT_RESULT.md

## Fase 1 — fundação
Criar/ajustar:
- public site layout;
- header;
- footer;
- container;
- typography;
- buttons;
- section primitives;
- screenshot frame;
- logo treatment;
- metadata helpers;
- SEO schema helpers.

Objetivo:
design system público consistente e separado do painel autenticado.

## Fase 2 — branding e SEO técnico
- canonical único em https://www.altumia.com.br;
- remover altum.ag de metadata e CTAs;
- atualizar title/description/OG/Twitter;
- Organization + WebSite + SoftwareApplication schema quando válido;
- revisar robots;
- revisar sitemap;
- adicionar noindex às rotas privadas/auth quando necessário;
- revisar política de privacidade e termos;
- preservar redirects necessários.

## Fase 3 — nova Home
Substituir a mensagem antiga por posicionamento de plataforma.

Requisitos:
- hero com screenshot real;
- não usar métricas não comprovadas;
- produto visível no primeiro viewport em desktop;
- explicar módulos em sequência;
- mostrar integração entre módulos;
- separar plataforma de serviços;
- CTA de demo e CTA comercial;
- mobile impecável;
- acessibilidade básica;
- performance.

## Fase 4 — páginas de produto
Criar:
- /plataforma
- /crm
- /inbox
- /ia
- /automacoes
- /whatsapp
- /instagram
- /campanhas
- /analytics

Reaproveitar componentes.
Cada página precisa de conteúdo único e demonstração real.

## Fase 5 — integrações e soluções
Criar arquitetura de /integracoes.
Criar apenas páginas de integrações realmente suportadas.
Reduzir páginas genéricas e consolidar soluções por problema.

## Fase 6 — prova
Criar estrutura de /clientes e /cases.
Case deve conter:
- contexto;
- problema;
- implementação;
- módulos usados;
- resultado comprovável;
- período;
- evidência visual quando possível.

Não inventar números.

## Fase 7 — pricing e entitlements
Auditar modelo atual de planos.
Separar:
- assinatura;
- implementação;
- add-ons;
- consumo variável, se aplicável.

Criar uma fonte única de verdade para:
- plan IDs;
- features;
- limites;
- entitlements.

Evitar lógica de plano espalhada pela UI.

## Fase 8 — onboarding
Construir checklist de ativação:
1. criar organização;
2. configurar empresa;
3. convidar equipe;
4. conectar canal;
5. configurar IA;
6. configurar pipeline;
7. ativar primeira automação;
8. testar primeiro atendimento.

Registrar eventos de ativação.

## Fase 9 — demo pública
Criar tenant de demonstração isolado.
Não permitir mutações perigosas.
Popular com dados sintéticos.
Permitir exploração guiada.

## Fase 10 — self-selling
O lead originado no site deve:
1. entrar na ALTUM;
2. registrar origem/UTM;
3. receber atendimento da IA;
4. ser qualificado;
5. entrar no CRM;
6. receber follow-up;
7. agendar reunião ou avançar para contratação.

A ALTUM deve demonstrar seu próprio produto no processo de venda.

## Critérios de aceite
Um visitante sem contexto deve identificar em até 10 segundos:
- que ALTUM é software/plataforma;
- que centraliza CRM + canais + IA + automação;
- que serve para uma operação comercial;
- qual é o próximo passo.

Um usuário técnico deve encontrar:
- páginas consistentes;
- metadata coerente;
- domínio canônico único;
- nenhuma referência pública histórica conflitante;
- sitemap limpo;
- páginas privadas fora de indexação.

## Estratégia de commits
Usar commits pequenos por fase:
- docs(public): ...
- refactor(public): ...
- feat(public): ...
- fix(seo): ...
- feat(demo): ...
- feat(onboarding): ...

Não misturar refatorações internas não relacionadas com a reconstrução pública.
