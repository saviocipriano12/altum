# Plano de execução — Altum Revenue OS

Data-base: 25 de setembro de 2026.

## Resultado final

A Altum será uma operação comercial brasileira completa, orientada por resultado e não por módulos: capta o lead, identifica a pessoa, conversa por texto/voz/mídia, consulta catálogo e estoque, recomenda a oferta, agenda, gera proposta, recebe pagamento, acompanha o pós-venda e aprende com o desfecho. Pessoas e IA trabalham sobre a mesma ficha, a mesma memória e as mesmas permissões.

O cliente verá uma Altum coerente. Internamente, especialistas poderão cuidar de conversa, catálogo, agenda, cobrança, mídia, follow-up e análise, sempre com limites, auditoria e transferência humana.

## Regra de aceleração

- Reutilizar componentes pequenos de projetos MIT/Apache 2.0 quando o encaixe for melhor que código próprio.
- Registrar origem, commit, licença, arquivos e alterações no inventário de terceiros.
- Integrar, sem incorporar o core, soluções com licenças restritivas ou fair-code.
- Usar Twenty, Dify e n8n como referência de produto/arquitetura onde a licença impedir incorporação segura.
- Evitar forks completos e múltiplos modelos de dados. A fonte da verdade continua sendo o domínio Altum.

Referências prioritárias: Chatwoot para inbox e ownership; LangGraph para jornada durável; Langfuse e Promptfoo para observabilidade/evals; Graphiti ou Mem0 para memória temporal; LiveKit Agents para telefonia; Activepieces para conectores; PostHog para eventos e experimentos.

## Fases e entregas

### 0. Fundação confiável — em andamento

- [x] Gate de qualidade da IA persistido por tenant.
- [x] Cenários críticos, taxa mínima e bloqueio por cobertura incompleta.
- [x] Histórico operacional da avaliação na área do Assistente Altum.
- [x] Isolamento por permissão para executar e consultar avaliações.
- [x] Gate geral com testes funcionais, segurança, lint e TypeScript.
- [x] Corrigir o contrato do modo de voz `always` sem ignorar preferência por texto ou janela do canal.
- [ ] Criar feature flags, coortes de rollout e rollback por versão de agente.
- [ ] Adicionar tracing por turno: contexto usado, decisão, ferramentas, custo, latência, resultado e falha.

Critério de saída: nenhuma versão da IA chega a clientes sem cenários oficiais completos, ausência de regressão crítica e trilha de auditoria.

### 1. Vendedor Altum 10/10 — próxima frente

- [ ] Consolidar produto/serviço, variação, preço, estoque, margem, disponibilidade, mídia e políticas em um contrato comercial único.
- [ ] Garantir grounding: toda afirmação comercial aponta para uma fonte vigente; ausência ou conflito gera pergunta ou handoff.
- [ ] Fechar mídia ponta a ponta: imagem, vídeo e documento pedidos pelo cliente, com legenda, disponibilidade e registro na conversa.
- [ ] Fechar visão: imagem recebida é comparada ao catálogo, com confiança, alternativas e confirmação antes de prometer equivalência.
- [ ] Tornar voz uma experiência humana mensurável: texto próprio para fala, pronúncia, duração, preferência, fallback e avaliação.
- [ ] Executar ações reais: criar/atualizar lead, tarefa, reunião, proposta, cobrança e handoff dentro da política de autonomia.
- [ ] Ligar resultado ao aprendizado: reunião, proposta, pagamento, perda, motivo e satisfação.

Critério de saída: um lead consegue concluir uma compra ou agendamento real por WhatsApp/Instagram, do primeiro contato ao pós-venda, sem perder contexto e sem invenção factual.

### 2. Ciclo comercial único

- [ ] Unificar pessoa, empresa, oportunidade, conversa, agenda, proposta, pedido, cobrança e timeline em Customer 360.
- [ ] Criar máquina de estados canônica e idempotente para os movimentos comerciais.
- [ ] Expor uma ação principal e uma próxima ação em cada etapa.
- [ ] Fechar atribuição, transferência, desligamento e privacidade de canais pessoais/compartilhados.
- [ ] Tratar perda, reativação, recompra, upsell e indicação como partes do ciclo.

Critério de saída: nenhum objeto importante fica órfão e todo estado possui entrada, ação, responsável, prazo e desfecho.

### 3. Mesa Comercial

- [ ] Uma tela operacional para equipe, canais, filas, carteira, capacidade, SLA e permissões.
- [ ] Pessoas e times na mesma página, com edição, exclusão/desligamento, transferência e auditoria.
- [ ] Inbox com filtros recolhíveis, mais área para conversa e contexto lateral sob demanda.
- [ ] Visões curadas para atendente, vendedor, gestor, admin do cliente e técnico Altum.

Critério de saída: um gestor configura e opera uma equipe sem alternar entre telas redundantes ou depender de suporte técnico.

### 4. Voz, ligação e reuniões

