# Auditoria do CRM Altum — 21/10/2026

## Parecer

O CRM tem funcionalidades reais e uma base técnica relevante. Há cadastro, importação,
lista, Kanban, distribuição, ficha, conversas relacionadas, tarefas, notas, propostas,
agenda, financeiro, sinais de IA e processamento comercial com tentativas e recibos.
O nível de proteção varia entre os fluxos. Não está homologado como operação comercial
integralmente confiável: foram reproduzidas falhas de acesso entre vendedores,
integridade do funil, pendências e exclusão de registros relacionados.

A prioridade é corrigir integridade e consistência antes de ampliar a interface ou
prometer autonomia universal da IA. Esta auditoria não modifica código de produto.

## Método e limites

- Inspeção do checkout atual, inclusive alterações locais anteriores à auditoria.
- Leitura de telas CRM, Funil, Comercial, Agenda e componentes compartilhados.
- Leitura de APIs de leads, funil, tarefas, notas, propostas, agenda, distribuição,
  exclusão, métricas e integrações comerciais centrais.
- Leitura dos escritores de CRM, observador, fila, qualificação, propriedade manual
  e pontos relevantes de conexão da IA de atendimento.
- Testes locais existentes com emuladores Auth/Firestore e dados fictícios.
- Cinco reproduções adicionais executando handlers reais com usuário autenticado
  no emulador; transporte externo proibido no script.
- Não houve acesso direto ao banco real, envio a clientes ou publicação.
- A navegação para a tela publicada foi tentada, mas a leitura de acessibilidade
  do navegador excedeu o prazo. Não há homologação visual em navegador, mobile,
  contraste, leitor de tela ou versão publicada nesta auditoria.
- Os resultados locais não identificam qual revisão está publicada nem demonstram
  incidência desses defeitos em clientes reais.

## Achados reproduzidos

### A1 — Alto: funil expõe carteira de outro vendedor da mesma empresa

GET de leads restringe ownerId para vendedor sem acesso global. GET de pipeline
consulta até 240 leads da empresa e monta as colunas sem aplicar o filtro comercial
por responsável. Reprodução: o mesmo token vê somente o lead próprio na lista,
mas recebe o lead de outro vendedor no funil. Não é uma reprodução entre empresas.

Evidência: app/api/tenant/[tenantId]/pipeline/route.ts:214; comparação com
app/api/tenant/[tenantId]/leads/route.ts:190.

### A2 — Alto: exclusão em lote ignora acesso à carteira individual

A rota exige acesso à empresa e capacidade edit_leads, mas não confere acesso
comercial a cada lead. O helper verifica empresa, não responsável. Reprodução:
vendedor restrito exclui um lead atribuído a outro vendedor da mesma empresa;
resposta 200 e documento removido. Não é exclusão sem autenticação nem entre tenants.

Evidência: app/api/tenant/[tenantId]/leads/bulk-delete/route.ts:9;
lib/server/tenant-data-deletion.ts:154.

### A3 — Alto: etapa inexistente pode ser persistida por mudança manual

POST de stage normaliza a string e valida contexto para alguns nomes conhecidos,
mas não valida associação ao funil salvo. Reprodução: etapa_inexistente_audit é
persistida com resposta 200. PATCH de perfil e criação manual também possuem
caminhos sem a mesma validação transacional do funil usada por escritores novos.
Estes últimos caminhos foram inspecionados, não reproduzidos neste script.

Evidência: app/api/tenant/[tenantId]/leads/[leadId]/stage/route.ts:90 e :149.

### A4 — Alto: lista compacta apaga a informação de pendência na resposta

A tela pede view=compact. Nesse modo, o backend não consulta chats e entrega
chatSummary zerado. leadNeedsResponse usa justamente os contadores desse resumo.
Reprodução: com chat pending vinculado, compact devolve pending=0 e a resposta
completa devolve pending=1. O filtro e indicador de pendências dessa lista ficam
incorretos no caminho atual, mesmo que a conversa exista.

Evidência: app/cliente/painel/crm/page.tsx:482 e :696;
app/api/tenant/[tenantId]/leads/route.ts:283.

### A5 — Alto: exclusão deixa propostas e financeiro relacionados fora da lixeira

deleteTenantLead procura budgets e finance_entries. O módulo comercial usa
orcamentos e financeiro. Reprodução: após excluir o lead, os documentos dessas
duas coleções permanecem. Não prova expurgo completo, restauração conjunta nem
exclusão consistente dos registros comerciais.

