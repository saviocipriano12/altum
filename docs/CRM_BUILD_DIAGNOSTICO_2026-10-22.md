# Compilação de revisão do CRM — diagnóstico local

## Evidência atual

- Sessão 44067 terminou com `BUILD_EXIT=1`. Log:
  `.qa-artifacts/crm-activity-ui-build-review.log`.
- Turbopack registrou timeout ao receber resposta do subprocesso PostCSS de
  `app/globals.css`. Ao encerrar, também registrou erro Windows 112, espaço
  insuficiente ao persistir/compactar o cache. Não foi isolada a relação causal
  entre as duas falhas; liberar disco não comprova correção do processamento CSS.
- Cache observado: `C:\Users\Eu\ALTUM\.next\cache\turbopack\v16.3.8-b0fad0d4`.
  Tamanho total medido: 3.505.349.286 bytes, em 400 arquivos.
- Espaço disponível observado em C: era 206.958.592 bytes. Diretórios `.next`,
  `cache`, `turbopack` e a versão foram conferidos dentro do workspace, sem
  redirecionamento. Nenhum compilador/worker de build foi encontrado na checagem.
- Remoção automática do cache foi bloqueada tanto no diretório de cache quanto
  na versão específica, com resposta `blocked by policy`. Nada foi removido;
  não houve tentativa por outro mecanismo depois da rejeição restrita.

## Retomada necessária

1. Liberar pelo menos 6 GiB no disco C: antes de uma nova compilação. O diretório
   acima contém cache regenerável identificado na falha. A limpeza manual fica
   pendente; não apagar o workspace nem `.qa-artifacts`, que guarda evidências,
   ferramentas e a saída do aplicativo QA em execução.
2. Executar `node scripts/build-crm-review.mjs` com os emuladores locais ativos.
   O launcher verifica espaço antes de iniciar o compilador e preserva o
   isolamento fictício. O guard foi exercitado neste ambiente: rejeição por
   espaço esperada, `PREFLIGHT_TEST_EXIT=0`, sem iniciar novo compilador.
3. Coletar a saída terminal. Se o timeout CSS persistir com espaço disponível,
   investigar o subprocesso com os guias locais do Next antes de modificar
   estilos, configuração de produção ou dependências. Não remover checagem de tipos.
4. Validar a fonte atual. Alterações da unidade 42 ocorreram depois do início do
   build falho; um artefato anterior não comprova esta versão.

O orçamento local de 6 GiB dá margem ao cache observado e à saída, sem garantir
consumo máximo. A configuração de publicação e o build configurado para produção
continuam com pacote próprio; o binário fictício de revisão não é publicável.

## Trabalho preservado

A prévia usa `.qa-artifacts/next-inbox`, separada de `.next`. Seus dados fictícios
e emuladores foram mantidos. Regressão da unidade 42: 42 testes aprovados, tipos,
lint e verificação HTTP local aprovados. Aceite visual, desempenho em carteira
grande e compilação geral permanecem abertos.
