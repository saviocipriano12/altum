# Plano de evolução do CRM Altum

Data: 21/10/2026. Base: AUDITORIA_CRM_2026-10-21.md.
Estado: execução iniciada; primeiro lote de correções implementado e validado
localmente. As etapas integrais continuam abertas. Evidências e riscos em
[CRM_PRIMEIRO_LOTE_2026-10-21.md](CRM_PRIMEIRO_LOTE_2026-10-21.md).

## 1. Resultado de produto

O vendedor abre a Altum, encontra quem precisa de atenção, entende o contexto,
responde e registra o próximo passo sem preencher dados repetidos.
O dono acompanha atendimento, oportunidades, vendas, recebimentos e gargalos com
dados conciliáveis com os registros que formam cada indicador.
A IA reduz digitação e leitura repetitiva, registra fatos verificáveis e ajuda a
avançar vendas dentro das regras de cada empresa, sob controle humano.

“100%” significa cumprir integralmente os critérios deste escopo e manter medição
e recuperação operacional. Não significa acerto universal da IA ou ausência eterna
de defeitos. Cada entrega exige prova funcional e experiência utilizável.

## 2. Regras de execução

- Priorizar app/cliente/painel e os serviços que sustentam sua operação comercial.
- O pedido atual exige planejar correções de APIs e dados; não limitar o plano a CSS.
- Preservar admin, autenticação, páginas públicas e funcionamento dos demais módulos.
- Compatibilidade com rotas e vínculos antigos; migrações incrementais e reversíveis.
- Reusar componentes existentes e evitar uma biblioteca visual paralela.
- Manter a navegação principal das diretrizes AGENTS.md. Minha rotina é uma visão
  da operação, sem criar mais um módulo principal concorrente com Agenda e Conversas.
- Entregas pequenas: problema, alteração, evidência, risco restante e reversão.
- Nenhuma fase é concluída apenas porque um teste textual ou um caso feliz passou.
- Alteração estrutural deve mapear todos os escritores e leitores afetados.
- Publicação e migração em dados reais têm pacote próprio, com evidência e recuperação.

## 3. Referências examinadas e aplicação

Consulta em 21/10/2026. São referências para escolhas da Altum; nenhuma dependência
ou código desses projetos foi incorporado neste plano.

