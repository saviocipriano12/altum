# Módulo 1 — Mídia de ponta a ponta

## Objetivo congelado

Fazer a Altum receber um pedido em linguagem natural no **Comando**, escolher e executar a melhor rota de mídia disponível, acompanhar o trabalho, recuperar falhas, entregar o ativo privado e permitir sua reutilização. A pessoa conversa com a Altum; não precisa navegar entre provedores, modelos, filas ou páginas técnicas.

Este módulo abrange imagem, vídeo, áudio/voz, identidade/avatar e composição de ativos. Não inclui CRM, browser, campanhas, produto digital ou novas áreas administrativas, exceto quando forem estritamente necessários para concluir este fluxo.

## Experiência final obrigatória

Uma pessoa deve poder escrever no Comando, por exemplo:

> “Crie um vídeo vertical realista de 15 segundos apresentando minha oferta, usando meu avatar.”

A Altum deve então:

1. entender briefing, formato, duração, proporção, destino e identidade;
2. criar roteiro, cenas e plano de produção quando necessário;
3. escolher automaticamente conexões e modelos capazes de executar cada etapa;
4. aceitar uma preferência explícita como “use Higgsfield”, “via Fal” ou “use o modelo Qwen”, sem perder rotas de fallback;
5. pedir confirmação no próprio chat apenas antes de gasto, treinamento de identidade, clonagem de voz, publicação ou ação externa;
6. iniciar o job real, mostrar progresso e explicar falhas em linguagem humana;
7. tentar automaticamente a próxima rota compatível para indisponibilidade, quota, timeout ou rejeição recuperável;
8. salvar imagem, vídeo ou áudio em armazenamento privado antes de links temporários expirarem;
9. devolver prévia, download, custo/rota efetivamente usada, versão e ações de revisar, reutilizar ou criar variação no chat;
10. manter a continuidade da identidade autorizada entre as peças.

## Arquitetura que será usada

O roteador não tratará uma conexão cadastrada como executor automaticamente. Uma conexão só entra na rota quando possui:

- credencial válida guardada no cofre da Altum;
- capacidade declarada (`GENERATE_IMAGE`, `GENERATE_VIDEO`, `GENERATE_AUDIO`, `GENERATE_AVATAR_VIDEO` etc.);
- adaptador oficial/contrato concreto para aquele provider e modalidade;
- estado de saúde derivado de probe seguro ou de execução real;
- modelo ou catálogo compatível;
- escopo permitido para o tenant e para a identidade usada.

O plano de cada job é persistido no momento da aprovação: rota primária, fallbacks, modelo, motivo, preferências, versão do briefing e identidade. O worker usa esse plano; mudanças posteriores nas configurações não mudam um job que já foi aprovado.

### Rotas a certificar

| Provider/bridge | Imagem | Vídeo | Áudio/voz | Avatar | Situação a validar |
| --- | --- | --- | --- | --- | --- |
| Fal | sim | sim | por endpoint oficial compatível | por workflow validado | execução real por modalidade |
| Replicate | sim | sim | se modelo contratado permitir | somente contrato específico | execução real e polling |
| Higgsfield | sim | sim | conforme API contratada | identidade/âncora | execução real e continuidade |
| LTX Cloud/local | — | sim | conforme executor | — | polling/bridge real |
| Alibaba Model Studio | Qwen | Wan | somente se API permitir | — | tarefa assíncrona e armazenamento |
| xAI | sim | sim | — | — | execução real da conta conectada |
| FreeLLMAPI | somente endpoints oficialmente expostos | não presumir | somente endpoints oficialmente expostos | não presumir | descobrir catálogo sem inventar contrato |
| NVIDIA/NIM | somente modelos realmente oferecidos pela conexão | somente contrato concreto | somente contrato concreto | — | descobrir catálogo/endpoint e certificar |
| ComfyUI, OpenMontage e executores locais | por bridge configurado | por bridge configurado | por bridge configurado | por workflow configurado | contrato do bridge e saúde local |

Provider salvo sem adaptador não desaparece nem é mentido como funcional: fica visível como “conectado, aguardando adaptador certificado” e não é escolhido pelo roteador.

## Entregas em ordem fixa

### 1. Inventário, contratos e catálogo real

- [ ] Auditar cada conexão global e por tenant sem revelar chaves.
- [ ] Descobrir modelos/capacidades quando a API permitir leitura sem custo.
- [ ] Separar “conexão salva”, “rota certificada”, “saudável” e “indisponível”.
- [ ] Eliminar qualquer payload genérico inventado para provider externo.
- [ ] Cobrir rotas certificadas com testes de contrato e payload.

### 2. Roteador de mídia único

