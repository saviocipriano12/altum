# CRM — matriz de caminhos e cobertura

## Situação consolidada e limite das alegações — 23/10/2026

**Auditoria integral NÃO concluída.** As tabelas históricas abaixo são inventários
parciais de suas datas e não comprovam o estado atual de cada caminho. As unidades
posteriores precisam ser ligadas a cada linha antes de aprová-la. Plano e código
implementado não são evidência de operação integral.

| Capacidade | Evidência disponível | Conclusão permitida | O que impede aprovação integral |
| --- | --- | --- | --- |
| Preenchimento por conversa | 210 conferências determinísticas; 30 estados finais com fornecedor real, dados fictícios e banco local | Defeitos de significado e persistência reproduzidos | Caminho reprovado; sem avaliação semântica contínua de todos os turnos ou canais reais |
| Correção humana | Regressões antes/depois, revisão transacional, memória, qualificação, dossiê e rotas autenticadas em emuladores; nove requisições pelo servidor local com valores conferidos | Precedência dos fatos corrigida nos caminhos exercitados; projeções persistidas atualizadas atomicamente | Inventário de outros leitores/relatórios e jornada visual ainda sem aprovação; ver CRM_CORRECAO_FONTE_COMERCIAL_2026-10-23.md |
| Adaptação por negócio | Leitura do código e comparação executada entre blueprint de agenda e venda consultiva | Modelos diferem, mas qualificação manteve os mesmos critérios fixos | Campos/regras/configuração não demonstrados de ponta a ponta em operações diferentes |
| Leitura de mídia | Poucos arquivos sintéticos com fornecedor real; regressões com interpretações fabricadas | Casos específicos exercitados | Sem generalização para ruído, encaminhamento, documentos, vídeos e transporte real |
| Autoridade, filas e integridade | Lotes locais e falhas induzidas documentadas por unidade | Proteções dos casos executados | Inventário de todos os escritores/leitores e cenários combinados ainda não fechado |
| Rotina visual | Tentativas de navegador e carregamento persistente | Experiência sem aprovação | Causa do travamento não isolada; jornadas completas não homologadas |
| Canais em produção | Consultas de leitura e estados armazenados de canal | Apenas os registros consultados são conhecidos | Estado armazenado não é teste atual de entrega, recebimento ou preenchimento |
| Relatórios e resultado | Inspeções parciais e contratos propostos | Definições e conciliação permanecem abertas | Sem rastreio integral de indicador até registros/pagamentos e regras da empresa |

### Causas comprovadas, separadas de hipóteses

1. `qualification.ts`, `lead-dossier.ts` e a revisão da ficha leem/escrevem fontes
   diferentes com precedências distintas. A divergência não era somente visual;
   a correção de 23/10 unifica os caminhos testados. Isso não fecha o inventário
   de leitores legados, relatórios e integrações.
2. O observador acumula candidatos das regras antes da extração semântica e só
   adiciona/substitui fatos retornados. Não confirmar não veta o candidato anterior.
3. O contrato de fatos não distingue ausência, indefinição, retirada e conflito.
   O qualificador pode contar uma frase de ausência como orçamento compreendido.
4. O blueprint persiste campos por processo, mas a qualificação e a enumeração de
   campos do extrator mantêm critérios fixos em pontos centrais.
5. Estados técnicos concluídos ou desconhecidos podem aparentar informação conferida.

A razão do carregamento persistente da UI, as condições atuais dos canais e o
rollout semântico de produção não estão fechados. Não atribuir esses problemas a
uma causa sem reprodução e rastreio suficientes.

### Regra de conclusão da auditoria

Para cada capacidade, registrar pergunta de negócio, regra esperada, entradas,
produtores, armazenamento, consumidores, efeitos, erro/recuperação e ambiente de
teste. Cada falha exige entrada reproduzível, esperado, resultado persistido,
caminho causal e teste que continue exigindo o comportamento correto após a
correção. Diferenciar fonte externa real, fornecedor real com dados sintéticos,
emulador, simulação de falha, inspeção de código e teste visual.

