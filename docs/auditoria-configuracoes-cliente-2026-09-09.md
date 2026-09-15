# Auditoria das configurações do cliente — 09/09/2026

## Conclusão e alcance

A estrutura de configurações tem telas, APIs e persistência reais, mas o ciclo de cadastro e gestão de vendedores ainda apresenta falhas que impedem considerá-lo pronto para uso confiável. As prioridades são preservar dados da empresa, isolar alterações de membros por empresa e substituir o mecanismo de convite.

Esta é uma auditoria estática do repositório, acompanhada das verificações locais indicadas ao final. Não foram criados usuários reais, enviados convites, alteradas assinaturas ou testadas credenciais de integrações em produção. Existência de código não comprova funcionamento ponta a ponta. As áreas externas ao núcleo de usuários/times tiveram avaliação de estrutura e contratos; não uma certificação de cada funcionalidade.

## Inventário

| Configuração | Implementação encontrada | Avaliação / próximo passo |
| --- | --- | --- |
| Empresa | Dados comerciais, contato, endereço, perfil de negócio, fuso e horário via `settings` | Persistência existe; corrigir imediatamente o salvamento parcial descrito em P0-1. Validar fuso, horários e campos de contato. |
| Resumo diário | Destinatário, ativação, horário e template em `dailyReport` | Há configuração persistida. Validar agendamento e entrega real; o parser de horário aceita formato HH:mm sem validar seus limites. |
| Usuários e permissões | Listagem, criação de conta/vínculo, perfil, bloqueio, canais, disponibilidade, capacidade | Fluxo real, mas com falhas críticas de convite, isolamento e permissões. |
| Times | Lista de times, identificador, nome, descrição, canais e time padrão | Salva estrutura, mas usuários usam texto livre e o distribuidor automático não aplica essa estrutura. |
| Operação de atendimento | SLA, rodízio, menor carga, distribuição automática, prioridade, disponibilidade e canais | Execução parcial: distribuição existe; horário comercial e time padrão não são consumidos pelo distribuidor. |
| Canais | WhatsApp, Instagram, Messenger e mídia; conexão, saúde e sincronização | Rotas reais e proteção de escrita por `manage_channels`. Validar cada provedor em ambiente de teste, incluindo envio e recebimento. |
| Integrações de loja | Conexões, credenciais, OAuth, webhooks, sincronização e automações | Shopify, Nuvemshop e WooCommerce têm adaptadores. VTEX, Tray e Loja Integrada são conectores por webhook, sem sincronização por API. Há divergência de permissão entre interface e API. |
| Respostas automáticas sociais | DMs, comentários, seguidores, palavras de saída e horários | Configuração e serviço existem, com permissões no servidor. Entrega depende do evento/provedor; testes locais não comprovam entrega real. |
| Assistente Altum | Configuração por `settings/ai` e tela própria | Escrita exige `manage_ai`; leitura aceita visualizador. Revisar quais informações técnicas devem chegar a cada perfil. |
| Base de conhecimento e Produtos & Serviços | Acessos próprios pela central de configurações | Mapeados como áreas relacionadas. Importação, busca da IA e ciclo de produto exigem testes específicos adicionais. |
| Notificações | Permissão do navegador, inscrição push e teste por usuário | Rotas existem. Validar inscrição após conceder permissão, navegador móvel, serviço push e troca de empresa. |
| Faturamento | Reutiliza a tela de assinatura, consulta e alteração via Asaas | Há restrição de alteração a proprietário/admin. Validar em sandbox e revisar contexto de empresa para usuários com múltiplos vínculos. |
| Implantação | Onboarding e validação de prontidão | API existe; indicadores da central usam um contrato incorreto e podem apontar pendências inexistentes. |
| Lixeira | Listagem, restauração e exclusão definitiva | Escrita exige `manage_settings`; leitura aceita visualizador. Validar restauração e limitar exposição por perfil. |

