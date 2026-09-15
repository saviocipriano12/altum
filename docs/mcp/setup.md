# Altum MCP setup

Atualizado em 2026-09-15.

Este MCP e o command center da Altum para uso local e remoto. O catalogo atual expoe 35 ferramentas para leitura operacional, inteligencia de crescimento e rascunhos supervisionados. Mudancas reais so podem ocorrer depois de previa, aprovacao humana, validacao no provedor e auditoria.

No portal do cliente, a entrada fica em `Configuracoes > MCP`. A tela mostra o status do ambiente, os comandos de conexao local, a configuracao para Claude Desktop, a URL remota para ChatGPT web e a politica desejada do tenant para evoluir de leitura para acoes supervisionadas.

## Ferramentas atuais

- Operacao: empresas, contexto, leads, oportunidades paradas, conversas, resumo diario, integracoes e auditoria.
- Growth Intelligence: briefing, tracking, Revenue Graph, jornada por origem, segmentos e fadiga de criativos.
- Google Ads: relatorio operacional e rascunhos para campanha, grupo, anuncio responsivo, palavra negativa, pausa de palavra-chave e estrategia de lance.
- Meta Ads: relatorio operacional e rascunhos para campanha, conjunto, status de conjunto, criativo e anuncio.
- Altum: rascunho de comportamento da IA, segmento comercial e campanha WhatsApp pausada.

Todos os retornos de leitura declaram cobertura quando usam amostra. Conteudo de conversas e documentos e tratado como dado nao confiavel. Rascunhos ficam em `mcp_action_drafts` e exigem aprovacao; campanhas e anuncios novos nascem pausados.

## Variaveis

```bash
ALTUM_MCP_ENABLED=true
MCP_CONTEXT_SECRET=use-um-segredo-hmac-com-pelo-menos-32-caracteres
MCP_READ_GRANTS=[{"userId":"firebase_uid","tenantId":"tenant_id","scopes":["context:read","crm:read","inbox:read","reports:read","integrations:read","events:read","ai:draft"],"expiresAt":"2026-12-31T23:59:59.000Z"}]
ALTUM_PUBLIC_URL=https://app.seudominio.com
ALTUM_MCP_BASE_URL=http://localhost:3000
ALTUM_MCP_TOKEN_FILE=C:\caminho\privado\firebase-id-token.txt
```

`MCP_CONTEXT_SECRET` deve ser exclusivo do MCP. Nao reutilize segredo de Firebase, Meta, Google, Asaas, Stripe ou criptografia geral.

`MCP_READ_GRANTS` e a allowlist explicita do bridge local para Codex e Claude Desktop. O MCP remoto usa OAuth e grava seu grant por conexao no Firestore. Em ambos os modos, o usuario precisa estar ativo, ter membership no tenant, capacidades dos modulos e respeitar as regras comerciais de atribuicao.

`ALTUM_MCP_TOKEN_FILE` deve apontar para um arquivo local fora do repositorio. Nao cole ID token, refresh token, service account ou chaves no chat.

`ALTUM_PUBLIC_URL` e usado pelos metadados OAuth e pela tela `Configuracoes > MCP`. Em producao, deve ser o dominio publico HTTPS da Altum.

## Rodando local

Suba a Altum:

```bash
npm run dev
```

Em outro terminal, rode o servidor MCP:

```bash
npm run mcp:start
```

Demo completamente isolado, sem Firebase nem dados reais:

```bash
npm run mcp:demo
```

A evidencia do demo fica em `.qa-artifacts/mcp/demo.json`.

## Registro no Codex local

Para demonstrar sem dados reais:

```bash
cd <CAMINHO_DO_PROJETO_ALTUM> && npm run mcp:demo
```

Para uso real local, mantenha a Altum rodando, configure as variaveis e registre sem `--demo`:

```bash
codex mcp add altum_local --env ALTUM_MCP_BASE_URL=https://altumia.com.br --env ALTUM_MCP_TOKEN_FILE=<CAMINHO_DO_FIREBASE_ID_TOKEN> -- node --import tsx <CAMINHO_DO_PROJETO_ALTUM>/scripts/mcp/server.ts
```

## Uso remoto: ChatGPT web e outros clientes MCP

Publique a Altum em HTTPS, configure `ALTUM_PUBLIC_URL` e habilite o MCP do tenant em `Configuracoes > MCP`.

Endpoint principal:

```text
https://app.seudominio.com/api/mcp/remote
```

Descoberta OAuth:

```text
https://app.seudominio.com/.well-known/oauth-authorization-server
https://app.seudominio.com/.well-known/oauth-protected-resource
```

Fluxo esperado:

1. O cliente MCP remoto abre `/api/mcp/oauth/authorize`.
2. A Altum redireciona para `/cliente/mcp/autorizar`.
3. O usuario entra na Altum, confirma o tenant e autoriza.
4. A Altum retorna um authorization code com PKCE.
5. O cliente troca o code em `/api/mcp/oauth/token` e passa a chamar `/api/mcp/remote` com `Authorization: Bearer`.

O token remoto e opaco, salvo por hash no Firestore e limitado ao usuario, tenant e escopos autorizados.

## Governanca e rascunhos

`Configuracoes > MCP` mostra conexoes remotas autorizadas e permite revogar tokens ativos. A mesma tela lista rascunhos MCP criados pela IA para aprovacao ou recusa.

O primeiro rascunho suportado e `draft_ai_behavior_update`, usado para preparar ajustes de comportamento da IA. O fluxo de aplicacao e:

1. MCP cria o rascunho como `pending_review`.
2. Um usuario com permissao revisa e aprova, mudando para `approved_pending_apply`.
3. O usuario aplica o rascunho pela tela MCP.
4. A Altum atualiza `tenant_settings.ai.objective`, `tenant_settings.ai.toneOfVoice`, `tenant_settings.ai.guardrails` e registra as instrucoes longas em `tenant_settings.ai.mcpAppliedInstructions`.
5. O draft vira `applied` e a auditoria `mcp_action_draft_applied` guarda antes/depois.

## Validacao

```bash
npm run test:mcp
npm run lint
npm run typecheck
npm run build
```

Antes de usar em cliente real, valide com um tenant controlado. O demo ficticio prova protocolo, contratos e bloqueios; ele nao prova credenciais Firebase, regras do ambiente implantado nem indices publicados.

## Firestore

O MVP adiciona consultas ordenadas para mensagens e audit logs. Os indices ficam versionados em `firestore.indexes.json`. Publique no ambiente alvo antes de validar dados reais:

```bash
npm run firestore:indexes:deploy
```
