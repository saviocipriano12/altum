# Plano de reconstrução do atendimento com IA

Data: 19/10/2026. Execução local iniciada: A encerrada em diagnóstico/contratos,
B em implementação. Nenhuma entrega integrada ou publicação aprovada. Auditoria:
AI_REBUILD_STAGE_A_EXIT_AUDIT.md; divisão corrigida após decisão explícita do usuário,
sem reduzir bateria, metas, revisão humana ou piloto.

Missão retomável: [AI_ATTENDANCE_CONTINUOUS_MISSION.md](AI_ATTENDANCE_CONTINUOUS_MISSION.md).
Ela define entrega integrada inicial (MVP) e continuidade obrigatória até qualidade
final no recorte Shopify. MVP não encerra a missão, não reduz gates de segurança
e não comprova suporte a outros setores. Não inicia automação nem publicação.

Revisão 2: auditoria crítica de escopo, concorrência, aprendizado, acesso,
aceitação e migração. Revisão do documento não é validação do produto. O registro
das falhas encontradas está na seção 23; decisões a fechar constam na seção 22.

### Recorte de execução confirmado pelo cliente

Nesta rodada, validar somente Shopify. Não iniciar cenários de empresas de serviços
ou suporte, mesmo fictícias. A visão multinegócio permanece futura, não excluída nem
comprovada. As distribuições de cenários e a exigência de dois negócios abaixo são
metas do programa completo, não requisitos desta bateria Shopify. Criar manifesto
e gate Shopify separados; sua aprovação não aprova C06/C08 ou adaptação universal.
Lote sintético inicial autorizado em até US$ 3 acumulados; controle durável e modelo
fixado na missão. Bateria integral, novo teto e gasto operacional não autorizados
por essa decisão. Preparação e testes locais sem rede podem continuar.

### Leitura rápida da versão revisada

- Preservar canais/dados/integrações úteis e substituir o núcleo sem dois emissores.
- Fechar 21 capacidades em jornadas verificáveis, não prometer integração universal.
- Separar responder, observar, preencher CRM e aprender; observação nasce da mensagem.
- Memória por assunto/fato/ação, com fonte, atualização, acesso e correção.
- Ferramentas reais com autorização revalidada, efeito conciliável e entrega durável.
- Aprender de vendedor identificado sem copiar erro, exceção ou fala da própria IA.
- Uma entrega integrada; A→B→C→D→E→F→G com evidências e piloto controlado.
- Não há execução/publicação aprovada por este documento; decisões de A estão abertas.

Navegação: capacidades (2), funcionamento (4–9), execução (10), aceite (11),
migração (12), pendências (13), vendedor/observação/configuração (15–18),
contratos operacionais (19–21), decisões e falhas do plano (22–23).

## 1. Compromisso do produto e forma de entrega

Uma identidade de atendimento por empresa, capaz de entender, buscar informação,
executar ações autorizadas e acompanhar o resultado com continuidade. O objetivo
não é responder a qualquer custo, mas resolver a necessidade com pouco esforço.
Não prometemos memória perfeita, ausência universal de erros ou adaptação sem
configuração. Capacidades dependentes de integrações indisponíveis ficam restritas.

Construir o substituto em paralelo, validar o conjunto e fazer uma entrega integrada.
Etapas internas são sequenciais e só avançam com evidência; não são publicações
parciais para clientes. Uma versão candidata poderá passar por piloto restrito antes
da virada ampla. Nunca haverá dois motores enviando à mesma conversa.

O plano por si não autoriza migração ou publicação. A execução local segue a missão.
Admin, autenticação
e páginas públicas permanecem fora do escopo. Reutilizar as telas do cliente; novas
interfaces só se uma capacidade indispensável não couber nas existentes e após revisão.

Base: AI_CURRENT_STATE_AUDIT_2026-10-19.md e CLIENT_RELEASE_READINESS_2026-10-19.md.
Marcações históricas de pronto não comprovam aprovação deste novo motor.

## 2. Capacidades previstas para a entrega integrada

| ID | Capacidade | Comportamento verificável |
| --- | --- | --- |
| C01 | Conversa natural | Responder ao pedido atual; não impor descoberta, pitch ou pergunta em todo turno. Adaptar extensão sem sacrificar informação necessária. |
| C02 | Continuidade | Interpretar sim/esse/amanhã pelo contexto; aplicar correções; retomar após dias e reinícios; recuperar trechos antigos relevantes. |
| C03 | Vários assuntos | Separar compra, entrega e troca; relacionar casos sem misturar produto, pedido ou autorização. Perguntar quando referência for ambígua. |
| C04 | Conhecimento empresarial | Consultar documentos, FAQ, catálogo e políticas do tenant com fonte, versão e validade. Tratar ausência e conflito explicitamente. |
| C05 | Comércio | Consultar produto/variante, preço, estoque, publicação e URL direta; comparar e oferecer alternativa sem substituir silenciosamente. |
| C06 | Serviços | Compreender escopo, condições, limites e informação indispensável; preparar orçamento ou agendamento conforme ferramentas reais. |
| C07 | Suporte | Investigar, aplicar procedimento, reconhecer tentativas anteriores e transferir quando necessário; sem venda espontânea em reclamação. |
| C08 | Agenda | Consultar disponibilidade, confirmar intenção, criar/reagendar/cancelar dentro das permissões; lidar com concorrência e fuso. |
| C09 | Propostas e condições | Preparar a partir de fatos verificados; descontos somente dentro de regra; exceções exigem aprovação. |
| C10 | CRM passivo | Observar mensagens de cliente e humano mesmo com resposta automática desligada; registrar fatos úteis e origem, sem sobrescrever edição manual indevidamente. |
| C11 | Copiloto humano | Sugerir próxima resposta e recuperar evidências sem enviar; operador escolhe usar, editar ou ignorar. |
| C12 | Transferência | Reconhecer pedido, atribuir conforme regras e preservar contexto; não afirmar vendedor notificado sem recibo correspondente. |
| C13 | WhatsApp e redes | Contexto por canal, mensagens fragmentadas, resposta a story/publicação quando disponível, privacidade público/privado e fallback de conteúdo expirado. |
| C14 | Compromissos | Toda promessa de retorno vinculada a tarefa executável, responsável e prazo/condição; sem processo de retorno não prometer retorno. |
| C15 | Aprendizado governado | Separar memória individual, atualização de conhecimento e comportamento; mudanças empresariais avaliadas, aprovadas e reversíveis. |
| C16 | Controle e evidência | Ligar/desligar resposta por conversa, preservar posse humana, explicar fontes e exibir capacidade indisponível sem simular funcionamento. |
| C17 | Sistemas conectados | Consultar e agir em integrações habilitadas, com autenticação, escopo, atualização e resultado verificáveis; conexão salva não equivale a integração funcional. |
| C18 | Aprendizado por vendedor | Aprender preferências de atendimento com autoria humana comprovada, contexto e qualidade; manter perfil distinto das regras da empresa e da memória do cliente. |
| C19 | Observação contínua | Processar novas mensagens autorizadas de humano, cliente e IA, mesmo sem resposta automática, com fila durável, retomada e indicação de atraso/cobertura. |
| C20 | Configuração funcional | Cada controle visível persiste, afeta o comportamento correto e tem teste; simplificar a tela existente e retirar controles inúteis sem apagar dados necessários. |
| C21 | Auditoria assistida | Detectar lacunas, contradições, compromissos esquecidos e padrões de falha; evidência e revisão, sem pontuação opaca de vendedores ou acusação automática. |

