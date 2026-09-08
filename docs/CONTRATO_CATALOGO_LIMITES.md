# Contrato entre catálogo e limites

O catálogo executável da Altum fica em `lib/platform-plans.ts`. A mensalidade, a versão do catálogo, os módulos, as capacidades comerciais e os limites técnicos devem ser lidos dessa fonte.

## Capacidades com bloqueio técnico

Os limites abaixo são derivados automaticamente de `allowances` por `platformLimitsFromAllowances` e cobertos por teste de contrato:

- usuários
- canais de WhatsApp
- contatos
- mensagens mensais
- execuções de IA
- execuções de automação
- armazenamento

## Capacidades ainda condicionadas

As capacidades abaixo continuam no modelo comercial, mas não possuem bloqueio técnico completo em todos os fluxos:

- contas do Instagram
- quantidade de pipelines
- automações ativas
- integrações de ecommerce

Até a implementação dos respectivos medidores e bloqueios, páginas públicas não devem prometer quantidades numéricas para essas capacidades. Adicionais também não entram automaticamente no checkout: dependem de confirmação e aceite comercial.

## Regra de mudança

Qualquer alteração de preço, limite ou benefício exige:

1. nova versão em `PLATFORM_CATALOG_VERSION`;
2. atualização do teste `tests/platform-plan-contract.test.mts` quando o contrato mudar;
3. verificação do checkout, upgrade, webhook e direitos do tenant;
4. revisão do texto público para impedir promessa sem entrega técnica.
