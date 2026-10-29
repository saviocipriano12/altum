# Conferência da rotina do vendedor no aplicativo local

Status: roteiro preparado; execução visual ainda pendente. Testes de contrato e
tipagem não substituem esta conferência. Uso de navegador está desativado no Work.

## Ambiente

- Usar somente o laboratório fictício `demo-altum-qa-lab`, com modelos/provedores
  externos desligados e servidor `scripts/serve-inbox-qa.mjs` ativo.
- Endereços previstos: `http://127.0.0.1:3199/cliente/painel/crm` e
  `http://127.0.0.1:3199/cliente/painel/agenda?view=returns`.
- Conta fictícia e registros do seed local. Confirmar o isolamento antes de
  qualquer teste de criação, alteração ou troca de empresa. Não usar produção.
- Demonstração da rotina paginada: `node --import tsx scripts/seed-crm-routine-preview.mts`.
  O script só aponta para emuladores locais/projeto demo e preserva fixture já
  existente. Conta fictícia `crmrotina@qa.invalid`, senha fictícia `AltumDemo2026!`.
  Tenant próprio `qa_crm_routine_preview_20261022`: 205 clientes, 42 tarefas iniciais e dois
  casos intencionais de revisão. O launcher cria chave de cursor local efêmera.
  Dados dessa demonstração não são preenchimento pelo agente nem canal real.
  A verificação HTTP deixou um retorno fictício adicional concluído; o seed
  preserva essa alteração. Acesso: http://127.0.0.1:3199/cliente/login?next=%2Fcliente%2Fpainel%2Fagenda%3Fview%3Dreturns.
- Registrar data, versão do código, navegador, resolução, perfil e resultado de
  cada cenário. Não preencher resultados antecipadamente.

## Cenários de aceite

1. Na ficha, criar “Ligar amanhã às 14h”, com prazo e responsável. Na Agenda,
   abrir Retornos: deve existir o mesmo item, com o mesmo prazo local. A criação
   não deve exigir navegar para outro módulo nem preencher dados técnicos.
2. Na Agenda, editar o prazo desse item. Ao voltar à ficha, deve aparecer o novo
   prazo, sem duplicar o retorno. Concluir, cancelar e reabrir devem atualizar o
   mesmo registro e preservar seu histórico.
3. Deixar a ficha e a Agenda em abas distintas. Alterar o retorno numa delas e
   voltar à outra: a lista deve atualizar ao recuperar o foco. Na tela visível,
   conferir também a atualização periódica sem recarregar a página inteira.
4. Abrir edição e digitar uma alteração sem salvar. Alterar o registro na outra
   aba, voltar e aguardar uma atualização: o rascunho deve permanecer. Salvar
   a edição antiga deve avisar sobre conflito e permitir conferir a versão atual,
   sem substituir a alteração recente silenciosamente.
5. Com uma resposta de carregamento atrasada, trocar rapidamente de cliente,
   empresa ou usuário. Não deve aparecer lista, rascunho, aviso de sucesso ou
   próxima ação do contexto anterior. Ao revogar acesso, a resposta 401/403 deve
   limpar os dados protegidos e impedir edição.
6. Interromper a resposta de um salvamento fictício, inclusive após o commit.
   A espera deve terminar; os dados digitados devem continuar disponíveis.
   Repetir a mesma criação deve recuperar a mesma tarefa pelo requestId, sem
   duplicidade. Falha de atualização da ficha depois do salvamento deve informar
   que o retorno foi salvo, sem induzir a criá-lo novamente.
7. Acionar Salvar/Concluir rapidamente duas vezes. Deve existir uma única operação
   em andamento, com controle ocupado visível e sem histórico duplicado.
8. No celular e apenas com teclado, criar e editar um retorno de uma lista longa.
   O formulário deve ficar acessível/visível; rótulos, foco, mensagens de erro e
   botões não podem ficar cortados. Conferir data em fuso local e retorno sem prazo.
9. Abrir Agenda em Retornos: não deve carregar as listas de compromissos/clientes
   da outra aba. Ao selecionar Compromissos, a lista deve carregar e suas funções
   anteriores de criação, confirmação, reagendamento e conclusão devem continuar.
