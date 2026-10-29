# Preparação da paginação dos retornos

Status: integração local em código. A rotina escolhe paginação somente nos tenants
liberados; demais tenants mantêm a leitura compatível completa. Sem implantação,
migração real ou aceite visual. A fixture própria da rotina usa os novos controles.

## Contrato de ordenação

O campo técnico `crmTaskIndex` fica no registro existente de `lead_tasks`:

- `version: 1` identifica o contrato.
- `state` usa os mesmos estados normalizados da leitura atual.
- `openRank` coloca pendências antes dos outros estados.
- `dueOrder` usa instante em milissegundos; ausência de prazo usa sentinela posterior
  às datas válidas, sem gravar uma data fictícia no campo comercial `dueAt`.
- `issue` identifica data inválida ou estado desconhecido para revisão.

Estado e prazo comerciais não são substituídos por esses campos. Responsável,
cliente e acesso não são copiados para o índice: a leitura deve resolver os
vínculos e permissões atuais. Não existe terceira coleção de tarefas.

## Pontos de gravação encontrados e adaptados

| Caminho | Arquivo | Mudança |
| --- | --- | --- |
| Criação/edição humana | lib/server/crm/activity-mutation.ts | Metadados no mesmo commit, usando versão atual na edição |
| Tarefa do agente | lib/server/crm/agent-commercial-task.ts | Mesma tarefa/fonte, metadados na criação |
| Projeção da conversa | lib/server/crm/conversation-projection-effects.ts | Metadados no plano transacional existente |
| CRM legado | lib/server/crm/operations.ts | Metadados na criação existente |
| Automação interna recebida/agendada | lib/server/automation-internal-effect.ts | Mesmo recibo e transação |
| Automação de proposta/etapa | lib/server/automation-proposal-delivery.ts | Mesmo recibo e transação |
| Caminhos legados de automação | lib/server/automations.ts | Metadados nos dois produtores encontrados |
| Intenção social | lib/server/social/service.ts | Metadados na criação existente |
| Ecommerce | lib/server/ecommerce.ts | Criação com metadados; conclusão lê contexto atual na transação |
| Rascunho MCP aprovado | app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts | Metadados no registro criado |
| Início de ligação | app/api/tenant/[tenantId]/calls/start/route.ts | Metadados no registro criado |
| Restauração da lixeira | lib/server/tenant-data-deletion.ts | Recalcula metadados da tarefa arquivada; retomada compatível e proteção de edição humana testadas localmente |

A tabela registra os pontos encontrados nesta auditoria, não prova cobertura de
executores externos ou versões antigas ainda em execução. Transferência de
carteira/desligamento altera responsáveis, não o prazo/estado indexados; consulta
futura não pode confiar em responsável antigo. Restauração de lixeira recebeu
recomposição do índice e passou na regressão local de restauração/preparação,
incluindo retomada de cópia restaurada por uma versão anterior. Escritores genéricos e versões antigas ainda
precisam entrar na conferência final de cobertura.

## Prévia revisável dos registros antigos

Com o emulador local na porta 8080 e somente empresa fictícia `qa_...`:

```powershell
node --import tsx scripts/preview-crm-task-index.mts --tenant qa_EXEMPLO --out .qa-artifacts/task-index-preview.json
```

O comando só prepara uma página de revisão. Não carrega credenciais de produção,
não aplica a mudança e não sobrescreve arquivo existente. O relatório contém IDs,
geração/revisão, hash dos dados e metadados propostos; não copia títulos ou mensagens.
`nextCursor` indica continuação. `reachedEnd` descreve o fim da consulta a partir
daquele cursor, não comprova que páginas anteriores foram revistas. Nenhum desses
campos habilita a consulta indexada automaticamente.

O serviço `task-index-migration.ts` oferece aplicação e reversão **somente no
laboratório**, para teste do protocolo:

