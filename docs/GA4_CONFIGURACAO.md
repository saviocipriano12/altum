# Google Analytics 4 na Altum

O site publico da Altum envia visualizacoes de pagina ao GA4 somente em producao e depois que o visitante aceita os cookies opcionais.

As rotas autenticadas e operacionais (`/admin`, `/cliente` e `/api`), alem de `/login` e `/cadastro`, nao sao rastreadas. Isso evita enviar ao Google dados da operacao dos clientes.

## 1. Obter o ID de medicao

1. No Google Analytics, crie ou abra a propriedade GA4 da Altum.
2. Acesse **Administracao > Coleta e modificacao de dados > Fluxos de dados**.
3. Crie ou abra o fluxo Web de `https://www.altumia.com.br`.
4. Copie o **ID da medicao**, que tem o formato `G-XXXXXXXXXX`.

## 2. Configurar os ambientes

Para desenvolvimento local, preencha em `.env.local`:

```dotenv
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Na Vercel, cadastre a mesma variavel em **Project > Settings > Environment Variables** para o ambiente **Production** e faca um novo deploy. O ID de medicao e publico por natureza; nao use uma chave de API nessa variavel.

## 3. Validar depois do deploy

1. Abra o site publicado em uma janela anonima, sem bloqueador de anuncios.
2. Aceite os cookies opcionais.
3. Navegue entre duas ou tres paginas publicas.
4. No GA4, abra **Relatorios > Tempo real** e confirme a visita e as paginas.
5. No navegador, tambem e possivel confirmar uma requisicao `g/collect` para `google-analytics.com` na aba **Network** das ferramentas de desenvolvedor.

O codigo envia `page_view` manualmente nas navegacoes do Next.js e desativa o envio automatico (`send_page_view: false`) para nao duplicar visualizacoes.

## 4. Medicao aprimorada sem duplicidade

No fluxo Web do GA4, a **Medicao aprimorada** pode continuar ativa para eventos como rolagem, cliques externos e downloads. Nas configuracoes avancadas de **Visualizacoes de pagina**, desative **Alteracoes de pagina com base em eventos do historico do navegador**: o app ja envia essas navegacoes manualmente.

Tambem evite ativar uma segunda implementacao de GA4 ou GTM com o mesmo ID.
