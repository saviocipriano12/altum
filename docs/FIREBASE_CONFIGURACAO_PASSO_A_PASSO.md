# Firebase da Altum — passo a passo de producao

Use este guia no projeto Firebase `maquina-de-prospec`. Nao envie chave privada, JSON de service account ou valores da Vercel por chat, screenshot ou commit.

## Estado comprovado em 01/09/2026

- [x] Provedor E-mail/senha ativado.
- [x] Provedor Google ativado.
- [x] `altumia.com.br` autorizado.
- [x] `www.altumia.com.br` autorizado.
- [x] Requisitos de maiuscula, minuscula, numero e caractere especial selecionados.
- [ ] Politica ainda precisa mudar de **Notificar sobre a aplicacao** para **Exigir a aplicacao**.
- [ ] Tamanho minimo ainda precisa mudar de 10 para 8.
- [x] Paginas proprias de solicitacao e conclusao da redefinicao de senha implementadas.
- [x] Manipulador proprio para links de acao do Firebase implementado em `/cliente/acao-email`.

## 1. Finalizar a politica de senha

1. Abra **Firebase Console > Authentication > Configuracoes**.
2. No menu lateral interno, clique em **Politica de senha**.
3. Em **Modo de aplicacao**, selecione **Exigir a aplicacao**.
4. Mantenha marcados:
   - caractere minusculo;
   - caractere maiusculo;
   - caractere especial;
   - caractere numerico.
5. Altere **Tamanho minimo da senha** para `8`.
6. Pode manter o maximo em `40`.
7. Clique em **Salvar**.
8. Envie apenas uma captura da tela salva, sem dados secretos.

O formulario `/cadastro` e a redefinicao de senha ja exigem os mesmos 8 caracteres, com maiuscula, minuscula, numero e simbolo. Oito caracteres e o minimo adotado pela Altum; senhas maiores continuam recomendadas.

## 2. Ativar protecao contra enumeracao de e-mails

1. Continue em **Authentication > Configuracoes**.
2. Em **Gerenciamento de contas do usuario**, clique em **Acoes do usuario**.
3. Marque **Protecao contra enumeracao de e-mails (recomendado)**.
4. Clique em **Salvar**.

Essa protecao faz respostas de login ficarem mais genericas e dificulta descobrir se determinado e-mail possui conta. A Altum ja apresenta mensagens genericas no login e na recuperacao de senha.

## 3. Personalizar dominio e e-mails

### 3.1 URL de acao personalizada

O codigo ja processa os modos `verifyEmail`, `resetPassword`, `recoverEmail` e alteracao de e-mail. Use esta URL em **Personalizar URL acionavel**:

```text
https://www.altumia.com.br/cliente/acao-email
```

1. Abra **Authentication > Modelos**.
2. Clique no lapis de qualquer modelo de e-mail.
3. Clique em **Personalizar URL acionavel**.
4. Cole a URL acima e salve.
5. Confirme que o Firebase passou a mostrar a URL da Altum, e nao `firebaseapp.com`.

Essa configuracao e do manipulador de acoes do projeto e atende os modelos de verificacao, redefinicao e recuperacao de e-mail. O dominio `www.altumia.com.br` ja consta como autorizado.

### 3.2 Campos comuns dos modelos

- **Nome do remetente:** `Altum`
- **Responder para:** use uma caixa realmente monitorada, preferencialmente `suporte@altumia.com.br`. Nao use esse endereco antes de cria-lo.
- **Idioma do modelo:** `portugues (Brasil)`
- **URL acionavel:** `https://www.altumia.com.br/cliente/acao-email`

Na captura, o campo **De** ja aparece como `noreply@altumia.com.br`, indicando que o dominio personalizado foi aplicado no projeto. Ainda e necessario enviar um teste real e conferir os cabecalhos SPF, DKIM e DMARC para comprovar a entrega.

### 3.3 Verificacao de endereco de e-mail

- **Assunto:** `Confirme seu e-mail para acessar a Altum`
- **Mensagem:**

