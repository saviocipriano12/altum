"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Filter,
  Globe2,
  Loader2,
  Megaphone,
  MessageCircle,
  PencilLine,
  Play,
  Plus,
  Save,
  Send,
  Sparkles,
  Target,
  Trash2,
  Wand2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import {
  CardTitle,
  ClientActionButton,
  EmptyState,
  MetricCard,
  PanelCard,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import {
  getBusinessProfile,
  getBusinessProfilePipelineStages,
  getBusinessProfilePlaybookPreset,
  type BusinessProfileId,
} from "@/lib/business-profiles";

type CampaignStatus = "draft" | "active" | "paused";
type CampaignObjective = "reativacao" | "proposta" | "leads_quentes" | "pos_venda" | "oferta";

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
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

type CampaignEditorState = Omit<Campaign, "channel" | "lastRunAt" | "lastRunSummary"> & {
  objective: CampaignObjective;
  offerId: string;
};

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

type PaidCampaign = {
  key: string;
  label: string;
  source?: string | null;
  lastTouchLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  meetings: number;
  spend: number;
  clicks: number;
  impressions: number;
  paidLeads: number;
  cpl: number;
  qualifiedCpl: number;
  costPerMeeting: number;
  costPerSale: number;
};

type MetricsSummary = {
  metrics?: {
    totalLeads: number;
    qualifiedLeads: number;
    meetings: number;
    wonLeads: number;
    paidRevenue: number;
    roi: number;
  };
  traffic?: {
    impressions: number;
    clicks: number;
    spend: number;
    leads: number;
    ctr: number;
    cpc: number;
    cpl: number;
  };
  commercialAttribution?: {
    byCampaign?: PaidCampaign[];
    byChannel?: Array<PaidCampaign & { campaignCount?: number | null }>;
  };
};

type CaptureFormsPayload = {
  forms?: Array<{
    id: string;
    name: string;
    status?: string;
    submissionsCount?: number;
    lastSubmissionAt?: string | null;
  }>;
  recentSubmissions?: Array<{
    id: string;
    formName: string;
    leadName: string;
    createdAt?: string | null;
  }>;
  topCampaigns?: Array<{ label: string; total: number }>;
  formPerformance?: Array<{ id: string; name: string; total: number; lastSubmissionAt?: string | null }>;
};

type CatalogDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  content?: string;
  mediaUrl?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
};

const OBJECTIVES: Array<{
  id: CampaignObjective;
  label: string;
  detail: string;
  tone: "info" | "success" | "warning" | "ai";
}> = [
  { id: "reativacao", label: "Reativar base", detail: "Contatos parados e leads sem resposta.", tone: "info" },
  { id: "proposta", label: "Follow-up de proposta", detail: "Retomar oportunidades com proposta aberta.", tone: "warning" },
  { id: "leads_quentes", label: "Leads quentes", detail: "Chamar quem esta perto da compra.", tone: "success" },
  { id: "pos_venda", label: "Pos-venda", detail: "Acompanhar, recomprar ou pedir retorno.", tone: "ai" },
  { id: "oferta", label: "Oferta do catalogo", detail: "Divulgar produto, servico ou pacote.", tone: "info" },
];

function emptyCampaign(): CampaignEditorState {
  return {
    id: "",
    name: "",
    status: "draft",
    objective: "reativacao",
    offerId: "",
    messageTemplate:
      "Oi {nome}, aqui e da ALTUM. Vi que voce demonstrou interesse e queria entender se ainda faz sentido conversar por aqui.",
    maxRecipients: 50,
    filters: {
      stageIds: [],
      ownerIds: [],
      sources: [],
      tags: [],
      heat: [],
    },
  };
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("pt-BR");
}

