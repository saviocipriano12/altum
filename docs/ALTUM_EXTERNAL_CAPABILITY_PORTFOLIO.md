# Portfólio de Capacidades Externas da Altum

**Status:** catálogo mestre de adoção  
**Data da consolidação:** 11 de outubro de 2026  
**Escopo:** todos os repositórios discutidos e registrados para a evolução da Altum

## 1. Objetivo

Este documento impede que a Altum reconstrua capacidades maduras que já existem em projetos externos. Ele complementa a visão e a missão da área admin e organiza cada fonte por função, forma de adoção, destino no produto e fase de validação.

Regra central:

> Executar o upstream original, provar que funciona, encapsular por uma fronteira estável, integrar à governança Altum e somente então adaptar.

O portfólio não significa instalar tudo. Significa que toda decisão de construir deve primeiro verificar se uma capacidade aprovada deste catálogo já resolve o problema.

## 2. Formas de adoção

- **Runtime isolado:** executar o software original em serviço, container ou worker separado.
- **Adapter:** conectar API, CLI, SDK ou MCP ao contrato de jobs e ferramentas da Altum.
- **Fork controlado:** manter uma versão fixada quando alterações no upstream forem indispensáveis e permitidas.
- **Skill ou conteúdo versionado:** importar agentes, SOPs, templates e instruções com proveniência, licença e revisão.
- **Dependência direta:** incorporar biblioteca quando licença, segurança e acoplamento forem adequados.
- **Padrão de arquitetura:** usar a ideia e o contrato, sem copiar código incompatível.
- **Benchmark:** comparar experiência ou capacidade sem colocar o projeto na produção.

## 3. Critérios de decisão

Cada candidato deve registrar:

1. repositório canônico e forks relacionados;
2. commit ou versão testada;
3. licença do código e, quando aplicável, dos modelos e pesos;
4. mantenedor, atividade e maturidade;
5. exemplos e testes oficiais reproduzidos;
6. dados, rede, filesystem e credenciais acessados;
7. requisitos de CPU, GPU, memória e armazenamento;
8. forma de isolamento por tenant;
9. custo de operar e atualizar;
10. contrato de entrada, saída, status, cancelamento e erro;
11. plano de rollback e remoção;
12. destino correto: admin, runtime compartilhado, área do cliente ou infraestrutura interna.

## 4. Força de trabalho e skills de agência

### Fontes

- `Ado77/agency-agents` — fonte principal indicada pelo usuário para os papéis da agência.
- `msitarzewski/agency-agents` — fonte histórica já registrada; comparar relação e divergências com a principal.
- `wshobson/agents` — biblioteca adicional de agentes e especialidades.
- `coreyhaines31/marketingskills` — skills práticas de marketing.
- `sujayjayjay/awesome-sales-automation-skills` — skills de vendas e automação comercial.
- `indranilbanerjee/digital-marketing-pro` — skills de campanhas, pesquisa, copy e analytics.
- `iamwaqargulzar/Marketing-Agent-OS` — organização de uma operação de marketing por agentes.
- `social-media-skills/skills` — produção e operação de conteúdo social.
- `klaubeer/ai-marketing-agency` — padrões de agência de marketing com IA.
- `rodrigoarias12/marketing-agent` — padrões de agente de marketing.
- `loopmark-opensource/loopmark-agent` — automação e execução de marketing.
- `kevinbadi/social-agents` — agentes para redes sociais.
- `gengirish/social-media-agency` — organização de agência social.
- `Cubiczan/autonomous-business-os` — padrões de empresa autônoma.
- `MaestroAgent/maestro` — coordenação de agentes orientados a trabalho.

### Adoção

- sincronizar os repositórios em uma área de fontes fixadas;
- preservar arquivos, estrutura, autoria, licença, commit e hash;
- importar conteúdo para uma fila de revisão;
- deduplicar agentes equivalentes sem perder proveniência;
- promover apenas agentes com manifesto, ferramentas, políticas e avaliações válidas;
- usar o material existente como base real, sem redigitar prompts e SOPs.

### Destino

Catálogo de Agentes, Skills e Templates da área admin. Execução no runtime compartilhado.

### Fase

Fase 4, começando pelos agentes necessários à campanha piloto da Fase 6.

## 5. Orquestração, jobs e automação

### Fontes de runtime prioritárias

- `openclaw/openclaw` — sessões, skills, subagentes, cron e execução; já existe bridge Altum em preparação.
- `hatchet-dev/hatchet` — workflows duráveis, filas, retries, concorrência e agendamento.
- `langchain-ai/langgraph` e `langchain-ai/langgraphjs` — grafos de agentes e estado durável.
- `mastra-ai/mastra` — primitivas TypeScript para agentes, workflows, memória e observabilidade; avaliar somente o núcleo compatível.
- `n8n-io/n8n` — automações e conectores externos.
- `activepieces/activepieces` — automações e conectores; separar componentes comunitários de áreas enterprise.
- `langgenius/dify` — workflows e aplicações de IA; evitar importar a interface completa.

