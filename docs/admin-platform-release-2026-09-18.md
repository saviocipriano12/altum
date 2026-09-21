# Evolução administrativa da Altum — 18/09/2026

Implementação local autorizada após a auditoria de 17/09. Não houve publicação, migração de dados, emissão de cobrança ou aplicação de campanha real. Este documento complementa a auditoria; o estado nela descrito é anterior a esta implementação.

## Operação entregue no código

| Área | Comportamento |
|---|---|
| `/admin/operacao` | Carteira priorizada por conexão, contrato, implantação, financeiro e alertas de IA, com ação de destino e cobertura de fontes. Custos de IA aparecem em USD; ausência de fonte não vira custo zero. |
| `/admin/clientes` | Empresas comerciais e SaaS aparecem juntas, preservando URLs comerciais. Vínculos ambíguos não escolhem uma empresa silenciosamente. Projetos, propostas e contas aceitam a identidade resolvida. |
| `/admin/midia` | Contas, campanhas, recomendações, tracking e pixels por empresa. Conexão/reconexão Meta/Google e seleção de conta retornam ao admin usando os endpoints OAuth existentes. Filtros e seleção de até vinte alvos; atualização de relatórios em janelas de 7/14/30 dias; resultados e histórico por alvo. |
| Recomendações | Pausa e alteração de orçamento viram rascunhos. Aprovação e aplicação são etapas explícitas. Alteração de orçamento exige valor diário observado, moeda e limite de 25%, além da revalidação do operador existente. |
| Pixels | Cadastro interno separado de descoberta no provedor. Meta consulta pixels acessíveis; Google consulta ações de conversão. Acesso ao ativo não comprova entrega de eventos. |
| `/admin/estrategias` | Hipóteses por empresa, baseline capturado no servidor, sugestões assistidas por IA e medição posterior. Moedas diferentes, janelas sobrepostas ou amostras insuficientes produzem resultado inconclusivo. |
| `/admin/mcp` | Política administrativa desligada por padrão, conexões com empresas/escopos escolhidos, expiração e revogação. ChatGPT pode consultar e preparar rascunhos dentro das autorizações vigentes. |

Leitura de carteira, mídia e IA tolera falha de fontes independentes e informa cobertura parcial e limites de consulta. Métricas ausentes não viram zero. Inventários usam projeções explícitas e não devolvem credenciais de integrações.

## Funcionalidades existentes recuperadas ou protegidas

- Templates de WhatsApp voltaram a ter POST para o inicializador existente, com falhas parciais apresentadas na tela.
- APIs administrativas de contratos, financeiro e equipe aceitam o perfil administrativo normalizado. Um administrador da agência não pode alterar/promover um owner.
- Agentes não alteram configurações estruturais nem convidam usuários de empresas pelo endpoint administrativo.
- Empresas SaaS sem cadastro comercial são administradas somente por perfis administrativos Altum; o acesso geral de agência não concede a agentes permissão para criar projetos/propostas/contas em qualquer workspace.
- Conversão de lead, mensalidades e lançamento financeiro de proposta têm identidade estável e proteção contra repetição. Proposta precisa estar aprovada e manter o valor aprovado.
- Exclusão de empresa com histórico/dependências retorna conflito e preserva o registro.
- Convite de colaborador informa `manual_link`, data de geração e `inviteSentAt: null`. Gerar link não é enviar e-mail; a integração de entrega administrativa ainda é pendente.
- Campanhas dos relatórios Meta/Google podem ser resolvidas para rascunhos mesmo sem snapshots legados. A adaptação usa somente identidade, sem transformar métricas de período em métricas diárias.
- Relatório sincronizado e `lastSyncAt` são publicados juntos, somente se a conexão continuar igual durante a consulta.
- Rascunhos encerrados/em execução não voltam a aprovados. Falha de aplicação no provedor exige conferir o resultado antes de criar nova tentativa.
- Aprovação/aplicação em lote exige uma prévia completa: campos desconhecidos ou truncados exigem revisão na área da empresa.

`stage` é diagnóstico de maturidade digital na prospecção; `pipelineStage` é etapa comercial. Foram preservados como conceitos diferentes.

## Contrato do MCP administrativo

Endpoint remoto: `https://SEU_DOMINIO/api/mcp/admin`.

- Issuer OAuth separado: `/api/admin/mcp`.
- Descoberta: `/.well-known/oauth-authorization-server/api/admin/mcp` e `/.well-known/oauth-protected-resource/api/mcp/admin`.
- Autorização: `/api/admin/mcp/authorize`; token: `/api/admin/mcp/token`; consentimento: `/admin/mcp/autorizar`.
- Integração inicial é ChatGPT com Client ID Metadata Document e PKCE S256, autenticação de cliente `none`. Não é um registro aberto para clientes OAuth arbitrários.
- Metadata e callbacks aceitam somente endereços específicos do ChatGPT, sem buscar URLs arbitrárias nem seguir redirecionamentos.
- Tokens são opacos, armazenados por hash e vinculados ao recurso administrativo. Código e refresh são consumidos/rotacionados em transação; refresh não amplia escopos.
- Consentimento seleciona de uma a vinte empresas e exige `context:read`; demais permissões precisam de seleção explícita. Acesso offline tem validade máxima de sessenta dias; access token dura no máximo uma hora.
- Perfil, política, expiração, revogação, escopos e módulos são revalidados. Token do MCP do cliente não serve para o MCP administrativo.
- Rascunhos obedecem também à política MCP e aos módulos de cada empresa. Autorizar a carteira administrativa não contorna esses limites.
- Memória de estratégias é isolada por empresa e requer `marketing:read`. Não há treinamento automático de modelo nem compartilhamento de dados entre clientes.
- Limites compartilhados por usuário: sessenta requisições MCP por minuto e dez solicitações de sugestões IA por cinco minutos. Headers de IP fornecidos pelo chamador não mudam esse orçamento.
- O retorno ao consentimento é preservado após login; o destino aceito é uma rota interna específica, evitando redirecionamento aberto.

