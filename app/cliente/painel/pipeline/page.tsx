"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  GripVertical,
  Loader2,
  MessageSquareText,
  RefreshCw,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CrmAvatar,
  CrmBadge,
  CrmButton,
  CrmEmpty,
  CrmHero,
  CrmLinkButton,
  CrmMetric,
  CrmNotice,
  CrmPanel,
  CrmSectionTitle,
  CrmSelect,
  CrmWorkspace,
  formatCrmMoney,
} from "@/app/cliente/painel/components/crm-workspace";
import { getDefaultPipelineStages, getPipelineStageLabel, type PipelineStageDefinition } from "@/lib/pipeline";

type PipelineLead = {
  id: string;
  nome?: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  owner?: string;
  ownerId?: string;
  score?: number | null;
  heat?: string;
  priority?: string;
  potentialValue?: number;
  tags?: string[];
  source?: string;
  status?: string;
  ageDays?: number;
  slaBreached?: boolean;
  aiLeadSummary?: string;
  aiNextAction?: string;
  aiRecommendedOffer?: string;
  aiResponseGoal?: string;
  aiCommercialTemperature?: string;
  aiPlannerConfidence?: number | null;
  campaignName?: string;
  sourceLabel?: string;
  qualification?: {
    score?: number | null;
    label?: string;
    nextAction?: string;
  } | null;
  commercialState?: {
    stagePolicy?: {
      slaBreached?: boolean;
      ownerName?: string | null;
    } | null;
  } | null;
};

type PipelineColumn = {
  stage: PipelineStageDefinition;
  count: number;
  totalValue: number;
  avgScore: number;
  avgAgeDays: number;
  slaBreachedCount?: number;
  items: PipelineLead[];
};

type PipelineResponse = {
  stages?: PipelineStageDefinition[];
  columns?: PipelineColumn[];
  summary?: {
    totalLeads?: number;
    openCount?: number;
    wonCount?: number;
    lostCount?: number;
    totalValue?: number;
    winRate?: number;
  };
  error?: string;
};

function heatTone(value?: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "quente") return "red" as const;
  if (normalized === "morno") return "orange" as const;
  if (normalized === "frio") return "neutral" as const;
  return "blue" as const;
}

function formatAiAction(value?: string | null) {
  const clean = String(value || "").trim();
  if (!clean) return "Definir proxima acao";
  const labels: Record<string, string> = {
    assumir_handoff_humano: "Humano deve assumir",
    qualificar_contexto_minimo: "Qualificar melhor",
    aprofundar_oportunidade: "Aprofundar oportunidade",
    tratar_objecao_suave: "Tratar objecao",
    preparar_proposta_comercial: "Preparar proposta",
    agendar_proximo_passo: "Agendar proximo passo",
    conduzir_para_proximo_passo: "Conduzir proximo passo",
  };
  return labels[clean] || clean.replaceAll("_", " ");
}

function temperatureTone(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "hot") return "red" as const;
  if (normalized === "warm") return "orange" as const;
  if (normalized === "cold") return "neutral" as const;
  return "blue" as const;
}

function temperatureLabel(value?: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "hot") return "quente";
  if (normalized === "warm") return "morno";
  if (normalized === "cold") return "frio";
  return "em leitura";
}

