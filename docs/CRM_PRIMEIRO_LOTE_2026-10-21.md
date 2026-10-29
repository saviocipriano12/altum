# CRM Altum — primeiro lote de correções

Data: 21/10/2026. Plano: PLANO_EVOLUCAO_CRM_2026-10-21.md.
Estado: implementação local do primeiro lote; sem publicação.
As etapas 0 e 1 do plano integral ainda não estão encerradas.

## Mudanças

| Item | Antes | Depois |
| --- | --- | --- |
| Carteira no funil | GET retornava leads de outros vendedores | Consulta por ownerId para perfil restrito, seguida da política comercial; totais calculados sobre esse conjunto; gestores mantêm visão da equipe |
| Exclusão em lote | Somente capacidade edit_leads, sem acesso individual | Todos os alvos existentes são autorizados antes de qualquer remoção; helper confere novamente acesso ao cadastro lido; IDs inválidos são recusados |
| Repetição da exclusão | Comportamento anterior sem verificação de carteira | Contatos já ausentes continuam sendo ignorados; repetir a requisição não cria nova lixeira |
| Etapa manual | Valores fora do funil podiam ser persistidos | Perfil, endpoint de etapa e criação validam o funil dentro da transação; force não ignora a pertença ao funil |
| Etapa inicial | Cadastro sem etapa usava captado | Usa a primeira etapa real da empresa; etapa explicitamente vazia é recusada |
| Auditoria da criação | Cadastro e eventos eram escritos separadamente | Lead, evento inicial e auditoria compartilham a transação de validação da etapa |
| Lixeira comercial | Procurava budgets/finance_entries, omitindo os nomes usados pelo módulo | Inclui orcamentos e financeiro e mantém as coleções legadas para compatibilidade |
| Pendências na lista | Compacto entregava contadores zerados sem consultar chats | Consulta resumos dos chats da página com projeção de campos; respeita acesso comercial à conversa |
| Vínculo de conversa | Telefone podia associar chat já ligado a outro lead | leadId explícito prevalece; fallback telefônico apenas para chat sem vínculo |
| Linguagem de exclusão | Avisava exclusão definitiva apesar de haver recuperação | Botão, confirmação e sucesso informam envio para lixeira |

Foram preservadas as proteções preexistentes de autoria humana e ocorrências
causais de automações de etapa. Não houve alteração de admin ou autenticação.

## Evidências

- Novo arquivo tests/crm-foundation.emulator.mts com 12 testes comportamentais.
- Antes das correções: os oito testes originais do novo arquivo reprovaram,
  reproduzindo as falhas de carteira, exclusão, etapa, pendência e coleções comerciais.
- Após as correções: 17/17, incluindo os cinco testes de crm-manual-routes,
  em 32,07 segundos.
- Regressão de ocorrências manuais, lixeira, fatos passivos e contratos de funil:
  46/46 em 95,75 segundos.
- Total: 63 verificações aprovadas nos dois conjuntos finais.
- Auth e Firestore locais, usuários e empresas fictícias; transporte externo
  bloqueado nos testes de integração correspondentes.
- Tipagem e lint do recorte aprovados, incluindo rechecagem final após as últimas
  ampliações dos testes; ambos os processos concluíram com código de saída zero.
- Não houve build global, teste de carga ou QA visual em navegador neste lote.

Configuração de tipagem: tests/tsconfig.crm-foundation.json.
Logs: .qa-artifacts/crm-foundation/{baseline-tests,tests,regression,typecheck,lint}.log.
Snapshot dos arquivos anteriores: .qa-artifacts/crm-foundation/baseline/.
O checkout já tinha alterações extensas de outras unidades; o snapshot separa
as mudanças deste lote das diferenças acumuladas em relação ao Git.

## Limites e riscos mantidos explícitos

- Funil ainda tem limite de 240 e usa ownerId na consulta de perfil restrito,
  assim como a lista atual. Dados antigos com responsáveis divergentes entre
  aliases precisam de conciliação e migração nas etapas seguintes.
- O resumo compacto agora faz leituras dos chats ligados à página. Os campos são
  projetados, mas custo/latência sob grande volume ainda precisam ser medidos.
- A política comercial atual continua exigindo edit_leads para excluir. Não foi
  introduzida uma nova capacidade de exclusão nem alterados perfis de autenticação.
- Validação inicial de um lote não equivale a uma transação integral de exclusão.
  Remoção de muitos documentos, troca de dono/permissão durante a execução e
  interrupções exigem endurecimento próprio; não declarar atomicidade global.
- A mudança de coleções resolve exclusões novas. Não corrige automaticamente
  registros órfãos de exclusões antigas nem manifesta completude de toda retenção.
- Cadastro manual ainda tem checagem de duplicidade e limites antes do commit;
  concorrência entre cadastros, contato derivado e automações iniciais não estão
  integralmente migrados para um protocolo único.
- Este lote valida as escritas manuais. A matriz de todos os escritores e suas
  exceções ainda precisa ser fechada, incluindo importação e efeitos derivados.
- Ficha, Agenda, próxima ação, múltiplas oportunidades e precisão da IA continuam
  nas etapas previstas; não estão concluídas por estas correções.

## Próximas unidades

1. Fechar o inventário de escritores/leitores e as rotas irmãs de acesso/exclusão.
2. Endurecer exclusão concorrente e recuperação de execução parcial.
3. Validar o pacote entregável e os efeitos das novas leituras no desempenho.
4. Definir e migrar cliente, oportunidade e atividade com compatibilidade.
5. Entregar o fluxo diário de retorno com data/responsável na ficha e na Agenda.

Reversão: restaurar apenas os trechos deste lote usando o snapshot, preservando
alterações anteriores. Não desfazer em bloco os arquivos compartilhados; a reversão
reintroduz as falhas conhecidas e exige controle de acesso equivalente no release.
