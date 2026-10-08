# Mapa de execução — do estado atual ao Altum Agent OS completo

## 1. Onde estamos agora

### O que já existe e é reutilizável

| Área | Backend atual | Frontend atual | Estado honesto |
| --- | --- | --- | --- |
| Comando | Conversas persistentes, memória básica, ideias, missões, anexos privados e comandos naturais iniciais | Chat escuro com histórico, conversa, contexto e composer | **Fundação existente; precisa ganhar streaming, resultados ricos e coerência total de fluxos.** |
| Aprovação no chat | Aprovação contextual de ações, custo e alguns assets no mesmo chat | Cards de missão/ação e resposta conversacional | **Funciona em caminhos específicos; precisa virar uma política universal.** |
| Mídia | Router inicial, jobs, worker/polling, armazenamento privado, FAL/Replicate/Higgsfield e revisão de assets | Resultados e biblioteca iniciais | **Estrutura existe; integrações precisam de testes reais, QA e fluxos completos.** |
| Avatar/identidade | Consentimento, referências privadas, perfil e âncora visual inicial | Fluxo inicial de perfil | **Não há ainda voz clonada, lip-sync ou continuidade validada em vídeo.** |
| Campanha | Plano inicial, rascunho de criativos e landing | Entrada pelo chat e telas auxiliares | **Ainda não fecha lote de assets, UTMs, publicação e métricas.** |
| Router/integrações | Conexões seguras, roteamento inicial e ferramentas MCP internas | Configuração existente, ainda técnica demais | **Ainda faltam health, quotas, custo real e catálogo humano de capacidades.** |
| MCP | Ferramentas internas de consulta/criação de criativos/render | Sem experiência pública OAuth | **Não é ainda MCP público seguro para ChatGPT externo.** |
| Admin legado | Rotas e operações existentes preservadas | Muitos painéis independentes | **Será melhorado depois do núcleo Agent OS, sem remover rotas nem dados.** |

### O que ainda não existe

- um orquestrador com plano durável, dependências, evidência, retry e agentes especialistas reais;
- ingestão completa de documentos, OCR, transcrição e base de conhecimento;
- pesquisa web com fontes e browser supervisionado;
- produção de vídeo/avatar completa: voz, lip-sync, cena, legenda, edição, QA e versões;
- campanhas completas com lote, publicação preparada e aprendizagem por métrica;
- Product Factory para landing, ebook, site, deploy e experimentos;
- custos/quotas/health reais, segurança de produção e MCP público OAuth;
- acabamento de UX mobile/acessível e evolução organizada do admin legado.

## 2. Arquitetura que vamos concluir

```text
                         ┌────────────────────────────┐
                         │       Comando Altum         │
                         │ chat, histórico, anexos,    │
                         │ resultados e decisões       │
                         └──────────────┬─────────────┘
                                        │
                         ┌──────────────▼─────────────┐
                         │      Orquestradora          │
                         │ intenção, plano, memória,   │
                         │ políticas e especialistas   │
                         └───────┬──────────┬─────────┘
                                 │          │
                  ┌──────────────▼──┐   ┌───▼──────────────────┐
                  │ Conhecimento     │   │ Registro de           │
                  │ documentos, web, │   │ capacidades           │
                  │ memória, busca   │   │ skills/MCP/apps/nós   │
                  └──────────────┬──┘   └───┬──────────────────┘
                                 │          │
                         ┌───────▼──────────▼─────────┐
                         │ Router e política de custo  │
                         │ qualidade/privacidade/risco │
                         └───────┬──────────┬─────────┘
                                 │          │
             ┌───────────────────▼──┐   ┌──▼──────────────────────┐
             │ Workers duráveis      │   │ Integrações supervision. │
             │ mídia, dados, produto │   │ browser, CRM, canais     │
             └─────────────┬────────┘   └──────────────┬─────────┘
                           │                            │
                    ┌──────▼────────────────────────────▼──────┐
                    │ Biblioteca, auditoria, revisão e métricas │
                    └──────────────────────────────────────────┘
```

**Princípio:** o Comando é a única porta de trabalho. Configurações, biblioteca e áreas de negócio existem como apoio, jamais como pré-requisito técnico para pedir algo.