A interface também diz “apagar definitivamente”, mas o helper cria item na lixeira.
A mensagem visível não corresponde ao comportamento de recuperação implementado.

Evidência: lib/server/tenant-data-deletion.ts:156;
app/api/tenant/[tenantId]/budgets/route.ts:90;
app/cliente/painel/crm/page.tsx:1223.

## Funcionalidades e experiência do vendedor

| Área | Parte implementada | Limitação encontrada |
| --- | --- | --- |
| Cadastro | Contato manual, normalização, validação mínima, busca de duplicados | Criação manual varre a carteira; checagem e criação separadas permitem corrida; não compartilha integralmente o protocolo de identidade do intake |
| Importação | CSV, detecção de separador, limites, origem, dono e consentimento configuráveis | Não é prova de importação real com base grande, rollback ou conciliação de todas as identidades |
| Lista | Filtros, busca, seleção, carregar mais | Busca e filtros locais somente nos leads carregados; primeira carga de 80; pendências incorretas no compacto |
| Funil | Kanban, arrastar, mudança por seletor, edição de etapas, SLA e responsável | Leitura até 240 sem paginação; filtro por vendedor ausente; movimentação manual aceita etapa inexistente |
| Ficha | Dados básicos, observações, notas, conversas relacionadas, próximos passos, pedidos e IA | Excesso de blocos; dados extraídos centrais sem editor direto; lista pode prevalecer sobre detalhe mais completo |
| Tarefas | Criar, concluir, reabrir e listar | Formulário da ficha não envia data; PATCH de tarefa só muda status; não oferece reagendamento nesse fluxo |
| Agenda | Compromissos, cliente, data, local, link e estados de confirmação/conclusão | Consulta appointments, enquanto tarefas da ficha usam lead_tasks; Retornos fica oculto na navegação compartilhada |
| Propostas | Rascunho, Enviado, Aprovado, Perdido; vínculo, valor e validade | Alterar status não comprova envio externo ou aceite do cliente; consulta limita a 200 |
| Distribuição | Vendedor selecionado, distribuição e desfazer com auditoria | Limites de leitura e propagação por várias coleções; sincronização integral não é uma única transação |
| Exclusão | Lixeira e restauração com controles de retomada de envios | Falta acesso individual no lote; coleções comerciais fora do manifesto; texto de exclusão incorreto |

### Cliente e oportunidade ainda se confundem

O mesmo documento leads armazena contato, etapa, valor, responsável e contexto da
negociação. A criação manual rejeita email/telefone já existentes. Não foi encontrado
um fluxo independente e completo de várias oportunidades simultâneas por cliente
nesse núcleo. Isso limita recompra, negociações paralelas, suporte junto com venda
e indicadores de conversão por oportunidade.

### Próxima ação não tem uma fonte única

Há aiNextAction, qualification.nextAction, salesJourney, tarefas e compromissos.
A tela escolhe entre fontes por precedência. Uma sugestão da IA, uma obrigação
assumida e um agendamento confirmado têm significados distintos e precisam ser
identificáveis para o usuário. Hoje a ação recomendada aparece mais claramente
do que um compromisso editável com dono e data.

### Perda e ganho

Mover para perdido no handler inspecionado não coleta motivo de perda. Ganho
manual não exige comprovação de pagamento. Essa escolha pode ser válida, mas o
produto precisa distinguir venda fechada, proposta aceita e dinheiro recebido.
Não tratar valor potencial como receita realizada.

## Interface e frontend

Pontos bons:

- Reuso de componentes e variáveis de cor da área cliente.
- Rotas antigas e links de contexto por leadId preservados.
- Tratamento de carregamento, erro, sucesso, capacidades e bloqueio durante envio.
- Layouts responsivos, gaveta no mobile e controles alternativos ao arrastar.
- Gaveta com Escape, foco inicial, contenção de Tab e devolução de foco.
- Carga compacta, valores derivados memorizados e busca com atualização adiada.

Problemas observáveis no código:

- A ficha reúne Próximo passo, Resumo comercial, Plano da IA, IA aplicada,
  oferta, objetivo, confiança, captura, atribuição e outros blocos com sobreposição.
- “Ao vivo”, “agora”, “sem dores” e “nenhuma pergunta crítica pendente” podem ser
  usados como fallback sem comprovação de atualização ou análise suficiente.
- O formulário de edição não expõe interesse, necessidade, orçamento declarado,
  prazo, decisor e objeção em campos próprios.
- selectedLead prefere a linha da lista ao detalhe; a lista não projeta vários
  campos que a ficha lê de selectedLead, como aiFieldEvidence e aiLeadSummary.
  Alguns blocos usam explicitamente detail e outros não: há inconsistência de fonte.
