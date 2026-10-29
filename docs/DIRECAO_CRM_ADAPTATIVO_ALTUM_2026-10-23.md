# Direção proposta — CRM adaptativo na operação Altum

Data: 23/10/2026. Documento de decisão de produto e critérios de implementação;
não representa capacidade já entregue ou homologada.

Referência principal de produto autorizada pelo usuário: **Kommo**. A comparação
com documentação oficial e os critérios de aceitação estão em
[CRM_REFERENCIA_KOMMO_2026-10-23.md](CRM_REFERENCIA_KOMMO_2026-10-23.md).
Essa referência orienta os fluxos; a confiabilidade da Altum depende de evidência
própria nas jornadas completas, incluindo falhas e correções.

## Problema que precisamos resolver

A Altum foi definida como operação comercial com IA: receber contatos, atender,
entender, organizar trabalho, conduzir o processo da empresa e acompanhar resultados.
O CRM deve manter o contexto confiável dessa operação e sustentar o trabalho de
Conversas, Clientes & Oportunidades, Agenda e Relatórios. Não é suficiente que uma
tela de cadastro tenha textos produzidos por IA.

O plano de 21/10 já previa adaptação e evidência. A implementação e os testes
estruturais, entretanto, não garantiram que configuração, extração, qualificação e
leitores derivados obedecessem ao mesmo contrato. Corrigir frases isoladas antes
de resolver essa ligação preservaria a causa do retrabalho.

Evidências: os diagnósticos de 22 e 23/10 e a comparação entre agendamento e venda
consultiva. Existem modelos diferentes de funil, mas critérios de qualificação e
campos da extração contínua ainda são fixos em partes centrais. A edição humana
pode não governar a qualificação e os pontos do dossiê.

## Direção

**O CRM será a memória confiável e a organização do trabalho da empresa. A IA
opera sobre essa memória e sobre o processo configurado para aquele negócio.**

O vendedor deve encontrar quem precisa de atenção, entender a situação atual e
agir sem preencher um formulário genérico. O dono deve enxergar andamento,
pendências e resultados que possam ser conferidos nos registros de origem.

Não usar uma lista de segmentos com código especial como mecanismo principal de
adaptação. Modelos de implantação são pontos de partida; regras e campos aprovados
da empresa precisam alterar efetivamente o comportamento do mesmo núcleo.

## 1. Base comum e informações específicas

Preservar os registros e módulos nativos já existentes:

- Contato: identidade, canais e relacionamento; empresa relacionada quando fizer sentido.
- Conversa: mensagens, arquivos, participantes e contexto do atendimento.
- Oportunidade: negociação quando houver uma compra em avaliação; várias por contato.
- Atividade: compromisso concreto, responsável, prazo, estado e vínculos.
- Agenda, proposta, pedido e financeiro: seus próprios registros e evidências.
- Histórico: origem e alterações, separadas da informação vigente.

Uma conversa não obriga criar negociação; agendamento não é pagamento; uma nova
compra não reaproveita silenciosamente o orçamento da anterior. Os vínculos
precisam esclarecer a qual processo, compra e entidade a informação pertence.

Não converter toda a plataforma em uma coleção genérica de objetos. Reusar os
módulos existentes e definir seus contratos comuns de leitura, escrita e vínculo.

## 2. Configuração operacional que governa o produto

O perfil da empresa deve definir, por processo:

- Objetivo e resultado: vender produto, marcar atendimento, realizar visita,
  apresentar proposta, acompanhar renovação ou outro processo comercial admitido.
- Campos relevantes: nome, significado, tipo, opções, unidade/moeda/período,
  entidade à qual pertencem e etapa em que são necessários.
- Etapas e condições: o que permite entrar, avançar, aguardar, concluir, perder,
  cancelar e reabrir; evidência exigida em cada transição.
- Próximas ações e capacidades: catálogo, estoque, agenda, proposta, pedido,
  pagamento e transferência humana disponíveis e autorizados.
- Responsáveis, horários, prazos de retorno, política de contato e permissões.
- Autonomia da IA: o que pode registrar, sugerir ou executar, e o que exige revisão.

Uma empresa pode combinar processos, como vender produtos e agendar serviços.
Campos e regras devem ser escolhidos no contexto da operação atual, sem transformar
toda informação possível em obrigatória para todos os clientes.

O dono recebe uma configuração inicial simples, proposta a partir do negócio,
catálogo, políticas e exemplos. Confere as escolhas comerciais; a Altum valida
consistência. Campos novos não se tornam obrigatórios ou automatizam ações apenas
porque o modelo decidiu criá-los durante uma conversa. Ajustes técnicos permanecem
em uma segunda camada, de acordo com AGENTS.md.

## 3. Informação vigente com uma autoridade comum

Cada informação comercial deve distinguir:

- Confirmada: valor com significado, contexto e origem sustentados.
- Não informada: a conversa ainda não trouxe o dado.
- Indefinida: cliente informou que ainda não decidiu.
- Retirada/substituída: uma informação deixou de valer; histórico preservado.
- Conflitante ou pendente: existe dúvida que impede usá-la como confirmação.

A evidência pode reunir mensagens relacionadas. Pergunta com valor e confirmação
por “sim” é diferente de assumir que qualquer preço do vendedor é orçamento.

Todos os leitores — ficha, qualificação, dossiê, assistente, regras de funil e
indicadores — consomem a mesma interpretação vigente. Atributos antigos e memórias
não podem ressuscitar um campo limpo ou sobrepor a correção humana por preferência
de leitura. Correção, contestação e liberação para atualização automática devem
ter políticas explícitas; uma nova contestação pode exigir revisão sem violar o
controle humano do campo.

