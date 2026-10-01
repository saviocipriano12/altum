# Missão Altum — operação comercial com IA de ponta a ponta

Status: ativa  
Escopo principal: área do cliente  
Regra de conclusão: uma capacidade só conta como pronta quando funciona com dados reais, autorização correta, testes e verificação após publicação.

## Resultado final

A Altum deve permitir que uma empresa configure sua operação, conecte canais, organize equipe, receba e distribua leads, converse com clientes por texto, voz e mídia, avance oportunidades, agende, proponha, venda, acompanhe receita e tome decisões com IA — sem depender de telas técnicas ou processos externos para fechar o ciclo.

## Princípios que não podem ser negociados

- Nunca inventar produto, serviço, preço, estoque, prazo, política ou condição.
- A IA responde ao que o cliente disse antes de tentar vender ou qualificar.
- Uma pergunta contextual por vez; nada de formulário disfarçado de conversa.
- Configuração visível precisa alterar o comportamento real do runtime.
- Vendedor acessa apenas o que seu escopo permite; gestor e owner seguem regras explícitas.
- Ações sensíveis têm autorização, confirmação, idempotência e auditoria.
- Presets são modelos de implantação, não fatos comerciais do tenant.
- Nenhum fluxo crítico pode terminar em tela sem ação, estado falso ou botão decorativo.
- Compatibilidade, privacidade, isolamento entre tenants e recuperação vêm antes de velocidade.

## Fase A — estabilizar a IA existente

### A1. Coordenador de conversa

- [x] Debounce configurável para agrupar mensagens curtas do mesmo turno.
- [x] Identificar e ignorar trabalho superado por mensagem mais nova.
- [x] Lock por tenant e conversa para impedir respostas concorrentes.
- [ ] Testar concorrência e recuperação de lock expirado com Firestore.
- [x] Remover ativações redundantes do worker sem perder resiliência, usando `after()` e cron de recuperação.
- [ ] Medir tempo entre última mensagem do cliente e início da resposta.

Aceite: `Oi`, `boa noite` e mensagens enviadas em sequência geram uma única resposta coerente.

### A2. Política conversacional

- [x] Classificar saudação, relação, correção, pedido de conversa, pergunta e pedido de produto.
- [x] Bloquear pitch imediato após saudação, correção ou pedido de conversa.
- [x] Garantir continuidade sem repetir pergunta respondida. Perguntas obrigatórias cobertas não reiniciam mais pelo primeiro item, respostas semelhantes passam por resgate e apenas uma pergunta real fica registrada como pendente.
- [x] Limitar a uma pergunta por turno e consolidar a resposta em uma única mensagem, salvo mídia ou checkout necessário.
- [x] Adaptar condução a atendimento, SDR, vendedor, consultor, suporte e pós-venda, com configuração persistida e proteção também no fallback.
- [x] Separar conversa social, descoberta, recomendação, objeção e fechamento. O plano operacional mantém intenção, objetivo da resposta e estágio explícitos, com proteção por papel antes de avançar o funil.

Aceite: a conversa parece humana e muda de estratégia conforme o papel e o momento.

### A3. Verdade comercial e grounding

- [x] Retirar ofertas/preços genéricos do runtime.
- [x] Impedir recomendação sem campanha real ou documento de catálogo real.
- [x] Validar disponibilidade, estoque, preço, mídia e checkout antes de oferecer ou concluir compra.
- [x] Informar incerteza e escalar quando a base não sustenta a resposta. Perguntas transacionais sobre preço, estoque, pagamento, entrega e políticas agora exigem evidência recuperada; sem fonte, a IA assume a incerteza e solicita confirmação humana.
- [x] Registrar e exibir no log interno as fontes de conhecimento, catálogo e campanha consultadas na resposta.

Aceite: toda afirmação comercial importante pode ser ligada a um dado do tenant.

### A4. Voz

- [x] Preservar o modo `always` salvo na configuração.
- [x] Gerar fonte de alta qualidade e converter para OGG/Opus nativo do WhatsApp.
- [x] Preparar texto para fala e usar direção de voz em português brasileiro.
- [x] Permitir ouvir e comparar todas as vozes antes de ativar.
- [x] Mostrar se a amostra também está pronta para envio nativo no WhatsApp.
- [x] Validar síntese real com OpenAI e conversão para OGG/Opus no backend.
- [ ] Testar todas as vozes na UI e explicar diferenças sem termos técnicos.
- [ ] Validar preview, envio real, duração, tamanho, waveform e playback mobile.
- [ ] Medir custo por minuto e oferecer política econômica por tenant.
- [ ] Tratar quota, credencial e conversão com mensagem útil e sem falso sucesso.

