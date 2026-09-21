# Auditoria da área do cliente — 17/09/2026

## Resultado e alcance

A Altum tem uma base comercial ampla, mas ainda não está comprovada como uma operação inteiramente confiável em contas reais. Minha avaliação de maturidade é **6/10**: julgamento técnico, não certificação nem comparação quantitativa com concorrentes. Recursos existentes e testes internos justificam a base; lacunas de homologação, precisão de relatórios, recuperação e configuração externa impedem nota maior.

Auditoria de código e contratos: 51 páginas do cliente, 128 APIs dos módulos cliente/tenant/integrações/cobrança/MCP/webhooks, 205 referências de chamadas da interface, além dos mecanismos compartilhados de autorização, filas, jobs e provedores. Inventário estático não equivale a testar cada ação no navegador. A matriz por página está em `client-audit-inventory.json`; contratos de API em `client-audit-api-inventory.json`; conexões em `client-audit-connections.json`. A reprodução do último cruzamento é `node scripts/audit-client-connections.mjs`.

203 referências resolvem diretamente; as duas expressões restantes foram revisadas: OAuth de commerce só oferece Shopify/Nuvemshop, cujas rotas existem, e mensagens acrescenta parâmetros de paginação à rota existente. Existência de rota não comprova autorização, índice, configuração ou resultado externo.

251 testes automatizados passaram; 14 testes direcionados de assinatura, acesso e grupos passaram novamente após os ajustes finais do servidor. Lint dos arquivos desta auditoria passou. A suíte usa fixtures/mocks e não comprova entregas reais, pagamentos ou campanhas reais. A compilação e as verificações finais são registradas ao terminar esta entrega. Chrome foi conectado, mas não havia sessão local autenticada: apenas ChatGPT estava aberto. A primeira navegação local encontrou servidor parado; após iniciar o servidor, a inspeção excedeu o tempo disponível da ferramenta. Fluxos visuais autenticados continuam sem comprovação nesta auditoria. O servidor de desenvolvimento aberto para essa tentativa foi encerrado.

Nenhum push, publicação, cobrança, anúncio ou mensagem externa foi realizado. Alterações simultâneas em admin e reuniões assistidas ficam fora deste pacote.

`npm audit --omit=dev --json` retornou zero vulnerabilidades conhecidas nas dependências de produção nesta consulta. Isso não avalia lógica da aplicação nem certifica segurança; dependências de desenvolvimento não fazem parte desse resultado. O gate `check:saas-readiness` reprovou localmente pela ausência de `ASAAS_API_KEY` e `RESEND_API_KEY`; esse resultado não representa a configuração de produção.

Typecheck independente (`tsc --noEmit --incremental false`) aprovado. `git diff --check` sem erros de whitespace (avisos de conversão LF/CRLF do ambiente Windows).

Build de produção final (`next build --turbopack`, Next 16.3.4) aprovado, exit 0, com 316 páginas geradas. Compilação: 6,5 minutos; TypeScript do build: 2,9 minutos; geração estática: 18,4 segundos nesta máquina. Tempo de build não é tempo de carregamento da aplicação. As mudanças concorrentes presentes no workspace também fazem parte dessa compilação, sem terem sido incorporadas ao escopo de edição desta auditoria.

## Correções locais nesta sequência