export default function ClientePipelinePage() {
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("manage_pipeline") || hasCapability("edit_leads");

  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);

  const loadPipeline = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`);
      const payload = (await res.json()) as PipelineResponse;
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao carregar funil.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar funil.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const stages = data?.stages?.length ? data.stages : getDefaultPipelineStages();
  const columns = useMemo(() => {
    const byStage = new Map((data?.columns || []).map((column) => [column.stage.id, column]));
    return stages.map((stage) => byStage.get(stage.id) || { stage, count: 0, totalValue: 0, avgScore: 0, avgAgeDays: 0, items: [] });
  }, [data?.columns, stages]);

  const allLeads = useMemo(() => columns.flatMap((column) => column.items), [columns]);
  const selectedLead = useMemo(() => allLeads.find((lead) => lead.id === leadFromQuery) || allLeads[0] || null, [allLeads, leadFromQuery]);
  const stuckCount = allLeads.filter((lead) => lead.slaBreached || lead.commercialState?.stagePolicy?.slaBreached).length;
  const hotAiCount = allLeads.filter((lead) => lead.aiCommercialTemperature === "hot" || lead.heat === "quente").length;
  const proposalActionCount = allLeads.filter((lead) => /proposta|agendar|proximo|próximo/i.test(`${lead.aiNextAction || ""} ${lead.qualification?.nextAction || ""}`)).length;
  const topUrgentLead = useMemo(() => {
    return [...allLeads].sort((a, b) => {
      const stuckDiff = Number(Boolean(b.slaBreached || b.commercialState?.stagePolicy?.slaBreached)) - Number(Boolean(a.slaBreached || a.commercialState?.stagePolicy?.slaBreached));
      if (stuckDiff !== 0) return stuckDiff;
      const tempDiff = Number(b.aiCommercialTemperature === "hot" || b.heat === "quente") - Number(a.aiCommercialTemperature === "hot" || a.heat === "quente");
      if (tempDiff !== 0) return tempDiff;
      return Number(b.potentialValue || 0) - Number(a.potentialValue || 0);
    })[0] || null;
  }, [allLeads]);
  const totalValue = data?.summary?.totalValue ?? columns.reduce((sum, column) => sum + (column.totalValue || 0), 0);
  const openCount = data?.summary?.openCount ?? allLeads.length;

  async function moveLead(leadId: string, stageId: string) {
    if (!tenant?.tenantId || !canOperate) return;
    setMovingLeadId(leadId);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: stageId }),
      });
      if (!res.ok) throw new Error("Nao foi possivel mover a oportunidade.");
      await loadPipeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel mover a oportunidade.");
    } finally {
      setMovingLeadId(null);
      setDragLeadId(null);
      setDropStageId(null);
    }
  }

  return (
    <CrmWorkspace>
      <div className="pipeline-inverted space-y-5 rounded-[30px] p-1 sm:p-2">
        <CrmHero
          active="Funil"
          title="Funil comercial com leitura forte e foco em fechamento."
          description="Uma visao diferente do restante da plataforma para destacar movimento, gargalos, valor por etapa e oportunidades que precisam de acao."
          assistantTitle="Sinais do funil"
          assistantSubtitle="Gargalos e previsao"
          assistantText="A Altum aponta oportunidades paradas, valores por etapa e contatos que precisam de uma proxima acao."
          action={
            <>
              <CrmButton type="button" onClick={loadPipeline}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </CrmButton>
              <CrmLinkButton href="/cliente/painel/crm" tone="primary">
                Ver lista
                <ArrowRight className="h-4 w-4" />
              </CrmLinkButton>
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-4">
            <CrmMetric label="Oportunidades abertas" value={String(openCount)} detail="em todo o funil" icon={UsersRound} tone="blue" />
            <CrmMetric label="Valor acompanhado" value={formatCrmMoney(totalValue)} detail="previsao comercial" icon={TrendingUp} tone="green" />
            <CrmMetric label="Quentes pela IA" value={String(hotAiCount)} detail="prioridade comercial" icon={Bot} tone={hotAiCount ? "purple" : "neutral"} />
            <CrmMetric label="Sem proximo passo" value={String(stuckCount)} detail="precisam de acao" icon={AlertTriangle} tone={stuckCount ? "orange" : "neutral"} />
          </div>
        </CrmHero>

        {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}

        <CrmPanel>
          <CrmSectionTitle
            eyebrow="Comando do funil"
            title="Onde avancar para destravar receita"
            description="A Altum cruza etapa, valor, temperatura e sinais da IA para priorizar a proxima acao."
            action={<CrmBadge tone={proposalActionCount ? "purple" : "neutral"}>{proposalActionCount} pedem proposta/agendamento</CrmBadge>}
          />
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Oportunidade em foco</p>
              {topUrgentLead ? (
                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-[var(--cliente-card-text)]">{topUrgentLead.nome || "Contato"}</p>
                    <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
                      {formatAiAction(topUrgentLead.aiNextAction || topUrgentLead.qualification?.nextAction)} · {formatCrmMoney(topUrgentLead.potentialValue)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CrmBadge tone={temperatureTone(topUrgentLead.aiCommercialTemperature)}>{temperatureLabel(topUrgentLead.aiCommercialTemperature)}</CrmBadge>
                    {(topUrgentLead.slaBreached || topUrgentLead.commercialState?.stagePolicy?.slaBreached) ? <CrmBadge tone="orange">travado</CrmBadge> : null}
                    <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(topUrgentLead.id)}`} className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--cliente-primary)] px-3 py-2 text-xs font-black text-white">
                      Abrir
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm font-bold text-[var(--cliente-card-text-soft)]">Sem oportunidade aberta no funil.</p>
              )}
            </div>
            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-4">
              <p className="text-[11px] font-black uppercase text-[var(--cliente-ai)]">Leitura da IA</p>
              <p className="mt-2 text-sm font-black text-[var(--cliente-card-text)]">{hotAiCount} quente(s), {stuckCount} travado(s)</p>
              <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">Use o board para mover etapa, abrir conversa ou preparar proposta sem perder o contexto.</p>
            </div>
          </div>
        </CrmPanel>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <CrmPanel padded={false} className="pipeline-board-shell overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-5">
            <CrmSectionTitle
              eyebrow="Pipeline"
              title="Etapas do funil"
              description="Um board tradicional de CRM: claro, escaneavel e com valor comercial na frente."
              action={!canOperate ? <CrmBadge tone="orange">somente leitura</CrmBadge> : null}
            />
          </div>

          <div className="client-scrollbar flex gap-4 overflow-x-auto p-4">
            {columns.map((column) => {
              const isDropTarget = dropStageId === column.stage.id;
              return (
                <section
                  key={column.stage.id}
                  className={`pipeline-column min-w-[310px] rounded-[22px] border bg-[var(--cliente-surface-muted)] transition ${isDropTarget ? "border-[var(--cliente-primary)] ring-2 ring-[var(--cliente-primary-soft)]" : "border-[var(--cliente-border)]"}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropStageId(column.stage.id);
                  }}
                  onDragLeave={() => setDropStageId((current) => (current === column.stage.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    const leadId = event.dataTransfer.getData("text/plain") || dragLeadId;
                    if (leadId) moveLead(leadId, column.stage.id);
                  }}
                >
                  <header className="border-b border-[var(--cliente-border)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-black text-[var(--cliente-card-text)]">{column.stage.label || getPipelineStageLabel(column.stage.id)}</h2>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{column.count || column.items.length} oportunidades</p>
                      </div>
                      <CrmBadge tone="blue">{formatCrmMoney(column.totalValue)}</CrmBadge>
                    </div>
                    {column.stage.description ? <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{column.stage.description}</p> : null}
                  </header>

                  <div className="space-y-3 p-3">
                    {loading ? <CrmEmpty title="Carregando funil" /> : null}
                    {!loading && column.items.length === 0 ? <CrmEmpty title="Sem oportunidades nesta etapa" /> : null}
                    {column.items.map((lead) => (
                      <article
                        key={lead.id}
                        draggable={canOperate}
                        onDragStart={(event) => {
                          setDragLeadId(lead.id);
                          event.dataTransfer.setData("text/plain", lead.id);
                        }}
                        onDragEnd={() => setDragLeadId(null)}
                        className={`pipeline-card rounded-[18px] border bg-[var(--cliente-card)] p-4 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] ${lead.id === leadFromQuery ? "border-[var(--cliente-primary)]" : "border-[var(--cliente-border)]"}`}
                      >
                        <div className="flex items-start gap-3">
                          {canOperate ? <GripVertical className="mt-1 h-4 w-4 shrink-0 text-[var(--cliente-card-text-muted)]" /> : null}
                          <div className="min-w-0 flex-1">
                            <CrmAvatar name={lead.nome} subtitle={lead.empresa || lead.telefone || lead.email || "Sem empresa"} size="sm" />
                            <div className="mt-3 flex flex-wrap gap-2">
                              {lead.heat ? <CrmBadge tone={heatTone(lead.heat)}>{lead.heat}</CrmBadge> : null}
                              {lead.aiCommercialTemperature ? <CrmBadge tone={temperatureTone(lead.aiCommercialTemperature)}>{temperatureLabel(lead.aiCommercialTemperature)}</CrmBadge> : null}
                              <CrmBadge>{formatCrmMoney(lead.potentialValue)}</CrmBadge>
                              {lead.slaBreached || lead.commercialState?.stagePolicy?.slaBreached ? <CrmBadge tone="orange">sem retorno</CrmBadge> : null}
                            </div>
                            {lead.aiNextAction || lead.qualification?.nextAction ? (
                              <p className="mt-3 text-xs font-black text-[var(--cliente-card-text)]">{formatAiAction(lead.aiNextAction || lead.qualification?.nextAction)}</p>
                            ) : null}
                            {lead.aiRecommendedOffer || lead.campaignName || lead.aiLeadSummary ? (
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                                {lead.aiRecommendedOffer ? `Oferta: ${lead.aiRecommendedOffer}. ` : ""}
                                {lead.campaignName ? `Campanha: ${lead.campaignName}. ` : ""}
                                {lead.aiLeadSummary || ""}
                              </p>
                            ) : null}
                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(lead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]">
                                Abrir
                              </Link>
                              <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(lead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]">
                                <MessageSquareText className="h-3.5 w-3.5" />
                                Conversa
                              </Link>
                            </div>
                            <CrmSelect
                              value={column.stage.id}
                              onChange={(event) => moveLead(lead.id, event.target.value)}
                              disabled={!canOperate || movingLeadId === lead.id}
                              className="mt-3 h-10 w-full text-xs"
                            >
                              {stages.map((stage) => (
                                <option key={stage.id} value={stage.id}>{stage.label || getPipelineStageLabel(stage.id)}</option>
                              ))}
                            </CrmSelect>
                            {movingLeadId === lead.id ? <p className="mt-2 text-xs font-bold text-[var(--cliente-primary)]">Movendo...</p> : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          </CrmPanel>

          <aside className="space-y-4 xl:sticky xl:top-[132px] xl:self-start">
          <CrmPanel>
            <CrmSectionTitle eyebrow="Foco" title="Oportunidade ativa" description="Contexto rapido para o gestor ou atendente decidir o proximo passo." />
            {selectedLead ? (
              <div className="mt-5 space-y-4">
                <CrmAvatar name={selectedLead.nome} subtitle={selectedLead.empresa || selectedLead.telefone || selectedLead.email} size="lg" />
                <div className="grid grid-cols-2 gap-3">
                  <CrmMetric label="Valor" value={formatCrmMoney(selectedLead.potentialValue)} />
                  <CrmMetric label="Score" value={selectedLead.score ? String(selectedLead.score) : "--"} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedLead.heat ? <CrmBadge tone={heatTone(selectedLead.heat)}>{selectedLead.heat}</CrmBadge> : null}
                  {selectedLead.aiCommercialTemperature ? <CrmBadge tone={temperatureTone(selectedLead.aiCommercialTemperature)}>{temperatureLabel(selectedLead.aiCommercialTemperature)}</CrmBadge> : null}
                  {selectedLead.owner ? <CrmBadge>{selectedLead.owner}</CrmBadge> : null}
                </div>
                <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase text-[var(--cliente-ai)]">Leitura da IA</p>
                    {typeof selectedLead.aiPlannerConfidence === "number" ? <CrmBadge tone={selectedLead.aiPlannerConfidence >= 0.7 ? "green" : "orange"}>{Math.round(selectedLead.aiPlannerConfidence * 100)}%</CrmBadge> : null}
                  </div>
                  <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">{formatAiAction(selectedLead.aiNextAction || selectedLead.qualification?.nextAction)}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                    Oferta: {selectedLead.aiRecommendedOffer || "nao definida"} · Objetivo: {selectedLead.aiResponseGoal || "em leitura"}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <p className="text-xs font-black uppercase text-[var(--cliente-card-text-soft)]">Origem comercial</p>
                  <p className="mt-2 text-sm font-bold text-[var(--cliente-card-text)]">{selectedLead.campaignName || selectedLead.sourceLabel || selectedLead.source || "Nao registrada"}</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{selectedLead.sourceLabel || selectedLead.source || "sem fonte"}</p>
                </div>
                <div className="grid gap-2">
                  <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white">
                    Abrir ficha
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href={`/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)]">
                    Ver propostas
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <CrmEmpty title="Nenhuma oportunidade selecionada" />
              </div>
            )}
          </CrmPanel>
          </aside>
        </section>
      </div>
    </CrmWorkspace>
  );
}