## P0 — corrigir antes de ampliar o uso

### P0-1. Salvar Times ou Operação pode apagar dados da empresa

Evidência: `app/api/tenant/[tenantId]/settings/route.ts:196` monta todos os campos da empresa com `clean(body.campo)`, mesmo ausentes. As páginas `configuracoes/times` e `configuracoes/operacao` enviam apenas `rules.inbox`. A API também replica campos vazios para `tenants`.

Resultado: salvar um time pode apagar nome, nicho, responsável, telefone, site e endereço, além de redefinir fuso e horário comercial.

Correção: atualizar exclusivamente campos presentes no pedido; preservar os demais e gravar os documentos de forma consistente. Testar alteração isolada de time e operação com empresa previamente preenchida.

### P0-2. Convite expõe um mecanismo de redefinição de senha de conta existente

Evidência: `app/api/tenant/[tenantId]/users/route.ts:130` gera link de redefinição de senha e devolve esse link ao administrador que fez o pedido. O POST busca qualquer conta pelo e-mail, sem aceite do titular para criar o novo vínculo.

Resultado: o administrador recebe um link de redefinição de senha também quando a identidade já existia. Isso exige revisão de segurança antes de usar o fluxo como convite entre empresas.

Correção: convite específico da empresa, com token de validade limitada e aceite pelo titular. Contas existentes devem entrar com sua autenticação normal. Não devolver links de recuperação de senha de terceiros ao administrador.

### P0-3. Convidar novamente pode sobrescrever o proprietário ou um membro existente

Evidência: `app/api/tenant/[tenantId]/users/route.ts:249` usa `${tenantId}_${uid}` e faz `set(..., { merge: true })` sem proteger um vínculo existente. Substitui perfil, permissões, status e `isDefault`. A proteção do proprietário só aparece no PATCH.

Resultado: um novo “convite” para e-mail já vinculado pode rebaixar o proprietário, reativar bloqueados e redefinir permissões.

Correção: separar criar, convidar novamente e editar; impedir substituição de proprietário e tornar pedidos repetidos idempotentes.

### P0-4. Alterar um membro modifica sua identidade global

Evidência: `app/api/tenant/[tenantId]/users/[userId]/route.ts:129` aplica o mesmo patch em `tenant_users`, `users` e `client_portal_users`. O POST também reatribui o contexto global e legado de contas de cliente existentes.

Resultado: perfil e bloqueio de uma empresa podem afetar o acesso em outras empresas; há risco também para identidades da agência vinculadas ao cliente, pois o PATCH protege apenas `client_owner`.

Correção: manter perfil, bloqueio e permissões no vínculo da empresa. Proteger identidades da agência e o último administrador; impedir que um administrador delegue poderes além dos autorizados.

## P1 — tornar usuários e times operacionalmente confiáveis