Aceite: o áudio chega como mensagem de voz, soa natural e pode ser ouvido antes da ativação.

### A5. Multimodal

- [x] Transcrever áudio e preservar intenção.
- [x] Entender imagem, quadro de vídeo e documento recebidos.
- [x] Comparar imagem com catálogo sem afirmar igualdade em baixa confiança.
- [x] Enviar foto, vídeo ou documento real solicitado pelo cliente.
- [x] Bloquear mídia sem permissão, URL inválida, item indisponível, sem estoque ou marcada como não utilizável; avisar cliente e equipe se o envio falhar.

## Fase B — configuração e avaliação da IA

- [x] Organizar a configuração em cinco passos navegáveis: papel, comportamento, conhecimento, canais/voz e teste.
- [x] Mover provider, modelo, custos, runtime e auditoria técnica para blocos opcionais ou Avançado.
- [x] Alinhar o simulador ao mesmo roteador, papel, política conversacional e plano operacional da produção.
- [x] Mostrar prontidão, pendências e impacto de cada ajuste. O checklist informa estado, consequência operacional e atalho de correção para ativação, base, handoff, voz e qualidade.
- [x] Normalizar configurações antigas com defaults compatíveis, incluindo papel vendedor para contas já existentes.
- [x] Criar cenários por papel e por segmento, com regressão bloqueando release. A bateria cobre recepção, SDR, vendas, consultoria, suporte, pós-venda e perfis de agência/clínica, além de conversa, grounding, handoff e multimodal.
- [ ] Avaliar naturalidade, relevância, grounding, repetição, handoff, custo e latência.

## Fase C — pessoas, times, canais e distribuição

### Pessoas e times na mesma página

- [x] Criar, editar, desativar e excluir pessoa na página unificada de times e pessoas.
- [x] Remover de time e transferir carteira antes da exclusão.
- [x] Proteger o owner e registrar auditoria administrativa.
- [x] Editar papel, capacidades e escopo de acesso.
- [x] Vincular canal de forma exclusiva a vendedor/time quando configurado.
- [x] Exibir online, ausente, offline e última atividade com heartbeat e janela de expiração.

### Distribuição

- [x] Trocar responsável de um lead/conversa.
- [x] Selecionar vários registros e atribuir a uma pessoa específica.
- [x] Distribuição igualitária somente entre vendedores elegíveis.
- [x] Aleatório opcional, nunca como única opção.
- [x] Considerar presença, escala, capacidade, time e indisponibilidade.
- [x] Nunca distribuir automaticamente leads para gestor ou papel não vendedor.
- [x] Mostrar critério, resultado, histórico e desfazer quando seguro. Cada operação registra modo, destino, estado anterior e registros afetados; a UI permite desfazer por 15 minutos se o ownership não mudou depois.
- [x] Sincronizar ownership em conversa, cliente/oportunidade, agenda, propostas e financeiro; relatórios leem a propriedade consolidada.

## Fase D — ciclo comercial e experiência

- [ ] Auditar cada rota da área do cliente e registrar entrada, ação, saída e próximo passo.
- [ ] Fechar captação → atendimento → qualificação → oportunidade → agenda → proposta → venda/perda → receita/retensão.
- [x] Tornar filtros de Conversas recolhíveis e persistentes por empresa, preservando critérios e estado do painel.
- [ ] Dar prioridade de espaço à lista e à conversa em desktop e mobile.
- [ ] Reduzir Configurações a acessos principais e ações; técnico fica em segunda camada.
- [ ] Remover cards, métricas e textos sem decisão ou ação.
- [ ] Garantir loading, vazio, erro, confirmação, acessibilidade e linguagem por perfil.

### Perguntar a Altum

- [x] Consultar dados autorizados de clientes, conversas, agenda, funil, campanhas, catálogo e receita, respeitando carteira pessoal ou visão da empresa.
- [x] Responder com período, origem e horário da leitura dos dados.
- [x] Não inventar quando a consulta não sustenta a resposta; ausência de preço/estoque aparece como não informada e existe fallback calculado sem modelo.
- [x] Sugerir ações; a superfície de consulta não executa mudanças sem ferramenta e política de aprovação.

## Fase E — MCP administrador operacional

