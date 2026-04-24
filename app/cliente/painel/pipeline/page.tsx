"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CircleDollarSign,
  GripVertical,
  LayoutList,
  Loader2,
  Settings2,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import {
  getDefaultPipelineStages,
  normalizePipelineStages,
  type PipelineStageDefinition,
} from "@/lib/pipeline";
import { getBusinessProfile, getBusinessProfilePipelineStages, type BusinessProfileId } from "@/lib/business-profiles";

type PipelineLead = {
  id: string;
  nome: string;
  empresa?: string;
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
};

type PipelineColumn = {
  stage: PipelineStageDefinition;
  count: number;
  totalValue: number;
  avgScore: number;
  avgAgeDays: number;
  items: PipelineLead[];
};

type PipelineResponse = {
  stages?: PipelineStageDefinition[];
  columns?: PipelineColumn[];
  owners?: Array<{
    userId: string;
    name: string;
  }>;
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

type SettingsPayload = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toneFromPriority(value?: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "high" || normalized === "alta") return "danger" as const;
  if (normalized === "medium" || normalized === "media") return "warning" as const;
  if (normalized === "low" || normalized === "baixa") return "neutral" as const;
  return "info" as const;
}

function toneFromHeat(value?: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "quente") return "danger" as const;
  if (normalized === "morno") return "warning" as const;
  if (normalized === "frio") return "neutral" as const;
  return "info" as const;
}