function money(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function listValue(value: string[]) {
  return value.join(", ");
}

function parseList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function interpolatePreview(template: string) {
  return template
    .replaceAll("{nome}", "Marina")
    .replaceAll("{empresa}", "Loja Aurora")
    .replaceAll("{telefone}", "+55 11 99999-0000")
    .replaceAll("{email}", "marina@empresa.com")
    .replaceAll("{stage}", "proposta")
    .replaceAll("{origem}", "Meta Ads");
}

function statusTone(status: CampaignStatus) {
  if (status === "active") return "success" as const;
  if (status === "paused") return "warning" as const;
  return "neutral" as const;
}

function buildObjectiveMessage(objective: CampaignObjective, offer?: CatalogDoc | null) {
  const offerName = offer?.productName || "nossa solucao";
  if (objective === "proposta") {
    return `Oi {nome}, tudo bem? Passando para saber se voce conseguiu avaliar a proposta. Se fizer sentido, eu posso te ajudar a ajustar o melhor caminho para avancarmos com ${offerName}.`;
  }
  if (objective === "leads_quentes") {
    return `Oi {nome}, vi que voce demonstrou interesse recentemente. Quer que eu te envie os proximos passos para entender se ${offerName} faz sentido para voce agora?`;
  }
  if (objective === "pos_venda") {
    return `Oi {nome}, tudo certo por ai? Estou passando para saber como foi sua experiencia e se existe algo que possamos melhorar ou complementar neste momento.`;
  }
  if (objective === "oferta") {
    return `Oi {nome}, tenho uma recomendacao que pode fazer sentido para voce: ${offerName}. Posso te mandar os detalhes e ver se encaixa no que voce esta buscando?`;
  }
  return `Oi {nome}, aqui e da equipe. Vi que nossa conversa ficou parada e queria entender se ainda faz sentido retomar. Posso te ajudar com o proximo passo?`;
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
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [users, setUsers] = useState<Array<{ userId?: string; name?: string }>>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [formsPayload, setFormsPayload] = useState<CaptureFormsPayload | null>(null);
  const [catalogDocs, setCatalogDocs] = useState<CatalogDoc[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<CampaignEditorState>(emptyCampaign());
  const [activeStep, setActiveStep] = useState<"objetivo" | "publico" | "mensagem" | "revisao">("objetivo");

  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const playbookPreset = useMemo(() => getBusinessProfilePlaybookPreset(businessProfileId), [businessProfileId]);
  const pipelineStages = useMemo(() => getBusinessProfilePipelineStages(businessProfileId), [businessProfileId]);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);
  const selectedOffer = useMemo(() => catalogDocs.find((item) => item.id === state.offerId) || null, [catalogDocs, state.offerId]);
  const paidCampaigns = metrics?.commercialAttribution?.byCampaign || [];
  const activeForms = formsPayload?.forms?.filter((form) => form.status === "active").length || 0;
  const totalFormSubmissions = formsPayload?.forms?.reduce((sum, form) => sum + Number(form.submissionsCount || 0), 0) || 0;

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const [campaignsRes, usersRes, settingsRes, metricsRes, formsRes, kbRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns`),
        authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
        authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary?rangeDays=30`),
        authedFetch(`/api/tenant/${tenant.tenantId}/capture/forms`),
        authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
      ]);

      const campaignsPayload = (await campaignsRes.json()) as { items?: Campaign[]; runs?: RunItem[]; error?: string };
      const usersPayload = (await usersRes.json().catch(() => ({}))) as { items?: Array<{ userId?: string; name?: string }> };
      const settingsPayload = (await settingsRes.json().catch(() => ({}))) as TenantSettingsResponse;
      const metricsPayload = (await metricsRes.json().catch(() => null)) as MetricsSummary | null;
      const formsData = (await formsRes.json().catch(() => null)) as CaptureFormsPayload | null;
      const kbPayload = (await kbRes.json().catch(() => ({}))) as { items?: CatalogDoc[] };

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
      setMetrics(metricsRes.ok ? metricsPayload : null);
      setFormsPayload(formsRes.ok ? formsData : null);
      setCatalogDocs((kbPayload.items || []).filter((item) => item.type === "catalog"));
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) return current;
        if (campaignFromQuery && nextItems.some((item) => item.id === campaignFromQuery)) return campaignFromQuery;
        return nextItems[0]?.id || null;
      });
    } catch {
      setError("Falha ao carregar central de campanhas.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId, campaignFromQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      objective: "reativacao",
      offerId: "",
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
      paidCampaigns: paidCampaigns.length,
      spend: metrics?.traffic?.spend || 0,
      paidLeads: metrics?.traffic?.leads || 0,
    };
  }, [items, metrics?.traffic?.leads, metrics?.traffic?.spend, paidCampaigns.length, runs.length]);

  const readiness = useMemo(() => {
    const checks = [
      { label: "Objetivo escolhido", done: Boolean(state.objective) },
      { label: "Nome da campanha", done: Boolean(state.name.trim()) },
      { label: "Mensagem pronta", done: state.messageTemplate.trim().length > 30 },
      { label: "Limite definido", done: state.maxRecipients > 0 },
      { label: "Publico segmentado", done: Boolean(state.filters.stageIds.length || state.filters.tags.length || state.filters.sources.length || state.filters.heat.length) },
      { label: "Audiencia simulada", done: Boolean(audiencePreview) },
    ];
    const score = Math.round((checks.filter((item) => item.done).length / checks.length) * 100);
    return { checks, score };
  }, [audiencePreview, state]);

  function handleCreate(objective: CampaignObjective = "reativacao") {
    if (!canManage) return;
    const offer = catalogDocs[0] || null;
    setSelectedId(null);
    setState({
      ...emptyCampaign(),
      objective,
      offerId: objective === "oferta" ? offer?.id || "" : "",
      name: objective === "oferta" && offer ? `Oferta ${offer.productName}` : `Campanha ${items.length + 1}`,
      messageTemplate: buildObjectiveMessage(objective, objective === "oferta" ? offer : null),
      filters: {
        stageIds: pipelineStages.slice(0, 2).map((item) => item.id),
        ownerIds: [],
        sources: [],
        tags: objective === "leads_quentes" ? ["quente"] : [],
        heat: objective === "leads_quentes" ? ["quente"] : [],
      },
    });
    setActiveStep("objetivo");
    setNotice(null);
    setError(null);
  }

  function applyBusinessCampaignPreset() {
    const conversation = playbookPreset.scripts[0];
    const offer = playbookPreset.offers[0];

    setState((current) => ({
      ...current,
      name: current.name || `Outbound ${businessProfile.label}`,
      messageTemplate: conversation?.script || current.messageTemplate,
      filters: {
        ...current.filters,
        stageIds: current.filters.stageIds.length > 0 ? current.filters.stageIds : pipelineStages.slice(0, 2).map((item) => item.id),
        tags: current.filters.tags.length > 0 ? current.filters.tags : businessProfile.crm.suggestedTags.slice(0, 2).map((item) => item.toLowerCase()),
      },
    }));
    setNotice(`Modelo base do modo ${businessProfile.label} aplicado.${offer ? ` Oferta foco: ${offer.title}.` : ""}`);
    setError(null);
  }

  function generateMessageVariant() {
    const next = buildObjectiveMessage(state.objective, selectedOffer);
    setState((current) => ({ ...current, messageTemplate: next }));
    setNotice("Variação de mensagem aplicada.");
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
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}/preview`, { method: "POST" });
      const payload = (await res.json()) as { error?: string; summary?: AudiencePreview["summary"]; sample?: AudiencePreview["sample"] };
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
      setNotice(`Simulacao pronta: ${payload.summary?.estimatedSend || 0} envios estimados.`);
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
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}/dispatch`, { method: "POST" });
      const payload = (await res.json()) as { error?: string; summary?: { sent: number; skipped: number; failed: number; totalMatched: number } };
      if (!res.ok) {
        setError(payload.error || "Falha ao disparar campanha.");
        return;
      }
      await loadData();
      setNotice(`Campanha enviada: ${payload.summary?.sent || 0} disparos, ${payload.summary?.skipped || 0} pulados, ${payload.summary?.failed || 0} falhas.`);
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
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${state.id}`, { method: "DELETE" });
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

  function toggleStage(stageId: string) {
    setState((current) => {
      const exists = current.filters.stageIds.includes(stageId);
      return {
        ...current,
        filters: {
          ...current.filters,
          stageIds: exists ? current.filters.stageIds.filter((item) => item !== stageId) : [...current.filters.stageIds, stageId],
        },
      };
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="campanhas-refined client-daily-page space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-[color:color-mix(in_srgb,#2563eb_18%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,#eff6ff_82%,var(--cliente-card)),color-mix(in_srgb,#eef2ff_70%,var(--cliente-panel-soft)))] p-5 shadow-[0_24px_70px_-46px_rgba(37,99,235,0.48)] dark:bg-[linear-gradient(135deg,color-mix(in_srgb,#1e3a8a_32%,var(--cliente-card)),color-mix(in_srgb,#312e81_24%,var(--cliente-panel-soft)))] md:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="flex flex-wrap gap-2">
              <StateBadge label="Central de campanhas" tone="info" />
              <StateBadge label="WhatsApp, trafego e captacao" tone="ai" />
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black leading-tight tracking-[-0.03em] text-[var(--cliente-card-text)] md:text-5xl">
              Planeje, dispare e leia campanhas em uma unica operacao comercial.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--cliente-card-text-muted)] md:text-base">
              A tela agora une outbound WhatsApp, campanhas pagas, formularios de captacao e ofertas do catalogo para o gestor decidir com mais contexto.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {canManage ? (
                <button
                  type="button"
                  onClick={() => handleCreate("reativacao")}
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#2563eb] px-5 py-3 text-sm font-bold text-white shadow-[0_18px_36px_-22px_rgba(37,99,235,0.75)] transition hover:-translate-y-0.5 hover:bg-[#1d4ed8]"
                >
                  <Plus className="h-4 w-4" />
                  Nova campanha
                </button>
              ) : null}
              <Link
                href="/cliente/painel/captacao"
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-5 py-3 text-sm font-bold text-[var(--cliente-card-text)] shadow-[var(--cliente-shadow-soft)] transition hover:-translate-y-0.5"
              >
                Formularios e captacao
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/cliente/painel/configuracoes/integracoes"
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-5 py-3 text-sm font-bold text-[var(--cliente-card-text)] shadow-[var(--cliente-shadow-soft)] transition hover:-translate-y-0.5"
              >
                Integracoes de anuncios
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <HeroStat label="Investimento 30d" value={money(summary.spend)} detail={`${summary.paidLeads} leads pagos registrados`} icon={DollarSign} tone="info" />
            <HeroStat label="Outbound WhatsApp" value={`${summary.active}/${summary.total}`} detail={`${summary.sent} mensagens enviadas`} icon={MessageCircle} tone="success" />
          </div>
        </div>
      </section>

      {error ? <div className="rounded-[24px] border border-rose-400/18 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-[24px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Campanhas pagas" value={String(summary.paidCampaigns)} icon={BarChart3} trend="Meta, Google e UTMs" tone="brand" />
        <MetricCard label="Gasto em midia" value={money(summary.spend)} icon={DollarSign} trend={`CPL ${money(metrics?.traffic?.cpl || 0)}`} tone="brand" />
        <MetricCard label="WhatsApp outbound" value={String(summary.total)} icon={Megaphone} trend={`${summary.active} ativa(s)`} tone="ai" />
        <MetricCard label="Captacao" value={String(activeForms)} icon={Globe2} trend={`${totalFormSubmissions} entradas`} tone="success" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Visao por canal" subtitle="O que esta trazendo contatos e oportunidades para a operacao." />
              <StateBadge label="30 dias" tone="info" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ChannelTile icon={MessageCircle} title="WhatsApp outbound" value={`${summary.sent} envios`} detail={`${runs.length} rodada(s) registradas`} href="#outbound" />
              <ChannelTile icon={BarChart3} title="Anuncios e UTM" value={money(summary.spend)} detail={`${paidCampaigns.length} campanha(s) com dados`} href="#midia" />
              <ChannelTile icon={Globe2} title="Formularios" value={`${totalFormSubmissions} entradas`} detail={`${activeForms} formulario(s) ativo(s)`} href="/cliente/painel/captacao" />
            </div>
          </PanelCard>

          <div id="midia">
          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Campanhas pagas e UTMs" subtitle="Dados vindos de snapshots, Meta/Google e atribuicao comercial." />
              <Link href="/cliente/painel/configuracoes/integracoes" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Configurar fontes
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Impressoes" value={String(metrics?.traffic?.impressions || 0)} />
              <MiniMetric label="Cliques" value={String(metrics?.traffic?.clicks || 0)} />
              <MiniMetric label="CTR" value={`${metrics?.traffic?.ctr || 0}%`} />
              <MiniMetric label="CPC" value={money(metrics?.traffic?.cpc || 0)} />
            </div>

            <div className="mt-5 space-y-2">
              {paidCampaigns.length ? (
                paidCampaigns.slice(0, 8).map((campaign) => (
                  <PaidCampaignRow key={campaign.key} campaign={campaign} />
                ))
              ) : (
                <EmptyState
                  title="Nenhuma campanha paga sincronizada"
                  description="Conecte Meta, Google ou envie UTMs para comparar gasto, leads, reunioes e vendas dentro da Altum."
                  action={
                    <Link href="/cliente/painel/configuracoes/integracoes" className="inline-flex items-center gap-2 rounded-[16px] bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white">
                      Conectar integracoes
                    </Link>
                  }
                />
              )}
            </div>
          </PanelCard>
          </div>

          <div id="outbound">
          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Construtor de campanha WhatsApp" subtitle="Fluxo guiado: objetivo, publico, mensagem e revisao antes do disparo." />
              <StateBadge label={`${readiness.score}% pronto`} tone={readiness.score >= 75 ? "success" : "warning"} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              {[
                { id: "objetivo", label: "Objetivo", icon: Target },
                { id: "publico", label: "Publico", icon: Filter },
                { id: "mensagem", label: "Mensagem", icon: PencilLine },
                { id: "revisao", label: "Revisao", icon: ClipboardList },
              ].map((step) => {
                const Icon = step.icon;
                const active = activeStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id as typeof activeStep)}
                    className={`rounded-[18px] border px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                      active ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_10%,var(--cliente-card))]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
                    }`}
                  >
                    <Icon className={active ? "h-4 w-4 text-[#2563eb]" : "h-4 w-4 text-[var(--cliente-card-text-soft)]"} />
                    <p className="mt-2 text-sm font-black text-[var(--cliente-card-text)]">{step.label}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
              <div className="space-y-4">
                {activeStep === "objetivo" ? (
                  <CampaignObjectiveStep
                    state={state}
                    catalogDocs={catalogDocs}
                    selectedOffer={selectedOffer}
                    onCreate={handleCreate}
                    onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
                  />
                ) : null}

                {activeStep === "publico" ? (
                  <CampaignAudienceStep
                    state={state}
                    users={users}
                    pipelineStages={pipelineStages}
                    allowAdvanced={allowAdvanced}
                    onToggleStage={toggleStage}
                    onAdvanced={() => setExperienceMode("completo")}
                    onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
                  />
                ) : null}

                {activeStep === "mensagem" ? (
                  <CampaignMessageStep
                    state={state}
                    selectedOffer={selectedOffer}
                    canManage={canManage}
                    onPreset={applyBusinessCampaignPreset}
                    onGenerate={generateMessageVariant}
                    onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
                  />
                ) : null}

                {activeStep === "revisao" ? (
                  <CampaignReviewStep readiness={readiness} audiencePreview={audiencePreview} state={state} />
                ) : null}

                <div className="flex flex-wrap gap-2 border-t border-[var(--cliente-border)] pt-4">
                  {canManage ? (
                    <>
                      <ClientActionButton type="button" tone="primary" onClick={() => void handleSave()} disabled={saving || !state.name.trim() || !state.messageTemplate.trim()} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </ClientActionButton>
                      {state.id ? (
                        <ClientActionButton type="button" tone="secondary" onClick={() => void handlePreview()} disabled={previewing}>
                          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          Simular publico
                        </ClientActionButton>
                      ) : null}
                      {state.id ? (
                        <ClientActionButton type="button" tone="success" onClick={() => void handleDispatch()} disabled={dispatching || state.status === "paused"}>
                          {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Disparar
                        </ClientActionButton>
                      ) : null}
                      {state.id ? (
                        <ClientActionButton type="button" tone="danger" onClick={() => void handleDelete()} disabled={deleting}>
                          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Remover
                        </ClientActionButton>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              <aside className="space-y-3">
                <WhatsAppPreview message={state.messageTemplate} selectedOffer={selectedOffer} />
                <PanelCard className="p-4">
                  <CardTitle title="Campanhas salvas" subtitle={`${items.length} modelos WhatsApp`} />
                  <div className="mt-3 space-y-2">
                    {items.length ? (
                      items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={`w-full rounded-[18px] border p-3 text-left transition hover:bg-[var(--cliente-surface-hover)] ${
                            selectedId === item.id ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_9%,var(--cliente-card))]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-bold text-[var(--cliente-card-text)]">{item.name}</p>
                            <StateBadge label={item.status} tone={statusTone(item.status)} />
                          </div>
                          <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(item.lastRunAt)}</p>
                        </button>
                      ))
                    ) : (
                      <p className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
                        Nenhuma campanha WhatsApp criada.
                      </p>
                    )}
                  </div>
                </PanelCard>
              </aside>
            </div>
          </PanelCard>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="ai" className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle title="O que esta tela faz hoje" subtitle="Leitura baseada no codigo atual da plataforma." />
            </div>
            <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
              <p>1. Lista e edita campanhas outbound salvas em `outbound_campaigns`.</p>
              <p>2. Segmenta leads por etapa, origem, tags, responsavel e temperatura.</p>
              <p>3. Simula audiencia antes do envio, checando telefone e consentimento.</p>
              <p>4. Dispara mensagens no WhatsApp e registra rodadas em `outbound_campaign_runs`.</p>
              <p>5. Agora tambem mostra campanhas pagas, formularios e ofertas do catalogo.</p>
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Canais conectados" subtitle="Resumo das frentes de campanha que a Altum consegue ler." />
            <div className="mt-4 space-y-2">
              <IntegrationRow label="WhatsApp outbound" value={`${summary.total} campanha(s)`} ready={summary.total > 0} />
              <IntegrationRow label="Meta/Google/UTM" value={`${paidCampaigns.length} campanha(s)`} ready={paidCampaigns.length > 0} />
              <IntegrationRow label="Formularios" value={`${activeForms} ativo(s)`} ready={activeForms > 0} />
              <IntegrationRow label="Catalogo de ofertas" value={`${catalogDocs.length} item(ns)`} ready={catalogDocs.length > 0} />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Historico WhatsApp" subtitle="Ultimas rodadas de disparo." />
            <div className="mt-4 space-y-2">
              {runs.length ? (
                runs.slice(0, 6).map((run) => (
                  <div key={run.id} className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-bold text-[var(--cliente-card-text)]">{run.campaignName}</p>
                      <StateBadge label={`${run.summary.sent}`} tone="success" />
                    </div>
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(run.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao houve disparos.</p>
              )}
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function HeroStat({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Megaphone; tone: "info" | "success" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
      : "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-200";

  return (
    <div className={`rounded-[24px] border p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
          <p className="mt-3 text-2xl font-black leading-none tracking-[-0.03em]">{value}</p>
          <p className="mt-2 text-xs opacity-75">{detail}</p>
        </div>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
    </div>
  );
}

function ChannelTile({ icon: Icon, title, value, detail, href }: { icon: typeof Megaphone; title: string; value: string; detail: string; href: string }) {
  const content = (
    <div className="h-full rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,#2563eb_26%,var(--cliente-border))] hover:bg-[var(--cliente-surface-hover)]">
      <Icon className="h-5 w-5 text-[#2563eb]" />
      <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-2 text-xl font-black tracking-[-0.03em] text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );

  if (href.startsWith("#")) return <a href={href}>{content}</a>;
  return <Link href={href}>{content}</Link>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 text-base font-black text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function PaidCampaignRow({ campaign }: { campaign: PaidCampaign }) {
  return (
    <div className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge label={campaign.source || "campanha"} tone="info" />
            <StateBadge label={`${campaign.lastTouchLeads} leads`} tone="success" />
          </div>
          <p className="mt-3 truncate text-base font-black text-[var(--cliente-card-text)]">{campaign.label}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
            {campaign.qualifiedLeads} qualificados | {campaign.meetings} reunioes | {campaign.wonLeads} vendas
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">{money(campaign.spend)}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">CPL {money(campaign.cpl)}</p>
        </div>
      </div>
    </div>
  );
}

function CampaignObjectiveStep({
  state,
  catalogDocs,
  selectedOffer,
  onCreate,
  onChange,
}: {
  state: CampaignEditorState;
  catalogDocs: CatalogDoc[];
  selectedOffer: CatalogDoc | null;
  onCreate: (objective: CampaignObjective) => void;
  onChange: (patch: Partial<CampaignEditorState>) => void;
}) {
  return (
    <PanelCard className="p-4">
      <CardTitle title="Objetivo da campanha" subtitle="Comece pelo movimento comercial, nao pelo texto." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {OBJECTIVES.map((objective) => {
          const active = state.objective === objective.id;
          return (
            <button
              key={objective.id}
              type="button"
              onClick={() => {
                onChange({
                  objective: objective.id,
                  offerId: objective.id === "oferta" ? state.offerId || catalogDocs[0]?.id || "" : state.offerId,
                  messageTemplate: buildObjectiveMessage(objective.id, objective.id === "oferta" ? selectedOffer || catalogDocs[0] : null),
                });
                if (!state.id && !state.name) onCreate(objective.id);
              }}
              className={`rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 ${
                active ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_10%,var(--cliente-card))]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
              }`}
            >
              <StateBadge label={objective.label} tone={objective.tone} />
              <p className="mt-3 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{objective.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Nome da campanha" value={state.name} onChange={(value) => onChange({ name: value })} placeholder="Reativacao leads quentes" />
        <SelectField
          label="Oferta do catalogo"
          value={state.offerId}
          onChange={(value) => onChange({ offerId: value, messageTemplate: buildObjectiveMessage(state.objective, catalogDocs.find((item) => item.id === value) || null) })}
          options={[{ value: "", label: "Sem oferta especifica" }, ...catalogDocs.slice(0, 40).map((item) => ({ value: item.id, label: item.productName || "Item sem nome" }))]}
        />
      </div>
    </PanelCard>
  );
}

function CampaignAudienceStep({
  state,
  users,
  pipelineStages,
  allowAdvanced,
  onToggleStage,
  onAdvanced,
  onChange,
}: {
  state: CampaignEditorState;
  users: Array<{ userId?: string; name?: string }>;
  pipelineStages: Array<{ id: string; label?: string }>;
  allowAdvanced: boolean;
  onToggleStage: (stageId: string) => void;
  onAdvanced: () => void;
  onChange: (patch: Partial<CampaignEditorState>) => void;
}) {
  return (
    <PanelCard className="p-4">
      <CardTitle title="Publico" subtitle="Escolha quem recebe. Quanto melhor o filtro, melhor a campanha." />
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Etapas do funil</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {pipelineStages.map((stage) => {
            const active = state.filters.stageIds.includes(stage.id);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onToggleStage(stage.id)}
                className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                  active ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_10%,var(--cliente-card))] text-[#2563eb]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)]"
                }`}
              >
                {stage.label || stage.id}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Limite de envio" value={String(state.maxRecipients)} onChange={(value) => onChange({ maxRecipients: Math.max(1, Math.min(500, Number(value || 1) || 1)) })} placeholder="50" />
        <SelectField
          label="Temperatura"
          value={state.filters.heat[0] || ""}
          options={[
            { value: "", label: "Qualquer temperatura" },
            { value: "frio", label: "Frio" },
            { value: "morno", label: "Morno" },
            { value: "quente", label: "Quente" },
          ]}
          onChange={(value) => onChange({ filters: { ...state.filters, heat: value ? [value] : [] } })}
        />
      </div>

      {allowAdvanced ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Origens" value={listValue(state.filters.sources)} onChange={(value) => onChange({ filters: { ...state.filters, sources: parseList(value) } })} placeholder="meta_ads, google_ads, site" />
          <Field label="Tags" value={listValue(state.filters.tags)} onChange={(value) => onChange({ filters: { ...state.filters, tags: parseList(value) } })} placeholder="reativacao, vip, proposta" />
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Responsaveis alvo</span>
            <select
              multiple
              value={state.filters.ownerIds}
              onChange={(event) => onChange({ filters: { ...state.filters, ownerIds: Array.from(event.target.selectedOptions).map((option) => option.value) } })}
              className="client-input min-h-[112px] w-full rounded-xl border px-3 py-2.5 text-sm"
            >
              {users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
          Filtros avancados ficam no modo completo.
          <button type="button" onClick={onAdvanced} className="ml-2 font-bold text-[#2563eb]">
            Abrir completo
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function CampaignMessageStep({
  state,
  selectedOffer,
  canManage,
  onPreset,
  onGenerate,
  onChange,
}: {
  state: CampaignEditorState;
  selectedOffer: CatalogDoc | null;
  canManage: boolean;
  onPreset: () => void;
  onGenerate: () => void;
  onChange: (patch: Partial<CampaignEditorState>) => void;
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle title="Mensagem" subtitle="Escreva como um atendimento comercial humano, com contexto e proximo passo." />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onGenerate} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)]">
            <Wand2 className="h-3.5 w-3.5" />
            Gerar variacao
          </button>
          {canManage ? (
            <button type="button" onClick={onPreset} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)]">
              <Sparkles className="h-3.5 w-3.5" />
              Preset
            </button>
          ) : null}
        </div>
      </div>
      {selectedOffer ? (
        <div className="mt-4 rounded-[18px] border border-[color:color-mix(in_srgb,#2563eb_18%,var(--cliente-border))] bg-[color:color-mix(in_srgb,#2563eb_7%,var(--cliente-card))] p-3">
          <p className="text-sm font-bold text-[var(--cliente-card-text)]">{selectedOffer.productName}</p>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--cliente-card-text-muted)]">{selectedOffer.targetProfile || selectedOffer.productCategory || "Oferta do catalogo"}</p>
        </div>
      ) : null}
      <textarea
        value={state.messageTemplate}
        onChange={(event) => onChange({ messageTemplate: event.target.value })}
        placeholder="Oi {nome}, aqui e da equipe..."
        className="client-input mt-4 min-h-[190px] w-full rounded-[20px] border px-4 py-3 text-sm leading-6 outline-none"
      />
      <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Variaveis: {"{nome}"}, {"{empresa}"}, {"{telefone}"}, {"{email}"}, {"{stage}"}, {"{origem}"}.</p>
    </PanelCard>
  );
}

