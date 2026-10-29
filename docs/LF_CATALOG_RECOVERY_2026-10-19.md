# LF: retomada do catálogo no teste exclusivo

## Evidência

- Conversa autorizada: somente o ID completo do WhatsApp terminado em 7782, no tenant LF.
- Auditoria de produção de 19/10 às 15:58: `Quero uma camisa do flamengo tamanho G` recebeu `Entendi. Me conta um pouco mais sobre o que você precisa?`, motivo `matched_kb`, ferramentas `kb_docs offer_engine chat_state` (sem consulta ao catálogo ao vivo nesse registro).
- Preview autenticado no painel com o mesmo pedido consultou Shopify e retornou opções do Flamengo, motivo `shopify_live_product_selection`. Isso demonstra a conexão no preview, não comprova entrega real nem estoque de cada tamanho.
- O runtime tinha outra autorização: modo global live OU piloto temporário por conexão. O teste exclusivo da IA não era usado nessa autorização. Não foi consultado o valor atual do piloto no banco; expiração não é afirmada como fato.

## Correção restrita

1. As duas consultas do runtime recebem a configuração de rollout carregada pelo servidor.
2. Um teste explicitamente restrito ao tenant e ID exatos também autoriza a leitura de catálogo enquanto essa restrição estiver configurada. Não há liberação global, por telefone parcial ou por dado enviado pelo cliente/modelo.
3. Continuam obrigatórios loja allowlisted, conexão Shopify ativa do tenant, módulo commerce e ferramenta knowledge_read. Pedidos de humano/pagamento/pós-venda preservam sua rota própria. Pausas, sombra e percentual continuam sob os controles existentes do agente e da entrega.
4. Em um teste explícito, falta de configuração/conexão/módulo vira recuperação com humano em vez de cair silenciosamente no catálogo importado.
5. Se nenhum modelo aceito nem catálogo produziu resposta, o teste encaminha ao humano (exceto cumprimentos sociais simples), antes do escritor de fallback que pode copiar KB ou pedir contexto genérico. Essa contenção é restrita ao teste; não representa uma reforma global do fallback de todos os tenants.

## Verificação

- 46 testes: escopo exato, bloqueios, catálogo, variantes, estoque, isolamento e handoff.
- 33 testes adicionais: política conversacional, compositor, papéis e ferramentas.
- Lint dos arquivos alterados: zero erros; dois avisos preexistentes no agente.
- Publicação deve aplicar apenas os três arquivos de runtime sobre a fonte exata da versão canônica, preservando mudanças de outras tarefas.
- Não reprocessar mensagens antigas, limpar memória ou simular entrada do cliente. Depois de publicar, pedir nova mensagem pelo 7782 e verificar a resposta/auditoria.

## Publicação confirmada

- Baseline: `dpl_ASLb3ibMcBiRWMXfrLLhR7qWoAqs`.
- Nova versão: `dpl_BF5WCyPJAhLjdgC7cSGz7dTALh5Z`, propósito `lf-exclusive-catalog-recovery`.
- Build de produção e TypeScript passaram; versão promovida e endereço canônico `altumia.com.br` verificado como READY nessa versão.
- Após recarregar o painel: pausa de envio = 0; teste exclusivo = 1; lista com apenas o ID completo autorizado terminado em 7782.
- Nova entrega real no WhatsApp ainda depende de uma nova mensagem do usuário; não foi fabricada nem reprocessada entrada antiga.

## Limites

- Fotos e carrinho automático não foram implementados por esta correção.
- A lista de modelos ainda solicita a escolha antes da confirmação de tamanho. Não anunciar a lista inteira como disponível em G sem verificar cada variante.
- A qualidade geral não está aprovada até uma nova conversa real; preview e testes não substituem entrega no WhatsApp.
