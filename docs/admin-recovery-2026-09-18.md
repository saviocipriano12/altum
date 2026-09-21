# Recuperação e prestação de contas do admin — 18/09/2026

O usuário rejeitou o redesign por perda de identidade, usabilidade e falta das funcionalidades combinadas. A troca geral de aparência não resolve a operação administrativa solicitada. Compilação e testes locais não comprovam integração real nem qualidade da experiência.

## Regressões identificadas e recuperação

A transformação anterior percorreu literais de texto além das classes CSS. Tokens terminados em dois-pontos foram indevidamente removidos: isso atingiu mensagens, rótulos e os protocolos `tel:` e `mailto:` do chat.

- `app/admin/chat/page.tsx` foi recuperado integralmente em relação à versão anterior em Git, comparando o conteúdo normalizado antes de gravar. Foram restaurados tema, altura original, textos e protocolos de contato; nenhuma funcionalidade nova do chat foi alegada.
- Foram recuperados 81 literais não relacionados a estilos em outras 22 páginas administrativas, usando correspondência exata com a transformação indevida e o texto anterior. A recuperação preserva as alterações de lógica e integração existentes nessas páginas.
- O layout, menu e outras páginas ainda contêm mudanças da tentativa rejeitada. Esta recuperação não representa um redesign completo aprovado.
- A leitura autenticada da lista de empresas funcionou. A navegação para o chat expirou novamente; apresentação e fluxo completo de mensagens ainda não foram confirmados no navegador.

## O que existe e o que falta

Verificação desta recuperação: comparação do chat com a versão anterior aprovada; `npx eslint app/admin` concluído sem erros ou avisos. O build recompilou, passou TypeScript e gerou as 332 páginas; a apresentação do chat permanece sem confirmação por timeout no navegador. Nenhuma campanha, cobrança ou mensagem foi executada nesta conferência.

| Pedido | Implementação local existente | Limite da entrega |
|---|---|---|
| Operar a carteira sem entrar em cada cliente | Carteira, priorização e resolução de identidade comercial/SaaS | Ficha 360, responsáveis, tarefas, prazos e rentabilidade completa continuam pendentes |
| Ver contas e campanhas de vários clientes | Central de mídia, filtros, inventário e sincronização por empresa | A conferência anterior mostrou três contas Meta com reconexão pendente e nenhum relatório de campanha |
| Gerenciar campanhas em lote | Seleção de alvos, rascunhos de pausa/orçamento, revisão, aplicação e histórico | Leitura e escrita reais nos provedores não foram homologadas; orçamento Meta incompleto bloqueia recomendações |
| Cadastrar e acompanhar pixels | Cadastro interno e descoberta de ativos Meta/conversões Google | Cadastro e acesso ao ativo não comprovam instalação nem recebimento de eventos |
| ChatGPT acessando o admin | Endpoint MCP, autorização, escopos, seleção de empresas e revogação | Política desabilitada por padrão; conexão real com ChatGPT continua pendente |
| IA aprendendo com cada cliente | Hipóteses, baseline, sugestões e memória de resultados por empresa | Não existe treinamento automático de modelo nem operação autônoma completa de tráfego |
| Recuperar funcionalidades antigas | Correções locais de permissões, templates, identidade, idempotência e preservação de histórico | Necessário conferir cada fluxo e perfil com dados reais; convite administrativo por e-mail ainda não foi entregue |

Os detalhes técnicos e limites da implementação estão em [admin-platform-release-2026-09-18.md](admin-platform-release-2026-09-18.md). Seus 125 testes são locais, com fixtures/mocks, e não demonstram homologação dos provedores.

## Critérios para concluir a evolução

1. Conferir as funções atuais por tela e perfil: ação, endpoint, persistência, erro, permissão e resultado visível. Distinguir funcionalidade operacional, parcial, quebrada e planejada.
2. Recuperar regressões e validar o chat em uma sessão autenticada, incluindo espaço disponível, lista e conversa, sem enviar mensagens durante inspeção.
3. Definir a apresentação Altum e validar primeiro carteira/ficha de empresa com navegação e ações reais, antes de propagar alterações visuais.
4. Homologar duas empresas de teste nos provedores: conexão, conta, campanha, conversão/pixel, sincronização e revisão dos resultados por alvo. Só então considerar gestão em lote operacional.
5. Homologar conexão MCP real e escopos por empresa; desenvolver a inteligência de estratégia sobre eventos e resultados confiáveis, com rastreabilidade das recomendações.
