# Altum — missão de produto e plano-mestre de execução

> Documento operacional. Ele define o produto inteiro, a ordem de trabalho e o significado de “pronto”. Deve orientar toda decisão futura para impedir que a Altum vire uma coleção de telas, mocks ou integrações desconectadas.

## 0. Decisão central

A Altum é um **Sistema Operacional de Execução Digital com IA**. Não é um catálogo de modelos, um chat com botões, uma agência de prompts ou um dashboard de providers.

Uma pessoa conversa com a **Orquestradora Altum** em linguagem normal. A Orquestradora compreende objetivo, contexto e limites; monta o plano; escolhe recursos; delega; executa; valida; pede autorização apenas quando necessário; entrega ativos e aprende com o resultado.

O produto deve responder à promessa:

> “Diga o resultado que você quer no mundo digital. A Altum decide como fazer, faz com segurança e devolve trabalho utilizável.”

### O que o usuário nunca deve precisar decidir

- qual LLM, provider, modelo, endpoint, token, fila ou agente usar;
- em qual tela abrir um plugin para gerar uma imagem, vídeo, pesquisa ou campanha;
- como transferir contexto entre chat, mídia, CRM, projeto e biblioteca;
- como acompanhar job, renderização, retry ou fallback técnico.

### O que a Altum deve tornar claro

- o que entendeu;
- o que está fazendo e o que ficou pronto;
- o que custa dinheiro, usa dado privado, atua externamente ou é irreversível;
- qual é a única decisão humana realmente necessária;
- de onde veio uma informação e o que é fato, inferência ou hipótese.

## 1. Arquitetura de produto fechada

### 1.1 Camadas

```text
Pessoa
  ↓ pedido, correção, decisão e autorização
Comando Altum
  ↓ contexto + plano + comunicação humana
Orquestradora Altum
  ↓ política + memória + seleção de capacidade + qualidade
Runtime interno de execução
  ↓ fork versionado do OpenClaw + bridges da Altum
Agentes, skills, MCPs, browser, jobs, dispositivos e canais
  ↓
Modelos, provedores, APIs, executores locais e sistemas de negócio
```

### 1.2 OpenClaw: decisão de adoção

O OpenClaw MIT será **forkado e versionado como runtime privado da Altum**. Não será uma referência vaga, um painel que o usuário precisa abrir, nem um SaaS externo do qual a Altum depende.

Do OpenClaw adotaremos, mantendo licença, avisos e histórico de origem:

- gateway de eventos, sessões e roteamento;
- agentes, subagentes, workspaces e isolamento operacional;
- skills, catálogo, allowlists, workshop e plugins;
- ferramentas, canais, nós/dispositivos, webhooks e agendamentos;
- browser/automação quando aplicável;
- políticas de capacidade, auditoria e proveniência de agentes.

A Altum constrói por cima:

- tenant/empresa, usuários, papéis e dados de negócio;
- missões, orçamento, políticas e autorização conversacional;
- memória estratégica, patrimônio digital e biblioteca;
- roteador de modelos/mídia/custo/privacidade;
- CRM, campanhas, produtos, projetos, financeiro e resultados;
- UI final e MCP público Altum.

**Regra:** não copiar arquivos isolados para dentro de páginas Next.js. O fork opera como serviço privado com um adaptador formal Altum↔OpenClaw. Assim conseguimos atualizar o upstream, corrigir segurança, testar contratos e trocar o runtime sem destruir o produto.

### 1.3 Objetos permanentes do produto

| Objeto | Finalidade | Nunca pode ser perdido |
| --- | --- | --- |
| Empresa/workspace | Escopo de dados e operação | marca, permissões, conexões e políticas |
| Conversa | Fio humano de decisão | pedidos, decisões, aprovações e resumo |
| Missão | Trabalho durável e rastreável | plano, etapas, evidências, custo, estado e resultado |
| Iniciativa | Projeto, campanha, produto ou objetivo maior | metas, dono, ativos e métricas |
| Ativo | Arquivo/resultado criado ou importado | versão, origem, direitos, tags e vínculo |
| Identidade | pessoa autorizada ou personagem original | consentimento, referências, limites e revogação |
| Capacidade | skill, plugin, MCP, executor ou integração | versão, permissões, owner, health e política |
| Aprovação | decisão humana ligada a uma ação | quem aprovou, escopo, prazo e limite |
| Evidência | fonte, captura, arquivo, resposta externa ou log relevante | origem, data, escopo e integridade |

