# Registro de problemas relatados por clientes — Altum

Atualização de 20/10/2026 às 20h17: [recepção Meta corrigida e publicada](CORRECOES_INSTAGRAM_MESSENGER_2026-10-20.md) na conta Savio Cipriano. Novo recebimento Instagram confirmado, 23 mensagens anteriores recuperadas e consulta autenticada dos dois canais aprovada. O teste de um novo evento Messenger ainda não foi identificado nos registros consultados.

Atualização de publicação, 20/10/2026 às 19h25: as correções de Conversas e suas dependências foram [publicadas e verificadas](PUBLICACAO_CONVERSAS_2026-10-20.md). Houve conferência autenticada de conversa, histórico, áudio e conexão de eventos na conta Savio Cipriano. Os trechos abaixo que mencionam correções locais preservam as etapas anteriores; a validação operacional completa da ESB, do iPhone e de novos eventos de WhatsApp/Instagram continua pendente.

Registro iniciado em 20/10/2026. Cliente: ESB Variedades / Moda Masculina. Relator: Elder Souza e equipe de vendas.

Atualização de 20/10/2026: realizada [avaliação técnica do código local](AVALIACAO_TECNICA_ESB_VARIEDADES.md), com achados e 40 testes existentes aprovados. Os nove itens estão em investigação; não houve correção funcional ou validação na conta do cliente nesta etapa. As descrições abaixo preservam o levantamento inicial; a avaliação vinculada detalha quais hipóteses ganharam evidência técnica.

Atualização posterior: implementadas [correções locais de Conversas e funil](CORRECOES_CONVERSAS_ESB_2026-10-20.md), com regressões e integração em ambiente fictício. ALT-002 tem causa reproduzida e correção testada. ALT-001/006/007/008 receberam correções relacionadas, ainda aguardando validação visual/operacional e publicação. Os demais itens mantêm a investigação; não houve validação na ESB.

Atualização com vídeo: recebida a gravação de 18,6 segundos do uso no iPhone. A [análise visual com tempos aproximados](ANALISE_VIDEO_MOBILE_ESB_2026-10-20.md) acrescenta problemas de apresentação dos controles e instabilidade do histórico. Não confirma reprodução de áudio, entrega ao destinatário nem a causa técnica desses sintomas.

Revisão posterior do fluxo completo: [causas e correções de mídia e operação](CORRECOES_CAUSAS_CONVERSAS_2026-10-20.md). Inclui envio sem assinatura para Meta/Evolution, armazenamento consistente, fonte original de áudio preservada, histórico estável durante atualização, controles móveis, devolução/transferência e prazos. Há testes locais e de integração; os incidentes reais ainda não foram validados após publicação.

As datas e os horários dos prints são referências das evidências, não datas confirmadas dos incidentes. As capturas exibem “Hoje”, sem data absoluta. O levantamento inicial foi visual; a avaliação posterior revisou código local, sem logs ou dados da conta. Nenhum item está validado na operação real por este registro.

## Regras de acompanhamento

- Estados: pendente → em investigação → corrigido → validado. Corrigido exige alteração identificável e testes; validado exige confirmar o comportamento esperado no cenário afetado. Se a validação falhar, voltar para em investigação.
- Separar evidência visual, relato e hipótese. Uma mensagem do cliente comprova o relato, não a causa técnica.
- Preservar os IDs e acrescentar novas evidências ao mesmo item quando o sintoma for o mesmo.
- Antes de alterar a operação real, identificar canal, conversa, mensagens e ambiente afetados. Não reproduzir enviando mensagens a clientes sem autorização.
- Responsável técnico e previsão de resolução: ainda não definidos.

## Resumo

A tabela registra o estado atual. Os detalhes do levantamento abaixo preservam as hipóteses iniciais; os relatórios vinculados descrevem as correções posteriores. Nenhum item tem aceite na conexão real da ESB.

