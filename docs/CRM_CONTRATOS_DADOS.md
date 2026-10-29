# CRM — direção dos contratos de dados

21/10/2026. Desenho de implementação, ainda não migração executada.
Depende do fechamento das proteções de integridade da missão.

Atualização de execução: leitura unificada de atividades e mutações manuais de
lead_tasks implementadas localmente na unidade 4 (progresso da missão). A direção
de contatos/oportunidades e a migração integral dos escritores continuam abertas.

Unidade 6: backend local de nova oportunidade explícita implementado, reutilizando
contacts e leads. A integração de contexto com conversas/intake e a UI ainda são
pré-requisitos para habilitar o fluxo completo. Nunca interpretar testes desse endpoint
como prova de que todos os leitores/escritores já entendem várias negociações.

## Reaproveitar o que já existe

O repositório já tem contacts e contact_identity_aliases, com canonicalContactId,
leadIds e primaryLeadId em lib/server/contact-profile.ts. Esses vínculos devem ser
aproveitados e auditados; não criar outra coleção de pessoas em paralelo.

Direção preferida: contacts representa a pessoa; cada leads representa uma
oportunidade durante a transição. Acrescentar o vínculo contactId e manter leadId
como identificador compatível das rotas, propostas, tarefas e integrações.
Uma nova coleção de oportunidades só seria justificada por limitação demonstrada,
com plano de migração e adaptadores; não é pré-requisito do redesenho.

## Contato e oportunidade

- Contato guarda identidade e canais verificados. Nunca unir pessoas por nome.
- Oportunidade guarda interesse, valor, etapa, resultado, responsável e atividades.
- Nova compra de contato conhecido cria outra oportunidade por intenção explícita,
  sem passar pelo caminho de intake que atualiza a negociação existente por telefone.
- Reentrada em conversa não cria automaticamente outra venda; distinguir suporte,
  continuação e nova compra, pedindo confirmação quando ambíguo.
- ContactId é identificador interno; associação exige acesso à identidade e escopo
  atual. Ter uma oportunidade não permite ler as oportunidades de outro vendedor.
- Contatos sem identificador verificável recebem identidade própria, sem merge
  presumido; reconciliação posterior preserva IDs e histórico.
- Metadados antigos sem evidência não viram fatos confirmados ou autoria humana
  apenas por já existirem no banco.

Contrato inicial: GET/POST leads/[leadId]/opportunities. Criação exige título,
requestId e expectedSourceRevision; responsável/etapa/valor são validados. O valor
previsto pode ser desconhecido (null), diferente de zero informado. Repetição retorna
a mesma negociação sem reaplicar campos. Resultado/financeiro/IA da anterior não
são copiados, e não há disparo automático de aquisição/welcome por essa criação.

Um alias interno type=lead, com chave da geração original do registro, participa
do CAS de identidade na coleção já existente contact_identity_aliases. Ele é uma
referência interna e não prova de identidade externa verificada. Evita que a primeira
identificação por canal separe uma pessoa que já ganhou outra oportunidade.

## Conversa e negociação: fronteira em implementação

Receber uma mensagem identifica a pessoa, mas não prova a qual compra ela se
refere. O intake reutiliza somente o cadastro de entrada legado. Várias
oportunidades com identificadores iguais só são aceitas como a mesma pessoa
quando seus contatos canônicos e vínculos recíprocos concordam. Os candidatos
são paginados; uma oportunidade isolada não vira cadastro de entrada.

Quando há várias negociações vinculadas, dados comerciais recebidos permanecem
na evidência do evento e não substituem customFields do cadastro anterior. O
intake devolve requiresOpportunityContext e não deriva estágio/tarefas nesse caso.
A observação passiva e a entrada do agente aguardam contexto; a fila conserva
awaiting_context, sem anunciar conclusão nem repetir tentativas automáticas.

