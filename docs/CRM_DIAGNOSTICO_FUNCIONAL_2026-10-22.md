# Diagnóstico do CRM — 22/10/2026

## Veredito desta rodada

**Não aprovado como CRM com preenchimento automático confiável.** Há controles importantes implementados, mas encontrei erros de compreensão que chegam ao cadastro, inclusive com o modelo real ligado. Não foi feita publicação nem alteração em clientes reais nesta rodada. Novas funcionalidades ficam suspensas até tratar os bloqueadores e repetir a avaliação.

Este documento registra uma rodada de diagnóstico, não certifica todas as rotas nem a operação em produção. Os testes começaram sem corrigir o comportamento do produto, para preservar uma referência reproduzível.

## Evidência nova, separada por nível

| Nível | Resultado | O que isso comprova |
| --- | --- | --- |
| Extrator determinístico real | 18 de 34 cenários com o resultado esperado | Limitações de interpretação das regras atuais; sem modelo |
| Observador real + gravação no Firestore local | 19 de 35 cenários com o resultado esperado | As 16 falhas também chegam à ficha persistida; o cenário adicional é mensagem do vendedor |
| Fila local real | Os três exemplos fornecidos pelo usuário foram reproduzidos | A fila termina como `completed` mesmo nos dois exemplos sem orçamento capturado |
| Extrator semântico com fornecedor real | 8 de 8 cenários selecionados | O modelo consegue compreender estes exemplos sintéticos nesta execução |
| Mesmo caminho semântico, agora até a gravação real no emulador | 6 de 8 cenários | O resultado correto do modelo não garante cadastro correto: a combinação com regras antigas mantém dois valores inválidos |
| Jornada com três mensagens e fornecedor real | Declaração e correção funcionam; retirada falha | 5000 → 3000 → retirada mantém 3000 como leitura conferida, sem pendência |
| Áudio e imagem, arquivos sintéticos + fornecedor real + CRM local | 2 cenários passaram; 3 chamadas | Áudio transcrito alimenta orçamento com origem; imagem gera contexto para revisão sem virar orçamento declarado |
| Autenticação + perfil via HTTP local | Ambos responderam 200 | A conta fictícia existe e o perfil é acessível nesse caminho |
| Navegador local | Não aprovado | Houve erro inicial de entrada e depois carregamento persistente em “Abrindo sua conta…”; não foi possível validar a rotina visual |
| Operação real pela conexão Altum, somente leitura | Perfil, uma página de 3 conversas e 5 estados de canal consultados | Existe acesso aos registros; não comprova entrega, extração, atualização ou saúde atual do fornecedor |

Os lotes foram escolhidos para provocar falhas. **19/35 não é uma estimativa da precisão em produção.** Os oito cenários semânticos também são uma amostra pequena, sem repetição estatística. Nenhum destes resultados substitui avaliação anotada com pelo menos 200 turnos e 30 jornadas, conforme o plano da missão.

## Bloqueadores reproduzidos

### P0 — valor inválido gravado apesar da leitura semântica correta

Com o modelo real habilitado para uma empresa fictícia isolada:

1. `Meu orçamento é 5000 reais, mas retiro essa informação: ainda não defini orçamento.`
2. `Se meu orçamento é 5000 reais, daria para contratar`

Nas duas mensagens, o registro da extração semântica terminou `completed`, com `facts: []`, corretamente sem afirmar orçamento. A ficha, entretanto, recebeu `customFields.orcamento = "5000 reais"`. O estado comercial ficou `checked` e sem pendência.

Causa observada: `conversation-intelligence.ts` primeiro acumula os fatos das regras e depois apenas adiciona/substitui os fatos retornados pelo modelo. Quando o modelo não confirma um fato, o fato das regras continua elegível. A ausência de confirmação não funciona como veto. Além disso, o contrato atual não representa explicitamente retratação ou invalidação de um valor anterior.

Impacto: o vendedor pode confiar em um orçamento que o cliente não declarou como vigente. Exibir a mensagem de origem prova a origem do texto, mas não prova que a interpretação é verdadeira.

Uma jornada adicional confirmou o problema entre mensagens: primeiro `Meu orçamento é 5000 reais`, depois `Corrigindo: meu orçamento é 3000 reais`, finalmente `Retiro o orçamento informado: ainda não tenho valor definido.` O CRM atualizou para 3000 na correção, mas manteve 3000 após a retirada, com `status: checked` e `pendingCount: 0`. O modelo retornou `facts: []` no último turno. O histórico deve continuar preservado; o valor não pode continuar apresentado como confirmação vigente sem sinalização.

