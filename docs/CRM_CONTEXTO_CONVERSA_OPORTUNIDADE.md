# Contexto comercial da conversa — implementação em andamento

## Comportamento implementado no servidor

Uma escolha humana pode vincular a conversa a uma negociação da mesma pessoa,
ou indicar atendimento sem negociação. Não basta compartilhar telefone ou nome:
o vínculo entre os registros e a pessoa precisa ser recíproco, atual e da mesma
empresa. Cada negociação também exige acesso atual pela carteira do usuário.

GET/PATCH de `chats/[chatId]/commercial-context` usam autenticação existente.
Leitura exige CRM, Conversas e acesso aos registros. Gravação exige também
`edit_leads` e `respond_inbox`. Canal pessoal é conferido no cadastro atual do
canal dentro da transação; grupos não são admitidos como compra individual.

PATCH recebe `revision`, `requestId`, `mode` (`opportunity`/`relationship`) e
`leadId` (obrigatoriamente null para relacionamento). Rejeita campos extras e
autoria fornecida pelo cliente. A transação grava a associação e seu evento em
`chats/{chatId}/commercial_context_events` juntos. Duas escolhas concorrentes
sobre a mesma revisão não podem ser confirmadas simultaneamente.

Repetir o mesmo pedido não renova o limite histórico. Se outra escolha aconteceu
depois, o replay informa `isCurrent: false` e não restaura a anterior. O cadastro,
as mensagens e os compromissos da compra anterior não são copiados ou apagados.
Em relacionamento, o vínculo legado permanece como referência, mas o observador
comercial deixa de ter uma compra elegível.

## Origem, histórico e processamento assíncrono

A escolha registra sua própria ocorrência, horário de commit do banco e gerações
da conversa, negociação e pessoa. A leitura automática exige o evento correspondente,
com a mesma escolha e horário. Uma referência recriada ou uma escolha sem seu
evento não recebe autorização de uma execução anterior.

Só uma mensagem armazenada **e ocorrida** depois da escolha pode alimentar a
negociação selecionada. Isso impede tanto alterar a data de uma mensagem antiga
quanto importar hoje uma mensagem de compra anterior. Datas inválidas não autorizam
escrita; fontes sem horário preciso podem exigir revisão. Não existe atribuição
retroativa automática de histórico ao selecionar uma compra.

A escolha participa da identidade dos trabalhos pendentes, recibos, extrações,
projeções e movimentações. A gravação final confere o contexto novamente. Trocar
a negociação ou escolhê-la de novo invalida o trabalho anterior. Resultado do
modelo que chegou depois da troca é descartado; a reserva/custo do pedido já
iniciado continua registrada e a fonte antiga não inicia outra tentativa paga.

Resumo comercial e passagem para vendedor usam a janela da compra selecionada,
sem reaproveitar o último texto, a última resposta ou a contagem de retornos
armazenados antes da escolha. Conversa explicitamente ligada a outra negociação
não entra por coincidência de telefone. O caminho legado sem seleção mantém suas
identidades de recibos e compatibilidade; não constitui identidade verificada.

O observador inclui sempre a mensagem exata e conferida que originou o trabalho.
Isso corrige o caso de datas numéricas que não eram retornadas pela consulta com
limite de data do tipo Timestamp. Não comprova que toda uma janela com tipos de
data mistos foi carregada; normalização/migração e cobertura continuam necessárias.

## Limites que impedem liberar o fluxo completo

Esta etapa não entrega o seletor na interface nem habilita o fluxo em produção.
O preenchimento passivo tem limites de contexto; o agente que responde ainda usa
memória por conversa. Ele retorna `selected_commercial_context_agent_pending`
antes de restaurar essa memória ou chamar provedores para uma escolha explícita.
Isso precisa ser substituído por isolamento real, e não por remoção do bloqueio.

Antes de habilitar a interface e o rollout, fechar:

1. Memória, catálogo, dossiê, relacionamento e resposta do agente por negociação;
   isolamento em todas as gravações e callbacks assíncronos. A unidade 46 adiciona
   memória de conversa por seleção e conferência transacional de origem/gerações,
   além de revogação do trabalho ativo e sua finalização ao trocar a seleção.
   Isso não fecha memória de pessoa, catálogo, preferências ou entrega já aceita.
2. Interpretação de mídia no novo contexto sem depender da resposta automática;
   comprovar áudio/imagem e erro, com orçamento e recuperação comuns.
3. Acesso e revisão das pendências antigas após a troca: o conferidor atual ainda
   exige `chat.leadId` atual igual à compra antiga. Conservar referências e gerações
   históricas completas no evento, sem liberar por simples igualdade de IDs.
4. Escritores dos canais, intake, automações e entregas pendentes: não substituir
   a escolha por uma associação antiga nem entregar ações da outra compra.
5. Seletor com opções autorizadas, fonte/limite compreensíveis, rascunhos, erro e
   conflito recuperáveis; suporte/continuação/recompra sem associação por telefone.
6. Exclusão/restauração do evento e da associação, gerações, compatibilidade de
   referências históricas e pacote de migração/publicação reversível.
7. Avaliação real, custo agregado das leituras, desempenho e aceite visual.

Não chamar esta implementação de CRM completo ou de agente multicanal validado.
Não reprocessar automaticamente mensagens anteriores ao limite para preencher
uma nova compra. A associação não confirma identidade, proposta, ganho ou pagamento.

## Validação e reversão

Testes com Auth/Firestore locais exercitam associação, recusa de terceiros,
autoria, canal pessoal atual, conflito, retentativa, gerações, histórico, datas,
rollback e resposta tardia simulada do modelo. Resultados terminais e limites
estão no registro da missão; simulação não é chamada a modelo/canal real.

Reversão deve desabilitar novas seleções e manter o bloqueio de contextos explícitos
nos escritores que ainda não os suportam. Não apagar a escolha ou seu evento para
voltar silenciosamente ao histórico completo. Nenhuma migração/publicação real
foi executada nesta etapa.

## Memória de conversa por seleção — unidade 46

A seleção explícita usa documento próprio em `ai_conversation_state`, com chave
calculada a partir da empresa, conversa e ocorrência da escolha. A memória legada
permanece armazenada. Leitura e escrita exigem a escolha atual, fonte conferida,
gerações de conversa/pessoa/negociação e evento de seleção. Uma chamada sem esse
contexto não acessa a memória antiga quando já existe escolha explícita.

O documento registra geração da conversa e seleção. Colisão de identidade,
conversa recriada ou falta do pai não permitem ler/atualizar memória. Repetir a
escolha da mesma compra também começa outra ocorrência, preservando a anterior.
O caminho legado exige pai atual e recusa memória anterior à geração do pai.

A fila captura a seleção na aquisição do trabalho. Durante sua execução, mudança
de seleção revoga a autorização antes dos caminhos que já usam a autorização
comum, como gravação de controle e preparação da resposta. A finalização e a
recuperação não publicam diagnóstico antigo sobre o controle humano atual.
O registro de efeitos finais também confere a seleção e não marca uma escrita de
memória recusada por mudança de contexto como concluída.

Isso não cancela uma mensagem já aceita por um serviço externo nem comprova
isolamento de todos os leitores/escritores. A resposta automática continua bloqueada
para seleção explícita até fechar o conjunto e validar o fluxo completo.
