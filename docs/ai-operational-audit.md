# Auditoria operacional da IA Altum

Data da revisão: 30 de setembro de 2026.

Este documento registra o que foi verificado no código local. Ele não prova que integrações, credenciais, timers ou provedores estão saudáveis em produção; esses itens exigem a validação de deploy indicada ao final.

## Escopo e critério de verdade

A auditoria cobre o caminho real `WhatsApp/Meta → fila → worker → decisão da IA → guardrails e limites → CRM → tarefas, handoff e rascunhos`. Uma configuração só é considerada funcional quando há leitura dela no fluxo de execução, e uma capacidade só é considerada automática quando o código pode executá-la sem uma ação humana.

## Matriz de verificação

| Requisito | Evidência atual | Situação |
| --- | --- | --- |
| Mensagem recebida chega à fila de IA | Rotas de webhook persistem contexto e enfileiram job com deduplicação; o processamento também pode ser solicitado após a acomodação da mensagem. | Validado em código; requer teste controlado publicado. |
| Jobs pendentes são recuperados | `infra/jobs/altum-job-ai.timer` chama o serviço a cada 60 segundos; a consulta usa ordem de disponibilidade/prioridade com índice declarado. | Corrigido localmente; requer instalação na VPS e deploy dos índices. |
| Decisão usa contexto e regras | `lib/server/ai/agent.ts` lê conversa, CRM, negócio, base de conhecimento, regras, rollout e limites antes da resposta. | Validado em código e testes focados. |
| Limites de custo e volume são respeitados | A rota de uso calcula o menor limite entre perfil operacional e plano; a contingência é exposta no painel. | Validado localmente; requer índice Firestore e dados reais após deploy. |
| Configurações de autonomia cumprem a promessa | Assistida não escreve CRM; Equilibrada qualifica e faz handoff; Autônoma pode avançar funil, tarefas e rascunhos dentro das regras. | Corrigido e testado localmente. |
| Handoff não expõe dados ao lead | Destinatário externo só é obtido de campos explicitamente internos, nunca de telefone do chat ou do lead. | Corrigido e testado localmente. |
| Auditoria mostra os registros mais recentes | `ai_logs` e `ai_usage_ledger` consultam `tenantId + createdAt desc`, limitados a 40; índices foram declarados. | Corrigido localmente; requer deploy dos índices. |
| Aprendizado não reutiliza oferta removida | Oferta aprendida é usada apenas quando ainda está no catálogo ou playbook ativo. | Corrigido e testado localmente. |
| Execução completa com Firestore real | Teste de fila por emulator. | Pendente: esta máquina não possui Java disponível no `PATH`. |

## Configurações da área do cliente: efeito real

| Configuração | O que altera no runtime | Limite ou dependência |
| --- | --- | --- |
| IA ativa | Desliga o processamento/resposta automática e registra a decisão como desabilitada. | Não substitui o atendimento humano nem cancela mensagens já enviadas. |
| Pausar respostas | Mantém a análise/auditoria, mas suprime o envio ao contato. | É diferente de desligar a IA; não deve ser usado como confirmação de que o humano assumiu a conversa. |
| Nome, papel, tom, resumo e objetivo | Alimentam o contexto e as instruções da resposta. | Não anulam guardrails, fatos verificados ou políticas de conversa. |
| Cérebro comercial | Define modelo comercial, ICP, diagnóstico, proposta, follow-up, critérios de handoff e movimentos proibidos no planejamento. | É instrução e contexto; não substitui catálogo, preço ou política verificados. |
| Guardrails, perguntas obrigatórias e tópicos de escalada | São agregados ao contexto e à decisão; temas sensíveis podem forçar handoff. | Itens vagos ou conflitantes continuam exigindo curadoria humana. |
| Responsável e aviso de handoff | Define quem pode receber contexto interno; cria aviso/tarefa e registra falhas de entrega. | Requer canal WhatsApp e telefone interno configurado; nunca usa telefone do lead como destinatário. |
| Resposta por voz | Planeja e envia áudio segundo modo, tamanho máximo, preferência do cliente, canal e janela de serviço. | Requer provider/canal compatível; preferência por texto, janela fechada ou falha de mídia impedem áudio. |
| Template de follow-up WhatsApp | Quando a janela de 24 h está fechada, define se pode usar template, nome, idioma e parâmetros. | O template precisa existir e estar aprovado no provider; a configuração local não aprova template. |
| Autonomia | Assistida não atualiza CRM, mas cria a tarefa mínima de handoff; Equilibrada atualiza memória/qualificação e handoff; Autônoma pode avançar fluxo comercial. | Mesmo na Autônoma, propostas e agendamentos são rascunhos, não confirmações finais. |
| Tier, raciocínio, estilo, provider e modelos | Constroem a política de roteamento, modelo, recuperação de conhecimento e fallback. | Chave do provider precisa existir; modelo premium é limitado se a permissão de premium estiver desligada. |
| Budget e limite mensal | Interrompem a rota paga ao atingir o menor teto de configuração/plano e colocam o fluxo em contingência. | Exigem leitura correta do ledger e não representam garantia de custo do provider em tempo real. |
| Rollout e versão | Determinam se a conversa recebe resposta, fica em shadow ou fica fora do percentual; registram versão e bucket. | Aumentar percentual exige avaliação de qualidade recente aprovada; shadow não envia mensagem ao lead. |

## Fluxo validado

