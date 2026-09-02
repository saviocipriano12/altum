# REDESIGN CLIENTE HOJE

Este arquivo passa a ser o ponto unico de orientacao para finalizar o redesign da area do cliente sem misturar com admin, site publico ou backlog paralelo.

## 1. Escopo travado

- Foco principal: `app/cliente/painel`
- Prioridade: experiencia diaria de operacao comercial com IA
- Nao mexer em `app/admin`
- Nao mexer em backend, API, banco ou autenticacao sem pedido explicito
- Nao quebrar rotas antigas
- Nao remover funcionalidade existente

## 2. Promessa do produto

Leitura que deve guiar as telas:

- o cliente entra para responder, vender, acompanhar e decidir
- a IA aparece como apoio pratico, nao como console tecnico
- o nucleo diario e:
  - `Conversas`
  - `Clientes & Oportunidades`
  - `Agenda`

## 3. Estado atual do painel

Ja existe uma base forte de redesign no shell do cliente:

- `layout.tsx` com shell proprio
- `components/cliente-sidebar.tsx` com nova navegacao principal
- `components/cliente-topbar.tsx` com taxonomia nova
- visual mais proximo de SaaS comercial do que painel tecnico

Telas principais que ja parecem estar dentro da nova direcao:

- `Inicio` -> `app/cliente/painel/page.tsx`
- `Conversas` -> `app/cliente/painel/inbox/page.tsx`
- `Clientes & Oportunidades` -> `app/cliente/painel/crm/page.tsx`
- `Agenda` -> `app/cliente/painel/agenda/page.tsx`
- `Campanhas` -> `app/cliente/painel/campanhas/page.tsx`
- `Relatorios` -> `app/cliente/painel/metricas/page.tsx`
- `Perguntar a Altum` -> `app/cliente/painel/perguntar-altum/page.tsx`
- `Assistente Altum` -> `app/cliente/painel/ia/page.tsx`
- `Configuracoes` -> `app/cliente/painel/configuracoes/page.tsx`
- `Produtos & Servicos` -> `app/cliente/painel/produtos-servicos/page.tsx`

## 4. Onde ainda existe mistura

Rotas antigas ou especializadas ainda convivem com a nova navegacao. Elas precisam ser tratadas com curadoria, sem quebrar compatibilidade:

- `crm` = lista principal de clientes e oportunidades
- `pipeline` = visao kanban do funil
- `comercial` = propostas e financeiro ligados a cliente/oportunidade
- `follow-ups` = rotina de retornos dentro de `Agenda`
- `reunioes-assistidas` = recurso especializado ligado a `Agenda`
- `metricas` = rota antiga que hoje representa `Relatorios`
- `ia`, `conhecimento`, `handoffs`, `automacoes` = familia do `Assistente Altum`
- `captacao`, `disparos`, `automacao-instagram` = familia de `Campanhas`
- `go-live` e `logs` = devem ficar em camada avancada, nao na frente do cliente comum

## 5. Direcao pratica para hoje

Se o objetivo e finalizar hoje com clareza, a ordem mais segura e:

1. Consolidar a experiencia principal
- revisar `Inicio`, `Conversas`, `Clientes & Oportunidades`, `Agenda`, `Campanhas`, `Relatorios`
- remover excesso de blocos decorativos, previews ou explicacoes que nao geram acao
- reforcar hierarquia de prioridade, proxima acao, risco e resultado

2. Curar a camada de IA
- manter `Perguntar a Altum` como leitura de negocio
- manter `Assistente Altum` como configuracao e inteligencia aplicada
- esconder linguagem tecnica quando estiver fora de area avancada

3. Organizar a camada de configuracao
- deixar `Configuracoes` como segunda camada
- empurrar detalhes tecnicos, logs, runtime e implantacao para areas avancadas

4. Fechar compatibilidade
- preservar rotas antigas
- melhorar rotulacao, links internos e contexto para que o usuario entenda a nova estrutura

5. Validar tudo
- rodar `lint`
- rodar `typecheck`
- rodar `build` se viavel

## 6. O que nao vamos fazer hoje sem alinhamento explicito

- refactor grande de backend
- reescrever modelos de dados
- mexer em admin
- alterar autenticacao
- trocar navegacao publica
- mudar `app/globals.css` de forma ampla

## 7. Checklist de fechamento

- [ ] menu principal coerente com a nova taxonomia
- [ ] `Inicio` enxuto e com foco em operacao
- [ ] `Conversas` com aparencia de mesa principal de trabalho
- [ ] `Clientes & Oportunidades` claro entre lista, funil e ficha
- [ ] `Agenda` centrada em compromisso, retorno e proxima acao
- [ ] `Campanhas` ligada a captacao e resultado, sem cara tecnica
- [ ] `Relatorios` com leitura executiva simples
- [ ] `Perguntar a Altum` com foco em decisao de negocio
- [ ] `Assistente Altum` com IA forte, mas linguagem humana
- [ ] `Configuracoes` fora da rotina principal
- [ ] sem expor logs e controles tecnicos ao cliente comum
- [ ] lint, typecheck e build revisados quando possivel

## 8. Leitura operacional do repo hoje

O repo esta com muitas mudancas locais, inclusive fora do painel do cliente. Para nao perder foco:

- tratar `app/cliente/painel` como frente principal
- ignorar alteracoes de admin e site publico, salvo dependencia direta
- tomar cuidado para nao sobrescrever mudancas do usuario em arquivos ja editados

## 9. Proxima forma de trabalho neste chat

Fluxo recomendado:

1. escolher uma tela por vez
2. limpar o que estiver confuso
3. validar visual e coerencia com a navegacao nova
4. seguir para a proxima tela
5. no fim, rodar verificacoes tecnicas

Se seguirmos esse arquivo como contrato, da para fechar o redesign com bem mais clareza e menos retrabalho.
