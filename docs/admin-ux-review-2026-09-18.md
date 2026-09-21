# Revisão de usabilidade do admin — 18/09/2026

> Revisão rejeitada pelo usuário. Este registro descreve a tentativa anterior, não uma experiência aprovada ou uma entrega completa. A alteração visual do chat foi revertida em 18/09, e foram encontradas regressões da transformação de estilos em textos e protocolos de contato. Consulte [o registro de recuperação](admin-recovery-2026-09-18.md) para o estado atualizado.

## Problemas observados

A ficha de empresa aberta no navegador misturava superfícies escuras e claras, perdia contraste nos números e se estendia por toda a largura da janela. O menu apresentava módulos demais no mesmo nível. Formulários de cadastro competiam com as listas. A visão geral exibia instruções de arquitetura e funcionalidades futuras; o financeiro usava um título gigante e espaçamentos que dificultavam a leitura.

## Alterações

- Navegação organizada em operação, gestão e administração, com opções relacionadas dentro de cada módulo. Rotas e permissões existentes preservadas.
- Cabeçalho com caminho da página, busca de páginas e ações e menu da conta. A busca descreve o que o comando realmente oferece.
- Conteúdo com largura limitada, superfícies claras, bordas discretas e texto com contraste nas páginas do admin. Cores semânticas continuam distinguindo ações, alertas e resultados.
- Empresas em tabela no desktop e lista no celular, com busca, filtro de situação, contato e serviços; cadastro aberto por ação explícita. Exclusão fica nas ações secundárias e conserva suas restrições.
- Ficha da empresa prioriza projetos e propostas. Configuração técnica recolhida; removidos o selo incondicional de conta ativa e a lista genérica de próximas ações.
- Carteira destaca prioridade e próxima ação; pendências adicionais e custo estimado da IA ficam em detalhes.
- Visão geral mostra resultados, prioridades, agenda, funil e supervisão da IA, sem apresentações de arquitetura ou roadmap.
- Financeiro com título direto, métricas menores, abas e tabela mais compactas. Gráfico com cores para fundo claro e indicação quando ainda não existem receitas pagas. Alertas de contrato levam à configuração da empresa. Cadastro de lançamento com rótulos associados aos campos, diálogo identificado, foco inicial, Escape, cancelamento explícito e altura limitada em telas pequenas.
- Projetos, atividades, testes de estratégia e cadastro de pixel usam formulários recolhidos.
- Mídia mostra operações em lote quando existe seleção. Reconexão abre o fluxo para a empresa e o provedor escolhidos. O retorno de OAuth continua abrindo o fluxo de seleção de conta.
- Conversas ocupa a altura disponível do layout, sem somar outra altura de janela à barra superior.

## Validação

Typecheck passou. Lint geral sem erros, com 23 avisos preexistentes fora deste redesign; lint das páginas e componentes do admin sem avisos. Os 22 testes de administração e MCP passaram.

Build final passou, incluindo TypeScript e geração das 332 páginas. Conferidos no Chrome autenticado: lista com 11 empresas, busca que retorna as duas empresas chamadas Cantina do Lucas, filtro que exibe cinco ativas, abertura e cancelamento de cadastro, opções do comercial, busca de páginas, ficha de empresa, visão geral, financeiro, abas de mídia e reconexão que preseleciona empresa e provedor. A lista móvel final foi conferida em 390 × 844, com ações acessíveis sem rolagem lateral; o menu abre e fecha pelo botão e pela tecla Escape. Os ajustes de lista móvel e gráfico financeiro detectados na primeira conferência foram incorporados.

Esta revisão não implica novas conexões com provedores nem execução de alterações em campanhas. A validação visual e de navegação usa a sessão local autenticada; conexão OAuth e ações financeiras não são disparadas durante a conferência.

O filtro de prioridades da carteira exibiu sete empresas. A central de mídia apresentou três contas com necessidade de reconexão e nenhum relatório de campanha disponível. Isso é um estado real de integração; atualizar o visual não substitui autorizar as contas nos provedores.

O diálogo final de novo lançamento foi conferido no desktop e em 390 × 844: descrição, valor, tipo, vendedor e comissão têm nomes acessíveis; descrição recebe foco inicial, os controles cabem na tela e Escape fecha sem persistir dados. Nenhum lançamento foi criado. Conversas teve ajuste de tema e altura, mas sua conferência completa no navegador não foi concluída por timeout; não houve envio de mensagem.