- [ ] Integrar LiveKit Agents como camada de chamada em tempo real, preservando o CRM Altum como fonte da verdade.
- [ ] Chamadas receptivas e ativas com interrupção natural, consentimento, gravação e transcrição conforme política.
- [ ] Casos iniciais: qualificação, recuperação de lead quente, confirmação/reagendamento e follow-up de proposta.
- [ ] Resumo, compromissos, campos do CRM e próxima ação gerados ao terminar a ligação/reunião.

Critério de saída: voz não é demonstração; cada chamada tem objetivo, permissão, registro e resultado comercial mensurável.

### 5. Cadências e automação comercial

- [ ] Editor humano por intenção: “se pediu preço e sumiu, retomar em 2h”, sem expor complexidade técnica.
- [ ] Sequências multicanal com frequência, janela, opt-out, orçamento e aprovação.
- [ ] Fila durável, retry, dead-letter, deduplicação e observabilidade.
- [ ] Biblioteca por nicho e objetivo comercial.

Critério de saída: toda automação é previsível, testável, explicável e interrompida quando o cliente responde ou converte.

### 6. Gêmeo Comercial e Gerente Altum

- [ ] Gêmeo da empresa: catálogo, políticas, capacidade, agenda, margem, regiões e poderes de aprovação.
- [ ] Gêmeo do cliente: fatos temporais, origem, intenção, preferências, objeções, envolvidos, consentimentos e promessas.
- [ ] Próxima melhor ação baseada em contexto e resultado, com explicação e confiança.
- [ ] Gerente Altum: riscos, forecast, coaching, gargalos, alertas e plano diário executável.
- [ ] Laboratório de receita: shadow mode, champion/challenger, experimento, rollout e rollback.

Critério de saída: a Altum melhora decisões comerciais por resultado observado, não apenas a qualidade aparente das respostas.

### 7. Revenue Network e ecossistema

- [ ] Catálogo, orçamento, checkout, pedido e pós-venda preparados para UCP.
- [ ] Ferramentas seguras via MCP e colaboração entre agentes via A2A.
- [ ] Agent Studio com templates verticais e marketplace de skills/conectores certificados.
- [ ] Benchmark privado e consentido por segmento, sem vazamento entre tenants.

Critério de saída: empresas Altum podem vender tanto para pessoas quanto para agentes compradores, sob regras e aprovação do negócio.

## Incremento entregue — jornada ecommerce

- [x] Estado canônico do pedido: criado, pagamento confirmado, preparação, enviado, entregue, cancelado e estornado.
- [x] Pedido sem pagamento permanece em proposta e gera acompanhamento, sem falsa confirmação de compra.
- [x] Pagamento confirmado fecha a venda e encerra a pendência de pagamento.
- [x] Rastreio encerra a espera por envio; entrega encerra confirmação e rastreio pendentes.
- [x] Pós-venda e upsell somente depois da entrega confirmada.
- [x] Cancelamento e estorno encerram tarefas e descartam ações comerciais incompatíveis.
- [x] Carrinho recuperado encerra automaticamente a tarefa e a ação de recuperação.
- [x] Webhooks e eventos da timeline são idempotentes, com contagem de reentregas e datas de criação preservadas.
- [x] Customer 360 exibe o estado humano do pedido e as ações de checkout ou rastreio no momento correto.

Próximo corte vertical: tornar o agente responsável pela execução assistida dessa jornada, com resposta a eventos, cadência interrompida por conversão, observação do resultado e liberação por coorte.

### Agente ecommerce orientado a eventos

- [x] Webhook dispara o mesmo processador usado pela operação manual, sem caminhos de comportamento divergentes.
- [x] Modos desligado, simulação segura e automático configuráveis por cliente.
- [x] Rollout determinístico por percentual da base e versão explícita do agente.
- [x] Trava transacional antes do envio para impedir duplicidade concorrente.
- [x] Retentativas com espera progressiva e dead-letter depois do limite operacional.
- [x] Tracing por decisão com versão, modo, coorte, latência, resultado e origem da execução.
- [x] Resultado comercial posterior vinculado à ação: entrega, cancelamento, estorno ou carrinho recuperado.
- [x] Job autenticado de continuidade a cada cinco minutos para recuperar falhas transitórias.
- [x] Compatibilidade preservada para clientes que já utilizavam a opção legada de envio automático.

Próximo corte: medir conversão e receita incremental por versão/coorte e acrescentar champion/challenger com rollback automático quando a qualidade ou o resultado piorarem.

### Laboratório de receita do agente

- [x] Versão principal e desafiante distribuídas por coorte determinística no nível do cliente/pedido.
- [x] Todas as ações do mesmo pedido permanecem na mesma versão para evitar contaminação do experimento.
- [x] Conversão e receita atribuídas sem duplicar pedidos que geraram confirmação, rastreio e pós-venda.
- [x] Período mínimo de maturação antes de julgar uma ação sem conversão.
- [x] Intervalo de confiança de Wilson e amostra mínima antes de recomendar promoção ou rollback.
- [x] Rollback automático opcional somente diante de regressão comprovada de falha ou conversão.
- [x] Promoção permanece como recomendação humana, sem substituir automaticamente a versão principal.
- [x] Painel do cliente mostra principal, desafiante, conversões, receita, falhas e leitura atual.
- [x] Rollback e alterações do experimento possuem registro de auditoria.

