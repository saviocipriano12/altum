"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Megaphone, Play, Plus, Save, Send, Trash2 } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import {
  getBusinessProfile,
  getBusinessProfilePipelineStages,
  getBusinessProfilePlaybookPreset,
  type BusinessProfileId,
} from "@/lib/business-profiles";

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  channel: "whatsapp";
  messageTemplate: string;
  maxRecipients: number;
  filters: {
    stageIds: string[];
    ownerIds: string[];
    sources: string[];
    tags: string[];
    heat: string[];
  };
  lastRunAt?: string | null;
  lastRunSummary?: {
    sent: number;
    skipped: number;
    failed: number;
    totalMatched: number;
  } | null;
};

type CampaignEditorState = Omit<Campaign, "channel" | "lastRunAt" | "lastRunSummary">;

type RunItem = {
  id: string;
  campaignId: string;
  campaignName: string;
  createdAt?: string | null;
  summary: {
    sent: number;
    skipped: number;
    failed: number;
    totalMatched: number;
  };
};

type TenantSettingsResponse = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

function emptyCampaign(): CampaignEditorState {
  return {
    id: "",
    name: "",
    status: "draft",
    messageTemplate:
      "Oi {nome}, aqui é da ALTUM. Vi que você demonstrou interesse e queria entender se ainda faz sentido conversar por aqui.",
    maxRecipients: 50,
    filters: {
      stageIds: [] as string[],
      ownerIds: [] as string[],
      sources: [] as string[],
      tags: [] as string[],
      heat: [] as string[],
    },
  };
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("pt-BR");
}

function listValue(value: string[]) {
  return value.join(", ");
}

function parseList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