- [ ] Um plano único para imagem, vídeo, áudio, avatar e composição.
- [ ] Critérios reais: capacidade, modelo, qualidade, custo, duração, latência, privacidade, saúde, crédito e afinidade de identidade.
- [ ] Preferência automática e escolha manual por conversa/MCP.
- [ ] Fallback com circuit breaker, cooldown, retry idempotente e registro da rota efetiva.
- [ ] Explicação humana da decisão no Comando; detalhes técnicos somente em Configurações avançadas.

### 3. Execução e worker durável

- [ ] Aprovação no chat inicia o job real imediatamente.
- [ ] Persistir `queued`, `submitted`, `running`, `completed`, `failed`, `retrying`, `cancelled` e motivo compreensível.
- [ ] Polling e recuperação a cada minuto na VPS, sem depender do navegador ou de Vercel Hobby.
- [ ] Lock contra duplicidade, timeout, retry exponencial, dead-letter e replay seguro.
- [ ] Instalar e verificar o timer `creative-media` na VPS Altum.
- [ ] Teste real de uma rota de imagem e uma de vídeo usando as credenciais conectadas.

### 4. Entrega, biblioteca e revisão

- [ ] Copiar resultado para storage privado da Altum antes de expirar.
- [ ] Prévia no chat, download seguro e link de resultado.
- [ ] Metadados: briefing, versão, provider/modelo efetivo, custo quando disponível, duração, proporção, origem e qualidade.
- [ ] Revisar, aprovar, rejeitar, duplicar, variar e reutilizar pelo chat.
- [ ] Biblioteca única pesquisável por tipo, marca, campanha, avatar, tags e data.

### 5. Imagem e composição

- [ ] Texto-para-imagem, imagem-para-imagem, edição e referências autorizadas.
- [ ] Anúncios, produto, carrossel e capa como arquivos reais, não apenas copy.
- [ ] Composição determinística para legendar, redimensionar, montar carrossel e renderizar peças previsíveis.
- [ ] QA mínimo: arquivo válido, proporção, resolução, segurança de armazenamento e revisão visual.

### 6. Vídeo completo

- [ ] Texto-para-vídeo e imagem-para-vídeo.
- [ ] Briefing para roteiro, storyboard, cenas, movimento de câmera, duração e proporção.
- [ ] Continuidade de personagem por imagens âncora/referências autorizadas.
- [ ] Legendas, cortes, trilha/narração quando contratados e composição final.
- [ ] Prévia, resultado persistido, versões e nova variação no Comando.

### 7. Áudio, voz e avatar

- [ ] Texto-para-fala por adaptador oficial certificado.
- [ ] Transcrição/legendas com timestamps quando o executor contratado suportar.
- [ ] Voz clonada somente mediante referência, consentimento explícito, escopo e revogação.
- [ ] Avatar de pessoa ou personagem com identidade visual persistente.
- [ ] Vídeo falado exige roteiro, voz autorizada, lip-sync e aviso de mídia sintética quando aplicável.
- [ ] Não alegar HeyGen-like como pronto até existir geração real validada.

### 8. ChatGPT via MCP

- [ ] MCP deve listar apenas capacidades de mídia realmente disponíveis.
- [ ] Criar, preparar, autorizar, iniciar, acompanhar, baixar e revisar mídia pela Altum.
- [ ] Expor escolha manual de provider/modelo somente quando autorizado e certificado.
- [ ] Nunca expor credenciais, referências privadas ou ativos de outro tenant.
- [ ] Teste OAuth de acesso completo e teste de render pelo MCP.

## Critério de conclusão do módulo

O módulo só será considerado concluído quando os cenários abaixo forem comprovados com providers reais, não apenas com testes unitários:

1. **Imagem:** pedido no Comando → aprovação → geração real → asset privado → prévia/revisão/download.
2. **Vídeo:** pedido no Comando → aprovação → job assíncrono → worker VPS recupera → vídeo privado reproduzível no chat.
3. **Fallback:** primeira rota falha de modo controlado e a segunda conclui; o histórico mostra a rota efetivamente usada.
4. **Manual:** pedido “usar [provider]” usa a rota certificada solicitada e mantém fallback.
5. **Identidade:** avatar/personagem autorizado mantém a referência visual em uma peça real; voz só entra após consentimento próprio.
6. **MCP:** ChatGPT cria e acompanha pelo menos um render real com o escopo correto.
7. **Resiliência:** fechar o navegador não perde o job; reiniciar worker não duplica gasto nem perde resultado.
8. **UX:** nenhuma dessas tarefas exige ir a uma tela técnica; Configurações servem somente para conectar/administrar providers.

Enquanto qualquer cenário acima não tiver evidência real, o Módulo 1 continua aberto. Nenhum novo módulo será iniciado.