## 3. Contrato obrigatório para toda capacidade

Nenhum provider, skill, agente ou tela será considerado pronto sem cumprir:

1. intenção compreensível em linguagem natural;
2. plano e entradas rastreáveis;
3. policy de dados, custo e risco;
4. execução durável, idempotente, cancelável e com retry;
5. progresso e falha compreensíveis no mesmo chat;
6. resultado privado, revisável, reutilizável e vinculado à origem;
7. auditoria por empresa, conversa, missão, ação e ator;
8. testes de contrato e pelo menos um caminho ponta a ponta real antes de anunciar a capacidade.

## 4. Backlog de backend, na ordem de construção

### Fase A — Plataforma de execução (base de todo o resto)

1. **Modelo de dados unificado**
   - consolidar `conversation`, `mission`, `plan`, `task`, `action`, `approval`, `job`, `asset`, `artifact`, `memory`, `capability`, `connection`, `audit_event`;
   - links explícitos entre conversa → missão → job → resultado;
   - tenant obrigatório em toda leitura, escrita, storage e fila.
2. **Orquestrador de planos**
   - interpretar pedido, criar grafo de tarefas, entradas/saídas/dependências, orçamento estimado e política;
   - criar especialistas apenas a partir de templates curados; nenhuma ferramenta arbitrária;
   - resumir/retomar missão sem perder contexto.
3. **Runtime de jobs**
   - fila durável, lock, idempotency key, retry exponencial, cancelamento, timeout, dead-letter, retomada pós-deploy e eventos de progresso;
   - adaptar o worker de mídia atual para um runtime comum de todos os jobs.
4. **Política e aprovações universais**
   - motor que exige confirmação só para gasto, dados sensíveis, identidade, envio, publicação, pagamento, exclusão ou ação irreversível;
   - aprovação vinculada a payload imutável, validade, limite de gasto, ator e conversa;
   - aprovação por linguagem natural no chat, sem tela separada.

**Saída da fase A:** qualquer nova capacidade pode rodar como job confiável e aparecer corretamente no chat.

### Fase B — Conhecimento e decisão

5. **Ingestão de arquivos e conhecimento**
   - AnyDoc para documento; OCR para imagens/PDF; transcrição para áudio/vídeo;
   - chunks com origem, página/tempo, permissões, hash e retenção;
   - busca híbrida e resposta com fonte.
6. **Pesquisa web e browser supervisionado**
   - pesquisa com fontes, data, citação e separação de fato/inferência;
   - browser-use como worker isolado, domínio em allowlist e prova de cada passo;
   - stop-points obrigatórios e nenhuma credencial em log.
7. **Memória real**
   - memória de empresa, projeto e conversa; preferências, decisões e aprendizados;
   - atualização com evidência e possibilidade de correção/revogação.

**Saída da fase B:** a Altum entende arquivos, pesquisa com prova e lembra contexto de forma segura.

### Fase C — Motor criativo completo (prioridade de produto)

8. **Catálogo/routing por modalidade**
   - capability matrix: texto, imagem, vídeo, áudio, avatar, edição, transcrição, OCR;
   - health, limites, custo estimado/real, latência, privacidade, fallback e razão de escolha;
   - FreeLLMAPI restrito a texto; mídia usa adapters próprios.
9. **Pipeline de imagem e vídeo**
   - brief → direção → roteiro/storyboard → referências → job → validação → revisão → biblioteca;
   - adapters reais FAL/Replicate/Higgsfield/LTX/Comfy bridge;
   - Remotion/FFmpeg para cenas previsíveis, carrossel, legenda, corte e composição;
   - QA automático de arquivo, duração, resolução, áudio, frame, texto e marca.
10. **Identidade/avatar autorizado**
   - consentimento granular, referências privadas, folha de personagem, âncora e revogação;
   - voz/TTS e clone apenas por provider validado e consentimento específico;
   - roteiro → primeiro frame → voz → cena → vídeo → legenda → review;
   - disclosure sintético quando aplicável.
11. **Biblioteca de ativos**
   - versão, tags, busca, preview, direitos, origem, custo, campanha, métricas, download e reutilização;
   - aprovação/rejeição/variação diretamente pelo chat.

