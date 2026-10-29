# Publicação de Conversas — 20/10/2026

Publicação autorizada pelo usuário e ativada em `https://altumia.com.br` em 20/10/2026, por volta de 19h25 (Brasília).

- Versão publicada: `dpl_Ai2Ldw1KfA7n7PydByigDHNzcJLk`.
- Versão anterior para reversão: `dpl_AgbR7qzCm4nC5eBj9tVtDYxC1hbh`.
- Pacote preparado sobre a árvore exata da produção anterior, com 115 arquivos de correções e dependências. Não foi publicado o checkout compartilhado inteiro. Configuração de pacotes, páginas públicas e arquivos do admin foram preservados.
- A migração de entrega da IA existente no checkout não foi aplicada integralmente ao agente publicado. Seu contexto de funil e a proteção da etapa manual foram incorporados mantendo a arquitetura de entrega anterior. O processamento adicional de ocorrências Shopify de outra tarefa também ficou fora desta publicação.

## Conteúdo publicado

As correções de Conversas incluem campo de escrita visível, estabilidade do histórico, player de voz com ondas, abertura/ampliação de imagens, leitura de mídia autenticada, preservação do original e reprodução em MP3, entrega por bytes verificados, sincronização de mensagens próprias do WhatsApp e deduplicação, avisos por SSE autenticado, recuperação complementar de mensagens móveis com LID, nomes reais de grupos quando o provedor consegue consultá-los, contexto de stories/respostas do Instagram, devolução/transferência e cálculo de prazo.

O pacote também contém as dependências compartilhadas necessárias à integridade do envio: aceite idempotente, confirmação de entrega e recuperação de execução sem repetição automática de resultado incerto. As verificações de compatibilidade encontraram e corrigiram no pacote a normalização que ainda duplicava o marcador de áudio e duas falhas do CRM passivo: preservar decisões manuais e não interpretar texto da automação como evidência do cliente para avançar etapa. As rotas manuais mantêm autenticação/permissões e registram a propriedade dos campos atomicamente.

## Validação

- Build de produção concluído, incluindo TypeScript e 372 páginas. As candidatas com dependências incompletas não foram promovidas.
- Testes de mídia, eventos, sincronização externa, recuperação móvel, grupos, atribuição, prazo e funil executados na árvore isolada. A regressão do marcador de áudio foi corrigida e passou na nova execução.
- Suíte de compatibilidade de automações: 58 testes aprovados na execução final. Os dois defeitos do CRM observados na primeira execução foram corrigidos e a suíte inteira foi repetida com sucesso.
- Os 11 testes de recuperação após interrupção do envio passaram, incluindo mídia e perda da confirmação do provedor. As três verificações das rotas manuais autenticadas também passaram.
- Lint das adaptações e integrações principais sem erros; dois avisos anteriores do agente permanecem.
- Verificação pública de disponibilidade, cabeçalhos e recusa de acesso anônimo aprovada, incluindo webhooks com credenciais inválidas.
- Domínio confirmado na versão promovida; hashes dos 115 arquivos do pacote conferidos e 1.387 arquivos anteriores preservados exatamente, incluindo os arquivos do admin.
- Verificação autenticada na conversa existente autorizada da conta Savio Cipriano: conversa e histórico responderam 200; o áudio móvel anteriormente recuperado respondeu 200, `audio/mpeg`, 29.301 bytes; o SSE respondeu 200 e entregou `ready` e o snapshot inicial de mensagens. Nenhuma mensagem foi enviada a clientes durante a verificação.

Recibos, manifesto de arquivos e verificações ficam em `.qa-artifacts/inbox-production-20261020/` (artefatos locais ignorados pelo Git).

## Limites que permanecem

- A confirmação autenticada do SSE não mede a latência de um novo envio celular → WhatsApp → provedor → webhook → tela. Esse percurso e o uso em iPhone físico continuam exigindo validação operacional.
- A recuperação complementar consulta eventos recentes e pode levar o intervalo de 10 segundos mais a rede quando o evento principal não chega. Não representa histórico completo nem latência zero.
- Os nomes de grupos antigos da ESB ainda dependem de uma sessão conectada com acesso ao grupo. Não houve reconexão, troca de conta de envio ou criação de nomes fictícios.
- A recuperação de anexos depende da disponibilidade do arquivo original ou do cache. Não foi comprovada a restauração de todas as mídias antigas da ESB.
- Contexto antigo do Instagram sem metadados armazenados não foi reconstruído; um novo evento real do Instagram ainda precisa ser validado.
- Não houve implantação de regras de banco, migração destrutiva ou envio de mensagens de teste a destinatários reais.