Próximo corte: expandir o mesmo runtime para agendamento, proposta e cobrança, formando um agente comercial transversal em vez de um agente restrito ao ecommerce.

### Agente comercial transversal - primeiro contrato operacional

- [x] Contrato unico de acao para follow-up, revisao de proposta, sugestao de agenda e liberacao de cobranca.
- [x] Politica de autonomia por risco: follow-up interno pode executar; proposta e agenda exigem revisao; cobranca e sempre protegida.
- [x] Acoes idempotentes e rastreaveis, ligadas ao lead, conversa, objeto comercial e versao do agente.
- [x] Sugestao de agenda nasce como rascunho e nao gera conversao antes da aprovacao humana.
- [x] Aprovacao de horario revalida conflito antes de marcar o compromisso.
- [x] Fila de decisoes no Assistente Altum com contexto, impacto, valor, aprovacao, recusa e atalho para o modulo correto.
- [x] Isolamento por tenant e por responsavel comercial preservado na leitura e na decisao.
- [x] Liberacao de cobranca registra autorizacao sem chamar automaticamente o provedor financeiro.
- [x] Decisao humana registrada na timeline do lead e no objeto comercial relacionado.

Proximo corte: conectar a liberacao de cobranca ao fluxo financeiro em duas etapas, acrescentar expiracao/escalada de decisoes e medir tempo economizado, taxa de aprovacao e receita influenciada por cada tipo de acao.

### Cobranca em duas etapas e metricas do agente

- [x] Preparar cobranca cria uma solicitacao revisavel sem chamar o Asaas.
- [x] Emissao exige decisao aprovada, permissao comercial e correspondencia exata de cliente, proposta, valor, vencimento e meio de pagamento.
- [x] Mudanca posterior em qualquer dado sensivel invalida a autorizacao anterior.
- [x] Trava transacional impede duas emissoes concorrentes para a mesma aprovacao.
- [x] ID da decisao vira referencia externa no Asaas e permite reconciliar timeout antes de repetir a criacao.
- [x] Registro financeiro e evento da timeline usam IDs deterministas para evitar duplicacao local.
- [x] Falha inconclusiva entra em reconciliacao, sem nova emissao cega.
- [x] Assistente Altum mostra pendencias, aprovacoes, recusas, tempo medio de decisao e valor liberado.
- [x] Area comercial mostra cobrancas aprovadas e separa preparar, aprovar e emitir.

Proximo corte: expirar decisoes antigas, escalar aprovacao parada ao gestor e ligar cada acao a receita recebida, tempo economizado e conversao incremental.

### SLA, expiracao e escalada das decisoes comerciais

- [x] Cada tipo de decisao possui SLA e janela de validade proporcionais ao risco.
- [x] Job autenticado reavalia pendencias a cada dez minutos e faz backfill das decisoes antigas.
- [x] Escalada progressiva e idempotente evita alertas duplicados no mesmo nivel.
- [x] Gestores recebem notificacao acionavel no produto e push individual quando disponivel.
- [x] Sugestoes expiradas nao podem mais ser aprovadas pela API.
- [x] Agenda em rascunho e autorizacoes de proposta/cobranca sao encerradas quando a decisao expira.
- [x] Expiracao fica registrada na timeline do lead com ID deterministico.
- [x] Fila mostra prazo, atraso, nivel de escalada e indicadores consolidados.

Proximo corte: atribuir a cada acao conversao, receita recebida e tempo economizado, com baseline explicito e sem dupla contagem.

## Métricas de produto

Métrica norte: receita incremental confiável por cliente Altum.

Guardrails: precisão factual, conversão por etapa, tempo até primeiro valor, venda/resolução sem intervenção, margem preservada, opt-out, handoff correto, custo por resultado, incidentes e satisfação.

## Ordem imediata de implementação

1. Concluir contratos e testes da voz e da avaliação já iniciados.
2. Auditar o contrato comercial de catálogo/estoque/mídia e eliminar fontes divergentes.
3. Criar cenários executáveis de produto, estoque, mídia, imagem, proposta, agenda, pagamento e handoff.
4. Fechar uma jornada vertical real primeiro — ecommerce para compra direta ou clínica para agendamento — e só então generalizar.
5. Liberar por coorte, observar resultados e ampliar apenas após o gate.

## Definição de pronto para cada fatia

Código, autorização, isolamento por tenant, tratamento de falha, auditoria, observabilidade, teste automatizado, UX acionável, documentação operacional, rollout e rollback. Uma tela ou endpoint sem o restante não conta como ciclo fechado.
