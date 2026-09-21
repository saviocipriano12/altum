# Evolução da operação comercial do cliente

## Restrição de publicação

Manter as alterações locais. Apresentar o pacote ao usuário antes de push ou deploy.
Não misturar o trabalho de reuniões assistidas neste pacote.

## Implementado localmente

- Painel inicial com visão da empresa ou carteira pessoal, resultados de 30 dias, prioridades e desempenho da equipe.
- Times com identidade estável, remoção protegida, campos reais e salvamento apenas de campos editados por pessoa.
- Seleção do número para iniciar conversa e filtros de canal e responsável na inbox.
- Histórico e envio vinculados ao canal; autorização de carteira no envio.
- Respostas de detalhe e mensagens limitadas ao chat e empresa selecionados; respostas antigas descartadas.
- Falhas de atualização preservam a lista. Negativa de acesso ao detalhe ou mensagens remove a conversa da tela.
- Templates limitados ao WhatsApp oficial, com fronteira de 24 horas e tratamento de ausência de mensagem recebida.
- Verificação de empresa do canal usado para autorizar acesso pessoal.

## Validação restante

- Reproduzir com sessão local autenticada a troca rápida de conversa, falha de rede e transferência entre vendedores.
- Testar múltiplos números reais, entrada por webhook e ausência de texto, distinguindo mídia válida de evento vazio.
- Confirmar envio de texto, mídia e template em conta oficial e WhatsApp por sessão.
- Revisar celular e desktop; navegador integrado indisponível na sessão de 2026-09-16.
- Completar e validar convite, entrada e saída de pessoas, redistribuição e mudanças de acesso.
- Asaas: obter erro específico do provedor e confirmar checkout sem criar cobrança durante auditoria.
- Google Ads: confirmar configurações e verificação OAuth no provedor; o aviso de app não verificado não é resolvido pelo layout.
- MCP no ChatGPT web: validar discovery, OAuth e ferramentas no servidor publicado mediante autorização de publicação.

## Limites dos testes

Os testes de acesso exercitam regras de carteira, número pessoal, canal compartilhado e transferência.
Os testes de templates exercitam providers por sessão, API oficial e fronteira de 24 horas.
Esses testes não comprovam envio real, webhook, navegador ou comportamento de provedores externos.

## Grupos de WhatsApp

- Evolution: preserva JID completo do grupo, nome quando informado e autor de cada mensagem, incluindo participantes com LID.
- Identidade por empresa + canal + grupo, sem juntar participantes como clientes.
- Filtro Contatos/Grupos e identifica??o na lista e no cabe?alho.
- N?o cria lead ou perfil de contato, n?o dispara automa??o de lead nem enfileira IA a partir de grupo.
- Defesa adicional no agente e bloqueio de retomada/reprocessamento de IA para grupos.
- Envio manual de texto e m?dia mant?m JID completo via Evolution; canais n?o suportados rejeitam grupo e templates s?o bloqueados.
- Nomes de grupos dependem dos metadados entregues pelo provedor; sem nome usa ?Grupo do WhatsApp?.
- N?o migra hist?ricos antigos que j? foram misturados com contatos. Validar webhook e envio em grupo real ap?s corrigir o rel?gio local.