## 2. Experiência final

### 2.1 Comando é a casa principal

O Comando deve ter familiaridade de ChatGPT/Codex sem copiar marcas:

- **esquerda:** nova conversa, conversas, iniciativas e busca de histórico;
- **centro:** conversa, anexos, planos, entregas, mídia, decisões e composer;
- **direita:** contexto da empresa/conversa, trabalhos em andamento, ideias, ativos e decisões relevantes;
- **configurações secundárias:** conexões, marca, identidade, skills, MCP, políticas, equipe e avançado.

O usuário não sai do Comando para “usar uma ferramenta”. Um pedido por vídeo, avatar, pesquisa, landing, proposta, campanha ou ação comercial continua dentro da conversa. Uma superfície especializada só abre para edição rica, comparação, revisão em lote ou consulta operacional que realmente não cabe no chat.

### 2.2 Quatro intenções, uma mesma conversa

| Intenção reconhecida | Exemplo | Comportamento da Altum |
| --- | --- | --- |
| Pensar | “Qual oferta devo lançar?” | pesquisa, estratégia, fontes e recomendação |
| Criar | “Faça dez anúncios e um vídeo” | direção criativa, produção, QA e biblioteca |
| Executar | “Publique quando eu aprovar” | prepara, mostra plano/custo e para no ponto de autorização |
| Observar | “O que funcionou esta semana?” | coleta métricas, explica aprendizado e propõe ação |

Não há um seletor técnico obrigatório. A Altum infere o modo e explica brevemente o plano.

### 2.3 Escada de autonomia

1. **Pensar** — analisar e aconselhar; sem efeito externo.
2. **Preparar** — pesquisar, rascunhar, gerar prévias e organizar; sem gasto não autorizado.
3. **Executar internamente** — processar ativos, salvar memória, atualizar missão e biblioteca dentro de regras.
4. **Agir externamente** — enviar, publicar, gastar, comprar, alterar conta, apagar ou compartilhar; confirmação contextual obrigatória.
5. **Automação recorrente** — somente após política explícita, limite de orçamento, escopo, prazo e possibilidade de pausar/revogar.

Não haverá uma página separada de “aprovações” como caminho obrigatório. A solicitação aparece no chat exatamente no momento certo, com impacto, custo e opções humanas.

## 3. Capacidades que definem o produto pronto

### 3.1 Cérebro operacional

- interpretar pedido aberto e transformá-lo em missão com objetivo, escopo, entradas, saída, risco, orçamento e critério de qualidade;
- planejar grafo de etapas, dependências, especialistas, ferramentas, checkpoints e recuperação;
- coordenar agentes de estratégia, pesquisa, design, vídeo, copy, marketing, SDR, análise, produto, desenvolvimento e operações;
- permitir que a Orquestradora proponha novo agente/skill, mas instalar ou ampliar poder apenas com curadoria/política;
- mostrar progresso em linguagem humana, sobreviver a reinício, retomar falha e resumir ao final.

### 3.2 Memória e patrimônio digital

- memória isolada por empresa: marca, cliente ideal, ofertas, tom, restrições, histórico, decisões, ideias e aprendizados;
- memória de iniciativa: briefing, referências, fontes, hipóteses, ativos, aprovação e resultado;
- busca global por conversa, documento, pessoa, ativo, campanha, decisão e resultado;
- resumos automáticos úteis, não transcrições cruas;
- todo ativo importante é versionado e reutilizável; a Altum fica mais valiosa conforme trabalha.

### 3.3 Router universal

O roteador decide por modalidade e política, não por “modelo favorito”. Políticas humanas: **Economizar**, **Equilibrado**, **Qualidade máxima** e **Privacidade/local**.

