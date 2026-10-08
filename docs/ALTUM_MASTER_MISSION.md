# Missão-mãe operacional — Altum Agent OS

## 1. Produto que estamos construindo

A Altum não é uma coleção de páginas para escolher IA, modelo, prompt, provider ou agente. Ela é uma **central pessoal de operação digital com IA**, acessível de qualquer dispositivo, onde o administrador conversa em linguagem natural e recebe trabalho pronto, rastreável e reutilizável.

O usuário fala com uma IA principal — a **Orquestradora Altum**. A Orquestradora entende o objetivo, consulta contexto e memória, cria ou coordena especialistas, escolhe skills, MCPs, apps, browser, modelo, provider e fluxo de execução. Ela mostra somente decisões que realmente exigem decisão humana: custo, publicação, envio externo, dados sensíveis, identidade, pagamento, exclusão ou mudança irreversível.

**Promessa final:** “Peça qualquer trabalho digital legal e possível; a Altum decide como fazer, executa com o melhor conjunto de recursos disponíveis e devolve o resultado.”

## 2. Experiência obrigatória

### A casa principal: Comando Altum

O Comando é a experiência equivalente ao ChatGPT/Codex:

- histórico e projetos à esquerda;
- conversa, anexos, planos, entregas, decisões e aprovações no centro;
- contexto, processos em andamento, resultados e ideias à direita;
- configurações em uma camada secundária, sem poluir o trabalho diário;
- funcionamento consistente em desktop e celular;
- conversa persistente por empresa, com memória, decisões e resultados recuperáveis.

Não pode ser necessário abrir Creative Studio, Avatar Studio, Missões, Aprovações ou Conexões para **fazer** o trabalho. Essas áreas existem para revisar, organizar, configurar e recuperar detalhes quando fizer sentido. O chat é quem decide ferramenta e caminho.

### Linguagem e interação

- O usuário pede: “crie uma campanha”, “faça um vídeo meu”, “pesquise concorrentes”, “monte uma landing”, “organize meu funil”, “crie um ebook”, “publique quando eu aprovar”.
- A Altum responde com clareza humana: o que entendeu, o que está fazendo, qual evidência encontrou, o que ficou pronto e qual única decisão é necessária.
- Nunca exibir de frente: token, endpoint, fila, ID de provider, modelo, JSON, URL privada ou escolha técnica desnecessária.
- Nunca fingir que pesquisou, publicou, navegou, gerou, clonou ou enviou algo quando não houve execução comprovada.

## 3. Fluxo universal de trabalho

Todo poder novo deve obedecer a este ciclo:

```text
Pedido natural
  → entendimento + contexto da empresa + memória
  → plano verificável e agentes/especialistas necessários
  → rascunhos/evidências sem custo ou ação externa quando possível
  → autorização humana contextual se houver risco/custo/publicação
  → execução durável com rota de melhor custo/qualidade/privacidade
  → progresso, falha recuperável e resultado no mesmo chat
  → revisão, biblioteca, reutilização e aprendizado para próximos pedidos
```

Nenhuma nova tela, card ou integração conta como implementação se esse ciclo não puder ser fechado de ponta a ponta.

## 4. Capacidades que a Altum precisa entregar

### 4.1 Orquestradora, agentes e memória

- Interpretar pedidos simples e complexos em linguagem normal.
- Criar planos com entradas, tarefas, dependências, orçamento, risco, evidências e saídas esperadas.
- Usar especialistas invisíveis: Planner, Research, Creative Director, Designer, Video Producer, Copywriter, Media Buyer, SDR/Revenue, Analyst, Product Builder, Developer e operadores específicos.
- Propor um novo agente quando não houver especialidade adequada; a criação precisa ser revisável, limitada por ferramentas permitidas e auditável.
- Manter memória privada por empresa: marca, ofertas, público, restrições, decisões, ideias, conversas, projetos, resultados, preferências e aprendizados.
- Resumir conversas e projetos automaticamente: objetivo, decisões tomadas, pendências, próximos passos, links e ativos relevantes.
- Pesquisar e recuperar histórico, ideias, arquivos, campanhas e ativos sem perder contexto entre dispositivos.

