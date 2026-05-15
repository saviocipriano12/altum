# Plano de produto comercial da area do cliente

## Tese central

A Altum deve ser percebida como uma `operacao comercial com IA`.

Isso significa que a area do cliente nao deve parecer:

- painel tecnico
- console de automacao
- CRM tradicional cheio de modulos
- soma de ferramentas separadas

Ela deve parecer:

- central de conversas
- operacao de oportunidades
- acompanhamento de agenda e proposta
- inteligencia aplicada ao atendimento e as vendas

## O que precisa mudar na percepcao do produto

Hoje a plataforma ja transmite poder, mas ainda exige esforco demais para ser entendida.

Principais problemas perceptivos a resolver:

- modulos ainda parecem ilhas
- linguagem ainda esta tecnica em varias areas
- sidebar e configuracoes mostram mais do que o cliente comum precisa
- parte do visual ainda esta leve demais no contraste e pesada demais na quantidade de blocos
- a IA ainda corre o risco de parecer sistema, nao assistente
- alguns fluxos ainda estao soltos e exigem que o usuario adivinhe o proximo passo

## Norte de produto

Em ate 30 segundos, o cliente final deve entender:

- quem precisa de resposta
- quais oportunidades estao ativas
- o que esta parado
- o que precisa acontecer hoje
- como a Altum esta ajudando

Em ate 3 minutos, o cliente deve conseguir:

- abrir uma conversa
- ver o contexto comercial do contato
- mover uma etapa
- criar uma tarefa
- gerar ou localizar uma proposta

## Arquitetura final desejada

### Menu principal

- `Inicio`
- `Conversas`
- `Clientes & Oportunidades`
- `Agenda`
- `Campanhas`
- `Relatorios`
- `Assistente Altum`
- `Configuracoes`

### Regra de arquitetura

- a sidebar deve ser curta e forte
- subtelas devem acontecer dentro da pagina, com tabs e headers claros
- o usuario nao deve sentir que saiu para outro produto quando troca a visualizacao do mesmo dado

## Curadoria por perfil

### Atendente

Deve ver:

- Inicio
- Conversas
- Clientes & Oportunidades
- Agenda

Pode ver de forma limitada:

- Assistente Altum com insights simples

Nao deve ver de frente:

- automacoes
- comportamento tecnico da IA
- handoffs como termo tecnico
- logs
- implantacao
- configuracoes complexas

### Gestor comercial

Deve ver:

- Inicio
- Conversas
- Clientes & Oportunidades
- Agenda
- Campanhas
- Relatorios
- Assistente Altum com leitura gerencial

Pode ver:

- propostas e financeiro comercial
- desempenho de equipe
- configuracoes operacionais do negocio

Nao deve ver de frente:

- logs tecnicos
- runtime
- guardrails
- detalhes profundos de implantacao

### Admin do cliente

Deve ver:

- operacao do negocio
- equipe
- usuarios
- canais
- empresa
- permissoes
- implantacao simplificada

Pode ver:

- configuracoes mais amplas da conta

Nao deve ver de frente, salvo necessidade:

- logs tecnicos detalhados
- diagnostico interno da Altum

### Tecnico ou Altum

Deve ver:

- tudo o que for avancado
- automacoes completas
- comportamento da IA
- escaladas
- logs
- implantacao
- diagnosticos

## O que sai da camada comum

Itens que devem sumir do menu principal do cliente comum ou ficar em `Avancado`:

- logs
- runtime
- guardrails
- filas tecnicas
- handoff como termo
- controle fino da IA
- telas de implantacao profundas
- automacoes em linguagem tecnica

Substituicoes de linguagem:

- `Handoff` -> `Escalado para humano`
- `Controle da IA` -> `Comportamento do assistente`
- `Automacoes Sociais` -> `Respostas automaticas`
- `Go-live` -> `Implantacao`
- `Logs` -> `Logs tecnicos`

## Direcao visual final

### Objetivo visual

