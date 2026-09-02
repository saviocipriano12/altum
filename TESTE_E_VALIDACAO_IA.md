# 🧪 GUIA DE TESTE: Como Validar se a IA Está Funcionando Bem

---

## O que Você vai Fazer

Depois de configurar a IA e adicionar os documentos, você precisa **testar** se está funcionando certo.

É como provar a roupa antes de sair de casa: você testa, e se não servir, volta e ajusta.

---

## 📋 Checklist de Teste (10 Testes)

Faça esses 10 testes e anote os resultados. Se a IA responder bem, marca ✅. Se responder ruim, marca ❌.

### Teste 1: Pergunta sobre Preço - Site
**Você escreve:**
```
Oi, quanto custa um site?
```

**Resposta esperada:**
```
Sites começam em R$ 5.000. Inclui design responsivo, SEO básico, 
Google Analytics, formulário de contato e 12 meses de hospedagem.
Quer agendar uma reunião para saber melhor?
```

**Resultado:** ✅ ❌ (marque um)

---

### Teste 2: Pergunta sobre Prazo
**Você escreve:**
```
Qual o prazo para entregar um site?
```

**Resposta esperada:**
```
O prazo é de 3 a 6 semanas, conforme a complexidade do seu projeto.
Incluímos o briefing (1-2 dias), design (5-7 dias), desenvolvimento 
(10-15 dias), testes (3-5 dias) e entrega (1 dia).
```

**Resultado:** ✅ ❌

---

### Teste 3: Pergunta sobre Automação de WhatsApp
**Você escreve:**
```
Vocês fazem automação de WhatsApp?
```

**Resposta esperada:**
```
Sim! A gente cria um robô inteligente que responde seus clientes 24/7.
O robô qualifica leads, agenda reuniões e passa para atendente humano quando necessário.
Custa a partir de R$ 1.500 por mês. Quer saber mais?
```

**Resultado:** ✅ ❌

---

### Teste 4: Pergunta sobre Loja Virtual
**Você escreve:**
```
Vocês fazem e-commerce? Qual plataforma?
```

**Resposta esperada:**
```
Sim! Fazemos lojas virtuais em várias plataformas: 
Shopify, WooCommerce, VTEX, Tray, Nuvemshop.
Começam em R$ 8.000. Incluem design, pagamento, carrinho, gestão de estoque.
Agende para saber qual plataforma combina melhor com você.
```

**Resultado:** ✅ ❌

---

### Teste 5: Pergunta sobre Tráfego Pago
**Você escreve:**
```
Vocês fazem Google Ads e Meta Ads?
```

**Resposta esperada:**
```
Sim! A gente gerencia campanhas de tráfego pago no Google Ads e Meta Ads.
Criamos anúncios, otimizamos, entregamos relatório semanal.
Cobramos 20% do orçamento que você investir. 
Quer saber o ROI típico?
```

**Resultado:** ✅ ❌

---

### Teste 6: Pergunta "Bagunçada" (Teste de Escalação)
**Você escreve:**
```
Meu site saiu do ar! Como resolvo?
```

**Resposta esperada (uma das duas):**
```
Opção 1: "Isso é um problema técnico urgente. Vou encaminhar para 
nosso time técnico, que vai entrar em contato em até 1 hora."

Opção 2: "Entendo que é urgente! Deixa eu te passar para um humano 
que consegue resolver mais rápido."
```

**O que não deveria fazer:** Tentar resolver sozinha ou dar resposta genérica.

**Resultado:** ✅ ❌

---

### Teste 7: Pergunta sobre Formas de Pagamento
**Você escreve:**
```
Como funciona o pagamento?
```

**Resposta esperada:**
```
Geralmente cobramos 50% no início (para começar o trabalho) 
e 50% na entrega.
Para contratos maiores, podemos negociar parcelamento.
Qual serviço você está pensando em contratar?
```

**Resultado:** ✅ ❌

---

### Teste 8: Pergunta sobre Suporte
**Você escreve:**
```
Vocês fazem suporte depois que entregar?
```

**Resposta esperada:**
```
Sim! Todos os projetos incluem 30 dias de suporte técnico gratuito.
Após isso, oferecemos planos de manutenção mensal a partir de R$ 300.
```

**Resultado:** ✅ ❌

---

### Teste 9: Pergunta sobre Landing Page + Tráfego
**Você escreve:**
```
Quero fazer uma landing page e rodar anúncios. Como vocês trabalham?
```

**Resposta esperada:**
```
Perfeito! A gente faz o combo:
1. Criamos a Landing Page otimizada (R$ 2.500)
2. Gerenciamos o tráfego pago (20% do orçamento)

O resultado típico: 5-15% de conversão (muito bom!).
Quer calcular quanto você pode ganhar?
```

**Resultado:** ✅ ❌

---

### Teste 10: Pergunta de Objeção (Preço Alto)
**Você escreve:**
```
Vocês são caros demais!
```

**Resposta esperada:**
```
Entendo essa dúvida! Mas pense assim:
- Um site nosso gera R$ 10k/mês em vendas (em média)
- Você investe R$ 5k (recupera em meio mês!)
- Nós somos especialistas em retorno, não só em design bonito.

Quer ver um case de cliente que dobrou a receita em 3 meses?
```

**Resultado:** ✅ ❌

---

## 📊 Como Avaliar os Resultados

### Se acertou 8-10 testes (80-100%):
🎉 **Parabéns!** Sua IA está funcionando muito bem.
- Coloque em produção com clientes reais
- Continue monitorando

