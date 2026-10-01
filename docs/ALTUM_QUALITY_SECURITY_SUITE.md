# Altum Quality & Security Suite

Este documento transforma a ideia de "pedir para o Codex limpar e auditar a Altum" em um fluxo repetivel. O objetivo nao e sair alterando telas de uma vez, e sim criar evidencias antes de corrigir: seguranca, arquitetura, codigo morto, padrao visual e regressao da area do cliente.

## Comandos

```bash
npm run altum:audit
```

Roda o pacote local padrao: mapa `app/cliente` -> `app/api`, smoke tests, typecheck, lint e `npm audit`.

```bash
npm run altum:audit:security
```

Roda checks de seguranca: regras Firebase em emuladores, `semgrep` se estiver instalado e `trivy` se estiver instalado.

Para validar regras Firebase localmente, Java precisa estar instalado e disponivel no `PATH`. A CI documentada em `docs/CI_QUALIDADE.md` usa Java 21.

```bash
npm run altum:audit:full
```

Roda o modo completo: checks padrao, React Doctor, Knip, Dependency Cruiser e build Next com configuracao demo isolada.

```bash
npm run altum:audit:client-map
```

Atualiza apenas o inventario de conexoes entre telas do cliente e APIs.

## Como pedir ao Codex

Use este prompt quando quiser uma varredura ampla:

> Rode a Altum Quality & Security Suite no repositorio. Nao altere `app/admin`. Priorize `app/cliente/painel`. Primeiro gere evidencias com `npm run altum:audit` e, se fizer sentido, `npm run altum:audit:full`. Depois leia `AGENTS.md`, `docs/DESIGN_SYSTEM_ALTUM.md`, `docs/cliente-redesign/05-checklist-qa.md` e os artefatos gerados. Entregue um relatorio com falhas de seguranca, inconsistencias visuais, componentes duplicados, codigo morto, riscos de multi-tenant e proximas correcoes em ordem de risco. Nao refatore nem padronize telas antes de mostrar o plano de mudancas.

Para uma passada so de seguranca:

> Rode `npm run altum:audit:security` e revise manualmente rotas de API sensiveis da area do cliente: autenticacao, autorizacao, isolamento por tenant, logs com dados sensiveis, webhooks, OAuth, credenciais de WhatsApp, Meta, Google, Shopify, Asaas e MCP. Nao aplicar mudancas em producao nem tocar em backend sem apontar arquivos e riscos.

Para uma passada visual:

> Audite a consistencia visual da area do cliente usando `AGENTS.md`, `docs/DESIGN_SYSTEM_ALTUM.md` e `docs/cliente-redesign/05-checklist-qa.md`. Liste divergencias entre `app/cliente/painel` e o padrao Altum: botoes, cards, badges, tabelas, PageHeader, spacing, cores, estados vazios, erros, loading e responsividade. Proponha uma migracao incremental sem remover rotas antigas e sem alterar `app/admin`.

## Ferramentas externas

- React Doctor roda via `npx --yes react-doctor@latest` no modo completo.
- Knip roda via `npx --yes knip@latest --production`.
- Dependency Cruiser gera `.qa-artifacts/dependency-cruiser-client.json`.
- Semgrep e Trivy ficam opcionais por binario instalado, porque nao sao dependencias Node confiaveis do projeto.

## Criterio de decisao

Toda correcao proposta deve responder pelo menos uma destas perguntas:

- Qual falha de seguranca ou privacidade reduz?
- Qual risco de multi-tenant reduz?
- Qual inconsistencia visual remove?
- Qual duplicacao de componente elimina?
- Qual regressao de rota, permissao ou fluxo evita?

Se a resposta for apenas "fica mais bonito" ou "limpa um pouco", a mudanca deve esperar uma auditoria mais especifica.
