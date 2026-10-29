# Auditoria de resíduos e código sem uso — 16/10/2026

> Atualização: a limpeza conservadora autorizada foi executada após a auditoria. O registro abaixo descreve o diagnóstico original; a seção 9 registra as remoções efetivas e o que foi preservado.

## Escopo e método

Inspeção local, sem apagar código nem alterar aplicação, admin, APIs, autenticação ou banco. A árvore contém numerosas alterações e arquivos novos de trabalho em andamento, que não foram considerados resíduos por estarem fora do Git.

Inventário: 1.473 arquivos, incluindo 1.114 arquivos de código. Rastreamento estático de imports e reexports com o resolvedor TypeScript, partindo de convenções de entrada do Next, scripts e testes. Busca textual complementar por símbolos, caminhos e referências a arquivos públicos. Bibliotecas instaladas, builds, checkouts externos e artefatos de QA foram excluídos do grafo.

Encontrados 35 candidatos fora desse grafo, somando 3.910 linhas. Um deles é uma referência de terceiros preservada intencionalmente; os outros 34 são candidatos a revisão e remoção. Não é prova absoluta de inutilidade: configurações externas, imports construídos dinamicamente e arquivos consumidos fora do repositório precisam ser considerados. O levantamento não pretende identificar todos os exports ou ramos de código mortos.

## 1. Resíduos locais e arquivos gerados

| Item | Tamanho medido | Tratamento |
| --- | ---: | --- |
| `.next/` | 4.594.505.359 bytes, aproximadamente 4,28 GiB | Cache/build regenerável; limpar com servidor e builds parados. |
| `.qa-artifacts/` | 204.874.810 bytes, aproximadamente 195 MiB | Preservar evidências úteis; descartar execuções antigas. |
| `_benchmark/` | 1.941.833 bytes | Referências locais ignoradas; revisar necessidade antes de descartar. |
| Logs na raiz e arquivos `.tmp-*` | Diversos | Revisar e limpar os de execuções encerradas; patches e JSON temporários podem conter trabalho ainda útil. |
| `Microsoft/Windows/PowerShell/ModuleAnalysisCache` | 8.246 bytes | Cache de ferramenta fora do código da aplicação; candidato a limpeza local. |
| `altum_lp_advogado_com_fotos.zip` | Exportação local | Guardar fora da raiz caso tenha valor de entrega; não integra o código Next. |

`.altum-agent-sources/` e `.altum-openclaw/` não devem entrar em limpeza genérica: scripts usam esses diretórios para fontes externas e runtime. `.env*` reais e `.vercel/` também não são lixo.

## 2. Versão anterior do site público

`app/page.tsx` importa e renderiza `components/public/home/product-home.tsx`. Não foram encontrados consumidores ativos dos arquivos abaixo:

- `components/public/home/home-agency-platform.tsx`
- `components/public/home/home-audience.tsx`
- `components/public/home/home-cases.tsx`
- `components/public/home/home-diagnosis.tsx`
- `components/public/home/home-final-cta.tsx`
- `components/public/home/home-founder.tsx`
- `components/public/home/home-hero.tsx`
- `components/public/home/home-platform.tsx`
- `components/public/home/home-problem.tsx`
- `components/public/home/home-services.tsx`
- `components/public/home/home-styles.tsx`
- `components/public/home/home-system.tsx`

Dependências usadas apenas por esse conjunto também ficaram desconectadas:

- `lib/public-site/home-content.ts`
- `components/public/shared/animated-section.tsx`
- `components/public/shared/cta-button.tsx`
- `components/public/shared/platform-mockup.tsx`
- `components/public/shared/section-header.tsx`

Outros componentes públicos sem ligação encontrada:

- `components/public/platform/platform-experience.tsx` — 834 linhas.
- `components/public/shared/flow-diagram.tsx`
- `components/public/shared/site-footer.tsx`
- `components/public/shared/site-header.tsx`
- `components/CasesShowcaseCinematic.tsx` — 331 linhas.

Preservar `product-home.tsx`, `altum-live-demo.tsx` e `components/public/site-shell.tsx`: estão em uso. Remover os candidatos antigos reduz manutenção; não implica economia equivalente no bundle, pois código não importado pode já ficar fora dele.

## 3. Componentes e caminhos de negócio antigos

Sem consumidores encontrados no grafo e na conferência dos símbolos:

