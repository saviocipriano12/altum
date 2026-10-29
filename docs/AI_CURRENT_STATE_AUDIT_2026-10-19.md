# Auditoria do funcionamento atual da IA — 19/10/2026

## Escopo e evidencia

Inspecao de fonte, sem alterar comportamento, configuracao de clientes ou dados.
Dominio altumia.com.br confirmado em READY no deployment
`dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh` nesta auditoria.
Comparados conteudos publicados de tenant-context, knowledge-context,
runtime-state, tenant-learning, quality-score, commerce/conversation-catalog
e shopify-conversation-catalog: identicos aos respectivos arquivos locais.
Agent local difere do publicado. No agent publicado confirmados cortes de
1.200 caracteres, grupos fixos de palavras e ausencia do mapeamento deliveryStatus.
Nao atribuir alteracoes locais posteriores automaticamente a producao.

61/61 testes direcionados locais passaram: continuidade, conhecimento,
contexto do tenant, politica/aprovacao de aprendizado, contratos de papel e
catalogo Shopify. Nao e teste completo autenticado, de modelo real ou de todos
os tenants. Nenhuma conversa de cliente foi consultada ou enviada nesta rodada.
Nao foram contadas recomendacoes aprovadas, qualidade/quantidade de documentos
ou preenchimento da configuracao de cada tenant em producao.

## Caminho de resposta

Webhooks WhatsApp/Meta persistem mensagens e enfileiram processamento. Queue
chama handleIncomingMessage em agent.ts. O handler confere tenant, configuracao,
limites, escopo de teste, pausa por conversa e controle humano. Grupos sao excluidos.
Carrega historico, documentos, estado de conversa, memoria do lead e sinais
aprovados. Compila contexto do negocio, papel, especialista e capacidades.
Consulta catalogo Shopify quando elegivel. Router pede resposta estruturada ao
modelo; codigo tambem possui fallback por regras. Em seguida resolve escolha,
plano operacional, permissoes/acoes, texto, reparos e envio.

Existe um agente/orquestrador de atendimento Altum. Nao e um modelo proprio
treinado por empresa. A chamada OpenAI inspecionada pede JSON e nao expoe um
catalogo generico de tools para um loop livre de chamadas; ferramentas sao
orquestradas pelo codigo, com intencao especifica catalogSearch e novas consultas
em caminhos definidos. Isso nao impede chamar de agente, mas delimita autonomia.
altum-agent-v2.ts nao deve ser contado como segundo agente ativo por seu nome:
o handler importa seu tipo, e usa deriveOperationalPlan para o plano operacional.

## Memoria: existe, mas e selecionada e resumida

- messages: busca ate 300 registros por tenant/chat, ordena e mantem 24.
- Em falha da consulta ordenada ha fallback limitado sem orderBy; ordenar depois
  nao garante que foram obtidas as 300 mensagens mais recentes. Risco a reproduzir.
- summarizeMessageForAgent limita texto normalizado/bruto a 1.200 caracteres;
  entrada atual passa por limites de 1.400 antes do router.
- conversation-context limita ate 24 turnos e 24.000 caracteres, ate 4.000/turno.
  Aumentar esse limite nao recupera texto cortado antes.
- ai_conversation_state guarda assunto, etapa, ultima fala, pergunta pendente,
  resumo e especialista. Resumos persistidos sao curtos, varios de 260 caracteres.
- ai_lead_memory guarda fatos comerciais, resumo e estado de relacionamento;
  ha separacao de fatos confirmados/hipoteses e protecoes de ordem/identidade.
- summarizeRuntimeStateForAgent seleciona as primeiras 6 linhas nao vazias;
  summarizeLeadMemoryForAgent seleciona as primeiras 12. Campos de campanha
  podem consumir o espaco e excluir pergunta, diagnostico ou resumo posteriores.
- Status de mensagens nao enviadas e filtrado pelo helper quando recebido;
  o fetch publicado ainda nao fornece deliveryStatus (local ja fornece).

Persistencia nao significa acesso integral a todo historico em cada resposta.

## Conhecimento

fetchKbDocs le kb_docs do tenant, ate 200, sem ordenacao/paginacao abrangente.
Tipos FAQ, catalogo e politica; normaliza campos comerciais e midias. Exclui
conteudo desabilitado, ofertas pausadas e catalogo com estoque zero. Busca por
palavras, tags e frases com nota minima. Para imagem pode ampliar candidatos.
buildKnowledgePromptContext envia apenas os quatro primeiros documentos;
FAQ/politica ate 1.200 caracteres por documento e catalogo ate 3.600.