Os resultados dos relatórios profundos foram recontados nos JSONs em 23/10:
210 conferências determinísticas (87 corretas, 123 falhas) e 30 estados finais
semânticos (18 corretos, 12 falhas), sem erro de infraestrutura nesses registros.
Os nove arquivos de configuração da avaliação e código central comparados ao
manifesto de hashes não mudaram desde a execução registrada. Isso estabelece
rastreabilidade da amostra; não demonstra cobertura de arquivos não examinados.

As expectativas da bateria foram criadas para a auditoria; revisão independente
por pessoas da operação e homologação completa não ocorreram. A falta dessa
verificação é uma lacuna explícita, não aprovação presumida.

Referências: `CRM_DIAGNOSTICO_FUNCIONAL_2026-10-22.md`,
`CRM_DIAGNOSTICO_PROFUNDO_2026-10-23.md` e respectivos scripts/resultados.

## Inventário histórico inicial

Inventário inicial da missão, 21/10/2026. “Local” significa teste no emulador;
nenhuma linha desta matriz implica publicação ou prova de conta externa.
Estado: parcial; deve acompanhar a migração dos contratos de dados e atividades.

| Caminho | Fontes centrais | Proteções observadas | Trabalho restante |
| --- | --- | --- | --- |
| Lista/funil/ficha | APIs leads e pipeline; crm/page; pipeline/page | Empresa e carteira; correções locais da primeira unidade | Aliases históricos de dono, paginação integral, fonte única da ficha e atualização |
| Criação manual | leads POST | Funil, cadastro/evento/auditoria na mesma transação | Identidade concorrente, limite concorrente, contato derivado e automações pós-commit |
| Nova negociação de pessoa conhecida | leads/[leadId]/opportunities; crm/opportunities; contacts/aliases | API local com revisão, criação/vínculo/evento atômicos, requestId, replay canônico e acesso por negócio | Seleção explícita na conversa, UI, edição e métricas de pessoa versus negociação |
| Edição manual | manual-update; profile PATCH; stage POST | Versão do lead, autoria, funil e ocorrência causal | Todos os fatos comerciais editáveis; liberação de autoria e proteção uniforme |
| Importação/intake | leads/import; lead-intake; contact-links | Funil real, identidade paginada e separação conservadora de cadastro/compra, preservação humana | Todos os importadores, migração de aliases e atribuição explícita da entrada à negociação |
| Observação passiva | conversation-intelligence; observation-queue; conversation-commercial-context; conversation-projection-effects | Origem/gerações nos fatos e projeção; projeção/tarefas/históricos atômicos; ambiguidade como awaiting_context | Seleção e fronteira temporal; fatos junto de perguntas, avaliação por campo/canal e autoria geral |
| Automação de etapa do observer | conversation-stage-transition; automation-stage-delivery; automations | Ocorrência junto da etapa, contexto/funil/módulo/autoria/responsável revalidados, tarefas e envios agendados/recebidos vinculados à fonte | Curadoria/retomada de interrupções; autoridade e idempotência dentro de aprendizado/conversão; escritores do agente |
| Agente conversacional | ai/agent; field-ownership; runtime-state; inbound-enrichment-write | Admissão inicial, memória tardia com contexto nos três ramos, geração/tenant na memória, anotação multimodal por revisão | Tarefas, propostas, dossiê, etapas e entrega do agente ainda precisam do mesmo contexto; avaliação de extração/evidência e curadoria de recusas |
| Arquivos de conversa | firebase-storage; multimodal; evolution-media-recovery; chat-media-playback; media GET | Objeto novo identificado por IDs completos/papel/MIME/bytes, gravação imutável; anotações do agente por geração/revisão | Gerar e revalidar referências de cache após download/transcode; geração e acesso corrente na rota; limpeza de órfãos; prova por canal |
| Automação de etapa manual | manual-stage-transition; automations | Fonte, revisão, escopo e capacidade revalidados | Cobertura de todas as ações/gerações e contrato único de atividades |
| Automação genérica | automations; automation-internal-effect | Protocolos causais em caminhos migrados | Inventariar produtores legados e tarefas diretas antes de declarar cobertura |
| Propostas | budgets; proposal-mutation; proposal-* | Revisão, efeitos e recibos em partes migradas | Itens/aceite/envio verificáveis, autoria geral e definição financeira |
| Ecommerce | ecommerce-projection; order-stage-transition | Projeções Shopify e etapas com recibos | Demais provedores, ordem, identidade e oportunidades múltiplas |
| MCP | drafts/apply; draft-mutation | Aplicação aprovada de alguns tipos com autoria/recibo | Cobertura dos tipos legados, atividades e novos vínculos |
| Distribuição | leads/distribute e undo | Auditoria, atribuição e desfazer | Propagação total, concorrência e transferência de compromissos |
| Tarefas manuais | lead_tasks; activity-mutation; tasks GET/POST/PATCH; crm-task-index | Transação com evento, autoridade corrente, responsável, datas, requestId e versão; metadados de ordenação no mesmo commit; unidades 4/35/37 | Escritores diretos/genéricos e restauração, cobertura final do índice, colaboração/transferência e validação no aplicativo completo |
| Atividades | activities GET; activity-read; crm-activity; CommercialActivities | Leitura completa por páginas internas; escopo atual e adaptadores task/appointment; busca/filtros no servidor com fuso e preferências; atualização com contexto e rascunho; unidades 35–37 | Paginação real com custo limitado e ordem global, seletor de cliente paginado, continuidade após salvar/navegar e desempenho de carteira grande. A leitura atual ainda varre o conjunto inteiro |
| Agenda | appointments; agenda/page; scheduling; CommercialActivities | Retornos da mesma fonte da ficha; compromissos em visualização própria carregada sob demanda; cancelamento por contexto, prazo de espera e filtros salvos da rotina | Aceite visual/teclado/mobile, todos os escritores de compromissos e colaboração; integração atual em código não comprova a rotina completa |
| Exclusão de lead | DELETE perfil; bulk-delete; tenant-data-deletion | Seleção inteira, autoridade em cada página, manifesto exclusivo por geração e guarda do pai | Retomada/recuperação integral e conciliação do legado |
| Exclusão de conversa | DELETE chat; bulk-delete; tenant-data-deletion | Lote completo, dono atual do canal e autoridade transacional | Retomada e prova de geração também na restauração |
| Restauração/expurgo | trash; tenant-data-deletion | Preparação encerrada verificável, estados na UI, retenção paginada, conflito e quarentena | Reserva/revogação durante recuperação e expurgo; preparo realmente incompleto e conciliação |
| Gestão/busca | metrics-summary; search; reports | Alguns caminhos usam leitura paginada de outra unidade | Conciliar definições/cobertura; vínculo oportunidade e exportação |

