# Gates externos para o go-live da Altum

Este documento separa o que ja existe no codigo do que ainda depende de console, credencial, decisao comercial ou teste real. Nenhum gate externo deve ser considerado concluido sem evidencia (captura, log, ID da transacao ou registro do teste).

## Estado atual

### Ja implementado no codigo

- Cadastro publico por email/senha e Google, sem aprovacao previa do admin.
- Senhas tratadas pelo Firebase Authentication; a aplicacao nao grava senha no Firestore.
- Verificacao de email, recuperacao de senha e bootstrap seguro do tenant no servidor.
- Firebase Admin gera links de verificacao/redefinicao; a Resend entrega e-mails personalizados e a pagina da Altum processa os codigos, sem depender da URL acionavel do console.
- Login Google liberado na CSP para carregar os scripts oficiais exigidos pelo Firebase.
- Trial de 7 dias, bloqueio do portal apos o vencimento e aviso de dias restantes.
- Planos editaveis pelo admin, checkout recorrente Asaas e valor resolvido no servidor.
- Webhook Asaas com token, comparacao em tempo constante e deduplicacao por evento.
- Aplicacao de modulos e limites do plano apos confirmacao do pagamento.
- Rules do Firestore com isolamento por tenant e protecao contra alteracao do proprio papel.
- Cabecalhos de seguranca, `robots.txt`, `sitemap.xml`, `llms.txt`, metadados e paginas legais basicas.
- Testes estruturais de autenticacao, checkout, webhook, trial, rules e limites dos planos.

### Ainda nao autoriza producao

Ter o codigo pronto nao comprova configuracao correta dos provedores. Os itens P0 abaixo continuam bloqueando a abertura comercial.

## P0 — bloqueadores de lancamento

### 1. Firebase Authentication

Passo a passo operacional: [`docs/FIREBASE_CONFIGURACAO_PASSO_A_PASSO.md`](./FIREBASE_CONFIGURACAO_PASSO_A_PASSO.md).

- [x] Ativar os provedores **Email/senha** e **Google** no Firebase Authentication. Evidencia visual recebida em 2026-08-31.
- [x] Configurar `altumia.com.br` e `www.altumia.com.br` em dominios autorizados. Evidencia visual recebida em 2026-08-31.
- [x] Alterar a politica de senha de **Notificar** para **Exigir a aplicacao** e ajustar o minimo para 8 caracteres. Configuracao confirmada pelo responsavel em 02/09/2026.
- [x] Ativar protecao contra enumeracao de email. Configuracao confirmada pelo responsavel em 02/09/2026.
- [x] Implementar solicitacao, validacao do link e conclusao da redefinicao de senha dentro da Altum.
- [x] Implementar manipulador proprio para links de acao do Firebase no dominio da Altum.
- [x] Publicar essas rotas em producao na Vercel e validar HTTP 200 em `www.altumia.com.br` em 01/09/2026. Deployment `dpl_751xFyFYqGJE7YfiRAGgv3x4prSS`.
- [x] Retirar a dependencia da URL acionavel do console: o servidor converte o link assinado do Firebase para `https://www.altumia.com.br/cliente/acao-email` antes do envio.
- [x] Cadastrar `RESEND_API_KEY`, `AUTH_EMAIL_FROM` e `AUTH_EMAIL_REPLY_TO` na Vercel Production. Confirmado pelo responsavel em 01/09/2026.
- [ ] Confirmar na Resend que a chave usada pela aplicacao e nova, exclusiva, possui permissao somente de envio e esta restrita a `altumia.com.br`; revogar definitivamente qualquer chave exposta em conversa ou captura.
- [ ] Confirmar na Vercel Production que `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` e `APP_URL` usam `https://www.altumia.com.br` (nunca localhost).
- [x] Fazer novo deploy para publicar as rotas de e-mail e a correcao CSP do Google. Deployment de producao `dpl_E6PuvhYU1otevSedCC1SiZkK5e8g`, estado `READY`, publicado e associado a `https://www.altumia.com.br` em 01/09/2026.
- [ ] Testar na Resend os status de entrega dos e-mails de verificacao e redefinicao enviados pela aplicacao.
- [ ] Testar cadastro, verificacao, login, logout, recuperacao e Google login em janela anonima e celular.
- Evidencia: IDs dos usuarios de homologacao e capturas dos provedores/dominios configurados.

### 2. Firebase Rules e isolamento

- [x] O `firestore.rules` vigente foi validado e publicado conforme o registro operacional atual.
- [ ] Publicar `storage.rules`. A primeira release segue bloqueada por IAM: conceder ao service account da Altum `roles/firebaserules.admin` ou as permissoes minimas `firebaserules.releases.create`, `firebaserules.releases.update` e `firebaserules.rulesets.create`.
- [ ] Executar testes no Firebase Emulator Suite para regras de Firestore e Storage; os testes estruturais atuais nao substituem o emulador.
- [ ] Testar com quatro contas de homologacao: dono, gestor, vendedor A e vendedor B.
- [ ] Confirmar `permission-denied` quando o vendedor A tenta ler/escrever dados exclusivos do vendedor B e quando qualquer usuario tenta trocar o proprio `role`, `tenantId` ou status.
- Evidencia: log do Emulator Suite e matriz de acesso assinada pelo responsavel do teste.