| Arquivo | Evidência e cuidado |
| --- | --- |
| `components/ConvertLeadModal.tsx` | Conversão antiga com escrita direta no Firestore e possibilidade de `clientId: "sem_id"`. Candidato a remover; não reaproveitar automaticamente. |
| `app/utils/aprovarOrcamento.ts` | `aprovarOrcamentoHub` sem chamadas encontradas; escreve orçamento, projeto, financeiro e atividade diretamente pelo SDK cliente. |
| `components/LeadStrategyView.tsx` | Componente isolado. |
| `components/admin/ContractModal.tsx` | Modal isolado com conteúdo comercial antigo. |
| `components/WarRoom/WarRoomWidgets.tsx` | Calculadora, seletor e contrato isolados; botão PDF do contrato não possui ação. |
| `components/TypebotBubble.tsx` | Componente isolado; sua remoção não autoriza remover toda configuração ou integração Typebot. |
| `components/auth/ProtectedRoute.tsx` | Wrapper sem consumidores encontrados. Tipagem aceita `closer` e `sdr`, mas valida apenas `admin`; conteúdo pode renderizar antes de redirecionar. Isso é um defeito latente do componente isolado, não comprovação de exposição de uma rota atual. |
| `services/whatsapp.ts` | `WhatsAppService` sem consumidores; configuração global por variáveis de ambiente. A aplicação possui implementação ativa em `lib/server/chat-dispatch.ts`, que deve ser preservada. |
| `lib/cities.ts` | Catálogo antigo sem consumidores; páginas atuais usam `data/city-pages.ts`. |
| `lib/segments.ts` | Catálogo antigo sem consumidores; páginas atuais usam `data/segment-pages.ts`. |
| `lib/server/agent-os/approvals.ts` | Helper `createAgentApproval` sem chamadas encontradas. O sistema de aprovações e a coleção `agent_approvals` continuam em uso. |
| `lib/server/campaign-sync.ts` | Reexport sem consumidores encontrados; implementação em `app/lib/server/campaign-sync.ts` continua importada por rotas e serviços. |

## 4. Arquivo HTML e imagens

`index.html` na raiz contém uma landing page demonstrativa de advocacia, fora das convenções de entrada do Next. Não foi encontrada referência a esse arquivo nos consumidores verificados. É candidato a arquivamento ou remoção após confirmar que não serve como entrega independente.

As páginas `app/portfolio/advogado*` são rotas reais e usam `public/advogado/`. Essas imagens não devem ser apagadas por associação com o HTML antigo.