## Entradas de exclusão em produção de código

- app/api/tenant/[tenantId]/leads/[leadId]/route.ts — DELETE.
- app/api/tenant/[tenantId]/leads/bulk-delete/route.ts — POST.
- app/api/tenant/[tenantId]/chats/[chatId]/route.ts — DELETE.
- app/api/tenant/[tenantId]/chats/bulk-delete/route.ts — POST.
- app/api/tenant/[tenantId]/trash/route.ts — listagem, restauração e expurgo.
- lib/server/tenant-data-deletion.ts — retenção periódica e helpers internos.

O acesso inicial de uma rota não equivale à autorização de uma operação longa.
Permissão, proprietário e versão da fonte devem continuar válidos nos commits
que removem dados. Essa cobertura ainda está em andamento na missão.

## Gatilhos de aceite integral ainda abertos

Os lotes locais não encerram o plano integral. Continuam obrigatórios: múltiplas
oportunidades com seleção explícita e histórico por negociação; liberação humana
de campos para IA; cobertura de todos os escritores/recuperações; rotina e carteira
com paginação/continuidade; processo comercial e resultados conciliáveis; gestão
com denominadores/exportação; avaliação separada de IA (200 turnos/30 jornadas e
metas por campo); desempenho com 10 mil contatos e metas p95 do plano; jornadas
visuais/acessíveis e sessões de uso; pacote de migração/publicação/reversão e piloto.
Nenhuma dessas condições é comprovada apenas pelo total de testes dos lotes.

Unidade 37: 139 testes locais passaram, tipos/lint do pacote passaram. Prévia e
reversão de metadados comprovadas apenas no laboratório fictício. Quatro índices
estão preparados, não implantados; escrita direta ainda não garante a projeção.
Build completo de revisão em andamento, sessão 66032. Navegador local foi
reconsultado e continua desativado no Work; sem novo aceite visual.
