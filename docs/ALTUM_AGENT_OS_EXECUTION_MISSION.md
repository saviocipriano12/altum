# Missão-mãe — Altum Agent OS completo

## Resultado esperado

O administrador usa a Altum como uma conversa única: descreve o resultado em linguagem normal e a plataforma planeja, cria, pede aprovações quando necessário, executa por conexões autorizadas, guarda o histórico e entrega o resultado. O administrador não escolhe modelos, endpoints ou agentes.

Na prática, a área administrativa deixa de ser uma coleção de telas técnicas. Ela tem uma porta principal — **Comando Altum** — e áreas de apoio claras para acompanhar trabalho, resultado, marca, integrações e segurança. O usuário pode continuar uma conversa em qualquer dispositivo sem perder a decisão, os arquivos ou o resultado gerado.

## Regra de conclusão

Um recurso só conta como pronto quando possui:

1. entrada simples no Comando Altum ou em uma tela comercial clara;
2. contexto de empresa e marca aplicado;
3. execução ou rascunho real, não apenas interface;
4. aprovação antes de custo, publicação, envio ou ação irreversível;
5. status, evidência, falha recuperável e resultado visível;
6. teste automatizado quando a regra pode ser testada sem serviços externos.

## Fluxos que precisam existir no produto final

### 1. Pedido simples vira resultado

Exemplo: “crie uma campanha de vídeo para minha oferta”. O Comando entende o objetivo, usa a marca e o contexto da empresa, apresenta um plano curto e cria os materiais. Se for necessário usar saldo, publicar ou contactar alguém, a aprovação aparece na mesma conversa. O resultado retorna ali com arquivo, versão e próximo passo — sem o usuário precisar escolher provider, modelo ou agente.

### 2. Arquivo ou ideia vira trabalho organizado

Exemplo: “analise esta planilha e me diga onde vender mais”. O arquivo continua privado, a Altum mostra o que conseguiu ler, cria uma missão rastreável e devolve análise, recomendações e tarefas. Ideias soltas podem ser salvas como ideia, projeto ou missão sem preencher formulários técnicos.

### 3. Mídia criativa é produzida e reaproveitável

Exemplo: “faça três anúncios realistas, um vídeo UGC e um carrossel”. A Altum gera briefing, roteiros, variações e jobs; roteia de forma invisível para a conexão disponível; acompanha a execução; guarda os ativos em biblioteca privada; e permite aprovar, baixar, revisar ou transformar em campanha.

### 4. Avatar é seguro e realmente utilizável

O dono do avatar dá consentimento, restringe usos e aprova o envio de referências. Depois, cria vídeos a partir de roteiro/cena e recebe versões revisáveis. Sem consentimento ou sem uma conexão compatível, a Altum explica o próximo passo em vez de simular que o clone foi criado.

### 5. Operação de negócio continua supervisionada

Pesquisa, CRM, landing page, campanha e execução no navegador podem ser solicitados em linguagem normal. A Altum prepara e mostra evidências; ações externas, financeiras, publicação e contato com terceiros ficam em rascunho até a aprovação apropriada.

## Marco 1 — Comando Altum como porta principal

- [x] Conversas persistentes por empresa e histórico recente.
- [x] Ideias registradas e missões criadas por linguagem normal.
- [x] Pedidos criativos já criam missão, projeto e conceitos iniciais.
- [x] Conceitos criativos aparecem na própria conversa, sem exigir troca de tela para revisão inicial.
- [x] Aprovações de missão aparecem na conversa quando vinculadas à missão.
- [x] Uma autorização explícita em linguagem natural (por exemplo, “pode gerar esse vídeo”) aprova somente a pendência mais recente daquela conversa e inicia o worker correspondente.
- [x] Anexos privados no chat, isolados por empresa e acessíveis por URL temporária autorizada.
- [x] Leitura local de texto, CSV, JSON e planilhas para enriquecer o contexto privado de uma missão.
- [x] Memória de ideias, decisões e conversas anteriores por empresa recuperada no Comando.
- [ ] Leitores para PDF, Word e PowerPoint, com extração revisável antes de uso externo.
- [ ] Resposta progressiva para missões longas, sem exigir troca de tela.
- [ ] Resumos automáticos de conversa, decisões e próximos passos.

## Marco 2 — Creative Engine real

