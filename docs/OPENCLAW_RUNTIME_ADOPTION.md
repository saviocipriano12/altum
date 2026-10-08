# OpenClaw como runtime interno da Altum

## Origem fixada

- Repositório: `openclaw/openclaw`
- Commit: `f45e4dac14547bdc78d90c95384ca65c2de3ef4e`
- Licença: MIT — manter o aviso de copyright/licença em toda cópia ou porção substancial distribuída.
- Cópia local auditável: `.altum-agent-sources/openclaw__openclaw` (ignoradas pelo Git do app).

Para atualizar a cópia para o commit registrado:

```powershell
node scripts/sync-agent-sources.mjs openclaw/openclaw
```

## Forma de adoção

O OpenClaw é o runtime privado de execução: gateway, sessões, agentes, skills, plugins, ferramentas, browser, cron, webhooks e canais. A Altum não reutiliza a interface do OpenClaw e não mistura seu código no Next.js.

O fork recebe um bridge fino, mantido pela Altum, com o contrato `altum.openclaw.mission.v1`. O caminho padrão é **pull privado**: o runtime consulta `GET /api/internal/agent-runtime/missions/next` com o segredo compartilhado, executa a missão e devolve eventos para `POST /api/internal/agent-runtime/events`. Assim a VPS não precisa expor o gateway na internet. Um `POST {ALTUM_OPENCLAW_RUNTIME_URL}/altum/v1/missions` continua existindo apenas como caminho opcional de menor latência numa rede privada.

## Bridge versionado

O source do bridge está em `resources/openclaw/altum-mission-bridge/`, fora do bundle Next.js. Após sincronizar o checkout fixado, instale-o no fork local com:

```powershell
node scripts/sync-agent-sources.mjs openclaw/openclaw
node scripts/install-altum-openclaw-bridge.mjs
```

O instalador confere o commit fixado antes de copiar a extensão. O arquivo `index.ts.template` vira `extensions/altum-mission-bridge/index.ts` somente dentro do runtime. O ambiente do container deve conter `ALTUM_OPENCLAW_SHARED_SECRET` (32+ caracteres) e o plugin deve ser habilitado na configuração do OpenClaw. A Altum usa a mesma chave apenas no servidor para assinar os dois lados do bridge.

O instalador também registra somente o importer do bridge no `pnpm-lock.yaml` do fork. Como a extensão depende apenas do SDK já presente no workspace, isso mantém o `pnpm install --frozen-lockfile` do Docker reproduzível sem atualizar dependências de terceiros da revisão auditada.

O bridge aceita somente missões assinadas, responde `202` antes do trabalho longo e envia eventos assinados de progresso, conclusão, falha ou cancelamento. A primeira versão proíbe ações externas no prompt do worker; publicação, pagamentos, mensagens, exclusões, alterações de produção e uso de identidade continuam passando por aprovação explícita da Altum.

## Subida local privada

O runtime não usa uma imagem móvel nem expõe o Control UI do OpenClaw. Para preparar o ambiente local, execute:

```powershell
node scripts/prepare-openclaw-runtime.mjs
```

O comando cria somente dois itens ignorados pelo Git: `.altum-openclaw/openclaw.json` e `.env.openclaw-runtime`. Preencha nesse último o segredo compartilhado, o token do gateway e `ALTUM_PUBLIC_URL`. O runtime não recebe chaves de OpenAI, Groq, NVIDIA, Alibaba ou outros providers: ele chama o gateway OpenAI-compatible interno da Altum, que escolhe uma conexão cifrada no cofre da plataforma.

```powershell
docker compose -f docker-compose.openclaw-runtime.yml up -d --build
```

O gateway de modelos fica em `POST /api/internal/agent-runtime/model/v1/chat/completions`. Ele aceita apenas o bearer privado do runtime e encaminha, nesta ordem, para FreeLLMAPI e conexões OpenAI-compatible habilitadas no cofre (Alibaba/Qwen, NVIDIA, Groq, Cerebras, Mistral, OpenRouter e Hugging Face). O runtime deve apontar `ALTUM_OPENCLAW_MODEL_BASE_URL` para `<ALTUM_PUBLIC_URL>/api/internal/agent-runtime/model/v1`; quando `ALTUM_OPENCLAW_MODEL_API_KEY` estiver vazio, o renderizador reutiliza o segredo compartilhado sem duplicar credenciais de providers na VPS.

Para uma ativação real em produção são necessárias as duas direções abaixo:

1. A Altum publicada recebe `ALTUM_OPENCLAW_SHARED_SECRET` como secret de servidor e é redeployada.
2. A VPS recebe `ALTUM_PUBLIC_URL` e usa somente saída HTTPS para buscar a fila privada da Altum. A porta 18789 nunca é exposta diretamente. Um proxy de entrada para `/altum/v1/missions` é opcional, não necessário.

Sem essas duas condições, uma missão deve permanecer em `not_configured`; saúde do container sozinha não prova execução.

## Regras de segurança

1. O runtime fica em rede privada; nenhum dashboard OpenClaw é exposto ao cliente final.
2. Dispatch e callback são assinados com HMAC SHA-256 sobre `timestamp.body`.
3. O callback recusa assinatura ausente/inválida e timestamps fora da janela de 10 minutos.
4. Eventos são idempotentes por hash de `missionId:eventId`.
5. A Altum valida tenant, persiste auditoria e continua sendo a fonte de verdade para aprovação, segredos, CRM, memória de negócio e biblioteca.
6. `externalActionsRequireApproval` é sempre verdadeiro no contrato; o runtime não pode publicar, comprar, enviar mensagem ou usar identidade privada por conta própria.

## Estados honestos

- `not_configured`: não há callback/segredo válidos; a missão fica registrada, sem alegar execução.
- `queued`: a missão foi persistida e aguarda a coleta pelo runtime privado.
- `claimed` / `dispatched`: o runtime começou a receber a missão; não significa conclusão.
- eventos de execução: `mission.progress`, `mission.await_approval`, `mission.completed`, `mission.failed`, `mission.cancelled`.

## Próximo passo de infraestrutura

Criar o fork privado a partir do commit fixado, adicionar o bridge `/altum/v1/missions` dentro do runtime e configurar `ALTUM_OPENCLAW_RUNTIME_URL`, `ALTUM_OPENCLAW_SHARED_SECRET` e `ALTUM_PUBLIC_URL` no ambiente privado. Isso é uma etapa de infraestrutura; não deve ser confundida com uma integração já ativa até que o health check e uma missão real sejam validados.
