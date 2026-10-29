# CRM — inventário de escritores e retomada da fase B

19/10/2026. Recorte Shopify. Inventário parcial baseado no código atual, não
aprovação global do CRM. Não foram alterados pedidos, dados reais ou o conector
Shopify de outros trabalhos. B e o gate 2 continuam abertos.

## Caminhos modificados nesta unidade

| Caminho | Evidência local | Limitação |
| --- | --- | --- |
| `leads/[leadId]` PATCH | Perfil, autoria manual de etapa/prioridade/tags e evento atômicos; versão do snapshot autorizado; metadado enviado pelo cliente ignorado. Handler autenticado local exercitado. | Conflito 409 precisa UX; outros campos e liberação explícita na interface ainda não migrados. |
| `leads/[leadId]/stage` POST | Acesso comercial antes de qualquer escrita/fan-out; snapshot revalidado; etapa manual e evento atômicos. Vendedor de outro responsável recebe 403, inclusive com force, sem alterar versão do lead. | Validação/contexto padrão e efeitos posteriores da etapa continuam legados; não há recibo causal integral do fan-out. |
| `automation-internal-effect.ts`, inbound novo | Protocolo 4: etapa/prioridade/tag + evento + recibo juntos; baseline de campo, versão do funil e replay conservador. Tipos adiados preservam humano após commit sem finalização. | Não promove protocolos 2/3; root/scheduler e configuração ainda dependem de migração coordenada. |
| Mesmo executor, gatilhos legados | Mutação transacional respeita propriedade manual e IDs do funil real; não acumula patch antigo nem recria lead excluído no flush final. | Sem ocorrência causal durável. Não declarar replay de todos os gatilhos resolvido. |
| `ai/agent.ts`, atualização de CRM | Funil salvo substitui estágios do perfil inicial neste caminho. Campos manuais protegidos e versão do lead conferida no commit. | Ainda não é novo agente; heurísticas, outros efeitos e corrida com configuração precisam revisão. Conflito é marcado como skip, não fingir reagendamento. |
| `crm/operations.ts` e observador | Score manual/etapa manual preservados; commit de snapshot superado não grava análise. Observador mantém recibo crm_written e solicita retry em conflito; informa avanço efetivo, não mera permissão. | Tarefas/fan-out derivados ainda precisam identidade/retomada integral. Caminho de conflito do observador inspecionado, não fault-injection autenticado completo. |

## Próximos escritores a migrar, antes de fechar B

Atualização 20/10, ações Shopify: intenção e lote ligados à ocorrência, com
fingerprint/revisão/guard e validação no claim e antes do envio. Projeção do pedido
persistido, fonte, destinatário, configuração e controle humano são revalidados;
webhook não executa pendências vizinhas. Não muda automaticamente o lead para
ganho nem comprova entrega por retornar do handler. Regressão intermediária
169/169; verificação final I/O/transientes e compatibilidade passou 72/72 após
restaurar emuladores Auth/Storage. Regressão principal final 169/171: dois workers
frios ultrapassaram o timeout de 25 s, mantido. Diagnóstico pendente, não homologado.
Registro integral no progresso. Isso não migra
todos os escritores nem encerra B; ordem/LTV, revisão vinculada, conciliação,
retencão/migração e release continuam abertos.

1. `lib/server/crm/stage-transition.ts`: **caminho de etapa migrado localmente**.
   Valida ownership/funil em transação. Shopify passa evento persistido ao novo
   helper `order-stage-transition.ts`, com etapa/evento/recibo/trabalho atômicos,
   retomada ready pelo processador existente e conciliação de efeitos incertos.
   Não altera fato de pagamento quando preserva etapa humana. Resta migrar ações
   internas do fan-out, revisão/ordem de pedidos e saúde/retencão. Outros campos
   escritos por ecommerce/intake ainda não seguem integralmente esse contrato.
