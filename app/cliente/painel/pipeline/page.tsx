"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CrmAvatar,
  CrmBadge,
  CrmButton,
  CrmEmpty,
  CrmHero,
  CrmInput,
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
  photoUrl?: string;
  profilePhotoUrl?: string;
  contactPhotoUrl?: string;
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

function leadPhotoUrl(lead?: PipelineLead | null) {
  if (!lead) return null;
  return lead.photoUrl || lead.profilePhotoUrl || lead.contactPhotoUrl || null;
}

export default function ClientePipelinePage() {
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const { tenant, hasCapability } = useClienteTenant();
  const canManagePipeline = hasCapability("manage_pipeline");
  const canOperate = canManagePipeline || hasCapability("edit_leads");

  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStages, setEditingStages] = useState(false);
  const [savingStages, setSavingStages] = useState(false);
  const [draftStages, setDraftStages] = useState<PipelineStageDefinition[]>([]);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [boardCanScroll, setBoardCanScroll] = useState(false);
  const [boardAtStart, setBoardAtStart] = useState(true);
  const [boardAtEnd, setBoardAtEnd] = useState(false);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

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

  const stages = useMemo(() => (data?.stages?.length ? data.stages : getDefaultPipelineStages()), [data?.stages]);

  useEffect(() => {
    setDraftStages(stages.map((stage) => ({ ...stage })));
  }, [stages]);

  const columns = useMemo(() => {
    const byStage = new Map((data?.columns || []).map((column) => [column.stage.id, column]));
    return stages.map((stage) => byStage.get(stage.id) || { stage, count: 0, totalValue: 0, avgScore: 0, avgAgeDays: 0, items: [] });
  }, [data?.columns, stages]);

  const stageLeadCounts = useMemo(
    () => new Map(columns.map((column) => [column.stage.id, column.items.length])),
    [columns]
  );

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

  function updateDraftStage(stageId: string, patch: Partial<PipelineStageDefinition>) {
    setDraftStages((current) =>
      current.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage))
    );
  }

  function addDraftStage() {
    setDraftStages((current) => {
      if (current.length >= 12) return current;
      return [
        ...current,
        {
          id: `etapa_${Date.now()}`,
          label: "Nova etapa",
          description: "Defina o objetivo comercial desta etapa.",
          color: "#2563eb",
          position: current.length,
          isTerminal: false,
          slaHours: 24,
          followUpHours: 12,
        },
      ];
    });
  }

  function removeDraftStage(stageId: string) {
    if (draftStages.length <= 3) {
      setError("O funil precisa ter pelo menos tres etapas.");
      return;
    }
    if ((stageLeadCounts.get(stageId) || 0) > 0) {
      setError("Mova as oportunidades desta etapa antes de remove-la.");
      return;
    }
    setDraftStages((current) =>
      current
        .filter((stage) => stage.id !== stageId)
        .map((stage, index) => ({ ...stage, position: index }))
    );
  }

  async function saveStages() {
    if (!tenant?.tenantId || !canManagePipeline) return;
    setSavingStages(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: draftStages }),
      });
      const payload = (await res.json().catch(() => ({}))) as PipelineResponse & { ok?: boolean };
      if (!res.ok || payload.error) throw new Error(payload.error || "Nao foi possivel salvar as etapas.");
      setData((current) => ({
        ...(current || {}),
        stages: payload.stages || draftStages,
      }));
      setEditingStages(false);
      await loadPipeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar as etapas.");
    } finally {
      setSavingStages(false);
    }
  }

  function syncBoardState() {
    const node = boardScrollRef.current;
    if (!node) return;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    setBoardCanScroll(maxScrollLeft > 8);
    setBoardAtStart(node.scrollLeft <= 4);
    setBoardAtEnd(node.scrollLeft >= maxScrollLeft - 4);
  }

  function scrollBoard(direction: "left" | "right") {
    const node = boardScrollRef.current;
    if (!node) return;
    node.scrollBy({ left: direction === "right" ? 360 : -360, behavior: "smooth" });
  }

  useEffect(() => {
    syncBoardState();
    const onResize = () => syncBoardState();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [columns.length, loading]);

  return (
    <CrmWorkspace>
      <div className="pipeline-refined space-y-5">
        <CrmHero
          active="Funil"
          title="Funil comercial com leitura tradicional e movimento rapido entre etapas."
          description="Aqui o time enxerga volume, valor, gargalos e proxima acao no formato de CRM que o cliente ja conhece."
          assistantTitle="Apoio da Altum"
          assistantSubtitle="priorizacao comercial"
          assistantText="A IA entra como apoio pratico para destacar travas, sugerir proximo passo e puxar atencao para oportunidades que merecem resposta agora."
          action={
            <>
              <CrmButton type="button" onClick={loadPipeline}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </CrmButton>
              <CrmLinkButton href="/cliente/painel/inbox?status=pending" tone="green">
                Quem precisa de resposta
              </CrmLinkButton>
              {canManagePipeline ? (
                <CrmButton type="button" onClick={() => setEditingStages((current) => !current)}>
                  {editingStages ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {editingStages ? "Fechar edicao" : "Editar etapas"}
                </CrmButton>
              ) : null}
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

        {editingStages ? (
          <CrmPanel>
            <CrmSectionTitle
              eyebrow="Funil do cliente"
              title="Editar nomes e regras das etapas"
              description="Ajuste a nomenclatura para o jeito que o cliente vende. As oportunidades existentes continuam nas mesmas etapas."
              action={
                <>
                  <CrmButton type="button" onClick={addDraftStage} disabled={savingStages || draftStages.length >= 12}>
                    <Plus className="h-4 w-4" />
                    Adicionar etapa
                  </CrmButton>
                  <CrmButton type="button" tone="primary" onClick={() => void saveStages()} disabled={savingStages}>
                    {savingStages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar etapas
                  </CrmButton>
                </>
              }
            />
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {draftStages.map((stage) => (
                <div key={stage.id} className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Etapa {stage.position + 1}</p>
                    <div className="flex items-center gap-2">
                      {stage.isTerminal ? <CrmBadge tone="neutral">final</CrmBadge> : <CrmBadge tone="blue">aberta</CrmBadge>}
                      <button
                        type="button"
                        onClick={() => removeDraftStage(stage.id)}
                        disabled={savingStages || draftStages.length <= 3 || (stageLeadCounts.get(stage.id) || 0) > 0}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] transition hover:border-[var(--cliente-danger)] hover:text-[var(--cliente-danger)] disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label={`Remover etapa ${stage.label}`}
                        title={(stageLeadCounts.get(stage.id) || 0) > 0 ? "Mova as oportunidades antes de remover" : "Remover etapa"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                    <CrmInput
                      value={stage.label}
                      onChange={(event) => updateDraftStage(stage.id, { label: event.target.value })}
                      placeholder="Nome da etapa"
                      className="w-full"
                    />
                    <CrmInput
                      type="number"
                      value={stage.slaHours ?? ""}
                      onChange={(event) => updateDraftStage(stage.id, { slaHours: event.target.value ? Number(event.target.value) : null })}
                      placeholder="SLA h"
                      className="w-full"
                    />
                  </div>
                  <CrmInput
                    value={stage.description}
                    onChange={(event) => updateDraftStage(stage.id, { description: event.target.value })}
                    placeholder="Descricao comercial"
                    className="mt-2 w-full"
                  />
                </div>
              ))}
            </div>
          </CrmPanel>
        ) : null}

        <CrmPanel>
          <CrmSectionTitle
            eyebrow="Prioridade do funil"
            title="Onde avancar para destravar receita"
            description="A Altum cruza etapa, valor, temperatura e sinais da IA para priorizar a proxima acao."
            action={<CrmBadge tone={proposalActionCount ? "purple" : "neutral"}>{proposalActionCount} pedem proposta/agendamento</CrmBadge>}
          />
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="pipeline-highlight-card rounded-[18px] border border-[var(--cliente-border)] p-4">
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
            <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
              <p className="text-[11px] font-black uppercase text-[var(--cliente-ai)]">Leitura da IA</p>
              <p className="mt-2 text-sm font-black text-[var(--cliente-card-text)]">{hotAiCount} quente(s), {stuckCount} travado(s)</p>
              <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">Use o board para mover etapa, abrir conversa ou preparar proposta sem perder o contexto.</p>
            </div>
          </div>
        </CrmPanel>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <CrmPanel padded={false} className="pipeline-board-shell overflow-hidden xl:max-h-[calc(100vh-10rem)]">
          <div className="border-b border-[var(--cliente-border)] p-5">
            <CrmSectionTitle
              eyebrow="Pipeline"
              title="Etapas do funil"
              description="Board comercial com leitura direta: poucas informacoes por card, valor visivel e movimento rapido entre etapas."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {boardCanScroll ? <CrmBadge tone="neutral">role horizontalmente</CrmBadge> : null}
                  {boardCanScroll ? (
                    <>
                      <button
                        type="button"
                        onClick={() => scrollBoard("left")}
                        disabled={boardAtStart}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Rolar funil para a esquerda"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollBoard("right")}
                        disabled={boardAtEnd}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Rolar funil para a direita"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                  {!canOperate ? <CrmBadge tone="orange">somente leitura</CrmBadge> : null}
                </div>
              }
            />
          </div>

          <div
            ref={(node) => {
              boardScrollRef.current = node;
            }}
            onScroll={syncBoardState}
            className="client-scrollbar min-h-0 overflow-x-auto overflow-y-hidden p-4"
          >
            <div className="flex min-w-max gap-4 pb-2">
            {columns.map((column) => {
              const isDropTarget = dropStageId === column.stage.id;
              return (
                <section
                  key={column.stage.id}
                  className={`pipeline-column-shell flex max-h-[calc(100vh-18rem)] w-[320px] shrink-0 flex-col rounded-[18px] border transition ${isDropTarget ? "border-[var(--cliente-primary)] ring-2 ring-[var(--cliente-primary-soft)]" : "border-[var(--cliente-border)]"}`}
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
                  <header className="pipeline-column-head border-b border-[var(--cliente-border)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-black text-[var(--cliente-card-text)]">{column.stage.label || getPipelineStageLabel(column.stage.id)}</h2>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{column.count || column.items.length} oportunidades</p>
                      </div>
                      <CrmBadge tone="blue">{formatCrmMoney(column.totalValue)}</CrmBadge>
                    </div>
                    {column.stage.description ? <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{column.stage.description}</p> : null}
                  </header>

                  <div className="client-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
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
                        className={`pipeline-lead-card rounded-[16px] border bg-[var(--cliente-card)] p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.24)] ${lead.id === leadFromQuery ? "border-[var(--cliente-primary)]" : "border-[var(--cliente-border)]"}`}
                      >
                        <div className="flex items-start gap-3">
                          {canOperate ? <GripVertical className="mt-1 h-4 w-4 shrink-0 text-[var(--cliente-card-text-muted)]" /> : null}
                          <div className="min-w-0 flex-1">
                            <CrmAvatar name={lead.nome} subtitle={lead.empresa || lead.telefone || lead.email || "Sem empresa"} photoUrl={leadPhotoUrl(lead)} size="sm" />
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
          </div>
          </CrmPanel>

          <aside className="space-y-4 xl:sticky xl:top-[132px] xl:self-start">
          <CrmPanel>
            <CrmSectionTitle eyebrow="Foco" title="Detalhes da oportunidade" description="Contexto rapido para o gestor ou atendente decidir o proximo passo." />
            {selectedLead ? (
              <div className="mt-5 space-y-4">
                <CrmAvatar name={selectedLead.nome} subtitle={selectedLead.empresa || selectedLead.telefone || selectedLead.email} photoUrl={leadPhotoUrl(selectedLead)} size="lg" />
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
