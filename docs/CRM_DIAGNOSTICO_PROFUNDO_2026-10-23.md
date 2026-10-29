# CRM — diagnóstico aprofundado de 23/10/2026

## Decisão

**A base ainda não está aprovada para expansão nem para a promessa de preenchimento confiável em produção.** O problema atravessa interpretação, gravação, autoridade da edição humana, qualificação e resumo para o vendedor. Não basta corrigir as três frases de orçamento.

Esta rodada acrescentou avaliações de jornadas e de consistência entre os leitores do mesmo cadastro. Nenhuma lógica do produto foi alterada para obter os resultados. Empresas, usuários e mensagens são fictícios, exclusivamente no emulador local; houve 30 chamadas reais ao fornecedor para o ensaio semântico. Nenhuma mensagem foi enviada a clientes.

## O que foi executado

| Ensaio | Cobertura | Resultado observado |
| --- | --- | --- |
| Caminho determinístico do observador real, com gravação | 30 jornadas, 210 mensagens, conferência do campo alvo após cada mensagem | 87/210 conferências corretas; 10/30 estados finais corretos; somente 9/30 jornadas corretas em todas as etapas |
| Modelo real + observador real + gravação | As mesmas 30 jornadas completas, conferindo o estado final; 30 chamadas reais | 18/30 estados finais corretos; 12 falhas |
| Defesa contra resposta errada do modelo | 10 respostas fabricadas e injetadas diretamente no validador, sem fornecedor | 5 resultados de segurança esperados; 5 fatos de significado incorreto aceitos |
| Revisão humana e leitores derivados | Escritor transacional real de revisão, seguido da qualificação e do dossiê reais | A revisão, a qualificação e os pontos para o vendedor podem usar três orçamentos diferentes |
| Limite de texto | Mensagem de 4033 caracteres, com orçamento depois do caractere 4000 | Orçamento ignorado, leitura marcada como conferida, sem pendência |
| Estados de leitura | Análise desabilitada, fora de escopo, indisponível, concluída, erro e estado desconhecido | Alguns estados sem análise completa viram `checked` |

Não interpretar essas proporções como precisão de produção. O conjunto é intencionalmente adversarial; as conferências sucessivas de uma mesma jornada são correlacionadas. Os 210 turnos foram executados integralmente **pelo caminho determinístico**. No ensaio semântico, cada jornada foi avaliada **uma vez ao final**, com seu histórico completo; não foram feitas 210 chamadas ao modelo.

As expectativas foram explicitamente anotadas para a auditoria e independem do resultado do código, mas ainda precisam de revisão por pessoas da operação. Este conjunto não substitui homologação com vendedores e gestores nem validação em canais reais.

## Falhas que afetam a base

### 1. P0 — correção humana não governa todos os leitores

Preparei um registro fictício com valores antigos nas fontes que o produto atualmente mantém:

- campo da ficha: 5000 reais;
- atributo antigo da IA: 9000 reais;
- memória da IA: 7000 reais.

Executei a rotina real de revisão comercial, com autoridade transacional da empresa e do usuário, primeiro corrigindo para 3000 e depois limpando o campo. Não editei diretamente o resultado da revisão.

| Depois da ação humana | Revisão da ficha | Qualificação | Pontos do dossiê para o vendedor |
| --- | --- | --- | --- |
| Corrigir para 3000 | 3000, com origem manual | “Investimento compreendido: 9000 reais”, +10 pontos | “Orçamento registrado: 7000 reais.” |
| Limpar o orçamento | vazio, com origem manual | Continua 9000, +10 pontos | Continua 7000 |

O bloqueio contra sobrescrever o campo manual funciona nessa rotina, mas não basta: os leitores ignoram a mesma autoridade ao escolher outros atributos. O teste foi feito nos serviços reais, com banco local; não foi um teste HTTP ou visual da edição.

Onde acontece: `qualification.ts` prioriza `aiBudgetBand` e memória antes do campo da ficha; `lead-dossier.ts` prioriza memória. `qualification-review.ts` protege e atualiza o campo manual, sem fazer esses leitores consumirem a mesma verdade.

### 2. P0 — dado desconhecido ganha pontos de qualificação

Na jornada real de IA, a mensagem `Ainda não defini orçamento.` foi retornada como `budgetBand`, gravada no campo de orçamento e depois tratada como:

> Investimento compreendido — Ainda não defini orçamento — impacto positivo de 10 pontos.

Outra jornada gravou `não temos orçamento aprovado`. O texto é uma declaração verdadeira de **ausência de orçamento confirmado**, mas o sistema o usa como presença de orçamento. Também apareceu `faturamento é 50000 reais por mês` no campo de tipo de negócio. A origem literal e uma confiança declarada de 0,9 ou 0,95 não demonstram adequação ao campo.

Isso amplia o diagnóstico anterior: há erros do próprio resultado semântico e erros dos consumidores, além da combinação incorreta com as regras antigas.

### 3. P0 — texto de teste, outro comprador ou outra compra vira verba atual

No ensaio com modelo real, o modelo não confirmou orçamento em algumas destas conversas, mas a combinação com regras antigas gravou:

- 90000 reais retirados de um exemplo explicitamente descrito como falso/teste;
- 5000 reais citados por um sócio sobre outra empresa;
- 5000 reais destinados à reforma, enquanto a conversa tratava de CRM sem verba definida;
- 5000 reais de uma hipótese;
- 3000 reais mesmo depois de retirar o orçamento.

No teste de instruções maliciosas, a falha observada foi **o aproveitamento do texto pelas regras**, não evidência de que o modelo obedeceu à instrução. Essa distinção importa para corrigir a causa.

### 4. P1 — retirada de informação não existe como operação clara

Além do orçamento, interesse em CRM, prazo “até sexta” e objeção de preço continuaram registrados depois de retirados explicitamente.

`facts: []` mistura situações diferentes: não foi falado sobre o campo, o cliente retirou a informação, há conflito, o modelo não encontrou uma evidência ou o validador descartou a resposta. Não é seguro usar esse vazio para apagar tudo, nem para manter tudo como confirmado. A retirada precisa de intenção, origem, campo e momento próprios.

### 5. P1 — uma confirmação normal entre mensagens é descartada

Conversa avaliada com fornecedor real:

1. Vendedor: `Seu orçamento disponível é de 5000 reais?`
2. Cliente: `Sim, esse é meu orçamento.`
3. Confirmações posteriores de que esse é o limite total.

O orçamento ficou vazio. O contrato atual exige valor e trecho na mesma mensagem do cliente. Assim, a prova necessária para uma confirmação contextual não cabe no contrato. A solução precisa permitir evidência composta — pergunta com o valor e confirmação do comprador — mantendo a proteção contra atribuir automaticamente o preço do vendedor ao cliente.

### 6. P1 — análise parcial ou ausente parece concluída

Todos os 210 registros de conferência do caminho determinístico terminaram com estado de leitura `checked`, inclusive os que falharam no conteúdo. O teste direto também mostrou `checked` para `not_enabled`, `disabled`, `outside_scope` e um estado futuro desconhecido.

Em jornadas com modelo real, houve retorno semântico `completed` com fatos rejeitados pelo validador, campo esperado vazio e leitura conferida. Não há sinal suficiente para o vendedor diferenciar “leitura processada” de “informação interpretada e validada”.

### 7. P1 — corte silencioso do texto

Mensagem fictícia com 4033 caracteres e `Meu orçamento é 5000 reais` no final: o observador executou, salvou o estado de leitura conferida e não capturou o orçamento. O conteúdo lido é limitado a 4000 caracteres. O diagnóstico não exige contextos infinitos: exige que corte de conteúdo seja identificado e tratado, sem aparentar leitura integral.

### 8. P1 — citação literal não é validação de significado

Injetei respostas erradas fabricadas para testar a defesa. O validador aceitou, com confiança 1 e trecho literal:

- interesse em CRM a partir de `Não tenho interesse em CRM`;
- orçamento retirado;
- orçamento de outra pessoa;
- orçamento hipotético;
- número sem a moeda de um orçamento declarado em dólares.

As proteções rejeitaram corretamente valor inventado, origem do vendedor, referência a mensagem inexistente e confiança baixa. Essas proteções devem ser preservadas. O resultado identifica a fronteira do que elas garantem; não mede a frequência com que o modelo comete os erros simulados.

## O que funcionou nesta amostra

- O modelo real resolveu diversos casos de linguagem informal, cidade, tamanho atual da equipe, decisor, moeda e período mensal que o caminho de regras não resolveu.
- Nos ensaios das 30 jornadas não houve envio criado para o cliente nem estágio fora do conjunto admitido pelo teste. Isso é uma verificação restrita de segurança, não prova de avanço comercial correto do início ao fechamento.
- A revisão humana grava valor, limpeza e origem manual com controle transacional. O problema adicional é a consistência com os leitores derivados.
- Os testes de origem inexistente, falas do vendedor, valores inventados e confiança baixa foram barrados pelo validador.

## Como mudar a base antes da expansão

### Adaptação por negócio — verificação adicional

Pergunta do usuário: o CRM realmente adapta a operação ou impõe um estilo de venda?

Resultado: adaptação parcial. `business-blueprint.ts` possui seis modalidades
(agendamento, visita, compra direta, produto digital, compra assistida e venda
consultiva), com funis e orientações diferentes. O provisionamento persiste os
campos sugeridos em `tenant_settings.crm.leadFields`.

Entretanto, a qualificação central usa critérios/pesos fixos de nome, telefone,
email, empresa, tipo de empresa, objetivo, orçamento, urgência, decisor e oferta.
Não recebe um esquema configurável de qualificação por negócio. A extração
semântica contínua também aceita uma enumeração fixa de onze campos.