2. `app/api/tenant/[tenantId]/budgets/route.ts`: POST migrado localmente para
   proposta/evento/avaliação de etapa atômicos, cliente/acesso atuais e funil real.
   Rascunho não regrava lead; Enviado respeita etapa manual e ausência de proposta
   no funil. Recibo registra motivo/versão/antes/depois; ownership automático
   guarda budgetId. Baseline 4 reprovações corrigidas; 43 testes locais aprovados
   no primeiro lote ampliado. Regressão final 66/66 em 57,82 s nos nove arquivos
   documentados no progresso; tipagem/lint aprovados. Atualização seguinte:
   formulário passou a enviar Idempotency-Key persistida por tenant/vendedor;
   POST com chave grava receipt/proposta/evento/etapa juntos e replay não regrava.
   Concorrência, conflito de conteúdo, exclusão, acesso e restart em processo
   separado aprovados na regressão final 76/76 em 77,92 s, tipos/lint aprovados.
   Compatibilidade sem chave continua sem proteção (retryProtected:false);
   não homologar universalmente. QA visual e retenção/tombstones do receipt
   jobs existente ainda pendentes; aprendizado auxiliar sem retomada durável.
   PATCH em `budgets/[budgetId]/route.ts` migrou para proposal-mutation:
   proposta/revisão/etapa/evento/receita pendente/job no mesmo commit. ID financeiro
   estável por proposta, duplicata ou valor divergente exige conciliação; legado
   compatível é preservado. UI envia expectedRevision; consumidor periódico
   existente retoma ready e concilia iniciado incerto. Baseline 0/4, lote corrigido
   10/10; regressão final 125/125 em 135,20 s, oito arquivos, 11 testes do PATCH.
   Tipagem/lint aprovados; falha após tarefa exige conciliação sem duplicação.
   Cerca por ramo não é por ação interna;
   elegibilidade legada, retenção/saúde/restart reais e callers sem revisão pendentes.
3. `app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts`: três tipos
   update_lead/assign_lead/create_proposal migrados localmente para transação de
   alteração/evento/ownership/auditoria/recibo. Revisão congela conteúdo/cliente;
   replay exige recibo novo e acesso atual. Lote inicial 10/10; tipagem ampliada e
   lint aprovados. Histórico before dos campos alterados e rejeição de rascunho
   obsoleto corrigidos após dois testes adicionais reprovarem. Regressão final
   157/157 em 139,94 s (15 arquivos), incluindo 12 novos testes autenticados do
   draft e 22 de entrega MCP. Não cobre create_lead, tarefas/notas e demais
   tipos legados, nem propostas gerais POST/PATCH. Aprendizado auxiliar após
   proposta permanece best-effort; não anunciar entrega externa ou fluxo integral.
4. Criação/importação/intake de leads: distinguir valor inicial de edição humana;
   recordInboundLead passou a reler em transação e gravar cadastro/evento/submissão
   juntos. Preserva etapa/responsável preenchidos, tags bloqueadas, identidade e
   notas existentes; observações novas ficam no evento. Cliente excluído depois
   do lookup não ressuscita. Default novo validado no funil real; operations exige
   recomendação presente no funil antes de avançar. Regressão final 91/91 em 87,02 s
   (9 arquivos), tipos/lint aprovados. Inclui 9 testes novos e regressão de identidade
   com emuladores explicitamente configurados; sem prova de produção.
   Atualização: matching passou a detectar duplicatas e conflito entre todos os
   identificadores; sourceId confere tipo/canal, perfil externo confere canal e
   escopo ausente pede revisão. Busca refeita em transação impede escrever após
   mudança de identidade/duplicata detectada entre lookup e commit. Baseline 0/6,
   primeiro lote corrigido 15/15; regressão final 101/101 em 97,62 s, tipos/lint
   aprovados (19 testes do intake). Não cria fluxo
   de conciliação nem prova identidade para ler pedidos privados; conta/loja,
   normalização/aliases legados e canonicalização ainda pendentes.
   Atualização seguinte: intake usa lead_identities com namespace intake_identity
   e protocolo 1 para email/telefone aceitos. Criação simultânea converte perdedor
   em atualização do mesmo lead (created=false), sem lançar erro de seleção antiga;
   vínculo/cadastro/evento compartilham commit. Excluído/identidade alterada ou
   vínculo inválido bloqueiam, sem fallback para recriação. Baseline 0/3 corrigido,
   lote 26/26 em 31,44 s inclui outro processo e preservação de humano. Regressão final
   108/108 em 91,96 s (9 arquivos), tipos/lint aprovados. Canonicalização
   com todos os escritores/perfis sociais/contas ainda não homologada; protocolo
   novo requer retenção/exclusão e migração compatíveis antes de publicação.
   Replay por ocorrência, customFields
   com mesma chave, contato/derivados pós-commit e outros importadores permanecem
   pendentes. Não chamar proteção dos campos de migração completa da identidade.
   Atualização seguinte: três projeções Shopify pós-intake (pedido, carrinho abandonado
   e recuperado) migradas para ecommerce-projection. Projeção/evento/recibo atômicos,
   prioridade/tags manuais protegidos e fonte/conta/alvo revalidados. Replay preserva
   edição humana posterior; legado/parcial/alterado exige conciliação. Baseline 0/3
   e caso sync 0/1, lote corrigido 11/11 em 16,21 s; tipos/lint aprovados. Sync Shopify
   distingue snapshots por digest canônico. Outros provedores permanecem legados.
   Retenção/migração de IDs de sync, admissão imutável antes do intake, ocorrência
   integral, potencialValue/valorPotencial, múltiplos pedidos/ordem e fan-out pendentes.
   Regressão ampliada 118/119 (lock timeout no perfil com 20 concorrentes); mesmo
   caso isolado 1/1 e reexecução integral idêntica 119/119 em 100,92 s. Não retirar
   risco intermitente nem declarar concorrência global corrigida; evidência no progresso.
   Unidade seguinte migrou admissão/exclusividade root Shopify: fonte congelada antes
   do intake, um executor, done não repete handlers, ready recuperável no processador
   existente; falha parcial/expirado exige conciliação. Fonte/conta revalidadas por ramo;
   metadados/contadores e done atômicos, sem recriar conexão excluída. Baseline 0/2,
   regressão principal 131/131 em 102,39 s, tipos/lint aprovados. Não resolve cerca por
   ação, reconciliação granular, eventos fora de ordem/LTV e demais limites B.
   Regressão adicional do consumidor compartilhado: 81/81 em 125,42 s (3 arquivos,
   incluindo repetição dos 23 casos Shopify), tipos/lint aprovados. Índices novos
   apenas definidos localmente; não é publicação nem homologação operacional.
