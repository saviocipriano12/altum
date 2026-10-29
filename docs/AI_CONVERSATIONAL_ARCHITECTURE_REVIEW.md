# Revisao do motor de conversa — 19/10/2026

## Problema observado

O cliente nao percebe fluidez nem continuidade apos varias rodadas de mudancas.
Isso e falha de aceitacao do produto, mesmo com implementacao/testes tecnicos.
Nao ha comprovacao nesta rodada de qual versao do motor esta publicada nem de
qual modelo/configuracao realmente respondeu aos exemplos ruins do cliente.

## Achados de fonte local

- router.ts reduzia historico para 10 mensagens de 220 caracteres, apesar de o
  agente carregar 24. Pergunta anterior e objeto da negociacao podiam desaparecer.
- conversation-policy.ts tratava toda correcao como abandono de assunto e
  enforceConversationTurnPolicy substituia o rascunho por pergunta generica.
- Saudacao/agradecimento por palavras soltas podiam apagar pedido comercial misto.
- agent.ts, response-composer e politica possuem etapas distintas de reescrita.
  Alterar prompt nao elimina as transformacoes posteriores. Auditoria completa
  dessas etapas continua pendente; elas nao foram removidas indiscriminadamente.
- Regras/fallback sem modelo existem. Precisamos distinguir erro de geracao,
  ausencia de contexto/ferramenta, provider indisponivel e reescrita posterior.

## Referencias verificadas, nao promessa de desempenho

- LangGraph: checkpointer por thread e store para fatos duraveis; persistencia
  em memoria RAM nao e duravel apos restart. Aproveitar separacao de estado e
  execucao retomavel; biblioteca nao escolhe sozinha fatos corretos ou tom comercial.
  https://docs.langchain.com/oss/javascript/langgraph/persistence
- Dify: agentes/workflows, recuperacao de conhecimento, comparacao de prompts e
  observabilidade integrados. Usar como implementacao de referencia e candidato
  para comparacao, nao substituir CRM/canais antes de provar melhora. Licenca
  possui condicoes adicionais; revisar adequacao antes de incorporar/distribuir.
  https://github.com/langgenius/dify
- LangSmith: benchmark de versoes, regressao e avaliacao de producao sao distintos
  de testes unitarios. Usar comparacao de conversas completas com julgamento humano
  e verificacoes objetivas, nao regex como unico criterio de naturalidade.
  https://docs.langchain.com/langsmith/evaluation-types

## Direcao proposta para Altum, sem instalar ou reescrever a plataforma nesta rodada

1. Capturar versao/modelo/configuracao efetivos e o contexto enviado, rascunho e
   resposta final, com isolamento e minimizacao de dados. Nao expor conteudo de
   clientes nos logs gerais nem misturar fatos de tenants.
2. Estado unico por conversa: assunto, referente, ultima pergunta, fatos com fonte,
   correcao, compromisso pendente, controle humano e resultado real das ferramentas.
   Memoria duravel separada de fatos transacionais que precisam consulta atual.
3. Modelo interpreta a conversa e propoe resposta/acao. Ferramentas decidem preco,
   estoque, agenda e efeitos autorizados. Validacao protege fatos/privacidade sem
   substituir resposta util por roteiro comercial ou reset generico.
4. Comparar motor atual e candidato com mesmo modelo, dados e ferramentas. Adotar
   LangGraph/Dify apenas se trouxer melhora e compatibilidade mensuraveis, nao por
   popularidade. Transporte Evolution e atendimento Chatwoot nao substituem cerebro.
5. Meta proposta: 100 conversas sinteticas representativas, varios turnos, diferentes
   negocios, interrupcoes/correcoes/compra/reuniao/falha de ferramenta/humano. Ainda
   nao construidas/executadas nesta rodada. Depois incluir casos reais anonimizados
   autorizados e piloto restrito. Nenhuma promessa de perfeicao em todo negocio.

## Mudancas locais atuais

Contexto cronologico de ate 24 turnos, 24.000 caracteres totais e 4.000 por mensagem,
com indicacao de omissao; historico estruturado para OpenAI e textual para demais
provedores; limites de memoria/estado menos destrutivos; ID atual nao repetido;
respostas nao enviadas nao entram como falas confirmadas; politica preserva pedidos
mistos e correcoes de detalhe. Limites upstream de fetch/resumo ainda existem.

63/63 testes direcionados iniciais aprovados. Incluem percurso multi-turno com
rascunhos conhecidos, NAO inferencia real nem avaliacao de naturalidade do modelo.
Regressao ampla dos arquivos ai-*.test.mts: 243/245 aprovados (56988). Falharam
os contratos de fonte ai-handoff-contract e ai-logs-query-contract: esperam a
expressao antiga de autonomia/handoff, enquanto a fonte atual usa permissoes por
acao do actionPlan. Nao foram alterados apenas para deixar a suite verde; falta
confirmar/atualizar o contrato e sua prova comportamental. Resultado amplo nao
aprovado. Lint direcionado e typecheck incluindo a suite nova aprovados (86949);
diff --check aprovado. Nenhum teste real de modelo foi executado nesta rodada.
Nao ha publicacao, nova tela, mudanca admin ou migracao de framework. Qualidade
final continua em validacao; proximos passos sao trace de ponta a ponta e benchmark.
