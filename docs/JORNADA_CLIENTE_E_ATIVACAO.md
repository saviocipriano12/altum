# Jornada do cliente e ativacao da Altum

## Objetivo

Transformar a entrada na plataforma em uma sequencia clara: entender o negocio, conectar os canais, preparar a IA, testar a operacao e iniciar o uso diario. O cliente deve sempre saber o que ja concluiu, o que precisa fazer agora e qual resultado aquela configuracao libera.

## Diagnostico atual

Hoje existem tres camadas que tentam orientar o cliente ao mesmo tempo:

1. o tour navega automaticamente por doze rotas;
2. a implantacao guiada coleta empresa, oferta, canais e forma de venda;
3. o go-live mistura prontidao comercial com evidencias e rotinas tecnicas.

Isso cria repeticao, mudancas de pagina sem contexto e dois conceitos diferentes de progresso. A correcao e separar responsabilidades:

- **Tour da interface:** apresentacao curta, sem trocar de pagina automaticamente.
- **Central de ativacao:** progresso persistente e proximo passo real.
- **Configuracao guiada:** formularios, testes e publicacao de cada recurso.
- **Operacao diaria:** Inicio, Conversas, Clientes, Agenda e Resultados sem mensagens tecnicas.
- **Avancado Altum:** logs, runtime, evidencias de infraestrutura e diagnosticos internos.

## Jornada-alvo

### 1. Entrada

- Cadastro e verificacao de e-mail.
- Criacao ou acesso a empresa.
- Explicacao curta do resultado esperado: atender, vender e acompanhar com IA.
- Acao principal: `Configurar minha operacao`.

Saida esperada: usuario autenticado, empresa criada e objetivo comercial entendido.

### 2. Entender o negocio

- Nome, segmento, publico e localizacao.
- Produtos ou servicos, ticket e politicas comerciais.
- Como os leads chegam, como a equipe atende e como uma venda termina.
- Geracao de um blueprint revisavel, sem ativar automacoes silenciosamente.

Saida esperada: contexto comercial suficiente para CRM, IA e automacoes.

### 3. Conectar a operacao

- Escolher primeiro canal: WhatsApp, Instagram, site ou outro canal disponivel.
- Explicar o beneficio antes de pedir credenciais.
- Testar conexao e mostrar uma confirmacao compreensivel.
- Configurar equipe, responsavel e prazo de resposta.

Saida esperada: pelo menos um canal testado e uma pessoa responsavel.

### 4. Preparar a IA

- Importar ou cadastrar conhecimento.
- Escolher tom de voz e o que a IA pode ou nao pode fazer.
- Definir quando transferir para uma pessoa.
- Simular uma conversa e aprovar a resposta antes de publicar.

Saida esperada: IA com conhecimento, limites, responsavel e teste aprovado.

### 5. Preparar automacoes

- Escolher um objetivo em linguagem comercial.
- Configurar gatilho, publico, mensagem e destino.
- Mostrar previa e explicar limites do canal.
- Executar teste controlado e somente depois permitir publicar.

Saida esperada: primeira automacao publicada e comprovada.

### 6. Comecar a operar

- Receber ou criar um contato de teste.
- Responder uma conversa.
- Mover uma oportunidade.
- Agendar a proxima acao.
- Consultar o primeiro relatorio.

Saida esperada: o cliente concluiu o ciclo real `conversa -> oportunidade -> proxima acao -> resultado`.

### 7. Acompanhar e crescer

- Inicio prioriza o que exige acao hoje.
- Relatorios explicam resultado e sugerem decisao.
- Faturamento mostra plano, pagamentos e mudancas disponiveis.
- A Central de ativacao vira uma central de saude e recomendacoes.

## Auditoria por area

| Area | Funcao para o cliente | Furo principal encontrado | Direcao |
| --- | --- | --- | --- |
| Inicio | decidir o que fazer hoje | mistura indicadores e implantacao sem uma unica proxima acao | destacar prioridade e progresso de ativacao |
| Conversas | atender e assumir conversas | pagina muito grande e com muitos estados tecnicos | priorizar fila, conversa e proxima acao |
| Clientes & Oportunidades | organizar relacionamento e venda | lista, funil e proposta parecem produtos separados | preservar o cliente entre lista, funil e proposta |
| Agenda | proteger retornos | criacao e acompanhamento aparecem juntos sem orientacao inicial | estado vazio com primeira tarefa guiada |
| Produtos & Servicos | ensinar o que a empresa vende | cadastro, importacao e conhecimento se sobrepoem | apresentar cadastro simples e importacao como acelerador |
| Campanhas | entender captacao e retorno | grande volume de configuracao antes do primeiro resultado | comecar por objetivo, canal e conversao esperada |
| Captacao | criar entrada de leads | construtor extenso sem caminho curto | oferecer modelo inicial e publicacao testavel |
| Disparos | enviar campanhas com seguranca | tela extensa e risco de erro operacional | audiencia -> mensagem -> previa -> teste -> envio |
| Instagram | automatizar interacoes permitidas | precisa provar permissao e resultado antes de publicar | modelo -> publicacao -> mensagem -> teste -> ativacao |
| Relatorios | decidir com dados | estados vazios apenas informam ausencia | apontar qual acao gera o primeiro dado |
| Perguntar a Altum | consultar a operacao | depende de dados que podem ainda nao existir | perguntas iniciais baseadas na fase da conta |
| Assistente Altum | configurar comportamento da IA | pagina concentra controles demais | separar identidade, conhecimento, limites e teste |
| Conhecimento | manter respostas corretas | nao deixa evidente o impacto de cada documento | mostrar cobertura, uso e teste de resposta |
| Configuracoes | cuidar da conta | repete prontidao, atalhos e diagnosticos | virar mapa simples de empresa, equipe, canais e conta |
| Implantacao guiada | preparar a empresa | boa base, mas desconectada do restante do painel | ser a primeira fase da Central de ativacao |
| Go-live | validar operacao | linguagem e criterios internos expostos ao cliente | manter para perfil tecnico/Altum |
| Faturamento | acompanhar assinatura e dinheiro | precisa permanecer acessivel e contextual | plano, historico, pagamento e mudancas em uma pagina |

## Regras da experiencia guiada

- O botao `Proximo` do tour nunca deve navegar automaticamente.
- Navegacao para configurar algo deve ser uma escolha explicita: `Abrir e configurar`.
- O progresso deve vir de dados reais, nao apenas de cliques no tour.
- Cada etapa deve informar beneficio, acao, criterio de conclusao e proximo passo.
- Ao voltar para a plataforma, o cliente continua exatamente do ponto salvo.
- A ajuda contextual deve estar perto da acao, sem bloquear a tela inteira.
- Erros devem explicar como corrigir; sucesso deve mostrar o que foi liberado.
- Termos como runtime, provider, fila, guardrail, webhook e token ficam em areas avancadas.

## Criterios de sucesso

- O cliente identifica a proxima acao em menos de cinco segundos.
- O tour pode ser concluido sem recarregar ou trocar de pagina.
- A Central de ativacao abre de qualquer pagina e preserva o progresso.
- Cada configuracao critica possui teste ou evidencia de conclusao.
- Nenhuma etapa termina sem um destino seguinte claro.
- A operacao diaria fica disponivel sem obrigar o cliente a rever explicacoes introdutorias.

