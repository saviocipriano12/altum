# Adoção de fontes externas do Altum Agent OS

Os repositórios citados pelo produto são fontes reais, não apenas inspiração. O registro em `config/agent-source-registry.json` fixa cada fonte a um commit e `node scripts/sync-agent-sources.mjs` faz um checkout raso em `.altum-agent-sources/`, que é ignorado pelo Git da Altum.

## Regra de adoção

- `runtime`: roda fora do Next.js, em container ou serviço isolado; a Altum conversa por adaptador autenticado.
- `adapter`: fornece contrato MCP/API e é avaliado antes de ativação.
- `skills`: entra no Skills Registry somente depois de revisar licença, autoria, segurança e aderência comercial.
- `patterns` e `reference`: servem para importar ideias, fluxos e testes; não são copiados cegamente para produção.
- `integration`: exige conexão no cofre, escopo por tenant e aprovação antes de ações externas.

## Primeira onda de adoção operacional

1. FreeLLMAPI ou LiteLLM como gateway privado de modelos.
2. OpenJEV como motor de decisão tipada para score, roteamento e gates.
3. ComfyUI, Remotion e FFmpeg como Creative Engine isolado.
4. OpenClaw como runtime interno selecionado e Hermes como referência de skills/memória para agentes persistentes e tarefas recorrentes, sempre atrás de adaptadores próprios da Altum.
5. Browser Use, n8n e Dify para browser/workflows, sempre supervisionados.
6. Skills de marketing, vendas e social importadas para um registro revisável da Altum.

## Segunda onda: pesquisa, documentos e estúdio de mídia

- `Panniantong/agent-reach`: runtime candidato para pesquisa multi-fonte; começa sem cookies, contas sociais ou qualquer capacidade de escrita.
- `rkendel1/anydoc`: adaptador local de documentos para transformar arquivos em texto estruturado antes de qualquer análise.
- `lakeissn/ltx-2.3` e `9018/openmontage`: produção de vídeo; LTX é candidato a runtime, enquanto OpenMontage orienta pipelines, etapas e revisão de qualidade.
- `geminiyellow/voicestudio`: candidato a voz local apenas com consentimento de voz e revisão da licença de implantação.
- `666ghj/MiroFish`: laboratório de cenários, não motor de previsão nem origem de decisões autônomas.
- `tasteskill/tasteskill` e `syntax-syndicate/archify-agent-skill`: skills revisáveis para design de páginas e visualização de estratégias.
- `Zapdev-labs/ommi-llm`, `vercel-labs/vgpu` e `Nethyric/orca`: referências para inferência local, previews visuais e execução local; ainda não são dependências de produção.

Nenhuma fonte recebe dados de clientes, credenciais, mídia de avatar ou permissão de publicação apenas por estar clonada. Isso continua passando pela camada de conexões, políticas, consentimentos e aprovações da Altum.

## OpenClaw como execução isolada e Hermes como referência

OpenClaw não substitui a Altum: a interface, o histórico, a memória de negócio, o roteamento de modelos e as políticas continuam próprios da plataforma. Ele foi selecionado como runtime interno isolado para sessões, ferramentas, tarefas programadas e skills, atrás de um bridge autenticado. Hermes continua fonte de padrões para skills, filtros MCP e memória operacional. A adoção só avança por adaptador autenticado, execução com escopo mínimo, logs de evidência e bloqueio de ações externas até aprovação explícita no Chat Altum. O contrato e a instalação do bridge ficam em `docs/OPENCLAW_RUNTIME_ADOPTION.md`.

## FreeLLMAPI já conectado como runtime privado

O compose `docker-compose.agent-runtimes.yml` adota o runtime do repositório `xxy2026/freellmapi` e o publica somente em `127.0.0.1:3011`. Copie `.env.agent-runtimes.example` para `.env.agent-runtimes`, defina a chave de criptografia e suba com `docker compose --env-file .env.agent-runtimes -f docker-compose.agent-runtimes.yml up -d`.

Na Altum, cadastre uma conexão `freellmapi` do tipo `local` e use o health check nativo. A instalação Docker usa `http://127.0.0.1:3011`; o aplicativo oficial do Windows usa `http://127.0.0.1:31415` e é o caminho preferido neste computador. A chave unificada do FreeLLMAPI continua cifrada no cofre da Altum quando for usada por um job aprovado; ela não é exibida no navegador nem em logs.

## OpenJEV como motor de decisão

O adaptador `lib/server/agent-os/openjev.ts` usa o contrato original `POST /v1/systemone`: estado + perguntas `noul`, `choice` ou `score` entram; respostas estruturadas e probabilidades retornam. Ele é destinado a classificação, score de lead, escolha de próximo passo e gates de execução. A Altum não o usa para decisões financeiras, publicação ou comunicação externa sem as políticas e aprovações apropriadas.

## Skills importadas com atribuição

`node scripts/import-reviewed-agent-skills.mjs` importa uma primeira curadoria de skills de marketing e social provenientes de fontes MIT para `resources/agent-skills/review-queue/`, preservando uma nota de origem, commit e licença. Elas começam como `review_required_before_activation`: fonte externa não pode se tornar instrução de produção sem revisão de escopo, segurança, regras de marca e ações permitidas.