**Saída da fase C:** pedido natural produz imagem/vídeo/peça de campanha reais e recuperáveis, sem exigir escolha manual de modelo.

### Fase D — Marketing, produto e operação

12. **Campaign Factory**
   - estratégia → públicos/oferta/funil → matriz de ativos → lote de criação → landing → UTMs → calendário → revisão;
   - publicação apenas por integração oficial/browser supervisionado e aprovação contextual;
   - ligação de assets com anúncios, leads, custo e receita.
13. **Product Factory**
   - oferta, pesquisa, nome, copy, landing, ebook, capa, kit de lançamento e preview;
   - sites/apps em sandbox, versões, revisão e deploy autorizado.
14. **Agentes comerciais e áreas existentes**
   - ferramentas seguras para CRM, propostas, agenda, follow-ups, campanhas e relatórios;
   - rascunho antes de mensagem externa; ações comerciais vinculadas ao registro correto.

**Saída da fase D:** a Altum faz campanhas e produtos completos, e aciona a operação existente sem quebrar os módulos legados.

### Fase E — Ecossistema, produção e escala

15. **Registro de skills, apps, MCPs e bridges**
   - manifest, versão, origem, licença, permissões, owner, health, teste e rollback;
   - curadoria antes de liberar para o orquestrador.
16. **MCP público Altum**
   - HTTPS, OAuth, tenant/grant mínimo, URLs temporárias, auditoria e ferramentas de mídia/campanha/CRM;
   - ChatGPT pode disparar ou acompanhar trabalho Altum sem receber segredos.
17. **Operação de produção**
   - orçamento, quotas, alertas, métricas, dashboards técnicos isolados, backup, retenção, revogação, incidentes e E2E;
   - hardening de permissões, rate-limit, observabilidade e testes de recuperação.

## 5. Backlog de frontend, na mesma ordem

### Fase A — Comando como produto final

- Manter uma tela principal semelhante à familiaridade de ChatGPT/Codex: histórico à esquerda, conversa central, painel contextual à direita.
- Composer multimodal com anexo, gravação, contexto de empresa/projeto e modo de política simples: Economizar, Equilibrado, Qualidade máxima, Privacidade/local.
- Mensagens ricas para plano, progresso, evidência, pedido de confirmação, mídia, arquivo, gráfico, resultado e erro recuperável.
- Uma decisão por vez, com botões humanos: “Gerar”, “Revisar”, “Usar esta versão”, “Refazer”, “Publicar”, “Parar”.
- Sem nomes de endpoint/provider/modelo como conteúdo principal.

### Fase B — Contexto, biblioteca e configurações

- Painel direito contextual: empresa/projeto atual, processos, fontes, entregas e ideias; nunca uma lista de detalhes técnicos.
- Biblioteca como visualização única de resultados: mídia, documentos, campanhas, sites e relatórios, com preview e versões.
- Configurações em camada secundária: conexões, marca, identidades, skills/MCP, políticas, equipe, limites e avançado.
- Páginas antigas de Creative/Avatar/Missões/Aprovações tornam-se organização, edição ou auditoria — não caminho obrigatório de execução.

### Fase C — Experiências especializadas somente quando agregarem valor

- Editor de campanha para comparar lote de criativos e aprovar calendário.
- Editor de mídia para storyboard, cenas, legenda e versões.
- Editor de avatar para referências, direitos e consistência visual/voz.
- Fichas de CRM, agenda, proposta e relatório com as ações que o chat também pode realizar.

### Fase D — Qualidade do produto

- Desktop, tablet e celular; teclado/atalhos, leitores de tela, contraste e estado de foco.
- Loading incremental, streaming, retry, cancelamento, estados vazios úteis e erros com próxima ação clara.
- Design system unificado: tipografia, espaços, cores e componentes sem criar biblioteca paralela nem cards decorativos.
- Nenhuma regressão de rota/dados nas áreas legadas.

## 6. Como cada fase será entregue

Para cada capacidade, o trabalho seguirá este ciclo, sem saltar para uma tela isolada:

1. contrato de produto e política;
2. modelo de dados/migração e APIs;
3. adapter/worker e testes unitários/de contrato;
4. mensagem e ação dentro do Comando;
5. resultado na biblioteca e auditoria;
6. teste ponta a ponta com conexão real ou ambiente de simulação claramente marcado;
7. só então, tela especializada se ela oferecer edição ou comparação que o chat não resolve bem.

