# ALTUM — Direção Visual v1

Data: 2026-09-08
Base de referência: Refero Styles + produto real ALTUM

## Objetivo visual
A ALTUM precisa parecer software operacional sério, não landing page genérica de IA, agência de tráfego ou infoproduto high-ticket.

A interface pública deve comunicar:
- precisão;
- operação em tempo real;
- profundidade de produto;
- confiança;
- tecnologia aplicada a vendas;
- simplicidade apesar da quantidade de módulos.

## Referências escolhidas
### Linear — precisão e produto como textura
Usar como referência para:
- superfícies escuras ou quase pretas;
- bordas finas;
- baixa dependência de sombras;
- tipografia de peso moderado;
- UI real como principal elemento visual;
- sensação de software de alta precisão.

Não copiar:
- acid lime;
- excesso de estética developer;
- densidade muito compacta para a landing pública.

### Intercom — narrativa editorial e legibilidade
Usar como referência para:
- áreas claras/off-white;
- grandes títulos com peso menos agressivo;
- muita respiração entre seções;
- contraste entre seção editorial e produto;
- labels discretos;
- hierarquia comercial clara.

Não copiar:
- violeta da marca;
- estética excessivamente editorial em telas de produto.

### Refero/Home style — monocromia com um único acento
Usar como referência para:
- uma cor de assinatura usada com disciplina;
- cards mais amplos e suaves;
- canvas quente/claro;
- headings fortes sem depender de bold extremo.

### Relate / SaaS CRM references
Usar como referência para:
- screenshots e mockups de pipeline;
- duas camadas de raio: container externo maior, UI interna menor;
- módulos comerciais em cards funcionais;
- estados, tags e indicadores com cor controlada.

## Identidade ALTUM proposta
### Paleta
- Fundo escuro principal: carvão/quase preto, não preto absoluto em todas as áreas.
- Fundo claro: branco quente/off-white.
- Texto escuro: grafite profundo.
- Texto secundário: cinza neutro de alto contraste.
- Acento de marca: laranja ALTUM.

Regra: laranja é sinal, não decoração. Usar para CTA principal, estados ativos, pequenos destaques, conexões de fluxo e indicadores importantes.

Evitar:
- gradientes roxo/azul genéricos de IA;
- glow excessivo;
- vários acentos cromáticos competindo;
- cards com sombras pesadas;
- glassmorphism em todo lugar.

## Tipografia
Direção:
- sans moderna e neutra;
- headings 500–600 na maior parte do site;
- evitar 800/900 como padrão;
- tracking levemente negativo em títulos grandes;
- body 16–18px com line-height confortável;
- labels 12–13px com leve tracking positivo quando fizer sentido.

A home atual usa peso visual excessivo em alguns títulos. A nova versão deve transmitir confiança por escala, espaço e composição, não apenas por negrito.

## Forma
- botões: 6–10px de raio, não pills em tudo;
- cards externos de produto: 16–24px;
- elementos internos da UI: 6–12px;
- badges: 4–8px ou pill apenas quando semanticamente adequado;
- bordas finas e discretas;
- sombras mínimas.

## Movimento
Motion deve explicar o sistema.

Usar:
- entrada suave de painéis;
- conexão animada entre canais e módulos;
- mudança de etapa no pipeline;
- chegada de mensagem -> extração IA -> atualização CRM;
- microinterações de hover;
- pequenas mudanças de estado.

Evitar:
- animação gratuita;
- parallax forte;
- elementos flutuando sem função;
- texto aparecendo palavra por palavra em excesso;
- loops que prejudiquem performance.

## Arquitetura visual da nova home
### 1. Header
Logo ALTUM
Produto
Soluções
Segmentos
Integrações
Conteúdo
Preços (quando pronto)
Entrar
CTA principal

Mega-menu de Produto deve destacar módulos reais.

### 2. Hero
Mensagem curta e categoria clara.
Produto real domina a composição.

Estrutura sugerida:
Eyebrow: Plataforma de vendas e relacionamento com IA
H1: Sua operação comercial inteira, conectada.
Sub: A ALTUM conecta atendimento, CRM, IA, pipeline, automações e follow-up para transformar conversas em vendas sem perder contexto pelo caminho.
CTA primário: Conhecer a plataforma
CTA secundário: Ver como funciona

Visual: composição com Inbox + ficha do lead + pipeline, usando UI real ou reconstrução fiel do produto.

### 3. Fluxo operacional
Título conceitual: Uma conversa entra. A ALTUM continua o trabalho.

Fluxo visual:
WhatsApp / Instagram / Site -> Inbox -> IA -> CRM -> Pipeline -> Automação/Follow-up -> Agenda/Humano -> Venda -> Métricas

O usuário deve entender o produto sem ler um parágrafo longo.

### 4. Módulos principais
Grid editorial / bento, mas com telas reais.

Destaques:
- Inbox
- IA
- CRM
- Pipeline
- Automações
- Follow-up

Módulos secundários:
- Captação
- Campanhas
- Agenda
- Métricas
- Base de conhecimento

### 5. IA em ação
Mostrar eventos, não promessas abstratas:
- identificou intenção;
- extraiu orçamento;
- classificou lead;
- atualizou etapa;
- agendou tarefa;
- enviou follow-up;
- realizou handoff.

### 6. Centralização
Canais e fontes convergindo para a ALTUM.
Somente canais validados devem aparecer como disponíveis.

### 7. Casos de uso
E-commerce
Serviços B2B
Clínicas
Lojas físicas
Educação

Cada card explica uma jornada específica, não apenas troca de nome do nicho.

### 8. Métricas
Usar UI real para demonstrar:
- conversão;
- tempo de resposta;
- pipeline;
- receita;
- canais;
- decisões da IA;
- SLA.

Não mostrar números fictícios como prova social.

### 9. Integrações
Logos e conexões somente depois de validação técnica.
Status pode ser:
- disponível;
- beta;
- em breve.
Nunca misturar os três.

### 10. Prova
Cases reais e depoimentos quando disponíveis.
Até lá, privilegiar demonstração de produto em vez de inventar números.

### 11. CTA final
Foco em experimentar/conhecer plataforma, não em “análise de viabilidade high-ticket”.

## Regra de ouro
A cada seção, perguntar:
“Isso mostra que a ALTUM é um produto operacional conectado ou faz parecer que somos uma agência/chatbot?”

Se parecer agência/chatbot, redesenhar.

## Design system a criar no código
Próximos artefatos:
- tokens de cor;
- escala tipográfica;
- grid e max-width;
- spacing scale;
- radius scale;
- buttons;
- cards;
- badges;
- product-frame;
- section-heading;
- tab navigation;
- logo strip;
- metric cards;
- flow connector;
- animation durations/easing;
- regras responsive.

## Performance
O design não pode sacrificar SEO/Core Web Vitals.
- evitar vídeo pesado acima da dobra;
- screenshots otimizadas;
- motion preferencialmente CSS/Framer com transform/opacity;
- lazy load abaixo da dobra;
- respeitar prefers-reduced-motion;
- evitar blur gigante animado;
- manter JS do marketing site sob controle.