Achado: keyword/hybrid/semantic sao variantes de pontuacao lexical. Semantic
expande grupos fixos de sinonimos ligados a preco, agenda, leads, vendas,
WhatsApp, CRM e urgencia. Nao ha embeddings ou reranker por modelo nesse caminho.
Portanto a opcao semantic nao comprova compreensao semantica ampla de documentos.
Recuperacao usa a mensagem atual, nao uma pergunta contextual reconstruida com
o historico antes da busca. Respostas curtas podem ter pouca evidencia recuperada.

## Adaptacao por negocio e papel

tenant-context compila descricao, objetivo, tom, cliente ideal, prioridades,
regras, perguntas, ofertas, proposta, follow-up e escalada. Papéis e especialistas
possuem capacidades e restricoes reais no codigo, alem do nome do papel.
Nao ha prova nesta auditoria de qualidade superior de closer versus SDR em
conversas reais. Configuracao disponivel nao implica preenchimento/utilidade.

Persistem campos/padroes genericos de venda consultiva (maturidade digital,
canais, equipe, diagnostico e proposta). Existem tambem detalhes de camisas de
futebol no prompt compartilhado e no caminho Shopify. Isso e especializacao
codificada de um piloto, nao adaptacao automatica a todo setor.

## Shopify: consulta real, mas piloto e jornada incompleta

lookupConversationCatalog exige conhecimento permitido, conexao Shopify ativa,
loja em SHOPIFY_LIVE_CATALOG_STORES e modo live ou autorizacao de piloto/teste.
Consulta provedor, valida produto/variante, preco, publicacao, estoque e recencia.
Guarda commerceConversationContext no chat para produto/variante em andamento.

Desvio confirmado em resolveCatalogConversation: ao encontrar estoque responde
com preco e pergunta se envia o site, marcando awaitingWebsite. resolveStoreWebsite
usa dominio da loja. O produto possui onlineStoreUrl, mas a resposta de estoque
nao entrega automaticamente URL direta do produto/variante. Nao satisfaz a
jornada pedida pelo cliente. Nao confundir essa constatacao com falta de consulta.
Ha frases e buscas fixas de camisa/modelo/temporada, inadequadas para universalizar.

## Aprendizado: sinais aprovados, nao treinamento automatico

learning-loop registra eventos; learning-outcomes associa sinais a resultados;
learning-signals gera recomendacoes shadow. tenant-learning usa recomendacoes
approved, versao atual, nao expiradas, amostra >=8, >=3 relacionamentos,
confianca >=0,62 e conflito <=0,35. Sem isso devolve hints vazios.
Promocao requer avaliacao e gemeo digital vinculados, alem de aprovacao autorizada.

Efeito no atendimento: ofertas, proximas acoes, objecoes e preferencia de
fechamento entre reuniao/proposta sao inseridas no prompt e plano. Nao ha neste
caminho rotina que transforme toda conversa humana em conhecimento aprovado
da empresa ou treine automaticamente pesos de modelo por tenant.
Observacao passiva do CRM e subsistema separado: extrair um dado de uma conversa
nao e aprender uma nova politica comercial permanente.

## Reescrita e qualidade

Agent concentra mais de 7.500 linhas publicadas e diversas responsabilidades.
Apos geracao ha deteccao de pergunta repetida, limpeza, resgate por qualidade,
restricoes, politica de turno, privacidade, guarda de perguntas e composer.
Alguns resgates inserem textos fixos de exemplo/material/conversa curta.
Ha mecanismo real capaz de trocar uma resposta contextual por texto padrao.
Isso e risco/candidato causal; falta trace de conversas ruins completas para
atribuir a causa de cada queixa especifica. Nao remover protecoes sem medir.

quality-score e heuristico: comprimento, numero de perguntas, mudanca de estado,
proximo passo, oferta e repeticao. Nota alta nao comprova verdade comercial,
resolucao, ferramenta executada ou naturalidade humana.

## Conclusao

Temos componentes reais de agente, memoria, conhecimento, capacidades e
aprendizado controlado. Nao temos evidencia de adaptacao confiavel e universal
por tenant. Gargalos concretos: selecao/cortes de contexto, recuperacao lexical
limitada, especializacoes hardcoded, jornada Shopify sem URL direta e potenciais
substituicoes de resposta por resgates genericos. Proxima decisao deve partir
destes achados, preservando o backlog anterior e audio adiado, sem nova migracao
ou publicacao nesta auditoria.