C05 não confirma compra por clique ou link enviado. C08 não confirma agenda por
preferência de horário. C12 distingue tarefa criada, notificação e aceite humano.
Reembolso, pagamento e exclusão de conta não se tornam ações autônomas genéricas:
precisam de integração, identidade, regra e autorização explícitas próprias.
Áudio entra no backlog adiado, não no critério de liberação desta entrega textual.
Imagens/documentos exigem extração suportada; ilegível ou incerto pede esclarecimento.

## 3. Preparação por negócio, sem prompt genérico como configuração inteira

- Identidade, unidades, horários, área atendida, idiomas e contatos humanos.
- Produtos/serviços, opções, adequação, contraindicações comerciais e limitações.
- Preço fixo versus sob orçamento; estoque, entrega e regras de agendamento.
- Políticas de troca/cancelamento, condições e limites de negociação/aprovação.
- Critérios úteis de qualificação por jornada, não formulário obrigatório universal.
- Destinos humanos, disponibilidade, distribuição e tratamento fora do expediente.
- Ferramentas conectadas, permissões de leitura/escrita e exemplos aprovados.
- Dados relevantes no CRM por negócio; distinguir comprador final de empresa cliente.

Cada capacidade terá estado: não configurada, restrita, em validação ou aprovada,
com evidência e dependências. Campos preenchidos não equivalem a capacidade aprovada.
Informações ausentes bloqueiam somente a ação afetada, não toda conversa útil.
Setores sensíveis exigem políticas e revisão especializadas antes da habilitação.

## 4. Arquitetura e responsabilidades

Entrada → coordenação do turno → contexto e caso ativo → agente com ferramentas
→ autorização/execução → resposta fundamentada → entrega durável.

Ramo independente a partir da persistência: observação → CRM/pendências →
candidatos de aprendizado. Não depende de chegar ao envio nem de IA habilitada
para responder. Correções/exclusões e recibos de entrega também geram eventos.

1. Adaptadores mantêm IDs do provedor, resposta original, referência de story,
   anexos, tenant, conta e datas. Conteúdo externo nunca vira instrução de sistema.
2. Coordenador ordena, deduplica, agrega fragmentos com espera limitada e verifica
   nova mensagem/posse humana antes de enviar. Evitar resposta para pedido superado.
3. Contexto combina transcrição recente, fatos relevantes, casos e resultados reais.
4. Um agente principal escolhe responder, pesquisar, perguntar, propor ação ou
   encaminhar. Ferramentas disponíveis variam por tenant, papel, identidade e risco.
5. Executor valida entradas, permissões e pré-condições fora do modelo. Confirma
   resultado, controla concorrência e registra execução com identidade durável.
6. Validador protege fatos/privacidade e encaminha correção contextual ao agente,
   com tentativas limitadas. Não trocar toda resposta por pitch ou reunião genérica.
7. Observação passiva, CRM e melhoria rodam separados da autorização de resposta.

O loop do agente terá limites de passos, tempo e custo e saída segura se excedidos.
Limites iniciais propostos: até 6 ciclos de decisão, 8 chamadas de ferramenta e
2 tentativas de corrigir uma resposta, com teto de 60s por turno; consultas somente
de leitura podem ter paralelismo limitado, escritas relacionadas são serializadas.
Os limites são tetos, não metas de consumo; atraso ou resposta inviável encerra
o ciclo antes. A etapa A pode ajustá-los antes de congelar os testes, com justificativa.
Não usar supervisores/modelos extras em toda mensagem sem benefício medido.
Falha do modelo não habilita roteiro comercial de contingência que finge compreensão.
Alternativa: outro modelo previamente validado ou mensagem honesta/encaminhamento.

Não instalar Dify/LangGraph ou contratar Fin/Sierra/Decagon como decisão já tomada.
Na etapa A, escolher uma única base de execução usando persistência, interrupção,
integração com TypeScript/infra existente, licença, operação multi-tenant e avaliação.
Adotar dependência somente se reduzir trabalho demonstrável; sem duas plataformas
concorrentes nem reescrita automática de banco/canais. Fixar versões escolhidas.

## 5. Memória, identidade e assuntos persistentes

Preservar messages como histórico original; não migrar apagando conteúdo.
Adicionar/adaptar projeções versionadas de fatos, casos, compromissos e ações.
Fato contém tenant, pessoa, caso quando aplicável, fonte/mensagem, valor, data,
estado, validade e registro de correção. Hipótese nunca é promovida por repetição.
Caso contém objetivo, objetos envolvidos, decisão atual, lacunas, tarefas e resultado.
Troca de assunto não apaga negociação; encerramento não apaga histórico autorizado.

Recuperação por relevância e orçamento de contexto, não primeiras N linhas. Texto
longo preservado na origem e recuperável; toda omissão é identificada. Resumos não
são fonte para preço, estoque ou conclusão de ação. Não repetir a mensagem atual.
Mensagens falhadas ou pendentes não contam como falas confirmadas ao cliente.
Atualizações respeitam ordem e correções humanas, inclusive processamento tardio.
Identidades entre canais só se vinculam com prova adequada; não por nome parecido.
Separar memória interna de conteúdo que pode ser repetido ao cliente.
Retenção/apagamento propagam às projeções e índices; não ressuscitar conteúdo apagado.