Fazer a Altum parecer:

- comercial
- premium
- limpa
- segura
- tecnologica
- facil de usar

### Problemas visuais a corrigir

- excesso de informacao no sidebar
- duplicidade de marca no topo
- textos secundarios claros demais
- muitos chips, badges e blocos brigando por atencao
- densidade excessiva de informacao em telas de configuracao
- cards demais para pouca hierarquia

### Regras visuais

- usar uma marca principal apenas por contexto de shell
- evitar logo no sidebar e no header ao mesmo tempo
- aumentar contraste de texto secundario e labels
- reduzir elementos decorativos e bordas desnecessarias
- priorizar respiro e alinhamento
- usar branco e cinza-azulado como base estrutural
- azul e indigo como estrutura e acao primaria
- verde apenas em conversa, WhatsApp e sucesso
- roxo apenas em IA e assistente
- laranja apenas em alerta, pendencia e implantacao
- vermelho apenas em erro e risco

### Tokens recomendados

- fundo geral: `#F6F8FB`
- superficie principal: `#FFFFFF`
- superficie secundaria: `#F8FAFC`
- borda: `#E5E7EB`
- texto principal: `#0F172A`
- texto secundario: `#475569`
- texto auxiliar: `#64748B`
- azul principal: `#2563EB`
- azul hover: `#1D4ED8`
- verde conversa: `#16A34A`
- roxo IA: `#7C3AED`
- laranja alerta: `#F97316`
- vermelho erro: `#EF4444`

## Padrao de shell

### Sidebar

Deve ser:

- mais curta
- mais silenciosa
- com uma unica marca
- sem bloco grande de informacao concorrendo com a navegacao
- sem subatalhos fracos como solucao principal

Deve conter:

- menu principal
- opcionalmente uma secao discreta de `Avancado` apenas por permissao
- conta do cliente em versao compacta

### Topbar

Deve ter:

- titulo da pagina
- contexto curto
- busca global
- notificacoes, ajuda e perfil

Nao deve ter:

- segunda marca forte
- excesso de texto
- blocos de status brigando com a pagina

## Conversas como coracao do produto

### Papel da tela

`Conversas` deve parecer um `WhatsApp comercial com CRM e vendas integrados`.

### Estrutura final

- esquerda: lista de conversas
- centro: chat
- direita: cliente ou oportunidade

### Ajustes obrigatorios

- usar foto real do contato sempre que houver
- simplificar ainda mais a lista lateral
- reduzir chips e indicadores secundarios
- deixar o chat mais limpo e mais familiar
- separar notas internas de forma discreta
- concentrar contexto comercial no painel direito
- mover acoes avancadas para menus e drawers

### Regra de ouro

Tudo o que move a venda precisa ser possivel sem sair da conversa:

- responder
- assumir atendimento
- mover etapa
- criar tarefa
- criar proposta
- abrir ficha completa

## Clientes & Oportunidades como experiencia unica

### Papel da tela

Substituir a sensacao de `CRM + Pipeline + Comercial + Follow-ups separados` por uma unica area de trabalho.

### Visualizacoes da mesma base

- `Lista`
- `Kanban`
- `Agenda`
- `Propostas`

### Regras

- o dado e o mesmo
- muda apenas a forma de visualizar
- a ficha lateral do cliente ou oportunidade precisa ser a mesma entre as views
- o usuario nao deve sentir troca de modulo

### Conteudo minimo da ficha lateral

- dados principais
- conversa relacionada
- tarefas
- propostas
- historico
- etapa
- responsavel
- valor
- temperatura
- notas

## Agenda como proxima acao

`Agenda` deve consolidar:

- follow-ups
- tarefas
- retornos
- compromissos

Ela precisa responder:

- o que vence hoje
- o que esta atrasado
- o que vem depois

## Assistente Altum como produto de apoio

Para o cliente comum, o assistente deve parecer:

- ajuda pratica
- recomendacao
- insight
- base de conhecimento