- [x] Briefing, marca, conceitos, versões, aprovação e biblioteca de outputs.
- [x] Conexões de mídia simples para FAL, Replicate, LTX Cloud e HeyGen.
- [x] Jobs diretos FAL e Replicate, com consulta posterior de resultado.
- [x] Roteador criativo invisível: qualidade final, teste econômico, imagem ou avatar.
- [x] Fluxo criativo completo no Comando: escolher versão, aprovar, iniciar e acompanhar o resultado sem trocar de tela.
- [x] Central de resultados para rever vídeos e imagens gerados.
- [x] Worker protegido para atualização automática de jobs longos, com lock, retry exponencial e persistência privada quando o provider permite.
- [x] Conclusões de mídia assíncrona retornam como atualização na conversa de origem, além de aparecerem na biblioteca privada.
- [x] Pipeline Higgsfield de identidade: imagem-base com Soul 2 → vídeo Seedance 2.5, disparado por uma única aprovação e sem expor URLs privadas ao usuário.
- [ ] Integração direta de LTX Cloud e HeyGen.
- [ ] Carrossel renderizado, landing page rascunho, ebook/capa e pacote de campanha.
- [ ] Biblioteca de ativos com versões, download persistente, uso e métricas.

## Marco 3 — Avatar Studio autorizado

- [x] Consentimento explícito, escopo de uso, restrições e referências privadas.
- [x] Bloqueio de âncora sem imagem e voz autorizadas.
- [x] Aprovação auditável antes de compartilhar referências com provider.
- [x] Seleção automática de conexão compatível e aprovação no próprio perfil do avatar.
- [x] Execução de âncora Higgsfield Soul 2 com provider conectado; ainda requer teste de produção com uma referência autorizada antes de ser considerada validada operacionalmente.
- [ ] Roteiro, cena e vídeo de avatar com identificação sintética quando exigida.
- [ ] Revisão de qualidade: identidade, boca/voz, restrições e direito de uso.

## Marco 4 — Equipe de agentes e memória

- [x] Missões, tarefas, políticas, aprovações, memória e catálogo de capacidades.
- [x] Roteamento de texto com FreeLLMAPI como camada de laboratório.
- [ ] Perfis operacionais completos: Research, Revenue, Content, Ads, Analyst e Developer.
- [ ] Evidências, custo, retry e encerramento automático de cada tarefa.
- [ ] Memória consolidada de marca, decisões e resultados por empresa (recuperação de ideias, decisões e chats já funciona; falta consolidar marca e resultados em resumos duráveis).
- [ ] Agente cria um novo perfil de especialista somente como configuração revisável.

## Marco 5 — Área administrativa completa e simples

- [x] Comando, Missões, Aprovações, Conexões, Políticas, Marca, Creative e Avatar Studio.
- [ ] Unificar linguagem e ações para que detalhes técnicos fiquem em "Avançado".
- [ ] Central de resultados: ativos, campanhas, tarefas, custo e próximos passos.
- [ ] Pesquisa global e comandos rápidos.
- [ ] Revisão de navegação e experiência em computador e celular.

### Mapa administrativo final

| Área | Para que serve ao usuário | O que não deve aparecer de frente |
| --- | --- | --- |
| Comando Altum | pedir, conversar, aprovar e receber entregas | modelos, endpoints, filas e tokens |
| Missões | ver trabalhos em curso, bloqueios e resultados | detalhes internos de agentes sem necessidade |
| Central de resultados | localizar vídeos, imagens, documentos, páginas e campanhas | URLs temporárias ou dados de provider |
| Marca | guardar voz, oferta, público, referências e restrições | formato técnico de prompt |
| Avatar Studio | consentir, criar e revisar avatares/vídeos | chaves, IDs de provider e infraestrutura |
| Conexões | conectar serviços em linguagem simples e testar acesso | campos de URL/escopo para o uso comum |
| Aprovações | autorizar custo, publicação, contato ou dados sensíveis | ruído operacional sem decisão real |
| Políticas e Avançado | definir limites, equipe e auditoria | separado do uso diário |

## Marco 6 — Operação externa supervisionada

- [ ] Pesquisa web com fontes e evidências.
- [ ] CRM e prospecção com aprovação antes de contato externo.
- [ ] Campanhas e publicação somente como rascunho até aprovação.
- [ ] Browser assistido em sites externos, por sessão autorizada e política.
- [ ] Product Factory: oferta, landing page, arquivos e deploy como proposta aprovada.