### Se acertou 5-7 testes (50-79%):
⚠️ **Pode melhorar!** Tem coisas funcionando, mas precisa ajustar.
- Veja qual pergunta falhó
- Adicione mais documentos sobre esse tópico
- Revise o tom de voz
- Teste novamente

### Se acertou menos de 5 testes (< 50%):
❌ **Precisa revisar muita coisa!**
- Sua IA pode estar com:
  - Poucos documentos (adicione mais)
  - Guardrails muito rígidos (relaxe um pouco)
  - Configuração errada (revise a seção de IA)
  - Muitos problemas (considere reiniciar)

---

## 🔧 Se a IA Falhar em um Teste

### Cenário 1: Resposta Genérica (tipo "não sei")
**Problema:** Falta documento
**Solução:** Adicione um documento novo sobre esse tópico

Exemplo:
- Se falhou em "Preço de Site" → adicione documento "Preço de Site"
- Se falhou em "Automação WhatsApp" → adicione documento sobre isso

### Cenário 2: Resposta Errada (fala coisa que não é verdade)
**Problema:** Documento tem informação errada
**Solução:** Edite o documento e corrija

Exemplo:
- Se disse "Site custa R$ 10k" mas deveria ser "R$ 5k"
- Vá no documento e corrija o preço

### Cenário 3: Resposta Muito Formal/Casual
**Problema:** Tom de voz não está bom
**Solução:** Mude o tom na seção de IA

Passos:
1. Vá para Seção IA
2. Procure "Tom de Voz"
3. Tente: "Vendedor" (mais agressivo) ou "Premium" (mais sofisticado)
4. Teste novamente

### Cenário 4: IA Não Escalou para Humano
**Problema:** Guardrails fracos ou não configurados
**Solução:** Configure melhor os guardrails e tópicos de escalação

---

## 📈 Métrica de Sucesso (O que Você Deve Acompanhar)

Depois de 1-2 semanas com a IA em produção, veja esses números:

| Métrica | Bom | Ruim | Ação |
|---------|-----|------|------|
| **Taxa de Resposta** | > 70% | < 50% | Adicione documentos |
| **Taxa de Handoff** | 10-30% | > 50% | Aumente guardrails |
| **Satisfação** | > 4 ⭐ | < 3 ⭐ | Mude tom ou documentos |
| **Tempo Resposta** | < 2s | > 5s | Verifique performance |
| **Taxa Conversão** | > 15% | < 5% | Revise copy/tom |

---

## 🎯 Processo de Melhoria Contínua

**Semana 1:** Adicione os documentos e teste
**Semana 2:** Monitore os logs, veja o que falhou
**Semana 3:** Ajuste documentos/guardrails conforme falhas
**Semana 4:** Analise métricas e celebre vitórias

**Ciclo:**
1. Teste (executa os 10 testes)
2. Monitore (vê os logs)
3. Identifique (acha o que falhou)
4. Ajuste (muda documentos/config)
5. Reteste (valida se melhorou)
6. Volte ao passo 2

---

## 💡 Dicas de Ouro para Teste Bem-Sucedido

### 1. Teste como Cliente Real
- Não fale de forma técnica
- Use linguagem do seu cliente (natural)
- Faça pergunta como se fosse de verdade

### 2. Teste em Cenários Diferentes
- Pergunta direta: "Quanto custa?"
- Pergunta indireta: "Qual solução para problema X?"
- Objeção: "Isso é caro"
- Escalação: "Erro técnico"

### 3. Teste em Canais Diferentes (se possível)
- Chat do site
- WhatsApp
- Email
- Verificar se responde igual em todos

### 4. Teste com Usuários Reais (depois)
- Convidados internos da Altum
- Clientes beta
- Veja feedback deles

### 5. Acompanhe os Logs
- Menu IA → Logs/Performance
- Veja quais documentos a IA usou
- Veja confiança (score) de cada resposta
- Se score baixo = documento fraco ou consulta ruim

---

## 📝 Modelo de Relatório de Teste

Use esse template para documentar:

```
TESTE DE IA - DATA: __/__/____

Nome Testador: ________________

RESULTADO:
- Teste 1: ❌ (falhou porque: ________________)
- Teste 2: ✅ (respondeu bem)
- Teste 3: ⚠️ (respondeu mas incompleto)
...

TOTAL: ___/10 acertos

AÇÕES NECESSÁRIAS:
1. Adicionar documento: ______________
2. Revisar: ______________
3. Mudar ton/config: ______________

PRÓXIMO TESTE: __/__/____
```

---

## 🚀 Quando Você Está Pronto para Produção

Você está pronto para colocar a IA com clientes reais quando:

- ✅ Acertou 8+ dos 10 testes
- ✅ Documentos estão completos e corretos
- ✅ Guardrails funcionando (escalação correta)
- ✅ Satisfação do teste ≥ 4 ⭐
- ✅ Você se sente confiante
- ✅ Backup dos documentos feito (print ou export)

---

## 🆘 Precisa de Ajuda?

Se algo não funcionar:

1. **Volte ao GUIA_IA_SIMPLES.md** - Tem tudo ali
2. **Procure no DOCUMENTOS_IA_PRONTO.md** - Talvez falte um documento
3. **Peça para um colega testar** - Às vezes perspectiva diferente ajuda
4. **Chame o time técnico da Altum** - Se for bug mesmo

---

**Boa sorte com os testes! 🎉**