| ID | Problema | Prioridade | Evidência | Status |
| --- | --- | --- | --- | --- |
| ALT-001 | Áudios recebidos indisponíveis | Crítica | Visual e relato | Correções locais de mídia; aguarda validação operacional |
| ALT-002 | Marcadores de áudio repetidos | Alta | Visual e reprodução local | Corrigido localmente; aguarda publicação/validação |
| ALT-003 | Prazos de atendimento possivelmente incorretos | A definir após diagnóstico | Indicadores visíveis; erro não comprovado | Causas de prazo corrigidas localmente; regra real a validar |
| ALT-004 | Estados e responsabilidade pouco claros | Alta | Visual, relato e revisão do código | Atribuição corrigida localmente; clareza de uso a validar |
| ALT-005 | Falha no envio de mensagens | Crítica | Relato; atualização da entrega com falha no código | Transporte corrigido localmente; entrega real a validar |
| ALT-006 | Lentidão e atraso no atendimento | Crítica | Relato e intervalos identificados no código | Atualização corrigida localmente; desempenho real a medir |
| ALT-007 | Divergência entre WhatsApp e Altum | Crítica | Relato e limitações identificadas no código | Importação e atualização testadas localmente; histórico real a comparar |
| ALT-008 | Dificuldade para responder pelo computador | Alta | Relato e captura parcial | Layout ajustado localmente; validação visual pendente |
| ALT-009 | Dificuldade para desfazer a tomada de atendimento | Alta | Relato e revisão do código | Devolver/transferir corrigidos e testados localmente |
| ALT-010 | Grupo aparece com nome genérico | Alta | Novo print e correção testada em emulador | Corrigido localmente; aguarda publicação/validação |
| ALT-011 | IA não interpreta o funil personalizado | Alta | Relato, causa identificada e regressões aprovadas | Corrigido localmente; aguarda validação operacional |
| ALT-012 | Imagens deixaram de abrir | Crítica | Novo print e recuperação testada em emulador | Correção local relacionada; aguarda validação do caso real |
| ALT-013 | Controles de áudio e envio pouco utilizáveis no celular | Alta | Vídeo: nomes técnicos nos áudios e ação de envio comprimida | Controles ajustados localmente; validação no aparelho pendente |
| ALT-014 | Histórico fica vazio e reapresenta os players | Alta | Vídeo, aproximadamente 5–8 s | Atualização preserva histórico no código; validação visual pendente |
| ALT-015 | Instagram e Messenger conectados sem mensagens na Inbox | Crítica | Conta Savio Cipriano; assinaturas Meta sem campos de eventos | Configuração corrigida; nova recepção Instagram validada; teste específico Messenger pendente |
| ALT-016 | Instagram aparece com identificador genérico em vez de nome e usuário | Alta | Print ESB; consulta de perfil retornou autorização invalidada | Reconexão validada; 9 conversas atualizadas; correção publicada |
| ALT-017 | Story recente aparece indisponível ao responder a um vídeo | Alta | ESB; URL do story retornou MP4 HTTP 200, mas interface usava imagem | Mensagem recuperada; player e capa separados; correção publicada |

ALT-008 recebeu nova evidência: campo de resposta fora da área visível no desktop. Esperado: abrir a conversa já com o campo acessível, sem rolagem da página; somente o histórico deve rolar. O ajuste local está descrito no relatório de correções.

## Evidências recebidas

As nove imagens foram fornecidas nesta conversa. Os arquivos estão em pasta temporária; os nomes abaixo servem para rastrear a origem, sem garantir preservação permanente. Os originais não foram copiados para o repositório porque contêm conversas e dados do cliente.

