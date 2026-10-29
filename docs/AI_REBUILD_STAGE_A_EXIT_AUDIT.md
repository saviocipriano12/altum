# Saída A — diagnóstico e contratos, não aprovação do atendimento

19/10/2026, após conferência de produção/configuração e decisão do usuário.
**A encerrada para iniciar implementação local B. B permanece aberta.**
Marco integrado, qualidade, publicação e piloto NÃO aprovados.

## Decisão e correção da divisão das fases

Critério original, seção 10 do plano: inventário produção/local, capacidades por
tenant de teste, cenários e base técnica; falhas prioritárias reproduzíveis,
escopo fechado, dados de teste e custos definidos. O registro derivado passou a
listar execução integral dos 104 cenários como pré-requisito de A, antes de existir
o substituto. Perguntado explicitamente sobre corrigir essa divisão sem retirar
qualquer teste/meta/revisão/piloto, usuário respondeu: **“faça o melhor caminho que
voce encontrar”**. Esta decisão não é aprovação tácita nem redução de qualidade.

A termina com diagnóstico e contratos verificáveis. Implementação e provas de
cada capacidade continuam em B/C/D/E; F exige bateria completa, repetições,
segurança, qualidade e revisão humana. G exige piloto/publicação autorizados.
Falha em B impede C. Nenhuma jornada reprovada recebe aprovação para fechar A.

## Auditoria dos requisitos de A

| Requisito | Evidência inspecionada / decisão | Resultado para A |
| --- | --- | --- |
| Produção versus local | Consulta somente leitura confirmou `dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh`; manifesto de 1.427 fontes e quatro fontes críticas baixadas em `.qa-artifacts/client-conversation-release-1792453253671` | Inventário registrado; não alegar checkout publicado |
| Capacidades por negócio/canal/conector/ação | `AI_REBUILD_SHOPIFY_CAPABILITY_MANIFEST.md`, C01–C21; C06/C08 adiadas por decisão Shopify | Contratos registrados; nenhuma capacidade aprovada por existência |
| Falhas prioritárias reproduzíveis | KB omitida/cortada; afirmação/link; confirmação, preço, publicação e correção/retomada em quatro processos. Artefatos e comandos no progresso | Baseline reproduzido, com reprovações preservadas |
| Cenários e dados corretos de referência | 104 especificações, 74 desenvolvimento/30 reservadas; fixture A/B, catálogo/política sintéticos; hash f5c20462921a28b86abf392892621b1297ef88d2de0f44c0a6a74f7c3bed9ae5 | Preparação registrada; quatro adaptadores parciais, demais setups/oráculos pendentes para implementação/aceite |
| Base técnica | Executor TypeScript único, Firestore/outbox existentes; sem segunda plataforma/emissor; consumidores mapeados em decisões A | Decisão fechada; consolidação precisa implementação e testes |
| Custo/modelo de desenvolvimento | Mini fixado para lote fictício; autorização US$ 3 acumulados, reserva durável, duas chamadas e US$ 0,002858 calculados; bateria integral sem autorização | Contrato do lote definido; não autoriza novo teto nem outro modelo |
| Empresa, fonte e responsável reais | LF escolhida; usuário assumiu regras/revisão; inspeção projetada de metadados confirma conexão/tenant exatos | Identificados; conteúdo/regras ainda exigem revisão antes do uso real |
| Permissões, retenção e custo operacional | Implementação/testes sintéticos permitidos. Novo uso real de observação/aprendizado/avaliação proibido até escopo/retencão/regras aprovados. Nenhum novo gasto operacional autorizado por esta missão | Decisão de negação explícita para uso afetado, não permissão inferida de configuração existente |
| Ação/CRM/funil e SLO/piloto/rollback | Contratos do manifesto e seções 19–22: evidência por campo, proteção manual, IDs dinâmicos do tenant, revalidação pré-efeito, incerteza sem retry cego; limites e gates preservados | Contratos definidos; comportamento só aprovado na fase pertinente |

## O que a inspeção real prova — e o que não prova

`lf-scope-metadata-1792453481415.json`: consulta server-side com campos projetados,
sem mensagens, leads, pedidos, conteúdo da KB ou credenciais de canais/Shopify.
Confirma tenant/conexão LF esperados, uma Shopify marcada ativa, um WhatsApp marcado
ativo e teste exclusivo estrutural para uma conversa. Não testa token, entrega,
elegibilidade da conversa nem autoriza ampliar a trava. Instagram/Messenger não
estão cadastrados neste tenant: continuam no manifesto, com contrato real pendente.

107 documentos: 102 catálogo, três políticas e duas FAQ; presença não prova
conteúdo correto, vigência ou recuperação. Nenhum documento lido nesta inspeção.
Não há documento de funil direto/consultável por tenant encontrado: consumidor
`loadTenantPipelineConfig` usa fallback de perfil empresarial nesse caso; não
concluir “não existe funil”. Perfil explícito não veio na projeção; mapear/default
e validação comercial permanecem requisitos de C/E, sem impor etapas genéricas.

Orçamento operacional já preenchido na LF não é autorização nova de gasto.
Piloto legado habilitado com expiração presente não prova validade atual nem
autoriza este pacote. Não foram alterados ativação, pausa, canais, IA, dados ou trava.

Fontes normalizadas: router, conversation-policy e conversation-context coincidem
com a produção inspecionada; agent diverge (98 inserções/208 remoções no diff),
incluindo migrações locais para entrega durável. Não publicar o checkout inteiro;
o inventário de pacote/compatibilidade deve ser atualizado em F/G, inclusive
conectores e alterações de outros trabalhos. Estado observado não garante estado
futuro: reconferir antes de operar/publicar.

## Critérios que NÃO mudaram

- 104 cenários atuais, pelo menos 30 reservados; pelo menos três repetições,
  cinco para críticos (514 planejadas na classificação atual, ainda por revisar).
- Todas as capacidades aplicáveis e canais anunciados precisam testes positivos,
  negativos e recuperação; indisponível não desaparece do denominador.
- Metas finais: 95% tarefa, 98% fatos, 95% sem repetição desnecessária; revisão
  humana média 4,3/5 e 95% >=4/5; nenhuma violação crítica observada.
- Modelo real, trajetórias completas, fontes/efeitos, segurança, custo/latência,
  carga, restart, falhas, interfaces e rollback antes de aprovação integrada.
- Piloto proposto sete dias/50 conversas elegíveis e aceite humano; sem envio
  incidental, compras, estoque, pagamentos/reembolsos ou deploy sem autorização.

## Primeira unidade B

Fechar lacuna de `send_message` imediato/waiting_for_reply que ainda chama envio
direto, mantendo outbox/recibos comuns e identidade estável por evento/ação. Começar
pela espera identificada por conversa/timestamp persistido do cliente/ação; propagar
identificadores autenticados nos demais produtores sem
fabricar ID aleatório de retry nem deduplicar execuções legítimas pelo lead/texto.
Gate 2 antigo permanece ABERTO e integra B; esta decisão não o aprova.