Essa admissão é provisória e conservadora: referências antigas a negociações
excluídas também exigem revisão. Não é a implementação da seleção explícita.
A seleção deve vir junto com fronteira temporal das mensagens, versão do contexto,
autorização atual da conversa/canal e da negociação, e efeitos causais revogáveis.
Trocar o leadId da conversa sozinho não resolve o problema e não autoriza reler o
orçamento de uma compra anterior como se pertencesse à nova.

Unidade 9: os três ramos de memória do agente recebem contexto capturado antes da
análise. Memória de outro tenant/lead ou geração anterior fica indisponível para
leitura e não é sobrescrita. Isso não significa apagar o histórico: dados
inconsistentes permanecem para conciliação. Evidência conserva seu ID completo.

Anotação multimodal confere fonte antes da análise e na gravação. Sua escrita
própria pode atualizar a revisão somente se autoria, corpo original, geração e
anotações aceitas concordarem. Essa anotação ainda é saída de processamento;
não é prova de que a visão/transcrição foi precisa ou de que o cliente afirmou
um fato comercial. Avaliar isso por campo/canal continua obrigatório.

Unidade 10: arquivo aceito é imutável e sua identidade incorpora IDs completos,
papel, MIME e conteúdo. Mensagens diferentes não compartilham um objeto porque
seus primeiros 180 caracteres são iguais. Caminhos legados continuam legíveis.
Autoridade para associar arquivo ao cadastro/mensagem é outra fronteira: cache
assíncrono precisa revalidar fonte e geração antes de atualizar a referência.
Esse trabalho nos demais produtores de mídia ainda está em andamento.

Antes de liberar a criação de oportunidade nas telas, concluir a seleção auditada,
os controles de concorrência até os efeitos/tarefas/envios e a retomada criteriosa
das observações pendentes. Informação anterior à escolha não deve ser aplicada à
nova negociação sem evidência/decisão explícita. Testes locais desse bloqueio não
provam cobertura de todos os escritores do agente nem encerram a etapa de IA.

## Atividades — fontes e mutações

Fontes existentes: lead_tasks e appointments. A primeira entrega deve oferecer um
contrato comum de leitura/mutação, com adaptadores explícitos para ambas as fontes.
Não duplicar a mesma atividade nas duas coleções nem criar um terceiro sistema.

Contrato funcional mínimo:

- ID estável com fonte identificável, tenantId, leadId/oportunidade e contactId.
- Título, tipo, responsável, prazo e estado; histórico de criação/conclusão/cancelamento.
- Datas armazenadas em instante padronizado, exibidas no fuso do negócio/usuário.
- Atividade sem prazo permanece sem prazo e pode aparecer como pendência de
  planejamento; não inventar data para forçá-la na Agenda.
- Reagendar mantém a identidade. Concluir registra instante real de conclusão.
- Transferência de carteira tem regra explícita para atividades, com autoria.
- A mesma atividade aparece em ficha, rotina e Agenda e é alterada no mesmo registro.
- Automações, IA e humano usam a mesma fronteira de mutação quando migrados.

O read model unificado não significa que todos os escritores já estejam migrados.
Documentar versão/cobertura e manter os adaptadores enquanto existirem consumidores antigos.

Unidade 8: tarefas derivadas pelo observer agora compartilham transação com a
projeção do CRM e seus históricos. A identidade da tarefa incorpora mensagem,
geração de cadastro/conversa e chave da ação. Repetição respeita conclusão e edição
humanas; a versão inicial e o responsável são explícitos. Isso ainda não migra os
escritores tardios do agente nem todos os produtores legados.

Avanço de etapa nessa projeção cria ocorrência causal na mesma gravação. Regras
comerciais, suas tarefas, agendamentos e envios se vinculam à ocorrência existente,
sem executar como uma mudança genérica de etapa sem origem. Conferir contexto
outra vez é obrigatório até o commit do efeito e a admissão da tentativa no canal.
Concluir ocorrência significa efeitos registrados, nunca prova de entrega real.
Efeito interrompido/incerto exige conciliação; a experiência dessa retomada ainda
está em implementação. Hooks de aprendizado e conversão preservam os caminhos
existentes, mas a checagem anterior à chamada não substitui auditoria de seus
próprios commits/recibos.