| Imagem | Arquivo | Conteúdo relevante |
| --- | --- | --- |
| 1 | codex-clipboard-a23411ab-3593-41a9-bdae-9e78a09b0fa8.jpg | Celular: áudio indisponível, marcador repetido e botão Assumir. Campo Mensagem visível. |
| 2 | codex-clipboard-f75eda6a-aa62-403a-b061-2898781cacdf.jpg | Computador: três balões de áudio indisponível, marcadores repetidos e prazo de resposta. |
| 3 | codex-clipboard-fc4415fd-ea8c-4716-849d-c2842495b23d.jpg | Grupo no WhatsApp com compartilhamento de resultados. Não demonstra defeito da Altum. |
| 4 | codex-clipboard-d8418c6f-9832-4c8d-bad8-4c35260953ca.jpg | Conversa Iris mar: indicadores de atendimento, prazo vencido e pedido de aviso sobre novas cores. |
| 5 | codex-clipboard-de9946d0-3f47-4717-bd90-b6f72fb35346.jpg | Recorte dos controles e contexto da conversa no computador. |
| 6 | codex-clipboard-4038694d-2f29-4f97-89f9-6881ad21461c.jpg | Relatos de mensagem não enviada, atraso e impacto nas vendas. |
| 7 | codex-clipboard-4057cd07-10b2-4c7c-a368-7fc35c246159.jpg | Relatos de áudio sem reprodução e divergência das mensagens. |
| 8 | codex-clipboard-b9c1efe7-3a59-4734-b3a1-89b04c37e52e.jpg | Dúvida sobre desfazer Assumir; transcrição de áudio exibida pelo WhatsApp. |
| 9 | codex-clipboard-601a25ed-b330-4f27-b4ef-2f6a2c29695f.jpg | Pergunta sobre como responder pelo computador. |

O vídeo `5d20f645-3cf8-469a-a2c3-4b2d39bd9e37.mp4` foi disponibilizado em mensagem posterior e analisado visualmente. Ver [análise do vídeo](ANALISE_VIDEO_MOBILE_ESB_2026-10-20.md). A transcrição da imagem 8 pode conter erros e não equivale à escuta do áudio original.

## ALT-001 — Áudios recebidos indisponíveis

- Tipo: defeito observado na interface; causa pendente.
- Módulo: Conversas / WhatsApp / mídia.
- Problema: os balões exibem “arquivo indisponível”, sem reprodução, no celular e no computador.
- Evidências: imagens 1, 2 e 7. Na imagem 2 há três mensagens com o sintoma; isso não comprova duplicação de mensagens.
- Impacto: vendedor não consegue ouvir a solicitação recebida.
- Esperado: recuperar e reproduzir o áudio recebido; em falha real, informar o estado e oferecer recuperação quando possível.
- Investigar: metadados recebidos, identificação da mídia, download, armazenamento, autorização de acesso, expiração de URL, tipo de arquivo e compatibilidade do navegador. São hipóteses, não causas confirmadas.
- Prioridade: crítica. Status: em investigação.
- Validar: áudio novo reproduzível no computador e no Safari do iPhone; recarregar e reabrir a conversa; testar erro de mídia e possibilidade de recuperar os áudios afetados. Conferir acesso restrito à empresa e à conversa.

## ALT-002 — Marcadores de áudio repetidos

- Tipo: defeito visual observado; duplicação do evento não comprovada.
- Módulo: Conversas / normalização e apresentação de mensagens.
- Problema: “[Áudio recebido] [Áudio recebido]” aparece dentro de um mesmo balão.
- Evidências: imagens 1, 2 e 7.
- Esperado: um player e, quando existir, uma legenda útil, sem repetição de marcador.
- Investigar: concatenação de texto com resumo de anexo, normalização repetida e fallback de renderização. Conferir IDs antes de atribuir a eventos duplicados.
- Prioridade: alta. Status: em investigação.
- Validar: áudio com e sem legenda, atualização da conversa e reprocessamento do mesmo evento sem marcadores ou mensagens duplicadas.

## ALT-003 — Prazos de atendimento

- Tipo: suspeita a investigar; os prints não comprovam cálculo incorreto.
- Módulo: Conversas / prazo de resposta.
- Problema: aparecem “3m para responder” e “Prazo vencido” em conversas diferentes.
- Evidências: imagens 2 e 4. Indicadores distintos em conversas distintas podem estar corretos.
- Esperado: prazo calculado conforme regra configurada, mensagem que aguarda resposta, horário de atendimento e estado da conversa; apresentação coerente após resposta.
- Investigar: regra vigente para a empresa, timestamps, fuso, expediente, pausas, resposta enviada e mudança de responsável.
- Prioridade: a definir após diagnóstico. Status: em investigação.
- Validar: reconstruir uma linha do tempo com horários absolutos e resultado esperado; testar dentro e fora do expediente e após resposta, transferência e encerramento.

## ALT-004 — Estados e responsabilidade pouco claros