function StageEditor({
  stages,
  owners,
  onChange,
  onReset,
  onSave,
  saving,
}: {
  stages: PipelineStageDefinition[];
  owners: Array<{ userId: string; name: string }>;
  onChange: (index: number, field: keyof PipelineStageDefinition, value: string) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle title="Configuracao do funil" subtitle="Ajuste nomes, descricoes e cor das etapas deste tenant." />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
          >
            Resetar padrao
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-sm font-medium text-[var(--cliente-accent)] transition hover:brightness-95 disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar etapas"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {stages.map((stage, index) => (
          <div key={`${stage.id}_${index}`} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_88px]">
              <label className="space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                <span>Nome</span>
                <input
                  value={stage.label}
                  onChange={(event) => onChange(index, "label", event.target.value)}
                  className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                <span>Descricao</span>
                <input
                  value={stage.description}
                  onChange={(event) => onChange(index, "description", event.target.value)}
                  className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                <span>Cor</span>
                <input
                  type="color"
                  value={stage.color}
                  onChange={(event) => onChange(index, "color", event.target.value)}
                  className="h-[42px] w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-1"
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                <span>SLA (h)</span>
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={stage.slaHours ?? ""}
                  onChange={(event) => onChange(index, "slaHours", event.target.value)}
                  className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                <span>Retorno (h)</span>
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={stage.followUpHours ?? ""}
                  onChange={(event) => onChange(index, "followUpHours", event.target.value)}
                  className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] outline-none"
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                <span>Responsavel</span>
                <select
                  value={stage.ownerUserId || ""}
                  onChange={(event) => {
                    const owner = owners.find((item) => item.userId === event.target.value);
                    onChange(index, "ownerUserId", event.target.value);
                    onChange(index, "ownerName", owner?.name || "");
                  }}
                  className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] outline-none"
                >
                  <option value="">Sem responsavel fixo</option>
                  {owners.map((owner) => (
                    <option key={owner.userId} value={owner.userId}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

export default function ClientePipelinePage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const stageFromQuery = searchParams.get("stage");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stageDraft, setStageDraft] = useState<PipelineStageDefinition[]>(getDefaultPipelineStages());
  const [savingStages, setSavingStages] = useState(false);

  const canOperate = hasCapability("manage_pipeline") || hasCapability("edit_leads");
  const canManage = hasCapability("manage_pipeline");
  const allowAdvanced = experienceMode === "completo";

  const loadPipeline = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [res, settingsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
      ]);
      const payload = (await res.json()) as PipelineResponse;
      const settingsPayload = (await settingsRes.json().catch(() => ({}))) as SettingsPayload;

      if (!res.ok) {
        setError(payload.error || "Falha ao carregar pipeline.");
        setData(null);
        return;
      }

      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setData(payload);
      setStageDraft(normalizePipelineStages(payload.stages));
    } catch {
      setError("Falha ao carregar pipeline.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  useEffect(() => {
    if (!allowAdvanced) {
      setSettingsOpen(false);
    }
  }, [allowAdvanced]);

  const stages = useMemo(() => data?.stages || getDefaultPipelineStages(), [data?.stages]);
  const owners = useMemo(() => data?.owners || [], [data?.owners]);
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const columns = useMemo(() => data?.columns || [], [data?.columns]);
  const summary = data?.summary;
  const normalizedSearch = search.trim().toLowerCase();

  const topStage = useMemo(() => {
    return [...columns].sort((a, b) => b.count - a.count)[0] || null;
  }, [columns]);

  const stalledStage = useMemo(() => {
    return [...columns].sort((a, b) => b.avgAgeDays - a.avgAgeDays)[0] || null;
  }, [columns]);

  const selectedLeadContext = useMemo(() => {
    if (!leadFromQuery) return null;
    for (const column of columns) {
      const lead = column.items.find((item) => item.id === leadFromQuery);
      if (lead) {
        return { lead, column };
      }
    }
    return null;
  }, [columns, leadFromQuery]);

  async function moveLead(leadId: string, stageId: string) {
    if (!tenant?.tenantId || !canOperate) return;

    try {
      setMovingLeadId(leadId);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: stageId }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Falha ao mover contato.");
      }

      await loadPipeline();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Falha ao mover contato.");
    } finally {
      setMovingLeadId(null);
      setDragLeadId(null);
      setDropStageId(null);
    }
  }

  async function saveStages() {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setSavingStages(true);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: stageDraft }),
      });

      const payload = (await res.json().catch(() => ({}))) as PipelineResponse;
      if (!res.ok) {
        throw new Error(payload.error || "Falha ao salvar configuracao do pipeline.");
      }

      setSettingsOpen(false);
      await loadPipeline();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar configuracao do pipeline.");
    } finally {
      setSavingStages(false);
    }
  }

  function updateDraft(index: number, field: keyof PipelineStageDefinition, value: string) {
    const normalizedValue =
      field === "slaHours" || field === "followUpHours"
        ? value === ""
          ? null
          : Number(value)
        : value;
    setStageDraft((current) =>
      current.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, [field]: normalizedValue } : stage
      )
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Nao foi possivel carregar o pipeline comercial"
        description={error || "Tente novamente em alguns segundos."}
        action={
          <button
            type="button"
            onClick={loadPipeline}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2 text-sm text-[var(--cliente-card-text)]/86 transition hover:bg-[var(--cliente-surface-muted)]"
          >
            Recarregar pipeline
          </button>
        }
      />
    );
  }

  return (
    <div className="client-daily-page space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <SectionHeader
        title="Pipeline comercial"
        subtitle={
          allowAdvanced
            ? "Kanban operacional do tenant, com gargalos, valor em aberto e fluxo real de oportunidade."
            : "Kanban diario com foco em andamento das oportunidades e proxima acao."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-1">
              <button
                type="button"
                onClick={() => setExperienceMode("essencial")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  !allowAdvanced
                    ? "bg-[var(--cliente-accent)] text-white"
                    : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                }`}
              >
                Modo simples
              </button>
              <button
                type="button"
                onClick={() => setExperienceMode("completo")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  allowAdvanced
                    ? "bg-[var(--cliente-accent)] text-white"
                    : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                }`}
              >
                Modo completo
              </button>
            </div>
            {!canOperate ? <StateBadge label="somente leitura" tone="warning" /> : null}
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  if (!allowAdvanced) {
                    setExperienceMode("completo");
                    return;
                  }
                  setSettingsOpen((current) => !current);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <Settings2 className="h-4 w-4" />
                {allowAdvanced ? "Configurar funil" : "Ativar completo p/ configurar"}
              </button>
            ) : null}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Oportunidades"
          value={String(summary?.totalLeads || 0)}
          icon={LayoutList}
          trend={`${summary?.openCount || 0} abertas`}
        />
        <MetricCard
          label="Valor em aberto"
          value={brl(Number(summary?.totalValue || 0))}
          icon={CircleDollarSign}
          trend="funil ponderado"
        />
        <MetricCard
          label="Ganhas"
          value={String(summary?.wonCount || 0)}
          icon={Trophy}
          trend={`${summary?.winRate || 0}% de taxa de ganho`}
        />
        <MetricCard
          label="Risco atual"
          value={`${stalledStage?.avgAgeDays || 0}d`}
          icon={TimerReset}
          trend={stalledStage ? stalledStage.stage.label : "sem gargalos"}
        />
      </section>

      <section className={`grid gap-4 ${allowAdvanced ? "xl:grid-cols-[1.2fr_0.8fr]" : "xl:grid-cols-1"}`}>
        <PanelCard className="p-4">
          <CardTitle title="Leitura do funil" subtitle="Onde a operacao esta concentrada e qual etapa esta mais lenta." />
          <label className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)]/72">
            <Target className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar contato, empresa, origem ou tag no kanban"
              className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text)]/30"
            />
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <div className="inline-flex rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] p-2 text-[var(--cliente-accent)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Maior concentracao</p>
              <p className="mt-1 text-xl font-semibold text-[var(--cliente-card-text)]">{topStage?.stage.label || "Sem dados"}</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">
                {topStage ? `${topStage.count} contatos e ${brl(topStage.totalValue)} em valor potencial.` : "Nenhuma etapa com volume relevante."}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <div className="inline-flex rounded-xl border border-amber-400/20 bg-amber-500/10 p-2 text-amber-100">
                <Target className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Gargalo atual</p>
              <p className="mt-1 text-xl font-semibold text-[var(--cliente-card-text)]">{stalledStage?.stage.label || "Sem gargalo"}</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">
                {stalledStage ? `${stalledStage.avgAgeDays} dias em media nesta etapa.` : "Tempo de permanencia ainda sem sinal de risco."}
              </p>
            </div>
          </div>
        </PanelCard>

        {allowAdvanced ? (
          <PanelCard className="p-4">
            <CardTitle title="Governanca do funil" subtitle="Etapas atuais ativas no tenant." />
            <div className="mt-4 space-y-2">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    <div>
                      <p className="text-sm font-medium text-[var(--cliente-card-text)]">{stage.label}</p>
                      <p className="text-xs text-[var(--cliente-card-text-soft)]">
                        {stage.description}
                        {stage.slaHours ? ` | SLA ${stage.slaHours}h` : ""}
                        {stage.ownerName ? ` | ${stage.ownerName}` : ""}
                      </p>
                    </div>
                  </div>
                  <StateBadge label={stage.isTerminal ? "terminal" : "ativa"} tone={stage.isTerminal ? "neutral" : "info"} />
                </div>
              ))}
            </div>
          </PanelCard>
        ) : null}
      </section>

      {allowAdvanced ? (
        <PanelCard className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle
              title={`Modo do negocio: ${businessProfile.label}`}
              subtitle="Esse perfil orienta o funil sugerido, a leitura comercial e a especializacao do tenant."
            />
            <StateBadge label={businessProfile.id} tone="info" />
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Leitura operacional</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.description}</p>
              <p className="mt-3 text-sm text-[var(--cliente-card-text)]/72">
                Movimento esperado: <span className="text-[var(--cliente-card-text)]">{businessProfile.commercialMotion}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Metricas naturais deste modo</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {businessProfile.metrics.map((metric) => (
                  <StateBadge key={metric} label={metric} tone="neutral" />
                ))}
              </div>
            </div>
          </div>
        </PanelCard>
      ) : (
        <PanelCard className="p-4">
          <CardTitle title="Modo essencial ativo" subtitle="Exibindo apenas o kanban e sinais principais para rotina diaria." />
          <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
            Para ajustar etapas, SLA, responsaveis e leitura por perfil de negocio, use o modo completo.
          </p>
          <button
            type="button"
            onClick={() => setExperienceMode("completo")}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
          >
            Abrir modo completo
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </PanelCard>
      )}

      {selectedLeadContext ? (
        <PanelCard className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle
                title="Contato em foco"
                subtitle="Este contato chegou ao funil a partir de outro modulo e esta destacado no kanban abaixo."
              />
              <p className="mt-3 text-lg font-semibold text-[var(--cliente-card-text)]">{selectedLeadContext.lead.nome}</p>
              <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                {selectedLeadContext.lead.empresa || selectedLeadContext.lead.source || "Origem nao informada"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StateBadge label={selectedLeadContext.column.stage.label} tone="info" />
              {selectedLeadContext.lead.priority ? (
                <StateBadge label={selectedLeadContext.lead.priority} tone={toneFromPriority(selectedLeadContext.lead.priority)} />
              ) : null}
              {selectedLeadContext.lead.heat ? (
                <StateBadge label={selectedLeadContext.lead.heat} tone={toneFromHeat(selectedLeadContext.lead.heat)} />
              ) : null}
            </div>
          </div>
        </PanelCard>
      ) : null}

      {settingsOpen && canManage && allowAdvanced ? (
        <StageEditor
          stages={stageDraft}
          owners={owners}
          onChange={updateDraft}
          onReset={() => setStageDraft(getBusinessProfilePipelineStages(businessProfileId))}
          onSave={saveStages}
          saving={savingStages}
        />
      ) : null}

      {settingsOpen && canManage && !allowAdvanced ? (
        <PanelCard className="p-4">
          <CardTitle title="Configuracao avancada protegida" subtitle="No modo essencial escondemos ajustes estruturais do funil." />
          <button
            type="button"
            onClick={() => setExperienceMode("completo")}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
          >
            Ativar modo completo
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </PanelCard>
      ) : null}

      <PanelCard className="overflow-hidden p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle title="Kanban do tenant" subtitle="Arraste as oportunidades entre etapas ou abra o contato completo no CRM." />
          {movingLeadId ? <StateBadge label="movendo contato" tone="info" /> : null}
        </div>

        <div className="mt-4 overflow-x-auto pb-2">
          <div className="flex min-w-[1180px] gap-4">
            {columns.map((column) => {
              const isDropTarget = dropStageId === column.stage.id;
              const isStageFocus = stageFromQuery === column.stage.id;
              const isLeadFocus = selectedLeadContext?.column.stage.id === column.stage.id;

              return (
                <section
                  key={column.stage.id}
                  onDragOver={(event) => {
                    if (!canOperate) return;
                    event.preventDefault();
                    setDropStageId(column.stage.id);
                  }}
                  onDragLeave={() => setDropStageId((current) => (current === column.stage.id ? null : current))}
                  onDrop={(event) => {
                    if (!canOperate) return;
                    event.preventDefault();
                    const leadId = event.dataTransfer.getData("text/plain") || dragLeadId;
                    if (leadId) {
                      moveLead(leadId, column.stage.id);
                    }
                  }}
                  className={`flex w-[320px] shrink-0 flex-col rounded-2xl border p-3 transition ${
                    isDropTarget
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                      : isStageFocus || isLeadFocus
                        ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                        : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)]"
                  }`}
                >
                  <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: column.stage.color }} />
                          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{column.stage.label}</p>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{column.stage.description}</p>
                      </div>
                      <StateBadge label={`${column.count} contatos`} tone="info" />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Valor</p>
                        <p className="mt-1 text-sm font-medium text-[var(--cliente-card-text)]">{brl(column.totalValue)}</p>
                      </div>
                      <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Tempo medio</p>
                        <p className="mt-1 text-sm font-medium text-[var(--cliente-card-text)]">{column.avgAgeDays}d</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-1 flex-col gap-3">
                    {column.items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                        Nenhuma oportunidade nesta etapa.
                      </div>
                    ) : (
                      column.items
                        .filter((lead) => {
                          if (!normalizedSearch) return true;
                          return [
                            lead.nome,
                            lead.empresa,
                            lead.source,
                            lead.owner,
                            ...(lead.tags || []),
                          ]
                            .join(" ")
                            .toLowerCase()
                            .includes(normalizedSearch);
                        })
                        .map((lead) => (
                        <article
                          key={lead.id}
                          draggable={canOperate}
                          onDragStart={(event) => {
                            if (!canOperate) return;
                            event.dataTransfer.setData("text/plain", lead.id);
                            setDragLeadId(lead.id);
                          }}
                          onDragEnd={() => {
                            setDragLeadId(null);
                            setDropStageId(null);
                          }}
                          className={`rounded-2xl border p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)] ${
                            lead.id === leadFromQuery
                              ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                              : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{lead.nome || "Contato sem nome"}</p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{lead.empresa || lead.source || "Origem nao informada"}</p>
                            </div>
                            {canOperate ? <GripVertical className="mt-0.5 h-4 w-4 text-[var(--cliente-card-text)]/28" /> : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {lead.priority ? (
                              <StateBadge label={lead.priority} tone={toneFromPriority(lead.priority)} />
                            ) : null}
                            {lead.heat ? <StateBadge label={lead.heat} tone={toneFromHeat(lead.heat)} /> : null}
                            {lead.score ? <StateBadge label={`pontuacao ${lead.score}`} tone="info" /> : null}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--cliente-card-text-muted)]">
                            <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-2">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Valor</p>
                              <p className="mt-1 text-sm font-medium text-[var(--cliente-card-text)]">{brl(Number(lead.potentialValue || 0))}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-2">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Tempo</p>
                              <p className="mt-1 text-sm font-medium text-[var(--cliente-card-text)]">{lead.ageDays || 0}d</p>
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-[var(--cliente-card-text-soft)]">
                            <p>Responsavel: {lead.owner || "Nao atribuido"}</p>
                            <p>Status: {lead.status || "novo"}</p>
                          </div>

                          {lead.tags?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {lead.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2 py-1 text-[11px] text-[var(--cliente-card-text-muted)]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-4 flex items-center justify-between gap-2">
                            <div className="flex gap-2">
                              <Link
                                href={`/cliente/painel/crm?leadId=${encodeURIComponent(lead.id)}`}
                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                              >
                                Abrir contato
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                              <Link
                                href={`/cliente/painel/comercial?leadId=${encodeURIComponent(lead.id)}`}
                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                              >
                                Comercial
                              </Link>
                              <Link
                                href={`/cliente/painel/inbox?leadId=${encodeURIComponent(lead.id)}`}
                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                              >
                                Inbox
                              </Link>
                            </div>
                            {movingLeadId === lead.id ? <Loader2 className="h-4 w-4 animate-spin text-[var(--cliente-accent)]" /> : null}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