### 3. Asaas em sandbox e producao

- [x] `ASAAS_API_KEY` e configuracao do webhook informadas como cadastradas na Vercel/Asaas em 2026-08-31. Ainda validar se Preview usa sandbox e Production usa a API de producao.
- [ ] Corrigir a URL cadastrada no Asaas para `https://www.altumia.com.br/api/webhooks/asaas`, ativar o webhook e remover a penalizacao. A URL sem `www` respondeu `307` e nao deve ser usada pelo provedor.
- [ ] Confirmar no webhook os eventos `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED`.
- [ ] Validar no sandbox: pagamento aprovado, recusado, pendente, atrasado, estornado e webhook repetido.
- [ ] Confirmar que valor e plano adulterados no navegador nao alteram a cobranca oficial.
- [ ] Confirmar que pagamento aprovado muda contrato, status do tenant e entitlements uma unica vez.
- [ ] Repetir em producao com uma compra real de baixo valor e depois estornar conforme a politica da empresa.
- [x] Checkout hospedado abriu corretamente em producao, conforme teste do responsavel em 2026-09-02.
- [x] Central `Configuracoes > Faturamento` publicada com plano, vencimento, situacao, historico de cobrancas, links de pagamento, upgrade e cancelamento.
- [ ] Confirmar o email/recibo enviado ao cliente e concluir uma cobranca real ponta a ponta com webhook `PAYMENT_CONFIRMED`.
- Evidencia: IDs de checkout, assinatura, cliente, pagamento e evento de webhook.

### 4. Decisoes comerciais e juridicas de cobranca

- [ ] Definir os valores finais, limites e modulos de cada plano.
- [x] Trial sem cartao por 7 dias.
- [x] Cancelamento solicitado ate 7 dias do primeiro pagamento inicia estorno integral e encerra a recorrencia; o acesso e encerrado quando o Asaas confirma o estorno.
- [x] Cancelamento depois da janela de reembolso inativa novas cobrancas e mantem acesso ate o fim do ciclo contratado.
- [x] Tolerancia de inadimplencia de 3 dias corridos, com aviso claro e data de bloqueio no painel.
- [x] Upgrade para plano superior permitido; os recursos sao liberados apos a operacao e o novo valor vale para as proximas cobrancas.
- [ ] Definir downgrade, impostos e nota fiscal.
- [ ] Revisar Termos de Uso, Politica de Privacidade, politica de cancelamento e identificacao empresarial com assessor juridico/contabil.
- Evidencia: politica aprovada e publicada, com versao/data registradas.

### 5. Segredos, borda e abuso

- [ ] Confirmar que nenhum segredo esta em variavel `NEXT_PUBLIC_*`, Git, logs, screenshots ou historico de deploy.
- [ ] Rotacionar qualquer credencial que possa ter sido exposta durante desenvolvimento.
- [ ] Configurar WAF/rate limit no provedor de borda para `/api/public/*`, `/api/auth/*`, `/api/billing/*` e `/api/webhooks/*`.
- [ ] Ativar Firebase App Check para os clientes web antes de abrir formularios publicos em escala.
- [ ] Validar CSP, HSTS, protecao de frame e MIME no dominio de producao.
- [ ] Executar `npm audit`, varredura de segredos e teste de dependencias no CI.
- Evidencia: export das regras WAF, relatorio de scanner e execucao de `verify:postdeploy`.

### 6. Backup, recuperacao e observabilidade

- [ ] Configurar export/backup automatico do Firestore e politica de retencao.
- [ ] Executar uma restauracao real em projeto de homologacao; backup nao testado nao e recuperacao.
- [ ] Criar alertas para erro 5xx, latencia, falha de webhook, fila parada, aumento de 401/403/429 e indisponibilidade dos provedores.
- [ ] Definir responsavel e canal de incidente, RTO e RPO iniciais.
- [ ] Evitar dados pessoais completos nos logs e definir retencao/mascaramento.
- Evidencia: restore testado, alerta recebido e runbook de incidente acessivel.

## P1 — concluir logo apos os bloqueadores

### Cobranca resiliente

- [ ] Persistir rapidamente o webhook e processar o trabalho pesado de forma assincrona, com retries e fila de falhas.
- [ ] Criar reconciliacao diaria entre contratos locais e assinaturas/pagamentos do Asaas.
- [ ] Implementar dunning: avisos de falha/atraso, nova tentativa e bloqueio conforme a politica aprovada.
- [ ] Implementar cancelamento, upgrade e downgrade somente depois das decisoes comerciais do P0.
- [ ] Criar trilha de auditoria de mudancas de plano/preco feitas pelo admin.

### Autenticacao avancada

