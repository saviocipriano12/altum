# Matriz de saída — Fase 0

**Revalidação parcial:** auditorias locais de superfície, coleções e fontes reexecutadas nesta revisão; resultados de build e implantação têm validade separada.  
**Leitura:** esta matriz não substitui as evidências citadas. `Concluído` exige prova atual; `Parcial` nunca é aceite de produção.

| Entrega exigida | Estado | Evidência atual | Lacuna ou próximo gate |
|---|---|---|---|
| Inventário do núcleo Agent OS | Concluído no escopo estático declarado | `scripts/audit-agent-os-inventory.mjs` reexecutado com saída zero: 21 coleções literais usadas por `app` e `lib`, sem divergência com `config/agent-os-data-contracts.json` | Não cobre coleções dinâmicas nem prova isolamento em execução; novas coleções exigem expansão do inventário |
| Inventário da superfície Admin | Concluído para o código atual | `npm run admin:audit:surface` confirmou 40 rotas de tela, 91 rotas de API, 8 candidatos a worker e 14 arquivos de jobs | manter o inventário no gate de mudança do Admin; não prova execução externa |
| Mapa real, parcial e legado | Concluído para o inventário administrativo | `ALTUM_ADMIN_SURFACE_DIAGNOSIS.md` consolida superfícies, maturidade, legados e critério de promoção; `audit_events` foi identificado como legado por conversa | revalidar a classificação quando novas superfícies forem promovidas a autonomia |
| Dependência entre Admin, runtime e área do cliente | Concluído para o piloto | diagrama e fronteira em `ALTUM_PHASE_0_AUDIT.md` e `ADR-001_AGENT_OS_RUNTIME_BOUNDARY.md` | Revalidar após o primeiro job real |
| Coleções e escopo por empresa | Concluído para o núcleo Agent OS | 21 coleções classificadas; teste garante bloqueio direto das coleções críticas | Expandir a cobertura à medida que novas coleções entrarem no núcleo |
| Motor de workflow | Decisão provisória aceita | ADR-001: Altum/Firestore como control plane; OpenClaw como executor isolado | Reabrir depois de piloto real ou comparação reproduzível de motor externo |
| Filas, scheduler, sandbox e evidências | Parcial | leases, despachos, callbacks HMAC e reconciliação no código; matriz de fontes identifica candidatos de sandbox e scheduler | executar worker real; decidir scheduler amplo e sandbox de conteúdo não confiável |
| Matriz de riscos | Parcial | `ALTUM_ADMIN_OPERATIONAL_RISK_MATRIX.md` consolida riscos, donos, barreiras e evidências do control plane; fontes com gates jurídico/técnico em `ALTUM_EXTERNAL_CAPABILITY_PORTFOLIO.md`; OpenMontage bloqueado por AGPL | expandir a mesma matriz para os demais domínios da plataforma |
| Portfólio externo canônico | Concluído | 72 fontes em `config/agent-source-registry.json`; decisões de upstream documentadas | manter sincronização e revisão periódica |
| Primeiro piloto upstream-first | Concluído | Agency Agents fixado em commit MIT; 12 agentes importados, hashados e auditados | curar manifestos e avaliações antes de ativação |
| Baseline de lint, tipos e contratos | Parcial | `npm run test:agent-os-contracts` reexecutado: 40 testes aprovados, zero falhas. Typecheck aprovado na revisão anterior; não reexecutado nesta. Lint ignora checkouts upstream e artefatos de QA | A última execução de lint falhou por `prefer-const` em `app/cliente/painel/configuracoes/canais/page.tsx`, fora do escopo Admin. Reexecutar lint e tipos no gate final; o resultado anterior não presume o estado atual |
| Baseline de build | Histórico aprovado; estado atual não homologado | `npm run build` concluiu 367 páginas em 13/10/2026; essa execução não valida alterações posteriores | repetir no CI ou em ambiente com espaço suficiente, sem concorrência sobre `.next`, antes de promoção |
| Validação remota das regras Firebase | Bloqueada pelo ambiente | tentativa retornou `invalid_grant` antes de validar regras | corrigir relógio/credencial do ambiente e repetir; teste estático cobre as coleções Agent OS |
| Job OpenClaw real | Não validado; tentativa local bloqueada pelo ambiente | contrato, bridge e callbacks existem; auditorias estáticas não provam execução. C: recuperou cerca de 14,7 GiB livres, mas a tentativa de iniciar o Desktop ainda não disponibilizou o daemon Linux | recuperar e confirmar o daemon sem reset destrutivo, concluir imagem e teste isolado; depois executar missão de texto integrada. VPS privada segue como alternativa |

## Conclusão atual

A Fase 0 permanece aberta. A importação upstream-first e os contratos da arquitetura de controle têm evidência local; não constituem execução autônoma homologada. Execução real do runtime, baseline final de build, validação remota das regras e ampliação dos gates de risco/sandbox ainda impedem o aceite. O inventário estático administrativo foi revalidado, mas não comprova comportamento das integrações.