export default function ClienteCampanhasPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_automations");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<Campaign[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [users, setUsers] = useState<Array<{ userId?: string; name?: string }>>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<CampaignEditorState>(emptyCampaign());
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const playbookPreset = useMemo(() => getBusinessProfilePlaybookPreset(businessProfileId), [businessProfileId]);
  const pipelineStages = useMemo(() => getBusinessProfilePipelineStages(businessProfileId), [businessProfileId]);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [campaignsRes, usersRes, settingsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns`),
        authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
      ]);
      const campaignsPayload = (await campaignsRes.json()) as {
        items?: Campaign[];
        runs?: RunItem[];
        error?: string;
      };
      const usersPayload = (await usersRes.json()) as {
        items?: Array<{ userId?: string; name?: string }>;
      };
      const settingsPayload = (await settingsRes.json()) as TenantSettingsResponse;

      if (!campaignsRes.ok) {
        setError(campaignsPayload.error || "Falha ao carregar campanhas outbound.");
        setItems([]);
        setRuns([]);
        return;
      }

      const nextItems = campaignsPayload.items || [];
      setItems(nextItems);
      setRuns(campaignsPayload.runs || []);
      setUsers((usersPayload.items || []).filter((item) => item.userId));
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setSelectedId((current) => (current && nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id || null));
    } catch {
      setError("Falha ao carregar campanhas outbound.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    if (!selected) {
      setState(emptyCampaign());
      return;
    }
    setState({
      id: selected.id,
      name: selected.name,
      status: selected.status,
      messageTemplate: selected.messageTemplate,
      maxRecipients: selected.maxRecipients,
      filters: selected.filters,
    });
  }, [selected]);

  const summary = useMemo(() => {
    const sent = items.reduce((sum, item) => sum + Number(item.lastRunSummary?.sent || 0), 0);
    const active = items.filter((item) => item.status === "active").length;
    return {
      total: items.length,
      active,
      sent,
      runs: runs.length,
    };
  }, [items, runs]);

  function handleCreate() {
    if (!canManage) return;
    setSelectedId(null);
    setState({
      ...emptyCampaign(),
      name: `Campanha ${items.length + 1}`,
      filters: {
        stageIds: pipelineStages.slice(0, 2).map((item) => item.id),
        ownerIds: [],
        sources: [],
        tags: [],
        heat: [],
      },
    });
    setNotice(null);
    setError(null);
  }

  function applyBusinessCampaignPreset() {
    const conversation = playbookPreset.scripts[0];
    const offer = playbookPreset.offers[0];

    setState((current) => ({
      ...current,
      name: current.name || `Outbound ${businessProfile.label}`,
      messageTemplate:
        conversation?.script ||
        current.messageTemplate,
      filters: {
        ...current.filters,
        stageIds: current.filters.stageIds.length > 0 ? current.filters.stageIds : pipelineStages.slice(0, 2).map((item) => item.id),
        tags: current.filters.tags.length > 0 ? current.filters.tags : businessProfile.crm.suggestedTags.slice(0, 2).map((item) => item.toLowerCase()),
      },
    }));
    setNotice(`Preset outbound do modo ${businessProfile.label} aplicado.${offer ? ` Oferta foco: ${offer.title}.` : ""}`);
    setError(null);
  }

  async function handleSave() {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        name: state.name,
        status: state.status,
        messageTemplate: state.messageTemplate,
        maxRecipients: state.maxRecipients,
        filters: state.filters,
      };
      const isEditing = Boolean(state.id);
      const path = isEditing
        ? `/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}`
        : `/api/tenant/${tenant.tenantId}/outbound-campaigns`;
      const method = isEditing ? "PATCH" : "POST";
      const res = await authedFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error?: string; campaignId?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar campanha.");
        return;
      }
      await loadData();
      if (!isEditing && payload.campaignId) setSelectedId(payload.campaignId);
      setNotice(isEditing ? "Campanha atualizada." : "Campanha criada.");
    } catch {
      setError("Falha ao salvar campanha.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDispatch() {
    if (!tenant?.tenantId || !state.id || !canManage) return;
    setDispatching(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}/dispatch`, {
        method: "POST",
      });
      const payload = (await res.json()) as {
        error?: string;
        summary?: { sent: number; skipped: number; failed: number; totalMatched: number };
      };
      if (!res.ok) {
        setError(payload.error || "Falha ao disparar campanha.");
        return;
      }
      await loadData();
      setNotice(
        `Campanha enviada: ${payload.summary?.sent || 0} disparos, ${payload.summary?.skipped || 0} pulados, ${payload.summary?.failed || 0} falhas.`
      );
    } catch {
      setError("Falha ao disparar campanha.");
    } finally {
      setDispatching(false);
    }
  }

  async function handleDelete() {
    if (!tenant?.tenantId || !state.id || !canManage) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao remover campanha.");
        return;
      }
      await loadData();
      setSelectedId(null);
      setState(emptyCampaign());
      setNotice("Campanha removida.");
    } catch {
      setError("Falha ao remover campanha.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Campanhas outbound"
        subtitle="Disparos segmentados por tenant para reativacao, follow-up comercial e outreach no WhatsApp."
        action={<StateBadge label="WhatsApp outbound" tone="info" />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Campanhas" value={String(summary.total)} icon={Megaphone} trend="playbooks salvos" />
        <MetricCard label="Ativas" value={String(summary.active)} icon={Play} trend="prontas para disparo" />
        <MetricCard label="Envios" value={String(summary.sent)} icon={Send} trend="ultimo acumulado registrado" />
        <MetricCard label="Runs" value={String(summary.runs)} icon={Save} trend="historico operacional" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle title={`Modo do negocio: ${businessProfile.label}`} subtitle="Contexto vertical usado para segmentação e copy de outbound." />
            <StateBadge label={businessProfile.id} tone="info" />
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-white/72">{businessProfile.description}</p>
            <p className="mt-3 text-sm text-white/58">Movimento comercial: {businessProfile.commercialMotion}</p>
            <p className="mt-2 text-sm text-white/58">Stages naturais: {pipelineStages.map((item) => item.id).join(", ")}</p>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Preset outbound do modo" subtitle="Base rápida de copy e segmentação para campanhas mais coerentes." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">Cenário sugerido</p>
              <p className="mt-2 text-sm text-white/60">{playbookPreset.scripts[0]?.situation || "Sem cena sugerida."}</p>
              <p className="mt-2 text-xs text-white/48">{playbookPreset.scripts[0]?.goal || ""}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">Oferta em foco</p>
              <p className="mt-2 text-sm text-white/60">{playbookPreset.offers[0]?.title || "Sem oferta sugerida."}</p>
              <p className="mt-2 text-xs text-white/48">{playbookPreset.offers[0]?.targetProfile || ""}</p>
            </div>
          </div>
          {canManage ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={applyBusinessCampaignPreset}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/15"
              >
                <Megaphone className="h-3.5 w-3.5" />
                Aplicar preset do modo
              </button>
            </div>
          ) : null}
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <PanelCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Campanhas" subtitle={`${items.length} registradas`} />
            {canManage ? (
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.08]"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-2">
            {items.length === 0 ? (
              <EmptyState title="Nenhuma campanha criada" description="Monte playbooks de outreach, reativacao e follow-up comercial." />
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    selectedId === item.id
                      ? "border-blue-300/35 bg-blue-400/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-white/52">{item.maxRecipients} destinatarios maximos</p>
                    </div>
                    <StateBadge label={item.status} tone={item.status === "active" ? "success" : item.status === "paused" ? "warning" : "neutral"} />
                  </div>
                  <p className="mt-3 text-xs text-white/45">{formatDate(item.lastRunAt)}</p>
                </button>
              ))
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <CardTitle title={state.id ? "Editor de campanha" : "Nova campanha"} subtitle="Segmentacao, mensagem e disparo por tenant." />
              <StateBadge label={canManage ? "editavel" : "somente leitura"} tone={canManage ? "info" : "neutral"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Nome" value={state.name} onChange={(value) => setState((current) => ({ ...current, name: value }))} placeholder="Reativacao leads quentes" disabled={!canManage} />
              <Field
                label="Maximo de destinatarios"
                value={String(state.maxRecipients)}
                onChange={(value) => setState((current) => ({ ...current, maxRecipients: Math.max(1, Math.min(500, Number(value || 1) || 1)) }))}
                placeholder="50"
                disabled={!canManage}
              />
              <SelectField
                label="Status"
                value={state.status}
                options={[
                  { value: "draft", label: "draft" },
                  { value: "active", label: "active" },
                  { value: "paused", label: "paused" },
                ]}
                onChange={(value) => setState((current) => ({ ...current, status: value as Campaign["status"] }))}
                disabled={!canManage}
              />
              <SelectField
                label="Heat"
                value={state.filters.heat[0] || ""}
                options={[
                  { value: "", label: "qualquer temperatura" },
                  { value: "cold", label: "cold" },
                  { value: "warm", label: "warm" },
                  { value: "hot", label: "hot" },
                ]}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    filters: { ...current.filters, heat: value ? [value] : [] },
                  }))
                }
                disabled={!canManage}
              />
              <Field
                label="Stages alvo"
                value={listValue(state.filters.stageIds)}
                onChange={(value) => setState((current) => ({ ...current, filters: { ...current.filters, stageIds: parseList(value) } }))}
                placeholder={pipelineStages.map((item) => item.id).slice(0, 3).join(", ")}
                disabled={!canManage}
              />
              <Field
                label="Origens"
                value={listValue(state.filters.sources)}
                onChange={(value) => setState((current) => ({ ...current, filters: { ...current.filters, sources: parseList(value) } }))}
                placeholder="meta_ads, google_ads, lp_clinica"
                disabled={!canManage}
              />
              <Field
                label="Tags"
                value={listValue(state.filters.tags)}
                onChange={(value) => setState((current) => ({ ...current, filters: { ...current.filters, tags: parseList(value) } }))}
                placeholder="reativacao, vip, proposta"
                disabled={!canManage}
              />
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-white/55">Owners alvo</span>
                <select
                  multiple
                  value={state.filters.ownerIds}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      filters: {
                        ...current.filters,
                        ownerIds: Array.from(event.target.selectedOptions).map((option) => option.value),
                      },
                    }))
                  }
                  disabled={!canManage}
                  className="min-h-[112px] w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                >
                  {users.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block space-y-1">
              <span className="text-xs uppercase tracking-[0.14em] text-white/55">Mensagem</span>
              <textarea
                value={state.messageTemplate}
                onChange={(event) => setState((current) => ({ ...current, messageTemplate: event.target.value }))}
                disabled={!canManage}
                placeholder="Oi {nome}, aqui é da ALTUM..."
                className="min-h-[180px] w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35"
              />
              <p className="text-xs text-white/42">Variaveis: {"{nome}"}, {"{empresa}"}, {"{telefone}"}, {"{email}"}, {"{stage}"}, {"{origem}"}.</p>
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !state.name.trim() || !state.messageTemplate.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-55"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar campanha
                  </button>
                  {state.id ? (
                    <button
                      type="button"
                      onClick={() => void handleDispatch()}
                      disabled={dispatching || state.status === "paused"}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/16 disabled:opacity-55"
                    >
                      {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Disparar agora
                    </button>
                  ) : null}
                  {state.id ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:opacity-55"
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Remover
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Historico de runs" subtitle="Ultimos disparos e volume processado pelo tenant" />
              <StateBadge label={`${runs.length} run(s)`} tone="info" />
            </div>
            <div className="mt-4 space-y-2">
              {runs.length === 0 ? (
                <p className="text-sm text-white/52">Ainda nao houve disparos registrados.</p>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{run.campaignName}</p>
                        <p className="mt-1 text-xs text-white/48">{formatDate(run.createdAt)}</p>
                      </div>
                      <StateBadge label={`${run.summary.sent} enviados`} tone="success" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/58">
                      <span>Match: {run.summary.totalMatched}</span>
                      <span>Pulados: {run.summary.skipped}</span>
                      <span>Falhas: {run.summary.failed}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
