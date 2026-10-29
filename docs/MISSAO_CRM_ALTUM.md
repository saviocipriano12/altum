# Missão contínua — CRM Altum completo

Iniciada em 21/10/2026 por solicitação explícita do usuário para trabalhar até
finalizar o plano integral. Estado: ATIVA. Meta da conversa registrada.

## Objetivo

Entregar o CRM da Altum como operação comercial com IA: vendedor encontra quem
atender, entende o contexto, age e mantém o próximo passo; dono identifica riscos,
acompanha equipe e concilia resultados. Integridade, experiência, acessibilidade,
desempenho e recuperação são parte da entrega.

Fonte de escopo e aceite: [plano integral](PLANO_EVOLUCAO_CRM_2026-10-21.md).
Base factual: [auditoria](AUDITORIA_CRM_2026-10-21.md).
Primeiro lote: [evidências](CRM_PRIMEIRO_LOTE_2026-10-21.md).

## Mandato de execução

- Prosseguir nas unidades autorizadas sem pedir confirmação entre etapas.
- Incluir as alterações necessárias nas APIs e serviços comerciais do cliente.
- Preservar admin, autenticação, páginas públicas, dados e rotas antigas.
- Inspecionar alterações existentes e trabalhar em trechos pequenos e revisáveis.
- Não desfazer trabalhos alheios; registrar snapshots quando arquivos compartilhados mudarem.
- Usar componentes existentes. Referências e código externo exigem revisão de
  compatibilidade/licença por arquivo, origem documentada e teste da adaptação.
- A execução permanece nesta conversa. Não criar chats ou enviar mensagens a outros chats.
- Trabalhar com emuladores e dados fictícios para reprodução; separar prova local,
  prova em navegador e prova real. Nenhum desses níveis substitui outro.
- Preparar migração/publicação em pacote concreto e testado. Ações em produção
  que dependam de acesso ou aprovação humana permanecem explicitamente pendentes,
  sem impedir trabalho independente nas outras frentes.
- Não marcar a missão concluída por terminar um lote ou por esgotar um turno.

## Entregas e sequência

| Frente | Entrega obrigatória | Situação inicial |
| --- | --- | --- |
| 0. Base | Inventário de leitores/escritores, matriz de acesso, baseline e jornadas | Parcial; cinco falhas reproduzidas e regressões criadas |
| 1. Integridade | Acesso uniforme, funil validado, exclusão/recuperação e concorrência | Primeiro lote local aprovado; endurecimento restante aberto |
| 2. Dados | Cliente, oportunidade e atividade separados com migração compatível | Aberta |
| 3. Vendedor | Rotina, ficha enxuta, fatos editáveis, Agenda e próxima ação integradas | Aberta |
| 4. Comercial | Critérios de etapa, propostas, perda, ganho e recompra coerentes | Aberta |
| 5. IA | Evidência por campo, controle humano, avaliações por segmento/canal e autonomia delimitada | Aberta |
| 6. Dono | Cobertura integral, busca, indicadores conciliáveis e equipe | Aberta |
| 7. Homologação | Jornadas, mobile, acessibilidade, carga, build, piloto, migração e reversão | Aberta |

Preparar desenho de experiência, jornadas e avaliação da IA durante o trabalho
de fundação; somente habilitar comportamentos cujas dependências estejam validadas.

## Como trabalhar em cada unidade

1. Ler esta missão, o último progresso e o código atual do recorte.
2. Definir problema verificável e critério de saída, incluindo efeito para o usuário.
3. Reproduzir defeitos relevantes antes da correção e preservar a exigência do teste.
4. Implementar o menor conjunto coerente, incluindo erro, recuperação e compatibilidade.
5. Testar comportamentos autorizados e negados, concorrência e repetição quando aplicável.
6. Rodar tipagem/lint do recorte e regressões impactadas. Completar build do pacote
   entregável, resolvendo ou isolando falhas globais com evidência.
7. Verificar experiência em navegador quando a unidade alterar fluxo ou apresentação.
8. Atualizar progresso com arquivos, evidências, limites e próxima unidade.
9. Continuar a próxima unidade elegível. Não encerrar fases com condições críticas abertas.

## Critérios integrais de conclusão

- Mesma política por empresa, perfil e registro em todos os leitores e escritores.
- Repetição e concorrência não duplicam efeitos nem destroem correções humanas.
- Exclusão e restauração consistentes, recuperáveis e sem reativar envios antigos.
- Várias oportunidades por pessoa; suporte e negociação identificáveis.
- Retorno com data/responsável aparece na ficha, rotina e Agenda e pode ser reagendado.
- Fatos extraídos podem ser corrigidos; proveniência e autoridade humana preservadas.
- Etapas, propostas, venda e recebimento representam acontecimentos distintos.
- IA aprovada pelos critérios do plano, com amostra, precisão/cobertura e limites explícitos.
- Indicadores conciliam com registros completos do período e com exportações autorizadas.
- Jornadas críticas, acessibilidade e experiência desktop/mobile verificadas.
- Desempenho medido, filas observáveis, recuperação e reversão testadas.
- Pacote entregável compila e passa pelas verificações exigidas.
- Migração/piloto reais e aceite de uso só são concluídos com evidência correspondente.
- Nenhum defeito crítico/alto conhecido fica oculto no escopo entregue.

## Retomada e comunicação

Usar [CRM_MISSAO_PROGRESSO.md](CRM_MISSAO_PROGRESSO.md) como registro de retomada.
Registrar a próxima ação exata e os processos em execução. Não repetir testes
aprovados sem mudança, falha ou risco novo que justifique a repetição.
Atualizações ao usuário focam achados e entregas. Distinguir implementado, testado
localmente, verificado visualmente, publicado e comprovado em uso.

Se faltar informação externa, preparar a decisão e registrar o que depende dela;
continuar os demais trabalhos autorizados. Nunca inventar homologação humana.
Estado bloqueado da meta somente conforme a regra da ferramenta e recorrência
real do bloqueio, sem abandonar trabalho independente que ainda possa avançar.