A autoridade depende do fato: conversa pode sustentar preferência; catálogo e
integração sustentam preço/estoque; agenda sustenta horário reservado; evento
financeiro sustenta pagamento. A confiança que o modelo declara não substitui
essas fontes.

## 4. Papel da IA

1. Ler texto e as interpretações de mídias, identificando o que foi efetivamente
   processado, a pessoa, o contexto e a compra/processo pertinente.
2. Propor confirmação, correção, retirada ou revisão dos campos permitidos pelo
   processo, com evidência e valor normalizado separado da citação original.
3. Aplicar as mudanças pelo mesmo caminho validado usado pelos outros escritores,
   respeitando versão, autoridade humana, escopo e acesso.
4. Avaliar o que falta e qual ação faz sentido pelas regras da empresa.
5. Sugerir ou executar somente as capacidades disponíveis e autorizadas.

Responder automaticamente, observar a conversa e executar ações são permissões
distintas. Pausar respostas durante atendimento humano não implica perder o
registro comercial da conversa.

Omissão de um fato no resultado da IA não equivale a retirada. Contexto cortado,
mídia ilegível, ausência de configuração, rejeição parcial e estados desconhecidos
não podem ser apresentados como leitura completa. Preservar histórico e dados
válidos, sinalizar a limitação e impedir consequências não sustentadas.

Para situações novas, o contrato exige comportamento seguro e recuperável;
não uma alegação de que o modelo acertará qualquer interpretação possível.

## 5. Experiência cotidiana

Em Conversas, o atendente encontra o pedido, a situação atual, a informação que
precisa confirmar e a próxima ação disponível. Na ficha, edita o essencial,
consulta a origem quando necessário e acompanha a negociação atual. Em Agenda,
trabalha os compromissos reais. O mesmo cliente e compromisso permanecem vinculados
ao navegar entre essas áreas.

Não exigir orçamento, empresa e decisor de todo contato nem conduzir todos a
diagnóstico/reunião. Não exibir todos os campos, scores e explicações técnicas na
rotina comum. A configuração decide o que é relevante; o estado atual decide o
que merece atenção agora.

Para o dono, separar atendimentos, negociações, agendamentos, vendas e dinheiro
recebido. Cada indicador tem definição, período, cobertura e acesso aos registros
que o compõem. O nome dado a uma coluna do funil não redefine um fato financeiro.

## 6. Prova de adaptação antes de expandir

| Operação fictícia | Informações centrais | Ação operacional | Evidência de resultado |
| --- | --- | --- | --- |
| Serviço com horário | Serviço, profissional, disponibilidade | Oferecer/reservar horário | Registro da agenda confirmado |
| Loja com entrega | Item, variante, quantidade, estoque, entrega | Montar pedido e oferecer pagamento | Pedido e situação financeira, separados |
| Serviço consultivo | Necessidade, escopo, critérios da decisão, proposta | Preparar proposta e acompanhar decisão | Proposta/aceite e financeiro, separados |
| Empresa com produto e serviço | Contexto da compra, item ou serviço, campos de cada processo | Alternar entre pedido e agenda | Registros próprios e vínculos corretos |

Critérios obrigatórios:

- Alterar um campo e uma condição na configuração muda extração, interface,
  qualificação e comportamento real, sem criar um ramo de código por segmento.
- Adicionar campo comercial suportado, com tipo e evidência, não exige editar uma
  lista fixa no extrator. Exemplos: tamanho da peça ou bairro de atendimento.
- Compra simples não precisa passar por etapas de venda consultiva para funcionar.
- Critérios de prioridade são pertinentes à operação, não pesos universais por
  email, empresa ou valor fixo de 3000 BRL.
- Correção e retirada são respeitadas em todos os consumidores, inclusive depois
  de reprocessamento, importação, atualização de integração e retomada de fila.
- Mesma pessoa pode ter duas compras e conversa de suporte sem misturar contextos.
- Testar leitura e gravação pela IA real, UI, APIs, banco, agenda/pedido e indicadores,
  incluindo falha e recuperação; separar os níveis de prova.
- Expectativas revisadas por pessoas da operação, com amostra independente e casos
  de desafio. Não aprovar por contagem de testes ou estados `completed`.

## 7. Ordem de execução recomendada

1. Firmar os contratos de configuração, informação vigente, evidência e consequência
   usando exemplos completos das operações acima. Essa é a próxima unidade de base.
2. Mapear os leitores/escritores existentes e introduzir leitura comum e adaptação
   compatível. Preservar rotas, dados, controle humano e identificadores.
3. Fazer um processo completo funcionar, incluindo IA real e interface, e comprovar
   a mesma base num processo diferente antes de ampliar a cobertura.
4. Adaptar qualificação, ações e visões restantes à configuração comum; eliminar
   caminhos que continuem aplicando pressupostos fixos sem declarar isso.
5. Validar relatórios, carga, recuperação e piloto controlado; preparar migração
   versionada, reversível e verificável. Mudança de configuração não reinterpreta
   vendas e históricos antigos silenciosamente.

Preservar as proteções e capacidades já comprovadas. O que precisa ser substituído
é a lógica conflitante ou fixa que não satisfaz os contratos, com transição gradual.
Não iniciar mais uma arquitetura paralela enquanto os leitores antigos continuam
decidindo pela própria preferência.

Essa direção complementa o plano de evolução de 21/10 e os diagnósticos seguintes.
A missão permanece aberta; o documento não afirma que os critérios foram entregues.
