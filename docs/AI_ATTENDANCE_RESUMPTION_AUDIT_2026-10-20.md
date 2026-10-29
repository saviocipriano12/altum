# Revisão de continuidade — IA da Altum

Revisão solicitada pelo usuário neste chat em 20/10/2026, antes da continuidade.
Objetivo: transformar a IA da Altum, adaptável por negócio. Shopify é o primeiro
recorte autorizado de implementação/validação, não a identidade do núcleo geral.
Esta revisão não reabre o planejamento do zero nem aprova qualidade ou publicação.

## Fontes e limites da conferência

Lidos AGENTS, passagem, missão, plano A–G, progresso (incluindo a unidade atual
antes do antigo ponto de retomada), gate de Conversas, inventário de produtores,
auditoria/decisões/manifesto A, plano original, auditoria de funcionamento,
registro de publicação e resumo histórico fornecido pelo usuário.
Conferidos código local relevante, log 412/412 e log atual 2/3, hashes dos dois
arquivos da unidade aberta e recibos locais da publicação posterior de Conversas.
Não houve nova consulta de produção, modelo pago ou conversa real nesta revisão.
Resultados anteriores são evidência histórica do snapshot correspondente.

## O que preservar, evoluir e comprovar

| Área | Já existe / evidência | Evolução necessária / condição de aceite |
| --- | --- | --- |
| Papéis e comportamento | Contratos de papel, especialistas, plano operacional e composer do primeiro programa existem; plano original já adverte sobre as marcações históricas pronta | Consolidar consumidores no agente único; demonstrar diferenças úteis por papel em conversas completas, sem novo conjunto paralelo de regras |
| Contexto e memória | relationship-state/runtime-state e contexto recente persistidos; seleção de 24 turnos/24 mil caracteres | Corrigir cortes upstream: summarizeMessageForAgent ainda limita a 1.200 caracteres; entrada atual a 1.400. Fallback de busca sem ordenação permanece. Evoluir fatos/casos/fontes/correções/retomada em C, com provas de exclusão e acesso |
| Conhecimento | Documentos e buildKnowledgePromptContext existentes | Código local ainda seleciona quatro documentos e corta política em 1.200 caracteres; busca contextual, fontes, revogação e recuperação de trecho relevante precisam provas em C |
| Ferramentas e sistemas | Provider Shopify, catálogo, planos/aprovações/execução existentes | Integrar loop operacional D; provar produto/variante/link e correção sem confundir seleção com busca. Consulta, efeito e confirmação devem ter evidências próprias |
| Entrega e recuperação | Outbox e recibos, controle humano, fontes causais e agendamentos; última ampla da unidade concluída 412/412, zero skips/falhas | B continua aberta: raiz/hook parcial, produtores restantes, legados, ordem/capacidade/concorrência e retenção/migração. Não repetir efeito incerto nem promover legado sem prova |
| CRM passivo | Fila observadora, extração e propriedade manual; correções locais e parte do CRM no pacote de Conversas | Provar cobertura dos ingressos humanos, fatos úteis por negócio, proteção manual, funil configurado e ausência de ciclos. Uma cidade extraída não aprova todo o CRM |
| Humano e copiloto | business-copilot, handoff e controle/posse existentes | Integrar acesso/contexto/rascunho privado e transferência/retomada em E; tarefa criada não equivale a pessoa notificada |
| Aprendizado | learning-signals/policy/approval, tenant-learning, simulação e proatividade existentes | Separar fato, política e estilo; autoria comprovada, amostra revisada e perfil por vendedor aprovado/reversível. Não aprender automaticamente de IA ou exceções comerciais |
| Configuração | Tela e settings/ai existentes | Inventariar controle → persistência → consumidor → efeito/teste; aproveitar tela atual. Provar revisão, recarga, versão ativa e desktop/mobile |
| Avaliação | 104 especificações, 30 reservadas; verificador, sondas e pequeno lote real histórico | Completar setups/oráculos e bateria com modelo real em F, repetições e revisão humana; especificação/teste de protocolo não é conversa aprovada. Preservar teto acumulado US$ 3 e ledger |
| Plataforma e canais | Correções de Conversas publicadas por outro trabalho em 20/10, conforme recibos abaixo | Preservar; ainda faltam provas operacionais de iPhone, latência de evento novo, grupos antigos/mídias antigas e evento Instagram real. Atribuição e áudio seguem trilhas próprias |