- [ ] Exigir reautenticacao recente para email, senha, exclusao de conta e operacoes financeiras sensiveis.
- [ ] Planejar MFA inicialmente para admins internos e donos de tenant.
- [ ] Criar gestao de sessoes/dispositivos e acao de encerrar todas as sessoes.
- [ ] Alertar o usuario sobre login suspeito ou alteracao de dados sensiveis.
- [ ] Definir ciclo de exclusao/exportacao de conta e atendimento aos direitos da LGPD.

### SEO e Google

- [ ] Verificar o dominio no Google Search Console usando `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` ou DNS.
- [ ] Enviar `https://DOMINIO/sitemap.xml` e conferir cobertura/indexacao.
- [ ] Validar canonical, Open Graph, dados estruturados e Core Web Vitals no dominio final.
- [ ] Definir uma pagina principal por intencao de busca para evitar canibalizacao.
- [ ] Publicar conteudo original com autoria, data, experiencia real, links internos e CTA util.
- [ ] Medir Search Console e analytics com consentimento adequado; nao prometer que `llms.txt` garante citacao por IAs.

## P2 — maturidade continua

- [ ] Pentest externo antes de clientes maiores e novamente apos mudancas relevantes.
- [ ] Revisao trimestral de acessos, service accounts, chaves e dependencias.
- [ ] Programa de divulgacao responsavel de vulnerabilidades e email `security@`.
- [ ] Teste periodico de continuidade, restauracao e resposta a incidentes.
- [ ] SLOs de disponibilidade/latencia e pagina publica de status quando a operacao justificar.
- [ ] Politicas de retencao e descarte por categoria de dado.

## WhatsApp, Meta, Instagram e ecommerce

- [ ] Manter `META_APP_SECRET`, `META_VERIFY_TOKEN` e tokens de canal somente no servidor.
- [ ] Validar entrega Meta real com `X-Hub-Signature-256`.
- [ ] Concluir revisao do app Meta e permissoes necessarias para Instagram/Messenger.
- [x] Automacao do Instagram permite regras por todos os posts/reels ou por publicacoes especificas, filtro por palavras-chave e resposta privada ao comentario.
- [x] A interface nao oferece DM automatica por novo seguidor: a API oficial exige que a conversa seja iniciada por mensagem, story ou comentario elegivel.
- [ ] Validar com uma conta Meta aprovada se a listagem de publicacoes retorna miniaturas e se uma resposta privada real chega ao Direct dentro da janela permitida.
- [x] Tour guiado preserva a etapa durante mudancas de rota; shell do cliente remove atraso artificial e pre-carrega a navegacao principal.
- [x] Central de ativacao separa configuracao real do tour de apresentacao e deriva progresso da prontidao do tenant.
- [x] Tour de apresentacao nao navega ao clicar em `Proximo`; a troca de pagina ocorre apenas quando o cliente escolhe `Abrir`.
- [ ] Repetir o tour completo em desktop e celular autenticados, confirmando os passos sem piscar, reiniciar ou travar.
- [ ] Para WhatsApp comercial, priorizar Embedded Signup oficial; cadastro manual e contingencia.
- [ ] Testar envio e recebimento de texto, imagem, PDF, video e audio em desktop e mobile.
- [ ] Monitorar Evolution, fila outbound, disco e renovacao TLS de `evolution.altumia.com.br`.
- [ ] Exigir assinatura nativa ou segredo dedicado em todo webhook de ecommerce.

## SEO: pauta inicial orientada a negocio

Antes de produzir em volume, validar no Search Console e com clientes reais. Pauta inicial sugerida:

1. Como organizar atendimento comercial no WhatsApp sem perder oportunidades.
2. CRM com WhatsApp: fluxo pratico para pequenas equipes comerciais.
3. Como usar IA no atendimento sem perder o controle humano.
4. Follow-up comercial: cadencia, exemplos e indicadores.
5. Funil de vendas para negocios que vendem pelo WhatsApp.
6. Automacao de atendimento: o que automatizar e quando chamar uma pessoa.

Cada artigo deve responder uma intencao concreta, demonstrar experiencia da Altum, incluir exemplos proprios e levar a uma pagina comercial coerente.

## Comandos de verificacao

```bash
npm run check:saas-readiness
npm run typecheck
npm run lint
npm run test:smoke
npm run build
POST_DEPLOY_BASE_URL=https://seu-dominio.com npm run verify:postdeploy
```

O primeiro comando informa apenas se configuracoes existem; ele nunca imprime valores secretos. Execute os demais em CI e guarde o log como evidencia.

## Criterio final de liberacao

Liberar clientes pagantes somente quando todos os P0 estiverem concluidos e documentados: autenticacao real testada, regras publicadas e testadas, checkout Asaas validado ponta a ponta, politicas comerciais aprovadas, WAF ativo, restauracao comprovada, alertas funcionando e pelo menos um canal de atendimento homologado.

Enquanto qualquer P0 permanecer aberto, o estado correto e **homologacao**, nao producao comercial.
