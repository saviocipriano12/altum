# Inventario de paginas publicas da Altum

Este inventario separa as rotas que apresentam a Altum ao mercado das rotas de sistema, formularios e previews internos. As rotas legadas foram mantidas para preservar links existentes, mas nao devem orientar a navegacao principal da nova marca.

## Navegacao principal recomendada

| Rota | Papel |
| --- | --- |
| `/` | Nova home focada na plataforma e na promessa de operacao comercial com IA |
| `/plataforma` | Demonstracao detalhada do produto |
| `/precos` | Planos e caminhos de contratacao |
| `/blog` | Conteudo e educacao de mercado |
| `/cliente/login` | Acesso de clientes |

## Paginas comerciais e institucionais atuais

| Rota | Recomendacao |
| --- | --- |
| `/contato` | Revisar para falar apenas de plataforma, demonstracao e contratacao |
| `/diagnostico` | Reposicionar como diagnostico da operacao comercial |
| `/implantacao` | Manter como servico de ativacao da plataforma |
| `/politica-de-privacidade` | Manter |
| `/exclusao-de-dados` | Manter por conformidade |

## Conteudo e SEO

| Rota | Recomendacao |
| --- | --- |
| `/blog/[slug]` | Manter artigos coerentes com o produto; revisar conteudo de agencia |
| `/solucoes` e `/solucoes/[vertical]` | Revisar cada vertical para vender casos de uso da plataforma |
| `/segmentos` e `/segmentos/[segment]` | Revisar para posicionamento por segmento |
| `/cidades/[city]` | Auditar; paginas locais podem carregar posicionamento antigo de agencia |
| `/automacao-com-ia` | Manter, alinhando com o Assistente Altum |
| `/ia-no-whatsapp` | Manter como pagina de caso de uso |
| `/chatbot-para-empresas` | Revisar linguagem para nao reduzir a Altum a um chatbot |

## Rotas legadas de agencia e portfolio

Estas URLs continuam funcionando por compatibilidade, mas sairam da navegacao principal e do sitemap da nova home.

- `/agencia`
- `/estrutura-digital`
- `/portfolio`
- `/portfolio/advogado`
- `/portfolio/advogado2`
- `/portfolio/advogado3`
- `/portfolio/advogadoeng`
- `/cases/vitta`
- `/cases/ajpainting`

## Formularios e superficies publicas do produto

- `/f/[formId]`
- `/widget/f/[formId]`
- `/embed/f/[formId]`

Essas rotas sao publicas por necessidade funcional, mas nao fazem parte da navegacao ou da comunicacao institucional.

## Autenticacao e areas protegidas

- `/cliente/login`: acesso do cliente.
- `/login`: acesso administrativo legado.
- `/cliente/painel/**`: area autenticada do cliente; nao e pagina publica de marketing.
- `/admin/**`: area administrativa; nao e pagina publica de marketing.

## Previews internos encontrados

As rotas abaixo devem permanecer fora do sitemap e nao devem ser divulgadas:

- `/preview/a`
- `/preview/b`
- `/preview/c`
- `/preview/conceitos`
- `/preview/crm`
- `/preview/modelos`
- `/preview/plataforma`
- `/preview/v2`
- `/preview/v3`
- `/preview/visao-geral`

## Rotas tecnicas publicas

- `/sitemap.xml`
- `/robots.txt`
- `/rss.xml`

## Proxima etapa recomendada

Depois da home, a prioridade e unificar `/plataforma`, `/precos`, `/contato`, `/diagnostico` e `/implantacao` no mesmo shell visual e na mesma narrativa. Em seguida, revisar as paginas de SEO e decidir entre redirecionar, arquivar ou reescrever cada rota legada de agencia.