function CampaignReviewStep({ readiness, audiencePreview, state }: { readiness: { checks: Array<{ label: string; done: boolean }>; score: number }; audiencePreview: AudiencePreview | null; state: CampaignEditorState }) {
  return (
    <PanelCard className="p-4">
      <CardTitle title="Revisao antes do envio" subtitle="Evite disparos sem publico, sem permissao ou com mensagem fraca." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="flex items-center gap-3 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
            <CheckCircle2 className={check.done ? "h-4 w-4 text-[var(--cliente-success)]" : "h-4 w-4 text-[var(--cliente-warning)]"} />
            <p className="text-sm font-semibold text-[var(--cliente-card-text-muted)]">{check.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniMetric label="Status" value={state.status} />
        <MiniMetric label="Limite" value={String(state.maxRecipients)} />
        <MiniMetric label="Pronto" value={`${readiness.score}%`} />
      </div>
      {audiencePreview ? (
        <div className="mt-4 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">Audiencia simulada</p>
          <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
            {audiencePreview.summary.estimatedSend} envios estimados, {audiencePreview.summary.blockedByConsent} bloqueados por consentimento e {audiencePreview.summary.missingPhone} sem telefone.
          </p>
        </div>
      ) : null}
    </PanelCard>
  );
}

function WhatsAppPreview({ message, selectedOffer }: { message: string; selectedOffer: CatalogDoc | null }) {
  return (
    <PanelCard className="overflow-hidden">
      <div className="border-b border-[var(--cliente-border)] bg-[#075e54] px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/18 text-xs font-black">MA</span>
          <div>
            <p className="text-sm font-bold">Marina</p>
            <p className="text-xs text-white/72">preview WhatsApp</p>
          </div>
        </div>
      </div>
      <div className="bg-[linear-gradient(180deg,#e8f3ee,#dceae4)] p-4 dark:bg-[linear-gradient(180deg,#10231d,#0b1915)]">
        <div className="ml-auto max-w-[92%] rounded-[18px] rounded-br-sm bg-[#dcf8c6] px-4 py-3 text-sm leading-6 text-[#123025] shadow-[0_16px_30px_-26px_rgba(15,23,42,0.5)]">
          {interpolatePreview(message) || "Sua mensagem aparece aqui."}
        </div>
        {selectedOffer?.mediaUrl ? (
          <div className="ml-auto mt-2 max-w-[92%] rounded-[18px] bg-[#dcf8c6] px-4 py-3 text-xs font-bold text-[#123025]">
            Material da oferta disponivel para envio
          </div>
        ) : null}
      </div>
    </PanelCard>
  );
}

function IntegrationRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <div>
        <p className="text-sm font-bold text-[var(--cliente-card-text)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{value}</p>
      </div>
      <StateBadge label={ready ? "ok" : "pendente"} tone={ready ? "success" : "warning"} />
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="client-input w-full rounded-xl border px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="client-input w-full rounded-xl border px-3 py-2.5 text-sm"
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