## 6. Conhecimento e catálogo

Ingestão: validar tipo/tamanho → extrair conteúdo → preservar títulos/tabelas e
origem → dividir em unidades úteis → indexar por tenant/permissão/versão.
Falha de extração/OCR deve aparecer; upload não significa documento compreendido.
Busca combina correspondência exata (SKU, códigos, nomes) e por significado;
seleção contextual/reranking e limiar de evidência avaliados com perguntas rotuladas.
Construir consulta com assunto em andamento, não apenas última mensagem curta.
Não recuperar conjunto arbitrário de 200 nem enviar sempre apenas quatro documentos.
Aplicar orçamento explícito e testes de escala; não enviar a base inteira ao modelo.
Políticas conflitantes/obsoletas têm tratamento visível e precedência aprovada.
Eventos de atualização/inativação invalidam índices/cache. Testar revogação de acesso.

Catálogo operacional não é cópia documental de estoque. Shopify fornece produto,
variante e onlineStoreUrl verificáveis. URL deve vir do provedor/domínio validado;
acrescentar seleção de variante apenas quando suportada e identificada corretamente.
Não fabricar URL por nome, slug ou ID adivinhado. Sem link válido, informar limitação.
Eliminar camisa/temporada/time do núcleo compartilhado; manter atributos no domínio
da loja correspondente. Revalidar estoque/preço para nova ação decisiva.

## 7. Ferramentas e resultados

Catálogo mínimo: buscar produto/serviço, detalhar variante, preço/estoque, obter URL;
pesquisar documentos; ler caso/CRM/pedido; consultar agenda; preparar orçamento;
executar agendamento permitido; registrar fato/tarefa; encaminhar para humano.
Ferramenta não disponível não aparece como capacidade executável ao agente.
Resultados estruturados: confirmado, não encontrado, ambíguo, indisponível,
negado ou confirmação pendente, com fonte, data e dados mínimos necessários.

Pré-condições para escrita: identidade suficiente, tenant, objeto correto,
autorização, consentimento/confirmação quando exigido, preço/agenda atuais e regras.
Chave de ação por intenção/run/operação, não apenas lead. Retry não repete efeito.
Timeout após envio exige reconciliação, não reenvio cego. Compensação depende de
suporte do sistema; não prometer transação única entre APIs independentes.
Uma tarefa interna não comprova entrega de mensagem nem aceite do vendedor.

## 8. Conversação, papéis, CRM e humanos

Papel muda objetivo e permissões: recepção encaminha; SDR reduz lacunas úteis;
vendas recomenda; closer trata decisão/condições; suporte resolve; pós-venda acompanha.
Não obrigar coleta de orçamento/equipe/maturidade digital no varejo ou suporte.
Perguntar somente o necessário; responder dúvidas antes de conduzir próximo passo.
Permitir resposta longa quando útil (comparação/catalogo); concisão não é verdade.
Detectar repetição/frustração e mudar estratégia, não apenas sinônimos de texto.

CRM: preencher intenção, interesse, condições informadas, objeção concreta, urgência
com evidência, responsável e próxima ação real. Desconhecido permanece desconhecido.
Separar fatos de cliente, compromisso de atendente e sugestão da IA. Não deduzir
venda ou reunião confirmada somente da linguagem. Proteger edição manual e autoria.
IA pausada para responder não pausa observação passiva autorizada. Ação escrita
continua sujeita à política; leitura de grupo não cria lead de participante.
Copiloto usa o mesmo contexto e ferramentas de leitura; rascunho não é mensagem enviada.
Transferência mantém resumo útil, fontes, tentativa anterior e pendência; humano
assume com exclusividade. Retomada da IA é explícita e revalida caso/contexto.

## 9. Segurança, operação e produto

Tenant e conta validados em armazenamento, busca, execução e envio; nunca aceitar
tenant/permissões sugeridos pelo modelo. Grupos ficam fora de resposta autônoma.
Comentário público não expõe dado privado nem aciona escrita sensível. Identificar
assistente virtual sem fingir ser pessoa. Documentos e retorno de tools são dados
não confiáveis; ignorar instruções embutidas. Segredos nunca entram no prompt/log geral.
Observabilidade registra versão/modelo/configuração, fontes, ações, resultados,
transformações e tempos, com acesso restrito e retenção; não exigir raciocínio privado.
Controle técnico fica em perfil avançado. Cliente vê pendência, resultado ou ajuste útil.
Medir limites/custo e saúde de integrações; pausa segura por conversa/tenant/motor.
Falha de quota/provedor gera estado visível e alternativa validada, não sucesso falso.

## 10. Execução interna, sem entrega fragmentada

| Etapa | Entrega e dependência | Condição de saída |
| --- | --- | --- |
| A — Contrato e baseline | Inventário produção/local, capacidades por tenant de teste, cenários e decisão de base técnica. Nenhuma troca de produção. | Falhas prioritárias reproduzíveis, escopo fechado, dados de teste e custos da avaliação definidos. |
| B — Fundação confiável | Fechar pendências de entrega/ações (gate 2 anterior), ordem de turnos, controle humano e identidade básica. | Repetição, queda/restart e confirmação incerta não causam efeitos duplicados ou vazamentos. |
| C — Contexto empresarial | Casos, memória, configuração, ingestão e recuperação de conhecimento. Depende B. | Correções, fontes, retomada, exclusão e isolamento passam testes; busca atende corpus dos três negócios. |
| D — Agente operacional | Um loop com ferramentas e validação; retirar dependência dos resgates genéricos. Depende C. | Jornadas completas de comércio, serviços e suporte executam resultados verificáveis. |
| E — Operação humana/multicanal | CRM passivo, copiloto, transferência, distribuição e contexto social necessários. Depende D. | Testes autenticados desktop/mobile e de canais cobrem controle, dados e retomada. |
| F — Aceitação integrada | Modelo real, regressão, comparação humana, falhas e pacote fechado. Depende E. | Todos os bloqueadores resolvidos e critérios abaixo aprovados, sem médias escondendo falha crítica. |
| G — Virada controlada | Piloto restrito, confirmação de versão, migração compatível e publicação integrada. Depende F. | Atendimento real autorizado com resultado, domínio/versionamento conferidos, recuperação e rollback comprovados. |

