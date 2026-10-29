# App Shopify Altum — piloto LF Multimarcas

O fluxo simplificado foi publicado e o app piloto foi cadastrado no Dev Dashboard.
A loja de Vitória autorizou o acesso em 13/10/2026. O registro ao final documenta
o que foi verificado; as instruções abaixo também servem para novas implantações.

## Cadastro pela Altum

1. Acesse https://dev.shopify.com/dashboard com uma conta autorizada a desenvolver apps.
2. Crie o app `Altum — LF Multimarcas` para o piloto.
3. Configure uma versão do app com:
   - App URL: `https://altumia.com.br/api/integrations/commerce/shopify/install`
   - Redirect URL: `https://altumia.com.br/api/integrations/commerce/shopify/callback`
   - Aplicação fora do admin Shopify (não embedded).
   - Permissões: `read_products,read_orders,read_fulfillments,read_customers`.
   - Fluxo de autorização por código para aplicação standalone. A implementação
     atual solicita as permissões na URL OAuth; mantenha o fluxo de instalação
     compatível com essa configuração. Não ative token exchange/embedded sem
     implementar essa autenticação na Altum.
4. Libere a versão e escolha distribuição personalizada para o domínio
   `.myshopify.com` confirmado da LF Multimarcas. Gere o link de instalação.
5. No ambiente de hospedagem Altum, configure `SHOPIFY_CLIENT_ID`,
   `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_OAUTH_SCOPES`, `APP_URL` e
   `SECRET_ENCRYPTION_KEY`. Use o domínio canônico real da implantação;
   as URLs de retorno precisam coincidir exatamente com o cadastro.
   Credenciais devem ser cadastradas no servidor, nunca no chat/navegador.
6. Publique as alterações e teste usando o link de instalação ou o botão
   Conectar Shopify dentro da Altum. O cliente aprova o acesso na Shopify.

A entrada pelo App URL valida a assinatura da Shopify e leva à área do cliente.
O login Altum é obrigatório. A conexão só é vinculada à empresa da sessão depois
de validar acesso, permissão de gestão de canais e módulo ecommerce.

## Experiência e compatibilidade

- O formulário principal pede apenas o link do painel ou domínio da loja.
- Cadastros antigos podem usar Completar conexão. O ID é levado no estado OAuth
  e validado no servidor; a autorização atualiza o cadastro selecionado.
- As configurações manuais continuam disponíveis em Avançado.
- Cadastro ativo sem credencial ou evento recebido aparece como Conexão pendente.
- O callback valida as permissões concedidas antes de salvar acesso.
- Eventos comerciais e APP_UNINSTALLED são registrados automaticamente via API.
  A desinstalação assinada remove credenciais e pausa a conexão, preservando dados.
- Uma falha de carga inicial ou de eventos não é apresentada como sucesso completo.
  A loja pode tentar Sincronizar agora ou reconectar.

## Validação real antes de liberar o piloto

Instale como administrador da LF Multimarcas; confirme que o cadastro anterior
foi atualizado, que produtos e pedidos recentes aparecem e que um pedido de teste
atualiza a Altum. Verifique assinatura e entrega dos eventos no painel Shopify.
Teste reconexão e desinstalação com uma loja de desenvolvimento antes de usar
a loja real. Confirme o agendador existente `/api/internal/jobs/commerce/sync`
e sua credencial `COMMERCE_SYNC_TOKEN`/configuração de implantação.

## Limites e próxima etapa

A sincronização existente importa um lote recente, não o catálogo/histórico
completo: 15 registros por recurso no callback, com limites específicos no
provider. Importação completa requer paginação e execução em segundo plano.
Carrinhos dependem das permissões liberadas pela Shopify e podem ficar indisponíveis.

Este piloto não equivale a um app público pronto para aprovação. Para várias
empresas independentes, cadastre uma aplicação separada de distribuição pública;
o tipo de distribuição não pode ser alterado depois. Prepare aprovação de dados
protegidos, webhooks obrigatórios de privacidade, requisitos de cobrança aplicáveis,
renovação de tokens conforme o modo de autenticação escolhido e revisão Shopify.
Visibilidade limitada permite distribuir o app público aprovado por link.

## Cadastro realizado em 13/10/2026

- Organização Shopify: LF Multimarcas vitoria (`232142313`).
- App: Altum — LF Multimarcas (`435024986113`).
- Versão ativa: `piloto-2` (`1165651017729`).
- Loja selecionada para o piloto: `lf-multimarcas-vitoria-nm0fp51f.myshopify.com`.
- As URLs usam o domínio canônico sem www, igual ao APP_URL de produção.
- O painel desta organização oferece Apps → Ações → Instalar app → selecionar
  a loja. A entrada chega à URL do app; a autorização deve iniciar dentro da Altum
  depois do login e da seleção da empresa. Selecionar a loja não conclui a conexão.
- As quatro variáveis Shopify foram cadastradas no projeto Altum da Vercel.
  Nenhuma chave é registrada neste documento ou no repositório.
- `scripts/deploy-shopify-pilot.mjs` monta a publicação a partir dos arquivos da
  implantação ativa, substituindo somente oito arquivos da integração. Valida
  os arquivos originais contra HEAD e preserva as demais fontes por referência.
  A publicação fica sem atribuição automática de domínio até ser verificada.
- A implantação `dpl_7Zv9Ew2WJWEezECAijkxW38a27uC` foi promovida após build e
  validação das rotas. O cadastro manual existente foi reaproveitado, sem duplicação.
- A autorização retornou à Altum com eventos em tempo real ativos e 15 produtos
  importados. A importação de pedidos revelou campos opcionais `undefined`
  (rastreio ausente); os payloads da sincronização Shopify agora passam pela mesma
  serialização JSON de um webhook antes da persistência. Dois testes de regressão
  cobrem esse caso. `--sync-fix` publica somente o provider e seu helper novo.
- A correção `dpl_4FQZk2RZcPG5SUE2XJUzdMjXxsCF` passou no build e foi promovida.
  A sincronização real terminou às 13:37 de 13/10/2026 com 20 produtos, 20 pedidos
  e 5 carrinhos, estado Conectada e Tempo real ativo. Nenhum pedido artificial foi
  criado. O modo de mensagens foi mantido Desligado. Entrega de um evento futuro,
  desinstalação e importação do histórico completo não foram testadas na loja real.

Referências oficiais:

- https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard
- https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps
- https://shopify.dev/docs/apps/launch/distribution
- https://shopify.dev/docs/apps/launch/protected-customer-data