### P1 — pergunta em outra frase apaga informação declarada

Reproduzido pela fila e pela ficha salva:

| Mensagem | Esperado | Salvo |
| --- | --- | --- |
| Meu orçamento é 5000 reais | 5000 reais | 5000 reais |
| Meu orçamento é 5000 reais. Pode me ajudar? | 5000 reais | vazio |
| Tenho 5 mil para investir | 5 mil | vazio |

O veto global a `?` também elimina cidade, interesse e tamanho da equipe declarados antes de uma pergunta. Expressões como “cinco mil reais” não são compreendidas pelo extrator determinístico.

### P1 — correções, negação e contexto não são interpretados suficientemente

Resultados persistidos sem modelo:

| Caso | Resultado incorreto |
| --- | --- |
| Meu orçamento é 5000 reais. Corrigindo: meu orçamento é 3000 reais. | 5000 reais |
| Moro em Recife. Corrigindo: moro em Salvador. | Recife |
| moro em belo horizonte | belo |
| Não temos equipe com 12 vendedores | 12 vendedores |
| Sou o dono, mas quem decide a compra é minha sócia | Cliente declara ser o decisor |
| Orçamento citado como passado, fala de terceiro ou retirado na própria mensagem | 5000 reais em casos que deveriam ficar sem confirmação |

O modelo resolveu os exemplos selecionados de coloquialismo e correção. Isso não elimina a falha de combinação descrita no P0 nem certifica os demais casos.

### P1 — experiência visual não validada

No navegador existente, usando a conta fictícia local, a entrada inicialmente retornou erro genérico. Autenticação e `/api/client-portal/me` funcionaram pela verificação HTTP, mas a navegação depois permaneceu alternando telas de preparação e “Abrindo sua conta…”. A causa ainda não foi isolada; não atribuir o problema a senha, autenticação de produção ou disco sem evidência.

O espaço livre medido nesta rodada foi aproximadamente 141 MB. O build completo continua sem aprovação; a limitação ambiental impede usá-lo como evidência de entrega. O portal precisa abrir e permitir tarefas reais antes de aprovar sua experiência.

## Cobertura funcional e limites

| Frente | Evidência / situação |
| --- | --- |
| Edição humana e liberação de campos | Regressões locais executadas nesta rodada para correção, limpeza, concorrência, acesso e liberação. Não equivalem a teste visual de preenchimento |
| Agenda e retornos | Regressões locais executadas para criar, reagendar, concluir, cancelar, reabrir, atribuir e consultar, incluindo concorrência e falha de histórico |
| Pessoa e várias oportunidades | Regressões locais executadas para compra separada, idempotência, vínculos, conflitos de identidade, acesso por vendedor e valores desconhecidos versus zero |
| Kanban | Limite de 240 registros acessíveis continua explícito. Um teste de cobertura falhou no lote e passou isoladamente; o resultado precisa ser tratado como instabilidade da suíte, sem inferir imediatamente falha do produto |
| Mudança de etapa e automações | Regressões locais com revogação de origem, configuração, carteira, prazo, recibo e repetição. Dois processos frios estouraram tempo no lote e passaram isoladamente; não houve correção do produto entre rodadas |
| Propostas, financeiro e distribuição | Segundo lote: 61 de 62 passaram; a retomada de proposta estourou tempo e passou isoladamente. Não houve cobrança ou envio real |
| Texto de todos os canais | O observador comum foi exercitado com mensagens armazenadas fictícias. Não foram geradas mensagens novas por webhooks reais de WhatsApp/Instagram nesta rodada |
| Áudio | Um arquivo sintético com fornecedor real passou. Não foram avaliados sotaques, ruído, baixa qualidade, múltiplos falantes ou áudio longo |
| Imagem | Um arquivo sintético passou como contexto para revisão. Não comprova preenchimento factual geral a partir de imagens; preço em proposta não é automaticamente orçamento do comprador |
| Vídeo e documentos | Sem aprovação nesta rodada. Não afirmar leitura integral de vídeo com base em miniatura ou resumo de imagem |
| Troca de oportunidade na conversa | Infraestrutura e proteções existem; seleção usável na interface e resposta automática com contexto escolhido seguem pendências da missão |
| Relatórios do dono | Não houve reconciliação completa entre pessoas, oportunidades, vendas e recebimentos nesta rodada; não aprovados |
| Performance e escala | Sem benchmark de 10 mil registros/p95. Tempos locais nesta máquina não são métricas de produção |
| Produção | Consultas somente de leitura. Cinco estados de canal retornaram `stale: true`; alguns não têm data de checagem. “Ready” armazenado não é teste atual de conexão |
| Configuração semântica de produção | Não verificada. O código exige habilitação e lista explícita de empresas, além de política e orçamento. Módulo de IA contratado não comprova que esse observador está habilitado |

