# Ficha de avaliação — OpenMontage

**Capability ID:** `agentic-video-production`  
**Status:** `candidate — legal gate`  
**Data da revisão:** 12 de outubro de 2026  
**Owner proposto:** Estúdio e Plataforma Altum

## Fonte auditada

- Repositório canônico: `calesthio/OpenMontage`
- Commit registrado: `9327439db69021ab4b0e2776729bf3b58fdb5a87`
- O README e LICENSE desse commit foram recuperados diretamente do GitHub.
- Licença declarada: **GNU AGPL-3.0**.
- O `main` atual já avançou para `e45f5b12bd46440b04f3675af9a77d0718e6a254`; a Altum não deve trocar o commit avaliado silenciosamente.

## Valor para a Altum

O upstream demonstra uma esteira completa de produção de vídeo por agentes: pesquisa, roteiro, planejamento de cenas, geração/curadoria de ativos, composição, renderização, custos e gates criativos. É uma referência forte para o Estúdio interno e para o modelo de evidências e aprovações que a Altum já está construindo.

## Decisão de licença

AGPL-3.0 é incompatível com copiar, adaptar ou embutir o código no núcleo proprietário sem uma decisão jurídica explícita e sem cumprir as obrigações aplicáveis de disponibilização de código-fonte para uso em rede.

Portanto, nesta etapa:

- não importar código, prompts, interface ou assets do OpenMontage para a Altum;
- não publicar uma integração comercial apresentada como parte do produto;
- não tratar serviço separado como solução automática para a obrigação de licença;
- não usar credenciais de cliente ou dados de tenant no upstream.

## Caminho possível, sujeito a jurídico

Somente após revisão jurídica, poderá haver uma avaliação em sandbox de uma cópia **sem modificações**, isolada de tenants, com material de teste público e saída descartável. A avaliação deve medir somente:

1. entradas e saídas de cada etapa de vídeo;
2. dependências de provedores, modelos, serviços, chaves e armazenamento;
3. custo, CPU/GPU e limites operacionais;
4. formato de artefatos, aprovações e recibos;
5. possibilidade de substituir etapas por adaptadores Altum independentes.

O resultado desejado não é importar o produto. É aprender os contratos e, quando fizer sentido, conectar ferramentas permissivas e independentes como Remotion, FFmpeg ou provedores aprovados pelo usuário.

## Gate de saída

Para sair de `candidate — legal gate`, são necessários parecer jurídico registrado, execução em sandbox reproduzível do commit fixado e decisão de arquitetura aprovada. Até lá, OpenMontage permanece apenas como benchmark e fonte de padrões; não é runtime da Altum.
