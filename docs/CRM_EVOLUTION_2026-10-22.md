# Evolução do CRM Altum

Investigação do checkout local em 22/10/2026. Evidências de código não equivalem a resultados em produção. Direção: operação comercial com IA, com foco em conversar, acompanhar e concluir próximos passos.

## Diagnóstico

O CRM concentra cadastro, carteira, distribuição, ranking, marketing, pedidos, propostas, tarefas, análises e documentos de IA numa página extensa. O problema não é simplesmente excesso de funções: é oferecer várias leituras concorrentes antes de mostrar uma decisão clara. Também existem problemas funcionais de cobertura da busca e dos indicadores que um redesign sozinho não resolve.

O potencial de diferenciação está numa rotina menor e mais confiável: cada oportunidade mostra o que aconteceu, o que falta, quem age e quando. A IA prepara o trabalho, mantém a evidência e pede decisão somente quando há ambiguidade ou consequência relevante. Ser melhor que os concorrentes deve significar concluir tarefas específicas com menos esforço e mais correção; não foi demonstrada superioridade nesta investigação.

## Achados e evidências

### P1 — Busca e filtros não cobrem necessariamente toda a carteira

Em `app/cliente/painel/crm/page.tsx`, `load` solicita uma página compacta e `loadMoreLeads` acrescenta outras. `filteredLeads` filtra o array `leads` em memória; o termo de busca e filtros não são enviados nessa solicitação ao servidor. Em `app/api/tenant/[tenantId]/leads/route.ts`, a consulta recebe limite e offset.

Consequência deduzida do caminho de código: um cliente fora das páginas carregadas pode não aparecer na busca. “Nenhum contato encontrado” não comprova ausência na base. Prioridade estrutural: busca, filtros, ordenação e paginação no servidor com o mesmo escopo de permissões. Critério: encontrar um registro da última página sem carregar as anteriores e preservar filtros ao carregar mais.

### P1 — Números de recortes podem parecer números da operação

`summary` soma `filteredLeads`; `prioritySummary` e parte do ranking percorrem os registros carregados. O total da base é obtido separadamente, e métricas de equipe vêm de outra solicitação. Isso pode misturar cobertura parcial e agregados de escopos diferentes.

Critério: todo número declara seu escopo; filtros e agregados usam a mesma definição. Contagem global não depende de quantas páginas o navegador carregou. Valor em aberto exclui etapas finais de acordo com a configuração do cliente. Não chamar soma de valor potencial de previsão de receita sem método explícito.

### P1 — CRM automático perde informação em linguagem normal

`lib/server/crm/conversation-facts.ts` usa padrões para extrair fatos e descarta toda a extração quando encontra pergunta ou expressão hipotética. Reproduzido anteriormente: “Meu orçamento é 5000 reais” preenche orçamento; adicionar “Pode me ajudar?” elimina o resultado. “Tenho 5 mil para investir” também não é reconhecido.

`conversation-intelligence.ts` contém regras de inferência comercial e rejeita avanço em mensagens com determinados termos ou interrogação. São barreiras conservadoras; não representam compreensão semântica geral. Não remover essas barreiras sem substituí-las por critérios de confirmação.

Evolução: separar trechos afirmativos e perguntas; tratar negação localmente; guardar mensagem de origem, data, valor anterior, confiança e autoria. Distinguir interesse, compromisso e evento comprovado. “Quero uma proposta” gera preparação; não comprova proposta enviada. “Vou pagar” não comprova recebimento.

### P2 — A mesma decisão aparece em vários blocos

Na ficha de `crm/page.tsx`, há sugestão da jornada, qualificação, resumo comercial, plano da IA, roteiro e IA aplicada. Oferta e próximo passo reaparecem. Origem e campanha mostram click ID, primeiro/último toque e conteúdo na área operacional.

Evolução: um resumo curto e uma próxima ação principal; evidências e análises sob demanda. Marketing vai para Origem; confiança numérica, checklist e detalhes do planejador ficam em análise avançada. Ausências como “Não identificado” só aparecem quando impedem uma ação concreta.