- Aplicação exige plano com geração/revisão/hash ainda atuais e índice recomputado.
- Altera apenas `crmTaskIndex`, sem atualizar título, prazo, responsável, estado,
  versão comercial ou `updatedAt`. O updateTime real do documento muda; formulário
  que use revisão anterior deve receber conflito em vez de sobrescrever dados.
- Registra ocorrência em `audit_logs`; replay não duplica alteração/auditoria.
- Reversão restaura metadado anterior, distinguindo campo ausente de valor null.
- Reversão recusa edição comercial posterior, substituição da tarefa ou alteração
  do índice. Ocorrência revertida não é reaplicada pelo mesmo plano antigo.
- Dados inválidos ou valores legados não representáveis ficam em revisão.

## Condições obrigatórias antes de ativar a paginação

1. Publicar e habilitar, após revisar a compatibilidade, o contrato optativo de
   escrita de `firestore.rules` descrito abaixo. Ele está preparado e testado
   localmente, mas permanece desligado por padrão e não foi implantado.
2. Auditar também restauração, executores externos e versões antigas dos workers.
   Confirmar o rollout antes da varredura final; não ativar só para registros novos.
3. Revisar todas as páginas da prévia, tratar pendências e conflitos, repetir a
   conferência final de cobertura e preparar aplicação/reversão de produção para
   revisão própria. A ferramenta atual recusa esse ambiente por desenho.
4. Implantar e conferir os índices usados pela consulta em firestore.indexes.json.
   Há seis configurações preparadas para tarefas, incluindo dois índices novos
   sem filtro por issue. Arquivo salvo e emulador não comprovam prontidão real.
5. Entregar consulta com custo limitado e ordenação global por prazo, cursor
   vinculado a empresa/usuário/filtros/fuso/ordem, autorização atual por registro e
   tratamento explícito de mudanças entre páginas.
6. Entregar seletor paginado de cliente, incluindo clientes sem tarefa prévia,
   busca além da primeira página, retorno ao ponto de trabalho e atualização das
   páginas já abertas após edição. Não chamar paginação visual de paginação real.
7. Medir custo/tempo em carteira grande e validar celular/teclado. Dados não lidos
   ou resultado parcial não podem aparecer como total zero ou lista completa.

Esses itens continuam parte do plano integral do CRM. Esta preparação não conclui
desempenho, rotina completa, migração, publicação, canais reais ou aceite visual.

## Contrato optativo de escrita direta

`tenant_entitlements/{tenantId}.taskIndexWriteProtocol = 1` exige metadados
coerentes nas novas tarefas gravadas pelo SDK cliente. Ausência do documento,
ausência do campo ou valor zero mantém o contrato anterior. O cliente comum não
pode habilitar nem desabilitar esse controle; as permissões existentes de edição,
leitura e exclusão continuam sendo verificadas. Admin SDK não passa pelas regras,
portanto esse controle não substitui a auditoria dos escritores do servidor.

Quando ativo, estado, ordenação e prazo devem corresponder à própria tarefa no
mesmo commit. Prazo novo usa Timestamp ou ausência explícita; um texto legado já
indexado pelo servidor pode manter seu prazo e sua ordenação ao mudar o estado.
Uma tarefa antiga sem índice pode receber alteração não relacionada a estado ou
prazo, preservando ambos; isso mantém compatibilidade, mas não a torna elegível
para declarar cobertura indexada. Dados inválidos continuam exigindo revisão.

