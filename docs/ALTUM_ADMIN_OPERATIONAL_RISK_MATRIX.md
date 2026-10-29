# Matriz de risco operacional — Altum Admin e Agência Autônoma

**Atualizada em:** 12 de outubro de 2026  
**Escopo:** control plane administrativo, runtime privado e adoções upstream. Não substitui as políticas específicas de dados, financeiro, jurídico ou segurança corporativa.

## Regra de decisão

Uma automação só pode avançar quando houver: escopo explícito de empresa, agente autorizado, evidência rastreável e política de aprovação compatível com o impacto. Ausência de qualquer um desses elementos resulta em bloqueio, não em execução degradada.

| Risco | Dono | Barreira obrigatória | Evidência para liberar ou encerrar |
|---|---|---|---|
| Um agente operar dados da empresa errada | Plataforma Altum | `tenantId` obrigatório nos contratos; coleções críticas sem acesso direto de cliente; validação de tenant em APIs e callbacks | Contrato validado, teste de regras e registro de missão/tarefa com o mesmo `tenantId` |
| Tarefa ser concluída sem trabalho executado | Runtime + plataforma | Somente callback HMAC recente e idempotente pode concluir tarefa; avanço manual está removido | Evento assinado, execução vinculada ao despacho e evento de domínio correspondente |
| Repetição de uma ação após timeout ou reinício | Runtime | `eventId` e despacho idempotentes; leases limitados; reconciliação antes de retomar execução ambígua | Recibo do executor ou decisão explícita de reconciliação registrada |
| Publicação, mensagem, compra, exclusão ou uso de identidade sem autorização | Gestor da operação | Política de aprovação por capacidade; `externalActionsRequireApproval`; bridge proíbe ação externa no worker inicial | Aprovação humana vinculada à missão, tarefa e payload proposto |
| Vazamento de segredo de cliente para agente, prompt ou VPS | Plataforma / infraestrutura | Segredos ficam no servidor/cofre; runtime recebe envelope mínimo; gateway privado de modelos | Revisão do envelope, variáveis de ambiente privadas e nenhum provider secreto no runtime |
| VPS ou gateway OpenClaw exposto publicamente | Infraestrutura | Pull privado HTTPS; sem Control UI exposta; porta do runtime não publicada | Firewall/rede privada verificados e health check sem interface pública |
| Modelo ou ferramenta agir fora do escopo | Dono do agente | Manifesto com capacidades, responsável, avaliação e política; especialistas importados começam em revisão | Manifesto ativo com avaliação aprovada e trilha de auditoria |
| Fonte upstream introduzir licença ou código incompatível | Engenharia + jurídico | Registro de origem, commit fixado, licença e decisão de adoção antes de importar | Auditoria de fonte aprovada; AGPL e fontes de alto risco isoladas ou bloqueadas |
| Conteúdo externo induzir instruções maliciosas | Segurança de IA | Conteúdo tratado como dado; ferramentas com escopo mínimo; aprovação para efeitos externos | Fonte e artefato preservados como evidência, sem instruções externas executadas implicitamente |
| Relatório ou métrica induzir decisão errada | Gestor + dados | Evidência e origem obrigatórias para resultados; distinguir hipótese, resultado e execução | Artefato, fonte, período e responsável associados à missão |
| Falha do runtime deixar missão em estado enganoso | Plataforma | Estados honestos (`not_configured`, fila, claimed, execução); reconciliação para trabalho ambíguo | Linha do tempo da missão, status de execução e decisão de retomada/encerramento |

## Limites de autonomia por estágio

1. **Planejar e analisar:** permitido com dados e ferramentas explicitamente autorizados; gera proposta e evidência.
2. **Preparar artefatos:** permitido quando o destino não cria efeito externo; permanece revisável no Admin.
3. **Executar efeito externo:** exige política da capacidade e aprovação humana, salvo política futura explicitamente aprovada, auditada e limitada por orçamento/domínio.
4. **Escalar ou repetir:** exige reconciliação quando a execução anterior estiver ambígua; nunca repetir silenciosamente.

## Gates de operação da VPS

Antes do primeiro job real do OpenClaw, infraestrutura deve registrar:

- fork no commit aprovado e bridge instalada;
- segredo compartilhado com rotação definida;
- saída HTTPS da VPS para a Altum e nenhuma interface administrativa pública;
- uma missão de texto sem ação externa, com callback assinado e evidência no histórico;
- teste de cancelamento e de reconciliação antes de liberar capacidades externas.

Os detalhes de implantação vivem em `OPENCLAW_RUNTIME_ADOPTION.md`. A matriz não declara a VPS pronta; ela define a evidência necessária para fazê-lo.
