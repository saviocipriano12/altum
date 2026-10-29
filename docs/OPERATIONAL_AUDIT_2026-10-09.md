# Auditoria operacional — 9 de outubro de 2026

Esta auditoria usa evidência de execução e do banco de produção. Tela, coleção,
rota ou teste isolado **não** contam como capacidade entregue.

## Resultado objetivo

| Capacidade | Estado | Evidência | Próxima ação obrigatória |
| --- | --- | --- | --- |
| Chat / texto | operacional | Pedido real retornou `ALTUM_OK` via Groq (`allam-2-7b`). OpenRouter também tem catálogo descoberto. | Registrar latência/custo por rota e adicionar teste de fallback real controlado. |
| Roteamento de texto | parcial, agora funcional | O runtime passou a percorrer FreeLLMAPI saudável e conexões OpenAI-compatíveis saudáveis, em vez de depender de uma única conexão. | Homologar pelo Comando publicado e mostrar somente um resumo humano da rota. |
| FreeLLMAPI | não operacional em produção | As conexões apontavam para `127.0.0.1:31415`, endereço que a aplicação publicada não alcança. | Subir sidecar na VPS, configurar chaves upstream nele e publicar por HTTPS privado/autenticado. |
| Imagem / vídeo / avatar | indisponível | Não existe ativo entregue. Os quatro jobs em `creative_jobs` falharam; o mais recente falhou em fal, Higgsfield e Replicate por falta de crédito. | Disponibilizar pelo menos um executor com saldo e contrato validado antes de reabrir geração no chat. |
| fal | indisponível | Provider retornou saldo esgotado. | Adicionar crédito e fazer um job de imagem de homologação. |
| Higgsfield | indisponível | Provider retornou `not_enough_credits`. | Adicionar crédito e implementar/validar endpoint específico antes de prometer avatar/vídeo. |
| Replicate | indisponível | Provider recusou execução por saldo insuficiente. | Adicionar crédito e homologar um modelo real por modalidade. |
| LTX Cloud | indisponível | Conexão não possui adaptador Altum validado; jobs não são aceitos. | Implementar contrato oficial de criação, polling e download do LTX, depois homologar. |
| NVIDIA NIM | indisponível | Probe OpenAI-compatible recebeu HTTP 404. | Corrigir endpoint/modelo usando catálogo oficial e executar probe sem custo. |
| Worker de mídia | parcial | Existem jobs, mas sem artefatos e o cron de recuperação não atende uma experiência interativa. | Rodar worker contínuo na VPS; cron fica apenas como recuperação. |
| Biblioteca de mídia | indisponível para resultado real | `platform_creative_assets` está vazio. | Validar upload privado de um render concluído e exibir na conversa/biblioteca. |
| Missões | parcial | Há duas missões antigas marcadas como `running` sem avanço e uma falha recente. | Criar watchdog que marque jobs abandonados como falhos/retomáveis com motivo. |
| MCP/OAuth | não homologado ponta a ponta | A autorização anterior apresentou erro de quota do Firestore; o fluxo ainda precisa ser testado pelo ChatGPT depois de publicação. | Testar OAuth, descoberta de ferramentas e uma chamada de leitura + uma criação de rascunho pelo ChatGPT. |

## Correções aplicadas nesta auditoria

1. Falhas de execução agora atualizam o `status` da conexão para `degraded`, não
   apenas um campo técnico de health. A rota deixa de ser apresentada como
   disponível.
2. O caminho de render usado pelo MCP agora persiste todas as tentativas de
   fallback, assim como o worker interno.
3. O roteador de texto passa a usar Groq, OpenRouter e demais conexões
   OpenAI-compatíveis saudáveis cadastradas no cofre.
4. Todas as conexões conhecidamente bloqueadas foram marcadas como degradadas
   no banco: FreeLLMAPI local, fal, Higgsfield, Replicate, NVIDIA NIM e LTX
   Cloud. Isso evita repetir uma promessa falsa ao usuário.
5. A documentação foi corrigida: a versão adotada do FreeLLMAPI não gera
   imagens, áudio ou vídeo; ela oferece chat, tools, visão de entrada e
   embeddings.

## Ordem de recuperação, sem criar novas telas

1. **Texto publicado:** homologar Comando com Groq/OpenRouter e evidência por
   conversa.
2. **Um render vertical completo:** escolher um provider com saldo, implementar
   seu adaptador oficial, gerar imagem ou vídeo, persistir o arquivo e devolver
   o ativo no chat.
3. **Fila contínua:** instalar worker na VPS para polling, retry e retomada de
   jobs; deixar o cron apenas como rede de segurança.
4. **MCP ponta a ponta:** corrigir qualquer bloqueio de OAuth/Firestore,
   conectar no ChatGPT e testar leitura, rascunho e render aprovado.
5. **Só depois:** avatar, campanha, biblioteca avançada, browser e demais
   capacidades.

Nenhuma funcionalidade dessa lista sobe para “operacional” sem uma nova
evidência guardada no banco: entrada, provider/modelo interno, job, arquivo
persistido e resultado acessível na conversa.
