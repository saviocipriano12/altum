# Ficha de avaliação — candidatos “Orca”

**Capability ID:** `agent-orchestration-evaluation`  
**Status:** `candidate — selection made, not integrated`  
**Data da revisão:** 12 de outubro de 2026

## Desambiguação

O nome “Orca” apontava para três projetos tecnicamente distintos. Todos foram checados no commit registrado e declaram licença MIT, mas não resolvem o mesmo problema.

| Fonte | O que é | Decisão Altum |
| --- | --- | --- |
| `orca-cli/orca` @ `5beeefcb…` | Binário Go com SQLite, DAG, worktrees e MCP para coordenar agentes de código | **Candidato primário de avaliação** para agentes técnicos e trabalho em repositórios |
| `orka-agents/orka` @ `0001a7b…` | Plataforma Kubernetes de Tasks isoladas, com API, dashboard e modelos no cluster | Benchmark de infraestrutura; não adotar agora. O próprio upstream se declara experimental e não recomendado para produção |
| `Nethyric/orca` @ `a568ef0…` | Agente desktop autônomo para máquina do usuário | Fora do escopo. Não é runtime multi-tenant nem serviço interno da Altum |

## Decisão

`orca-cli/orca` é o único “Orca” que segue para uma prova comparativa com OpenClaw, Hatchet e LangGraph, restrita a engenharia: execução de uma tarefa em checkout descartável, registro de DAG, retomada, isolamento de worktree e recibo de resultado.

Ele não será usado como runtime universal da agência sem essa prova. Seu modelo de worktree é adequado para código, mas não substitui a governança multiempresa, aprovações, conexões, custos ou o executor de tarefas de marketing da Altum.

## Gate de validação

1. Executar o binário original em um checkout público descartável.
2. Criar uma tarefa sem segredos que gere somente um artefato de texto ou alteração reversível.
3. Verificar estado persistente, DAG, logs, worktree, cancelamento e retomada.
4. Comparar o mesmo cenário com o contrato de dispatch/evento da Altum.
5. Decidir se entra como ferramenta do agente técnico, não como dependência do app.

## Limites permanentes

- Não executar em repositórios de clientes nem com credenciais de produção no piloto.
- Não conectar o MCP de terceiros diretamente às coleções Firestore.
- Não substituir o runtime de marketing ou atendimento pelo runtime de código.
- Não considerar o projeto desktop `Nethyric/orca` uma opção de servidor.