## Reconciliação da publicação

A passagem cita a versão histórica dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh.
PUBLICACAO_CONVERSAS_2026-10-20.md e os recibos em
.qa-artifacts/inbox-production-20261020/{promoted,verified}.json registram versão
posterior dpl_Ai2Ldw1KfA7n7PydByigDHNzcJLk, pacote de 115 arquivos,
verificação de hashes e 1.387 fontes anteriores preservadas. Isso é confirmação
documental daquela publicação; não inspeção ao vivo do domínio neste chat.
A migração integral de entrega da IA e o processamento adicional Shopify ficaram
fora desse pacote. Não declarar toda B publicada nem dizer que nenhuma correção
de mídia foi publicada. Reconciliar arquivos compartilhados antes de qualquer release.

## Erro aberto confirmado

Log order-pipeline-errors-first-fix-20261020.log: admissão e pré-claim passam;
lote falha com QA_ORDER_SOURCE_UNAVAILABLE, código 14, em
processPendingOrderPipelineTransitions. Código local confirma await por item
sem isolamento/counter failed. Hashes iguais aos da passagem:

- lib/server/crm/order-stage-transition.ts: ff7e9fe9375f9c2c4c7b4654bc958dd2aed2c50b1c032a9d991915302a6ec2e5.
- tests/crm-stage-transition.emulator.mts: 7a31b57b82cbcad3489eaaa0c59d7f3a05dc9205f4f647a7edee9edaf93fee8f.

Preservar logs de reprovação, sem apagar/zerar para aparentar fechamento.
Corrigir isolamento por item, contar falha, deixar outro item saudável continuar;
falha pré-claim mantém ready/attempts, efeito iniciado permanece conservador.
Testar configuração inválida/estrangeira/ambígua, desconhecido, humano e replay.

## Ordem de continuidade e limites

1. Fechar essa unidade com provas locais e estáticos, registrando limitações.
2. Concluir o inventário B por reprodução: hooks parciais, demais produtores,
   legado/concorrência/capacidade e lixeira/restauração de raízes/recibos sem chatId.
3. Só aprovar B contra o gate completo; então C memória/conhecimento, D agente,
   E operação humana/configuração, F avaliação e G piloto/publicação autorizados.
4. Medir capacidade implementada, testada, publicada e comprovada em uso;
   manter naturalidade e resultado comercial como objetivo de produto.

O usuário autorizou revisão, correções e continuidade local nesta sequência.
Isso não religa automação nem cria/retoma objetivo persistente automaticamente.
Sem subagentes, reset, commit geral, publicação, envio real ou novo gasto.
Checkout compartilhado contém mudanças extensas de outros trabalhos; preservar
admin/auth/público, Shopify e mídia. Sem apagar logs históricos ou dados reais.

## Resultado da primeira correção após a revisão

Isolamento por item implementado no consumidor existente e contador failed
adicionado ao retorno. Testes originais mantidos; acrescentadas provas de erro
desconhecido e configuração inválida/estrangeira/ambígua. Arquivo completo:
83/83 em 196,86s, zero skips/falhas/cancelamentos; classificador puro 2/2;
tipagem ampliada e lint direcionado aprovados. Logs e hashes no progresso.
Ampla histórica 412/412 não foi reexecutada nem somada a esses resultados.
Unidade local aprovada, B ainda aberta; não é entrega de naturalidade, release
ou fechamento de todos os erros. Próxima reprodução definida no progresso.