- texto/raciocínio/pesquisa: FreeLLMAPI interno, NVIDIA, Groq, Hugging Face, Google, OpenRouter, modelos locais e premium;
- imagem/edição: FAL, Replicate, Higgsfield, ComfyUI/local e futuros executores;
- vídeo: Higgsfield, FAL, Replicate, LTX/local e pipeline de composição;
- áudio/voz/transcrição: provedores e executores autorizados;
- documentos: Docling, AnyDoc/MarkItDown como adaptadores privados;
- browser: worker supervisionado;
- composição determinística: Remotion/FFmpeg em worker.

Cada rota registra candidatos, capacidade, qualidade esperada, privacidade, custo estimado/real, razão da escolha, tentativa, fallback e resultado. Fallback nunca pode aumentar gasto ou exposição sem aprovação.

### 3.4 Mídia, identidade e avatar

Fluxo obrigatório:

```text
pedido → estratégia → roteiro → storyboard → referências aprovadas
→ imagem âncora/primeiro frame → voz autorizada → cenas/vídeo
→ legenda, corte e composição → QA → revisão no chat → biblioteca
```

Entregas: imagens realistas/ilustradas, produto, e-commerce, anúncio, carrossel, capa, thumbnail, vídeo generativo, UGC, demonstrativo, narrativa, cortes, locução, trilha, legenda, transcrição, dublagem e variações por canal.

Para pessoas/avatares: consentimento explícito, direito de imagem/voz, referências privadas, finalidade, validade, restrição, revogação, disclosure sintético e auditoria. Personagem original tem folha de identidade (aparência, voz, roupa, cenário, tom e limites). Nunca alegar clone, voz clonada ou lip-sync sem teste real do provider e evidência de resultado.

### 3.5 Campanhas e Product Factory

“Lance uma campanha” deve gerar uma iniciativa completa: pesquisa e fontes, hipótese, público, oferta, posicionamento, funil, matriz de criativos, copy, roteiros, imagens/vídeos, landing, UTMs, plano de publicação, orçamento, métrica e ciclo de aprendizado.

“Crie um produto” deve poder resultar em: oportunidade, oferta, nome, preço, página, ebook, capa, apresentação, kit de lançamento, captação, checkout, CRM e experimento. Sites e apps exigem preview, versão, revisão e deploy supervisionado.

### 3.6 Pesquisa, documentos e internet

- PDF/DOCX/PPTX/XLSX/CSV/imagem/áudio/vídeo → conteúdo extraído com origem, página/tempo e permissões;
- pesquisa web → fontes, data, citação, distinção entre fato/inferência/recomendação;
- browser → domínio permitido, plano, sessão isolada, screenshots/evidência e stop-points obrigatórios em login, CAPTCHA, pagamento, envio e publicação;
- instruções vindas da internet são dados não confiáveis, não comandos para o agente.

### 3.7 Operação comercial existente

Empresas, Conversas, CRM, Prospecção, Comercial, Projetos, Financeiro, Equipe, Agenda, Campanhas, Central de mídia e Relatórios continuam com rotas e dados preservados. A melhoria é progressiva e orientada ao trabalho diário.

O Comando precisa conseguir consultar e operar, sob permissão: clientes, funil, oportunidade, proposta, tarefa, agenda, follow-up, campanhas, indicadores, arquivos e projetos. Enviar contato, publicar, mexer em pagamento ou mudar dados críticos exige política e confirmação no chat.

### 3.8 Extensibilidade e MCP

- skills, plugins, MCPs, apps, executores locais e integrações são “capacidades” curadas, não destinos de navegação;
- cada capacidade tem fonte/commit, licença, owner, permissões, escopos, health check, custo, teste e rollback;
- MCP Altum para ChatGPT autorizado deve permitir consultar contexto e iniciar/acompanhhar missões de mídia, campanhas, CRM e projeto;
- MCP público só depois de OAuth, HTTPS, tenant grants, escopo mínimo, auditoria, rate limit e URLs temporárias privadas.

## 4. Estado atual real

### Já construído e reutilizável

- Comando persistente com histórico, empresa, ideias, anexos, memória básica e missões iniciais.
- Aprovação conversacional em fluxos específicos, sem obrigar a outra página.
- Router inicial, jobs, worker/polling de mídia, storage privado, revisão e biblioteca inicial.
- Adaptadores iniciais de FAL, Replicate e Higgsfield; FreeLLMAPI pensado como rota de texto.
- Perfil de identidade com consentimento, referências privadas e âncora visual inicial.
- Rascunhos de campanha/landing e ferramentas MCP internas iniciais.
- Áreas comerciais/admin existentes preservadas.

