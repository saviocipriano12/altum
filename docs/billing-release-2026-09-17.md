# Publicação de assinatura — 17/09/2026

Publicação autorizada pelo usuário: “pode avançar e publicar”.

- Base: `dd0cd20`, preservando o pacote da produção anterior.
- Branch GitHub: `release/billing-20260917`.
- Commits: `e29d93b` (renovação) e `da13ed4` (compatibilidade com portal legado).
- Deploy final: `dpl_HcejJ1fvApKfYLJNMecPBc9uNAYV`.
- URL: `https://altum-gsijm16ea-savio-ciprianos-projects.vercel.app`.
- `vercel promote` concluído; `vercel inspect https://www.altumia.com.br` confirmou esse deploy em produção, Ready.
- Versão intermediária sem domínio `dpl_BeDStotWsQTxR4vXDLWHhnKbAbLL` cancelada antes da publicação.

## Escopo

10 arquivos: login, guard, assinatura, autenticação do portal, resposta de contexto do `/api/client-portal/me`, política comum de bloqueio operacional e dois testes. Login autenticado encaminha vencimento financeiro para os planos e suporte, preservando a empresa solicitada. Contas legadas continuam compatíveis e não podem usar esse caminho para trocar de empresa. Assinatura ativa não fica bloqueada por trial antigo.

Mudanças locais de conversas, grupos, times, campanhas, MCP, admin e reuniões não foram incorporadas a este release.

## Validação

- 230 testes da base isolada com o pacote aprovado; executados novamente após o ajuste de compatibilidade.
- Lint aprovado; build/TypeScript remoto Next 16.3.4 aprovados, 314 páginas.
- Checks no deploy: login/assinatura/catálogo HTTP 200 (4 planos); portal/assinatura API/checkout anônimos HTTP 401; webhook sem token HTTP 401.
- `scripts/post-deploy-verify.mjs` aprovado no domínio público: disponibilidade, cabeçalhos de segurança, privacidade, webhooks e proteção de jobs/admin.
- GitHub confirmou `da13ed49add7f3a202f8b4de8e22d891af87649b` na branch de release.

Não foram criadas cobranças, assinaturas ou eventos financeiros de teste autenticados. Ainda é necessário validar com conta autorizada: trial vencido → planos → checkout → pagamento → webhook → liberação. O erro anterior do Asaas ao criar checkout permanece sem diagnóstico específico; este release não presume sua resolução.

## Referência para reversão

Produção anterior: `dpl_2EtMA6t7Kyk8d3Jdcri2Yhurkj8D`, URL `altum-4z0jbyqjj-savio-ciprianos-projects.vercel.app`. Uma reversão exige avaliar também os dados e variáveis vigentes; não foi executada.


## Hosted checkout correction

Commit: `ec30c77` on `release/billing-20260917`.

Production logs proved Asaas returned HTTP 400 for incomplete customerData (phoneNumber, address, addressNumber, postalCode, province). Removed partial customerData so the payer fills complete details on hosted checkout. Optional legacy CPF remains accepted but is not mandatory in Altum. Checkout URL now derives from provider ID and a recognized Asaas environment host.

Validation: 231 smoke tests passed; targeted ESLint passed. Build and domain promotion pending.

Sources: https://docs.asaas.com/docs/como-informar-os-dados-do-cliente and https://docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente

Final checkout fix commit: `5cfb614`. Local typecheck passed. Remote production build passed (314 pages). Seven deployment HTTP checks passed. Promoted deployment `dpl_AYHwsnSxQeDxVPixnc3M7TgU9ME9` / https://altum-qiv78tvfb-savio-ciprianos-projects.vercel.app to production domain. Real authenticated checkout/payment remains for user validation; no charge created by agent.