1. **Trocar o perfil não troca as permissões efetivas.** A interface envia somente `role`; o PATCH mantém `capabilities`. `lib/server/tenant.ts:380` prioriza uma lista explícita não vazia. Um admin rebaixado a visualizador pode continuar com poderes administrativos. Definir regra clara para aplicar permissões do novo perfil ou manter personalização consciente.
2. **Desmarcar todas as permissões restaura as permissões padrão.** O servidor interpreta `[]` como fallback do perfil. Distinguir ausência de configuração de lista explicitamente vazia; apresentar os poderes efetivos na interface.
3. **Não existe ciclo completo de convite.** O POST não envia e-mail, cria o vínculo como ativo e cria novas identidades com `emailVerified: true`. Não há aceite/expiração/reenvio/cancelamento de convite nesse fluxo. A geração do link ocorre depois das gravações: uma falha pode retornar erro com o membro já criado.
4. **Reativação não verifica o limite de usuários.** O POST verifica a franquia, mas o PATCH de `blocked` para `active` não. A verificação de criação também é separada da gravação, sem reserva atômica contra pedidos simultâneos.
5. **Times não são vinculados por seleção consistente.** Usuários informam texto livre; times possuem IDs próprios. A tela permite editar/remover IDs sem reatribuir membros. A criação por quantidade pode repetir identificadores após exclusões. Usar IDs estáveis, seleção dos times existentes, validação de unicidade e tratamento dos membros antes da remoção.
6. **Times e horário não comandam a distribuição automática.** `lib/server/tenant-routing.ts` considera papel, disponibilidade, canal e carga; não lê `teams`, `defaultTeam` ou `businessHoursOnly`. Esses controles precisam ser aplicados na execução e comprovados por testes.
7. **Usuários offline podem receber distribuição.** Com `preferOnlineAgents=true`, se não houver online, o filtro mantém os demais candidatos, incluindo offline. Separar indisponibilidade de preferência e definir fallback explícito.
8. **Elegibilidade usa papel, não permissão efetiva de responder.** `listTenantOperators` seleciona proprietário/admin/atendente sem verificar `respond_inbox`. Isso diverge das permissões personalizadas.
9. **Rodízio e capacidade exigem revisão de consistência.** O cursor é lido de `rules.inbox.lastAssignedUserId`, mas gravado com chave pontuada em `set(..., {merge:true})`; validar e corrigir o formato persistido. Seleção e atualização não são transacionais. A carga é calculada sobre no máximo 600 chats e os operadores/listagem de membros sobre 80 registros.
10. **Cadastro de vendedores precisa de perfis comerciais claros.** Hoje existem admin, atendente e visualizador; não há perfis separados de vendedor e gestor comercial. Começar com presets de permissões compatíveis, sem introduzir novos papéis de autenticação desnecessariamente. Visibilidade de carteira própria versus equipe exige definição e aplicação no servidor.
11. **Edição de membros é fragmentada.** Há gravações em blur e a cada checkbox, sem edição única revisável; alguns controles continuam ativos durante a gravação. Faltam busca, paginação, edição de nome e acompanhamento do primeiro acesso. Implementar formulário por membro, feedback de erro confiável e proteção contra perda de alterações simultâneas.
12. **Compatibilidade de vínculos legados precisa de teste.** A listagem consulta por tenant, mas o PATCH procura exclusivamente o ID composto. Um vínculo retornado pela listagem com outro formato de documento pode não ser editável.

## P2 — consistência das outras configurações

- **Central de configurações lê campos errados:** `configuracoes/page.tsx:395` usa `settings.inboxRules`, `defaultResponseSlaMinutes` e `mode`; a API retorna `settings.rules.inbox`, `firstResponseSlaMinutes` e `assignmentMode`. Corrigir contrato para não mostrar distribuição manual, times ausentes e SLA padrão indevidamente.
- **Integrações mostram ações sem permissão suficiente:** a interface considera `manage_channels || manage_settings`; por exemplo, a API de automação ecommerce exige `manage_channels`. Alinhar botões e contratos por ação.
- **Leituras são mais amplas que a curadoria desejada:** usuários, settings, IA, readiness e lixeira aceitam `client_viewer` em suas rotas GET. Revisar payloads e acesso por perfil; esconder um item de menu não restringe a API.
- **Permissões da sessão podem ficar visualmente desatualizadas:** `ClientePanelGuard.tsx` reutiliza cache da sessão sem buscar novas permissões nesse caminho. Definir atualização após alterações e ao retomar a sessão; servidor continua sendo a autoridade.
- **Integrações não têm todas o mesmo nível de suporte:** `lib/server/commerce/registry.ts` define VTEX, Tray e Loja Integrada como webhook-only e lança erro na sincronização por API. Explicar isso no fluxo e comprovar recebimento de evento antes de apresentar conexão como operacional.
- **Remover ruído visual:** concentrar equipe em membros, convites e times; deixar canais e limites avançados em edição secundária. As páginas de Times ainda usam várias cores fixas para fundo escuro, incompatíveis com a direção visual de cards claros.