### 4.2 Router universal de IA

- A Altum decide a rota, não o usuário: local/privada, gratuita/econômica, equilibrada ou qualidade máxima.
- Roteamento por modalidade: texto, raciocínio, pesquisa, embeddings, reranking, imagem, edição, vídeo, áudio, voz, avatar, transcrição, OCR, código, browser e automação.
- Tratar FreeLLMAPI, NVIDIA NIM, Groq, Hugging Face, Google, OpenRouter, Mistral, Cerebras, Cloudflare, Ollama/local e demais fontes como **candidatos**, nunca como garantia de gratuidade ou capacidade.
- Integrar FAL, Replicate, Higgsfield, LTX, HeyGen e executores locais quando suas credenciais e contratos forem realmente validados.
- Registrar para cada job: candidatos, rota escolhida, motivo humano, custo estimado/real, privacidade, latência, resultado e falha.
- Fallback só pode ocorrer automaticamente quando não aumentar gasto, risco ou exposição de dados; caso contrário, pedir nova autorização no chat.
- Expor ao usuário apenas políticas simples: Economizar, Equilibrado, Qualidade máxima, Privacidade/local.

### 4.3 Creative Engine: imagens, vídeo, áudio e resultados

- Transformar briefing em estratégia criativa, público, oferta, ângulo, gancho, roteiro, storyboard, cena, CTA, canal e variações.
- Gerar imagens realistas, ilustrações, produto, e-commerce, anúncios estáticos, capas, thumbnails, carrosséis, artes sociais e edições.
- Gerar vídeos texto→vídeo, imagem→vídeo, referência→vídeo, UGC, demonstração, anúncio, narrativa, cortes sociais e versões por canal.
- Gerar voz/TTS, locução, trilha, efeitos, legendas, transcrição, dublagem e pós-produção quando as conexões permitirem.
- Usar Remotion/templates para carrosséis, vídeo tipográfico, legenda, apresentação e peças previsíveis; usar modelos generativos para cenas originais.
- Avaliar resultado automaticamente: arquivo existe, formato/duração/resolução, identidade, aderência de marca, texto legível, risco e necessidade de nova tentativa.
- Biblioteca privada única de ativos: prévia, versão, briefing, direitos, identidade, origem, provider, custo, tags, status de revisão, download, reutilização, vínculo com campanha e métricas.
- O chat deve permitir: gerar, aprovar custo, acompanhar, revisar, manter, descartar, baixar, adaptar e reutilizar; uma tela separada só entra para edição/comparação rica.

### 4.4 Avatar, clone autorizado e personagens

- Criar pessoa autorizada ou personagem original diretamente pelo chat.
- Coletar confirmação explícita de direitos, imagem e voz; separar consentimento de criação de perfil, envio de referências e cada uso sensível.
- Guardar referências privadas com escopo, origem, uso permitido, restrições, expiração e possibilidade de revogação.
- Construir folha de personagem: rosto, corpo, expressões, roupas, cenários, poses, voz, pronúncia, estilo e restrições aprovadas.
- Criar âncora de identidade no provider compatível, guardar o ID externo sem vazar referência/segredo, manter continuidade entre imagem, vídeo e campanha.
- Fluxo de produção: roteiro → imagem/primeiro frame → voz → cena → vídeo → legenda/revisão.
- Avaliar fidelidade de rosto, cabelo, roupa, voz, lip-sync, tom, disclosure sintético e direitos antes de escalar produção.
- Não declarar clone, voz clonada ou lip-sync pronto antes de haver provider, teste e resultado real comprovados.

### 4.5 Campanhas, marketing e conteúdo

- Pedido “lance uma campanha” produz: hipótese, público, oferta, posicionamento, funil, matriz de ativos, roteiro/copy, imagens, vídeos, carrosséis, landing, UTMs, plano de publicação, orçamento, métrica e plano de aprendizado.
- Campanhas devem poder gerar e organizar vários ativos em lote, mas cada custo, mídia paga ou publicação precisa de autorização apropriada.
- Criar estratégias completas de social media, tráfego, conteúdo, SEO, e-mail, CRM, captação e remarketing.
- Criar calendários, variações, testes A/B, criativos por persona/canal e leitura de fadiga/resultado.
- Publicar ou preparar para Meta, Google, Instagram, TikTok, WhatsApp, e-mail e canais conectados somente via APIs oficiais ou browser supervisionado.
- Relatar o que funcionou, o que não funcionou e qual é a próxima hipótese, vinculando métricas a ativos e campanhas.