Etapas históricas permanecem registradas; gate 2 não fica pronto por criar este plano.
Se uma etapa falhar, corrigir e repetir. Trabalho de outra etapa não justifica marcar
a dependência pronta. Não usar bypass para publicar o novo motor integral sem prova.

## 11. Bateria e critérios de aprovação propostos

100 cenários-base distintos, inicialmente 40 comércio, 35 serviços e 25 suporte;
4–20 turnos típicos, além de casos de histórico longo, reinício e retorno tardio.
70 para desenvolvimento, 30 reservados para avaliação sem ajuste por transcrição.
Repetir cada cenário ao menos três vezes com inferência real (300 execuções);
casos críticos cinco vezes. 300 é piso, não total máximo. A matriz de cobertura
deve acrescentar casos para C01–C21, falhas, canais e conectores ausentes na base.
Cada capacidade tem cenário positivo, negativo e de recuperação quando aplicável.
Fixtures não substituem modelo real nem teste de canal.
Integrações simuladas no desenvolvimento; ambientes de teste reais para contratos
e casos autorizados em produção para o piloto. Nenhum envio a cliente incidental.
Orçamento máximo registrado antes da bateria paga; não há orçamento presumido aqui.

Cobertura obrigatória: sim/esse/cor, correção, digitação, várias perguntas/assuntos,
mudança de produto, produto sem estoque, políticas contraditórias, documento longo,
story expirado, dado de cliente alheio, injeção em arquivo, humano, quota, timeout,
resposta perdida após ação, replay de webhook, concorrência, restart, exclusão e CRM.

Metas iniciais, fixadas antes das execuções e não reduzidas para aprovar resultado:
- Nenhuma violação crítica observada: tenant, privacidade, ação proibida,
  duplicação de efeito sensível ou confirmação inventada nos cenários de aceitação.
  Zero observado não é garantia universal; incidente crítico bloqueia ampliação.
- >=95% de preservação dos fatos/objetos relevantes, por família de jornada.
- >=90% de sucesso da tarefa com recursos disponíveis, calculado sobre execuções
  individuais, por família; não selecionar a melhor de três tentativas como resultado;
  falha de integração é avaliada separadamente por recuperação correta, não excluída
  silenciosamente da estatística. Transferência só conta se for o resultado esperado.
- >=90% dos casos sem repetição desnecessária de pergunta já respondida.
- Revisão humana cega: todos os casos críticos, todas as falhas e amostra de ao
  menos 30 conversas; notas >=4/5 de compreensão e naturalidade em >=90% da amostra.
- Comparação pareada com motor atual: melhorar os defeitos prioritários e sucesso
  onde houver espaço; não regredir em jornadas já corretas ou segurança. Atingir
  também os critérios absolutos: superar um baseline ruim não é suficiente.
- P95 proposto <=20s para resposta simples, <=40s para consulta com ferramentas,
  da persistência da mensagem até aceite no mecanismo de envio, incluindo fila,
  agregação e retries. Medir também primeira mensagem do grupo até resposta,
  entrega pelo provedor, taxa de timeout e idade máxima pendente: não esconder
  espera reiniciando o relógio a cada fragmento. Confirmar SLA por canal na etapa A.
- Custos por conversa/tarefa resolvida dentro do teto aprovado na etapa A.
- Tipos, lint, build, testes unitários, integração, regras/índices, migração,
  autenticados desktop/mobile e rollback aplicáveis aprovados sobre o pacote exato.

Não usar nota heurística, autoavaliação do agente, silêncio do cliente ou links
enviados como comprovação de resolução/venda. Avaliador automatizado é auxiliar,
calibrado contra humano; conferir estado final do sistema e consistência repetida.
Registrar numerador, denominador, falhas por tentativa, transferência e motivo.
Não retirar da avaliação capacidade anunciada que falhou em integração. Separar
cenário não suportado de suportado indisponível e de ferramenta executada errada.
Falha crítica bloqueia por ocorrência, sem compensação por respostas corretas.
Amostras pequenas trazem incerteza: registrar dispersão e limites do conjunto,
sem vender percentuais de laboratório como previsão universal de produção.
Todo defeito repetido vira caso de regressão; mudanças após avaliação invalidam
a prova afetada e exigem nova execução. Conjunto reservado não vira treino informal:
se usado para ajustar comportamento, repor casos independentes antes de aprovação.

## 12. Migração e publicação

Preservar fonte de produção e alterações Shopify/outros chats. Pacote com lista e
hashes revisados; nenhuma publicação de todo o checkout compartilhado por comodidade.
Escritas novas compatíveis, backfill versionado e auditável; preservar dados legados.
Não apagar histórico/configuração. Dados comprovadamente indevidos passam revisão
de alvo e operação recuperável, nunca limpeza ampla automática.
Shadow não envia, agenda ou altera CRM real; bloquear efeitos também dentro de tools.
Motor por conversa fica fixado na fronteira de turno, com revisão/epoch de posse
verificada no servidor. Controlar jobs em andamento, drenar/invalidar claims antigos
e impedir disputa com o novo executor. Troca de motor não renova intenção de ação.
Rollback revalida efeitos já realizados; não reenviar ação antiga por mudar motor.
Inspecionar mudanças de schema/índices/regras e testar retorno antes de promover.
Remover código antigo somente após observar a migração e verificar ausência de
consumidores; encerramento definitivo tem checklist próprio, sem prazo fictício.

## 13. Backlog anterior preservado e destinos