### Fontes para comparação e padrões

- `hermes-agent-org/hermes` — manifestos de skill, memória e filtragem de ferramentas.
- `orca-cli/orca`, `orka-agents/orka` e `Nethyric/orca` — candidatos diferentes sob o nome Orca; confirmar qual foi indicado.
- `crewaiinc/crewai` — equipes e colaboração entre agentes.
- `microsoft/autogen` — conversação e coordenação multiagente.
- `microsoft/semantic-kernel` — plugins, planejamento e agentes.
- `openai/openai-agents-python` e `openai/openai-agents-js` — ferramentas, handoffs, tracing e guardrails.
- `flowise-ai/flowise` — referência de composição visual de workflows.
- `langchain-ai/langchain` — ecossistema de tools e integração, não arquitetura obrigatória.
- `langgenius/mosoo` — referência de gateway para agentes.

### Adoção

- executar candidatos prioritários sem alterações;
- criar o mesmo fluxo de teste em cada candidato;
- comparar durabilidade, idempotência, observabilidade, isolamento, custo e complexidade;
- selecionar um motor principal e evitar vários runtimes sobrepostos;
- integrar por envelopes de missão e eventos Altum;
- manter tenant, políticas, aprovações, custos e UX sob domínio da Altum.

### Destino

Runtime compartilhado e Operação Avançada do admin.

### Fase

Fases 0 a 2. A decisão é pré-requisito para expansão da agência.

## 6. Navegação, computador, código e sandbox

### Fontes

- `browser-use/browser-use` — worker principal de navegação supervisionada.
- `browser-use/workflow-use` — workflows reproduzíveis de navegação.
- `open-browser-use/open-browser-use` — referência alternativa de operação web.
- `browser-use/video-use` — referência para automação ligada a vídeo.
- `All-Hands-AI/OpenHands` — execução de engenharia de software em ambiente isolado.
- `langgenius/dify-agentbox` — sandbox para execução de agentes.
- `DeusData/codebase-memory-mcp` — grafo persistente e consulta estrutural do código.

### Adoção

- executar navegadores e sandboxes em workers isolados;
- impor allowlist de domínio, ação e download;
- bloquear login sensível, CAPTCHA, pagamento, envio e publicação para revisão humana;
- capturar evidências antes e depois;
- instalar Codebase Memory MCP como ferramenta interna do agente técnico após auditoria;
- nunca misturar credenciais, perfis de browser ou workspaces entre tenants.

### Destino

Runtime compartilhado. Controles e evidências na área admin; nenhuma interface técnica exposta ao cliente comum.

### Fase

Fases 3, 8 e 10.

## 7. Gateways, modelos e decisão estruturada

### Fontes

- `xxy2026/freellmapi` — gateway OpenAI-compatible de texto, tools, visão de entrada e embeddings.
- `BerriAI/litellm` — gateway e normalização de provedores.
- `zoedsy/openJEV` e `razorback16/openjev` — decisão estruturada e validação tipada.
- `cuihuan/awesome-ai-gateway` — catálogo de referências de gateway.
- `Zapdev-labs/ommi-llm` — inferência local e referência de roteamento.

### Adoção

- rodar FreeLLMAPI e candidatos como sidecars privados;
- testar os contratos oficiais e fallback sob falhas simuladas;
- escolher uma camada de gateway principal, evitando cascatas redundantes;
- usar decisão estruturada para classificação e planejamento verificável;
- manter chaves, quotas, modelos e política de rota na camada Altum.

### Destino

Runtime compartilhado e área avançada de Modelos e Roteamento.

### Fase

Fases 2, 3 e 5.

## 8. Pesquisa, documentos, conhecimento e memória

### Fontes de pesquisa e ingestão

- `Panniantong/agent-reach` — pesquisa e recuperação web.
- `docling-project/docling` — PDF, OCR, tabelas e documentos complexos.
- `microsoft/markitdown` — conversão leve de Office, web e arquivos comuns.
- `rkendel1/anydoc` — conversão de documentos para Markdown.

### Fontes de memória e observabilidade

- `getzep/graphiti` — memória temporal baseada em grafo.
- `mem0ai/mem0` — memória para agentes.
- `langfuse/langfuse` — tracing, custo e observabilidade de LLM.
- `promptfoo/promptfoo` — avaliações, testes e red teaming.

### Adoção

- criar um benchmark comum com PDFs, planilhas, slides, documentos e páginas reais controladas;
- usar Docling para alta fidelidade e MarkItDown/AnyDoc como rotas leves ou fallback;
- preservar arquivo, página, trecho, permissão e tenant em cada fragmento;
- comparar Graphiti e Mem0 com a memória atual antes de substituir qualquer coisa;
- integrar tracing e avaliações sem enviar dados de cliente para ambientes não autorizados;
- usar Promptfoo ou contrato equivalente para regressões e ataques conhecidos.

### Destino

Runtime compartilhado, Qualidade e Memória no admin. O cliente recebe somente conhecimento e resultados autorizados.

### Fase

Fases 5 e 10.

## 9. Produção criativa de imagem, vídeo e áudio

### Vídeo e composição

- `calesthio/OpenMontage` — upstream canônico atual para pipelines completos de produção.
- `webret/openmontage` e `9018/openmontage` — registros antigos/forks; manter somente para rastrear decisões anteriores.
- `Lightricks/LTX-Desktop` e `lakeissn/ltx-2.3` — geração local ou híbrida de vídeo.
- `remotion-dev/remotion` — composição programática.
- `mcp-use/remotion-mcp-app` e `PratyushChauhan/remotion-mcp-server` — adapters MCP para Remotion.
- `none-stack-developer/ffmpeg-mcp` — adapter de processamento FFmpeg.
- `bytedance/LatentSync` — lip-sync.

### Imagem e workflows

- `comfyanonymous/ComfyUI` — executor visual local.
- `raphiki/ComfyUI-MCP-Server` e `Haervwe/comfyui-mcp` — adapters MCP candidatos.

### Áudio e voz

- `m-bain/whisperX` — transcrição, timestamps e diarização.
- `FunAudioLLM/CosyVoice` — voz e TTS local, condicionado às licenças dos pesos e consentimento.
- `geminiyellow/voicestudio` — referência adicional de produção de voz.

### Design e visualização

- `alksnd/archify` e `syntax-syndicate/archify-agent-skill` — diagramas e artefatos visuais.
- `tasteskill/tasteskill` — skills de design.
- `vercel-labs/vgpu` — referência de visualização e GPU.

### Adoção

- executar cada runtime original separadamente;
- usar OpenMontage primeiro como pipeline isolado completo;
- conectar LTX e ComfyUI por bridges, sem trazer suas interfaces para o produto;
- usar Remotion e FFmpeg como camada previsível de composição e validação;
- integrar WhisperX, CosyVoice e LatentSync como etapas opcionais do pipeline;
- exigir consentimento, direitos de uso, custo previsto e aprovação;
- registrar licenças do código, modelos, pesos e ativos separadamente.

### Destino

Estúdio da área admin, executado pelo runtime compartilhado; ativos aprovados são entregues à área do cliente.

### Fase

Fase 7.

## 10. Growth, campanhas, analytics e distribuição

### Fontes

- `dittofeed/dittofeed` — jornadas e comunicação multicanal.
- `mautic/mautic` — automação de marketing e segmentação.
- `gitroomhq/postiz-app` — distribuição e gestão de conteúdo social.
- `ynnickw/adport` — abstração para plataformas de anúncios; já há dependências AdPort na Altum.
- `TheMattBerman/meta-ads-kit` — operações de anúncios Meta.
- `irinabuht12-oss/google-meta-ads-ga4-mcp` — ferramentas MCP para Google, Meta e GA4.
- `markifact/markifact-mcp` — automação e ferramentas de marketing.
- `PostHog/posthog` e `PostHog/posthog-foss` — produto, eventos, experimentos e analytics.
- `RudderStack/rudder-server` — coleta e roteamento de eventos.

### Adoção

- preferir APIs, SDKs e serviços separados a copiar interfaces completas;
- comparar Dittofeed e Mautic com campanhas já existentes antes de escolher responsabilidades;
- aproveitar AdPort e adapters de anúncios existentes;
- usar PostHog ou alternativa somente com política clara de dados e tenant;
- conectar resultados das campanhas às missões e custos da agência;
- manter a operação cotidiana da campanha na área do cliente e a supervisão multiempresa no admin.

### Destino

Runtime de growth compartilhado; supervisão e lançamento no admin; operação diária e relatórios do negócio na área do cliente.

### Fases

Fases 6, 9 e 11.

## 11. CRM, atendimento, comunicação e comércio

### Fontes

