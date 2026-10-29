# Fidelidade das demonstrações públicas à plataforma

## Situação da inspeção

Após o usuário autenticar o navegador, foram inspecionadas as telas locais de Início, Conversas, Clientes & Oportunidades, Agenda e Perguntar à Altum. A primeira conta mostrou “Minha carteira”, sem registros e sem acesso ao Assistente. Em seguida, o usuário abriu explicitamente o cliente fictício Clínica Aurora Prime na porta 3000. Essa sessão permitiu conferir os estados preenchidos e também a tela do Assistente Altum.

No cliente fictício, foram observados resultados da empresa, fila de 48 conversas, conversa selecionada com origem/próxima ação/oferta provável, base de clientes e agenda com compromissos, além de papel, conhecimento, prontidão, áudio e escaladas no Assistente. As datas dos registros de demonstração estavam antigas; a reprodução usa um cenário relativo e fictício para apresentar os comportamentos, não um espelho temporal da conta.

As observações iniciais abaixo vieram do código-fonte e foram comparadas às telas acessíveis. Capturas de referência ficam somente em `.qa-artifacts/product-fidelity/`; não são assets públicos e não foram usadas para publicar nomes ou dados da conta.

Nenhuma interface interna, autenticação ou dado de cliente foi alterado. Não utilizar dados reais nas demonstrações públicas.

## Diferenças já identificadas

| Área | Implementação real consultada | Diferença na prévia pública atual |
| --- | --- | --- |
| Navegação | `app/cliente/painel/components/cliente-sidebar.tsx` | Menu público ilustrativo reduzido e sem distinção entre áreas de IA. O menu real depende de permissões, módulos e perfil. |
| Início | `app/cliente/painel/page.tsx` | Tela real organiza visão da empresa/minha carteira, resultados e próxima ação com “Resolver agora”. A prévia usa saudação e indicadores inventados. |
| Conversas | `app/cliente/painel/inbox/page.tsx` | Validar fila, filtros, conversa selecionada, estados e contexto comercial reais; a prévia atual é uma composição simplificada. |
| Clientes & Oportunidades | `app/cliente/painel/crm/page.tsx` e `pipeline/page.tsx` | Tela real oferece lista, funil, filtros e ficha lateral. A prévia mostra somente um Kanban ilustrativo. |
| Agenda | `app/cliente/painel/agenda/page.tsx` | Ainda não existe uma prévia pública própria da agenda. |
| Perguntar à Altum | `app/cliente/painel/perguntar-altum/page.tsx` | Analista comercial com perguntas iniciais, conversa, métricas e fontes. Está rotulado como “Assistente Altum” na aba pública. |
| Assistente Altum | `app/cliente/painel/ia/page.tsx` | Área própria, separada de Perguntar à Altum. Não representar uma pela outra. |
| Aparência e perfil | `components/cliente-shell.tsx` | Plataforma tem tema, densidade e modo essencial/completo; documentar qual perfil e modo fundamentam a apresentação. |

## Reconstrução das prévias públicas

As reproduções passaram a seguir a estrutura real: menu e cabeçalho separados, base cinza, cards brancos, seleção azul/índigo, verde em Conversas, amarelo em Agenda e roxo em inteligência. O laranja da página pública não substitui as cores internas do produto.

- Início: visão da empresa, próxima ação, indicadores e decisões prioritárias. Removidos a saudação e o gráfico inventados da primeira ilustração.
- Conversas: cabeçalho “Operação de conversas”, fila, busca, conversa, origem, próxima ação, oferta provável e compositor inspirados nos componentes reais e no estado preenchido observado.
- Clientes: lista e ficha lateral, filtros e etapas reais, em lugar do Kanban genérico.
- Agenda: adicionada uma quinta aba com compromissos, confirmação e comando da agenda.
- Perguntar à Altum: nome correto, comandos rápidos, conversa e dados usados. Não se apresenta como a tela de configuração do Assistente.
- Assistente Altum: sexta aba própria, com papel, comportamento, conhecimento, canais/voz, teste, prontidão e cérebro comercial, baseada na tela liberada do cliente fictício.

Uma sequência de quatro etapas demonstra atendimento, proposta e compromisso com dados fictícios. Ela não executa APIs nem modifica a conta. Há controles de próxima etapa e pausa; o avanço automático respeita visibilidade, aba ativa e preferência de movimento reduzido.

A troca automática entre telas e a animação dentro de cada tela têm controles independentes. A reprodução desktop mantém uma altura proporcional; no celular reorganiza o conteúdo e oculta o menu lateral.

Limitação: não há equivalência pixel a pixel, e estados preenchidos usam fixtures de apresentação. As telas internas dependem de permissões e módulos; o menu da apresentação é uma seleção das áreas demonstradas, não uma promessa de acesso para todos os perfis. A inspeção não alterou configurações do Assistente, não publicou ajustes e não enviou mensagens.

As prévias ilustrativas não devem ser apresentadas como capturas reais ou demonstrações já validadas.

## Validação

- Inspeção autenticada de seis áreas no cliente fictício fornecido pelo usuário.
- ESLint dos componentes alterados sem erros.
- Os dois builds de produção concluíram com sucesso, incluindo TypeScript e geração das 369 páginas. O segundo inclui os ajustes finais de proporção e independência dos controles.
- As 36 rotas públicas responderam corretamente; 18 arquivos de imagem referenciados encontrados.
- Seis abas verificadas no desktop. Cinco áreas adicionais verificadas em viewport de 390px, sem rolagem horizontal da página.
- Pausa e avanço manual da sequência conferidos no navegador. Evidências em `.qa-artifacts/product-fidelity/`.

Sem publicação remota. Nenhum arquivo da área interna foi alterado por esta tarefa; alterações preexistentes no workspace foram preservadas.
