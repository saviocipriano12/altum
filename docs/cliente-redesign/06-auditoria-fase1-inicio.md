# Auditoria da Fase 1 e Inicio

## Escopo revisado

Arquivos revisados:

- `app/cliente/painel/components/ui.tsx`
- `app/cliente/painel/components/cliente-sidebar.tsx`
- `app/cliente/painel/components/cliente-topbar.tsx`
- `app/cliente/painel/components/cliente-bottom-nav.tsx`
- `app/cliente/painel/components/cliente-command-palette.tsx`
- `app/cliente/painel/layout.tsx`
- `app/cliente/painel/page.tsx`
- `app/globals.css`

Arquivos adicionais ajustados por seguranca de UX na area do cliente:

- `app/cliente/painel/components/cliente-shell.tsx`
- `app/cliente/painel/components/cliente-realtime-banner.tsx`

## Resumo do parecer

A base visual e estrutural da area do cliente esta consistente o bastante para seguir para a fase de `Conversas`.

O portal ja apresenta:

- navegacao principal mais curta e comercial
- shell visual coerente com proposta SaaS
- Inicio respondendo melhor "o que preciso fazer agora?"
- menor predominancia de bege/laranja
- melhor hierarquia entre azul principal, roxo de IA e laranja de alerta

Nao encontrei impacto funcional ou visual direto em `app/admin` depois das correcoes aplicadas nesta auditoria.

## Problemas encontrados

### 1. Risco de vazamento visual para o admin via `colorScheme`

Problema:

- `app/cliente/painel/components/cliente-shell.tsx` aplicava `document.documentElement.style.colorScheme = theme`
- isso podia vazar a preferencia visual do portal do cliente para outras areas, inclusive `app/admin`, em navegacao SPA

Correcao aplicada:

- removi a escrita global no `documentElement`
- o `color-scheme` passou a ficar no wrapper do portal do cliente
- adicionei a classe `client-portal` ao wrapper para reforcar o escopo

Status:

- corrigido

### 2. Texto quebrado por encoding no command palette e na tela de Inicio

Problema:

- alguns labels apareciam com caracteres como `Â·` e `â€¢`

Correcao aplicada:

- substitui separadores quebrados por texto ASCII seguro, como ` - `

Status:

- corrigido

### 3. Item `Campanhas` escondido por capability mais restritiva do que a rota exigia

Problema:

- no menu principal e no command palette, `Campanhas` dependia de `manage_automations`
- a pagina `campanhas` hoje abre em modo leitura mesmo sem essa capability
- isso reduzia descobribilidade e deixava a navegacao inconsistente

Correcao aplicada:

- removi a trava de capability do item principal `Campanhas`
- mantive as partes avancadas condicionadas por capability nas telas proprias

Status:

- corrigido

### 4. CTA morto na sidebar

Problema:

- o botao `Portal do cliente simplificado` parecia clicavel, mas nao executava nenhuma acao

Correcao aplicada:

- troquei o botao por um bloco informativo nao interativo

Status:

- corrigido

### 5. Linguagem tecnica residual na home

Problema:

- a tela de Inicio ainda usava frases menos comerciais, como `Leitura executiva curta`
- havia referencia visivel a `guardrails`

Correcao aplicada:

- troquei `Leitura executiva curta` por `Resumo de desempenho`
- troquei `guardrails` visivel por `regras da IA`
- mantive a estrutura de dados sem alterar backend

Status:

- corrigido

### 6. Token ausente em `app/globals.css`

Problema:

- havia uso de `--cliente-surface` em estilos refinados sem definicao explicita no tema

Correcao aplicada:

- adicionei `--cliente-surface` para os temas `light` e `dark`

Status:

- corrigido

### 7. Termo tecnico em banner de fallback

Problema:

- `cliente-realtime-banner.tsx` mostrava `modo cache temporario`

Correcao aplicada:

- alterei para `Exibindo dados temporarios`

Status:

- corrigido

## Observacoes sobre `app/globals.css`

### O que esta seguro

- os tokens do cliente ficam em `[data-client-theme="light"]` e `[data-client-theme="dark"]`
- os refinamentos principais ficam ancorados em seletores do portal, como:
  - `[data-client-theme]`
  - `[data-client-style="v2"]`
  - `[data-client-area="daily"]`
  - `.crm-refined`
  - `.inbox-refined`
  - `.pipeline-refined`
  - `.dashboard-refined`

### O que merece atencao

- `app/globals.css` continua muito grande e concentra bastante CSS especifico do portal do cliente
- isso nao causou regressao visivel nesta auditoria, mas aumenta custo de manutencao
- para as proximas fases, vale considerar extrair partes do cliente para um arquivo mais isolado quando a arquitetura estabilizar

### Seletores verdadeiramente globais ainda existentes

