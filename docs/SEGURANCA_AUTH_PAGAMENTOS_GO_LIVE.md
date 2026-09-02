# Seguranca, autenticacao e pagamentos: gate de producao

Este documento separa o que esta versionado no codigo do que depende de configuracao externa. Nenhum deploy deve ser considerado pronto para cobrar clientes sem concluir o gate manual.

## Controles implementados no codigo

- Cadastro self-service cria perfil, tenant, membership, entitlements e trial de sete dias no servidor.
- Senhas ficam exclusivamente no Firebase Authentication; nenhuma senha ou hash e salvo no Firestore.
- Login Google, verificacao de e-mail e recuperacao de senha.
- Tokens Firebase sao verificados no servidor e operacoes sensiveis exigem login recente.
- Regras do Firestore impedem o usuario de alterar o proprio papel, status, tenant ou cobranca.
- Trial vencido retorna `402` e direciona o responsavel para a assinatura.
- Checkout recorrente e hospedado pelo Asaas; dados de cartao nao passam pela ALTUM.
- Webhook Asaas usa token, comparacao resistente a timing e ledger idempotente.
- Planos e novos valores podem ser administrados em `/admin/saas`.
- Areas privadas e APIs recebem `noindex`; cabecalhos de seguranca globais permanecem ativos.

## Firebase Console antes do go-live

1. Ativar Email/Senha e Google em Authentication > Sign-in method.
2. Cadastrar apenas dominios reais em Authentication > Authorized domains; remover dominios antigos.
3. Exigir politica de senha: minimo 10 caracteres, maiuscula, minuscula, numero e simbolo.
4. Ativar protecao contra enumeracao de e-mail no Identity Platform.
5. Definir quota e alertas para picos de criacao de conta, login, reset e envio de verificacao.
6. Avaliar upgrade para Identity Platform e MFA, obrigatorio pelo menos para administradores ALTUM.
7. Publicar `firestore.rules` e testar no Emulator Suite com usuarios de empresas diferentes.
8. Ativar App Check para Firestore, Storage e Functions/servicos compativeis; iniciar em modo monitoramento e depois enforcement.
9. Configurar retencao, exportacao agendada do Firestore e teste documentado de restauracao.

O Firebase aplica throttling contra tentativas anormais. A interface tambem trata `auth/too-many-requests`, mas o controle efetivo deve permanecer no provedor de identidade, onde nao pode ser contornado pelo navegador.

## Asaas antes do go-live

1. Criar conta Sandbox e executar cadastro > trial > checkout > pagamento > webhook > liberacao.
2. Configurar webhook `https://altum.ag/api/webhooks/asaas` com token aleatorio de alta entropia.
3. Assinar eventos `CHECKOUT_CREATED`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `CHECKOUT_PAID` e os eventos de pagamento recebido, confirmado, vencido, restaurado, estornado, chargeback e cancelamento.
4. Confirmar que a fila de webhooks esta saudavel e que reenvios nao duplicam efeitos.
5. Migrar para a URL de producao e chave `$aact_prod_` somente depois do teste.
6. Guardar a chave no gerenciador de segredos do ambiente, nunca no frontend ou repositorio.
7. Testar rotacao de chave e token de webhook com procedimento de rollback.
8. Validar conciliacao diaria entre assinaturas, pagamentos, tenants ativos e receita.

## Protecao operacional

- Separar contas e projetos de desenvolvimento, homologacao e producao.
- Exigir MFA, menor privilegio e contas individuais no Firebase, Google Cloud, Vercel, Asaas e DNS.
- Habilitar protecao de branch, revisao obrigatoria e scanner de segredos/dependencias no CI.
- Alertar por taxa de erro, latencia, falha de webhook, aumento de 401/403/429, checkout sem confirmacao e job parado.
- Definir SLO inicial: 99,9% mensal para login e painel; RPO de 24h e RTO documentado e testado.
- Manter inventario de dados, base legal, operadores, prazos de retencao e fluxo LGPD de acesso/exclusao.
- Fazer teste de restauracao, resposta a incidente e revogacao de credenciais pelo menos trimestralmente.
- Executar pentest antes de contratos maiores e apos mudancas relevantes de auth, billing ou isolamento multi-tenant.

## Testes de abuso obrigatorios

- Usuario A nao le nem altera dados do tenant B, inclusive trocando `tenantId` em URL e body.
- Usuario comum nao consegue virar admin, owner, se desbloquear ou mudar plano via SDK do navegador.
- Token expirado, revogado ou de outro projeto e rejeitado.
- Cadastro repetido nao cria tenants ou contratos duplicados.
- Checkout com plano inativo ou valor adulterado e rejeitado; o servidor sempre resolve o valor oficial.
- Webhook sem token, com token incorreto, repetido ou fora de ordem nao libera acesso indevido.
- Trial expirado bloqueia operacao, mas permite login, verificacao de conta e pagamento.
- Reset de senha e erros de login nao revelam se um e-mail existe.

## Pendencias que exigem decisao juridica ou operacional

- Razao social, CNPJ e contato formal do controlador para os documentos legais.
- Politica de cancelamento, reembolso, inadimplencia, reajuste e prazo de guarda.
- Encarregado/canal LGPD e subprocessadores aprovados.
- SLO/SLA contratual e horario do suporte.
- Obrigatoriedade e metodo de MFA por perfil.