Entrega local inicial: GET activities oferece IDs task:/appointment:, datas ISO,
estado comum, identidade original e origem manual/ai/legacy. POST/PATCH nas rotas
antigas de tasks usam transação com evento, versão otimista, requestId para criação
e permissão atual. A API permite ausência de prazo; datas explícitas inválidas são
rejeitadas. As telas convertem horário local explícito para instante ISO.

Limite da atribuição nesta entrega: gestor pode atribuir a vendedor ativo que já
tenha acesso à oportunidade. Compartilhamento por atividade e transferência de
carteira ainda precisam de contrato para não criar tarefas invisíveis ao responsável
nem abrir a carteira de outro vendedor silenciosamente.

Compromissos permanecem em appointments e suas rotas. A Agenda dá acesso às duas
fontes, sem duplicar tarefas como reuniões. Automações, agente, ecommerce, social e
MCP que escrevem lead_tasks diretamente ainda devem ser migrados/auditados antes
de declarar autoridade humana e versão uniformes para todos os escritores.

## Filtros da rotina e paginação ainda pendente

GET activities aceita status (pending/done/canceled/suggested/all), owner (mine/all),
due (all/overdue/today/undated), q e timeZone. Ausência de filtros preserva a leitura
antiga. Validação inválida retorna 400; não amplia a consulta silenciosamente.
“Mine” usa responsável normalizado da tarefa, incluindo fallback legado autorizado
da oportunidade. Filtro não amplia acesso: vínculo/empresa/carteira são conferidos
antes de pesquisar. “Hoje” usa calendário do fuso informado; atrasados/hoje exigem
atividade pendente. Sem prazo não recebe data inventada. Busca ignora acentos.

A Agenda guarda apenas escolhas de estado/responsável/prazo por empresa/usuário,
sem guardar texto de busca ou dados de clientes nas preferências. Contagens
apresentadas nesse modo descrevem o filtro, não a carteira inteira.

Implementação atual ainda varre todas as páginas acessíveis antes de filtrar e
ordenar. coverage=complete descreve o resultado dessa leitura; não comprova custo
limitado. Não anunciar paginação de servidor ou desempenho aprovado neste estágio.
Próxima entrega deve preservar ordem global, datas ausentes, donos legados, pesquisa
além da primeira página, autorização atual e seletor de cliente sem tarefa prévia.
Cursor deve vincular usuário/empresa/filtros/fuso/ordem e rejeitar retomada incompatível.
Se houver projeção/indexação normalizada, inventariar todos os escritores e preparar
backfill reversível antes de ativá-la; ordenar só registros novos excluiria legado.
Não criar um terceiro sistema de tarefas para facilitar consultas.

## Próxima ação

Compromisso humano pendente tem precedência sobre recomendação automática.
Exibir atividade com responsável e data, ou sugestão identificada como sugestão.
Confirmar uma sugestão cria uma atividade uma única vez. Texto aiNextAction,
qualification.nextAction e salesJourney não substituem a atividade silenciosamente.

## Migração e validação

Primeiro inventariar vínculos e divergências sem escrita. Preparar lotes com IDs
originais, contagens e relatórios por empresa. O backfill deve ser idempotente e
reversível, sem reativar automações ou resumos de vendas durante a conversão.
Testar contato com duas oportunidades, suporte paralelo, transferência, recompra,
identidades ambíguas e retomada de migração interrompida.

Sem alteração em dados reais ou semântica das rotas antes dos testes dos contratos
e do pacote de migração correspondente. Este documento orienta a implementação;
não encerra as etapas 2 e 3 da missão.