Nao deve parecer:

- console de IA
- painel tecnico
- pagina de infraestrutura

Estrutura sugerida:

- `Visao geral`
- `Base de conhecimento`
- `Sugestoes e simulacoes`
- `Automacoes`
- `Escaladas`
- `Avancado` por permissao

## Fluxos soltos que precisam ser fechados

### Fluxo 1: conversa para venda

- lead entra
- conversa abre
- contexto comercial aparece
- usuario responde
- move etapa
- cria tarefa ou proposta

### Fluxo 2: oportunidade para acao

- gestor abre `Clientes & Oportunidades`
- troca entre lista, kanban, agenda e propostas
- abre a mesma ficha
- entende situacao
- toma acao sem sair do dominio

### Fluxo 3: campanha para oportunidade

- campanha gera lead
- lead entra no conjunto de clientes e oportunidades
- conversa ou tarefa nasce com contexto
- relatorio mostra impacto

### Fluxo 4: IA para escalada humana

- IA atua normalmente
- detecta limite
- pede humano de forma clara
- humano assume
- historico fica preservado

### Fluxo 5: automacao simples

- usuario entende o que a automacao faz
- ativa ou desativa sem linguagem tecnica
- sabe onde aquela automacao impacta
- consegue testar ou acompanhar resultado

## Roadmap de implementacao recomendado

### Onda 1: curadoria e limpeza

Objetivo:

- decidir o que cada perfil ve
- esconder o que nao deve aparecer
- limpar linguagem
- aumentar legibilidade
- remover duplicidade de marca

Entregas:

- revisao de labels
- revisao de permissoes visuais
- simplificacao do shell
- contraste e tipografia

### Onda 2: shell premium e consistencia visual

Objetivo:

- deixar o portal bonito, limpo e comercial

Entregas:

- sidebar compacta
- topbar limpa
- ritmo de espaco consistente
- cards e superficies mais sofisticados
- cores contextuais corrigidas

### Onda 3: Conversas definitivo

Objetivo:

- transformar `Conversas` na melhor tela do produto

Entregas:

- lista no padrao familiar
- chat mais proximo de WhatsApp Web
- painel de cliente mais forte
- avatar real em toda a experiencia

### Onda 4: Clientes & Oportunidades unificado

Objetivo:

- criar a experiencia unica inspirada em Kommo, HubSpot e Pipedrive

Entregas:

- tabs fortes
- mesma ficha lateral
- views de lista, kanban, agenda e propostas
- compatibilidade com rotas antigas

### Onda 5: Agenda e propostas conectadas

Objetivo:

- consolidar proxima acao e comercial

Entregas:

- agenda conectada a clientes
- propostas dentro do contexto da oportunidade
- menos necessidade de sair de contexto

### Onda 6: Assistente Altum e configuracoes por perfil

Objetivo:

- tirar a IA da cara de console e colocar em modo de produto util

Entregas:

- assistente por camadas
- avancado por permissao
- automacoes simplificadas
- implantacao e logs fora da camada comum

## Criterios de qualidade

So considerar a transformacao bem sucedida quando:

- o cliente comum entende onde clicar sem treinamento longo
- a home responde o que precisa ser feito agora
- `Conversas` parece uma ferramenta familiar de atendimento e venda
- `Clientes & Oportunidades` nao parece mais um conjunto de modulos soltos
- a IA parece ajuda comercial, nao sistema tecnico
- o visual tem contraste, respiro e hierarquia
- o menu principal fica curto e confiavel
- o tecnico continua tendo acesso ao poder completo, mas em camada separada

## Recomendacao pratica imediata

Antes de novas grandes telas, a prioridade mais segura e mais importante e:

1. revisar curadoria por perfil
2. limpar shell, contraste e linguagem
3. simplificar configuracoes visiveis ao cliente comum
4. fortalecer avatar real e identidade humana nas conversas
5. so depois aprofundar a unificacao completa dos fluxos
