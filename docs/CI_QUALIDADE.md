# CI de qualidade da Altum

O workflow `.github/workflows/quality-gates.yml` valida pull requests, pushes em
`main`, grupos de merge e execuções manuais. Seu job `validate` usa Ubuntu 24.04,
Node.js 24 e Java 21 (Temurin). As actions estão fixadas por SHA dos respectivos
repositórios oficiais; o token do GitHub tem apenas leitura e não fica persistido
no checkout.

## Verificações

1. `npm ci`: instalação reproduzível pelo lockfile.
2. `npm run test:firebase-rules -- --non-interactive`: compilação e testes das regras
   de Firestore e Storage nos emuladores do projeto fictício `demo-altum-rules`.
3. `npm run test:smoke`: testes Node dos contratos e regras de negócio.
4. `npm run typecheck`: geração de tipos de rotas e TypeScript.
5. `npm run lint -- --max-warnings=24`: nenhum erro e, no máximo, o patamar atual
   de 24 avisos. Esse limite deve diminuir conforme os avisos forem resolvidos.
6. `npm audit --audit-level=high`: reprovação para vulnerabilidades altas ou críticas,
   inclusive nas dependências de desenvolvimento.
7. `npm run build`: compilação e geração das páginas com configuração pública
   fictícia do Firebase e URLs locais.

Os smoke tests descobrem os arquivos `.test.mts` pelo sistema de arquivos e usam
`process.execPath` com argumentos separados, sem glob ou shell dependente de
Windows. A suíte de autorização usa `.emulator.mts` e roda separadamente, enquanto
os emuladores estão disponíveis.

## Credenciais e isolamento

Este workflow não precisa de `.env.local`, secrets, login no Firebase, service
account, chave de IA, email ou gateway de pagamento. O SDK Firebase client é
inicializado ao importar componentes, inclusive durante o build; por isso o passo
de build recebe os seis identificadores públicos fictícios necessários. Não são
credenciais reais. As conexões de servidor ao Firebase ficam apontadas para
loopback nesse passo.

O comando `firebase:rules:validate` não faz parte do CI: sua implementação cria e
remove um ruleset na API do Google e requer credenciais. A compilação local feita
pelo Emulator Suite já cobre a sintaxe, além de permitir testar as autorizações.
O prefixo `demo-` é intencional e deve ser mantido. Não substituir pelo projeto
de produção para executar esta suíte.

O build deste workflow é somente evidência de compilação. Como variáveis
`NEXT_PUBLIC_*` são embutidas pelo Next.js, seu resultado não é um artefato de
deploy. A publicação deve realizar outro build com a configuração do ambiente
destino. Este workflow não publica aplicação, regras ou índices e não modifica
dados de clientes.

São necessários acesso à internet para instalar pacotes, baixar os emuladores e
fontes usadas no build, além das portas locais 8080 e 9199 livres. Para reproduzir
localmente, usar uma cópia sem `.env*`, Node 24 e Java 21 no `PATH`, executando os
passos acima com os valores do passo de build no workflow.

## Ativação e limites

O arquivo só passa a executar no GitHub depois de entrar no repositório remoto.
Sua existência não ativa proteção de branch. Após uma execução remota bem-sucedida,
configurar o check `validate` como obrigatório nas regras de `main`, se esse for
o processo de revisão adotado pela equipe.

Uma execução verde não comprova entrega de mensagens reais, checkout/cancelamento
em sandbox, restauração de backup, acessibilidade completa ou comportamento
autenticado no navegador. Esses itens continuam nos gates de homologação de
`docs/GO_LIVE_GATES_EXTERNOS.md`.

## Referências oficiais

- [Checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [Setup Node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [Setup Java v6.0.0](https://github.com/actions/setup-java/releases/tag/v6.0.0)
- [Segurança de workflows](https://docs.github.com/en/actions/reference/security/secure-use)
- [Conectar ao Firestore Emulator e usar projetos demo](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [Variáveis de ambiente no Next.js](https://nextjs.org/docs/app/guides/environment-variables)