```html
<p>Ola, %DISPLAY_NAME%.</p>
<p>Confirme seu endereco de e-mail para proteger sua conta e liberar o acesso a Altum.</p>
<p><a href="%LINK%">Confirmar meu e-mail</a></p>
<p>Se voce nao criou esta conta, ignore esta mensagem.</p>
<p>Equipe Altum</p>
```

### 3.4 Redefinicao de senha

- **Assunto:** `Redefina sua senha da Altum`
- **Mensagem:**

```html
<p>Ola.</p>
<p>Recebemos uma solicitacao para redefinir a senha da conta %EMAIL%.</p>
<p><a href="%LINK%">Criar nova senha</a></p>
<p>Se voce nao fez esta solicitacao, ignore esta mensagem. Sua senha atual continuara valida.</p>
<p>Equipe Altum</p>
```

### 3.5 Alteracao de endereco de e-mail

- **Assunto:** `O e-mail de acesso da sua conta Altum foi alterado`
- **Mensagem:**

```html
<p>Ola, %DISPLAY_NAME%.</p>
<p>O e-mail de acesso da sua conta Altum foi alterado para %NEW_EMAIL%.</p>
<p>Se voce nao autorizou essa mudanca, use o link abaixo imediatamente:</p>
<p><a href="%LINK%">Desfazer alteracao de e-mail</a></p>
<p>Equipe Altum</p>
```

### 3.6 Notificacao de registro da autenticacao multifator

- **Assunto:** `A verificacao em duas etapas foi ativada na sua conta Altum`
- **Mensagem:**

```html
<p>Ola, %DISPLAY_NAME%.</p>
<p>A verificacao em duas etapas foi adicionada a sua conta Altum.</p>
<p>Se voce nao realizou esta alteracao, proteja sua conta usando o link abaixo:</p>
<p><a href="%LINK%">Revisar seguranca da conta</a></p>
<p>Equipe Altum</p>
```

Nao altere os marcadores `%LINK%`, `%EMAIL%`, `%DISPLAY_NAME%` e `%NEW_EMAIL%`. Nao coloque senha, dados comerciais nem informacoes do cliente nesses e-mails.

### 3.7 SMTP e remetente `@altumia.com.br`

O SMTP personalizado e opcional. Ele serve para enviar pelo provedor escolhido em vez do servico padrao. Na captura ele esta desativado; nao o ative com valores de exemplo. Se decidir usar SMTP, primeiro crie e valide o dominio de envio no provedor escolhido. Depois preencha:

- **Endereco do remetente:** `noreply@altumia.com.br`
- **Host do servidor SMTP:** fornecido pelo provedor
- **Porta:** normalmente `465` com SSL ou `587` com STARTTLS; use exatamente a indicada pelo provedor
- **Nome de usuario:** fornecido pelo provedor
- **Senha:** credencial SMTP ou API key SMTP fornecida pelo provedor
- **Modo de seguranca:** o indicado pelo provedor

Antes de ativar, publique no DNS os registros SPF e DKIM fornecidos pelo provedor e configure DMARC. Nunca envie a senha SMTP por chat ou captura de tela.

## 4. Configurar Firebase Admin na Vercel

Formato recomendado: uma unica variavel com o JSON completo.

1. No Firebase, abra **Configuracoes do projeto > Contas de servico**.
2. Clique em **Gerar nova chave privada**.
3. Baixe o JSON e guarde-o temporariamente em local seguro.
4. Na Vercel, abra **Project > Settings > Environment Variables**.
5. Crie `FIREBASE_SERVICE_ACCOUNT_KEY`.
6. Cole o JSON completo como valor.
7. Marque **Production**, **Preview** e **Development** somente se esses ambientes usam o mesmo projeto. Idealmente, Preview deve usar outro projeto Firebase.
8. Salve e faca um novo deploy.
9. Apague o JSON baixado do computador depois de confirmar o deploy, ou armazene-o em cofre de segredos.