## Ordem de trabalho imediata

### Fase A — fechar o ciclo que já está aberto

1. Fechar o ciclo de mídia: atualização automática e persistência privada de resultado.
2. Fazer o Comando mostrar progresso, falha recuperável e entrega sem troca de página.
3. Terminar a análise privada de anexos: PDF, Word e PowerPoint, além dos formatos já lidos localmente.
4. Consolidar memória de conversas, decisões, ideias e preferências de marca.

### Fase B — transformar pedidos em entregas comerciais

5. Renderizar carrosséis, capas, ebooks, landing pages e pacotes de campanha como outputs reais.
6. Criar Central de resultados única para localizar e reutilizar qualquer entrega.
7. Implementar perfis operacionais de pesquisa, conteúdo, anúncios, análise, receita e desenvolvimento, sempre invisíveis atrás do Comando.

### Fase C — vídeo, avatar e integrações especializadas

8. Integrar LTX Cloud e HeyGen quando as conexões estiverem autorizadas; validar o contrato de cada provider antes de executar.
9. Completar Avatar Studio: âncora autorizada, roteiro, vídeo, revisão e aviso de conteúdo sintético quando aplicável.
10. Ligar bibliotecas de vídeo/imagem a campanhas e métricas, sem expor detalhes de provider.

### Fase D — operação digital supervisionada

11. Pesquisa web com fontes, CRM/prospecção, rascunhos de campanha e publicações aprovadas.
12. Browser assistido com sessão autorizada e registros de ação.
13. Product Factory: oferta, landing page, arquivos e deploy apenas após proposta aprovada.
14. Revisão final de navegação, mobile, permissões, segurança, logs avançados e recuperação de falhas.

## Limites permanentes

- Nunca expor chaves no navegador, logs ou chat.
- Nunca publicar, enviar, gastar, excluir ou agir em conta externa sem aprovação aplicável.
- Nunca gerar clone/voz sem consentimento explícito e escopo compatível.
- Tratar FreeLLMAPI como conveniência pessoal; não como dependência única de produção.

## Regra de execução desta missão

- Não criar telas, cards ou “bases” que não fechem um fluxo real de ponta a ponta.
- Antes de iniciar outra frente, terminar o caminho principal que o usuário vê: pedido → plano → autorização necessária → execução → entrega recuperável.
- Interfaces de apoio só existem quando reduzem atrito do Comando; provider, modelo, endpoint e fila permanecem escondidos.

---

## Missão de execução integral — próximo ciclo

### Norte inegociável

Construir a Altum como uma **interface única de comando para trabalho digital**. O usuário conversa, anexa e aprova; a Altum decide o plano, agente, skill, MCP, app, browser, provider e modelo. Telas separadas existem para editar, comparar, acompanhar ou configurar resultados — nunca para obrigar o usuário a descobrir qual ferramenta deve usar.

```text
Pedido em linguagem natural
  → entendimento + contexto + memória
  → plano supervisionado
  → agentes e capacidades invisíveis
  → router de custo/qualidade/privacidade
  → execução rastreável
  → revisão automática + aprovação quando necessária
  → resultado reutilizável no chat, na biblioteca e nas áreas de negócio
```

### Experiência final que precisa ser verdadeira

1. **Um único Comando.** Histórico à esquerda, conversa no centro, contexto/processos/resultados à direita; funciona em desktop e celular; toda aprovação, progresso, falha e entrega aparece na conversa correta.
2. **Poderes extensíveis.** Skills, MCPs, apps, integrações, modelos locais e APIs podem ser conectados em Configurações. Depois de conectados, tornam-se capacidades da Altum; o usuário não precisa entrar neles para trabalhar.
3. **Mídia profissional.** A Altum produz imagem, vídeo, áudio, voz, avatar, carrossel, página, ebook e kit de campanha. Escolhe automaticamente a melhor rota disponível, priorizando local/gratuito quando atende à qualidade pedida e pedindo confirmação clara antes de consumo pago.
4. **Identidade consistente.** Pessoas autorizadas e personagens originais possuem identidade persistente, referências privadas, estilo, voz, restrições, direitos e versões. A Altum usa a mesma identidade entre imagens, vídeos e campanhas, sem alegar clonagem concluída antes de ela existir no provider.
5. **Operação de negócio incorporada.** CRM, prospecção, financeiro, projetos, campanhas, clientes e relatórios continuam como áreas especializadas da Altum, mas podem ser lidos e acionados pelo Comando com autorização adequada.
6. **Uso também pelo ChatGPT.** O MCP da Altum expõe capacidades úteis de forma escopada. Um pedido feito no ChatGPT pode criar, consultar ou entregar trabalho da Altum sem vazar credenciais ou ultrapassar políticas.

