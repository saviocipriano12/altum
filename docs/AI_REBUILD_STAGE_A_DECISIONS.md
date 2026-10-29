# Reconstrucao Shopify — decisoes e gate A

19/10/2026. Estado: A encerrada em diagnostico/contratos; B em inicio local.
Ver auditoria AI_REBUILD_STAGE_A_EXIT_AUDIT.md e autorizacao do usuario para corrigir
a divisao das fases. Nao aprova jornadas, piloto, gasto adicional ou publicacao.

## Decisao tecnica do executor

Adotar um unico executor TypeScript no backend existente, com estado duravel no
Firestore e entrega pela outbox existente. Um agente principal por turno; extracao,
CRM e aprendizado sao consumidores independentes, nao varios vendedores artificiais
disputando a conversa. Nao instalar outra plataforma/infra de atendimento nesta
rodada. Nao acrescentar dependencia para recriar filas ou duplicar o armazenamento.

Razao: o requisito mais urgente e corrigir contexto, ferramentas e verificacao de
efeitos na infraestrutura ja conectada aos canais. Colocar Dify/LangGraph ao lado
agora nao elimina conflitos de posse, eventos, autorizacao ou CRM. Essa escolha e
de engenharia para a implementacao, nao prova de superioridade sobre frameworks.

O loop novo deve ter contrato explicito de ferramentas e checkpoints; nao delegar
o envio ao modelo nem manter os resgates comerciais genericos como segundo cerebro.
Limites propostos preservados: 6 decisoes, 8 tools, 2 reparos, 60s. Precisam ser
exercitados/ajustados antes de congelar avaliacao, nunca relaxados para esconder falha.

Fornecedor inicial: adaptador OpenAI existente, sem criar roteador admin nesta missao.
Modelo do lote inicial: GPT-4.1 Mini, snapshot gpt-4.1-mini-2025-04-14, escolhido
apos usuario autorizar somente US$ 3 acumulados e solicitar opcao mais barata.
Nao e US$ 3 por rodada; nao autoriza bateria integral. Reserva duravel obrigatoria
antes de qualquer chamada paga. Nenhum gasto realizado nesta decisao. Modelo final
depende da qualidade medida; teste barato nao homologa outro modelo.
Router local escolhe gpt-5.4 ou gpt-4.1-mini e
tem fallback economico. Isso e constatação do codigo, nao recomendacao atual nem
aprovacao de fallback. O candidato deve fixar modelo por bateria e rejeitar fallback
nao homologado. Escolha final depende de teste de tools, qualidade e teto aprovado.

## Consumidores a consolidar, nao apenas adicionar

| Responsabilidade | Consumidor existente verificado | Contrato do substituto |
| --- | --- | --- |
| Entrada/turno/posse | ai/queue, ai/turn-coordinator, ai/agent.handleIncomingMessage | Uma revisao/epoch por turno; responder somente com posse valida. |
| Modelo/contexto | ai/router.runConversationAgent e buildOpenAiConversationMessages | Contexto/ferramentas versionados; resultado e chamadas registradas, sem fallback oculto. |
| Memoria | ai/runtime-state (ai_lead_memory e ai_conversation_state), messages | Fatos/casos/evidencias; consolidar projecoes sem apagar historico. |
| Conhecimento | ai/agent.fetchKbDocs, ai/knowledge-context | Recuperacao contextual com fonte/revogacao; nao cortar primeiro e tentar recuperar depois. |
| Catalogo | commerce/providers/shopify.lookupCatalog, shopify-conversation-catalog | Consulta real, objeto e variante corretos, preco/estoque recentes, URL direta validada. |
| Entrega | chat-outbound, chat-outbound-enqueue, ai/text-delivery | Mesmo registro duravel; nenhuma segunda chamada direta de contingencia. |
| CRM passivo | crm/conversation-observation-queue e conversation-intelligence | Mensagem/revisao com recibo; edicao manual e funil do tenant preservados. |
| Aprendizado | ai/learning-loop, learning-signals, tenant-learning, learning-approval | Evidencia de autoria humana; perfil aprovado separado de fatos/precos/regras. |
| Configuracao | cliente/painel/ia, settings/ai, ai/agent.parseAiConfig | Mapear cada controle ate o consumidor e teste; rascunho nao equivale a ativo. |

Os caminhos sao relativos a lib/server salvo indicação. Existencia de consumidor
nao aprova comportamento. Inventario contratual C01-C21 por canal/conexao registrado
em AI_REBUILD_SHOPIFY_CAPABILITY_MANIFEST.md; IDs/acessos e aceite reais pendentes.
Artefatos locais e publicacao anterior nao sao o mesmo pacote.

## Verificacao nova de trajetoria

scripts/ai-rebuild/acceptance.mts define o trace estrito de entrada, ordem, fatos
com fontes, recibos de tools, alegacoes operacionais e achados independentes.
Bloqueia evidencia de tenant diferente, mensagem automatica em posse humana,
alegacao com resultado incerto/objeto errado e estoque/preco sem validade.
Testes fabricam traces somente para testar o verificador: nao executam agente,
nao avaliam naturalidade nem provam que o texto livre nao omitiu uma alegacao.