1. Login por senha, Google e restauração da sessão encaminham negativas financeiras à assinatura, preservando autenticação Firebase e contexto da empresa. A tela exibe planos reais do catálogo e contato com a Altum. Renovação usa autenticação e vínculo ativo, sem exigir acesso operacional; alteração financeira permanece restrita a dono/admin.
2. Vencimento de trial, fim do período contratado e término da tolerância financeira agora usam uma política compartilhada no portal e nas APIs operacionais. Assinatura ativa não é bloqueada por uma data antiga de trial. Empresa explicitamente solicitada não troca silenciosamente para outra em caso de erro.
3. Dashboard global e perguntas da IA sobre toda a empresa exigem acesso à equipe. Permissão de métrica isolada não basta para expor carteira e financeiro de outros vendedores.
4. Conversas receberam proteção contra resposta atrasada da conversa anterior, acesso por carteira/canal, filtro de número e responsável, escolha do número de saída e templates exclusivos da API oficial.
5. Times receberam IDs estáveis, remoção protegida e tratamento de salvamento parcial. Convite não sobrescreve vínculo existente. Distribuição exclui operadores indisponíveis/lotados e revalida atribuição na transação.
6. Grupos Evolution mantêm identidade do grupo e participante, aparecem identificados e filtráveis, não criam clientes individuais e não disparam a IA automaticamente. Envio manual preserva JID; templates em grupos são rejeitados. O webhook reconhece também o alias `evolution_api`.
7. MCP remoto retorna desafio de autenticação com URL absoluta de metadados. A URL de conexão é `/api/mcp/remote`; `/api/mcp/oauth/authorize` é autorização, não transporte.
8. Runner dos testes corrigido para executar imports TypeScript pelo `tsx` já instalado.

## Avaliação das funcionalidades

Notas consideram implementação, integração entre módulos, clareza de uso, restrição por perfil e evidência operacional. 10 exige uso real consistente, cobertura de falhas e resultados mensuráveis; nenhum módulo recebeu essa nota sem tais evidências.

| Área | Nota | Por quê / o que impede nota maior |
|---|---:|---|
| Login, cadastro, verificação e recuperação | 7 | Firebase e fluxos próprios existentes; renovação corrigida. Falta repetir senha/Google/recuperação em celular e múltiplas empresas. E-mail local sem chave Resend. |
| Assinatura e faturamento | 6 | Catálogo, checkout, limites, webhook e cancelamento integrados. Erro Asaas relatado ainda sem causa específica comprovada; pagamento/estorno reais pendentes. |
| Início e prioridades | 7 | Visão pessoal/empresa e ações comerciais; rankings e métricas dependem de conjuntos limitados de registros. |
| Conversas e atendimento | 7 | Canais/carteiras, atribuição, histórico, mídia e humano/IA conectados. Falta homologar cinco números, rede instável, transferências e webhook real. |
| Grupos WhatsApp | 6 | Identidade, participantes, filtro e bloqueio seguro de IA implementados. Nome depende do provedor; envio/recebimento reais e históricos antigos pendentes. |
| Equipe, times e distribuição | 7 | IDs, permissão e distribuição mais consistentes. Saída/bloqueio de vendedor precisa transferência assistida da carteira e cobertura completa do ciclo de convite. |
| CRM e funil | 7 | Clientes, etapas, responsáveis e próximas ações relacionados. Importação volumosa, duplicidade e transição de permissões exigem cenário real. |
| Agenda e follow-ups | 7 | Próximas ações e tarefas conectadas à operação. Recuperação de execução agendada exige evidência do acionador e entrega. |
| Propostas e financeiro comercial | 6 | Dados vinculados à operação e acesso mais restrito. Reconciliação, falhas e ciclo completo de venda/pagamento não homologados. |
| Produtos, serviços e ofertas | 7 | CRUD e catálogo reutilizado comercialmente. Importação grande, mídia e influência efetiva na resposta da IA precisam validação. |
| Campanhas e rastreamento | 6 | UTM, snapshots, eventos e ligação comercial presentes. Deduplicação, consentimento e cobertura de atribuição precisam evidência por fonte. |
| Operação Google Ads | 6 | Conector e ações específicas existem; não demonstram 100% do gerenciador. OAuth, developer token e tipos de campanha precisam homologação. |
| Operação Meta Ads e criativos | 6 | Conector, ações e análise existentes. Objetivos, destinos, revisão, permissões e publicação real ainda não comprovados. |
| Relatórios e ranking | 5 | Interface e cálculo existem; leituras com limites fixos podem omitir registros e distorcer totais. Não tratar amostra como total universal. |
| Perguntar à Altum | 6 | Consulta dados reais autorizados e agora restringe visão global. Muitas coleções por pergunta, custo/latência altos e cobertura limitada pelos caps. |
| Assistente, conhecimento e escaladas | 7 | Agente, base, controles e escalada implementados. Qualidade precisa benchmark de conversas reais, evidências e limite de autonomia por ação. |
| Automações, Instagram e disparos | 6 | Regras e execução existentes. Dependem de provedor e jobs; entrega, opt-out, repetição e recuperação devem ser homologados. |
| Integrações de loja | 6 | Shopify/Nuvemshop/WooCommerce têm adaptadores. VTEX/Tray/Loja Integrada são webhook-only, sem paridade de sincronização por API. |
| MCP | 6 | Transporte remoto, OAuth e ferramentas existentes. ChatGPT/Claude/Codex reais não validados; discovery público não comprova ferramenta autenticada. |
| Implantação, logs e configurações | 7 | Áreas e controles presentes, com curadoria por perfil. Faltam evidências atuais dos gates externos e simplificação de alguns detalhes técnicos. |
| Reuniões assistidas | 5 | Área em desenvolvimento simultâneo; homologação do bot e conexão ponta a ponta não comprovadas. Não alterada neste pacote. |