## 7. Critério de "tudo pronto"

O produto não estará pronto porque possui telas ou providers cadastrados. Estará pronto quando, pelo Comando, for possível:

- enviar materiais, pedir pesquisa com fontes e receber uma estratégia;
- pedir campanha, receber e revisar lote de criativos, vídeos, landing e calendário;
- criar personagem ou avatar autorizado, manter consistência e gerar mídia com disclosure/controles;
- gerar produto digital, site, ebook, apresentação ou documento e reutilizar os ativos;
- operar CRM, tarefas, proposta, agenda e campanhas conectadas de modo supervisionado;
- permitir ao ChatGPT autorizado usar ferramentas Altum por MCP seguro;
- recuperar qualquer decisão/resultado depois, em outro dispositivo, com custo, fonte e auditoria preservados.

## 8. Próxima etapa obrigatória — Release de uso real (antes de novas capacidades)

O desenvolvimento de novas funcionalidades fica pausado até a Altum atual estar agradável, compreensível e segura para uso diário. Esta etapa não cria mais módulos; ela torna o que já existe utilizável.

### 8.1 Escopo visual e de experiência

1. **Comando**
   - consolidar chat, histórico, anexos, plano, progresso, aprovações e entregas no mesmo fluxo;
   - tornar respostas, cards de missão e resultados escaneáveis e menos técnicos;
   - deixar o painel direito contextual e recolhível; revisar celular/tablet;
   - corrigir composição, tipografia, contraste, espaçamento, foco, atalhos e estados de carregamento/erro.
2. **Resultados e biblioteca**
   - uma linguagem visual única para imagem, vídeo, arquivo, campanha, avatar e site;
   - preview, origem, status, versão e ações humanas simples: usar, revisar, baixar, refazer e descartar;
   - nenhum provider, ID, fila ou payload como informação primária.
3. **Configurações**
   - separar “O essencial” de “Avançado”; conexões aparecem como objetivo humano (por exemplo, “gerar vídeo com qualidade máxima”), não endpoint;
   - consolidar marca, identidade/avatar, skills/MCP e políticas sem obrigar o usuário a navegar por telas para trabalhar.
4. **Áreas legadas**
   - preservar todas as rotas; reduzir ruído visual, cards decorativos e textos técnicos onde a tela já for utilizada;
   - não tentar redesenhar todo CRM/Financeiro antes de o Comando e o núcleo criativo estarem sólidos.

### 8.2 Checklist para poder publicar uma versão utilizável

- [ ] Um usuário consegue criar conversa, pedir mídia, aprovar/rejeitar e encontrar o resultado sem sair do Comando.
- [ ] Anexos e falhas possuem feedback claro, retry e nenhuma mensagem técnica exposta.
- [ ] Tela funciona bem em desktop, tablet e celular; navegação e ações principais são acessíveis por teclado.
- [ ] Fluxos de conexão não exibem segredo depois de salvo e usam linguagem não técnica.
- [ ] Não há mocks apresentados como execução real; provider indisponível gera mensagem honesta e próxima ação.
- [ ] Regras de autenticação, tenant, storage e URLs privadas foram revisadas; credenciais usadas em desenvolvimento foram rotacionadas antes de ambiente público.
- [ ] Testes de conversa, aprovação, asset review, job e resultado passam; smoke test cobre login e percurso principal.
- [ ] Página de status/limites e canal de suporte/feedback existem para o administrador.

### 8.3 Ordem desta release

1. Auditar os fluxos atuais pelo olhar de quem usa e listar fricções reais.
2. Refatorar o Comando e seus estados, sem mexer em backend que já funciona.
3. Unificar Resultados/Biblioteca e os cards de entrega no chat.
4. Simplificar Configurações e esconder detalhes avançados.
5. Fazer responsividade, acessibilidade, tratamento de erro e performance.
6. Auditar segurança e rodar o percurso de publicação em ambiente de teste.
7. Só depois retomar novas capacidades na ordem: runtime de jobs → mídia/avatar → campanha → conhecimento/browser → produto/MCP público.