| Pendência | Destino / regra |
| --- | --- |
| Automação send_message fora do outbox; leases/reconciliação de campanhas | B. Fechar identidade e recuperação; não dar como pronto por este plano. |
| Contratos divergentes autonomia/handoff/CRM; falhas de QA autenticado | A identifica causa; B/E/F exigem provas comportamentais, não enfraquecer testes. |
| CRM passivo, campos úteis, sugestões e edição manual | C/D/E; contrato de evidências por negócio. |
| Duplicação/identidade e responsáveis históricos | B/C/E; migração auditada, não unir por nome. |
| Nome/renome de grupo e contaminação antiga do CRM | E; nome via provedor e limpeza revisada; sem ativar IA em grupos. |
| Distribuição automática todos os canais | E; concorrência, disponibilidade, preservar dono e opção manual. |
| Story/post e contexto de campanha | E; referências disponíveis e fallback seguro. |
| Meta anúncio→WhatsApp→venda→conversão; Google | Trilha de atribuição preservada e separada. Teste antes dispensado continua pendente; não chamar motor pronto de atribuição pronta. |
| Lixeira, retenção, Storage órfão e novas coleções | B/C/F conforme armazenamento criado; cobrir novas projeções e índices. Política global anterior continua registrada. |
| Desktop/mobile, sessão, upload, rascunho e reconexão | E/F; prova sobre versão atual, não snapshot antigo. |
| IA em uma conversa | B/E/G; manter trava de escopo e validar controle visível existente. |
| Áudio/transcrição/contrato audio_unclear | Adiado por decisão do cliente; não removido nem classificado resolvido. |
| Falhas e alterações de admin, páginas públicas e trabalhos paralelos | Fora do pacote; preservar e comunicar interferência se houver. |

## 14. Como reportar progresso

Por capacidade: planejada → implementada → testada → publicada → comprovada em uso,
com versão, evidência, limitações e responsável pela validação. Provas parciais não
autorizam afirmar transformação completa. Uma capacidade dependente de acesso
externo sem prova permanece pendente, não aprovada por suposição.

Ponto inicial do plano: etapa A; estado atual no progresso e auditoria de saída A.
Este documento não instala framework, não
executa avaliação paga, não habilita tenant e não publica o novo motor.

## 15. Acesso, canal e identidade de cada vendedor

Inspeção local confirma usuários/memberships, restrição comercial e a tela Meu
WhatsApp com channelScope personal e ownerUserId. Isso permite canal próprio,
não significa que todo vendedor já tenha número conectado, nem comprova o
funcionamento em produção de todas as permissões. Há também canais compartilhados.
O aprendizado atual inspecionado é por tenant; perfil comportamental por vendedor
continua requisito novo, não capacidade existente comprovada.

Não confundir dono do canal, responsável pelo lead e autor da mensagem. Registrar
autoria pelo evento autenticado de envio; mensagens recebidas como eco do aparelho
podem não identificar a pessoa. Sem autoria confiável, não atribuir estilo individual
nem métricas ao vendedor; pode haver apenas evidência do canal/equipe, se autorizada.
Mensagens geradas por IA, macros e encaminhamentos são identificados separadamente.
Em rascunho editado, distinguir sugestão original do texto humano efetivamente enviado.

Perfil individual pertence ao tenant e vendedor, não acompanha a pessoa para outra
empresa. Troca de responsável preserva fatos do cliente, não transfere identidade do
antigo vendedor. Desligamento revoga acesso e impede uso indevido do perfil; aplica
retenção definida. Um aparelho/número não dá autorização para ler conversas pessoais.
Somente conteúdo corporativo capturado por integrações habilitadas e escopo definido.
Vendedor não pode ampliar acesso marcando outro canal como seu. Validar no servidor.

## 16. Aprender com humanos enquanto o atendimento continua

Pipeline independente: mensagem persistida → evento/observação durável → atribuição
de autoria → fatos/pendências/CRM → candidatos de aprendizado → avaliação → perfil
ativo versionado. O agente atende com a última versão aprovada; processamento de
aprendizado não bloqueia resposta nem altera instruções no meio de um turno.

Três destinos distintos:
1. Memória do cliente: preferência/necessidade/correção, com evidência e validade.
2. Perfil do vendedor: concisão, formalidade, vocabulário profissional e maneira de
   explicar/organizar opções, quando úteis e consistentes em contextos comparáveis.
3. Conhecimento/processo da empresa: candidatos como política ou procedimento;
   mudança comercial exige aprovação adequada, nunca inferência de uma exceção.

Prioridade: permissões e política da empresa → contexto/necessidade do cliente →
objetivo do papel → preferências do vendedor. Perfil não autoriza desconto, promessa,
pressão, informação falsa, coleta excessiva ou desrespeito. Não imitar erro, sarcasmo,
preconceito ou identificação falsa como se a IA fosse aquele humano.
Adaptar estilo ao cliente atual; não aplicar assinatura/manias do vendedor cegamente.

Observar exemplos e registrar candidatos pode ser automático. Nesta entrega, a
ativação de perfil aprendido exige aprovação humana autorizada e teste: promoção
automática de estilo fica desabilitada, sem impedir extração contínua de candidatos.
Não reutilizar os mínimos de 8 sinais/3 relacionamentos do aprendizado comercial
existente como prova suficiente de estilo individual. Proposta de elegibilidade:
20 conversas corporativas com autoria confiável, pelo menos 5 clientes distintos
e 2 contextos de atendimento, com amostra revisada; isso permite avaliar, não garante
qualidade. Abaixo disso, manter padrão da empresa e mostrar evidência insuficiente.
Calibrar antes da aprovação, não reduzir a amostra para aparentar aprendizado ativo.
Política, permissão, preço e procedimento sensível não são promovidos automaticamente.
Uma eventual promoção automática futura terá contrato/testes e decisão separados.
Todo perfil permite
inspeção, correção, pausa e reversão por ator autorizado. Poucos exemplos mantêm
perfil empresarial padrão, sem fingir personalização aprendida.
O perfil contém preferências estruturadas permitidas, não um prompt livre derivado
de transcrições. Analisar técnicas de venda separadamente de estilo: técnica só vira
procedimento recomendado com revisão contextual e autorização do negócio.
Na resposta, aplicar perfil do vendedor responsável validado para aquela conversa;
na ausência de dono ou autoria confiável, usar o perfil da equipe, não escolher o
vendedor com mais vendas. Troca de dono não importa memórias privadas daquele vendedor.

Critérios adicionais:
- Contextualizar sucesso por produto, disponibilidade, origem, tipo de cliente e
  dificuldade. Conversão maior não comprova causalmente técnica melhor de vendedor.
- Atendente ruim não vira referência por volume. Distinguir boa resolução de
  silêncio, abandono e promessa que só aparece como problema dias depois.
- Cliente ou vendedor não injeta instruções no aprendizado; conteúdo é evidência,
  não comando. Repetir a mesma conversa não aumenta diversidade de exemplos.
- Candidatos preservam fonte/revisão, evidência conflitante, validade e avaliação;
  apagar fonte exige invalidar derivados e reavaliar perfil quando necessário.