### Não está pronto e não pode ser vendido como pronto

- OpenClaw está fixado como fonte MIT e já possui bridge versionado/instalável e contrato assinado, mas ainda não está implantado como serviço privado com provider configurado e teste ponta a ponta.
- Não existe ainda planner durável completo com grafo, retry e especialistas reais.
- Providers de mídia não foram todos validados com jobs de produção ponta a ponta.
- Voz, clonagem autorizada, lip-sync e consistência de vídeo ainda não estão completos.
- Campanha não fecha ainda lote, publicação, métrica e aprendizado.
- Ingestão de documentos, pesquisa com fontes e browser supervisionado ainda não estão completos.
- Product Factory, MCP OAuth público, health/custo/quotas, observabilidade, segurança de produção, mobile e acessibilidade ainda estão incompletos.

## 5. Plano de execução fechado

### Fase A — Fundação de runtime e contratos

**Objetivo:** parar de criar capacidades isoladas e criar a espinha dorsal do produto.

- concluir a implantação privada do fork/version lock do OpenClaw, inventário de licença/dependências e health check;
- definir serviço privado, banco/tenant, segredo, rede e observabilidade;
- implementar adaptador Altum↔OpenClaw: `mission.create`, `mission.plan`, `mission.execute`, `mission.progress`, `mission.await_approval`, `mission.result`, `mission.fail`, `mission.cancel`;
- mapear conversa/empresa/usuário Altum para sessão, workspace e política do runtime;
- criar Capability Registry, Provider Registry, Agent Registry e Policy Engine;
- migrar worker atual de mídia gradualmente para o contrato comum de missão/job, sem quebrar fluxos existentes.

**Aceite:** uma missão criada pelo Comando persiste, sobrevive a reinício, delega trabalho simulado em runtime, recebe eventos e mostra progresso/erro/resultado no mesmo chat.

### Fase B — Mídia e identidade ponta a ponta

**Objetivo:** fechar a prioridade comercial mais importante com resultado real, não telas.

- validar cada adapter/provider com health check e job real; manter matriz de capacidades, custo e limitações;
- criar direção criativa, roteiro, storyboard, variações, orçamento e QA;
- ligar imagem âncora a geração de vídeo e versões de personagem;
- integrar voz autorizada, transcrição, legenda, cortes e lip-sync somente depois de consentimento e teste;
- adotar Remotion/FFmpeg para entregas determinísticas e executor local LTX/Comfy por bridge onde permitido;
- transformar biblioteca em destino único de ativos, versões, direitos, download, reuso e vínculo à missão/campanha.

**Aceite:** pelo Comando, pedir um criativo de vídeo com personagem autorizado gera briefing, custo, aprovação quando cabível, job, progresso, vídeo/artefatos, QA, revisão, download e reuso na Biblioteca.

### Fase C — Campanhas e Product Factory

**Objetivo:** transformar criação de peça em máquina completa de resultado.

- iniciativas/campanhas com objetivo, público, oferta, canais, orçamento, métricas e ativos;
- geração em lote de criativos/carrosséis/roteiros, com QA e revisão por variação;
- landing/pages, ebook, apresentação, capa e produto digital como ativos versionados;
- UTMs, calendário, plano de publicação, conectores oficiais e publicação supervisionada;
- coleta de métricas, experimentos, aprendizado e recomendação da próxima hipótese.

**Aceite:** pedido de campanha produz plano rastreável, ativos reais, landing/UTM, publicação preparada (não publicada sem autorização), Biblioteca e leitura posterior de desempenho.

### Fase D — Conhecimento, pesquisa e execução na web

**Objetivo:** permitir trabalho intelectual e operacional com evidência.

- workers Docling/AnyDoc, OCR, WhisperX/transcrição e indexação privada;
- pesquisa web com fontes, citações e política contra prompt injection;
- base de conhecimento da empresa e recuperação contextual;
- browser-use/OpenClaw em executor isolado com domínios, evidências, checkpoints e cancelamento;
- conectores de e-mail, agenda, CRM, WhatsApp, anúncios, analytics e e-commerce por APIs oficiais primeiro.