- Tipo: problema de compreensão relatado; possível inconsistência técnica a verificar.
- Módulo: Conversas / responsável e controle humano ou IA.
- Problema: o conjunto de “Atendimento humano”, “Humano”, “em leitura”, responsável e “Assumir” não deixa claro para o vendedor quem atende e se pode responder.
- Evidências: imagens 1, 2, 4, 5 e 8. “Em leitura” aparece no contexto comercial; não presumir que seja confirmação de leitura da mensagem.
- Esperado: distinguir responsável, permissão de resposta e modo humano/IA, com ação principal clara e explicação de bloqueio quando houver.
- Investigar: correspondência dos rótulos com os estados reais, perfil do usuário, titularidade da conversa e condições do botão Assumir.
- Prioridade: alta. Status: em investigação.
- Validar: observar e assumir conversa, atendimento próprio e de outro vendedor, modo IA e humano, desktop e celular. Conferir rótulos e permissões com os estados efetivos.

## ALT-005 — Falha no envio de mensagens

- Tipo: defeito relatado; reprodução e causa pendentes.
- Módulo: Conversas / envio WhatsApp.
- Relato: “A msg n ta indo não” (imagem 6).
- Impacto: impossibilidade de responder e risco de perda de venda.
- Esperado: envio com retorno claro de pendência, sucesso ou falha; não apresentar mensagem como entregue sem confirmação correspondente.
- Investigar: tentativa específica, conexão, permissão, resposta do provedor, processamento de envio e confirmação de entrega. Identificar se falha é de texto, mídia ou ambos.
- Prioridade: crítica. Status: em investigação.
- Validar: texto e mídia até o destinatário de teste; falha de conexão visível; nova tentativa controlada sem duplicação. Registrar horários e identificadores de cada etapa.

## ALT-006 — Lentidão e atraso no atendimento

- Tipo: desempenho relatado; ainda sem medição.
- Módulo: Conversas / recebimento, atualização e envio.
- Relato: “E é mt delay po”, “Mt lento”, com risco de perder vendas (imagem 6).
- Esperado: mensagens novas e estados de envio atualizados prontamente, sem depender de recarregar manualmente a página.
- Investigar: separar atraso do provedor, recebimento do evento, processamento, leitura da API e atualização da tela; medir com aba ativa, inativa, reconexão e rede móvel.
- Prioridade: crítica. Status: em investigação.
- Validar: medir tempos de ponta a ponta e percentis em sequência de mensagens; definir e registrar meta operacional antes de declarar resolvido. Não há tempo de atraso comprovado nos prints.

## ALT-007 — Divergência entre WhatsApp e Altum

- Tipo: defeito relatado; extensão não confirmada.
- Módulo: Conversas / sincronização WhatsApp.
- Relato: “As msg do zap não tá aparecendo normal no zap da plataforma não” (imagem 7).
- Esperado: sequência e conteúdo íntegros das mensagens suportadas pela integração, sem perdas ou duplicatas; limitações de histórico explícitas.
- Investigar: comparar a mesma conversa nos dois lados por ID, conteúdo, remetente e horário; separar histórico anterior à conexão, mensagens novas, mensagens enviadas fora da Altum e tipos de mídia.
- Prioridade: crítica. Status: em investigação.
- Validar: comparação pareada com texto, áudio, imagem e resposta; testar reconexão, eventos repetidos e eventos fora de ordem. Não usar a imagem 3, de um grupo, como prova de divergência de uma conversa individual.

## ALT-008 — Dificuldade para responder pelo computador

- Tipo: dificuldade de uso comprovada pelo relato; falha de layout ou permissão ainda não confirmada.
- Módulo: Conversas / campo de resposta / layout desktop.
- Relato: “Como responde aqui pelo pc ?” e “Ou n tem como” (imagem 9).
- Evidências: imagens 4, 5 e 9 não mostram claramente o campo de resposta no enquadramento. A foto parcial não comprova sua ausência na página. Na imagem 1 o campo aparece no celular.
- Esperado: campo e ação de envio visíveis para quem pode responder; motivo e próxima ação claros quando bloqueados.
- Investigar: altura da janela, zoom, rolagem, painéis, barras fixas, estado da conversa e perfil do vendedor.
- Prioridade: alta. Status: em investigação.
- Validar: resolução e zoom usados pelo vendedor, janela menor e tela cheia; assumir conversa e responder com teclado; conferir bloqueios por perfil sem ocultar a orientação.

