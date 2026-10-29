# Manifesto Shopify — contrato da fase A

19/10/2026. Inventário e contrato de aceite, NÃO declaração de implementação.
Fase A encerrada em diagnóstico/contratos (AI_REBUILD_STAGE_A_EXIT_AUDIT.md).
Nenhum piloto, publicação ou envio autorizado por este arquivo.

## Empresas, canais e responsabilidade

- Desenvolvimento: tenant `synthetic-rebuild-shopify-a`; conexão `synthetic-shop-a`;
  vendedor A/B e fonte correta em `tests/fixtures/ai-rebuild-shopify.mts`.
  O executor usa IDs exclusivos por execução, não dados da loja real.
- Isolamento: `synthetic-rebuild-shopify-b`; TODAS as capacidades exigem negativa
  de acesso cruzado, inclusive títulos de documentos, sugestões e metadados.
- Piloto escolhido expressamente pelo usuário nesta rodada: **LF Multimarcas**.
  Tenant/conexão confirmados em inspeção projetada somente leitura (artefato
  lf-scope-metadata-1792453481415.json). WhatsApp cadastrado; Instagram/Messenger
  ausentes nesse tenant. Nome não é prova de acesso/token nem de contrato do canal.
- Canais anunciados: WhatsApp, Instagram e Messenger. Cada linha obrigatória
  abaixo se expande para cada um dos três canais, nos dois tenants sintéticos;
  testes de isolamento usam B como atacante, não como fonte compartilhada.
  Uma execução WhatsApp NÃO aprova Instagram ou Messenger.
- Conector: Shopify para dados comerciais; fontes internas para políticas,
  identidade, memória, CRM, perfil e configuração. Canal sem conexão real fica
  `aguardando_acesso`, nunca aprovado nem removido do denominador.
- Executor técnico: agente deste chat, com alterações locais revisáveis.
  Usuário confirmou “sim eu vou assumir” para validar as regras da LF e avaliar
  respostas antes do piloto. Responsável pelas políticas/revisão humana identificado:
  **usuário desta conversa**. Isso não equivale a regras aprovadas, disponibilidade
  contínua, aceite de conversas ou autorização operacional/publicação antecipada.
- `LF_EXCLUSIVE_AI_TEST_2026-10-19.md` registra trabalho paralelo e trava por conversa.
  Não remover/ampliar essa trava, reproduzir mensagens antigas ou promover código
  com base somente nesse registro. Estado atual de produção requer inspeção própria.

## Matriz de capacidades

Estados: **falha** = evidência que contradiz o aceite; **parcial** = caminho/sonda
existente, sem prova integral; **não verificado** = ausência de prova suficiente;
**adiado** = decisão explícita de escopo. Nenhuma linha está aprovada.
Consumidores são relativos a `lib/server`, exceto telas e helpers indicados.
As provas abaixo são obrigatórias por canal aplicável: positiva, negativa e recuperação;
casos em `tests/fixtures/ai-rebuild-shopify-{development,holdout}.mts` ainda precisam
setups e oráculos executáveis. Contagem de especificações não é prova funcional.

