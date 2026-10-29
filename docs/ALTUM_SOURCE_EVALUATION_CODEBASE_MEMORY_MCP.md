# Ficha de avaliação — Codebase Memory MCP

**Capability ID:** `codebase-intelligence-mcp`  
**Status:** `candidate` — não instalado, não integrado  
**Data da revisão:** 12 de outubro de 2026  
**Owner proposto:** Engenharia de Plataforma Altum

## Fonte auditada

- Repositório: `DeusData/codebase-memory-mcp`
- Commit registrado: `4d9592b5fbceb80d3f7fc9c43020e50b77ad806a`
- Verificação remota: o `HEAD` de `main` resolve para esse commit.
- Licença declarada: MIT.
- Forma indicada pelo upstream: executável nativo local, MCP por stdio e banco SQLite local.

## Valor para a Altum

O projeto é candidato a dar aos agentes técnicos uma visão estrutural de código: índice local, grafo de chamadas, análise de impacto e consultas por MCP. Ele não pertence à experiência do cliente e não deve receber dados de tenants de marketing; seu escopo é exclusivamente o workspace de engenharia autorizado.

## Riscos encontrados

O instalador oficial detecta e altera configurações de diversos agentes de código e inicia um daemon compartilhado por conta de usuário. O próprio upstream também pode manter watcher e interface local. Isso é incompatível com uma instalação automática no host da Altum e com o isolamento esperado entre execuções.

O repositório é grande e a tentativa de clone completo nesta máquina foi interrompida antes do checkout. A origem e o commit foram confirmados com `git ls-remote`; a documentação oficial foi lida diretamente no commit fixado. Isso prova a proveniência, mas **não** substitui execução isolada do binário nem reprodução de seus testes oficiais.

## Decisão de adoção

Não incorporar código nem executar o instalador em máquinas de desenvolvimento ou no app Next.js.

O único caminho elegível é um worker separado, descartável e sem credenciais de cliente, com:

- binário e checksum da release verificados;
- `CBM_ALLOWED_ROOT` fixado ao checkout de engenharia autorizado;
- `CBM_CACHE_DIR` exclusivo por worker/projeto;
- auto-index, watcher e UI desligados por padrão;
- stdio MCP encapsulado por adapter Altum read-only;
- limite de CPU, memória, arquivos, duração e tamanho de índice;
- nenhuma alteração de config de Codex, IDEs ou agentes do host;
- evidência de indexação e consultas associada ao run técnico, nunca ao tenant.

## Gate de validação

1. Baixar em sandbox o artefato Windows amd64 indicado pelo upstream e verificar hash/assinatura publicados.
2. Rodar apenas o modo CLI/MCP com cache e raiz temporários, sem `install`.
3. Indexar um fixture público pequeno e executar `index_status`, busca estrutural e análise de impacto.
4. Confirmar que não houve escrita fora da raiz, cache e logs temporários permitidos.
5. Executar o mesmo fluxo contra um clone descartável da Altum, sem segredos, e medir custo/tempo.
6. Só então criar o adapter interno e uma avaliação de qualidade para agentes técnicos.

## Rollback

Desligar o worker e descartar seu volume. Como não haverá instalação no host nem escrita em coleções Altum pelo upstream, o rollback não exige alteração no produto.
