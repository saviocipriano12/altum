# Matriz comercial da Altum

Versao do catalogo: `2026-09-launch`

Este documento e a fonte de verdade comercial para site, cadastro, teste, assinatura, limites e atendimento. O catalogo executavel fica em `lib/platform-plans.ts`.

## Posicionamento

A Altum e uma **operacao comercial com IA**. O cliente entra para atender, vender, acompanhar e decidir. Configuracao tecnica, logs e controles internos nao fazem parte da comunicacao principal.

## Planos oficiais

| Plano | Mensalidade | Implantacao | Publico principal | Resultado prometido |
| --- | ---: | ---: | --- | --- |
| Essencial | R$ 397 | R$ 397, opcional | Pequenos negocios | Organizar atendimento e nao perder oportunidades |
| Operacao | R$ 697 | R$ 797, obrigatoria | Empresas com demanda ativa | Automatizar WhatsApp e Instagram com IA aplicada a vendas |
| Escala | R$ 1.197 | R$ 1.497, obrigatoria | Operacoes com mais equipe e volume | Governar mais canais, equipes e automacoes |
| Estrutura Assistida | A partir de R$ 2.497 | A partir de R$ 2.997 | Operacoes que precisam de acompanhamento humano | Plataforma, implantacao e evolucao estrategica |

Os limites exatos de usuarios, canais, contatos, mensagens, IA, automacoes e armazenamento ficam no catalogo executavel. Alterar um preco ou limite apenas no texto do site nao e uma alteracao valida de produto.

## Teste gratuito

- Duracao: 7 dias.
- Cartao: nao e solicitado para iniciar.
- Recursos: todos os modulos ficam visiveis e utilizaveis.
- Consumo: usa limites controlados proprios do teste.
- Cobranca: nenhuma cobranca e criada sem confirmacao expressa do cliente.
- Conversao: o plano escolhido no site e salvo como interesse, mas pode ser trocado antes da assinatura.
- Fim do teste: sem assinatura confirmada, o acesso comercial e bloqueado; os dados nao sao apagados automaticamente.

## Regras de consumo

- Mostrar consumo e limite na area de faturamento.
- Alertar em 70%, 90% e 100%.
- Ao chegar a 100%, interromper apenas a acao que gera consumo adicional; leitura de dados, historico, faturamento e upgrade continuam acessiveis.
- Adicionais devem ser aceitos explicitamente antes de gerar cobranca.

## Custos separados

A mensalidade cobre o uso da plataforma dentro do limite do plano. Devem aparecer separadamente antes da confirmacao:

- implantacao quando obrigatoria;
- usuarios, canais, contatos, IA e automacoes adicionais;
- tarifas oficiais de Meta, WhatsApp e outros provedores;
- servicos humanos fora do escopo do plano.

## Programa Fundadores

Oferta privada para ate 10 clientes: plano Operacao por R$ 497/mensais durante 6 meses, implantacao de R$ 497 e permanencia minima de 3 meses. A oferta nao deve substituir ou alterar o catalogo publico.

## Ciclo financeiro

- Checkout recorrente: Asaas.
- Confirmacao de acesso: somente depois do evento confirmado pelo webhook.
- Tolerancia de atraso: 3 dias corridos.
- Cancelamento em ate 7 dias do primeiro pagamento: solicitar estorno integral.
- Cancelamento depois desse periodo: impedir renovacao e manter acesso ate o fim do ciclo pago.
- Dados de cartao: permanecem no ambiente do Asaas; a Altum nao armazena o numero completo.
- Implantacao: enquanto nao houver um fluxo separado de cobranca unica aprovado e testado, deve ser formalizada separadamente da recorrencia e nunca pode aparecer como se ja estivesse incluida no checkout mensal.

## Linguagem obrigatoria

Usar linguagem de resultado: conversas, clientes, vendas, acompanhamento, automacao e decisao. Evitar na camada comum: runtime, filas, providers, tokens, webhooks, guardrails e nomes internos de colecoes.

Toda pagina de venda ou faturamento deve responder claramente:

1. O que esta incluso?
2. Qual e o limite?
3. O que e cobrado separadamente?
4. Quando a cobranca comeca?
5. Como alterar ou cancelar?

## Pendencias antes do go-live comercial

- Definir e implementar a cobranca unica da implantacao no Asaas, separada da assinatura recorrente.
- Definir o processo de aceite dos adicionais e o documento comercial correspondente.
- Realizar um pagamento real controlado por plano e validar webhook, liberacao, atraso, upgrade, cancelamento e estorno.
- Ativar o Firebase App Check depois de monitorar o trafego legitimo.