Rotas de alias (relatórios/métricas, assinatura/faturamento, agenda/follow-ups e automação Instagram) preservadas. Páginas pequenas que delegam a outra não são consideradas incompletas pela ausência local de loading/error.

## Achados prioritários e evidência

| Prioridade | Achado | Evidência / ação |
|---|---|---|
| P0 — corrigido localmente | Login preso pelo plano vencido | `lib/client-billing-redirect.ts`, login, guard e assinatura; testes de códigos/contexto e fronteiras financeiras. Repetir no navegador com trial vencido e pagamento confirmado. |
| P0 — corrigido localmente | Regras financeiras diferentes entre portal e APIs | `lib/tenant-billing-access.ts` e `lib/server/tenant.ts`; políticas compartilhadas. Conferir acesso humano, integração e worker com a mesma política de plano. |
| P0 — corrigido localmente | Visão global com permissão insuficiente | Dashboard e business-insights/ask; testar dono, gestor, vendedores A/B e outro tenant em sessão real. |
| P0 — pendente externo | Erro de checkout Asaas | Não há erro específico do provedor nesta auditoria. Ambiente local sem chave; confirmar sandbox, payload, resposta sanitizada e webhook, sem repetir cobranças cegamente. |
| P0 — pendente operacional | Acionamento de jobs não demonstrado | `vercel.json` atual está vazio; documentação antiga menciona crons. Existem rotas de jobs protegidas. Pode haver acionador externo, mas não foi comprovado. Não considerar automação agendada garantida. |
| P0 — pendente externo | Regras publicadas/isolamento em produção | `GO_LIVE_GATES_EXTERNOS.md` registra diferença entre regras endurecidas locais e publicadas. Documento histórico não prova estado atual; revalidar antes de abrir comercialmente. |
| P1 | Totais e ranking com leitura limitada | APIs de metrics-summary, dashboard e perguntas globais leem centenas/milhares de docs com `.limit(...)`; o período é frequentemente filtrado após a leitura. Agregar por período na base e informar cobertura. |
| P1 | Latência externa sem prazo local uniforme | `lib/server/asaas-api.ts` e callback Google usam fetch sem timeout local explícito. Adotar prazo por operação, cancelamento e idempotência; não repetir POST financeiro automaticamente. |
| P1 | Ciclo de equipe incompleto | Bloquear/remover operador precisa visão do impacto e redistribuição da carteira; evitar conversas sem responsável e acesso residual. |
| P1 | Histórico legado de grupos | Novos eventos protegidos; histórico já misturado exige diagnóstico e migração própria, sem copiar dados entre clientes por telefone presumido. |
| P1 | Mensagem “vazia” não é diagnóstico suficiente | Distinguir evento de protocolo, mídia sem legenda, falha de download e conteúdo ausente; acompanhar desde evento recebido até mensagem armazenada e execução da IA. |
| P2 | UX e acessibilidade | Cabeçalhos/filtros comprimidos nas capturas, excesso de informação na conversa e alertas. Validar teclado, foco, contraste, estados vazios, 390px e desktop com tarefas por perfil. |