Metadados de modelo nao autenticam uma chamada por si. O executor futuro deve
capturar provas fora da saida do agente e conferir efeitos no sistema de teste.
Qualquer trace, mesmo estruturalmente correto, permanece qualityApproved=false.
Revisao semantica/estado final/humana e avaliacao agregada sao gates separados,
ainda nao implementados integralmente. Nao usar os 12 testes do verificador como
12 conversas aprovadas.

## Metodo da bateria e custo

Conversas sinteticas isoladas, mesmo contexto e ferramentas da versao candidata,
efeitos externos bloqueados. Conferir a sequencia inteira e o estado final no
emulador; depois contratos reais de leitura autorizada Shopify e piloto aprovado.
Minimo 100 casos distintos, pelo menos 30 reservados nao usados em ajuste.
3 repeticoes cada; criticos 5. Total = 3 * numero de casos + 2 * casos criticos.
Corpus atual: 104 especificacoes (74 desenvolvimento e 30 reservadas), com 514
execucoes planejadas na classificacao conservadora atual. Ver corpus-1792450604152.json.
Os dez casos-semente do diagnostico antigo continuam desenvolvimento; seu resumo
de 50 repeticoes nao e o plano do conjunto completo. Nenhum dos 104 recebeu aceite
por contagem/hash. Revisao semantica, risco e independencia do holdout pendentes.

Antes de chamar modelo: medir tokens/modelcalls num lote curto autorizado;
estimar entrada + saida + consultas adicionais + reparos usando precos oficiais
da versao escolhida e apresentar teto US$ incluindo margem. Nao dar preco sem
modelo, tarifa e volume por conversa. Teto inicial autorizado: US$ 3 acumulados,
sem ampliacao automatica. Bateria integral continua sem autorizacao. Reserva local
implementada/testada em spend-ledger/mission-spend:
SQLite transacional, teto acumulado US$ 3, concorrencia/reinicio/resultado incerto.
Registro definitivo inicializado uma vez em .altum-evaluation/shopify-rebuild.
Primeiro lote real: duas chamadas, US$ 0,002858 calculados conservadoramente por
uso reportado; saldo US$ 2,997142, sem reservas pendentes. Nao apagar/recriar ou mover para outro checkout como
nova autorizacao. Transporte foi integrado/testado antes do primeiro lote real;
consulta ao handler com modelo real reprovou o objetivo de URL direta. Isso nao
autoriza bateria integral, publicacao ou ampliacao do teto.

## Pendencias preservadas de implementacao e aceite

Baseline de handler já iniciado em projeto demo isolado; ver registros antes/depois
da contenção P0 em AI_ATTENDANCE_CONTINUOUS_PROGRESS.md. Quatro turnos com modelo
simulado não substituem corpus, tools reais, inferência nem aceite de naturalidade.
Baseline foi ampliado com provider Shopify e três jornadas independentes, nove
entradas adicionais, com DNS/GraphQL simulados sem rede. Link direto e correção de
tamanho reprovados; consulta de API indisponível não inventa disponibilidade.
Ver artifact handler-baseline-1792450199591.json. Esses resultados localizam falhas,
não fecham os itens abaixo nem demonstram consulta a uma loja real.

- Manifesto contratual C01-C21 x canais/conexao/acoes registrado; completar provas
  positivas, negativas e recuperacao. Indisponivel continua no denominador anunciado.
- Especificacoes e split de 104 cenarios registrados. Falta completar setups,
  oraculos especificos e executor do handler inteiro por caso; ainda nao sao
  104 traces de atendimento nem avaliacoes de modelo.
- Reproduzir os resgates que substituem resposta e observacao passiva no caminho
  completo: observacao passiva ja tem sonda; handoff de produto sem publicacao
  reproduziu perda da explicacao especifica em resposta generica (artefato
  handler-baseline-1792452558310.json). Outros resgates continuam sem prova completa.
  Manter as cinco falhas prioritarias ja registradas.
- Modelo/versao, teto e dados sinteticos fixados para lote inicial, nao para operacao.
- Loja piloto escolhida pelo usuario: LF Multimarcas. Identificar conexao/canais,
  validar acessos sem revelar credenciais nem enviar a clientes. Usuario confirmou
  assumir validacao das regras e revisao das respostas antes do piloto; faltam as
  regras/exemplos vigentes e seu aceite, nao mais identificar quem revisa.
- Contratos por acao/CRM/funil, retencao e permissoes de observacao/aprendizado.
- SLOs e criterios de piloto/reversao preservados, sem aprovar por ausencia de erro.

A encerrou pelo criterio original auditado, nao pela aprovacao das jornadas.
As provas completas acima continuam obrigatorias nas fases correspondentes e F/G.
Backlog de Conversas continua pendente na fundacao B, sem substituir esta missao.
