"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Megaphone, Play, Plus, Save, Send, Trash2 } from "lucide-react";
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

type AudiencePreview = {
  summary: {
    totalLeads: number;
    matchedFilters: number;
    selectedByLimit: number;
    maxRecipients: number;
    estimatedSend: number;
    blockedByConsent: number;
    missingPhone: number;
    truncatedByLimit: boolean;
  };
  sample: Array<{
    leadId: string;
    nome: string;
    telefone: string;
    stage: string;
    origem: string;
    blockedByConsent: boolean;
  }>;
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
      "Oi {nome}, aqui e da ALTUM. Vi que voce demonstrou interesse e queria entender se ainda faz sentido conversar por aqui.",
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
  const { experienceMode, setExperienceMode } = useClienteShell();
  const searchParams = useSearchParams();
  const campaignFromQuery = searchParams.get("campaignId");
  const canManage = hasCapability("manage_automations");
  const allowAdvanced = experienceMode === "completo";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<AudiencePreview | null>(null);
  const [items, setItems] = useState<Campaign[]>([]);
  const [runs, setRodadas] = useState<RunItem[]>([]);
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
        setRodadas([]);
        return;
      }

      const nextItems = campaignsPayload.items || [];
      setItems(nextItems);
      setRodadas(campaignsPayload.runs || []);
      setUsers((usersPayload.items || []).filter((item) => item.userId));
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) return current;
        if (campaignFromQuery && nextItems.some((item) => item.id === campaignFromQuery)) return campaignFromQuery;
        return nextItems[0]?.id || null;
      });
    } catch {
      setError("Falha ao carregar campanhas outbound.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId, campaignFromQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    setAudiencePreview(null);
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
    setNotice(`Modelo base do modo ${businessProfile.label} aplicado.${offer ? ` Oferta foco: ${offer.title}.` : ""}`);
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

  async function handlePreview() {
    if (!tenant?.tenantId || !state.id || !canManage) return;
    setPreviewing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}/preview`, {
        method: "POST",
      });
      const payload = (await res.json()) as {
        error?: string;
        summary?: AudiencePreview["summary"];
        sample?: AudiencePreview["sample"];
      };
      if (!res.ok) {
        setError(payload.error || "Falha ao simular audiencia.");
        return;
      }
      setAudiencePreview({
        summary: payload.summary || {
          totalLeads: 0,
          matchedFilters: 0,
          selectedByLimit: 0,
          maxRecipients: 0,
          estimatedSend: 0,
          blockedByConsent: 0,
          missingPhone: 0,
          truncatedByLimit: false,
        },
        sample: payload.sample || [],
      });
      setNotice(
        `Simulacao pronta: ${payload.summary?.estimatedSend || 0} envios estimados, ${payload.summary?.blockedByConsent || 0} bloqueados por consentimento e ${payload.summary?.missingPhone || 0} sem telefone.`
      );
    } catch {
      setError("Falha ao simular audiencia da campanha.");
    } finally {
      setPreviewing(false);
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
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Campanhas de envio"
        subtitle="Disparos segmentados para reativacao, retorno comercial e contato ativo no WhatsApp."
        action={<StateBadge label="Envio via WhatsApp" tone="info" />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Campanhas" value={String(summary.total)} icon={Megaphone} trend="modelos salvos" />
        <MetricCard label="Ativas" value={String(summary.active)} icon={Play} trend="prontas para disparo" />
        <MetricCard label="Envios" value={String(summary.sent)} icon={Send} trend="ultimo acumulado registrado" />
        <MetricCard label="Rodadas" value={String(summary.runs)} icon={Save} trend="historico operacional" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle title={`Modo do negocio: ${businessProfile.label}`} subtitle="Contexto vertical usado para segmentacao e texto das campanhas." />
            <StateBadge label={businessProfile.id} tone="info" />
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.description}</p>
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Movimento comercial: {businessProfile.commercialMotion}</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Etapas naturais: {pipelineStages.map((item) => item.id).join(", ")}</p>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Modelo base do modo" subtitle="Base rapida de texto e segmentacao para campanhas mais coerentes." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <p className="text-sm font-semibold text-white">Cenario sugerido</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{playbookPreset.scripts[0]?.situation || "Sem cena sugerida."}</p>
              <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{playbookPreset.scripts[0]?.goal || ""}</p>
            </div>
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <p className="text-sm font-semibold text-white">Oferta em foco</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{playbookPreset.offers[0]?.title || "Sem oferta sugerida."}</p>
              <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{playbookPreset.offers[0]?.targetProfile || ""}</p>
            </div>
          </div>
          {canManage ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={applyBusinessCampaignPreset}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
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
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-2">
            {items.length === 0 ? (
              <EmptyState title="Nenhuma campanha criada" description="Monte campanhas de contato ativo, reativacao e retorno comercial." />
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    selectedId === item.id
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] hover:bg-[var(--cliente-surface-muted)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.maxRecipients} destinatarios maximos</p>
                    </div>
                    <StateBadge label={item.status} tone={item.status === "active" ? "success" : item.status === "paused" ? "warning" : "neutral"} />
                  </div>
                  <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(item.lastRunAt)}</p>
                </button>
              ))
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <CardTitle title={state.id ? "Editor de campanha" : "Nova campanha"} subtitle="Segmentacao, mensagem e disparo por conta." />
              <StateBadge label={canManage ? "editavel" : "somente leitura"} tone={canManage ? "info" : "neutral"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Nome" value={state.name} onChange={(value) => setState((current) => ({ ...current, name: value }))} placeholder="Reativacao de contatos quentes" disabled={!canManage} />
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
                  { value: "draft", label: "rascunho" },
                  { value: "active", label: "ativo" },
                  { value: "paused", label: "pausado" },
                ]}
                onChange={(value) => setState((current) => ({ ...current, status: value as Campaign["status"] }))}
                disabled={!canManage}
              />
              {allowAdvanced ? (
                <>
                  <SelectField
                    label="Heat"
                    value={state.filters.heat[0] || ""}
                    options={[
                      { value: "", label: "qualquer temperatura" },
                      { value: "frio", label: "frio" },
                      { value: "morno", label: "morno" },
                      { value: "quente", label: "quente" },
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
                    label="Etapas alvo"
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
                    <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Responsaveis alvo</span>
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
                      className="min-h-[112px] w-full rounded-xl border client-input px-3 py-2.5 text-sm"
                    >
                      {users.map((user) => (
                        <option key={user.userId} value={user.userId}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>

            <label className="mt-4 block space-y-1">
              <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Mensagem</span>
              <textarea
                value={state.messageTemplate}
                onChange={(event) => setState((current) => ({ ...current, messageTemplate: event.target.value }))}
                disabled={!canManage}
                placeholder="Oi {nome}, aqui e da ALTUM..."
                className="client-input min-h-[180px] w-full rounded-2xl px-3 py-3 text-sm"
              />
              <p className="text-xs text-[var(--cliente-card-text-soft)]">Variaveis: {"{nome}"}, {"{empresa}"}, {"{telefone}"}, {"{email}"}, {"{stage}"}, {"{origem}"}.</p>
            </label>
            {!allowAdvanced ? (
              <div className="mt-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text-soft)]">
                Filtros detalhados e simulacao de audiencia ficam no modo completo.
                <button
                  type="button"
                  onClick={() => setExperienceMode("completo")}
                  className="ml-2 inline-flex items-center gap-1 rounded-lg border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-2 py-1 font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
                >
                  Abrir completo
                </button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !state.name.trim() || !state.messageTemplate.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-55"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar campanha
                  </button>
                  {allowAdvanced && state.id ? (
                    <button
                      type="button"
                      onClick={() => void handlePreview()}
                      disabled={previewing}
                      className="inline-flex items-center gap-2 rounded-xl border border-sky-300/25 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/16 disabled:opacity-55"
                    >
                      {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Simular audiencia
                    </button>
                  ) : null}
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

            {allowAdvanced && audiencePreview ? (
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <CardTitle title="Simulacao de audiencia" subtitle="Estimativa antes de executar o disparo real." />
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Contatos na conta</p>
                    <p className="mt-1 text-sm font-semibold text-white">{audiencePreview.summary.totalLeads}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Correspondencia de filtros</p>
                    <p className="mt-1 text-sm font-semibold text-white">{audiencePreview.summary.matchedFilters}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Envios estimados</p>
                    <p className="mt-1 text-sm font-semibold text-white">{audiencePreview.summary.estimatedSend}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">
                  Selecionados pelo limite: {audiencePreview.summary.selectedByLimit} de no maximo {audiencePreview.summary.maxRecipients}. Bloqueados por consentimento: {audiencePreview.summary.blockedByConsent}. Sem telefone: {audiencePreview.summary.missingPhone}.
                </p>
                {audiencePreview.summary.truncatedByLimit ? (
                  <p className="mt-1 text-xs text-amber-100">
                    A audiencia foi limitada pelo maximo de destinatarios da campanha.
                  </p>
                ) : null}
                {audiencePreview.sample.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {audiencePreview.sample.slice(0, 6).map((lead) => (
                      <div key={lead.leadId} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs text-[var(--cliente-card-text)]">
                        {lead.nome} · {lead.telefone || "sem telefone"} · {lead.stage || "sem etapa"} · {lead.origem || "sem origem"}
                        {lead.blockedByConsent ? " · sem permissao no WhatsApp" : ""}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </PanelCard>

          <PanelCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Historico de rodadas" subtitle="Ultimos disparos e volume processado na conta" />
              <StateBadge label={`${runs.length} rodada(s)`} tone="info" />
            </div>
            <div className="mt-4 space-y-2">
              {runs.length === 0 ? (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao houve disparos registrados.</p>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{run.campaignName}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(run.createdAt)}</p>
                      </div>
                      <StateBadge label={`${run.summary.sent} enviados`} tone="success" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--cliente-card-text-muted)]">
                      <span>Correspondencia: {run.summary.totalMatched}</span>
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
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="client-input w-full rounded-xl px-3 py-2.5 text-sm"
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
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
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