- loadDetail não cancela nem identifica a requisição anterior antes de setDetail.
  Há risco de resposta antiga aparecer após seleção rápida de outro cliente;
  não foi reproduzido em navegador nesta auditoria.
- Não há atualização contínua uniforme de leads/detalhe. Presença é atualizada
  periodicamente; etapas no CRM são recarregadas em eventos específicos. Isso
  não torna o restante do CRM em tempo real.
- Salvar ou mover recarrega a primeira página; os leads carregados adicionalmente
  podem sair do conjunto em memória.
- Erro de movimentação no Kanban é genérico, perdendo o motivo detalhado da API.
- Inputs do editor se apoiam em placeholders; revisar rótulos e acessibilidade
  completa em navegador antes de homologar.

## Backend, dados e concorrência

Pontos bons:

- Autenticação, associação à empresa, módulos e capacidades nas rotas centrais.
- Verificação por vendedor no detalhe, lista e várias mutações.
- Edições manuais centrais com versão de documento e evento no mesmo commit.
- Propriedade manual de etapa, prioridade e tags; proteção separada do score manual.
- Observações com identidade determinística, fila, lease, tentativas e falhas terminais.
- Propostas com protocolos mais completos de revisão, repetição e trabalho pendente.
- Intake novo com tratamento transacional de identidades e conflitos.

Limitações:

- Essas proteções não estão uniformes: A1/A2 são exemplos autenticados reproduzidos.
- Tarefas e notas usam gravações independentes em Promise.all; registro e evento
  podem divergir se apenas uma gravação falhar.
- Deduplicação de tarefa é consulta seguida de add, fora de reserva atômica;
  chamadas simultâneas podem criar tarefas iguais.
- Criação manual faz o mesmo padrão de consulta prévia seguida de criação;
  não equivale ao intake transacional novo.
- Múltiplas representações: stage/pipelineStage, potentialValue/valorPotencial,
  ownerId/ownerUserId/assignedTo, aiMemory/customFields/ai*, além de coleções
  comerciais com nomes diferentes. Compatibilidade aumenta manutenção e risco.
- Etapa pode ser gravada antes dos efeitos auxiliares; uma falha posterior pode
  devolver erro após a alteração já estar persistida. Nem todo caminho tem recibo
  integral para retomar cada efeito com segurança.
- Proteção humana genérica cobre apenas três campos; não presumir proteção
  universal de temperatura, valor, resumo ou campos comerciais extraídos.
- Edição manual bloqueia etapa para automações; não foi encontrado, nas telas
  auditadas, um controle claro de devolução daquele campo ao modo automático.

## IA e canais

O preenchimento automático existe em dois caminhos: observador baseado em padrões
e agente de atendimento com campos estruturados propostos pelo modelo.

O observador lê até 80 mensagens recentes da conversa e usa texto/legenda. Campos
com evidência podem guardar ID da mensagem e trecho de origem. Não responde ao
cliente e pode registrar fatos com respostas automáticas pausadas.

Limitações relevantes:

- Uma interrogação em qualquer ponto da mensagem faz a extração passiva retornar
  vazia, inclusive quando existe uma declaração útil junto de uma pergunta.
- Padrões cobrem frases específicas; não garantem entendimento de linguagem natural.
- A rota com modelo inclui contexto e pode receber resumo multimodal, mas isso
  não torna o observador multimodal nem comprova exatidão de toda transcrição.
- WhatsApp e Meta têm ligação com processamento compartilhado. Isso não prova
  todos os canais, conectores, permissões e histórias reais em produção.
- Identidade social e telefônica não deve ser unificada só por nome; a convergência
  integral de histórico entre canais não foi homologada nesta auditoria.
- Qualificação dá pontos para telefone, email, empresa, tipo de negócio, orçamento
  e outros critérios genéricos. É uma regra de pontuação com viés B2B; score não
  é probabilidade estatisticamente validada de compra.
- Sugestão de etapa combina proposta do modelo e associação por palavras nos
  IDs/rótulos/descrições. Não substitui critérios verificáveis de entrada por etapa.
- Interesse em proposta/agendamento pode virar ação que sugere etapa correspondente;
  solicitação, execução e confirmação precisam ser distintas.
- Evidência do agente usa fonte/confiança/contexto, mas não tem o mesmo formato
  literal por mensagem em todos os campos do observador.

## Gestão, busca e escala