## Trilhas de entrega e critérios de aceite

### Trilha 1 — Comando e experiência conversacional

- [ ] Tornar o Comando a única entrada das capacidades novas: mídia, missão, pesquisa, agente, avatar, campanha, produto e automação.
- [ ] Streaming/progresso de tarefas longas, com estados humanos: entendendo, planejando, criando, revisando, aguardando decisão, concluído ou precisa da sua ajuda.
- [ ] Resumo automático de conversa, decisões, pendências e próximos passos por projeto.
- [ ] Pesquisa no histórico, projetos, ideias, arquivos e ativos; fixar, renomear, arquivar e retomar conversas.
- [ ] Anexar imagem, áudio, vídeo, URL, documento e planilha com prévia, origem, privacidade e limites claros.
- [ ] Perguntas de esclarecimento somente quando bloqueiam materialmente uma execução; nenhum formulário técnico no caminho comum.
- [ ] Interface responsiva: sidebar recolhível, composição acessível, atalhos, estados de carregamento e recuperação de falhas.

**Aceite:** uma pessoa pede algo complexo pelo chat e vê o plano, as decisões necessárias e o resultado sem precisar procurar uma tela ou escolher modelo.

### Trilha 2 — Orquestrador, agentes, skills e MCP

- [ ] Planejador transforma objetivo em grafo de tarefas com entradas, saídas, dependências, risco, orçamento e evidências.
- [ ] Perfis operacionais reais: Diretor/Planner, Research, Creative Director, Video Producer, Designer, Copywriter, Ads, SDR/Revenue, Analyst, Product Builder e Developer.
- [ ] Registro de skills com versão, fonte, permissões, instruções, capacidades e teste de saúde; importação de repositórios somente após curadoria/licença.
- [ ] Agente pode propor um especialista novo, mas a criação exige instruções, escopo, ferramentas permitidas, limites e revisão.
- [ ] MCP público HTTPS com OAuth, escopos mínimos, recursos e ferramentas de mídia/CRM/projeto; respostas com links seguros a resultados.
- [ ] Executor de browser supervisionado: sessão autorizada, domínio permitido, plano de ação, captura de evidência, parada em login/CAPTCHA/pagamento/publicação.
- [ ] Jobs duráveis: fila, retry exponencial, idempotência, cancelamento, retomada após deploy, dead-letter e notificação de mudança relevante.

**Aceite:** a Altum pode dividir um pedido em trabalho verificável, retomar após falha e explicar qual resultado cada agente entregou, sem fingir execução externa.

### Trilha 3 — Router universal de modelos e mídia

- [x] Primeiro roteador de mídia por capacidade, qualidade, economia e privacidade.
- [ ] Interface de adaptador única para texto, imagem, vídeo, áudio, avatar, edição, transcrição, embeddings e browser; nenhum provider deve ser escolhido por `if` espalhado pelo produto.
- [ ] Descoberta/health de conexão, capacidade real, quota, preço estimado, latência, política de dados e disponibilidade antes de escolher uma rota.
- [ ] Política humana simples: **Economizar**, **Equilibrado**, **Qualidade máxima** ou **Privacidade/local**. Internamente, registrar candidatos e motivo da decisão.
- [ ] Adaptadores validados para FreeLLMAPI (texto), FAL, Replicate, Higgsfield, LTX, HeyGen e executores locais; não marcar uma capacidade como funcional antes de validar contrato e um job real.
- [ ] Fallback controlado: tentar alternativa apenas se não aumentar gasto, exposição de dados ou risco sem nova aprovação.
- [ ] Medição de custo real/estimado por job, provider, campanha e empresa; limites diários/mensais e alerta antes de exceder.
- [ ] Avaliação pós-render: mídia existe, formato correto, duração/resolução esperada, risco de texto ilegível, aderência de marca/identidade e necessidade de nova tentativa.