- Exemplos da equipe reutilizados não revelam dados, condições ou conversas de
  outros clientes ao vendedor nem ao destinatário da resposta.

## 17. Observação contínua com cobertura verificável

Contínua significa operação por eventos, não um modelo relendo tudo sem parar.
Processar mensagens novas e mudanças relevantes; usar extração leve quando suficiente
e análise de modelo por necessidade/lote. Não gastar chamada de modelo para cada
releitura. Filas de atendimento e auditoria têm capacidade e prioridades distintas.

Controles independentes: responder, observar, preencher CRM e aprender comportamento.
Pausar resposta não desliga automaticamente os demais; pausa/negação de observação
e escopo de privacidade continuam sendo respeitados. Sistema não lê fora da integração.
Histórico não disponibilizado pelo provedor permanece ausente; importar não significa
observar tudo. Exibir período coberto, última mensagem analisada, atraso e falhas.
Após desconexão, buscar lacunas quando suportado, sem inventar eventos inexistentes.

Idempotência por mensagem/revisão/analisador, ordenação e checkpoint durável. Reprocessar
um caso não duplica tarefa ou movimento do funil. Reconciliador detecta mensagem
persistida sem observação e retoma jobs parados. Observação tem metas de atraso,
alertas e revisão de dead-letter, não garantia fictícia de processamento instantâneo.
Meta proposta de CRM/observação: P95 <=60s da persistência em operação normal; medir
backlog e recuperação separadamente. Canal externo pode impor atraso anterior.
Antes de uma resposta/ação que dependa de uma correção recente ainda não projetada,
o contexto deve incorporar os eventos recentes persistidos ou aguardar reconciliação
limitada. Não apresentar como atualizado um CRM atrasado nem congelar todo atendimento
porque o processamento de aprendizado está atrasado.

CRM atualiza fatos e próxima ação sem esperar IA responder. Mudança de etapa exige
evidência e mapeamento do funil real do negócio. Proposta mencionada não significa
enviada; intenção de compra não significa ganho. Correções manuais prevalecem até
mudança explícita posterior, com histórico e conflito revisável. Mensagem fora de
ordem não reverte decisão recente. Grupos e conversas pessoais são excluídos conforme
escopo; participante não vira lead automaticamente.

## 18. Integrações reais e configuração clara

Inventário de cada conector: recursos suportados, tenant/conta, credencial, permissões,
operações de leitura/escrita, última prova funcional, falhas, validade/cache e limitações.
Validar credencial e executar leitura segura no sistema real de teste; escrita só em
sandbox ou caso explicitamente autorizado. Saúde inclui permissão por operação e
atualização dos dados, não apenas HTTP 200 de autenticação.
Separar catálogo importado de consulta ao vivo; lojas/unidades/contas ambíguas pedem
seleção. Troca de conta invalida contexto antigo incompatível e não reutiliza estoque.
Rotação/revogação de credenciais retira ferramenta indisponível sem expor segredo.
Priorizar os conectores existentes e os necessários às jornadas; não prometer suporte
universal a ERP/agenda/ecommerce ainda não implementado. Cada conector precisa de
contrato e aceite próprios. Frete, pagamento e checkout dependem de recursos distintos.

Tela existente Assistente Altum: concentrar no que o cliente precisa decidir:
- Negócio, ofertas/documentos e lacunas relevantes de conhecimento.
- Onde a IA atende e modo: responde, acompanha humano ou fica desligada.
- Ações permitidas, limites, agenda e critérios/destino de transferência.
- Aprendizado da empresa e perfil do vendedor com escopo e versão ativa claros.
- Integrações com capacidade verificada, última checagem e ação de correção.
- Teste em conversa restrita, fontes/resultado e salvar/publicar configuração.

Inventariar controle a controle: origem, persistência, consumidor no motor, permissão,
efeito observável e teste. Se útil mas quebrado, corrigir e sinalizar indisponibilidade;
se redundante, unificar; se técnico, mover para avançado autorizado; se inútil, remover
da interface. Não apagar código/dado com consumidor ativo sem migração. Não manter
slider/nível que apenas prometa inteligência sem mudança demonstrada de capacidade.
Salvar usa confirmação do servidor; recarga preserva valores; teste e produção usam
a mesma configuração versionada. Separar rascunho, versão ativa e falha de publicação.
Não exibir sucesso antes da persistência nem status conectado sem prova suficiente.

Etapas A/C/D/E recebem estes requisitos; C18–C21 entram no aceite integrado F.
Testes adicionais obrigatórios: vendedor A/B em canal próprio/compartilhado; autor
desconhecido; troca de dono; offboarding; rascunho editado; bot aprendendo de si mesmo;
erro/desconto excepcional; baixo volume; mudança de estilo sem interromper atendimento;
IA pausada com CRM ativo; fila atrasada/replay; fonte apagada; permissão revogada;
configuração salva/recarregada aplicada ao tenant certo; credencial válida com ação
negada; múltiplas lojas; UI desktop/mobile sem controles mortos. Nenhuma dessas
capacidades fica aprovada apenas por registrar este complemento.

## 19. Contratos para impedir disputa, dado errado e efeito indevido

### 19.1 Autorização não termina na escolha da ferramenta

Uma execução carrega tenant, conta, canal, destinatário, ator, papel, assunto,
objetos, revisão de configuração e intenção. Resolver esses valores no servidor,
não a partir de IDs/URLs sugeridos pelo modelo. Expor só campos necessários.
Conta da empresa não autoriza automaticamente o vendedor a acessar todo cliente.
Serviço observador pode processar escopo empresarial autorizado sem expor os
registros a usuários que não têm permissão; backend e interface aplicam acesso.
Visibilidade de uma ferramenta não substitui autorização da chamada concreta.

Antes de escrita externa e antes de enviar, revalidar: tenant/objeto/destinatário,
posse humana, versão/epoch do turno, permissão revogada, capacidade disponível e
pré-condição usada pelo plano. Emergência/parada interrompe efeitos ainda não
executados, inclusive em job iniciado antes da pausa. Não esperar só o próximo turno.
Se a ação já ocorreu, registrar e conciliar o resultado; não fingir cancelamento.
Sem prova de exclusividade válida, o processo antigo perde direito de agir/enviar.
Envio já aceito pelo provedor pode não ser cancelável; tornar essa fronteira explícita.

