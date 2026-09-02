# SEO, Google Search Console e conteudo da ALTUM

## Configuracao de producao

1. Definir `NEXT_PUBLIC_SITE_URL=https://altum.ag`.
2. Criar uma propriedade de dominio `altum.ag` no Google Search Console e validar o DNS.
3. Como verificacao adicional por HTML, copiar o token para `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
4. Enviar `https://altum.ag/sitemap.xml` no relatorio de Sitemaps.
5. Inspecionar home, `/plataforma`, `/precos` e os principais artigos depois do deploy.
6. Definir `NEXT_PUBLIC_SITE_UPDATED_AT` apenas quando houver mudanca relevante no conteudo institucional.

O sitemap ajuda na descoberta, mas nao garante indexacao ou posicionamento. As areas autenticadas recebem `noindex` e nao entram no sitemap.

## Estrategia editorial

Priorizar clusters que respondam a uma intencao real e levem naturalmente ao produto:

- `CRM para WhatsApp`: comparativos, implantacao, organizacao de contatos e historico.
- `IA para vendas`: qualificacao, resumo, proxima acao, limites e supervisao humana.
- `Operacao comercial`: funil, agenda, follow-up, SLA e distribuicao de leads.
- `Automacao de atendimento`: quando automatizar, quando escalar e como medir resultado.
- `Segmentos`: clinicas, servicos B2B, ecommerce e equipes comerciais enxutas.

Cada artigo deve ter autor/revisor identificado, data real de atualizacao, exemplos originais, links para o cluster e uma chamada coerente para diagnostico, teste ou demonstracao. Evitar artigos em massa com variacoes superficiais de cidade ou palavra-chave.

## Proximos artigos prioritarios

1. `CRM para WhatsApp: como organizar atendimento, clientes e vendas em 2026`
2. `Como usar IA no atendimento comercial sem perder controle e contexto`
3. `Planilha ou CRM: quando sua operacao comercial precisa migrar`
4. `SLA de atendimento no WhatsApp: metricas e rotina para equipes pequenas`
5. `Distribuicao de leads: modelos, regras e erros que reduzem conversao`
6. `Como medir ROI de automacao comercial com IA`

## Medicao

- Search Console: impressoes, cliques, CTR, posicao e cobertura por cluster.
- Analytics: cadastro iniciado, cadastro concluido, trial ativado e checkout iniciado.
- Negocio: ativacao durante o trial, conversao trial-pago, churn e receita por pagina de entrada.