**Aceite:** a mesma solicitação pode ser atendida por qualquer conexão válida, com a melhor rota explicada em linguagem humana e sem expor chave/modelo no chat.

### Trilha 4 — Creative Engine e biblioteca de resultados

- [x] Pedido de campanha no Comando já cria hipótese, funil, matriz de ativos, primeiro criativo e landing privada em rascunho, ligados à mesma missão.
- [x] Cada resultado de mídia agora nasce com estado de revisão auditável (manter ou descartar), separado da execução do provider.
- [x] A pessoa pode aprovar ou descartar o último resultado da própria conversa em linguagem natural, sem abrir a Central de Resultados.
- [x] O MCP da Altum pode consultar, criar, autorizar, acompanhar e registrar a revisão de renders autorizados, sempre dentro do tenant e escopos concedidos.
- [ ] Direção criativa completa: briefing, estratégia, público, proposta, ângulos, ganchos, roteiro, storyboard, cenas, CTA, canal e variações.
- [ ] Produção de imagem, edição de imagem, vídeo texto→vídeo, imagem→vídeo, referência→vídeo, UGC, voz/TTS, trilha, efeitos, legenda e corte social.
- [ ] Carrosséis renderizados, anúncios estáticos, capas, criativos de e-commerce, ebooks, PDFs, kits de lançamento e landing pages como artefatos reais, não texto de intenção.
- [ ] Biblioteca privada única: versão, fonte, briefing, direitos, identidade usada, provider, custo, tags, busca, download, reutilização e vínculo com campanha/projeto.
- [ ] Editor/revisor de artefato separado apenas quando faz sentido: comparar versões, cortar vídeo, trocar copy, aprovar quadro, baixar ou reutilizar.
- [ ] Templates e Remotion para entregas previsíveis (carrossel, vídeo de texto, apresentação, legenda), combinados a geradores para cenas originais.
- [ ] Pipeline de campanha: uma solicitação gera estratégia, matriz de criativos, ativos, landing, UTMs, plano de publicação e relatório de hipóteses.

**Aceite:** “lance uma campanha” entrega materiais reaproveitáveis e organizados, não apenas prompts ou uma coleção desconexa de imagens.

### Trilha 5 — Avatar e personagem de produção

- [x] Perfil privado, consentimento/direitos, referências, âncora de identidade e escolha automática de conexão compatível.
- [x] O Comando reconhece pedido de avatar/personagem, exige confirmação explícita de direitos antes de criar o perfil e aceita referências privadas enviadas junto do pedido confirmado.
- [x] A confirmação de direitos pode ocorrer em uma mensagem posterior, mas só resolve o rascunho privado mais recente da mesma conversa e empresa.
- [x] O Comando prepara a criação da âncora depois de validar referências, bloqueia duplicidade e apresenta a autorização de compartilhamento na própria conversa.
- [x] O worker devolve ao Comando o desfecho da âncora (pronta ou falha recuperável), sem exigir que o usuário procure o status no Avatar Studio.
- [ ] Criar pessoa autorizada e personagem original diretamente no Comando, com confirmação de direitos no próprio chat.
- [ ] Referência/âncora real por provider: upload seguro, ID externo privado, versão, expiração, revogação e sem reenvio desnecessário de arquivos.
- [ ] Folha de personagem: retrato, corpo inteiro, expressões, roupa, cenários, voz, pronúncia e poses aprovadas.
- [ ] Roteiro → voz → cena → vídeo de avatar; preservar primeiro frame/referência e adicionar identificação sintética quando exigida.
- [ ] Avaliação de fidelidade: rosto, cabelo, roupa, voz, lip-sync, restrições, tom e consentimento antes de escalar geração.
- [ ] Revogar identidade, referências e permissões, invalidando futuras execuções de maneira auditável.

**Aceite:** um avatar ou personagem aprovado pode aparecer com continuidade em múltiplos criativos, e qualquer uso fora do escopo é bloqueado antes de enviar referências ou renderizar.

### Trilha 6 — Conhecimento, pesquisa e execução digital