Foram encontrados 15 arquivos públicos sem referência textual no inventário, somando 9.213.642 bytes, aproximadamente 8,79 MiB:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`
- `public/ChatGPT Image 10 de jan. de 2026, 01_11_42.png`
- `public/images/platform/altum-painel-real.png`
- `public/images/portfolio/fiber.jpg`
- `public/images/portfolio/fraiol.jpg`
- `public/images/portfolio/z2-performance.jpg`
- `public/logo-altum.svg`
- `public/portfolio/aj-site.jpg`
- `public/portfolio/pedraum-800.jpg`
- `public/portfolio/pedraum.png`
- `public/portfolio/www.clubefarm.com.br].png`

Os cinco SVGs padrão do scaffold têm forte evidência de sobra. Para os demais, verificar uso por URLs externas, conteúdo armazenado no banco ou comunicação comercial antes de remover. A busca textual é conservadora e não substitui essa confirmação.

## 5. Dependências e configuração

- `ai` está em `dependencies`, mas não foram encontrados imports do pacote no código analisado. Candidato a remoção em alteração separada, atualizando o lockfile e validando o projeto. O produto continua tendo código de IA próprio; isso não implica remover sua funcionalidade.
- `react-dom` também não apareceu como import direto, mas é dependência do funcionamento de React/Next: preservar.
- `.gitignore` ignora `.env.*` e abre exceção somente para `.env.example`. `git check-ignore` confirmou que `.env.agent-runtimes.example` e `.env.openclaw-runtime.example` estão ignorados. Contudo, `docs/AGENT_SOURCE_ADOPTION.md` orienta usar o primeiro e `scripts/prepare-openclaw-runtime.mjs` lê o segundo. Isso cria risco de checkout incompleto em outra máquina. Revisar os exemplos para garantir ausência de segredos e versioná-los por exceções específicas.
- `.gitignore` repete `.vercel`: redundância pequena e removível.
- `app/admin/chat/page.tsx` desliga várias regras ESLint para o arquivo inteiro, inclusive variáveis não usadas e dependências de hooks. É dívida de qualidade para revisão separada; não classificar a página inteira como descartável.

### Código não utilizado em arquivos ativos e bloqueio de lint

O ESLint identificou 10 avisos de símbolos não utilizados, incluindo:

- `app/api/admin/agent-os/command/route.ts`: `mediaConnectionAvailability` e `routeMediaConnection`.
- `app/api/admin/agent-os/creative-projects/route.ts`: `routeMediaConnection`.
- `lib/server/agent-os/admin-mcp-tools.ts`: `routeMediaConnection`.
- `lib/sales-journey.ts:242`: `lastInteractionAt`.
- `lib/server/ai/agent.ts:4362`: `doc`; linha 4721: `incompatibleIds`.
- `lib/server/command-center/repository.ts:98`: `ai`.
- `scripts/import-reviewed-agent-skills.mjs:23`: `repo`.
- O décimo aviso está em `lib/vendor/googlechrome-offline/service-worker.reference.js`: preservar essa cópia de referência, em vez de alterá-la para satisfazer lint.

Antes de remover uma atribuição não utilizada, conferir se a expressão executa efeitos necessários. Remover somente o nome pode ser diferente de remover a chamada que produz o valor.

Há também um erro `prefer-const` em `app/cliente/painel/configuracoes/canais/page.tsx:998`, na variável `loginTimeout`. É um bloqueio de qualidade, não uma comprovação de falha funcional. O total de 32 warnings supera o teto de 24 usado pela CI e pelo runner de qualidade; corrigir só esse erro ainda não basta para passar o gate.

## 6. O que preservar

- Rotas antigas válidas, reexports e redirecionamentos: por exemplo, `app/cliente/painel/assinatura/page.tsx` e `automacao-instagram/page.tsx` preservam compatibilidade.
- Referências e licenças de terceiros. `lib/vendor/googlechrome-offline/service-worker.reference.js` apareceu desconectado, mas `ORIGIN.md` explica sua preservação e adaptação em `public/sw.js`.
- Regras Firebase, índices, cron jobs, webhooks, callbacks OAuth e arquivos de convenção Next. Ausência de import direto não significa falta de uso.
- Testes, documentos e arquivos novos ligados ao trabalho local em andamento.
- Credenciais locais, configurações de deploy e dependências necessárias ao framework.

## 7. Ordem recomendada

1. Limpar resíduos locais de execuções encerradas e os SVGs padrão após conferir referências.
2. Remover o conjunto antigo do site público e seus componentes exclusivamente internos, em alteração pequena e revisável.
3. Remover componentes de negócio isolados e helpers antigos, conferindo os fluxos ativos correspondentes.
4. Remover a dependência `ai` se confirmada a ausência de uso e corrigir o versionamento dos exemplos de configuração.
5. Revisar imagens e HTML de portfólio com contexto de publicação/entrega.
6. Rodar lint, typecheck, testes pertinentes e build após cada lote que altere código.

Esta auditoria não executa nenhuma dessas remoções. Evidências de validação e limitações estão registradas ao final do relatório.

## 8. Validação

- `npm run typecheck`: concluído com sucesso, incluindo geração de tipos de rotas e TypeScript sem emissão.
- ESLint: concluído com 1 erro e 32 warnings. Reexecução equivalente à configuração do projeto, com exclusão adicional dos temporários desta inspeção: `node node_modules/eslint/bin/eslint.js --ignore-pattern '.tmp-*/**' --ignore-pattern '.tmp-*'`. Log local em `.tmp-cleanup-audit-lint-final.log`.
- A primeira execução de lint foi invalidada pela remoção de um script temporário criado para esta auditoria enquanto o ESLint o lia. A execução foi refeita com exclusão explícita dos temporários; esse erro inicial não é atribuído ao projeto.
- Build e testes funcionais não executados nesta inspeção: não houve mudança no código da aplicação. A análise não certifica o comportamento de produção, vulnerabilidades de dependências ou dados existentes no banco.
- Inventário estático bruto salvo localmente em `.qa-artifacts/cleanup-audit-2026-10-16.json`.

## 9. Limpeza conservadora executada

Após autorização do usuário, as referências foram conferidas novamente no código atual, incluindo arquivos novos, imports/reexports resolvidos pelo TypeScript, scripts, templates e caminhos textuais. Nenhum arquivo selecionado tinha modificações locais ou alterações no stage. Nenhum consumidor fora do conjunto removido foi encontrado.

Removidos 30 arquivos de código, somando 3.709 linhas, e os cinco SVGs padrão sem uso (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg` e `window.svg`). A lista exata dos 35 arquivos, com tamanho e SHA-256 anteriores, está em `.qa-artifacts/cleanup-2026-10-16/plan.json`. As cópias recuperáveis estão em `.qa-artifacts/cleanup-2026-10-16/backup/`; esse diretório é local e ignorado pelo Git.

Os 30 arquivos de código correspondem aos candidatos das seções 2 e 3, exceto os quatro itens preservados explicitamente abaixo. Foram mantidos por cautela:

- `components/auth/ProtectedRoute.tsx`, para evitar alteração na camada de autenticação nesta limpeza.
- `services/whatsapp.ts`, `lib/server/agent-os/approvals.ts` e `lib/server/campaign-sync.ts`, reservados para uma revisão específica de compatibilidade de backend.
- Referência original e licenças em `lib/vendor/`.
- Dependência `ai`, `package.json` e lockfile, evitando misturar alterações nas dependências em andamento com esta remoção de arquivos.
- Imagens comerciais, logos, `index.html`, ZIPs de entrega, documentos e artefatos anteriores que podem ter valor fora da aplicação.
- Todas as rotas atuais, aliases, redirecionamentos, APIs, banco, integrações, configurações de ambiente e trabalho local anterior.

Também foi removida a entrada duplicada `.vercel` do `.gitignore`. Na tela de canais, a declaração de `loginTimeout` passou de `let` separado para `const` junto à criação do temporizador, resolvendo `prefer-const` sem alterar a ordem das operações, a duração do timeout ou o fluxo Meta.

A primeira comparação dos hashes confirmou que as únicas mudanças em arquivos existentes naquele momento foram `.gitignore` e `app/cliente/painel/configuracoes/canais/page.tsx`. O backup das remoções foi conferido byte a byte por hash. A comparação posterior registrou mudanças paralelas no site público, descritas abaixo; elas não foram revertidas. Evidência em `.qa-artifacts/cleanup-2026-10-16/verification.json`.

Uma tentativa de limpar caches regeneráveis foi rejeitada pela revisão automática da ferramenta com a indicação `blocked by policy`. A remoção não foi repetida por outro meio; os caches foram preservados.

### Validação após a limpeza

- `npm run typecheck`: passou, incluindo geração de tipos de rotas.
- `npm run lint`: passou sem erros; permanecem os 32 warnings já presentes. O gate da CI com `--max-warnings=24` continua pendente por esses avisos, sem reduzir ou desativar o limite.
- `npm run test:smoke`: 767 testes, 762 passaram e 5 falharam. As cinco falhas são testes que inspecionam texto de arquivos preservados. Os testes e os arquivos que eles inspecionam têm os mesmos hashes registrados antes da limpeza; portanto, as incompatibilidades desses contratos já estavam presentes no início da tarefa. Não foram alterados para esconder falhas.
- `git diff --check` nos arquivos editados: passou.
- Build com os valores demonstrativos e endpoints de emuladores definidos pela CI: compilação Turbopack passou em 10,5 minutos, mas o build completo terminou com erro TS6053 na etapa de TypeScript, ao ler `components/public/pricing-plans.tsx`. Esse arquivo não faz parte das remoções desta tarefa: mudou em paralelo durante a validação, e foi confirmado presente novamente após o erro. Nenhum `.env` foi modificado e não houve deploy. Não considerar o build completo aprovado.
- Nova execução de `npm run typecheck`, após confirmar a presença do arquivo de preços: passou, com geração de tipos e TypeScript sem erros. Log em `typecheck-final.log`. Isso confirma a checagem de tipos sobre o estado atualizado; o build completo anterior permanece registrado como não aprovado, pois não foi repetido integralmente durante as mudanças paralelas.

Testes de contrato que falharam: `tests/ai-handoff-contract.test.mts` (copilot e handoff), `tests/ai-logs-query-contract.test.mts` (ações comerciais autônomas), `tests/creative-approval-server-start.test.mts` (início de renderização), `tests/mission-reconciliation-admin.test.mts` (reconciliação) e `tests/openclaw-runtime-chat-delivery.test.mts` (entrega no Comando). São pendências de qualidade separadas desta remoção de código sem uso; não representam prova suficiente, por si sós, de defeito funcional, pois usam expressões regulares sobre a implementação.

Logs e manifestos locais em `.qa-artifacts/cleanup-2026-10-16/`.

Durante a validação foram detectadas alterações paralelas em nove arquivos preservados: `components/public/site-shell.tsx`, `components/public/pricing-plans.tsx`, `components/public/home/product-home.tsx`, `components/public/home/altum-live-demo.tsx`, `app/sobre/page.tsx`, `app/contato/page.tsx`, `app/plataforma/page.tsx`, `app/page.tsx` e `app/precos/page.tsx`. Essas alterações não foram feitas por esta limpeza. Uma nova conferência das referências no código atual, incluindo essas mudanças, não encontrou consumidores dos 35 arquivos removidos; evidência em `final-references.json`.

Risco residual: a ausência de referências no repositório não certifica consumidores externos desconhecidos. Por isso, arquivos públicos comerciais, entregas independentes, dependências e compatibilidade de backend foram preservados. As cópias locais permitem recuperar qualquer remoção sem depender de commit ou reset do trabalho existente.