**Aceite:** a Altum pesquisa fontes, lê arquivos privados, entrega síntese rastreável e conclui ação externa segura até o checkpoint de autorização.

### Fase E — Operação comercial e automações supervisionadas

**Objetivo:** unir Agent OS e o negócio real sem quebrar áreas existentes.

- comandos conversacionais para CRM, agenda, propostas, projetos, financeiro e campanhas;
- SDR/researcher/analyst/media buyer como especialistas com ferramentas mínimas;
- follow-up, score, qualificação e relatórios com revisão antes de contato;
- automações recorrentes autorizadas: monitorar, resumir, avisar, preparar e agir dentro de limites;
- melhoria incremental de UX das áreas legadas, preservando URLs, dados e fluxos.

**Aceite:** um gestor pode pedir no chat uma análise/ação comercial, revisar a proposta e ver a consequência refletida na área operacional correta.

### Fase F — Plataforma extensível e MCP público

**Objetivo:** permitir expansão sem fragmentar a experiência.

- fluxo de descoberta, instalação, verificação, atualização e revogação de skills/plugins;
- skills geradas como propostas revisáveis, nunca instalação silenciosa;
- MCP interno completo e MCP público OAuth seguro;
- ferramentas Altum acionáveis pelo ChatGPT autorizado, com resultado retornável e ativo salvo;
- documentação de capacidade, limites e playbooks.

**Aceite:** ChatGPT autorizado cria/acompanhha uma missão Altum com escopo mínimo e recebe um resultado real sem vazar credencial ou dados de outro tenant.

### Fase G — Produção, qualidade e lançamento

**Objetivo:** produto confiável, bonito e operável diariamente.

- UX do Comando desktop/tablet/mobile, acessibilidade, teclado, estados vazios, erro e retomada;
- testes unitários, contrato, integração e e2e dos caminhos críticos;
- health, quota, custo, limites, rate limit, telemetria, alertas e dashboards técnicos restritos;
- backup, retenção, revogação, auditoria, segredo, tenant isolation e revisão de segurança;
- documentação de operação, status e procedimentos de incidente;
- publicação de uma release utilizável apenas após percurso real validado.

**Aceite:** uma pessoa não técnica consegue concluir os principais fluxos pelo Comando, em mais de um dispositivo, sem ver detalhes técnicos e sem depender de ajuda para encontrar resultado/aprovar ação.

## 6. Regras de construção

1. Cada capacidade nova começa pelo contrato de produto e política, não por uma tela.
2. Depois: dados/API → worker/adapter → teste → conversa → resultado/biblioteca → e2e. Tela especializada só se somar valor.
3. Nunca chamar mock, card cadastrado ou prompt gerado de “funcionalidade pronta”.
4. Nenhuma credencial no navegador, chat, log, commit ou MCP.
5. Nenhum gasto, publicação, mensagem externa, pagamento, exclusão, mudança de produção ou uso de identidade sem escopo e autorização apropriados.
6. Reusar/forkar componente maduro antes de criar motor próprio; curar licença e segurança antes de incorporar.
7. Não criar um painel por provider, skill ou agente. Capacidades ficam atrás da Orquestradora.
8. Não sacrificar qualidade visual: menos cards, tipografia calma, contraste, hierarquia e feedback claro; nenhum visual de MVP.
9. Preservar rotas e dados legados; melhorar por fluxo de negócio, não por decoração.
10. Antes de iniciar uma fase, registrar o que ela torna possível e os critérios objetivos para encerrá-la.

## 7. Medida real de sucesso

A Altum estará no rumo certo quando Savio puder dizer: “crie uma campanha para X usando meu personagem, faça os vídeos, a landing e o calendário; me mostre antes de publicar”, e receber — no mesmo fluxo — plano, perguntas mínimas, ativos reais, qualidade revisada, custo claro, aprovação contextual, resultados organizados e memória para melhorar a próxima campanha.

Ela estará pronta para produção quando esse mesmo princípio funcionar também para pesquisa, documentos, produtos digitais, operação comercial e extensões autorizadas, com segurança, evidência, recuperação e experiência consistente.
