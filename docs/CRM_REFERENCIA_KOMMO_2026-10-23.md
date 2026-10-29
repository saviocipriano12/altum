# Kommo como referência para o CRM da Altum

Data: 23/10/2026. Referência principal autorizada pelo usuário: Kommo.
Pesquisa em documentação oficial. Não houve teste em uma conta Kommo nesta etapa;
comportamento documentado não comprova qualidade em produção nem capacidade da Altum.

## Decisão de produto

Usar padrões concretos de operação do Kommo para orientar a Altum: registros bem
definidos, processo configurável e trabalho diário conectado às conversas.
Preservar a identidade e os módulos existentes da Altum. Não reproduzir marca,
limites de planos ou estrutura interna presumida do fornecedor.

## Referência, diferença e prova exigida

| Base documentada no Kommo | Situação identificada na Altum | Critério para aceitar a evolução da Altum |
| --- | --- | --- |
| Contato, empresa e negociação guardam informações com finalidades diferentes. | Há informações comerciais em campos e memórias concorrentes. O vínculo com a negociação precisa ser conferido em todos os caminhos. | Duas compras do mesmo contato mantêm valores, interesses e prazos independentes; identidade e histórico continuam acessíveis. |
| Campos devem ajudar a compreender, agir, filtrar, automatizar ou medir. | Há campos fixos e conteúdo genérico que não orienta uma ação. | Cada campo visível tem uso definido; informação ausente aparece como desconhecida, sem inventar preenchimento. |
| Funis e etapas são configuráveis. | Existem modelos de processo, mas parte da qualificação continua usando critérios fixos. | Alterar o processo da empresa muda critérios, campos e ações efetivos, sem criar código específico por segmento. |
| Campos personalizados têm tipos e podem ser obrigatórios em determinadas etapas. | A extração contínua tem uma lista fixa de campos; configuração e leitura não governam todo o percurso. | Criar um campo na configuração permite extrair, validar, editar, filtrar e usá-lo na etapa correta. |
| Tarefas têm vínculo, responsável e prazo. | A auditoria e as capturas mostram tarefas genéricas; a rotina precisa de revisão de coerência e duplicação. | Uma pendência concreta gera uma atividade executável; nova mensagem atualiza ou encerra a atividade aplicável sem acumular cópias. |
| Agentes têm condições e ações configuradas, como preencher campo, criar tarefa e transferir atendimento. | A união entre extração e regras pode manter um fato que a leitura semântica não confirmou. | Uma ação só executa com evidência, permissão e regra da empresa; ausência de confirmação não autoriza o preenchimento. |
| Agentes podem tratar áudio e transferir para humano com contexto; falhas de transcrição têm tratamento explícito. | Há testes isolados de mídia, sem homologação integral dos canais e da interface. | Áudio e imagem reais percorrem recebimento, interpretação, persistência e interface; falha aparece como pendência, não como leitura bem-sucedida. |

Fontes oficiais por assunto:

- [Registros e utilidade das informações](https://support.kommo.com/docs/choose-what-information-to-store).
- [Funis e etapas](https://support.kommo.com/docs/pipeline-usage).
- [Configuração dos campos](https://support.kommo.com/docs/customize-fields-in-lead-profiles).
- [Contrato de tarefas](https://developers.kommo.com/reference/tasks).
- [Condições e ações dos agentes](https://support.kommo.com/docs/ai-agent-manual-setup).
- [Operação dos agentes, áudio e transferência](https://support.kommo.com/docs/work-with-ai-agents).

As exigências da coluna final são decisões e testes da Altum. Não são alegações
de que o Kommo já resolva todos esses cenários.

## Experiência que queremos entregar

Para o vendedor: uma fila de trabalho que permita identificar quem precisa de
resposta, abrir o contexto, responder, corrigir dados, registrar retorno e mover
a negociação com poucos passos. A ficha deve reunir situação atual, conversa,
compromissos e histórico, com a próxima ação em destaque.

Para o dono: visão por responsável e processo, com negociações sem acompanhamento,
atrasos, conversão e resultados conferíveis. A documentação de configuração para
equipes do Kommo serve de referência para testar passagem de responsabilidade,
retorno de clientes e indisponibilidade do responsável.
[Fonte oficial](https://support.kommo.com/docs/es/set-up-kommo-for-a-sales-team).

Essas são metas para a Altum; não representam avaliação prática da interface Kommo.

## O que precisamos provar além da referência

A documentação consultada não demonstra que qualquer CRM interprete corretamente
toda conversa. Na Altum, precisamos manter testes próprios para:

- Correção e retirada de informação: 5 mil → 3 mil → orçamento ainda indefinido.
- Pergunta junto com afirmação, confirmação curta, hipótese, negação e dados de terceiros.
- Edição humana refletida em ficha, qualificação, sugestões e relatórios.
- Evidência em várias mensagens e mídias, com falha e conteúdo incompleto visíveis.
- Eventos repetidos, fora de ordem, indisponibilidade e isolamento entre empresas.
- Agendamento, loja, venda consultiva e operação híbrida usando o mesmo núcleo configurável.

Não copiar a política de ciclo de vida dos agentes sem decisão explícita: a
documentação do Kommo distingue ativação de novas conversas e continuidade do
agente em conversas existentes. Na Altum, pausa, troca de responsável e mudança
de etapa precisam de regras previsíveis e testes próprios.

## Ordem de execução

1. Fechar o contrato de informação vigente e eliminar divergências entre leitores.
2. Fazer a configuração de campos e processo governar extração, validação e ações.
3. Integrar conversa, ficha e rotina de tarefas em uma experiência simples.
4. Validar jornadas completas e falhas; registrar resultado observado e lacunas.
5. Expandir automações apenas depois da aprovação dessas jornadas.

O diagnóstico profundo continua aberto. Esta referência orienta a implementação;
não altera resultados dos testes anteriores nem libera expansão de funcionalidades.