A regra consulta o estado posterior do controle com `getAfter`: habilitar o
protocolo e criar uma tarefa no mesmo lote já exige o novo contrato. A validação
de prazo usa `Timestamp.toMillis`. Referências oficiais:
[estado posterior das gravações](https://firebase.google.com/docs/reference/rules/rules.firestore),
[Timestamp nas regras](https://firebase.google.com/docs/reference/rules/rules.Timestamp_).

Sequência de ativação a preparar para revisão: atualizar clientes e todos os
escritores do servidor; validar compatibilidade com os dados do tenant; publicar
regras e índices; habilitar o contrato de escrita no tenant escolhido; executar a
prévia/aplicação revisadas; tratar conflitos e pendências; conferir cobertura
novamente; somente então habilitar o leitor paginado. Ativar a escrita não ativa
o leitor. Desativar o controle de escrita também não garante leitura completa:
antes de permitir escritores antigos, o leitor deve retornar ao modo compatível.
Nenhuma dessas etapas foi executada em produção.

## API paginada optativa (contrato 2, integração em código)

`GET /api/tenant/{tenantId}/activities?source=task&pageSize=20` prepara uma
página. `cursor` continua a mesma consulta; filtros de estado, dono, prazo,
busca, fuso e leadId seguem seus contratos existentes. Sem pageSize/cursor,
o endpoint continua usando o contrato 1. Não há fallback silencioso de uma
requisição paginada para uma varredura completa.

`paging=auto`, sem pageSize/cursor/leadId, é o modo da rotina global. Só escolhe
o contrato 1 antes da ativação do protocolo de leitura. Depois da ativação,
configuração inválida ou falta de chave resulta em erro, sem fallback. O primeiro
pedido usa 20 posições; pedidos de continuação seguem o contrato explícito.

O servidor exige, no documento de controle do tenant, taskIndexReadProtocol=1,
taskIndexWriteProtocol=1 e taskIndexCoverageRevision não vazia. Esses valores são
admissão de rollout, não uma auditoria automática. Não configurar sem fechar os
critérios anteriores. A configuração CRM_ACTIVITY_CURSOR_KEY deve ter 32 bytes
aleatórios em hexadecimal (64 caracteres). Não existe chave padrão; a fixture
usa uma chave fictícia própria. Rotação invalida continuações antigas.

Cada pedido lê até 201 tarefas e até 200 oportunidades, além das verificações
de política/controle. Até 50 resultados úteis são entregues por página. Se a
busca não encontrar resultados nos primeiros 200 candidatos, a resposta mantém
hasMore/nextCursor; não declara zero nem omite a continuação. Nenhuma varredura
integral dos clientes é feita para montar as opções de formulário. O seletor de
cliente terá sua própria consulta; esta resposta não fornece uma lista completa
de clientes e não pode ser usada como se fornecesse.

`items` contém tarefas verificáveis no contexto atual; `reviewItems` mantém
casos de dados inválidos ou índice inconsistente para conciliação. Essas
pendências não se tornam fatos comerciais e devem ter apresentação própria na
interface. Os contadores de leitura internos não são serializados na resposta
HTTP, para não revelar tamanho da carteira de outros vendedores.

`coverage=partial` exige continuar. `review_required` sinaliza pendências
encontradas ao longo da consulta. `end_reached` significa fim da consulta atual,
não cobertura estática ou prova de completude do índice. O cursor é cifrado e
autenticado, limitado ao usuário/empresa/política/filtros/ordem/revisão e expira
em dez minutos. O relógio dos filtros de prazo fica fixo ao início da consulta.

A consistência é `live_keyset`: pedidos sucessivos leem dados atuais. Novos
retornos anteriores à posição e alterações de ordenação podem exigir atualizar
a consulta. Isso deve ser visível e tratado no frontend, junto à deduplicação,
preservação do ponto de trabalho e atualização dos registros já abertos. Não
rotular o resultado como snapshot. O seletor paginado, a integração visual e as
medições em carteira grande ainda não estão entregues por este contrato.

## Busca de cliente para criar o primeiro retorno (integração em código)

`GET /api/tenant/{tenantId}/activities/clients?pageSize=20&q=...` consulta
oportunidades/clientes independentemente da existência de tarefas. Entrega
`options`, `nextCursor`, `hasMore` e `coverage=partial|end_reached`. A busca
considera nome, empresa, contato e título; o título da oportunidade é preservado
na opção. Até 201 registros são lidos por pedido; uma página vazia com continuação
não deve ser apresentada como busca encerrada. O acesso atual da carteira é
conferido, incluindo responsáveis legados.

O cursor tem finalidade distinta do cursor de tarefas. Usa a mesma chave de
configuração, mas não pode ser reutilizado entre as duas consultas. A escolha
de um cliente no formulário ainda deve passar pela autorização atual da criação
da tarefa; a opção carregada não concede autorização futura para editar.
O formulário global usa esse endpoint no modo paginado. A seleção fica separada
da busca e permanece disponível quando o cliente sai da página de opções.

## Critérios de aceite da integração na rotina

- O formulário deve buscar clientes sob demanda no seletor, manter a opção
  escolhida e seu título durante novas páginas/buscas e permitir tentar novamente
  sem perder o rascunho. Não limitar escolhas às pessoas já presentes nas tarefas.
- A lista deve consumir continuações, distinguir busca em andamento de fim real,
  apresentar pendências de revisão com ação e deduplicar identidades durante
  atualizações. Nenhum contador de uma janela pode parecer total da carteira.
- Atualizar registros já carregados e a primeira página deve preservar o ponto
  de trabalho e as edições abertas; a chegada de um item anterior ao cursor
  precisa de tratamento explícito. Não trocar a ordenação silenciosamente.
- Medir busca esparsa e carteira com pouco acesso: o limite por pedido não prova
  que o vendedor encontra uma tarefa distante em poucos cliques ou no p95 exigido.
  Critérios de desempenho e experiência do plano integral continuam abertos.
- Não ligar automaticamente o leitor pela existência dos endpoints. Antes de
  ativar, fechar cobertura/rollout, índices, chave, compatibilidade e apresentação
  de casos de revisão; depois comprovar o fluxo na interface e em carteira grande.

## Conferência após uma alteração confirmada

`POST /api/tenant/{tenantId}/activities/refresh` recebe `recordIds` (até 100 IDs
exatos) e `expectedScope`, com os mesmos filtros e pageSize da consulta. É uma
leitura, inclusive para perfil viewer que possa consultar o registro; não concede
permissão de editar. O hash liga a janela à consulta/política atual, sem substituir
autenticação ou a autorização atual de cada cliente.

Retorna itens atuais, revisões necessárias e `removedIds` para IDs solicitados
que não possam permanecer na janela. Ausente, outra empresa/carteira e fora do
filtro têm a mesma ausência genérica. Quantidades de trabalho ficam internas.
Não altera tarefa, histórico, fila, automação nem chama modelos/provedores.

A rotina usa esse caminho para o ID devolvido pelo salvamento ou pelo registro
que acabou de concluir/reabrir. A continuação e as outras linhas permanecem.
Se a conferência falha depois do commit, a mensagem informa que o retorno foi
salvo e pede conferir a lista; não sugere repetir a criação.

IDs confirmados nesta consulta ficam na memória do navegador. Ao atualizar as
páginas, um registro confirmado fora do prefixo recebe nova leitura autorizada
em lotes de até 100 antes de continuar visível. Se perder acesso/deixar o filtro,
sai; se um lote falhar, não se publica uma janela incompleta. Nova consulta ou
troca de escopo não reutiliza dados privados da janela anterior.

Isso não substitui a descoberta periódica das páginas: consultar apenas IDs
vistos perderia registros novos ou recém-compatíveis com a busca. A redução de
custo é na confirmação da própria ação; custo da descoberta, carteira grande e
p95 continuam requisitos de aceite. Visualização real dos fluxos permanece pendente.

## Executar compilação de revisão

`node scripts/build-crm-review.mjs` prepara o build completo com configuração
fictícia e serviços locais, sem usar valores dos arquivos .env. Verificar emuladores
e pelo menos 6 GiB livres antes de executar. O resultado serve para revisão de compilação e rotas; não deve
ser publicado como binário configurado para produção. O servidor QA usa outra
pasta de saída e não é encerrado por esse comando. Registro do resultado fica em
CRM_MISSAO_PROGRESSO.md; não inferir sucesso a partir da existência do script.
O build 44067 falhou no PostCSS e na persistência do cache sem espaço; diagnóstico
e bloqueio da limpeza automática em CRM_BUILD_DIAGNOSTICO_2026-10-22.md.