Alternativa suportada: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`. Nao configure os dois formatos ao mesmo tempo sem necessidade.

Nunca use prefixo `NEXT_PUBLIC_` em uma credencial Admin.

## 5. Liberar publicacao das Storage Rules

O service account usado para publicar as Rules precisa da permissao adequada.

1. Abra **Google Cloud Console > IAM e administrador > IAM** no mesmo projeto.
2. Localize o e-mail do service account usado pela Altum.
3. Clique em **Editar principal**.
4. Adicione a funcao **Firebase Rules Admin** (`roles/firebaserules.admin`).
5. Salve.
6. No terminal da Altum, execute:

```bash
npm run firebase:rules:validate
npm run firebase:rules:deploy
```

7. O resultado precisa mostrar `PUBLISHED firestore.rules` e `PUBLISHED storage.rules`.

Use uma conta de deploy separada da conta que executa a aplicacao sempre que possivel. A aplicacao em producao nao precisa publicar Rules.

## 6. Preparar Emulator Suite

O `firebase.json` ja aponta para Auth `9099`, Firestore `8080`, Storage `9199` e UI `4000`.

Neste computador ainda faltam Java e Firebase CLI. Para concluir:

1. Instale Java 21 LTS.
2. Confirme com `java -version`.
3. Instale a Firebase CLI com `npm install --global firebase-tools` ou use uma dependencia de desenvolvimento aprovada pela equipe.
4. Confirme com `firebase --version`.
5. Execute `firebase login` e selecione o projeto de homologacao, nunca producao para testes destrutivos.
6. Rode `firebase emulators:start`.
7. Execute a matriz dono, gestor, vendedor A, vendedor B e anonimo.

O vendedor A deve receber `permission-denied` ao tentar acessar dados exclusivos do vendedor B. Usuario comum nao pode alterar `role`, `tenantId`, `billingStatus`, plano ou entitlements.

## 7. Ativar App Check gradualmente

O codigo da Altum ja inicializa App Check quando `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` existe.

Na tela mostrada na captura, clique no link azul **crie uma chave de site do reCAPTCHA Enterprise**. Depois:

1. Confirme no seletor superior que o projeto e `maquina-de-prospec`.
2. Se solicitado, ative a API reCAPTCHA Enterprise.
3. Clique em **Criar chave**.
4. Nome de exibicao: `Altum Web Producao`.
5. Plataforma: **Website/Web**.
6. Tipo de integracao: **baseada em pontuacao**. Nao selecione desafio de caixa/checkbox.
7. Adicione os dominios `altumia.com.br` e `www.altumia.com.br`, sem `https://` e sem caminhos.
8. Nao adicione `localhost` a chave de producao.
9. Crie a chave e copie a **chave do site**. Ela e publica; nao e a chave privada do Firebase nem uma chave secreta de servidor.
10. Volte para **Firebase > App Check > Apps > ALTUM IA**.
11. Cole a chave em **Chave de site do reCAPTCHA Enterprise**.
12. Mantenha o TTL em `1 hora` e clique em **Salvar**.
13. Na Vercel, abra **Project > Settings > Environment Variables**.
14. Crie `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` e cole a mesma chave do site.
15. Marque inicialmente apenas **Production**. Preview precisa de uma chave propria com dominios de homologacao.
16. Faca um novo deploy sem ativar enforcement.
17. Observe as metricas do App Check por pelo menos 24 horas e valide cadastro, login, Firestore e Storage.
18. Quando as requisicoes legitimas aparecerem como validas, ative enforcement primeiro em Firestore e Storage.
19. Ative enforcement de Authentication somente depois de um novo teste completo de cadastro, Google login, verificacao e recuperacao.

Para desenvolvimento local, use o debug provider/token do App Check em vez de cadastrar `localhost` na chave de producao.

## 8. Teste final que voce deve executar

Use um e-mail novo e uma janela anonima:

1. Criar conta por e-mail/senha.
2. Confirmar que aparece a tela “Confirme seu e-mail”.
3. Tentar entrar antes de confirmar e validar que volta para essa tela.
4. Reenviar o e-mail e validar a espera de 60 segundos.
5. Clicar no link recebido e voltar para a plataforma.
6. Confirmar acesso ao painel e trial de 7 dias.
7. Recuperar a senha.
8. Criar outra conta usando Google.
9. Confirmar que nenhum `auth/internal-error` ou `permission-denied` aparece no console.

Depois, envie apenas o resultado de cada passo (`OK` ou erro) e screenshots sem segredos.
