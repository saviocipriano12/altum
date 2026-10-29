# Controle humano das informações comerciais

## Comportamento implementado

Na ficha do cliente, a revisão permite corrigir interesse, necessidade, objetivo,
orçamento, urgência, prazo, decisor e objeção. Uma correção, inclusive deixar o
valor vazio, protege esse campo contra substituição automática.

Para um campo protegido, a opção `Permitir atualização pela IA` libera futuras
atualizações quando a revisão é salva. Selecionar a opção não altera dados no
servidor. Não é permitido corrigir e liberar o mesmo campo no mesmo salvamento.
Outros campos corrigidos e liberações podem ser salvos juntos, atomicamente.

A liberação preserva o valor e a autoria humana. Não executa o modelo, não envia
mensagens e não reaproveita uma análise antiga como novo fato. O próximo valor
precisa de uma mensagem do cliente armazenada depois da liberação, com fonte
conferida pelo observador. Reprocessar ou editar uma mensagem já existente não
contorna esse limite. Até chegar essa informação, o valor continua identificado
como registrado pela equipe. Uma nova correção humana volta a proteger o campo.

## Contrato e proteção

- GET da revisão retorna `revision`, `fields` e `manualFields` (campos atualmente
  protegidos). A origem do valor continua em `aiFieldEvidence`.
- PATCH mantém o contrato de correções e aceita `releaseFields`, lista opcional
  dos oito campos conhecidos. Campos repetidos, arbitrários, corpo malformado e
  autoria fornecida pelo cliente são rejeitados.
- Exige usuário autenticado, módulo CRM, capacidade de edição, vínculo ativo e
  acesso atual à carteira dentro da transação. Revisão desatualizada retorna 409.
- A liberação mantém `source: manual`, valor, autor e data originais, acrescentando
  `automaticUpdates`, `automaticAfter` com horário de commit do Firestore e autor
  da liberação. O evento de revisão registra os campos liberados e sua autoria.
- O observador compara a criação real da mensagem, com nanossegundos, ao limite
  da liberação. Depois de preencher um novo fato, preserva esse limite na evidência.
  Assim, uma leitura posterior de fonte anterior também não pode restaurar valor
  antigo. Horário informado no texto ou `createdAt` da mensagem não autoriza a troca.
- O escritor baseado na memória do agente não tem essa prova de ocorrência;
  permanece impedido de substituir campos liberados. O observador com evidência
  continua responsável por essas atualizações. Não liberar esse escritor sem
  adicionar a mesma prova e os testes correspondentes.
- Repetir a mesma revisão já salva retorna conflito; não duplica o evento nem
  desloca o limite. Reabrir permite conferir o estado atual.

## Aceite e limites

Há testes com autenticação e banco locais para correção, liberação, preservação
da origem humana, mensagem histórica, mensagem nova, nova correção, revisão
obsoleta, repetição, corpo inválido e perda de acesso. Testes puros cobrem a
comparação exata e limites inválidos. Evidências da rodada ficam no registro
da missão; resultados ainda devem ser conferidos antes de declarar aprovação.

Não comprova recebimento por canais reais, qualidade de extração por modelos
reais ou experiência visual. A aceitação manual da ficha, inclusive teclado e
celular, continua pendente. Não envolve etapas, pagamentos, identidade, alteração
de regras em produção ou migração de dados reais.

Reversão: retirar a opção na interface e manter o escritor automático bloqueando
esses campos; não remover as evidências ou os eventos de revisão existentes.