- Lista: primeira carga de 80, API padrão 200 e máximo 250 por chamada.
- Funil: até 240 leads, sem paginação no handler.
- Propostas: até 200; Retornos: até 300 tarefas.
- Métricas consultam recortes como 700 leads, 350 chats e 1800 mensagens.
- Em diversas consultas o limite é aplicado antes de ordenar ou filtrar em memória.
  Isso não garante os mais recentes nem cobertura integral do período.
- Busca da lista percorre os leads já carregados; pesquisar não consulta toda a base.
- Valor em carteira na lista soma o conjunto filtrado sem excluir automaticamente
  etapas terminais, apesar do texto “oportunidades abertas”.
- O funil calcula ganhos/perdas pelos IDs ganho/perdido e taxa por total de leads;
  etapas terminais personalizadas e denominadores exigem semântica consistente.
- Ranking combina carteira carregada e métricas de outro recorte. Não é uma base
  confiável para comparação integral entre vendedores sem explicitar cobertura.
- A ficha dispara várias leituras; analyzeLeadCommercialState repete algumas
  informações e consultas. Falha de uma dependência pode impedir toda a ficha.
- Offset, varreduras de carteira e leituras cruzadas ampliam custo e latência.
  Não houve teste de carga, orçamento de latência ou medição de custo neste trabalho.

## Ordem de correção sugerida

1. Acesso por registro em funil e exclusão; testar todos os perfis nas rotas irmãs.
2. Manifesto de exclusão/restauração compatível com as coleções comerciais reais.
3. Validação do funil real em todas as escritas e tratamento de registros legados.
4. Corrigir pendências no compacto e busca/contagem com cobertura explícita.
5. Unificar próxima ação, prazo e responsável com Agenda/Retornos.
6. Permitir corrigir fatos comerciais e identificar claramente humano, fato e sugestão.
7. Separar contato de oportunidade e definir critérios comerciais por negócio.
8. Consolidar fontes de dados da ficha e simplificar blocos redundantes.
9. Homologar jornadas reais autorizadas por canal, com modelo, entrega e evidência.

## Evidência executável

Reprodução: .qa-artifacts/crm-audit-2026-10-21/reproduce.mts

Resultado: cinco comportamentos incorretos confirmados, sem modificar produto.
Script usa IDs qa_crm_audit_* e limpa os registros fictícios criados.

Logs: .qa-artifacts/crm-audit-2026-10-21/{reproduce,tests,typecheck,lint,build}.log

Tipagem direcionada: tsconfig.crm-pipeline-view.json aprovada.
Lint direcionado de telas, bibliotecas CRM e rotas selecionadas aprovado.
Regressão ampliada: 186 verificações, 178 aprovadas e 8 reprovadas, em 482,89 s.
Não é uma bateria totalmente aprovada. A execução inicial do teste do observador
não recebeu FIRESTORE_EMULATOR_HOST e falhou por credenciais ausentes no projeto
demo; esse resultado é de preparação do teste, não prova de defeito do CRM.

Rechecagem com ambiente local explícito: 8 verificações, 5 aprovadas e 3 reprovadas.
Uma falha é um contrato textual antigo que exige import direto de commercial-access
na rota de proposta; a implementação atual delega a proposta para um helper que
aplica assertAssignedCommercialRecordAccess. Esse teste não demonstra acesso indevido.
Outra falha é timeout transacional ao enfileirar 20 chamadas concorrentes; a
verificação seguinte depende desse enfileiramento e também reprova. Na repetição
isolada, as 6 verificações do observador passaram em 34,17 s, incluindo a concorrência.
O timeout anterior continua registrado como instabilidade local sob execução conjunta;
não determina sozinho a causa nem o comportamento em produção.

Compilação global: tentativa iniciada; permaneceu na etapa de compilação sem
resultado conclusivo durante a janela da auditoria e foi interrompida pelo agente.
Não declarar build aprovado nem erro de compilação demonstrado.

Inspeção visual: tentativa de abrir a rota publicada, mas a leitura do navegador
excedeu o prazo. As conclusões de interface são derivadas do código e não de QA
visual completo da versão publicada.

## O que ainda não está comprovado

- Exatidão da extração com conversas reais por segmento e canal.
- Disponibilidade/latência dos workers e índices efetivamente publicados.
- UX desktop/mobile e acessibilidade em navegador nesta revisão.
- Volumes grandes, custo, restauração completa e falhas de infraestrutura reais.
- Mesma revisão do código em produção, contas externas e entregas reais.
- Segurança integral da plataforma: o recorte reproduziu falhas específicas,
  sem substituir auditoria de todos os endpoints, regras e configurações.
