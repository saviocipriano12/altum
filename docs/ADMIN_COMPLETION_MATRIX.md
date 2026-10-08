# Matriz de conclusão — Altum Admin

> Regra: uma tela, API, card ou collection não conta como funcionalidade pronta.
> Uma capacidade só muda para **pronta** quando o pedido entra por uma jornada
> real, executa contra uma integração real ou executor local validado, persiste
> resultado, mostra progresso/erro, permite retomar e possui teste de contrato.

## Ordem obrigatória

1. **Fechar backend e contratos.** Reutilizar primeiro uma implementação
   comprovada do repositório/SDK de referência, com licença e versão fixadas.
2. **Executar um fluxo real e registrar evidência.** Sem simulação travestida
   de entrega e sem declarar uma capacidade pronta sem provider disponível.
3. **Cobrir falha, retry, fallback e autorização.** Fallback não pode ampliar
   custo, dados enviados ou autonomia sem política explícita.
4. **Só então polir a interface.** O Comando é a entrada principal; detalhes
   técnicos ficam em configurações avançadas.

## Estado de partida auditado

| Domínio existente | Ponto de entrada atual | Situação honesta | Fechamento obrigatório |
| --- | --- | --- | --- |
| Comando | `/admin/comando` | Interface e persistência de conversa existem; orquestração ainda é parcial. | Entender pedido, criar plano, selecionar capacidades, executar/acompanhar trabalho, registrar decisões e devolver resultado no mesmo chat. |
| Conversas e memória | `/admin/comando`, `/admin/chat` | Histórico, ideias e contexto existem em partes distintas. | Uma fonte de verdade para conversa, anexos, memória, resultados e retomada; busca e escopo por empresa. |
| Missões e aprovações | `/admin/missoes`, `/admin/aprovacoes` | Entidades e telas existem; alguns caminhos ainda dependem de ação manual/tela separada. | Estado durável, dependências, progresso, retry, decisão no chat e trilha de auditoria. |
| Conexões e roteamento | `/admin/conexoes` | Credenciais cifradas, health checks para adapters suportados e fallback de mídia com cooldown existem; cobertura de adapters ainda não é uniforme. | Registro de capacidade verificável para cada provider, quota/custo, roteamento multi-provider por modalidade, tentativas e fallback homologado. |
| Texto, análise e pesquisa | Comando + gateway OpenClaw | Gateway real de texto foi validado; pesquisa e documentos ainda não são um fluxo unificado. | FreeLLMAPI/rotas compatíveis e ferramentas de pesquisa/documento com fontes, falha clara e memória de resultados. |
| Imagem, vídeo e áudio | `/admin/criativos`, `/admin/midia`, Comando | Jobs/adaptadores iniciais existem; não há cobertura uniforme de todos os executores. | Pipeline por modalidade, worker, polling, persistência privada, QA, versões, fallback e entrega no chat. |
| Avatar e identidade | `/admin/avatares` | Perfil, referências e âncora inicial existem; clone/voz/lip-sync não estão certificados. | Consentimento, referências privadas, provedor validado, continuidade visual, teste real e revogação. |
| Biblioteca de resultados | `/admin/resultados` | Ativos iniciais persistidos. | Busca, versões, tags, origem, direitos, download, reutilização em campanha e vínculo com execução. |
| Criativos, campanhas e produtos | `/admin/criativos`, `/admin/campanhas`, `/admin/estrategias` | Planejamento e telas existem; cadeia inteira não está fechada. | Estratégia → briefing → ativos → landing/copy → aprovação → publicação supervisionada → métricas e aprendizado. |
| Skills, ferramentas e MCP | `/admin/ferramentas`, `/admin/mcp` | Catálogo/MCP inicial existem. | Manifesto, permissões, instalação/remoção, tool policy, execução por missão, evidências e rollback. |
| Runtime de agentes | OpenClaw privado + Comando | Gateway privado e bridge por polling autenticado estão saudáveis; ainda falta uma homologação de missão completa criada na Altum e devolvida ao Comando. | Dispatch assinado, eventos idempotentes, tool allowlist, sessões, cancelamento, retomada e evidência no Comando. |
| Operação legada | empresas, clientes, pipeline, prospecção, projetos, financeiro, equipe e campanhas | Rotas e dados existem, com maturidade desigual. | Preservar rotas, integrar dados ao Comando e melhorar uma jornada completa por vez sem regressão. |

## Critério de “pronto” por executor

Todo provider/executor conectado deve ter, no mínimo:

- capacidade declarada e comprovada, não apenas um item de catálogo;
- configuração cifrada e escopo de empresa/plataforma;
- probe de saúde sem consumo e diagnóstico humano;
- adaptador de requisição e de resultado específico para seu contrato;
- normalização de job `queued → running → submitted → completed/failed`;
- timeout, retry/cooldown e fallback compatível;
- persistência privada de artefatos temporários;
- telemetria de custo, latência, provider/modelo interno e motivo de rota;
- teste do contrato e uma execução real de homologação antes de aparecer como disponível.

## Referências que devem ser adotadas antes de adaptar

| Capacidade | Base funcional | Uso na Altum |
| --- | --- | --- |
| Roteamento de texto, imagem e áudio | `xxy2026/freellmapi` | Sidecar privado e seus contratos de fallback/cooldown/health; Altum cuida de tenant, política e biblioteca. |
| Runtime, skills e sessões | `openclaw/openclaw` | Fork privado e bridge assinada; não recriar runtime de agentes. |
| Pipeline de vídeo | OpenMontage (referência licenciada), LTX Desktop e Remotion | Reproduzir contratos permitidos de storyboard, cenas, render, QA e composição; manter executores isolados. |
| Imagem local | ComfyUI por API/bridge | Workflows aprovados, nunca nós/JSON expostos na interface comum. |
| Browser supervisionado | browser-use | Worker isolado com domínio, evidência e stop-points. |
| Documentos | AnyDoc | Ingestão privada com origem/página e permissões. |

## Regra de produto

Não abrir novos menus, dashboards ou “studios” enquanto um domínio desta
matriz estiver somente parcial. O trabalho segue por fluxos verticais: backend
real → integração real → testes → Comando → interface auxiliar enxuta.
