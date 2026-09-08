# ALTUM — Auditoria SEO e Estrutura Digital

Data: 2026-09-08

## Objetivo
Transformar altumia.com.br em uma base digital forte para aquisição orgânica, entendimento por mecanismos de busca e IA, e conversão em uso da plataforma.

## Estado inicial observado
- Domínio canônico público desejado: https://www.altumia.com.br
- Redirecionamento do domínio sem www para www já ocorre no site ao vivo.
- Search Console ainda apresenta versões com e sem www em dados recentes, indicando resíduo de indexação e/ou sinais inconsistentes.
- `app/layout.tsx` ainda contém posicionamento antigo de "Engenharia de Vendas High-Ticket".
- Open Graph ainda referencia `https://altum.ag`.
- `metadataBase`, `robots.ts`, `sitemap.ts` e schemas dependem de `NEXT_PUBLIC_SITE_URL`.
- O projeto já possui blog, soluções, segmentos, páginas por cidade, RSS, sitemap, robots e dados estruturados básicos.

## Problemas prioritários
1. Consolidar todos os sinais de URL em https://www.altumia.com.br.
2. Remover referências antigas a altum.ag.
3. Atualizar title/description/OG/Twitter para o posicionamento real da plataforma.
4. Revisar sitemap para não tratar todas as páginas como atualizadas no momento de cada geração.
5. Revisar páginas programáticas por cidade para evitar conteúdo fraco ou pouco diferenciado.
6. Expandir schema de Organization para SoftwareApplication/WebSite quando aplicável.
7. Mapear funcionalidades reais do produto e transformá-las em arquitetura comercial + SEO.
8. Criar hierarquia clara entre plataforma Altum e serviços de implementação.

## Dados iniciais do Search Console
Período efetivo: 2026-08-09 a 2026-09-05.
- 1 clique
- 39 impressões
- CTR: 2,56%
- posição média: 14,05

Período anterior: 2026-07-12 a 2026-08-08.
- 1 clique
- 74 impressões
- CTR: 1,35%
- posição média: 19,82

Sinais temáticos já observados em consultas históricas:
- ia para qualificação de leads
- qualificação automática leads ia
- qualificação de leads com ia

## Direção de posicionamento a validar
ALTUM como plataforma / infraestrutura de vendas e relacionamento que centraliza captação, atendimento, CRM, IA, automações, pipeline, follow-up, campanhas, agenda e métricas.

## Sequência de execução
### Fase 1 — Fundação
- inventário funcional
- auditoria técnica
- canonical/domínio
- metadata
- schema
- sitemap/robots
- baseline Search Console

### Fase 2 — Conversão
- novo posicionamento
- nova home
- design system
- demonstrações reais de produto

### Fase 3 — Arquitetura orgânica
- páginas de funcionalidades
- soluções por problema
- segmentos
- integrações
- linking interno

### Fase 4 — Autoridade
- clusters de conteúdo
- cases
- comparativos
- documentação
- ferramentas gratuitas
- distribuição externa

### Fase 5 — Escala
- monitoramento GSC/GA4
- refresh de conteúdo
- backlinks
- presença em mecanismos de IA
- testes de conversão