### 19.2 Cada ação precisa de um registro durável

Estados: proposta → aguardando confirmação/aprovação → autorizada → executando →
concluída ou falhou; resultado externo incerto vai para confirmação pendente.
Confirmação vincula objeto, valores, intenção, prazo e versão, não um sim genérico
da conversa. Alteração material de preço, horário ou destinatário invalida confirmação.
Leitura pública de catálogo não exige autenticar cliente; pedido privado e escrita
seguem a verificação específica. Não solicitar senha, cartão ou segredo em chat.

Idempotência usa intenção de negócio estável e operação, não ID de tentativa nem
fingerprint novo a cada replanejamento. Texto novo não duplica agendamento antigo.
Se provedor não suporta chave/consulta/reconciliação suficiente para escrita segura,
restringir ação automática e encaminhar; não prometer exatamente uma execução global.
Retries só para falhas classificadas recuperáveis, com limite, atraso e orçamento.
Erro de permissão, validação, preço ou regra não vira retry infinito ou modelo alternativo.

### 19.3 Integridade de memória e casos

Caso mínimo: identidade confiável, objetivo, objetos envolvidos, revisão, estado,
evidências, pendências e efeitos. Estados: aberto, aguardando cliente, aguardando
equipe/sistema, resolvido ou cancelado. Silêncio não muda para resolvido sozinho.
Não criar caso a cada mensagem nem exigir classificador novo para uma saudação.
Mesclar/separar casos somente com evidência; preservar vínculo e trilha de correção.
Histórico original e ordem do provedor/ocorrência diferem de data de processamento;
empate usa chave estável. Evento tardio pode complementar, não reverter decisão recente.

Para valores conflitantes, distinguir correção, preferência, pedido hipotético e
fato operacional. Pedido do cliente não altera preço do catálogo. Agente não pode
regravar sua própria hipótese como declaração do cliente. Notas internas não são
conteúdo público. Perfil do vendedor não compartilha casos de clientes diferentes.
Revisão de memória/contexto congela por turno; revalidar somente pré-condições que
mudaram antes do efeito, sem misturar silenciosamente duas configurações.

### 19.4 CRM, funil e automações

Definir propriedade por campo: manual bloqueado, fato observado, valor de sistema,
sugestão ou derivado. Atualização registra valor anterior, fonte e conflito. Evento
novo pode corrigir fato observado; alteração manual bloqueada não muda silenciosamente.
Versão do funil e IDs das etapas pertencem ao tenant; renome/reordenação não remapeia
por rótulo genérico. Mover etapa usa regra explícita e condições verificadas.
Reprocessar observação não reenvia campanha nem repete automação acionada pelo CRM.
Mudança do cliente causada pela IA e eco do provedor preservam identidade causal;
evitar ciclo CRM→automação→mensagem→CRM. Ignorar evento duplicado não ignora correção.
Responsável recebido de canal pessoal não é substituído por distribuição automática.
Disputa entre atribuição humana e round-robin exige resolução transacional.

## 20. Escopo fechado, controles e integrações com dono

Entrega integrada não significa prometer todo ERP, setor ou idioma do mercado.
Na etapa A, produzir manifesto C01–C21 × tenant piloto × canal × conector × ação,
com responsável, entrada/saída, limites, evidência requerida e estado. Cada capacidade
anunciada tem pelo menos um caminho real de aceite; indisponível não conta como pronta.
Capacidade necessária sem acesso externo bloqueia aceite correspondente e exige
decisão explícita, nunca retirada silenciosa do denominador ou do plano.

Três fixtures empresariais independentes: comércio com Shopify, serviços com agenda/
orçamento e suporte com políticas/documentos. Cada uma tem tenant sintético, usuários,
dados corretos de referência e objetivo esperado. Clientes piloto reais exigem
escopo aprovado; não usar dados empresariais aleatórios como ambiente de teste.

Manifesto de integração registra capacidades separadas: catálogo, estoque, preço,
URL, frete, pedido, proposta, agenda e escrita. Não inferir frete de produto nem
estoque online de quantidade agregada. Cada recurso indica autenticação, loja/unidade,
moeda/fuso, validade, quota, paginação, erro esperado e comportamento de indisponibilidade.
Testar mudança/revogação e concorrência; validar URL por domínio/objeto antes de enviar.
Acompanhamento automático só existe com tarefa, executor, destinatário, condição,
política de contato e tratamento de expiração/cancelamento; tarefas sem executor
viram pendências humanas explícitas, não promessas de retorno automático.

Configuração do cliente terá quatro controles distintos de resposta, observação,
CRM e aprendizado, com dependências claras: CRM/aprendizado exigem observação
autorizada. Desligar observação impede novos derivados e cancela jobs conforme
política; desligar aprendizado não apaga memória útil nem desliga atendimento.
Perfil empresarial, papel, autonomia e estilo pessoal têm significado e precedência
visíveis. Salvar rascunho não ativa versão. Publicar revalida permissões e detecta
edição concorrente; conflito não sobrescreve configuração de outro gestor.
No teste, informar versão ativa ou rascunho escolhido; efeitos externos desligados
por padrão. Não prometer que todo preview tem o mesmo efeito de uma conversa real.

Para remover controles, mapear dependências e migrar valores. Não apagar opção que
operadores usam só porque é técnica; recolocar em avançado autorizado. Nenhuma
remoção de histórico/dados é autorizada pela limpeza visual. Verificar acessibilidade,
teclado, toque, mobile, mensagens de erro e estado não salvo, não apenas aparência.

## 21. Sustentabilidade, cobertura e prova de operação

Atendimento tem prioridade sobre auditoria/aprendizado em filas e orçamento. Limitar
concorrência por tenant, conta e provedor; uma empresa não esgota o serviço das demais.
Backpressure preserva eventos e mostra atraso. Limite de custo pode adiar análises
não urgentes, mas nunca marcar mensagem não processada como aprendida. Auditoria
atrasada não pode impedir parada humana ou verificação de permissão em tempo real.

Antes da avaliação paga, a etapa A deve registrar modelo/versão, orçamento de contexto,
quais conteúdos podem ir ao provedor, teto monetário da bateria e limite por tenant.
Sem essa decisão não rodar bateria paga; trabalho determinístico continua possível.
Modelo alternativo precisa passar contrato de tools, segurança e qualidade; não
trocar silenciosamente para uma capacidade inferior apenas para retornar texto.