Aviso Google “app não verificado” vem do provedor: depende de configuração/verificação OAuth, não é prova de erro no redirect. Chave de API isolada não substitui OAuth/developer token para Google Ads.

## Velocidade: plano baseado no código

O maior ganho provável está em **reduzir trabalho por requisição**, especialmente consultas globais. Não foi medida latência p50/p95 real nem Web Vitals: nenhum percentual de ganho é prometido.

1. **Medir antes/depois:** tempo de auth, Firestore, provedor, fila, modelo e renderização; registrar quantidade de documentos, bytes, status e cache hit, sem conteúdo de cliente. Separar desenvolvimento de build de produção. Metas iniciais propostas: LCP <=2,5s, INP <=200ms, CLS <=0,1; metas de API devem ser calibradas com base real.
2. **Corrigir agregações:** snapshots diários por tenant/canal/vendedor e período; agregações atualizadas com eventos idempotentes, mais reconciliação. Listas com cursor, consultas indexadas e datas no servidor. Retorna totais com cobertura e data de atualização.
3. **Compartilhar consultas no cliente:** escolher uma base (SWR ou TanStack Query), criar chaves tenant + usuário/perfil + filtros; deduplicar consultas e invalidar após escrita. Limpar cache no logout/troca de empresa/alteração de permissão. Cache não substitui autorização do servidor.
4. **Preservar o que já existe:** carregamento progressivo e polling adaptativo suspendem atualizações em aba oculta/offline e ajustam conexões limitadas. Evitar novas atualizações duplicadas; mídia e gráficos carregam quando necessários.
5. **IA com leitura direcionada:** buscar apenas dados exigidos pela pergunta, agregados e evidências recentes; reduzir contexto e chamadas duplicadas. Medir tempo até primeira resposta e resposta completa. Streaming só melhora percepção; não corrige consulta lenta.
6. **Provedores e workers:** timeout por etapa, fila durável, retry com jitter para falha transitória, dead-letter visível e replay idempotente. Medir idade do job, duplicidade, falha e entrega. Não trocar segurança de token por velocidade sem avaliação.
7. **Infra:** conferir região entre aplicação e Firestore, índices e custo de leitura. Cache curto para catálogo público; dados comerciais privados sempre particionados e invalidados.

### Bases prontas pesquisadas

