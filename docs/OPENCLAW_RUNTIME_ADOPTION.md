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

## Implantação privada na VPS

### Validação local em 13/10/2026

Docker Desktop voltou a responder nesta máquina: cliente e daemon Linux
28.5.1, com execução confirmada de `hello-world`. O usuário autorizou retomar
o piloto local. A construção `altum-openclaw:local` usa o Dockerfile upstream
no commit fixado e inclui `altum-mission-bridge`. A construção e a execução
integrada ainda não foram concluídas; a resposta do Docker não valida o runtime.

`node scripts/prepare-openclaw-smoke.mjs` prepara somente o teste de
inicialização em `.altum-openclaw/smoke/`, ignorado pelo Git. Ele preserva
segredos existentes, não imprime credenciais e não configura URL da aplicação
nem modelo, portanto não busca missões da fila de produção.

O primeiro piloto usa `tools.deny: ["*"]`: no upstream, `allow: []` sozinho
não bloqueia as ferramentas. A camada `runtime-patch` compila o bridge em
um estágio descartável com esbuild 0.28.2, versão do checkout auditado, e
copia somente o JavaScript resultante para a imagem final. Isso evita depender
de ferramentas de desenvolvimento removidas pelo Dockerfile upstream.

Depois que as imagens `altum-openclaw:local` e `altum-openclaw:runtime`
forem construídas, `node scripts/verify-openclaw-smoke.mjs` inicia o teste
isolado e aguarda o healthcheck. O script preserva containers existentes e
não publica portas; a saúde do gateway não comprova execução de missão.

Construção inicial a partir do checkout auditado e teste local:

```powershell
node scripts/install-altum-openclaw-bridge.mjs
docker build --build-arg OPENCLAW_EXTENSIONS=altum-mission-bridge --build-arg GIT_COMMIT=f45e4dac14547bdc78d90c95384ca65c2de3ef4e -t altum-openclaw:local .altum-agent-sources/openclaw__openclaw
docker build -f resources/openclaw/runtime-patch/Dockerfile -t altum-openclaw:runtime resources/openclaw
node scripts/prepare-openclaw-smoke.mjs
node scripts/verify-openclaw-smoke.mjs
```

A imagem-base deve terminar antes de construir a camada do bridge. Não execute
builds concorrentes sobre o mesmo runtime. O container `altum-openclaw-smoke`
permanece disponível para inspeção; pode ser parado com
`docker stop altum-openclaw-smoke`, preservando os arquivos do teste.

### Resultado da tentativa de construção local

A transferência do contexto upstream terminou (aproximadamente 605 MB),
assim como a instalação dos pacotes Linux. A instalação das dependências
JavaScript iniciou, mas o build terminou com `rpc error: Unavailable ... EOF`.
Não houve imagem final nem inicialização validada do OpenClaw.

O diagnóstico subsequente confirmou erro 500 na API do motor Docker e
`still waiting for linux/wsl init control API to respond` nos logs do backend.
Foram tentados reinício normal do Desktop, encerramento somente dos processos
do aplicativo Docker e reinicialização somente da distribuição `docker-desktop`
do WSL. A API continuou sem responder. Não foi executado reset de fábrica nem
exclusão de imagens, cache ou volumes. Retomar a construção somente depois de
`docker info` responder com uma versão de servidor; o cache existente pode ser
reutilizado.

Independente dessa falha de infraestrutura, a checagem completa de TypeScript
passou. O teste de comportamento do bridge confirmou pausa e cancelamento
durante uma execução ativa, sem iniciar outra missão e sem emitir falha
espúria do agente abortado. Isso não substitui o teste integrado no runtime real.

O runtime não usa uma imagem móvel nem expõe o Control UI do OpenClaw. A ativação deste executor será feita na VPS privada; Docker local não é pré-requisito nem gate da evolução do control plane.

Se for útil preparar a mesma configuração fora da VPS, o comando abaixo cria apenas os arquivos locais ignorados pelo Git:

```powershell
node scripts/prepare-openclaw-runtime.mjs
```

O comando cria somente dois itens ignorados pelo Git: `.altum-openclaw/openclaw.json` e `.env.openclaw-runtime`. Preencha nesse último o segredo compartilhado, o token do gateway e `ALTUM_PUBLIC_URL`. O runtime não recebe chaves de OpenAI, Groq, NVIDIA, Alibaba ou outros providers: ele chama o gateway OpenAI-compatible interno da Altum, que escolhe uma conexão cifrada no cofre da plataforma.

Na VPS, depois de configurar os segredos, a subida usa:

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

Enquanto uma execução está ativa, o bridge consulta a fila com
`controlOnly=1`. Esse caminho reserva somente `pause` ou `cancel`, sem iniciar
uma segunda tarefa de negócio. O índice de `agent_runtime_dispatches` para
`status` e `operation` está declarado em `firestore.indexes.json` e precisa
estar publicado antes do teste integrado. A confirmação de pausa encerra o
despacho de controle com `mission.completed`, preservando o estado pausado
da missão. Os cenários de pausa e cancelamento são exercitados sem rede real
em `tests/openclaw-bridge-control.test.mts`.