- [ ] Ferramentas tipadas para pipeline, leads, responsáveis, usuários e times.
- [ ] Ferramentas para canais, SLA, configurações, automações e base de conhecimento.
- [ ] Ferramentas para agenda, proposta, comissão e conversa/resposta.
- [ ] `read-before-write`, `dry-run`, idempotência e retorno estruturado.
- [ ] RBAC por capability, confirmação de alto impacto e auditoria completa.
- [ ] Testar a ordem “configure minha operação inteira” em tenant controlado.

## Fase F — próximo nível

- [ ] Runtime dividido em compreender, planejar, responder, executar e aprender.
- [ ] Memória curta da conversa, memória comercial do lead e conhecimento do tenant separados.
- [ ] Ferramentas com contratos, políticas de aprovação e recuperação de falha.
- [ ] Roteamento de modelos por tarefa, custo e complexidade.
- [ ] Automação durável para follow-up, proposta, reunião, pós-venda e reativação.
- [ ] Inteligência de receita: risco, prioridade, próximo passo, coaching e previsão explicável.

## Fase F2 — Commerce Intelligence, começando pela Shopify

Objetivo: a Altum deixa de apenas importar dados da loja e passa a compreender e operar a jornada comercial completa do e-commerce, usando a Shopify como primeira integração de referência e um contrato comum para Nuvemshop, WooCommerce, VTEX, Tray e Loja Integrada.

### Fonte de verdade e visão 360 da loja

- [x] Conector comum para produtos, pedidos e rastreio, com Shopify, Nuvemshop e WooCommerce.
- [x] OAuth Shopify, HMAC, sincronização inicial, webhooks idempotentes e credenciais isoladas por tenant.
- [ ] Sincronizar catálogo completo: produto, variante, SKU, imagens, preço, preço comparativo, coleção, tags, status e disponibilidade por canal.
- [ ] Sincronizar estoque por variante e local, incluindo reservado, disponível, sem estoque e política de continuar vendendo.
- [ ] Sincronizar clientes, endereços, consentimento de marketing e histórico de pedidos sem expor dados além do necessário.
- [ ] Sincronizar pedido, pagamento, desconto, frete, fulfillment, cancelamento, reembolso, devolução e rastreio em uma jornada única.
- [ ] Detectar atraso, divergência de estoque, pedido parado, pagamento pendente e falha de fulfillment com alerta acionável.
- [ ] Mostrar saúde da integração, último evento, cobertura real, atraso da sincronização e botão de reparar sem falso sucesso.

### IA que conhece o e-commerce

- [ ] Injetar catálogo, variantes, estoque, preço, políticas, pedido e status de entrega como fontes verificadas do runtime.
- [ ] Responder dúvidas sobre produto, tamanho, cor, compatibilidade, disponibilidade, prazo, frete, troca e pedido sem inventar.
- [ ] Cruzar foto enviada pelo consumidor com imagens das variantes e recomendar apenas itens realmente disponíveis.
- [ ] Enviar imagem, vídeo, página do produto, carrinho ou checkout correto para a variante escolhida.
- [ ] Reconhecer o cliente por telefone/e-mail com regras de privacidade e recuperar somente os pedidos que ele pode consultar.
- [ ] Separar dúvida pré-venda, suporte ao pedido, troca/devolução, retenção e recompra para usar o papel certo da IA.
- [ ] Fazer handoff com resumo, pedido, itens, rastreio, sentimento, risco e próximo passo já preenchidos.

### Automação da jornada do comprador

- [x] Motor inicial de ações comerciais, confirmação de compra, pagamento, rastreio e recompra com modo shadow/canário.
- [ ] Confirmar pedido e pagamento no canal autorizado, com idempotência e preferência do cliente.
- [ ] Enviar atualização de fulfillment e código/link de rastreio apenas quando o dado oficial mudar.
- [ ] Avisar atraso ou exceção de entrega antes que o cliente precise perguntar.
- [ ] Recuperar checkout/carrinho abandonado dentro das regras do canal, consentimento e janela permitida.
- [ ] Criar cadências de pós-compra: orientação de uso, satisfação, avaliação, suporte e recompra.
- [ ] Prever janela provável de recompra por produto e comportamento, sem disparo automático fora da política do tenant.
- [ ] Recomendar cross-sell, upsell e bundles por afinidade, margem, estoque e histórico — nunca apenas por popularidade.
- [ ] Reativar clientes inativos com motivo, segmento, limite de frequência, opt-out e medição incremental.
- [ ] Criar tarefas para humano quando houver alto valor, reclamação, risco de churn, chargeback ou exceção operacional.

### Operação, receita e aprendizado

