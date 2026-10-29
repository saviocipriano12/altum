# Diagnóstico da superfície administrativa

**Base da leitura:** `node scripts/audit-admin-surface.mjs --summary`, reexecutado nesta revisão com saída zero.  
**Objetivo:** distinguir o que já compõe o control plane da agência, o que é operação administrativa existente e o que ainda exige validação antes de ser tratado como capacidade autônoma.

## Inventário verificável

| Superfície | Quantidade | Leitura |
|---|---:|---|
| Rotas de tela Admin | 40 | Interface administrativa existente |
| Rotas de API Admin e internas | 91 | Operação, control plane, integrações e jobs protegidos por rota |
| Módulos do Agent OS | 48 | Contratos, memória, decisões, criativos, modelos, runtime e reconciliação |
| Candidatos a worker | 8 | Execução de criativos, avatares, modelos e runtime; não significa autonomia liberada |
| Definições de job | 14 | Timers/serviço de IA, automações, comercial, campanhas, financeiro, integrações e relatórios |

## Mapa por responsabilidade

| Bloco | Superfícies principais | Situação | Regra de produto |
|---|---|---|---|
| Control plane de missões | Missões, agentes, aprovações, políticas, eventos e execuções | Fundado e auditado por contratos | É o núcleo para planejar, aprovar, acompanhar e explicar trabalho autônomo |
| Comando e memória | Comando, conversas, anexos, memórias e resultados | Existente, com fronteira de aprovação | Serve o operador Altum; não é substituto do atendimento da área do cliente |
| Conexões e ferramentas | Ferramentas, MCP, conexões, providers e health checks | Existente, exige curadoria por conexão | Credenciais e permissões ficam em segunda camada; uma conexão não concede autonomia por si só |
| Estratégia e operação | Estratégias, campanhas, marca, mídia, criativos, projetos, pipeline e playbook | Operação administrativa existente | Agentes podem propor e preparar; ações externas dependem da política e aprovação |
| Receita e clientes | Clientes, portal, financeiro, orçamentos e SaaS | Administração de contas e receita | Não absorve conversas, catálogo ou atendimento cotidiano, que pertencem à área do cliente |
| Serviços internos | 18 rotas internas e 14 jobs | Execução programada existente | Cada job deve manter idempotência, escopo por empresa e trilha de auditoria antes de virar autonomia |

## Classificação de maturidade

### Pronto como fundação do Agent OS

- Missões, tarefas, aprovações, políticas, despachos, execuções e reconciliação têm contratos e estados explícitos.
- O catálogo de Agency Agents mantém especialistas importados em revisão até existir dono, avaliação e política de aprovação.
- Eventos do runtime produzem trilha de domínio para missão, tarefa e execução, e seus artefatos passam a existir como evidências normalizadas da missão.
- O runtime é executor isolado; Altum mantém a decisão, identidade de empresa, aprovações e memória de negócio.

### Existente, mas não deve ser apresentado como autonomia pronta

- Jobs de IA, comercial, campanhas, criativos, comércio e financeiro existem como superfícies operacionais, mas precisam de avaliação individual de efeitos externos, evidência e retomada.
- Conexões MCP, modelos e ferramentas são capacidade técnica: ativação depende de escopo, saúde, autorização e política da empresa.
- Telas de cliente, financeiro e operação não provam que uma ação específica é reversível, autorizada ou segura para execução por agente.

### Legado ou fora do núcleo atual

- `audit_events` permanece classificado como legado no inventário de dados; novos fatos de missão usam `agent_domain_events` e `audit_logs`.
- Atendimento, SDR, closer, catálogo, produtos e conversas do negócio continuam na área do cliente. O Admin pode orquestrar e observar, mas não substitui essa camada.
- OpenClaw ainda não foi homologado em job real. A tentativa local de construção foi interrompida com o Docker sem responder e apenas cerca de 1,65 GiB livres no C:. Preparação de VPS e teste isolado não equivalem a runtime ativo; ver `OPENCLAW_RUNTIME_ADOPTION.md`.

## Critério para promover uma superfície a autonomia

Uma tela, API ou job existente só entra no catálogo de ações autônomas após comprovar:

1. empresa e dono identificáveis;
2. capacidade permitida por manifesto/política;
3. efeito externo classificado e, quando necessário, aprovação humana;
4. idempotência, cancelamento, timeout e reconciliação;
5. evidência legível no Admin.

Esse critério impede que a quantidade de APIs ou jobs seja confundida com capacidade autônoma real.
