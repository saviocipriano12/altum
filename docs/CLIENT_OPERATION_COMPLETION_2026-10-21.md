# Conclusao operacional da area do cliente

Pedido: concluir as areas incompletas e reutilizar projetos existentes para reduzir
prazo. Escopo inclui APIs/processamento necessarios da area do cliente; admin,
autenticacao e paginas publicas preservados. Nao e uma declaracao de 100% pronto.

## Escolha de componentes

Pesquisa em repositorios canonicos e licencas em 21/10/2026. Revisoes fixadas em
`config/client-capability-sources.json`. Todos os oito repositorios estavam sem
flag de arquivamento na consulta da API GitHub; isso nao prova qualidade operacional.

| Projeto | Contribuicao util | Decisao |
| --- | --- | --- |
| [Vexa](https://github.com/Vexa-ai/vexa) | Bot/captura por API | Primeiro piloto, pois ja existe adapter Altum; Apache-2.0 |
| [Meetily](https://github.com/Zackriya-Solutions/meetily) | Transcricao/captura local e notas | Referencia MIT; aplicativo desktop, nao um SDK web pronto |
| [Anarlog, antes Hyprnote](https://github.com/fastrepl/anarlog) | Notas e contexto de reuniao | Referencia MIT; componentes ainda por avaliar |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | Assistencia contextual na interface | Avaliar exemplo minimo com backend Altum; licenca raiz MIT |
| [LiveKit Agents](https://github.com/livekit/agents) | Voz interativa em tempo real | Apache-2.0; adiar ate necessidade comprovada |
| [Pipecat](https://github.com/pipecat-ai/pipecat) | Pipeline de voz e multimodal | BSD-2-Clause; alternativa ao LiveKit, evitar dois motores |
| [WhisperX](https://github.com/m-bain/whisperX) | Timestamps/alinhamento e falantes | BSD-2-Clause no codigo; modelos/dependencias separados |
| [Attendee](https://github.com/attendee-labs/attendee) | Bot de reunioes | Excluido da adocao padrao: Elastic-2.0 restringe hosted/managed service para terceiros |

Nenhum pacote inteiro foi incorporado ao bundle web. A preparacao do Vexa baixa
o upstream original na revisao fixada e preserva licenca/avisos; nao executa codigo
externo. Os demais ainda sao candidatos/referencias, nao dependencias homologadas.

### Vexa versus Recall

Vexa e o primeiro candidato para reaproveitamento open source e menor mudanca no
adapter existente. Nao ha evidencia de que seja superior em confiabilidade nesta
aplicacao: a decisao produtiva exige uma reuniao real.

Valores oficiais consultados em 21/10: [Vexa](https://vexa.ai/pricing) anuncia
US$ 0,30/h de bot + US$ 0,20/h de transcricao; [Recall](https://www.recall.ai/pricing)
anuncia US$ 0,50/h de gravacao + US$ 0,15/h de transcricao propria, com retencao
adicional cobrada apos a franquia. Custos de resumo/CRM/modelo sao separados.
Nenhum servico foi contratado ou credito comprado.

Vexa hospedado reduz a necessidade inicial de operar servidor. Self-host continua
possivel, mas exige Linux/Docker, armazenamento e manutencao. O fornecedor captura;
resumo, orientacao comercial, tarefas, permissoes e CRM permanecem contratos Altum.

Uma verificacao adicional encontrou relato aberto de falha no auto-join Zoom via
Zoho Calendar ([issue 1845](https://github.com/Vexa-ai/vexa/issues/1845), 13/10),
com entrada manual funcionando segundo o autor. Isso nao comprova falha do fluxo
por link da Altum, mas impede prometer agendamento automatico homologado. Teams
tambem tem relato de aviso de admissao de bot ([1848](https://github.com/Vexa-ai/vexa/issues/1848));
admissao e aviso de gravacao precisam integrar o piloto, sem tentar oculta-los.

## Primeira unidade implementada

- Busca, metricas, Perguntar a Altum, retornos e Agenda passaram a ler consultas
  por paginas de ID, em vez de cortar o universo nos primeiros 180/350/700/etc.
- Falha de leitura aborta a resposta; nao devolve resultado truncado como completo.
- Busca cancelada para de ler novas paginas; a interface distingue erro de busca
  sem resultado e ignora resposta de requisicao cancelada.
- Agenda verifica conflitos alem dos primeiros 500 registros e rejeita intervalo
  invertido e data invalida antes de persistir.
- Adapter Vexa envia plataforma explicitamente e usa o filtro correto `meeting_id`.
  O antigo `meeting_db_id` nao e declarado no upstream e era ignorado.
- Adapter valida ID positivo, recusa redirect e caminho inesperado de gravacao e
  aplica limite de bytes durante streaming, inclusive sem Content-Length.
- Conversas permite inserir a sugestao existente como rascunho editavel, sem
  sobrescrever texto humano e sem enviar automaticamente; copiar segue disponivel.
  Isso nao transforma a sugestao por regras em um copiloto contextual completo.

### Validacao desta unidade

- 10/10 testes do adapter de reunioes, com transporte ficticio: contrato de filtro,
  plataforma/Zoom, resposta invalida, escopo da gravacao, caminhos e limite de bytes.
- 3/3 testes de paginacao com Firestore local: 2.100 registros, documentos sem data,
  pagina exata, consulta vazia, cancelamento e isolamento de empresa.
- 8/8 testes das rotas reais com Auth/Firestore locais: busca tardia, carteira do
  vendedor, metricas com 801 leads/401 conversas, 501 compromissos, conflito na
  ultima pagina, 301 retornos, Perguntar a Altum com 801 leads sem chamar modelos
  externos, datas invalidas, ausencia de login e outra empresa.
- A primeira tentativa dessa suite de rotas falhou no projeto de Auth do fixture;
  corrigida para o projeto do emulador. Uma assercao de tarefas tambem foi corrigida:
  nome do lead fazia varias tarefas corresponderem legitimamente; agora uma busca
  exclusiva pelo titulo verifica a tarefa tardia sem enfraquecer acesso/contagem.
  Na extensao de Perguntar a Altum, o teste foi ajustado para o campo real
  `metrics.leads`; a repeticao final de oito casos passou integralmente.
- Tipagem global (`npm run typecheck`) aprovada e lint direcionado do lote final
  aprovado, sem diagnosticos. Compilacao registrada abaixo quando concluida. Nao e teste de reuniao real,
  navegador autenticado, carga de producao ou publicacao.
- Tentativa de snapshot isolado foi recusada porque outro trabalho alterou
  `app/api/tenant/[tenantId]/leads/bulk-delete/route.ts` durante a copia. A copia
  parcial nao e baseline aprovado. O build corrente do checkout e verificacao
  separada; nao constitui pacote restrito nem autorizacao de publicacao.
- Build global iniciado em 21/10, 01:50:54 -03:00. O mesmo arquivo compartilhado
  foi modificado novamente as 01:55:18, durante a compilacao. Execucao encerrada
  deliberadamente sem promover resultado; **build permanece pendente** em uma
  fonte congelada/reconciliada. Nao houve diagnostico de erro de compilacao desta
  unidade nem sucesso global. Testes, lint e tipos nao equivalem a esse aceite.

Contrato upstream consultado na revisao fixada:
[spawn](https://github.com/Vexa-ai/vexa/blob/f1a62fbbdfd2c98cb162582d82c31fe8102acc89/core/meetings/services/meeting-api/src/meeting_api/bot_spawn/router.py),
[gravacoes](https://github.com/Vexa-ai/vexa/blob/f1a62fbbdfd2c98cb162582d82c31fe8102acc89/core/meetings/services/meeting-api/src/meeting_api/recordings/router.py).

## Limites e sequencia restante

1. **Dados:** leitura integral elimina cortes, mas le o historico por requisicao.
   Medir latencia/custo em contas grandes; evoluir busca indexada/agregacoes sem
   reintroduzir teto silencioso. Leituras paginadas nao sao snapshot atomico.
   Nao foi refeito timezone nem todo criterio de receita dos relatorios.
2. **Agenda:** leitura integral nao elimina a corrida entre duas gravacoes
   concorrentes. Fechar reserva atomica/edicao/cancelamento e lembretes antes do
   aceite operacional da area. Sincronizacao externa e prova separada.
3. **Reunioes:** faltam endpoint/chave Vexa no ambiente. Bot continua restrito a
   perfis internos. Exigir piloto Meet/Zoom, consentimento, gravacao completa,
   portugues/falantes, resumo e tarefas/CRM confirmados. A finalizacao ainda e
   sincrona e limitada a 24 MB; faltam fila duravel, segmentacao de reunioes longas,
   quotas, retencao e controle de duplicidade/custo antes da liberacao comum.
4. **Copiloto:** integrar contexto autorizado da conversa/catalogo, rascunho
   editavel sem sobrescrever texto humano, feedback e recibo do envio real.
   CopilotKit ainda precisa de exemplo executado; nao instalado por antecipacao.
5. **Automacoes/campanhas:** seguir gate e inventario atuais, sem reconstruir
   o motor nem reabrir jobs incertos. Recibos causais, recuperacao, legado e
   reconciliacao de resumo continuam pendentes.
6. **IA/audio/midia/atribuicao:** reconciliar publicacoes recentes registradas nos
   documentos existentes e comprovar as jornadas reais atuais. Historico antigo
   da auditoria nao e evidência de falha ainda aberta.
7. **Ecommerce:** VTEX/Tray/Loja Integrada precisam de contratos reais de API e
   contas de teste antes de prometer cobertura equivalente a Shopify. Webhooks
   existentes preservados; nao inventar endpoints para exibir status de pronto.
8. **Aceite:** testes reais de rotas, desktop/mobile, falha/reconexao e integracoes;
   build e publicacao do pacote restrito com recibo. Nao publicar o checkout
   compartilhado inteiro nem marcar 100% por passar testes locais.

Registros que continuam validos: `CONVERSAS_GATE_2_ATUAL.md`,
`AI_FOUNDATION_B_REMAINING_PRODUCERS_2026-10-20.md`,
`AI_ATTENDANCE_RESUMPTION_AUDIT_2026-10-20.md` e plano de atendimento vigente.