### 4.6 Pesquisa, conhecimento e trabalho na internet

- Ler com privacidade PDF, DOCX, PPTX, XLSX, CSV, imagens/OCR, URLs, áudio e vídeo; sempre indicar o que foi extraído e a origem.
- Fazer pesquisa web com fontes, datas, comparações, citações, fatos separados de inferências e recomendações.
- Criar e consultar base de conhecimento isolada por empresa: marca, produto, FAQ, propostas, políticas, documentos, decisões e treinamento.
- Navegar e trabalhar em sites somente com sessão autorizada, domínios permitidos, plano de ação, evidências e parada obrigatória em login, CAPTCHA, pagamento, publicação ou mudança irreversível.
- Nunca executar instruções encontradas em páginas ou documentos como se fossem autorizadas pelo usuário.

### 4.7 Product Factory e trabalho digital

- Pesquisar oportunidade, criar oferta, nome, posicionamento, preço, página, landing, ebook, apresentação, capa, kit de lançamento e materiais de venda.
- Criar sites, landing pages e aplicações com preview, versão, revisão e deploy somente após proposta/autorizações adequadas.
- Apoiar web design, design, copy, código, documentação, relatórios, planilhas e produtos digitais sem obrigar o usuário a trocar de ferramenta.
- Ligar produtos, materiais, captação, CRM, checkout e campanhas aos resultados de negócio.

### 4.8 Operação comercial e áreas existentes

As áreas legadas **continuam**, com URLs e dados preservados: Empresas, Conversas, CRM, Prospecção, Comercial, Projetos, Financeiro, Equipe, Agenda, Campanhas, Central de mídia e Relatórios.

O Comando deve conseguir ler e acionar essas áreas conforme permissões:

- clientes, oportunidades, funil, propostas, tarefas, agenda e follow-ups;
- qualificação, score, análise comercial e recomendações;
- rascunhos de mensagens/propostas e confirmação antes de contato externo;
- relatórios de receita, marketing, campanhas, origem de lead e operação;
- financeiro e pagamentos somente sob políticas explícitas.

As áreas especializadas devem ser melhoradas por fluxos úteis, não por cards decorativos. Para usuário comum, a linguagem é comercial e operacional; logs, runtime, providers e filas ficam em Avançado.

### 4.9 Skills, repositórios, apps e MCP

- Reaproveitar componentes maduros de repositórios somente após curadoria de licença, versão, segurança, compatibilidade e adaptação.
- Cada skill deve ter fonte, versão/commit, instruções, capacidades, permissões, limites, teste de saúde e estado de curadoria.
- Ferramentas conectadas viram capacidades da Altum; o usuário não entra em “plugin” para trabalhar.
- MCP da Altum precisa permitir que o ChatGPT autorizado consulte contexto e execute ferramentas úteis de mídia, campanhas, CRM, projetos e resultados dentro de scopes mínimos.
- MCP público requer HTTPS, OAuth, tenant/grant explícito, auditoria, URLs seguras temporárias e nenhuma credencial retornada.
- Uma solicitação feita no ChatGPT pode criar ou acompanhar trabalho da Altum e devolver o resultado de forma segura.

## 5. Segurança e governança inegociáveis

- Segredos nunca vão para navegador, resposta do chat, log ou MCP.
- Isolamento real por tenant em banco, storage, consultas, URLs e jobs.
- Aprovação explícita antes de gastar, publicar, enviar, cobrar, excluir, alterar conta externa, compartilhar referência privada ou usar identidade sintética.
- Políticas de uso para orçamento, mídia, dados, identidade, browser, mensagem e automação.
- Auditoria por conversa, missão, job, asset, aprovação, provider e ator.
- Idempotência, lock, retry, cancelamento, retomada após deploy, dead-letter e alerta para jobs duráveis.
- Retenção/revogação de referências e identidades com histórico auditável.