10. Na Agenda, combinar busca sem acentos, Meus retornos, estado e prazo. Conferir
    que “Hoje” corresponde ao fuso local e que concluídos não aparecem como atraso.
    Sair e voltar: estado/responsável/prazo devem ser recuperados somente para o
    mesmo usuário/empresa. Busca não é salva. Conferir legenda de contagem do filtro,
    sem interpretá-la como total de clientes ou da carteira inteira.

11. Na fixture paginada, carregar mais de uma página, rolar e atualizar. Conferir
    itens do início e do fim, sem duplicar registros nem apresentar a janela como
    total da carteira. Criar um retorno anterior à posição em outra aba e testar
    atualização com âncora visível, inclusive no fim da janela. Registrar saltos.
12. Buscar “Acácia” no seletor. A primeira parte pode estar vazia com continuação;
    continuar deve alcançar cliente sem tarefa prévia. Escolher o cliente, digitar
    título/prazo e buscar outro nome: a seleção deve permanecer até troca explícita.
13. Interromper a segunda página de uma atualização. A lista e o formulário já
    carregados devem permanecer; erro deve permitir tentar novamente. Testar
    cursor expirado e configuração indisponível sem virar lista vazia ou varredura
    integral depois da ativação.
14. Encontrar os retornos de revisão, conferir o problema e abrir o cliente correto.
    Dados inválidos não podem parecer fatos verificados. Validar o caminho de
    correção e a saída da revisão após atualização; anotar lacunas de orientação.
15. Abrir Novo retorno, preencher sem salvar e alternar Compromissos/Retornos.
    Seleção, texto, prazo e lista devem permanecer. Repetir com salvamento em
    andamento: trocar a aba não deve abortar uma escrita nem duplicar a criação.
    Com a aba escondida, não deve haver consulta periódica dos retornos.
16. Com mais de uma página, criar/reagendar um retorno para uma data distante,
    depois do prefixo carregado. Ele deve continuar visível durante esta consulta
    quando ainda combinar com o filtro, inclusive após a atualização periódica.
    Remover o acesso ao cliente ou concluir sob filtro Em aberto deve removê-lo,
    sem preservar dados antigos por cache.
17. Após salvar, interromper apenas a conferência posterior. A mensagem deve
    distinguir salvamento concluído de lista não atualizada, sem estimular uma
    segunda criação. Recuperar a conexão deve permitir conferir o mesmo registro.
18. Digitar uma busca e concluir rapidamente uma linha enquanto a busca ainda
    estiver pendente. A confirmação deve atualizar a consulta atual, sem trocar
    para o filtro anterior nem apresentar zero por resposta antiga/cancelada.

19. Na ficha de um cliente fictício, corrigir o orçamento e reabrir a revisão.
    Selecionar Permitir atualização pela IA e salvar. Conferir que o valor e a
    origem humana permanecem. Fechar sem salvar deve descartar apenas a seleção.
    Editar um campo deve desmarcar a liberação desse campo, preservando os outros
    rascunhos. Uma mensagem antiga não deve substituir a correção; uma nova
    mensagem comprovada pode atualizá-la. Corrigir novamente deve voltar a proteger.
    Conferir revisão simultânea em outra sessão e navegação por teclado/celular.
    Este cenário ainda não foi executado visualmente.

20. Com duas negociações fictícias da mesma pessoa, conferir seus títulos na
    lista, Kanban, ficha, conversa e apresentação móvel. Buscar pelo título deve
    abrir o registro correto. Outro vendedor não deve encontrar a compra sem
    acesso. Conferir valor desconhecido, zero explícito e retorno após editar:
    vazio deve continuar desconhecido e zero deve permanecer visível no editor.
    Totais devem informar quantos registros não têm valor e refletir os filtros
    atuais. Cenário ainda não executado visualmente; não comprova associação de
    uma conversa a múltiplas negociações nem criação pela interface.

## Limites ainda abertos

- Antes do rollout, a leitura compatível ainda percorre o conjunto acessível.
  O modo paginado tem limites por pedido e está ligado à interface no código;
  custo agregado da janela, busca esparsa, carteiras grandes e experiência real
  ainda precisam ser medidos. A existência do botão não comprova esses critérios.
- Este roteiro não comprova o agente de IA, recebimento por canais reais, seleção
  de múltiplas oportunidades, relatórios ou migração/publicação do CRM completo.