## ALT-009 — Desfazer a tomada de atendimento

- Tipo: dificuldade de uso relatada; ausência da funcionalidade não comprovada.
- Módulo: Conversas / atribuição / fila / IA.
- Relato: “Coloquei pra assumir Mais tem como voltar ?” (imagem 8). A transcrição indica dúvida entre visualizar e assumir.
- Esperado: visualizar não muda o responsável; após assumir, ações permitidas para devolver à fila ou transferir devem ser fáceis de encontrar. Retornar à IA é uma ação distinta, conforme configuração e permissão.
- Investigar: ações existentes, visibilidade, permissões, transição do responsável e efeito de cada ação no controle da IA.
- Prioridade: alta. Status: em investigação.
- Validar: assumir → devolver à fila; assumir → transferir; retorno à IA quando permitido; conferir histórico, responsável, prazo e ausência de resposta automática indevida ou perda de mensagens. Testar dois vendedores simultâneos.

## Nova evidência de ALT-006 / ALT-007 — Savio Cipriano, 20/10/2026

O usuário enviou imagem e áudio pela Altum no PC e depois enviou outro áudio pelo aplicativo do celular, na mesma conversa. O último não apareceu na plataforma. A consulta técnica confirmou sessão Evolution aberta, envio móvel armazenado no provedor com JID `@lid` e telefone alternativo correto, mas ausência no histórico da Altum. O áudio de 2 segundos foi recuperado na conversa original, sem reenvio nem IA; o arquivo e sua versão MP3 foram lidos com sucesso.

Foram implementados atualização por eventos autenticados no servidor, fila de mensagens independente da atualização da lista e recuperação complementar de envios recentes. Testes do pacote compilado confirmaram SSE HTTP 200 com aviso em 218 ms no laboratório e reprodução MP3 HTTP 200. Esse tempo não representa a latência completa do WhatsApp real. A melhoria visual do player inclui ondas medidas do arquivo, progresso, duração e velocidade.

Status de ALT-006 / ALT-007: **correção local testada; validação completa do fluxo publicado pendente**. Os eventos do celular continuam indo ao endereço público. A recuperação complementar local consulta a cada 10 segundos; o trajeto inteiro por evento depende da publicação do recebimento atualizado e de novo teste com o celular. Relatório: `docs/CORRECOES_AUDIO_TEMPO_REAL_2026-10-20.md`.

## ALT-015 — Canais Meta conectados sem recepção na Inbox

- Conta: Savio Cipriano. Módulos: Conversas e conexões Instagram/Messenger.
- Relato: canais conectados, mas mensagens ausentes na Inbox.
- Causa confirmada: assinaturas do aplicativo Meta para `instagram` e `page` sem campos de eventos. Tokens válidos e inscrição da página presentes. Callback com redirecionamento também foi corrigido.
- Correção: habilitados os eventos de mensagens no callback direto; recebimento do teste Instagram confirmado às 19h56 de 20/10/2026 (Brasília). Recuperadas 23 mensagens anteriores de Instagram sem IA, automações ou reenvio.
- Estado: recepção Instagram validada no cenário real, com confirmação do usuário de que voltou a funcionar. Configuração Messenger corrigida; novo evento específico desse canal ainda não identificado nos registros consultados.
- Complemento: recuperação recente, proteção das assinaturas na reconexão e isolamento por conta em lotes. Evidências e limites: [relatório técnico](CORRECOES_INSTAGRAM_MESSENGER_2026-10-20.md).

## ALT-016 — Nome e usuário ausentes no Instagram