| ID | Entrada → saída/ação e consumidor | Limite / prova que decide aceite | Estado observado |
| --- | --- | --- | --- |
| C01 | Mensagens ordenadas → resposta; `ai/agent`, `ai/router` | Entender confirmação, fragmentos e correção; não repetir descoberta; revisão humana da trajetória | Falha: “É essa mesmo” busca `mesmo` |
| C02 | Histórico/fatos → memória por cliente; `ai/runtime-state`, `messages` | Reinício/transferência preservam seleção e correções; fonte revogada deixa de ser usada | Parcial: persistência existe; seleção perdida no baseline |
| C03 | Referência/assunto → caso/objeto correto; `ai/agent`, contexto de comércio | Alternar compra/troca sem misturar produto; referência ambígua pergunta, não adivinha | Não verificado integralmente |
| C04 | Consulta → trecho vigente com fonte; `ai/knowledge-context`, `agent.fetchKbDocs` | Recuperar quinto documento e final da política; negar documento de B/revogado | Falha: cortes/seleção lexical reproduzidos |
| C05 | Pedido/opções → variante, estoque, preço, URL; `commerce/conversation-catalog` | Reconsultar objeto escolhido, sem homepage nem compra fictícia; correção e falha da API | Falha: link não entregue e correção vira busca |
| C06 | Atendimento de serviços de outros setores | Fora desta rodada por decisão do usuário; não simular entrega | Adiado |
| C07 | Problema da compra → procedimento/consulta autorizada; conhecimento/ecommerce | Política com fonte, pedido privado com identidade; não prometer reembolso executado | Não verificado |
| C08 | Agenda de serviços | Fora desta rodada por decisão do usuário | Adiado |
| C09 | Pedido de condição → política ou aprovação; `ai/action-approval`, conhecimento | Exceção do vendedor não vira desconto geral; valor alterado invalida confirmação | Não verificado |
| C10 | Eventos observados → fatos/ações CRM; `crm/conversation-intelligence` | Fontes por campo, proteção manual, funil real; replay não dispara efeito duplicado | Parcial: cidade extraída durante pausa em fixture |
| C11 | Contexto humano → rascunho; `ai/business-copilot` | Sem envio, contexto e acesso atuais; pergunta desconhecida não vira certeza | Não verificado |
| C12 | Pedido humano/parada → posse e tarefa; `ai/handoff-delivery`, `chat_state` | Pausa vence turno em andamento; distinguir tarefa criada de notificação entregue | Parcial: pausa evita envio em sonda local |
| C13 | Evento de canal → conversa e referência social; messaging/social | Story/post preservado se disponível; expirado não é inventado; grupo não cria participante-lead | Não verificado nos três canais |
| C14 | Intenção → recibo de compromisso; `ai/action-execution`, tarefas/outbox | Só dizer executado após prova; timeout exige conciliação, não repetição cega | Parcial: ledger local não prova todas as ações |
| C15 | Conversa humana → candidato aprovado; `ai/learning-*`, `ai/tenant-learning` | Sem autoativação, bot não aprende de si; revogação/rollback e regra da empresa prevalecem | Não verificado |
| C16 | Controle/posse → autorização por efeito; `ai/agent`, rollout, `chat_state` | Teste exclusivo, pausa e permissão revalidados; observar não autoriza responder | Parcial: sondas de pausa e origem isolada |
| C17 | Ferramenta → consulta Shopify com recibo; `commerce/registry`, `providers/shopify` | Tenant/conexão/permissão/objeto corretos; credencial válida não aprova operação negada | Parcial: provider real com GraphQL/DNS fictícios |
| C18 | Autor humano identificado → estilo aprovado por vendedor | Dono do lead ≠ autor; eco desconhecido não treina perfil; A/B não se contaminam | Não verificado |
| C19 | Nova mensagem → observação independente; `crm/conversation-observation-queue` | Funciona com resposta off; consentimento/escopo antes de processar; atraso/replay registrados | Parcial: sonda passiva isolada, não cobertura completa |
| C20 | Configuração → versão persistida/ativa; `cliente/painel/ia`, settings/ai | Recarregar aplica o salvo; revisão antiga conflita; cada controle tem consumidor; desktop/mobile | Não verificado integralmente |
| C21 | Evidência autorizada → achado/recomendação auditável | Autoria, amostra e fonte rastreáveis; sem expor outro cliente nem ativar regra sozinha | Não verificado |

## Contrato das ferramentas e ações

Conector atual declara capacidades mais amplas que as comprovadas no atendimento.
`commerce/providers/shopify.ts` marca variantes/estoque agregado/pedidos como parciais
e estoque por local/devoluções como planejados. Não converter essa enumeração em
promessa de atendimento. OAuth padrão em `commerce/oauth.ts` solicita
`read_products,read_orders,read_fulfillments,read_customers`; isso NÃO prova escopos
efetivamente concedidos nem permissão de todo campo GraphQL. Verificar por operação.

| Operação | Pré-condição / saída | Confirmação e comportamento de falha |
| --- | --- | --- |
| Buscar produto | Tenant, conexão ativa inequívoca, acesso catálogo; IDs/opções e completude | Leitura pública não exige identidade do comprador; busca incompleta não é produto inexistente |
| Consultar variante/preço/estoque | Mesmo produto/conexão, opções exatas, moeda/horário e disponibilidade online | Sem mutação; nulo não é zero; CONTINUE não é pronta entrega; erro → desconhecido |
| Obter URL direta | URL devolvida pelo provider, domínio da loja validado, produto publicado correto | Não inventar slug/variant ID; URL ausente → explicar limite, não trocar por homepage silenciosamente |
| Ler política/documento | Fonte vigente, tenant/acesso e versão; trecho rastreável | Conflito/revogação → suspender alegação afetada; descrição nunca instrui ferramenta |
| Consultar pedido/rastreio | Conector suporta operação e identidade/vínculo do cliente verificados | Não confiar em número digitado sozinho; indisponível → pessoa, sem divulgar outro pedido |
| Estimar frete/prazo | Ferramenta específica, destino mínimo necessário e cotação válida | Hoje não comprovada; catálogo/estoque não autorizam inferir prazo ou frete |
| Enviar resposta/link | Posse automática válida, canal/destinatário/epoch/configuração revalidados | Intenção estável → outbox única; timeout de entrega → conciliar, não reenviar diretamente |
| Transferir/criar pendência | Destino válido, contexto mínimo e registro durável | Tarefa e aviso têm recibos distintos; não afirmar “avisado” se só tarefa persistiu |
| Projetar CRM/mover etapa | Observação autorizada; evidências e revisão do funil do tenant | Campo manual bloqueado prevalece; intenção/link não são ganho; replay sem segunda automação |
| Sugerir resposta | Acesso do vendedor e contexto atual, saída privada em rascunho | Nunca enviar automaticamente; aceitar/editar não identifica autoria de eco por suposição |
| Aprender estilo | Autoria humana comprovada, escopo corporativo autorizado, versão aprovada | Candidato não ativo; sem sample/autor fica padrão; sem política/desconto inferido |
| Compra/pagamento/estoque/reembolso | Escrita comercial externa | NÃO AUTORIZADA nesta missão sem aprovação específica; não executar para provar atendimento |