- [ ] Unificar consumidor, conversa, pedido e oportunidade em um Customer 360 sem duplicar contatos.
- [ ] Medir receita por conversa, campanha, vendedor, automação e recomendação da IA.
- [ ] Exibir funil de e-commerce: visita → conversa → carrinho → checkout → pagamento → fulfillment → entrega → recompra.
- [ ] Criar segmentos vivos: primeira compra, recorrente, VIP, risco de churn, abandono, produto consumível e alta intenção.
- [ ] Permitir que “Perguntar à Altum” responda sobre estoque parado, produtos campeões, LTV, recompra, atraso e receita perdida.
- [ ] Dar ao MCP ferramentas seguras para consultar loja/pedido/estoque e preparar ações; alterações e mensagens respeitam aprovação e auditoria.
- [ ] Registrar decisão, evidência, mensagem, resultado, receita e opt-out para cada ação do agente de comércio.
- [ ] Avaliar incrementalidade com grupo de controle, evitando atribuir à IA vendas que aconteceriam de qualquer forma.

### Arquitetura multi-commerce

- [x] Evoluir `CommerceProvider` para capacidades declaradas por provedor, evitando prometer paridade inexistente. Cada integração agora publica matriz `available`, `partial`, `planned` ou `unsupported` para catálogo, variantes, estoque, clientes, pedidos, pagamento, fulfillment, rastreio, reembolso, devolução, abandono, webhook e API.
- [ ] Manter um modelo canônico de produto, variante, estoque, cliente, pedido, fulfillment, devolução e consentimento.
- [ ] Usar webhooks como caminho principal e reconciliação periódica como recuperação de eventos perdidos.
- [ ] Aplicar cursor, backfill, rate limit, retry, dead-letter, deduplicação e observabilidade por conexão.
- [ ] Começar pela Shopify; depois alcançar paridade comprovada em Nuvemshop e WooCommerce e ampliar VTEX, Tray e Loja Integrada.
- [ ] Homologar em loja de teste: catálogo, estoque, pedido, pagamento, fulfillment, rastreio, cancelamento, reembolso, abandono e recompra.

Aceite: a IA consegue atender um comprador do primeiro contato ao pós-venda usando fatos atuais da loja; a operação vê o impacto em receita; mensagens e ações são consentidas, auditáveis, idempotentes e recuperáveis; nenhuma plataforma é anunciada como completa sem homologação real.

## Fase G — publicação e prova

- [ ] Lint, typecheck, build, testes unitários, integração e regras.
- [ ] Canary/feature flag para mudanças de comportamento.
- [ ] Smoke tests reais em WhatsApp, Instagram e chat do site.
- [ ] Métricas: latência, custo, resolução, handoff, alucinação, repetição, satisfação e conversão.
- [ ] Alertas acionáveis, rollback documentado e verificação pós-deploy.
- [ ] Conferir isolamento entre tenants, logs, retenção e acesso a dados.

## Evidência obrigatória por entrega

Cada item concluído deve registrar:

1. arquivos e contratos alterados;
2. comportamento anterior e comportamento novo;
3. testes automatizados executados;
4. validação manual ou de integração;
5. risco e estratégia de rollback;
6. impacto para clientes existentes;
7. estado de publicação.

## Estado atual desta execução

- Coordenador de turnos criado com debounce, supersessão, lock por conversa, execução após resposta HTTP e recuperação por cron.
- Revalidação do turno adicionada antes de handoff, texto e áudio para impedir resposta obsoleta.
- Modo de voz `always` corrigido no salvamento e exposto na interface.
- Preview de voz agora compara opções e informa se o arquivo está pronto como áudio nativo do WhatsApp.
- Síntese real validada com `gpt-4o-mini-tts`: reprodução em MP3 e entrega em OGG/Opus.
- Ofertas genéricas removidas do runtime; recomendação exige catálogo/campanha real.
- Simulador alinhado ao contrato do runtime.
- Testes focados, suíte oficial da IA, typecheck e build de produção aprovados.
- Gate de qualidade ampliado para todos os papéis da IA, segmentos e limites conversacionais, com cobertura visível por capacidade na interface.
- OAuth do MCP alinhado ao catálogo completo de scopes; conexões antigas somente leitura ficam identificadas e exigem reautorização explícita.
- Matriz real de capacidades de e-commerce criada, com Shopify como referência inicial e sem anunciar recursos planejados como prontos.
- Teste de concorrência com Firestore Emulator foi preparado; a execução local aguarda Java no ambiente.
- Próximo passo: política de continuidade por papel, grounding rastreável e smoke test de voz pelo WhatsApp.