| Referência | Aplicação proposta na Altum |
| --- | --- |
| [Pipedrive — Activities](https://support.pipedrive.com/en/article/activities) | A mesma atividade ligada à pessoa e à negociação aparece no calendário, na ficha e na lista de trabalho; tem responsável, prazo e conclusão |
| [Frappe CRM — repositório](https://github.com/frappe/crm) | Ficha reúne ações, histórico e dados, com visões salvas e Kanban |
| [Frappe CRM — Tasks](https://docs.frappe.io/crm/task) | Tarefas com vencimento, responsável e filtros de trabalho |
| [Twenty — repositório](https://github.com/twentyhq/twenty) | Avaliar componentes e padrões de navegação/edição durante os protótipos e a implementação |

Reuso de código será decidido por componente e compatibilidade com Next/React e a
arquitetura atual. Registrar arquivo, revisão, licença, atribuição, adaptação e testes.
O Frappe CRM informa AGPL-3.0. O Twenty tem licenciamento misto, incluindo partes
AGPL, comerciais e pacotes MIT; verificar o arquivo/pacote específico antes de copiar.
Fontes: [Frappe LICENSE](https://github.com/frappe/crm/blob/develop/LICENSE) e
[Twenty LICENSE](https://github.com/twentyhq/twenty/blob/main/LICENSE).
Padrões de experiência podem orientar uma implementação própria sem importar
frameworks completos. Não reproduzir marcas, logos ou identidade visual.

## 4. Estrutura funcional de destino

| Registro | Responsabilidade |
| --- | --- |
| Cliente/contato | Identidade, canais comprovados, preferências e histórico do relacionamento |
| Empresa | Opcional; organização relacionada a contatos, para os negócios em que isso existe |
| Oportunidade | Compra em negociação: interesse, etapa, valor, responsável, previsão e resultado |
| Conversa | Atendimento em determinado canal/conta, ligado ao contato e, quando apropriado, à oportunidade |
| Atividade | Ação com responsável, vencimento, estado e vínculos; pode ser retorno, ligação, reunião ou tarefa |
| Proposta | Oferta com itens, valores, condições, revisão e evidências dos estados |
| Registro financeiro/pedido | Fato comercial ou financeiro correspondente, com sua origem e situação próprias |
| Evidência/evento | Origem de fatos e histórico de alterações humanas, automáticas e externas |

Uma pessoa pode ter várias oportunidades e conversas. Uma conversa de suporte não
cria necessariamente oportunidade. Ganho, aceite e recebimento são fatos diferentes.
Próxima ação é uma atividade concreta ou uma sugestão claramente identificada;
nenhuma recomendação substitui silenciosamente um compromisso humano vigente.

### Campos e preenchimento

- Cadastro inicial mínimo: identificação disponível e canal; não exigir empresa,
  email, orçamento e telefone para um contato já atendível pelo Instagram.
- Oportunidade ativa: interesse, responsável, etapa e próximo passo ou motivo de espera.
- Necessidade, quantidade, local, orçamento, prazo e decisor aparecem por contexto.
- Orçamento declarado, preço apresentado, valor negociado e receita têm campos distintos.
- Campos adicionais configuráveis por negócio, com tipo, finalidade e etapa relevante.
- Campos extraídos editáveis; guardar origem, mensagem, data e correção humana.
- Sem informação é ausência de informação; não preencher com frases genéricas.

## 5. Experiência de destino

### Vendedor

1. Minha rotina: novos contatos, respostas aguardando ação, atrasos, tarefas de hoje,
   propostas a acompanhar e oportunidades sem próxima ação.
2. Cada linha mostra cliente, interesse, etapa, ação, prazo, dono e motivo da prioridade.
3. Abrir conversa e ficha preserva seleção, filtros, posição de leitura e contexto.
4. Ficha começa com necessidade, negociação atual, último acordo e próxima atividade.
5. Responder, ligar, criar proposta, agendar e concluir são ações próximas do contexto.
6. Ao concluir uma atividade, oferecer o próximo passo sem forçar preenchimento inútil.
7. Reagendar, transferir, aguardar cliente, ganhar e perder têm comportamento explícito.
8. Histórico, documentos, pedidos e atribuição ficam em camadas de aprofundamento.

### Dono/gestor

1. Visão de atenção: clientes sem resposta, sem dono, atividades atrasadas e gargalos.
2. Visão de resultado: entradas, conversão, vendas, ticket, ciclo e motivos de perda.
3. Carteira por vendedor com os mesmos filtros e denominadores.
4. Cada indicador abre os registros exatos que o compõem.
5. Negociação, venda e dinheiro recebido permanecem identificáveis.
6. Distribuição considera elegibilidade e carga; transferência mantém compromissos.
7. Configuração do processo fica em segunda camada, com linguagem comercial.

### Interface

- Marca Altum, azul/índigo geral, verde para conversa/sucesso e roxo para apoio de IA.
- Menos blocos simultâneos; informações essenciais antes de análises complementares.
- Retirar score/confiança internos da rotina comum quando não justificarem uma ação.
- Mostrar “atualizado em” real; usar estado vazio honesto quando faltar análise.
- Desktop e celular com as mesmas ações essenciais, sem depender de arrastar cartões.
- Teclado, foco, rótulos, leitor de tela, contraste e áreas de toque verificados.
- Erros específicos e recuperáveis; uma falha auxiliar não apaga o restante da ficha.

## 6. Etapas, entregas e critérios

### Etapa 0 — Preparar uma base verificável

Objetivo: saber exatamente o que muda e preservar trabalhos existentes.

- Registrar revisão e alterações locais relevantes antes de editar.
- Transformar as cinco reproduções em testes de regressão que exijam o comportamento correto.
- Inventariar leitores/escritores: manual, importação, webhooks, IA, automações,
  ecommerce, propostas, MCP, distribuição, exclusão e restauração.
- Definir contrato comum de permissões e campos com autoria.
- Registrar o estado inicial de testes, lint, tipagem e build, incluindo instabilidades.
- Definir dados fictícios de loja, serviços e venda B2B e jornadas por perfil.

Saída: matriz de cobertura, testes reproduzindo os defeitos e lista de unidades
pequenas de correção. A compilação inconclusiva da auditoria precisa de diagnóstico;
não usar a ausência de erros de lint para presumir release válido.

### Etapa 1 — Corrigir segurança e integridade imediatas

Backlog obrigatório:

- CRM-01: mesmo escopo por registro em lista, funil, detalhe, exportação e ações.
- CRM-02: exclusão em lote exige permissão de exclusão e acesso a cada alvo.
- CRM-03: todos os escritores validam etapa no funil atual, inclusive edição e criação manuais.
- CRM-04: exclusão/restauração inclui coleções comerciais reais e dependências inventariadas.
- CRM-05: compacto entrega pendências verdadeiras sem transformar a lista numa consulta pesada.
- CRM-06: corrigir texto de lixeira e estados de exclusão, restauração e falha parcial.
- CRM-07: auditar rotas irmãs e efeitos derivados com a mesma matriz de perfis.

Aceite:

- Cinco regressões passam exigindo comportamento correto.
- Vendedor A não lê, altera ou exclui carteira de B sem autorização explícita.
- Testar dono, gestor, atendente, leitura, usuário inativo e outra empresa.
- Acesso negado não produz escrita, tarefa, automação nem chamada externa.
- Nenhuma etapa inválida entra por API, IA, importação ou automação.
- Exclusão e restauração têm manifesto verificável e não reativam envios antigos.
- Lista, ficha e conversas concordam sobre pendência no mesmo instante de referência.

Dependência: etapa 0. Benefício imediato, antes da nova modelagem.

### Etapa 2 — Consolidar contatos, oportunidades e autoria

- Introduzir identidade de contato e oportunidade separadas, com migração compatível.
- Manter aliases de IDs/rotas antigas para evitar quebrar links e integrações.
- Criar um caminho comum de mutação para os escritores, com verificação de versão,
  validação de acesso/funil, autoria, histórico e identidade da operação.
- Proteger todas as correções comerciais humanas; liberação explícita e compreensível
  do campo para atualização automática, com histórico.
- Padronizar dono, etapa e valores; manter adaptação legada em fronteiras definidas.
- Criar tratamento de possíveis duplicatas e conflitos, sem unir pessoas por nome.
- Reconhecer identidade entre canais somente com vínculo verificável.
- Distinguir conversa de compra, suporte e relacionamento.

Migração:

1. Simulação por empresa: contagens, vínculos, possíveis duplicatas e campos sem origem.
2. Cópia de recuperação e plano testado de reversão compatível com os novos dados.
3. Conversão idempotente por lotes, com mapa dos IDs e relatório de divergências.
4. Compatibilidade temporária de leitura e um único caminho autorizado de escrita.
5. Conciliar cadastros, oportunidades, propostas e totais antes de habilitar a empresa.
6. Descontinuar campos antigos somente após comprovar ausência de consumidores.

Aceite: mesmo cliente com duas vendas simultâneas e recompra, sem duplicar pessoa;
histórico e links preservados; repetição da migração sem duplicação; edição humana
preservada em concorrência com todos os escritores inventariados.

### Etapa 3 — Entregar a rotina diária do vendedor

- Unificar atividades de CRM e Agenda por contrato e identificador comuns.
- Reusar os compromissos existentes; não criar um terceiro sistema de tarefas.
- Responsável, data, horário/fuso quando aplicável, lembrete e estado claros.
- Adicionar editar, reagendar, concluir, cancelar e transferir atividades.
- Minha rotina com filtros salvos e busca no servidor, preservando contexto ao voltar.
- Lista e funil destacam pendências reais e mostram a próxima ação e prazo.
- Ficha enxuta com editor dos fatos extraídos e histórico acessível.
- Corrigir respostas antigas de carregamento, prevalência de lista sobre detalhe,
  atualização de dados e perda de páginas após salvar.
- Transferência de carteira inclui atividades e distingue oportunidade de conversa.

Aceite de uso:

- Registrar “ligar amanhã às 14h” na ficha e encontrar o mesmo item na Agenda.
- Editar/concluir/reagendar em qualquer visão atualiza as demais.
- Resposta nova do cliente muda a fila sem recarregar toda a aplicação.
- Trocar rapidamente entre clientes não mistura notas, dados ou ações.
- Criar um retorno exige no máximo três interações principais além da digitação.
- Recuperar o ponto de trabalho após navegação e reconexão, sem duplicar envio.
- Cenários críticos passam no celular e com teclado.

Dependência: etapa 2 para identidades/vínculos; protótipos podem ser preparados antes.

### Etapa 4 — Tornar o processo comercial fiel ao negócio

- Etapas com critérios de entrada, evidência necessária, responsável e prazo.
- Escolher etapas simples por segmento, editáveis pela empresa.
- Configurar campos relevantes por etapa sem obrigar toda a ficha no primeiro contato.
- Proposta com produto/serviço, itens, condições, validade e revisões.
- Distinguir solicitado, preparado, enviado, aceito, perdido e pagamento.
- Evidência de envio/aceite associada ao estado, sem prometer prova externa inexistente.
- Motivos de perda úteis e configuráveis; ganho com valor, data e origem identificáveis.
- Nova oportunidade para recompra, preservando vendas e atendimentos anteriores.
- Automações e efeitos com repetição segura e recuperação após interrupção.

Aceite: pedido de orçamento não vira proposta enviada; interesse em visita não
vira visita confirmada; reabrir/ganhar/perder não duplica receita ou tarefas;
suporte não altera automaticamente uma oportunidade comercial diferente.

### Etapa 5 — Fazer a IA preencher e apoiar com evidência

- Separar fato declarado, inferência sugerida, compromisso confirmado e dado externo.
- Extrair interesse, necessidade, orçamento, prazo, objeção e contato conforme negócio.
- Tratar perguntas junto de fatos, negações, correções, mensagens curtas e contexto.
- Identificar evidência por canal, conta, conversa, mensagem, trecho e momento.
- Corrigir fatos sem apagar histórico; humano prevalece; fatos antigos não substituem novos.
- Vincular histórico multicanal apenas após identificação confiável.
- Áudio/imagem/documento dependem de leitura suportada e resultado verificável;
  mídia não interpretada fica explícita, sem inferir que o conteúdo foi lido.
- IA sugere uma atividade; confirmação vira atividade real sem duplicidade.
- Etapa automática exige critérios da empresa, evidência e permissão vigente.
- Começar com observação/sugestão; habilitar escrita e movimento por capacidade
  comprovada, canal e empresa. Proteger propostas, valores e encerramentos críticos.
- Falha do modelo não bloqueia atendimento humano; correções alimentam avaliação.
- Medir custo e atraso por processamento; retentativas limitadas e saúde operacional.

Avaliação proposta:

- Conjunto separado de desenvolvimento e avaliação com pelo menos 200 turnos
  anotados, equilibrados entre segmentos/canais suportados, e 30 jornadas completas.
- Incluir fatos ausentes, ambiguidade, duas oportunidades, troca de canal, correção,
  pedido de humano, áudio ilegível, falha de serviço e alteração de funil em andamento.
- Medir precisão e cobertura separadas por campo; não esconder resultados em média geral.
- Meta inicial: precisão >=98% dos fatos escritos automaticamente e cobertura >=90%
  dos fatos explícitos elegíveis do conjunto; informar tamanho e limites da amostra.
- Nenhuma escrita indevida de identidade, valor, pagamento ou etapa terminal nos
  cenários críticos; caso ambíguo exige sugestão ou revisão.
- 100% dos testes de preservação humana, isolamento de empresa e evidência passam.
- Métricas são alvos de aprovação, não resultados já alcançados nem promessa universal.
- Piloto com escrita desabilitada inicialmente compara resultado da IA e revisão humana.

Dependência: contratos das etapas 2–4. Instrumentação e conjunto de avaliação
começam antes; autonomia não é liberada antes do aceite.

### Etapa 6 — Dar ao dono uma visão confiável

- Busca, filtros e paginação no servidor, com ordem estável.
- Agregações e consultas com cobertura do período, sem totais silenciosamente truncados.
- Definir entradas, oportunidades ativas, ganhos, perdas, vendas e recebimentos.
- Conversão com denominador explícito; ciclo e tempo por etapa; motivos de perda.
- Comparação de vendedores pelo mesmo período e definição de carteira.
- Indicadores de atenção sempre ligados a registros e a uma ação.
- Receita realizada separada de valor negociado e de previsão.
- Origem com qualidade identificável: registrada, inferida ou desconhecida.
- Reusar Inicio/Relatorios; evitar dashboard paralelo dentro de cada tela.
- Exportação filtrada com o mesmo escopo de permissão e definições da tela.

Aceite: dados conhecidos de teste conciliam integralmente indicadores, lista de
registros e exportação; bases acima de 80/240/700 não perdem cobertura; filtros por
período e vendedor mantêm denominadores; ausência de dados não vira zero falso.

### Etapa 7 — Homologar uso, operação e publicação

- Jornadas completas em navegador: entrada, resposta, cadastro, oportunidade,
  tarefa, proposta, confirmação, ganho/perda, recompra, exclusão e restauração.
- Testar interrupção e retorno da conexão, resposta perdida, clique repetido,
  jobs repetidos, mudança de responsável/permissão, concorrência e serviço indisponível.
- Ambiente de desempenho com pelo menos 10 mil contatos, múltiplas conversas e
  oportunidades; representar também uma empresa pequena.
- Metas iniciais de desempenho: lista/ficha utilizáveis em p95 <=2 s e busca em
  p95 <=1,5 s, em ambiente, rede e volume documentados; medir antes de ajustar metas.
- Homologação desktop/mobile, teclado, leitor de tela e contraste.
- Sessões de uso com ao menos três vendedores e dois gestores quando disponíveis;
  se ainda não houver participantes, registrar a pendência em vez de simular aceite.
- Metas iniciais: >=90% das tarefas centrais concluídas sem ajuda; localizar próxima
  ação e pendência sem interpretação de score; nenhuma perda de contexto crítica.
- Build, lint, tipagem e regressão do pacote entregável concluídos; falhas existentes
  fora do pacote precisam de registro e isolamento comprovado.
- Piloto por empresa com acompanhamento de erros, filas, atrasos, custo e conciliação.
- Plano de reversão preserva dados novos, autoria e recibos; não volta a escritores
  que ignorem correções humanas ou reexecutem envios antigos.
- Operação assistida e manual breve por perfil, com rotina de vendedor e gestor.

Aceite final: todas as jornadas críticas e matrizes de acesso passam; sem defeitos
críticos/altos conhecidos no escopo; piloto e migração conciliados; desempenho e
usabilidade medidos; rastreabilidade de limitações dos canais/IA publicada internamente.

## 7. Matriz de conclusão

| Dimensão | Evidência necessária |
| --- | --- |
| Segurança | Negativas autenticadas por perfil/empresa/registro, sem efeitos colaterais |
| Integridade | Repetição, concorrência, exclusão e restauração sem perda ou duplicação |
| Operação humana | Rotina e agenda completas, edição de fatos, transferência e continuidade |
| Processo comercial | Etapas e documentos representam acontecimentos comprováveis |
| IA | Avaliação separada, evidências, correção humana e capacidade habilitada por resultado |
| Gestão | Indicadores conciliam com os registros completos e o período |
| UX | Tarefas reais realizadas por usuários, desktop/mobile e acessibilidade |
| Operação técnica | Build e regressões, desempenho, saúde, recuperação e reversão |

## 8. Sequência e acompanhamento

Ordem principal: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.
Protótipos, definições de indicadores, instrumentação e avaliação da IA podem
avançar enquanto as bases são corrigidas, sem habilitar fluxos dependentes cedo.
Cada correção traz sua experiência mínima de erro, confirmação e recuperação;
UX não é deixada apenas para o final.

Marcos de produto:

1. CRM protegido: defeitos reproduzidos resolvidos e acesso consistente.
2. CRM utilizável no dia a dia: ficha, conversas e agenda integradas com próxima ação.
3. CRM comercial completo: oportunidades, propostas, resultado e recompra coerentes.
4. CRM com IA comprovada e gestão conciliável: autonomia delimitada e métricas confiáveis.
5. CRM homologado: migração, piloto, experiência e recuperação aprovados.

Não fixar prazo de calendário antes da etapa 0 e da estratégia de migração. O esforço
maior está na compatibilidade de dados/escritores e na unificação de atividades.
Apresentar estimativas por etapa após decomposição, mantendo a entrega incremental.

Registro obrigatório por unidade: ID, problema, arquivos/contratos, antes/depois,
testes, QA de uso, risco residual, reversão e próximo item. Nenhum item muda para
concluído com “quase pronto” ou com erro crítico transferido para a fase seguinte.

## 9. Primeiro lote concreto

1. Adaptar reproduções da auditoria para testes de comportamento correto.
2. Aplicar filtro comercial no GET de funil e autorização por alvo na exclusão em lote.
3. Validar etapas na transação de toda escrita manual.
4. Corrigir manifesto de lixeira com propostas/financeiro e testar restauração.
5. Entregar resumo de pendências verdadeiro no compacto e validar lista/ficha/conversas.
6. Registrar evidência e limites; então iniciar o contrato de cliente/oportunidade/atividade.

Este primeiro lote já melhora proteção e uso, sem depender de um redesign completo.