- `not_configured`: não há callback/segredo válidos; a missão fica registrada, sem alegar execução.
- `queued`: a missão foi persistida e aguarda a coleta pelo runtime privado.
- `claimed` / `dispatched`: o runtime começou a receber a missão; não significa conclusão.
- eventos de execução: `mission.progress`, `mission.await_approval`, `mission.completed`, `mission.failed`, `mission.cancelled`.

## Próximo passo de infraestrutura

### Última tentativa local: interrompida por capacidade do ambiente

Após recuperar o Docker Desktop, a segunda construção reutilizou camadas em
cache e avançou até `pnpm install --frozen-lockfile` (1.440 pacotes adicionados
de 1.468 resolvidos). Em seguida, a construção parou de emitir progresso e
`docker buildx history ls` também deixou de responder. A verificação do host
mostrou apenas **1.766.891.520 bytes livres no C:** (aproximadamente 1,65 GiB).
O log do backend registrou um sinal fatal 7 no processo Node da VM; isso não
determina, isoladamente, a causa da falha.

Os clientes de construção e diagnóstico foram interrompidos com Ctrl+C.
Não foi confirmado que o trabalho dentro da VM terminou. Não houve limpeza
de cache, imagens, volumes ou arquivos pessoais. Antes de tentar novamente,
é necessário liberar espaço ou mover o armazenamento do Docker com orientação
do usuário, confirmar que o daemon voltou a responder e inspecionar se há
construção remanescente. A imagem final e o teste de inicialização continuam
**não validados**.

Na revalidação de 16/10, o C: passou a ter 15.816.871.936 bytes livres
(aproximadamente 14,7 GiB). Portanto, a medição anterior de falta de espaço
não descreve mais o estado atual. O daemon, porém, permaneceu indisponível:
`docker version` retornou ausência do pipe `dockerDesktopLinuxEngine`.
Foi tentado `docker desktop start` e aberto o executável instalado do Desktop;
os processos do backend apareceram, sem disponibilizar o pipe nem atualizar
o log do backend durante a observação. A espera do CLI foi interrompida,
sem encerrar os processos do backend, resetar o Docker ou repetir o build.
O log histórico contém erros de leitura no dispositivo virtual e sinal fatal
7; isso não autoriza concluir corrupção do disco nem executar reparo destrutivo.
O próximo gate é recuperar e confirmar o daemon, não repetir limpezas de espaço.

O teste isolado agora captura logs de ambas as saídas com redação dos segredos,
usa healthcheck de 10 segundos e exige resposta da rota do plugin Altum,
além da saúde do gateway. Esses preparativos não equivalem a um teste executado.

Criar o fork privado a partir do commit fixado, adicionar o bridge `/altum/v1/missions` dentro do runtime e configurar `ALTUM_OPENCLAW_RUNTIME_URL`, `ALTUM_OPENCLAW_SHARED_SECRET` e `ALTUM_PUBLIC_URL` no ambiente privado. Isso é uma etapa de infraestrutura; não deve ser confundida com uma integração já ativa até que o health check e uma missão real sejam validados.

## Aceite do primeiro piloto na VPS

Execute esta sequência somente na VPS privada, depois de configurar os segredos
em ambos os lados. O piloto inicial não pode publicar, enviar mensagens, gastar,
alterar dados de cliente ou chamar uma integração externa.

1. Sincronize `openclaw/openclaw` no commit fixado e rode o instalador do bridge.
2. Suba o compose privado com o volume persistente de estado do OpenClaw.
3. Confirme nos logs que o serviço `altum-mission-poll` iniciou; a porta 18789
   deve continuar inacessível pela internet pública.
4. Na Altum, crie uma missão `custom` de texto para o tenant interno
   `ALTUM_AGENCY`, com orçamento zero e uma única saída esperada: um resumo de
   pesquisa fictícia, sem qualquer ferramenta externa.
5. Confirme a sequência no Histórico da missão: `mission.created`, despacho
   `queued`, execução `claimed`, `mission.progress`, evidência/resultado e
   encerramento canônico. O callback deve conter o mesmo `tenantId`, `missionId`
   e `dispatchId` da fila.
6. Pare o container durante uma segunda missão de texto, espere a lease expirar
   e confirme que ela fica em `needs_reconciliation`; não aceite repetição
   automática de uma execução ambígua.
7. Registre a evidência do piloto e só então habilite uma segunda capacidade.
   Publicação, mídia paga, mensagens, pagamentos e exclusões continuam fora do
   piloto até haver aprovação e avaliações específicas.

### Reversão

Para interromper o piloto, pause a missão no Admin e pare o compose da VPS. Não
apague o volume de estado nem os recibos do bridge: eles são necessários para
reconciliação. Remover o segredo do runtime ou deixar o endpoint sem runtime
ativo faz novas missões permanecerem honestamente em `not_configured` ou
`queued`; não deve existir fallback que execute localmente.
