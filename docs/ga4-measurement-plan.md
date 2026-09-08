# ALTUM — Plano de mensuração GA4

## Conversão principal implementada
### `generate_lead`
Dispara somente quando `/api/public/contact/submit` confirma que o lead foi criado.

Parâmetros:
- `lead_source`
- `interest`
- `source_page`
- `utm_source` quando disponível
- `utm_medium` quando disponível
- `utm_campaign` quando disponível

Objetivo: medir quais páginas, campanhas e intenções realmente geram contatos comerciais válidos.

## Eventos a adicionar somente quando o fluxo correspondente estiver validado
- `sign_up`: cadastro real concluído
- `start_trial`: teste da plataforma realmente ativado
- `begin_checkout`: início real de checkout/assinatura
- `purchase`: pagamento/assinatura confirmada
- `schedule_demo`: se existir confirmação distinta do formulário genérico

## Regra
Não medir clique em CTA como conversão final. Cliques podem ser eventos de interação, mas conversões devem representar estados confirmados pelo sistema.

## Dimensões de análise prioritárias
1. landing page
2. source / medium
3. campaign
4. interesse comercial
5. dispositivo
6. conversão por página comercial
7. conversão orgânica vs paga

## Cruzamento com Search Console
Usar GSC para entender descoberta e ranking; usar GA4 para entender comportamento e conversão. Uma página pode ter boa posição e pouca conversão, ou pouca impressão e excelente conversão. Prioridades devem considerar os dois lados.