- [ ] Leitura privada de PDF, DOCX, PPTX, páginas, imagens com OCR e áudio/vídeo com transcrição; extração revisável e citações de origem.
- [ ] Pesquisa web com fontes, datas, síntese, comparação e separação explícita entre fato, inferência e recomendação.
- [ ] Base de conhecimento por empresa: documentos aprovados, marca, produto, perguntas frequentes, decisões e políticas; recuperação isolada por tenant.
- [ ] CRM/receita: leitura, qualificação, score, proposta, follow-up, agenda, CRM write e comunicação sempre condicionados a política/aprovação.
- [ ] Product Factory: pesquisa, oferta, nome, posicionamento, página, ebook/material, checkout e deploy em rascunho aprovado.
- [ ] Integrações de publicação, anúncios, analytics, e-commerce e mensageria através de APIs oficiais; browser somente como alternativa supervisionada.

**Aceite:** a Altum pode pesquisar, raciocinar sobre dados privados, criar um plano de operação e preparar mudanças externas com fontes e checkpoints claros.

### Trilha 7 — Administração existente, design system e operação

- [ ] Separar visualmente o **Agent OS** (Comando e configurações) da administração legada, sem remover Empresas, CRM, Financeiro, Projetos, Prospecção, Equipe, Campanhas e Relatórios.
- [ ] Modernizar essas áreas progressivamente por fluxos de trabalho, não por troca cosmética: cada página deve responder o que aconteceu, o que exige ação, onde configurar e qual resultado ocorreu.
- [ ] Design system escuro do Comando com tipografia, espaçamento, estados, cards e composição consistentes; telas legadas evoluem para linguagem comercial coerente sem quebrar rotas.
- [ ] Configurações em segunda camada: conexões, skills, MCP, marca, identidades, políticas, equipe, limites, auditoria e avançado.
- [ ] Acessibilidade, desempenho, empty states úteis, tratamento de erro, mobile, internacionalização e telemetria de UX.
- [ ] Migração gradual de links/telas antigas para resultados contextuais, preservando URLs e dados existentes.

**Aceite:** o administrador entende onde conversar, onde acompanhar resultado e onde configurar poderes; não vê uma grade de ferramentas técnicas para fazer trabalho diário.

### Trilha 8 — Segurança, dados, qualidade e lançamento

- [ ] Cofre de credenciais com rotação, expiração, escopo, auditoria de uso e bloqueio de retorno de segredo.
- [ ] Isolamento de tenant em coleções, storage, URLs temporárias e consultas; revisão das rules e testes de autorização.
- [ ] Políticas de risco, orçamento, publicação, mensagem, navegador, dados privados, identidade sintética e direitos autorais.
- [ ] Observabilidade: trace por missão/job, custos, métricas de qualidade, falhas, provider health, alertas e painel avançado.
- [ ] Testes unitários de regras, contratos de provider, fluxos e2e críticos, testes de regressão visual e checklist de segurança antes de expor MCP/browser.
- [ ] Deploy público com HTTPS, variáveis protegidas, workers/webhooks, backups, recuperação e documentação operacional.

**Aceite:** nenhuma capacidade poderosa depende de segredo no frontend, ignora escopo/consentimento ou falha silenciosamente sem uma forma de recuperação.

## Ordem obrigatória de implementação

1. **Fechar ciclo real de mídia:** adaptadores validados, job durável, polling/webhook, persistência privada, resultado no chat e biblioteca.
2. **Fechar identidade de produção:** perfil via Comando, âncora por provider, referência segura, vídeo de avatar/personagem, avaliação e revogação.
3. **Fechar campanha inteira:** estratégia → ativos → landing → aprovação → biblioteca → métricas.
4. **Fechar Comando como centro de trabalho:** progresso, memória/resumos, anexos completos, pesquisa e projetos recuperáveis.
5. **Abrir capacidades supervisionadas:** agentes especializados, browser, CRM, publicação, produto e integrações oficiais.
6. **Escalar e polir:** custo, qualidade, segurança, mobile, admin legada, MCP público e operação de produção.

## Anti-escopo

- Não criar mais páginas para selecionar modelo, provider, prompt ou agente no fluxo diário.
- Não declarar integração pronta apenas porque existe card de conexão ou interface visual.
- Não simular avatar, render, pesquisa, publicação ou navegador quando não houve execução/evidência.
- Não permitir que custo, publicação, mensagem, login externo, pagamento, exclusão ou uso de identidade extrapolem a política aprovada.
- Não redesenhar áreas legadas por estética enquanto o fluxo principal pedido → execução → entrega ainda estiver incompleto.