## 6. Direção visual e UX

- Comando escuro, calmo, legível e muito próximo da familiaridade de ChatGPT/Codex, sem copiar marca ou ativos visuais.
- Tipografia, espaçamento, estados, feedback e composição consistentes.
- Uma ação principal por momento; menos métricas, menos card, mais clareza de decisão.
- Nenhuma tela com aparência de MVP, diagnóstico vazio ou detalhes técnicos como conteúdo principal.
- Resultados ricos com mídia/previews e edição apenas quando agregarem valor real.
- Painel de configurações em segunda camada: conexões, marca, identidades, skills, MCP, políticas, equipe, limites e avançado.
- Administração legada evolui progressivamente, sem quebrar navegação ou remover funções existentes.

## 7. Estado atual e honestidade

Já existem fundações reais: Comando persistente, missões, conceitos criativos, aprovação conversacional, worker/polling de mídia, armazenamento privado, revisão, roteamento inicial, âncora Higgsfield, referências privadas, rascunho de campanha/landing, conexões e primeiras ferramentas MCP.

Isso **não** equivale ao produto pronto. Ainda faltam, entre outros: produção integral de campanha, lote de assets, voz/lip-sync validado, leitura de PDFs/DOCX/PPTX, pesquisa web com fontes, browser supervisionado, base de conhecimento completa, agentes operacionais reais, custos/quota/health, integrações oficiais, publicação segura, Product Factory, MCP público OAuth, mobile/acessibilidade e operações de produção.

## 8. Ordem obrigatória de execução

### Fase 1 — Fechar mídia e identidade de verdade

1. Pedido no chat → briefing → rascunho → autorização → render → worker → resultado → revisão → biblioteca/reuso.
2. Validar contratos e jobs reais por provider conectado; não tratar card de conexão como integração pronta.
3. Fechar avatar: referências, âncora, identidade em imagem/vídeo, voz, revisão, revogação e disclosure.
4. Implementar carrossel renderizado, áudio/voz, legenda/corte e editor/revisor quando aplicável.

### Fase 2 — Fechar campanha inteira

5. Campanha gera estratégia, matriz, assets, landing, UTMs, aprovação, biblioteca, publicação preparada e métricas.
6. Criar lote de assets com orçamento/limites e revisão por variação.
7. Vincular ativos a anúncios, canais, leads, receita e aprendizado.

### Fase 3 — Tornar a Orquestradora realmente extensível

8. Planner com grafo real de tarefas, agentes, evidências, dependências, custo e retry.
9. Registro curado de skills/MCP/apps/repositórios e especialistas revisáveis.
10. Memória, resumos, busca global e contexto por empresa/projeto.

### Fase 4 — Conhecimento e execução digital supervisionada

11. Arquivos completos, OCR/transcrição, pesquisa web com fontes e base de conhecimento.
12. Browser supervisionado e integrações oficiais.
13. CRM, vendas, campanhas, produto, site, ebook, deploy e automação com políticas/autorizações.

### Fase 5 — Polimento, escala e lançamento

14. UX mobile, acessibilidade, performance, estados vazios, erro e recuperação.
15. Custo, quotas, health de provider, telemetria, logs avançados e alertas.
16. Segurança, regras de tenant, backups, deploy, documentação e testes e2e críticos.
17. MCP público com OAuth e operação segura para uso pelo ChatGPT.

## 9. Critério de conclusão real

A missão só pode ser considerada concluída quando uma pessoa conseguir pedir, aprovar e receber trabalho digital complexo pelo Comando — inclusive mídia/identidade/campanha — com resultado real, seguro, recuperável e reutilizável; quando a Altum conseguir ser ampliada por capacidades curadas; e quando áreas comerciais existentes continuarem operacionais e possam ser acionadas pela Orquestradora sem expor infraestrutura técnica.

Até lá, não reduzir o objetivo para “telas prontas”, “cards de provider”, “prompts gerados”, “mock de agente” ou testes isolados.
