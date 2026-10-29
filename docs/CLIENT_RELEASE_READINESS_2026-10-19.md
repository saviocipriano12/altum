# Publicacao e pendencias — 19/10/2026

Continuidade planejada: ver
[AI_ATTENDANCE_REBUILD_PLAN_2026-10-19.md](AI_ATTENDANCE_REBUILD_PLAN_2026-10-19.md),
especialmente o mapeamento das pendências na seção 13. Esse plano não é uma
nova publicação e não encerra as pendências ou os gates deste documento.

## Decisao do cliente nesta rodada

Cliente autorizou publicar e adiar a correcao de audio para a proxima rodada.
Isso nao elimina outras falhas nem autoriza publicar mudancas de outros chats.
Preparar pacote restrito sobre a producao vigente, preservando Shopify/admin/site.
Autorizacao nao significa publicacao concluida: exigir recibo READY e dominio.

## Evidencias atuais

- Suite geral: 951 testes, 945 aprovados e 6 falhas; fonte critica inalterada.
  Artefato: `.qa-artifacts/client-readiness-20261019/unit-1792439484893.json`.
- Tipagem direcionada `tsconfig.crm-passive.json`: aprovada.
- Modelo real `gpt-4.1-mini`: 34/35 no baseline; gate reprovado em `audio_unclear`.
  Resposta pediu esclarecimento corretamente, mas decision retornou `respond`
  em vez de `ask_more`. Nao confundir divergencia de contrato com transcricao.
  Artefato: `.qa-artifacts/ai-evaluation/baseline-2026-10-19T19-51-08-507Z.json`.
- Tres jornadas sinteticas, quatro turnos reais de modelo cada: contexto de cor
  e horario preservado. Nao aprovadas como atendimento completo: promessas de
  verificar/retornar/anotar/chamar humano sem recibo de ferramenta nessa camada,
  descoberta repetida e coleta de dados excessiva ainda precisam tratamento.
  Artefato: `.qa-artifacts/client-readiness-20261019/model-journeys-1792439578209.json`.
  Testou router+composer, nao ferramentas/agent completo nem WhatsApp real.
- Compilacao isolada e suite de emuladores ainda em andamento no momento deste
  registro. Nao declarar build, UI autenticada ou todos os fluxos aprovados.
- Funil/Kanban tem recibo anterior de publicacao restrita em tres arquivos:
  `.qa-artifacts/client-pipeline-release-20261019/receipt.json`.

## Proxima rodada: nao esquecer

1. Audio: contrato `audio_unclear`, transcricao, fallback e experiencia com audio
   incompreensivel. Adiado explicitamente pelo cliente; nao marcar resolvido.
2. Conversacao: acoes reais antes de prometer retorno/agenda/humano; evitar
   qualificacao repetida, dados desnecessarios e frases genericas. Validar agent
   completo e ferramentas; construir benchmark de 100 conversas, ainda inexistente.
3. Contratos: duas falhas de autonomia/handoff e uma de observacao CRM devem ser
   confrontadas com comportamento; tres falhas admin ficam fora deste pacote.
4. Outbox: automacao generica `send_message` ainda envia diretamente; fechar
   identidade duravel por trigger/run/action para execucoes imediatas e agendadas.
5. Campanhas: leases do pai, conciliacao de `delivery_pending`, retomada de runs
   antigos e contadores finais. Nao declarar fase 2 concluida.
6. CRM passivo em todos os ingressos, sync, humano externo e redes; informacao
   relevante por negocio com evidencias, sugestoes do copiloto e prova visual.
7. Identidade multicanal, reconciliacao historica/deduplicacao e propriedade.
8. Grupos: nomes/renomes consultados no provedor e limpeza auditada de contatos
   antigos indevidos; nao apagar contatos sem conferencia.
9. Distribuicao automatica: concorrencia, disponibilidade, preservar responsavel
   e cobertura de todos os canais. Conferir configuracao existente antes de criar.
10. Instagram: contexto visual de story/post respondido e fallback de expiracao.
11. Atribuicao Meta anuncio→WhatsApp→venda→conversao real continua sem prova;
    teste antes dispensado nao e aprovacao. Verificar acesso Google separadamente.
12. Lixeira/retencao: incluir novas colecoes de entrega, orfaos de Storage antes
    de checkpoint, quotas/tombstones e preservacao do historico acessivel.
13. UI autenticada desktop/mobile atual: teclado, microfone local autorizado,
    upload, reconexao, rolagem e rascunho. Nao reutilizar snapshot antigo como prova.
14. IA em conversa unica: trava piloto publicada em rodada anterior; botao Inbox
    novo e validacao ponta a ponta ainda nao comprovados publicados.
15. Publicacao: comparar fonte real vigente, preservar Shopify, validar indices/
    regras necessarios, rollback e convivio com workers legados. Nunca publicar
    todo o checkout compartilhado por conveniencia.

## Regra de continuidade

Manter a missao original por fases sequenciais: gate 2 permanece aberto. Itens
adiados ficam no plano, nao somem por esta publicacao. Nao houve instalacao de
Dify/LangGraph nem prova de que todas as 46 evolucoes estao publicadas.

## Pacote restrito autorizado nesta rodada

- Baseline real: `dpl_BF5WCyPJAhLjdgC7cSGz7dTALh5Z`.
- Candidato: `dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh`, estado READY confirmado.
- Build de publicacao: compilacao, TypeScript e geracao de 372 paginas concluidos.
- 69/69 testes direcionados locais aprovados (contexto, politica, composer,
  conhecimento e catalogo Shopify); lint direcionado aprovado.
- Somente router, conversation-policy, novo conversation-context e uma linha
  em agent para passar o ID da mensagem atual. Restante reutiliza os arquivos
  exatos da producao vigente, nao o checkout local compartilhado.
- Nao modifica audio, regras/indices, banco, admin, Shopify ou telas.
- Limites upstream de resumo de 1.200 caracteres e fetch continuam existentes.
  O filtro de entregas nao enviadas do helper so se aplica quando o chamador
  fornece deliveryStatus; o fetch de producao ainda nao faz esse mapeamento.
  Corrigir e provar esse encadeamento na proxima rodada; nao vende-lo como pronto.
- Promocao no dominio e verificacoes HTTP devem ter recibos separados. A URL
  candidata exige login Vercel (302); isso nao e prova do login da aplicacao.
- Promocao confirmada em `2026-10-19T20:08:09.553Z`, dominio altumia.com.br.
  Recibo: `.qa-artifacts/client-conversation-release-1792439938355/promoted.json`.
  Nao representa publicacao das demais evolucoes locais ou fechamento do gate 2.
- Conferencia pos-publicacao aprovada: dominio aponta para o recibo, hashes dos
  quatro arquivos conferidos, demais 1.423 arquivos identicos a producao anterior.
  Home/login/Inbox responderam 200; job IA e chats sem autenticacao responderam
  401. Recibo `verified.json` no mesmo diretorio. Nao e teste autenticado de conversa.
- Suite ampliada de emuladores continua separada desta publicacao; ja mostrou
  tres falhas em inbox-session (autenticacao/rotas), ainda sem diagnostico final.
  Nao declarar todos os fluxos aprovados. Resultado final sera gravado pelo
  processo de QA em `.qa-artifacts/client-readiness-20261019/emulator-*.json`.