### P2 — Duas representações de Kanban exigem alinhamento

`crm/page.tsx` tem visualização de funil e `pipeline/page.tsx` mantém uma página própria, com modelos e carregamento distintos. Isso não comprova divergência em todos os casos, mas cria duas implementações a manter.

Evolução incremental: compartilhar um modelo de leitura e comportamento do board; manter as rotas antigas e os parâmetros de cliente/oportunidade. Só unificar componentes após verificar filtros, contagens, permissões, etapas legadas e navegação direta.

### P2 — Score mistura informação cadastral e qualificação

`lib/server/crm/qualification.ts` inicia um score e acrescenta pontos por nome, telefone, e-mail e outras informações. Isso é útil para completude, mas não é uma probabilidade de fechamento calibrada. A interface exibe score e temperatura como sinais comerciais.

Evolução: separar completude do cadastro, intenção do comprador e urgência operacional. Mostrar “Pediu orçamento hoje”, “Retorno atrasado” ou “Aguardando decisão” com evidência. Reservar probabilidade de fechamento para um modelo validado com resultados reais e por segmento.

### P2 — Informação atualizada deve ter um contrato consistente

A ficha selecionada atualiza periodicamente, ao recuperar foco, e pausa durante edição. A tela de conversas usa outro mecanismo de atualização. Há proteção contra respostas antigas na ficha, o que deve ser preservado.

Evolução: mudança aceita retorna a versão atual e atualiza lista, board e ficha; falha mantém a ação recuperável. Revisão de concorrência protege edição humana. Medir tempo até a mudança aparecer nas três superfícies, incluindo duas sessões abertas.

## Bases boas que devem ser preservadas

- `crm/field-ownership.ts`: proteção de etapa, prioridade e tags definidas manualmente, com controle de versão para alterações automáticas.
- `crm/opportunities.ts`: identidade do contato e oportunidades vinculadas, com controle de acesso e resolução de vínculos.
- `crm/activity-mutation.ts`: autoria, validação de data, escopo da empresa e permissão sobre responsáveis.
- `crm/stage-transition.ts`: validação da etapa na configuração do cliente e proteção de alterações manuais.
- `crm/conversation-commercial-context.ts`: controle de contexto comercial para evitar projeção na oportunidade incorreta.

Não substituir esses contratos por gravações diretas vindas de um prompt. Evoluir a experiência sobre as garantias existentes.

## Experiência proposta

### Carteira

Cabeçalho “Clientes & Oportunidades”, busca global, criar oportunidade e alternância Lista/Funil. Filtros de trabalho: Minha carteira, Preciso responder, Retornos vencidos e Sem próxima ação. Filtros secundários por responsável, etapa e origem.

Cada linha: cliente, oportunidade, etapa, próxima ação com prazo, responsável e valor quando conhecido. Pendência deve explicar o motivo; cor sozinha não basta. Sem ranking, plano da IA ou catálogo de diagnósticos na vista principal.

### Ficha

Identidade e contato; conversa disponível em uma ação; oportunidade ativa; etapa, valor e responsável; próxima ação; histórico cronológico. Se houver várias oportunidades, escolher explicitamente qual está sendo trabalhada. Nenhuma mensagem ambígua deve atualizar todas as oportunidades.

Camadas adicionais: Propostas e pagamentos; Dados do cliente; Origem; Análise da Altum. Mostrar conteúdo útil ou um comando para criar, sem painéis vazios repetidos.

### Funil

Card com nome, valor, próxima ação, responsável e risco objetivo. Contagem e soma por etapa com escopo conhecido. Movimento preserva permissões, registra autoria e confirma efeitos relevantes. Editar as regras do funil fica em configuração para quem pode gerenciar.

### IA útil

