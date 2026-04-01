# ALTUM Agent v2 - Cenarios Reais de Teste SDR

## Objetivo
Validar se a IA:
- responde como SDR humana
- entende audio com clareza
- alimenta o CRM
- nao alucina
- conduz para proximo passo comercial

## Cenario 1 - Saudacao fria
Lead:
`Oi`

Esperado:
- responder curto
- soar humana
- fazer uma pergunta simples
- nao despejar servicos

## Cenario 2 - Pedido direto de servico
Lead:
`O que voces fazem?`

Esperado:
- explicar em 1 ou 2 frases
- puxar foco comercial
- nao listar tudo de forma institucional

## Cenario 3 - Nicho + dor
Lead:
`Sou uma imobiliaria e quero vender mais pelo WhatsApp`

Esperado:
- reconhecer nicho
- reconhecer objetivo
- sugerir linha de solucao coerente
- gravar `businessType`, `primaryGoal` e `serviceInterest`

## Cenario 4 - Pedido de preco cedo demais
Lead:
`Quanto custa?`

Esperado:
- nao inventar preco
- nao fugir demais
- qualificar rapido antes de falar de faixa

## Cenario 5 - Pedido de preco com contexto
Lead:
`Sou uma clinica e quero organizar atendimento e vendas. Quanto custa?`

Esperado:
- reconhecer contexto
- responder com maturidade
- conduzir para reuniao ou proposta
- atualizar CRM

## Cenario 6 - Objecao de orcamento
Lead:
`Nao tenho muito orcamento agora`

Esperado:
- acolher
- reduzir atrito
- propor caminho enxuto
- registrar objecao

## Cenario 7 - Objecao de tempo
Lead:
`Agora estou sem tempo`

Esperado:
- responder curto
- oferecer resumo ou proximo passo simples
- nao pressionar

## Cenario 8 - Pedido de humano
Lead:
`Quero falar com uma pessoa`

Esperado:
- handoff claro
- sem discutir
- registrar no sistema

## Cenario 9 - Audio com contexto
Lead:
`[audio] Tenho uma loja, ja anuncio no Instagram, mas perco lead no atendimento`

Esperado:
- transcrever bem
- reconhecer dor
- salvar `businessType`, `currentChannels`, `primaryGoal`
- responder de forma coerente

## Cenario 10 - Audio pouco claro
Lead:
`[audio longo e ruim]`

Esperado:
- nao alucinar
- pedir um resumo curto
- nao fingir que entendeu

## Cenario 11 - Interesse em proposta
Lead:
`Faz sentido. Me manda uma proposta`

Esperado:
- entrar em `proposal_path`
- criar rascunho de proposta
- registrar evento e notificar time

## Cenario 11B - Proposta cedo demais
Lead:
`Me manda uma proposta`

Esperado:
- nao abrir proposta cedo demais
- pedir o minimo de contexto comercial
- registrar que existe interesse, mas ainda faltou base
- evitar parecer vendedor afobado

## Cenario 12 - Interesse em reuniao
Lead:
`Quero agendar uma reuniao`

Esperado:
- entrar em `scheduling`
- criar rascunho de agendamento
- registrar evento e notificar time

## Checklist de aprovacao
- respondeu em ate 3 ou 4 frases
- no maximo 1 pergunta por vez
- nao vazou FAQ/policy/playbook
- nao inventou oferta
- nao repetiu a mensagem anterior
- atualizou CRM
- criou proximo passo quando fez sentido
- nao criou proposta ou reuniao cedo demais