Segurança de arquivos: limites, tipo real, extração, quarentena e controle de acesso.
Busca deve filtrar tenant/permissões antes de devolver conteúdo, inclusive título,
trecho e metadado. Cache inclui tenant, escopo, versão e identidade necessários;
revogação de documento/fonte/perfil invalida derivados/cache. Tombstones bloqueiam
ressurreição por reindexação, importação ou replay. Links externos e fetches de tools
não permitem destinos internos arbitrários; saídas têm validação e logs mínimos.

Artefatos de aprovação por etapa: manifesto de capacidades, resultados por caso,
traces protegidos, versões/hashes, falhas conhecidas, custo/latência e decisão do gate.
Responsáveis mínimos: executor técnico; dono do negócio para regras e exemplos;
revisor humano de atendimento; aprovador do piloto/publicação. Uma pessoa pode acumular
papéis identificados, mas o agente não é o único juiz da própria naturalidade.
O plano não atribui pessoas específicas nem presume agenda/acesso desses revisores.

Antes de G: ensaio de carga com fila concorrente, quota/queda de provedor, restart,
troca/expiração de credenciais e reconciliação após efeito incerto. Restaurar backup
em ambiente isolado e verificar projeções/regras/índices; rollback de código sozinho
não desfaz ações nem schema incompatível. Drenagem não pode perder evento/observação.

Piloto restrito é validação da versão completa, não entrega de recursos pela metade.
Entrada exige F; saída proposta: 7 dias consecutivos e ao menos 50 conversas reais
elegíveis de escopo autorizado, com ao menos dois negócios distintos e cobertura
real de todos os canais anunciados. Pouco volume estende observação; não fabricar
conversas reais nem usar simulação como substituto. Pode revisar amostra/prazo somente
antes do piloto, com justificativa e sem esconder incerteza. Não é prazo de construção.
Critério de expansão: nenhuma ocorrência crítica, falhas não críticas revisadas,
observação/CRM dentro dos limites e responsáveis disponíveis. Sem esses requisitos,
piloto não autoriza afirmar operação universal ou liberar todos os tenants.

Parada imediata do escopo afetado: vazamento, escrita proibida, destinatário errado,
efeito sensível duplicado, confirmação operacional falsa ou disputa com humano.
Erro localizado de conector pode desabilitar ferramenta/tenant, preservando atendimento
seguro restante. Incidente no núcleo exige parar a versão. Registrar efeito, responsável,
reconciliação, comunicação e prova de correção antes de retomar. Nunca fazer fallback
para motor antigo se ele puder repetir efeitos ou violar a pausa que motivou a parada.

## 22. Decisões e registros obrigatórios para iniciar execução

Não iniciar B sem fechar A. As decisões abaixo são entregáveis de A, não escolhas
ocultas do implementador nem motivos para ficar pedindo aprovação a cada linha:
- Base única de execução, persistência e fornecedor/modelo inicial, com critérios.
- Conectores/canais/ações da entrega, escopos de leitura/escrita e acessos disponíveis.
- Amostra empresarial, fontes corretas, donos das políticas e revisores humanos.
- Orçamento de avaliação e operação, retenção de fontes/derivados/traces e permissões
  para observação empresarial e aprendizado de perfis. Lacuna bloqueia só uso afetado.
- Contratos de ação/confirmação, evidências de CRM e mapeamento dos funis por tenant.
- SLOs, matriz de testes por capacidade e condições de piloto/publicação/rollback.

Execução exige checklist de unidade de trabalho: ID Cxx, arquivos/coleções/consumidores,
precondição, teste, responsável, evidência e rollback. Entregável não é apenas novo
arquivo ou endpoint: requer consumidor real e remoção do caminho conflitante quando
segura. Reaproveitar implementação existente somente após comprovar o contrato.
Não criar segunda família de flags/fila/memória paralela sem plano de consolidação.
Mudança de escopo atualiza esse manifesto e seus testes antes da implementação.

## 23. Registro da revisão crítica do plano — revisão 2

| Falha do plano anterior | Correção de planejamento |
| --- | --- |
| Promessa ampla de 21 capacidades sem caminho real por negócio | Manifesto fechado por tenant/canal/conector/ação; indisponibilidade explícita e dono. |
| Observação desenhada depois do envio apesar de funcionar sem resposta | Ramo independente desde persistência, incluindo correções e recibos. |
| Parada humana não detalhava ação já em execução | Revalidação pré-efeito/pré-envio, epoch de posse e tratamento de efeito irreversível. |
| Idempotência podia mudar com cada replanejamento | Intenção durável independente de retry, texto e motor, com reconciliação. |
| Memória/CRM assíncronos podiam perder correção recém-chegada | Incorporar eventos recentes ou reconciliar pré-condição com limite. |
| Aprender estilo automaticamente ainda tinha critérios vagos | Perfil estruturado, amostra revisada e ativação humana; automático futuro separado. |
| Permissão do tenant podia ser confundida com acesso de cada vendedor | Autorização do objeto/campo, serviço observador restrito e autoria separada de dono. |
| Autopreenchimento podia disparar loops de automação | Origem causal, revisão, propriedade por campo e efeitos deduplicados. |
| Quantidade fixa de testes podia deixar capacidades novas sem prova | Matriz C01–C21 e casos extras positivos/negativos/recuperação. |
| Métricas podiam esconder falhas por tentativa ou baseline fraco | Denominadores, repetição, critérios absolutos e crítico bloqueante. |
| Latência podia ignorar fila/agregação | Medir ponta a ponta e espera desde primeiro fragmento, além do provedor. |
| Configuração não explicitava dependências nem edição concorrente | Quatro controles, rascunho/ativo, revisão e teste sem efeitos por padrão. |
| Orçamento, quota e custo da análise contínua sem proteção suficiente | Prioridades, limites por tenant/provedor, backlog visível e teto antes do uso pago. |
| Piloto/rollback eram genéricos | Entrada/saída, amostra/período propostos, causas de parada e reconciliação de efeitos. |
| Atualização/remoção de dado podia deixar cópias ou ressuscitar informação | Invalidação de cache/índice/perfil e tombstones/replay testados. |

Esta revisão reduz ambiguidades, não comprova a implementação desses controles.
Planejamento permanece aberto às decisões listadas em A; não há publicação nesta rodada.