- Conta: ESB Variedades. Módulo: Conversas / perfis de Instagram.
- Causa confirmada: consulta de perfil HTTP 401, código 190/subcódigo 460, por autorização invalidada pela Meta; eventos de mensagens continuavam chegando.
- Após reconexão: consultas dos dois perfis do print HTTP 200 com nome, usuário e foto. Nove das dez conversas existentes receberam atualização de perfil sem reenvio ou automações.
- Correção publicada: enriquecimento de conversas existentes, dados conhecidos preservados durante falhas, consulta alternativa sem foto e exibição do `@usuário`. Detalhes e testes: [relatório](CORRECOES_NOMES_INSTAGRAM_2026-10-20.md).
- Status: dados dos dois exemplos corrigidos e publicação verificada; depende de autorização válida e disponibilidade dos dados na Meta.

## Melhorias separadas dos defeitos

| ID | Proposta | Evidência e limite | Prioridade | Status |
| --- | --- | --- | --- | --- |
| MEL-001 | Registrar interesse em novas cores e próxima ação comercial | Pedido de Iris mar na imagem 4. Não comprova falha de automação existente. | A priorizar | Pendente |
| MEL-002 | Avaliar acompanhamento dos resultados da equipe | Rotina no grupo da imagem 3. Não é evidência de funcionalidade contratada ou ausente. | A priorizar | Pendente |
| MEL-003 | Visual da conversa adaptado ao canal e ícones pequenos das redes | Pedido explícito do usuário após validar nomes e stories de Instagram. [Implementação](VISUAL_CONVERSAS_POR_CANAL_2026-10-20.md). | Alta | Publicado; testes e compilação aprovados; avaliação visual do usuário pendente |

## Ordem recomendada de trabalho

1. ALT-001 e ALT-005: garantir que o vendedor ouça e responda; coletar exemplos específicos e validar conexão/mídia/envio.
2. ALT-006 e ALT-007: medir atraso e comparar a integridade da mesma conversa.
3. ALT-002: eliminar repetição visual, sem mascarar falha de mídia.
4. ALT-008, ALT-004 e ALT-009: validar o fluxo do vendedor e tornar ações e responsabilidade claras.
5. ALT-003: confirmar a regra e auditar os prazos.

## ALT-017 — Story em vídeo exibido como imagem

- Conta: ESB Variedades. Módulo: Conversas / contexto Instagram.
- Relato: resposta a um story recente sem prévia, com aviso de indisponibilidade ou expiração.
- Causa comprovada: recurso acessível como `video/mp4` tentava renderizar em uma imagem. A consulta do story confirmou vídeo, capa e proprietário da conta correta.
- Correção: player de vídeo, capa separada, link do Instagram e renovação autenticada de contexto. Mensagem existente recuperada sem reenvio, IA ou automação. [Relatório e testes](CORRECOES_STORY_INSTAGRAM_2026-10-20.md).

## ALT-018 — Respostas enviadas pelo Instagram ausentes na Altum

- Cliente: ESB Variedades. Módulo: Conversas / sincronização Instagram. Prioridade: crítica.
- Evidência: a Meta retornou cinco respostas da conta comercial ausentes na conversa mostrada pelo usuário em 22/10/2026.
- Causas confirmadas: descarte dos eventos de saída, recuperação limitada às conversas recentes e exclusão temporária de respostas recentes.
- Correção: recebimento de respostas nativas, conciliação com os envios da Altum e recuperação direcionada à conversa aberta. As cinco ocorrências foram registradas; três contêm texto e duas têm conteúdo não disponibilizado pela Meta (`is_unsupported`).
- Estado: publicado e recuperação real validada pela API pública às 14h11 de 22/10/2026 (Brasília); novo envio pelo aplicativo solicitado ao usuário para confirmar a entrega do evento real. [Relatório](CORRECOES_RESPOSTAS_NATIVAS_INSTAGRAM_2026-10-22.md).

## Modelo para novos registros

- ID / cliente / módulo / responsável técnico:
- Problema relatado e impacto:
- Evidência e momento do incidente (data absoluta, horário e fuso):
- Tipo: defeito observado, defeito relatado, suspeita ou melhoria:
- Comportamento esperado:
- Passos para reproduzir / ambiente / perfil / canal / IDs internos:
- Hipóteses a investigar (sem apresentá-las como causa):
- Prioridade e justificativa:
- Status:
- Causa confirmada e evidência técnica:
- Correção identificável e testes executados:
- Validação no cenário afetado, responsável e data:
