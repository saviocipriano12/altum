# Curadoria de repositórios — adoção consciente na Altum

## Regra de adoção

A Altum não deve copiar produtos inteiros nem transformar o Comando em uma coleção de interfaces de terceiros. Cada fonte abaixo pode entrar somente como um dos quatro formatos:

1. **Worker isolado** — serviço com fila, credenciais próprias e contrato de entrada/saída definido;
2. **Adapter** — integração pequena que traduz uma capacidade para o modelo de jobs da Altum;
3. **Skill curada** — instruções, templates e validações revisados, com permissões mínimas;
4. **Referência de arquitetura** — padrão adotado em código próprio, sem incorporar o produto.

Antes de incorporar código: travar commit, conferir licença e dependências, remover telemetria/segredos indevidos, testar isolamento por empresa e registrar permissões, custo, owner e rollback.

## Decisão por fonte

| Fonte | Papel na Altum | Forma correta de aproveitar | Decisão |
| --- | --- | --- | --- |
| [OpenMontage](https://github.com/webret/openmontage) | Produção profissional de vídeo | Usar como especificação de produto: briefing → planos/variações → referências → render → validação técnica → entrega. Sua licença AGPL impede incorporar código ao produto proprietário sem avaliação jurídica. | **Prioridade alta: reproduzir comportamentos em código próprio; não copiar runtime, UI ou módulos.** |
| [LTX Desktop](https://github.com/Lightricks/LTX-Desktop) | Vídeo local/híbrido | Tratar como executor local opcional, ligado por bridge autenticada. A Altum envia job e recebe status/artefato; não tenta instalar modelos ou usar GPU do usuário silenciosamente. | **Prioridade alta quando houver GPU compatível; alternativa privada a APIs.** |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | Imagem e fluxos locais | Usar somente como processo externo opcional através da API/bridge, mantendo workflows aprovados e presets da Altum. Sua licença GPL requer revisão jurídica antes de qualquer incorporação. | **Prioridade alta para executor externo de imagem/edição privada.** |
| [Remotion](https://github.com/remotion-dev/remotion) + FFmpeg | Vídeo previsível | Usar para carrosséis, legendas, cortes, motion, vídeo tipográfico, episódios e composições. É complementar ao vídeo generativo, não um substituto. | **Prioridade alta: integrar ao worker de mídia.** |
| [FreeLLMAPI](https://github.com/xxy2026/freellmapi) | Roteador de texto, imagem e áudio | Rodar o serviço original como sidecar privado e usar seus contratos OpenAI-compatible: chat, embeddings, `/v1/images/generations`, `/v1/audio/speech`, catálogo de mídia, cooldown, rate-limit por chave e fallback. Vídeo continua em adaptadores próprios, pois este runtime não entrega geração de vídeo. | **Adotar como worker interno; nunca expor dashboard ou credenciais ao cliente.** |
| [OpenClaw](https://github.com/openclaw/openclaw) | Runtime privado de agentes | Manter um fork versionado e isolado, com bridge autenticado Altum↔OpenClaw para sessões, skills, tarefas e eventos. Não expor sua interface, gateway administrativo ou configuração de host. | **Runtime interno selecionado (MIT); bridge Altum próprio.** |
| [Hermes](https://github.com/hermes-agent-org/hermes) | Skills, MCP e memória operacional | Reaproveitar os padrões de manifest de skill, filtro de ferramentas MCP, resumo de sessão e controle de capacidades. Visibilidade de skill não é sandbox: execução continua isolada pela Altum. | **Referência estrutural e possível fonte de skills curadas.** |
| [browser-use](https://github.com/browser-use/browser-use) | Navegação e trabalho em sites | Oferecer como worker supervisionado: domínio permitido, plano no chat, screenshot/evidência, sessão isolada e parada obrigatória em login, CAPTCHA, pagamento, envio ou publicação. | **Fase de browser supervisionado; não liberar autonomia irrestrita.** |
| [AnyDoc](https://github.com/rkendel1/anydoc) | Leitura de arquivos | Adaptar seu conversor para extrair Markdown de DOCX/PPTX/XLSX/PDF como uma etapa privada de ingestão. O conteúdo extraído deve manter origem, página/arquivo e permissões. | **Prioridade média-alta: fecha lacuna de documentos.** |
| [MiroFish](https://github.com/artffee/mirofish) | Simulação de cenários | Usar como referência de produto para hipóteses de reação de público e cenários, deixando claro que é simulação, não previsão factual. Sua licença AGPL impede copiar o backend para a Altum proprietária sem avaliação jurídica. | **Laboratório futuro; não entra no fluxo principal agora.** |
| [Archify](https://github.com/alksnd/archify) | Diagramas de estratégia/processo | Instalar como skill de apoio para a Orquestradora criar mapas de campanha, fluxos e arquitetura como artefatos editáveis. | **Skill opcional, baixo risco.** |

## Arquitetura de destino usando essas fontes

```text
Comando Altum (uma conversa e uma biblioteca)
  → Orquestradora + memória + políticas
    → router por modalidade/custo/qualidade/privacidade
      → Texto, imagem e áudio: FreeLLMAPI / providers conectados
      → Imagem e vídeo especializados: FAL / Replicate / Higgsfield / ComfyUI local
      → Vídeo: Higgsfield / FAL / LTX local / pipeline OpenMontage
      → Composição: Remotion + FFmpeg
      → Arquivos: AnyDoc + OCR/transcrição
      → Internet: browser-use supervisionado
    → jobs duráveis, revisão, biblioteca e auditoria da Altum
```

O usuário vê somente o pedido, o plano, o progresso, a decisão relevante e o resultado. Provider, modelo, endpoint e fila permanecem internos.

## Ordem de aproveitamento

1. **Fechar mídia agora:** incorporar os padrões de pipeline do OpenMontage e conectar Remotion/FFmpeg ao worker já existente; usar LTX/ComfyUI por bridges locais opcionais.
2. **Fechar contexto e criação:** usar AnyDoc para ingestão de documentos e Archify como skill de mapa/planejamento.
3. **Fechar execução supervisionada:** levar browser-use a um worker isolado com políticas, evidências e stop-points.
4. **Escalar extensibilidade:** usar o fork privado do OpenClaw para execução e aplicar os padrões de Hermes ao registro curado de skills, MCPs, apps e nós locais.
5. **Experimentar, sem prometer produção:** MiroFish para simulações estratégicas.

## O que não faremos

- Clonar a interface de qualquer um desses projetos;
- colocar tokens no navegador ou devolver credenciais ao chat/MCP;
- permitir que um agente opere navegador, máquina, pagamento ou publicação sem escopo e confirmação;
- chamar simulação de mercado de dado real;
- anunciar vídeo, clone de voz ou lip-sync como pronto antes de haver job real, resultado e validação.

## Extração literal aprovada por repositório

Esta seção distingue **código que poderá ser incorporado ou chamado**, **interfaces/contratos que serão recriados** e **material que não será copiado**. “Recriar” significa implementação nova da Altum baseada no comportamento observado, nunca colagem de fonte incompatível.

### OpenMontage — recriar, não copiar (AGPL-3.0)

- Recriar o contrato de pipeline presente nas skills `ai-video-gen`, `avatar-video` e nos estágios de planejamento: `brief → roteiro → storyboard/cenas → referências → geração → pós-produção → QA → entrega`.
- Recriar nossa própria tabela de `creative_pipeline_runs`, `creative_pipeline_steps`, entradas, saídas, tentativas, orçamento e evidências.
- Recriar nossa própria avaliação pós-render: metadados do arquivo, resolução, duração, faixa de áudio, quadro de amostra, legenda e validação de entrega.
- Recriar a ideia de catálogo de capacidades/provedores e a seleção de rota por modalidade.
- **Não copiar:** `.agents/skills`, aplicação, backend, prompts, UI, scripts ou qualquer arquivo de implementação do repositório.

### LTX Desktop — integrar por bridge (Apache-2.0)

- Chamar, por um bridge local separado, os contratos de geração em `backend/_routes/generation.py` e status/cancelamento compatíveis com `backend/handlers/*generation_handler.py`.
- Mapear localmente capacidades de GPU/modelo inspiradas em `backend/runtime_config/ltx_capabilities.py` e política de runtime, sem instalar pesos nem iniciar GPU sem comando do proprietário.
- Preservar os dados que importam para a Altum: `queued/running/completed/failed/cancelled`, artefato, duração, resolução e logs técnicos internos.
- **Não copiar:** Electron/frontend do LTX Desktop, instalador, pesos, interface de edição ou licenças de modelo.

### ComfyUI — executor externo, não biblioteca interna (GPL-3.0)

- Usar a API HTTP/WebSocket de uma instância local para enviar somente workflows Altum aprovados e buscar resultado/status.
- Criar `ComfyBridge` próprio, com presets versionados como `produto`, `retrato`, `editorial`, `identidade` e `upscale`; o usuário não verá nós/JSON.
- **Não copiar/importar:** código Python, frontend, nós, exemplos ou componentes GPL para o app Altum. Qual uso distribuído será revisado juridicamente.

### Remotion e FFmpeg — composição controlada

- Implementar composições próprias: `CaptionedVideo`, `Carousel`, `SocialCut`, `ProductDemo` e `CampaignVariation`.
- Reutilizar os contratos de render, frames, áudio, legenda e validação de saída; cada template será criado pela Altum e salvo como ativo versionado.
- Antes de incorporar pacotes/trechos, confirmar os termos comerciais da versão de Remotion em uso; FFmpeg é chamado como ferramenta do worker, não exposto ao navegador.

### FreeLLMAPI — executar o serviço original, com adapter Altum (MIT)

- Usar o runtime original como sidecar privado: `AltumRouter → FreeLLMAPI → providers` para chat, embeddings, imagem e áudio.
- Manter os contratos de fallback do projeto: candidatos por modalidade separados, ordem configurável, cooldown após `429`/`5xx`/timeout, rastreio de quota por chave, health check e telemetria de rota.
- Integrar os endpoints já prontos `/v1/chat/completions`, `/v1/embeddings`, `/v1/images/generations` e `/v1/audio/speech`; a Altum apenas persiste o ativo, apresenta o progresso e aplica tenant/política/consentimento.
- **Não copiar/expor:** dashboard React, autenticação single-user, billing ou UX de configuração. A Altum fornece sua própria camada de tenant/política/auditoria.

### OpenClaw — runtime interno versionado (MIT)

- Manter um checkout/fork fixado em commit e atualizar somente via revisão de dependências, licença, segurança e contrato.
- Instalar o bridge próprio em `resources/openclaw/altum-mission-bridge/`: recebe somente envelopes assinados da Altum, usa o SDK oficial do runtime e devolve eventos assinados.
- Usar o runtime para sessões, skills, subagentes, cron e workers; Altum continua dona de tenant, memória, biblioteca, credenciais, custo, aprovações e UX.
- **Não expor:** gateway administrativo, canais pessoais, interface do OpenClaw, automações de desktop ou configuração de host ao cliente final.

### Hermes — incorporar padrões de segurança e contexto (MIT)

- Recriar os manifestos de skill e os filtros de ferramentas inspirados em `hermes_cli/mcp_config.py`, `agent/skill_utils.py` e `agent/memory_manager.py`.
- Construir resumo de sessão, memória de projeto e seleção mínima de tools antes de cada execução.
- **Não copiar:** runner, terminal integration, WSL/container assumptions ou configurações de MCP de terceiros sem revisão.

### browser-use — worker de navegação supervisionada (MIT)

- Chamar a biblioteca em serviço isolado para criar sessão, navegador/contexto, ações, evidências e estado resumido; os conceitos vêm de `browser_use/agent/service.py`, `browser_use/actor/page.py` e profiles.
- Criar um contrato Altum: domínio permitido, objetivo, plano, screenshots, passos, stop-points e resultado. Login, CAPTCHA, pagamento, envio e publicação suspendem o job para o chat.
- **Não copiar:** credenciais/perfis reais para logs, nem liberar execução de shell, downloads ou domínios arbitrários.

### AnyDoc — adapter de ingestão (MIT)

- Incorporar ou invocar sua API Node `toMarkdown`/`toMarkdownBytes`, documentada em `node/index.js`, para DOCX, PPTX, XLSX e outros formatos.
- Criar `DocumentIngestion`: arquivo privado → markdown segmentado → origem/página → indexação → resposta com citações de arquivo.
- **Não copiar:** a interface de CLI como UX final; o chat assume o comando.

### Archify — skill de visualização (MIT)

- Aproveitar os schemas/ideia de IR para `workflow`, `sequence`, `dataflow` e `lifecycle`, criando artefatos HTML seguros ligados a uma campanha, processo ou projeto.
- Executar validação antes de publicar um diagrama, inspirada em `archify/renderers/shared/validator.mjs`.
- **Não copiar:** previews locais expostos ou código de entrega sem isolamento; diagramas serão ativos privados da Altum.

### MiroFish — referência, não código (AGPL-3.0)

- Recriar no futuro somente a experiência de “cenário → premissas → simulação limitada → relatório com incerteza”, inspirada nos serviços `graph_builder`, `simulation_runner` e `report_agent`.
- Exibir resultados como hipótese simulada, com parâmetros e limitações visíveis.
- **Não copiar:** backend, frontend, grafo, prompts, simulação ou código AGPL.

## Novas fontes que melhoram a base

Estas fontes foram avaliadas depois da primeira curadoria. Elas resolvem lacunas objetivas e entram como candidatas de implementação, com um teste de contrato antes de qualquer dependência definitiva.

| Fonte | Lacuna que resolve | Adoção proposta | Prioridade |
| --- | --- | --- | --- |
| [Hatchet](https://github.com/hatchet-dev/hatchet) — MIT | Jobs longos, filas, retries, concorrência, agendamento e grafos duráveis | Substituir progressivamente o worker/polling específico de mídia por um runtime comum de jobs. A Altum mantém seus próprios dados, políticas e auditoria. | Alta |
| [Docling](https://github.com/docling-project/docling) — MIT | PDF, tabelas, layout, OCR e documentos complexos | Worker Python de ingestão que retorna Markdown/JSON estruturado, páginas e falhas. Será a rota de maior qualidade para PDFs e arquivos ricos. | Alta |
| [MarkItDown](https://github.com/microsoft/markitdown) — MIT | Conversão leve de Office, web e arquivos comuns | Fallback rápido para documentos simples; sem plugins arbitrários habilitados. | Média |
| [WhisperX](https://github.com/m-bain/whisperX) — BSD-2-Clause | Transcrição, timestamps de palavras e diarização | Worker de áudio/vídeo para legenda editável, busca e revisão. | Alta |
| [CosyVoice](https://github.com/FunAudioLLM/CosyVoice) — Apache-2.0 | TTS multilíngue e voz local | Executor de voz opcional, depois de validar licença dos pesos e consentimento de cada referência. | Média-alta |
| [LatentSync](https://github.com/bytedance/LatentSync) — Apache-2.0 | Lip-sync de vídeo para áudio aprovado | Etapa opcional do pipeline de avatar, após validação de qualidade, GPU e direitos. | Média-alta |
| [Mastra](https://github.com/mastra-ai/mastra) — núcleo Apache-2.0; áreas `ee/` separadas | Primitivas TypeScript para agentes, workflows, memória e observabilidade | Avaliar somente o núcleo OSS, nunca diretórios `ee/`. É candidato se reduzir código próprio sem nos prender ao framework. | Média |

### Fontes descartadas por enquanto

- **Vanta, HeyGem e forks “all-in-one” de avatar:** têm licença ausente/não declarada, maturidade insuficiente ou excesso de componentes opacos. Servem para benchmark visual, não para base da Altum.
- **Wav2Lip/SadTalker e derivados com restrições de uso:** não entram em produto comercial sem licença explicitamente compatível.
- **Frameworks inteiros de workflow/agent (Dify, CrewAI, AutoGen):** só entram se houver ganho comprovado sobre nossa arquitetura; importar toda a plataforma recriaria o problema de UX fragmentada.