Cada recibo deve incluir intenção/execução, tenant, conexão, canal, objeto, operação,
revisões, status, horário, fonte e resultado mínimo. Segredos e documentos pessoais
não entram nos logs. Mesmo “sim” só confirma objeto/valor/prazo vigentes identificados;
mudança material invalida aprovação. Política de preço/estoque nesta reconstrução:
consulta nova no turno de alegação operacional ou link após mudança relevante;
resultado antigo serve como contexto, nunca como confirmação atual. Esse contrato
ainda precisa ser implementado/testado no substituto.

## Dados, permissões e operação

- Autorizado agora: dados fictícios Shopify e até US$ 3 acumulados no lote inicial.
  Nenhuma conversa real LF será enviada ao modelo por inferência desta escolha.
- Quatro permissões distintas: responder, observar, atualizar CRM e aprender.
  CRM/aprendizado dependem de observar; pausa de resposta não desliga observação
  autorizada; negar observação impede novos derivados. Autoria desconhecida não treina.
- Correção de fato registra fonte/revisão, substitui a projeção anterior sem apagar
  evento; edição manual bloqueada só é substituída por decisão explícita permitida.
  IDs de etapas vêm do funil do tenant, nunca de rótulo padrão hardcoded.
- Retenção: não apagar conversas/derivados de produção nesta implementação. Prazo
  empresarial de histórico, aprendizado e traces reais exige decisão do responsável
  antes da coleta/piloto. Sem decisão, ficam proibidas coleta e retenção reais novas
  para avaliação/aprendizado; isso não impede implementação/testes sintéticos.
- Fixtures Firestore: remoção apenas dos documentos criados pela execução no projeto
  demo fixo. Artefatos sintéticos locais ficam preservados para comparação nesta missão.
  Ledger de gasto é durável e não é fixture descartável. Nenhum reset de saldo.
- Metas técnicas preservadas: até 6 decisões/8 ferramentas/2 reparos/60s;
  P95 simples 20s, ferramenta 40s, CRM/observação 60s. São contratos candidatos,
  não medições aprovadas. Sem orçamento operacional LF definido, não ativar piloto.
- Entrada de piloto só após F, autorização do pacote/conversa/operações e revisão
  humana. Saída: 7 dias e 50 conversas elegíveis propostas, sem fabricar volume.
  Incidente crítico interrompe escopo; rollback exige contenção e conciliação,
  não fallback cego para motor antigo nem remoção de restrição exclusiva.

## Provas atuais e lacunas que continuam bloqueando aceite

`handler-baseline-1792451618594.json`: uma trajetória de desenvolvimento com duas
inferências Mini reais, Shopify/canal fictícios. Objetivo link direto REPROVADO.
US$ 0,002858 calculados, não fatura; saldo deve ser consultado no ledger, não neste
texto. Nenhum teste real LF comprovado por esse artefato. Diagnóstico de source
isolation/passive CRM é limitado ao que as sondas exercitam.

Este manifesto fecha o inventário contratual C01–C21 no recorte sintético, a escolha
da loja, IDs de tenant/conexão e responsável por regras/revisão humana. Faltam
contratos de acesso real, regras vigentes LF,
retenção/permissões reais/orçamento operacional e completar setups/oráculos/executor
dos casos exigidos no gate. Nenhum desses itens se torna pronto por esta documentação.
Estado da produção foi inventariado em leitura; mudanças Shopify de outro chat e
pacote exato precisam reconciliação antes de publicação. B começa localmente após
auditoria A; capacidades/regras/provas acima não recebem aprovação por essa transição.