5. Valores históricos sem autoria: auditoria/migração conservadora. Não inferir
   manual/IA apenas por existir valor, nem reescrever toda carteira.
6. Metadados de Conversas: prioridade/tags do PATCH do chat são do chat; no trecho
   inspecionado não são espelhados no lead. Atribuição altera owner do lead fora
   de transação conjunta. Não confundir esses campos com os três já migrados.

## Prova e limites

- Regressão ampliada: 98/98 em 116,73 s; 10 arquivos, emulador Firestore e
  transportes simulados. Inclui 10 testes comportamentais novos da mutação CRM.
- Handlers reais com Auth/Firestore locais: 3/3 em 10,98 s. Tokens do emulador,
  empresas/usuários fictícios; nenhuma alteração de autenticação, bypass ou segredo
  de produção. Não é teste de navegador nem HTTP de um servidor Next publicado.
- Typecheck direcionado inclui ambos os handlers e teste autenticado; aprovado.
  ESLint sem erros; dois avisos no agent, em trechos não modificados nesta unidade.
- Tentativa anterior ampliada: 93/94; teste textual antigo exigia autoria humana
  fixa. Substituído por verificação AST exata de automação→IA→humano, preservando
  todas as outras exigências. Não houve relaxamento de meta de segurança.
- Sem build global, publicação, conta de cliente, restart real, piloto ou modelo
  real nesta unidade. Os 101 testes não são os 104 cenários de aceitação final.
- Rollback preserva recibos/propriedade; drenar workers incompatíveis antes de
  trocar pacote. Voltar para código que ignore ownership não preserva a garantia.

## Atualização — transição causal de pedido

- Dois defeitos acima reproduzidos antes de mudar: etapa manual sobrescrita e
  etapa padrão inserida fora do funil. Assertions preservados e aprovados depois.
- 12 testes novos de transição: concorrência, retomada ready, fonte/conta/lead,
  alteração humana/funil, fonte removida, estado incerto, falha após primeira tarefa,
  rollback de armazenamento, compra não confirmada e consumidor Shopify completo.
- Regressão atual: 123/123 em 124,36 s nos 13 arquivos documentados no progresso;
  typecheck ampliado/lint/diff check aprovados. Não é bateria final conversacional.
- Consumer completo usa entrada interna trusted com fixture e email já vinculado;
  não testa assinatura da loja nem garante vinculação somente por ID do pedido.
- Antes de cada ramo do fan-out há revalidação; cada ação de automação legada ainda
  precisa seu próprio contrato causal/outbox. Condição de segurança não significa
  entrega operacional completa. Sem publicação, modelo pago ou operação real.

Próxima unidade: propostas/drafts/intake e causalidade das automações de etapa,
antes de auditar a saída B. Ordem de pedidos, configuração de IDs próprios,
retenção, saúde e restart real continuam explícitos. Não iniciar C.
