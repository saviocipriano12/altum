# ADR-001 — Fronteira do runtime da Agência Altum

**Status:** aceito para o piloto controlado  
**Data:** 12 de outubro de 2026  
**Escopo:** Fases 0 a 2 da missão Altum Admin e Agência Autônoma

## Decisão

A Altum continuará sendo o **control plane durável** da agência. Missões, tarefas, aprovações, limites, conexões, eventos, evidências e auditoria permanecem persistidos e decididos pela aplicação Altum, com escopo explícito de empresa.

O OpenClaw entra somente como **executor privado e isolado**, puxando uma etapa já autorizada e devolvendo eventos assinados. Ele não é a fonte de verdade de uma missão e não recebe credenciais de cliente no prompt ou no envelope.

Nesta etapa não será introduzido um motor geral adicional de workflow. A escolha evita duplicar estado entre Firestore, um orquestrador novo e o runtime de agentes antes de validar uma execução real de baixo risco. Uma avaliação posterior poderá comparar Hatchet, LangGraph e Orca para necessidades que o modelo atual não resolver, como DAG complexa, agendamento extensivo ou longas compensações.

## Fronteira de responsabilidades

| Camada | Responsável | Fonte de verdade |
|---|---|---|
| Objetivo, missão, tarefa, política e aprovação | Altum Admin | Firestore / APIs autenticadas |
| Reserva, lease, tentativa, reconciliação e auditoria | Altum Agent OS | Firestore / eventos assinados |
| Sessão, skill e execução da etapa atual | OpenClaw privado | Executor isolado |
| Ações com dados ou efeitos externos | Ferramentas registradas pela Altum | conexão autorizada + política |
| Conversa e operação diária do cliente | Área do cliente | módulos existentes do cliente |

## Invariantes

- cada despacho, evento e execução tem `tenantId`, `missionId` e, quando houver, `taskId`;
- um worker não inicia uma etapa posterior nem encerra uma missão fora de um callback válido;
- callbacks são autenticados com HMAC e são idempotentes por evento;
- ações externas continuam condicionadas à política e aprovação da Altum;
- lease expirada durante execução gera reconciliação, nunca repetição automática;
- o acesso direto do cliente às coleções do Agent OS permanece bloqueado pelas regras Firestore.

## Consequências

### Positivas

- preserva o contexto, a auditoria e o isolamento multiempresa já presentes na Altum;
- permite trocar ou comparar executores sem migrar o estado comercial da agência;
- impede que um runtime externo passe a decidir aprovações, orçamento ou tenant.

### Limites assumidos

- ainda não há prova integrada de worker real nesta máquina porque o Docker Engine não está disponível;
- dependências em DAG, scheduler completo e compensações continuam fora do piloto inicial;
- a decisão deve ser reavaliada após o primeiro job real e antes de escalar missões paralelas.

## Gatilhos para reabrir a decisão

Reavaliar a introdução de um motor de workflow quando pelo menos um destes fatos ocorrer:

1. uma missão exigir dependências paralelas ou compensação que a máquina de estados atual não represente com segurança;
2. o executor real demonstrar necessidade de agendamento durável além das leases e filas atuais;
3. a execução de piloto demonstrar perda de evidência, duplicação ou recuperação insuficiente;
4. a comparação reproduzível de um candidato externo demonstrar ganho material sem reduzir isolamento ou auditabilidade.