## Ordem de correção após este diagnóstico

1. Impedir persistência de fatos não confirmados quando a análise semântica rejeita ou não sustenta o candidato; representar confirmação, conflito e retratação explicitamente.
2. Tratar correções e invalidações na própria mensagem e ao longo da conversa, preservando os bloqueios de edição humana.
3. Separar estado técnico de processamento de qualidade/conferência do preenchimento. `completed` e `checked` não podem induzir certeza comercial indevida.
4. Corrigir a degradação para regras: limitações precisam ser observáveis e não podem produzir fatos falsos silenciosamente.
5. Estabilizar acesso local e executar os fluxos no navegador, inclusive atualização automática, edição e persistência após recarregar.
6. Estabilizar as falhas da suíte e repetir os cenários afetados de maneira isolada antes de classificar a causa.
7. Ampliar avaliação anotada de texto e mídia; só então fazer piloto controlado de canal e reconciliar relatórios. Aprovação depende do comportamento observado.

Não basta trocar um padrão de expressão regular ou ligar o modelo para declarar o problema resolvido.

## Fechamento das regressões desta rodada

- Primeiro lote: **169 testes, 166 passaram e 3 falharam**, encerramento 1, duração 636720 ms. Abrange atividades, mídia normalizada, oportunidades, controle humano e transições de etapa.
- Segundo lote: **62 testes, 61 passaram e 1 falhou**, encerramento 1, duração 394328 ms. Abrange distribuição, financeiro e criação de propostas.
- Kanban isolado: **1/1**, encerramento 0. A falha no lote esperava um valor conhecido, mas a consulta também incluía registros anteriores da própria suíte e retornou 11. A expectativa depende do estado criado pelos outros testes; não comprova soma errada em produção.
- Retomadas de etapa isoladas: **2/2**, encerramento 0. Nos lotes, os subprocessos tinham sido encerrados com `SIGTERM` ao estourar o limite de execução. A retomada interna levou 9726 ms isoladamente; a retomada do agendador levou 13955 ms. Não foi alterado o limite nem a implementação para obter esse resultado.
- Retomada de proposta isolada: **1/1**, encerramento 0, cenário 9637 ms. O estouro de tempo do lote não se repetiu nesse ensaio.
- Lint dos três novos scripts de diagnóstico: aprovado, encerramento 0. Nenhuma lógica do produto foi corrigida nesta rodada.

Os resultados isolados não apagam os encerramentos com falha dos lotes. A suíte precisa isolar melhor dados e limites de execução; não declarar “231 testes verdes”. Da mesma forma, os controles estruturais aprovados não compensam os erros de conteúdo encontrados pela avaliação nova.

## Reproduzir e consultar os resultados

Arquivos desta rodada, a partir da raiz do projeto:

- `scripts/diagnose-crm-extraction-baseline.mts`: casos anotados e observador local; `--emulator` habilita exclusivamente o emulador fixo, sem chamadas externas.
- `scripts/diagnose-crm-semantic-baseline.mts`: oito cenários com o fornecedor real, somente sintéticos; `--synthetic-provider` e opcional `--persisted` para conferir a gravação no emulador.
- `scripts/diagnose-crm-retraction-journey.mts`: jornada sintética de declaração, correção e retirada, três chamadas reais, com persistência no emulador.
- `.qa-artifacts/crm-diagnostic-baseline/pure.json`, `persisted.json`, `provider.json`, `provider-persisted.json`: esperado, resultado, origem e identidades dos registros fictícios.
- `.qa-artifacts/crm-media-live.json`: áudio/imagem desta rodada, três chamadas reais; sem webhook ou navegador aprovado.
- `.qa-artifacts/crm-diagnostic-functional-run.log`, `crm-diagnostic-pipeline-isolated.log`, `crm-diagnostic-commercial-run.log`: regressões funcionais.
- `.qa-artifacts/crm-diagnostic-cold-isolated.log`, `crm-diagnostic-proposal-isolated.log`: repetições isoladas das retomadas.
- `.qa-artifacts/crm-diagnostic-baseline/retraction-journey.json` e `source-hashes.json`: jornada e identificação dos fontes avaliados.

Os registros de desafio foram mantidos apenas em empresas fictícias no emulador, para permitir inspeção. Nenhuma credencial é incluída no relatório.