Reprodução local, sem banco ou modelo: gerei um blueprint de agendamento e um de
venda consultiva e avaliei o mesmo contato fictício com nome, telefone e interesse
em corte de cabelo. O blueprint de agendamento exigia necessidade, oferta e
disponibilidade; o consultivo exigia necessidade, oferta, urgência e decisão.
Ambos retornaram score 41, “Precisa qualificar melhor” e as mesmas lacunas:
email, tipo de empresa, objetivo, orçamento, urgência e empresa/ou orçamento.
A disponibilidade configurada não apareceu entre as lacunas da qualificação.

O motor também concede mais pontos para valor potencial a partir de 3000 BRL,
sem usar o ticket médio do negócio nesse cálculo. Portanto, mudar funil e texto
não comprova que campos, critérios e decisões foram adaptados de ponta a ponta.

Requisito de base: esquema de campos tipados, relevância e obrigatoriedade por
processo/etapa, critérios de qualificação próprios, evidências de transição e
ações de conclusão ligados à empresa; a extração, interface e leitores derivados
devem consumir a mesma configuração versionada. Validar em operações distintas,
como agendamento de serviço, loja e venda consultiva, antes de afirmar adaptação.

1. **Uma leitura comercial comum para todos os consumidores.** Ficha, qualificação, resumo, assistente, funil e relatório precisam consumir o mesmo estado vigente e respeitar a correção/limpeza humana. Atributos antigos não podem ressuscitar valores.
2. **Estados explícitos por informação.** Confirmado, não informado, não definido, retirado, conflitante e aguardando revisão precisam ter significados distintos. Histórico e estado atual são coisas diferentes.
3. **Operações explícitas com evidência.** Confirmar, corrigir, retirar e pedir revisão, com origem, versão, momento e oportunidade. Não tratar ausência de um fato no resultado do modelo como uma instrução implícita de apagar ou de manter.
4. **Valores com significado comercial.** Dinheiro precisa preservar moeda, período/faixa e vínculo à compra; prazo precisa de contexto temporal; tipo de negócio precisa ser tipo de negócio. Preservar o texto original e separar valor normalizado da evidência.
5. **Evidência de mais de uma mensagem quando necessário.** Confirmações contextuais devem ser comprováveis sem remover a defesa contra preço do vendedor virar orçamento do comprador.
6. **Degradação segura e visível.** Falha, corte, análise indisponível, resposta parcialmente rejeitada e dúvida precisam produzir pendência apropriada. Estado desconhecido não deve assumir sucesso.
7. **Política de consequência.** Informação ambígua não pode qualificar positivamente, alterar funil ou criar tarefa comercial como se estivesse confirmada. Controle humano e regras da empresa devem prevalecer.

Isso não significa preencher todos os campos em toda conversa. Significa registrar o que foi confirmado, atualizar quando a situação muda e sinalizar o que ainda não é seguro usar.

## O que ainda precisa de homologação

- Jornada semântica contínua a cada turno, e não só no estado final; repetição das respostas para medir variação.
- Revisão independente das expectativas por vendedores/gestores e amostra representativa da operação.
- Recebimento real por WhatsApp/Instagram e demais canais, sincronização com a tela e operação visual completa.
- Áudios com ruído, várias pessoas, encaminhamentos e correções; imagens/documentos com contexto suficiente para preencher fatos sem confundir conteúdo do arquivo com declaração do comprador; limites de vídeo.
- Conversas longas, importação, mensagens atrasadas/editadas/removidas, reprocessamento, indisponibilidade, quotas, filas e concorrência, combinados com os novos estados de fato.
- Várias oportunidades da mesma pessoa, transferência de vendedor, perda de acesso, intervenção humana, fechamento, cancelamento e relatórios conciliados.

As regressões estruturais da rodada anterior continuam sendo evidência local dos casos executados, não homologação desses cenários combinados nem garantia de produção. Nenhuma alegação de cobertura de “todos os cenários possíveis” está sendo feita.

## Arquivos e reexecução

- `tests/fixtures/crm-deep-journeys.ts`: 30 jornadas, 210 turnos e expectativas explícitas.
- `scripts/diagnose-crm-deep-journeys.mts --deterministic`: grava e confere cada turno no emulador fixo.
- `scripts/diagnose-crm-deep-journeys.mts --synthetic-provider`: até 30 chamadas reais com dados fictícios; confere somente o estado final de cada jornada no CRM local.
- `scripts/diagnose-crm-boundary-contracts.mts`: estados de leitura e respostas erradas simuladas, sem fornecedor.
- `scripts/diagnose-crm-derived-truth.mts`: revisão humana, qualificação, dossiê e corte do texto, sem novas chamadas ao fornecedor.
- `.qa-artifacts/crm-deep-diagnostic/`: resultados por turno, extração semântica, campo salvo, evidência, estado de leitura, comparação dos leitores e identificação dos fontes.

O ambiente estava desligado no início; a primeira tentativa falhou antes da avaliação e foi preservada em log. O Firestore local foi restabelecido, incluindo ajuste de idioma da JVM para inicializar o validador das regras. Os resultados acima são das execuções posteriores encerradas com código 0. Esse ajuste é do ambiente de teste e não altera regras ou comportamento do produto. Não houve build nem publicação do produto nesta rodada.
