# Checklist antes de integrar recalibração SEO/GA4

- [x] Branch criada a partir da release consolidada atual
- [x] Redirecionamento www -> domínio canônico adicionado
- [x] Metadata fallback alinhado
- [x] Sitemap fallback alinhado
- [x] Robots host alinhado
- [x] Structured data fallback alinhado
- [x] E-mail público legado removido do SiteShell
- [x] `generate_lead` disparado apenas após lead salvo
- [x] Meta Pixel `Lead` no mesmo ponto de sucesso
- [x] Noindex de cidades e verticais genéricas preservado
- [x] Páginas comerciais P0 preservadas no sitemap
- [ ] Trocar Stripe por Nuvemshop na home
- [ ] Confirmar último preview Vercel READY após commit final
- [ ] Validar domínio/canonical após promoção
- [ ] Marcar `generate_lead` como evento principal no GA4, se a propriedade ainda não o fizer automaticamente