1. Webhooks de WhatsApp e Meta persistem a mensagem recebida, atualizam o chat/lead e enfileiram um job de IA com chave de deduplicação.
2. A fila protege contra duplicidade, turnos antigos e concorrência por conversa. O webhook tenta processar após um curto período de acomodação; o worker protegido recupera pendências.
3. O motor lê contexto da conversa, CRM, perfil do negócio, base de conhecimento, regras, papel do assistente, limites de uso e estado de rollout antes de decidir.
4. Regras podem pedir mais contexto, bloquear fatos comerciais não verificados, respeitar preferência de resposta, fazer handoff ou impedir envio em shadow rollout.
5. A resposta aprovada é enviada pelo canal disponível. Decisão, fontes, latência, execução, contingência e ações são registradas para auditoria.
6. Quando permitido pelo modo de autonomia, o motor atualiza memória/qualificação no CRM e pode avançar funil, criar tarefas ou abrir rascunhos. Propostas e agendamentos continuam sendo rascunhos para revisão humana.

## O que é automático

| Capacidade | Condição real |
| --- | --- |
| Responder WhatsApp/Meta | IA ativa, conversa elegível, canal disponível, rollout permite envio e não existe pausa ou humano assumindo. |
| Recuperar jobs pendentes | Worker `ai` a cada minuto, após aplicar o timer na VPS. |
| Handoff | Pedido explícito, tema de escalada ou decisão do motor; pausa a IA por 30 minutos, cria tarefa prioritária e registra contexto. |
| Handoff por WhatsApp interno | Canal disponível, notificação habilitada e destinatário interno configurado/encontrado. |
| CRM em modo Equilibrada | Atualiza memória, campos extraídos, qualificação e sinaliza handoff; não avança funil nem cria tarefas ou rascunhos comerciais. |
| CRM em modo Autônoma | Além do modo Equilibrada, pode avançar funil, criar follow-up e abrir rascunhos de proposta/agendamento se limiares e guardrails forem atendidos. |
| Contingência de custo/volume | Ao atingir o menor limite entre configuração e plano, não usa o modelo pago e registra a condição para auditoria. |
| Aprendizado operacional | Agrega sinais dos últimos 30 dias; pode sugerir ação/fechamento e oferta recorrente somente se ela continuar ativa. |

## O que continua humano

- Configurar canal, credenciais, responsável interno, base de conhecimento, perfil comercial, limites e regras.
- Assumir handoffs, revisar propostas e confirmar horários com o cliente.
- Corrigir conhecimento desatualizado e avaliar resultado comercial. O sistema não treina nem altera o próprio modelo automaticamente.
- Aplicar deploy e validar saúde de VPS, Firestore, providers e canais.

## Limites reais

- O aprendizado é agregação de eventos: não é fine-tuning, causalidade comprovada ou autoedição de playbooks.
- A IA não deve inventar preço, estoque, prazo, política ou oferta sem fonte verificada.
- Fechamento permanece em rascunho/revisão: ela não confirma pagamento, envia proposta definitiva ou agenda compromisso definitivo sozinha.
- A auditoria técnica mostra as últimas 40 decisões; o painel executivo pode usar outra janela temporal. Os recortes não representam o mesmo indicador.
- Saúde em produção não pode ser inferida apenas de testes locais.

## Correções desta revisão

- Logs de decisão e uso passaram a consultar os 40 registros mais recentes, com índices Firestore declarados.
- A tela mostra contingência por limite efetivo de uso ou orçamento.
- Perfil específico da IA vence um perfil genérico legado na leitura de implantação.
- Modos Assistida, Equilibrada e Autônoma têm efeitos operacionais distintos.
- O worker de recuperação passou de diário para a cada minuto.
- A fila passou a ter índices declarados para buscar jobs por disponibilidade/prioridade e contar dead letters sem amostra limitada; a leitura do último gate de qualidade também passou a ser ordenada.
- Todo handoff resolvido, inclusive os forçados por guardrail, passa ao CRM como escalada explícita; no modo Assistida a única escrita permitida é a tarefa de segurança para um humano assumir.
- Notificações de handoff não usam telefones de leads/chats como destinatários internos.
- Oferta aprendida só é reaproveitada se continuar autorizada em catálogo ou playbook ativo.

## Passos obrigatórios de deploy

1. Publicar a aplicação e executar `npm run firestore:indexes:deploy` com as credenciais corretas, para criar os índices de `ai_logs`, `ai_usage_ledger`, `jobs` e `ai_evaluation_runs`.
2. Na VPS, atualizar `infra/jobs` e executar `sudo ./install.sh` dentro dessa pasta.
3. Confirmar `systemctl status altum-job-ai.timer` e `systemctl list-timers altum-job-ai.timer`; o próximo disparo deve ocorrer em cerca de um minuto.
4. Confirmar que `CRON_SECRET`/`AI_JOBS_PROCESS_TOKEN` na VPS coincide com a aplicação publicada.
5. Fazer uma conversa de teste controlada e verificar: mensagem recebida, job concluído, `ai_logs`, CRM, handoff e notificação para um número interno de teste.
6. Verificar a tela da IA após deploy: histórico recente, proteção de uso e responsável interno devem refletir dados reais.

## Produção observada antes do deploy

Uma leitura apenas visual do painel publicado em 30 de setembro de 2026 confirmou que as mudanças desta revisão ainda não estão ativas: a fila usa a redação antiga que confunde conversas sem responsável com contatos sem dono comercial, e o painel sinaliza uso mensal de IA em risco. Nenhum dado, configuração ou mensagem foi alterado durante essa verificação.

## Evidências locais e lacuna de validação

- A suíte oficial `npm run test:ai-quality` foi executada com sucesso nesta revisão: 82 testes aprovados. Testes focados adicionais cobriram auditoria, autonomia, handoff, contexto, fila, aprendizagem, readiness e observabilidade.
- O Firestore Emulator não iniciou neste ambiente porque Java/JRE não está instalado ou disponível no `PATH`; os binários do emulator já estão baixados. A prova de fila com emulator permanece pendente de máquina com Java compatível.