- `:root`
- `body`
- `html { scroll-behavior: smooth; }`
- `img[alt="ALTUM"]`
- `@media (prefers-reduced-motion: reduce) { * ... }`

Parecer:

- nao identifiquei alteracao nova do redesign impactando `app/admin` por esses seletores
- o principal risco de vazamento era o `documentElement.style.colorScheme`, e ele foi removido

## Navegacao principal auditada

Navegacao desejada e confirmada visualmente na estrutura:

- `Inicio`
- `Conversas`
- `Clientes & Oportunidades`
- `Agenda`
- `Campanhas`
- `Relatorios`
- `Assistente Altum`
- `Configuracoes`

Coerencia observada:

- `CRM`, `Pipeline` e `Comercial` aparecem agrupados sob `Clientes & Oportunidades`
- `Agenda` e `Follow-ups` aparecem agrupados sob `Agenda`
- `IA`, `Conhecimento`, `Handoffs` e `Automacoes` aparecem agrupados sob `Assistente Altum`
- `Go-live` e `Logs` saem do menu principal e ficam no bloco avancado

## Rotas verificadas

As rotas antigas continuam presentes e foram confirmadas pela arvore gerada no `npm run build`:

- `/cliente/painel`
- `/cliente/painel/inbox`
- `/cliente/painel/crm`
- `/cliente/painel/pipeline`
- `/cliente/painel/follow-ups`
- `/cliente/painel/agenda`
- `/cliente/painel/comercial`
- `/cliente/painel/captacao`
- `/cliente/painel/campanhas`
- `/cliente/painel/metricas`
- `/cliente/painel/ia`
- `/cliente/painel/conhecimento`
- `/cliente/painel/handoffs`
- `/cliente/painel/automacoes`
- `/cliente/painel/go-live`
- `/cliente/painel/logs`
- `/cliente/painel/configuracoes`

## Tela de Inicio auditada

Itens confirmados na nova home:

- prioridades de hoje
- conversas aguardando
- leads ativos
- oportunidades paradas
- tarefas vencidas
- propostas abertas
- funil resumido
- insights da Altum
- acoes rapidas uteis

Pontos positivos:

- linguagem mais direta
- foco em acao
- menos cara de painel interno
- sem excesso de cards competindo no topo
- uso mais controlado de badges

Pontos de atencao:

- a home ainda depende de varias chamadas em paralelo, o que e aceitavel, mas pode virar alvo de otimizacao depois
- ainda existem termos tecnicos em telas avancadas fora do escopo desta auditoria, especialmente `ia`, `logs`, `handoffs` e partes de `metricas`

## Responsividade

Validacao feita por revisao de layout e breakpoints do codigo, sem Playwright configurado neste repositorio.

Parecer por faixa:

- desktop grande: estrutura boa, com hero em duas colunas e cards secundarios bem distribuídos
- notebook: shell, topbar e grids responsivos estao coerentes
- tablet: grids quebram de forma segura e o menu lateral continua acessivel
- mobile: sidebar vira drawer, topbar simplifica e bottom nav cobre os acessos principais

Observacao:

- a experiencia mobile esta coerente para esta fase, mas `Conversas` ainda sera o principal teste real de ergonomia na proxima etapa

## Preservacao de funcionalidades

Confirmado como preservado:

- links principais
- rotas antigas
- filtros existentes nas paginas nao auditadas
- permissions e capabilities existentes
- busca global
- tema claro/escuro
- densidade
- suporte
- logout
- chamadas de dados reais

Nao houve:

- remocao de backend
- troca de APIs
- alteracao de autenticacao
- alteracao de banco
- alteracao em `app/admin`

## app/admin

Confirmacao:

- nenhum arquivo de `app/admin` foi alterado nesta fase
- a validacao de build incluiu as rotas do admin com sucesso
- o risco de vazamento visual mais serio foi corrigido no shell do cliente

Parecer final:

- `app/admin` nao foi afetado por esta auditoria

## Resultado das validacoes

Comandos executados:

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Resultado:

- `lint`: passou
- `typecheck`: passou
- `build`: passou

## Riscos pendentes

Riscos ainda abertos, mas aceitaveis para seguir:

- `app/globals.css` continua concentrando muito CSS do cliente
- algumas telas avancadas fora do escopo ainda expõem termos tecnicos como `handoff`, `guardrails` e `logs`
- a validacao de responsividade foi por revisao de layout, nao por screenshot automatizada

## Recomendacao objetiva

Recomendacao:

- **seguir para a fase de `Conversas`**

Justificativa:

- a base visual esta estavel
- a navegacao esta coerente
- a home ja comunica melhor valor comercial
- nao ha indicio de regressao em `app/admin`
- lint, typecheck e build passaram apos as correcoes
