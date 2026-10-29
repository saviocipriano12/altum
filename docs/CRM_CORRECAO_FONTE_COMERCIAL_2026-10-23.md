# Correção da informação vigente — 23/10/2026

Estado: implementação local com testes aprovados do recorte. CRM integral,
preenchimento semântico, canais de produção e experiência completa continuam sem aprovação.

## Defeito reproduzido antes de alterar o produto

Cinco testes novos falharam: revisão humana para 3000 reais continuava sendo lida
como 9000 na qualificação ou 11000 na memória de atendimento; apagar o orçamento
também recuperava valores antigos. A mesma divergência atingia objetivo, urgência
e decisor. Os testes usam o escritor transacional real, Firestore local e leitores
reais, com dados fictícios e transporte externo bloqueado.

Um sexto teste identificou outra fronteira: mesmo corrigindo os leitores,
qualificação e dossiê previamente persistidos continuavam antigos após salvar.
Esse teste também falhou antes da respectiva correção.

## Alterações implementadas

- Leitura compartilhada dos fatos atuais: campo do CRM tem precedência, inclusive
  quando vazio, nulo ou zero. Registros antigos sem esse campo mantêm compatibilidade
  por atributos legados; divergências entre fontes legadas ainda exigem migração.
- Qualificação, dossiê, memória de atendimento e apresentação da evidência usam
  essa precedência. Objetivo ou assunto da conversa não viram interesse de compra.
- A liberação para a IA preserva o valor revisado até uma nova mensagem admitida
  pela política existente; liberar não recupera um valor anterior.
- O escritor de perfil da IA respeita valores protegidos também nas suas memórias,
  atributos derivados e lista de informações capturadas. Se a extração conflita
  com um valor protegido, seus conselhos derivados também ficam sem aprovação.
- Revisão humana atualiza fatos e qualificação na mesma transação. Se já existe
  dossiê, atualiza suas duas cópias e registra a revisão atomicamente.
- Resumo gerado anterior deixa de ser apresentado como atual. O dossiê revisado
  usa dados estruturados e omite conselhos anteriores que podem conter o erro.
  A versão anterior fica no evento de revisão. Nova análise da IA pode substituir
  essa projeção após seu fluxo normal e suas verificações de contexto.
- A memória entregue ao agente filtra fatos de relacionamento contraditórios e
  ajusta campos repetidos aos valores revisados. Textos antigos ficam preservados
  no armazenamento histórico, sem entrar como orientação atual nesse leitor.
- Pontuação manual permanece preservada. Nenhum avanço de etapa ou envio foi
  acrescentado à revisão humana.

## Verificações concluídas

Execução final conjunta, após as últimas alterações: **58/58 testes aprovados**,
sem falhas, cancelamentos ou testes ignorados; duração de 88,5 segundos e
concorrência limitada a um arquivo. Evidências preservadas em
`.qa-artifacts/crm-current-facts-20261023/tests-final.log` e `tests-final.xml`.
Os resultados por recorte abaixo explicam a evolução e se sobrepõem a essa
execução final; não devem ser somados a ela. Tipagem e lint foram novamente
aprovados após o último ajuste. Hashes dos arquivos em `source-hashes.json`.

| Recorte | Resultado observado |
| --- | --- |
| Cinco regressões iniciais, antes da alteração | 0/5 aprovadas; divergências reproduzidas |
| Fatos atuais, dossiê e executor das ações da IA | 33/33 aprovadas, incluindo nove jornadas novas |
| Contrato dos valores, política de revisão e etapas configuradas | 11/11 aprovadas |
| Rotas autenticadas de revisão, com Auth e Firestore locais | 11/11 aprovadas |
| Isolamento de documento estrangeiro e compatibilidade do formulário legado | 2/2 aprovadas em execução específica |
| Documento pertencente à geração anterior de um cliente recriado | 1/1 aprovada em execução específica |
| Executor de perfil, após ampliar as verificações de memória e captura | 1/1 aprovada; subconjunto já incluído na suíte de ações |
| Fluxo HTTP pelo servidor Next local | Nove requisições com HTTP 200: revisão, gravação, ficha, lista, limpeza e restauração; valores e qualificação conferidos |
| Tipagem do recorte, incluindo serviços importados | Aprovada: `tests/tsconfig.crm-current-facts.json` |
| Verificação de código dos arquivos alterados e testes | Aprovada |
| Compilação otimizada completa | Interrompida durante compilação por consumo de recursos; não aprovada |
| Conferência visual | Não realizada: duas tentativas de abertura não anexaram a aba no navegador integrado; abertura pela aplicação retornou `queued` |

As rotas autenticadas foram chamadas pelos testes aos seus manipuladores reais,
com token validado no emulador. Um teste separado percorreu o servidor Next por
HTTP e conferiu os dados retornados; evidência em
`.qa-artifacts/crm-current-facts-20261023/http-result.json`.
Isso não substitui uma jornada completa no navegador. Não somar execuções
repetidas como amostras independentes. Não houve chamada a modelo nesta correção.

A pontuação automática recalculada ainda usa o qualificador atual, cujos critérios
fixos por negócio continuam reprovados no diagnóstico. Atualização consistente da
pontuação não equivale a aprovação da qualidade dessa pontuação.

Comandos reproduzíveis:

```powershell
node --import tsx --test tests/crm-current-facts.emulator.mts tests/crm-agent-dossier.emulator.mts tests/crm-agent-tasks.emulator.mts
node --import tsx --test tests/crm-current-facts.test.mts tests/crm-qualification-pipeline.test.mts tests/crm-qualification-policy.test.mts
node --import tsx --test tests/crm-qualification-review.emulator.mts
node node_modules/typescript/bin/tsc -p tests/tsconfig.crm-current-facts.json --noEmit --incremental false
```

## Limites e próxima unidade

O resultado corrige a autoridade da revisão humana nos caminhos exercitados.
Não corrige a interpretação semântica, a retirada automática de fatos, o corte de
mensagens longas ou os critérios fixos de qualificação por negócio. Textos livres
em outros históricos e leitores da plataforma ainda precisam ser inventariados.
Não é possível generalizar estes testes para todos os relatórios e integrações.

A próxima unidade é o contrato de atualização por conversa: distinguir confirmação,
correção, indefinição, retirada e conflito; impedir que as regras antigas recuperem
um fato rejeitado; expor falhas e leitura incompleta. Reexecutar as jornadas do
diagnóstico com a mesma expectativa, sem diminuir a exigência para produzir aprovação.
