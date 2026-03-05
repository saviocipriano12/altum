# ALTUM OS - Blueprint Portal do Cliente + Agência IA

## Objetivo
Construir um portal onde cada cliente acompanha em tempo real:
- campanhas (Meta, Google e outros),
- contratos e vencimentos,
- pagamentos e status financeiro,
- entregas concluídas e próximas entregas.

Além disso, disponibilizar IA operacional para o time interno com recomendações de melhoria por conta/campanha.

## Arquitetura recomendada
### 1. Camada de Conectores (Ingestão)
- Conectores oficiais por plataforma:
  - Meta Marketing API
  - Google Ads API
  - TikTok Ads API
  - LinkedIn Marketing API
- Estratégia:
  - jobs periódicos (5/15/60 min) para atualização contínua;
  - webhook quando disponível;
  - fallback manual/import para contingência.

### 2. Camada de Dados (Firestore)
- `ad_accounts`
  - vínculo plataforma/cliente/owner, status, syncMode, credenciais por referência segura.
- `campaign_snapshots`
  - snapshot diário ou por janela curta (impressions, clicks, spend, leads, ctr, cpc, cpl, roas).
- `contracts`
  - termo, valor, ciclo, data de vencimento, status.
- `deliverables`
  - backlog, progresso, entregas concluídas, anexos.
- `client_portal_access`
  - controle de usuários cliente e escopo de visualização.

### 3. Camada de Serviço (APIs seguras)
- Autorização por `uid` + role + ownership.
- APIs de leitura do portal separadas das APIs internas do time.
- Audit logs para ações sensíveis (mudança contrato, baixa pagamento, transferência).

### 4. Camada de IA
- IA de diagnóstico de mídia:
  - leitura de snapshots e tendências;
  - alertas proativos (CPL subiu, CTR caiu, gasto sem lead);
  - recomendação por objetivo (captação, remarketing, escala).
- IA de operação:
  - sugerir atividades de follow-up com confirmação;
  - priorização de carteira por risco/oportunidade;
  - explicação executiva para cliente final.

## Segurança e Segredos
- Nunca armazenar token bruto no front.
- Tokens e refresh tokens em Secret Manager/Vault.
- Firestore guarda somente referência (`credentialsRef`) + metadados.
- Rotação e auditoria de credenciais obrigatórias.

## Roadmap sugerido (rápido e robusto)
1. Sprint 1 - Fundação
- ad_accounts + snapshots + tela admin de campanhas + insights IA base.
- painel de saúde de integrações.

2. Sprint 2 - Portal Cliente v1
- autenticação cliente,
- dashboard cliente com métricas principais,
- contrato + vencimento + pagamentos.

3. Sprint 3 - Entregas e Transparência
- timeline de entregas por projeto,
- anexos e histórico,
- SLA e próximos passos.

4. Sprint 4 - IA Proativa
- alertas automáticos por conta/campanha,
- plano de ação semanal gerado por IA,
- benchmark por nicho/canal.

## KPIs principais de produto
- Tempo de resposta comercial (primeiro contato e follow-up).
- CPL, CTR, CPC, ROAS por conta e por cliente.
- Receita recorrente, inadimplência e churn.
- SLA de entregas e satisfação do cliente.

## Resultado esperado
Uma agência operada por dados e IA, com clareza total para cliente e equipe:
- mais confiança,
- mais previsibilidade de receita,
- mais velocidade para escalar.