- [SWR](https://github.com/vercel/swr): biblioteca MIT pronta para cache/revalidação. [API oficial](https://swr.vercel.app/docs/api) documenta deduplicação e atualização. Boa opção incremental para fetch atual; não foi instalada nesta auditoria.
- [TanStack Query](https://github.com/TanStack/query): biblioteca MIT para ciclo de consultas/mutações. [Guia oficial de prefetch](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/prefetching.md) ajuda a reduzir sequências de carregamento. Escolher em vez de manter duas bibliotecas sobre os mesmos dados.
- [Boas práticas Firestore](https://firebase.google.com/docs/firestore/best-practices): índices, cursores e proximidade regional. Essas mudanças exigem adaptar consultas e implantação de índices, não copiar um painel inteiro.
- [Evolution API](https://github.com/evolution-foundation/evolution-api): integração existente reutilizada para identidade de grupo; não foi substituída nem apresentada como código importado novo.

Preservar licença e origem de código reutilizado. A base AdPort já consta das dependências; bases externas não garantem cobertura de todas as ações dos gerenciadores.

## Maturidade de software e mercado

| Dimensão | Nota | Critério / próximo passo |
|---|---:|---|
| Proposta comercial | 8 | Atendimento + CRM + IA no mesmo contexto é clara. Demonstrar melhora de resposta/conversão em pilotos, sem promessa de vendas garantidas. |
| Usabilidade | 6 | Núcleo comercial e curadoria por perfil presentes. Reduzir ruído e homologar tarefas em celular/desktop. |
| Confiabilidade | 5 | Proteções e testes existem; incidentes relatados e falta de homologação externa reduzem confiança. |
| Segurança e isolamento | 6 | Capabilities, carteira, tenant e regras existentes. Validar regras publicadas, permissões negativas, revogação e exportações. |
| Precisão de dados | 5 | Relações comerciais existem, mas caps e atribuição incompleta limitam decisões. |
| Performance e escala | 5 | Há progressividade/polling; consultas globais e falta de benchmark de carga são obstáculos. |
| Operação e suporte | 5 | Logs e gates documentados; provar alertas, backup/restore, acionadores e resposta a incidente. |
| IA e autonomia | 6 | Ações e contexto implementados; requer orçamento, aprovações por risco, avaliação de qualidade e rastreabilidade. |
| Interoperabilidade | 7 | MCP, anúncios, canais e commerce; homologação e diferenças entre providers impedem paridade. |
| Economia SaaS | 6 | Planos/limites definidos; medir margem por tenant (IA, banco, mídia, suporte e canais) e retenção. |
| Privacidade e governança | 5 | Documentação legal básica não comprova governança. Validar consentimento, retenção, exportação/exclusão e acesso a conversas. |
| Manutenção e qualidade | 7 | Testes e componentes reutilizáveis; páginas extensas e contratos compartilhados precisam melhor modularidade. |

Notas de mercado são avaliação de adequação do produto, não pesquisa de preços atual nem auditoria jurídica. Faltam evidências de retenção, SLA, satisfação e ROI para afirmar posição competitiva.

## Matriz final para homologação real

| Fluxo | Cenários mínimos | Evidência necessária |
|---|---|---|
| Identidade → assinatura → operação | trial vencido, plano ativo, grace vigente/vencido, cancelamento, membro bloqueado, troca de empresa | URL correta, sessão preservada, API operacional negada/liberada e renovação acessível |
| Canal → mensagem → IA → resposta | sessão/oficial, cinco números, mídia, grupo, evento repetido, evento vazio, falha de provedor | IDs evento/chat/job/entrega correlacionados e histórico consistente |
| Equipe → carteira → transferência | dono, gestor, A/B, número pessoal e oficial, vendedor indisponível, remoção | leitura/escrita permitida só no escopo correto e atribuição sem corrida |
| Lead → funil → proposta → venda | UTM/click id, origem direta, venda ganha/perdida, receita estornada | evento deduplicado, valores reconciliados, período e cobertura corretos |
| Anúncio → campanha → resultado | Google/Meta, destinos site/WhatsApp/Instagram, criativo, revisão, pausa e orçamento | recurso externo e ação confirmados; nenhum gasto sem autorização |
| MCP → OAuth → ferramenta | ChatGPT web, Claude e Codex; expiração/revogação e outro tenant | transporte, consentimento, scopes e ferramenta real respeitando acesso |
| Recuperação e escala | rede intermitente, worker parado, backlog, volume maior que caps, backup/restore | alerta, recuperação idempotente, RTO/RPO e latência/custo medidos |

Essa matriz registra o que falta comprovar; a auditoria de código está entregue, mas a homologação externa não foi substituída por mocks. Antes de publicação, apresentar as mudanças locais e executar os gates autorizados. Não abrir produção como “100% pronta” só porque o build passou.