Configurar `ALTUM_PUBLIC_URL` com a origem pública HTTPS e `MCP_CONTEXT_SECRET` com pelo menos 32 caracteres. A política em `platform_settings/admin_mcp` é habilitada pelo administrador pela tela; não foi habilitada por esta implementação. Sugestões IA dependem de `OPENAI_API_KEY` e do modelo de análise já configurado no projeto.

Referências usadas: [autenticação de conectores do ChatGPT](https://developers.openai.com/plugins/build/auth), [autorização MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) e [ações de conversão Google Ads](https://developers.google.com/google-ads/api/fields/v22/conversion_action).

## Limites e próximas entregas

1. A sessão local persistida no Chrome permitiu conferir como owner as telas Carteira, Mídia, Estratégias e MCP, com dados reais de leitura e navegação. Completar a homologação dos fluxos de escrita e dos demais perfis em duas empresas de teste.
2. A leitura autenticada mostrou três canais Meta com `reauth_required` e nenhum relatório de campanhas. Reautorizar no provedor para validar leitura efetiva de contas/pixels. Somente contas em `tenant_channels` com integração efetiva participam da sincronização; `ad_accounts` legados continuam inventário, sem credenciais importadas automaticamente. A interface bloqueia sincronização de canais inativos ou com reconexão pendente.
3. Completar orçamento diário Meta no relatório antes de oferecer a alteração por essa seleção. Dados ausentes bloqueiam a recomendação.
4. Lotes interrompidos permanecem observáveis no histórico; não há retomada automática de uma escrita cujo resultado seja desconhecido. Confirmar o estado no provedor antes de repetir.
5. Completar ficha 360, tarefas com responsável/prazo, rentabilidade incluindo todos os custos e segmentação de carteira para parceiros. A primeira versão é exclusiva dos administradores Altum.
6. TikTok/LinkedIn não receberam operadores reais nesta entrega. Convite por e-mail, diagnóstico ativo de todas as integrações e benchmarks agregados continuam entregas próprias.
7. Consultas administrativas têm limites e avisos de cobertura; não constituem totais ilimitados ou paginação completa de uma carteira acima desses limites.
8. Reconciliar registros legados ambíguos e estabelecer migração revisada. Nenhuma reconciliação destrutiva foi aplicada silenciosamente.

## Verificação

- Testes administrativos e OAuth: 22 aprovados.
- MCP e conectores AdPort: 39 aprovados.
- Anúncios e tracking: 14 aprovados.
- Operação, observabilidade, agendamento outbound, prontidão operacional e segurança de autosserviço: 50 aprovados.
- Total desta rodada: 125 testes aprovados. São testes locais com fixtures/mocks e não comprovam acesso a contas reais.
- TypeScript: verificação independente aprovada; a etapa TypeScript do build completo também passou. Evitar executar geração de tipos em paralelo com um novo build, que recria `.next/types`.
- ESLint: zero erros; warnings legados fora desta entrega. O warning de expressão introduzido na revisão de rascunhos foi corrigido.
- Build de produção completo aprovado, incluindo checagem TypeScript e geração de 332 páginas; aprovado novamente após o acréscimo da reconexão na central.
- Prontidão SaaS local reprovada por ausência de `RESEND_API_KEY` e `ASAAS_WEBHOOK_TOKEN`; valores secretos não foram exibidos.
- `node --conditions=react-server --import tsx scripts/verify-admin-boundaries.mts`: seis handlers reais recusaram acesso anônimo com 401; token recusou recurso inválido com 400; descoberta OAuth validou issuer, CIMD e S256.
- Leitura autenticada confirmou 11 empresas na carteira, inventário de mídia e formulário de pixels, estados vazios de campanhas/estratégias e política MCP desabilitada sem conexões. Nenhuma escrita foi executada pelo teste visual.
- Na versão final, a central carregou sem alertas, mostrou o formulário de conexão e bloqueou os três seletores de canais com reconexão pendente. O filtro de empresa foi exercitado. Captura de screenshot pelo CDP expirou; a verificação usou DOM e navegação autenticada.
- Smoke HTTP no servidor de produção local: cinco endpoints administrativos/MCP retornaram 401 sem credencial, e os dois documentos de descoberta retornaram 200.
- Recebimento real de eventos, reautorização efetiva no provedor, conexão efetiva pelo ChatGPT e aplicação real de campanhas continuam pendentes de homologação.