## Ordem de implementação proposta

1. Corrigir salvamento parcial de configurações e proteger vínculos existentes, proprietário e isolamento entre empresas.
2. Corrigir semântica das permissões, reativação e limite de membros.
3. Implementar convite com aceite, validade, reenvio e cancelamento; revisar tratamento de contas existentes.
4. Entregar gestão simples de vendedores: nome, e-mail, perfil, time, status e próxima ação clara.
5. Aplicar times, disponibilidade, canais, horário e capacidade na distribuição real.
6. Corrigir indicadores, acesso das demais configurações e validar integrações em ambiente de teste.

## Critérios de aceite

- Salvar um time ou regra operacional preserva todos os dados da empresa.
- Administrador cadastra vendedor, o titular aceita o convite e entra na empresa correta.
- Convite repetido não recria membro, não muda o proprietário e não expõe recuperação de senha de conta existente.
- Expiração, reenvio, cancelamento e falha na entrega têm estados claros e recuperáveis.
- Bloquear membro da empresa A não bloqueia a identidade nem seu vínculo na empresa B.
- Rebaixar perfil remove os poderes correspondentes; lista vazia significa nenhum poder configurável.
- Franquia é respeitada na criação, reativação e concorrência.
- Usuário sem autorização não altera equipe por chamada direta à API.
- Conversas chegam a operador autorizado, do time/canal correto, dentro da capacidade e do horário definido.
- Renomear time não rompe vínculos; excluir time ocupado exige destino para seus membros.
- Central de configurações mostra exatamente os valores persistidos.

## Experiência proposta para o cliente cadastrar sua equipe

Uma área “Equipe” com abas Membros, Convites e Times. A ação principal é “Adicionar pessoa”, com nome, e-mail, perfil e seleção de time. Canais, capacidade e permissões personalizadas ficam em uma seção avançada. Cada membro mostra situação do acesso e ações explícitas de editar, bloquear ou reativar; convites mostram reenviar e cancelar.

| Perfil sugerido | Trabalho principal | Limite desejado |
| --- | --- | --- |
| Vendedor / Atendente | Conversas, clientes, oportunidades e próxima ação | Sem gestão de usuários, integrações ou comportamento técnico da IA |
| Gestor comercial | Operação do time, funil, agenda, propostas, campanhas e relatórios | Gestão comercial sem administração técnica por padrão |
| Administrador da empresa | Empresa, equipe, canais e configurações operacionais | Restrito à própria empresa |
| Visualizador | Consulta autorizada | Sem alterações |
| Técnico / Altum | Implantação, integrações avançadas e controles técnicos | Acesso separado e explicitamente concedido |

Esses são perfis propostos de experiência; o modelo atual de dez capabilities não representa sozinho todos os limites de carteira, agenda, campanhas e acesso técnico. A implementação precisa mapear cada ação protegida, aproveitando papéis existentes quando possível.

## Verificação local

- `npm run test:smoke`: 167 testes passaram, sem falhas.
- `npm run lint`: passou, com 0 erros e 23 avisos em páginas de portfólio e `lib/sales-journey.ts`.
- `npm run typecheck`: passou.
- `npm run build`: passou, com 308 páginas estáticas geradas.
- O workspace recebeu arquivos de outra atividade durante a análise; os resultados representam o código disponível durante cada execução, não uma revisão de commit imutável.
- A suíte existente inclui verificações de presença de guardas no código; seu sucesso não cobre os cenários completos de convite, mudança de perfil e isolamento descritos acima.

## Limite para implementação

Nenhuma lógica da aplicação foi alterada nesta auditoria. As correções principais atingem APIs, autenticação e persistência. O `AGENTS.md`, seção 1, exige pedido explícito para essas mudanças. Este documento deixa o escopo concreto para essa autorização.