- `twentyhq/twenty` — CRM como benchmark e possível fonte de contratos.
- `chatwoot/chatwoot` — atendimento e inbox como benchmark e integração possível.
- `evolution-foundation/evolution-api` — canal de mensagens e WhatsApp.
- `filip-michalsky/SalesGPT` — referência de agente de vendas.
- `ericmil87/hnbcrm` — benchmark de CRM com IA.
- `livekit/agents` — agentes de voz e tempo real.
- `pipecat-ai/pipecat` — pipelines conversacionais de voz.
- `documenso/documenso` — documentos, propostas e assinaturas.
- `universal-commerce-protocol/ucp` e organização `universal-commerce-protocol` — interoperabilidade comercial.
- `a2aproject/A2A` — comunicação entre agentes.

### Adoção

- usar como integração, protocolo, SDK ou benchmark;
- não reconstruir inbox, CRM, SDR ou closer dentro do admin;
- manter atendimento e venda diária na área do cliente;
- usar o admin somente para implantação, supervisão, política, qualidade e intervenção;
- avaliar LiveKit e Pipecat como runtime de voz separado;
- avaliar Documenso para propostas e assinaturas sem duplicar o produto completo;
- acompanhar UCP e A2A como padrões de interoperabilidade.

### Destino

Principalmente área do cliente e runtime compartilhado. No admin, somente controles, saúde, implantação e auditoria.

### Fases

Fases 3, 6, 9 e evoluções posteriores da área do cliente.

## 12. Simulação e inteligência estratégica

### Fontes

- `artffee/mirofish` e `666ghj/MiroFish` — simulação de cenários e comportamento de público.

### Adoção

- executar o upstream isolado para compreender entradas, saídas e limitações;
- tratar resultados como hipóteses simuladas, nunca como previsão factual;
- manter parâmetros, incerteza e fontes visíveis;
- condicionar qualquer integração ao tratamento da licença AGPL e ao valor demonstrado.

### Destino

Laboratório de Estratégia na área admin.

### Fase

Após a Fase 10; não bloqueia o primeiro go-live.

## 13. Matriz de prioridade

### Onda 1 — Fundação que desbloqueia a agência

- Agency Agents e bibliotecas de marketing/sales skills;
- OpenClaw, Hatchet, LangGraph e Orca correto para benchmark do runtime;
- FreeLLMAPI, LiteLLM e OpenJEV para roteamento e decisão;
- browser-use para execução supervisionada;
- Codebase Memory MCP para agentes técnicos;
- Docling, MarkItDown e AnyDoc para ingestão;
- Langfuse e Promptfoo para observabilidade e avaliações.

### Onda 2 — Primeiro serviço completo

- AdPort e adapters de anúncios;
- Dittofeed/Mautic para jornadas quando agregarem ao que já existe;
- PostHog/RudderStack para resultados e atribuição;
- Remotion e FFmpeg para composição;
- OpenMontage executado como pipeline isolado;
- ComfyUI e LTX como executores opcionais.

### Onda 3 — Escala multimodal e distribuição

- WhisperX, CosyVoice, LatentSync e LiveKit/Pipecat;
- Postiz e automações sociais;
- Archify e skills de design;
- Documenso, UCP e A2A;
- Graphiti ou Mem0 se superarem a memória atual.

### Onda 4 — Laboratórios e alternativas

- MiroFish;
- frameworks de agentes não escolhidos como motor principal;
- interfaces completas de CRM, workflow e atendimento usadas apenas como benchmark.

## 14. Regras para evitar caos tecnológico

- uma capacidade principal deve ter um runtime proprietário por vez;
- candidatos concorrentes passam pelo mesmo teste de contrato;
- não instalar um produto completo apenas por uma funcionalidade pequena;
- não levar interfaces de terceiros para a experiência comum da Altum;
- não duplicar capacidades já maduras no cliente;
- não misturar licenças copyleft ao núcleo proprietário sem decisão jurídica;
- não tratar fork antigo como upstream canônico;
- não deixar um projeto externo escrever diretamente em coleções internas sem adapter;
- não permitir credenciais ou dados de tenant fora da fronteira autorizada;
- não adaptar antes de reproduzir o comportamento original.

## 15. Registro operacional obrigatório

Para cada adoção, criar uma ficha contendo:

- capability ID;
- problema resolvido;
- owner interno;
- repositório, commit e licença;
- modo de execução;
- contrato do adapter;
- permissões e dados acessados;
- custo e infraestrutura;
- testes oficiais reproduzidos;
- testes Altum adicionados;
- limitações conhecidas;
- plano de atualização;
- rollback;
- status: `candidate`, `sandboxed`, `validated`, `integrated`, `production`, `deprecated`.

## 16. Condição de sucesso

Este portfólio terá cumprido sua função quando a Altum conseguir montar novas capacidades principalmente por composição de componentes validados, reservando código próprio para sua vantagem real: experiência, governança multiempresa, contexto de negócio, políticas, aprovações, custos, memória, qualidade e coordenação.