Exemplo: “Ana pediu orçamento para 12 pessoas. Preparei uma proposta com os itens confirmados. Falta a data de início.” Ações: revisar proposta, perguntar data, corrigir entendimento. Toda afirmação leva à mensagem ou registro que a sustenta.

Separar dois controles: como o agente conversa e o que pode alterar. Tom/objetividade não devem alterar permissões comerciais. Ao assumir uma conversa, o humano vê se o agente está pausado e quando será retomado.

## Como competir melhor em tarefas concretas

| Tarefa | Diferenciação proposta | Prova necessária |
| --- | --- | --- |
| Continuar uma negociação | Próxima ação com motivo, prazo e conversa no mesmo contexto | Usuário retoma uma oportunidade sem procurar em outras telas |
| Manter cadastro atualizado | Extração com evidência, correção e proteção de edição humana | Conjunto anotado de conversas mede acertos, omissões e alterações indevidas |
| Criar follow-up | Sugestão pronta a partir de compromisso real, sem duplicar tarefa | Mesmo evento processado duas vezes produz uma ação |
| Usar WhatsApp | Entrega distinguida de aceite; falha recuperável e contexto preservado | Teste em celular real, reconexão e resultado incerto do provedor |
| Trabalhar com várias compras | Um contato, várias oportunidades, vínculo explícito da conversa | Compra nova não reabre nem altera negociação antiga |
| Implantar rotina | Receitas de operação com poucos campos e prévia dos efeitos | Novo usuário configura e executa uma receita sem ajuda técnica |

As comparações externas anteriores estão em `docs/altum-compintel-2026-10-22.html`. Essas diferenciações são objetivos de produto, não capacidades já comprovadas nem ausência de recursos nos concorrentes.

## Plano por entregas e critérios de saída

1. **Clareza visual:** diminuir cabeçalho e redundâncias, preservar ações e rotas. Critério: trabalhar carteira sem atravessar explicações e análises. Primeira intervenção aplicada nesta tarefa: cabeçalhos compactos na Lista e Funil, indicadores recolhíveis e detalhes secundários da ficha recolhidos.
2. **Verdade da carteira:** busca e filtros no servidor, agregados consistentes, paginação com ordenação estável e cobertura integral. Critério: fixture com mais de uma página e dois perfis confirma busca, totais e isolamento. Requer implementação de backend em tarefa explicitamente autorizada.
3. **Próxima ação confiável:** reunir tarefas, compromissos e recomendações numa leitura única, mantendo sugestões separadas de ações confirmadas. Critério: vencidos, sem prazo, concluídos e remarcados não divergem entre agenda e ficha.
4. **CRM automático com evidência:** ampliar cobertura de linguagem sem reduzir precisão. Critério: avaliar mensagens mistas, negação, correção do cliente, áudio transcrito e várias oportunidades; publicar taxas por tipo de campo. Casos incertos pedem confirmação.
5. **Automação comercial:** receitas de primeiro contato, orçamento, proposta e retorno, com interrupção quando o cliente responde ou humano assume. Critério: reprocessamento, concorrência e retomada não enviam mensagens nem criam tarefas duplicadas.
6. **Benchmark de uso:** executar as mesmas tarefas em Altum e ambientes autenticados de Kommo/Salesforce. Medir tempo, cliques, erros, ajuda necessária e confiança dos usuários. Só declarar superioridade onde houver resultado repetível.

## Limites e riscos

Não foram medidos usuários reais, latência, produção ou dados de clientes nesta análise. Não houve acesso autenticado aos concorrentes. Busca parcial e escopo de indicadores foram identificados pelo fluxo de código; não foi simulada uma base real paginada. Não alterar backend, autenticação, banco, admin ou estilos globais como parte da simplificação visual.

Recolher conteúdo não elimina o custo de carregá-lo: o primeiro ajuste é de hierarquia visual. Ganho de desempenho exige medir e, depois, carregar dados secundários apenas quando necessários. A revisão visual no navegador e o teste com usuários continuam necessários antes de considerar a experiência finalizada.
