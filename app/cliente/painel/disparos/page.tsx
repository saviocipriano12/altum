"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Play,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  ClientActionButton,
  EmptyState,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type CampaignStatus = "draft" | "active" | "paused";
type DeliveryMode = "text" | "template";
type Step = "remetente" | "publico" | "conteudo" | "revisao";

type Channel = {
  id: string;
  type: string;
  provider?: string;
  displayName?: string;
  phoneNumber?: string;
  status?: string;
  connectionStatus?: string;
  outboundReady?: boolean;
};

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  channelId: string;
  deliveryMode: DeliveryMode;
  messageTemplate: string;
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  headerMedia: null | {
    type: "image" | "video" | "document";
    link?: string;
    id?: string;
    filename?: string;
  };
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

type Preview = {
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
  sample: Array<{ leadId: string; nome: string; telefone: string; stage: string; origem: string }>;
};

type Run = {
  id: string;
  campaignId: string;
  campaignName: string;
  createdAt?: string | null;
  summary: { sent: number; skipped: number; failed: number; totalMatched: number };
};

const STEPS: Array<{ id: Step; label: string; icon: typeof Smartphone }> = [
  { id: "remetente", label: "Remetente", icon: Smartphone },
  { id: "publico", label: "Publico", icon: Users },
  { id: "conteudo", label: "Conteudo", icon: MessageCircle },
  { id: "revisao", label: "Revisao", icon: ShieldCheck },
];

function emptyCampaign(): Campaign {
  return {
    id: "",
    name: "Novo disparo",
    status: "draft",
    channelId: "",
    deliveryMode: "text",
    messageTemplate: "Ola, {nome}! Tudo bem? Temos uma novidade que pode fazer sentido para voce.",
    templateName: "",
    languageCode: "pt_BR",
    bodyParams: ["{nome}"],
    headerMedia: null,
    maxRecipients: 50,
    filters: { stageIds: [], ownerIds: [], sources: [], tags: [], heat: [] },
  };
}

function isOfficial(provider?: string) {
  const normalized = String(provider || "").toLowerCase();
  return !normalized || normalized.includes("meta") || normalized.includes("cloud");
}

function formatDate(value?: string | null) {
  if (!value) return "Ainda nao enviado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ainda nao enviado";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function splitList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}

export default function BulkMessagingPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_automations");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [editor, setEditor] = useState<Campaign>(emptyCampaign);
  const [selectedId, setSelectedId] = useState("");
  const [step, setStep] = useState<Step>("remetente");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "preview" | "send" | "delete" | "media" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError("");
    try {
      const [campaignRes, channelRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns`),
        authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
      ]);
      const campaignPayload = (await campaignRes.json()) as { items?: Campaign[]; runs?: Run[]; error?: string };
      const channelPayload = (await channelRes.json()) as { items?: Channel[]; error?: string };
      if (!campaignRes.ok) throw new Error(campaignPayload.error || "Falha ao carregar disparos.");
      if (!channelRes.ok) throw new Error(channelPayload.error || "Falha ao carregar numeros conectados.");
      const nextCampaigns = campaignPayload.items || [];
      const nextChannels = (channelPayload.items || []).filter((item) => item.type === "whatsapp");
      setCampaigns(nextCampaigns);
      setRuns(campaignPayload.runs || []);
      setChannels(nextChannels);
      setSelectedId((current) => current || nextCampaigns[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a central de disparos.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = campaigns.find((item) => item.id === selectedId);
    if (!selected) return;
    setEditor({ ...emptyCampaign(), ...selected });
    setPreview(null);
  }, [campaigns, selectedId]);

  const selectedChannel = channels.find((item) => item.id === editor.channelId) || null;
  const officialChannel = selectedChannel ? isOfficial(selectedChannel.provider) : false;
  const readyChannels = channels.filter((item) => item.outboundReady || item.status === "active");
  const riskLevel = editor.maxRecipients > 250 ? "alto" : editor.maxRecipients > 100 ? "medio" : "baixo";

  const readiness = useMemo(() => {
    const checks = [
      Boolean(editor.name.trim()),
      Boolean(editor.channelId),
      editor.deliveryMode === "template" ? Boolean(editor.templateName.trim()) : editor.messageTemplate.trim().length >= 10,
      editor.maxRecipients > 0,
      Boolean(preview),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [editor, preview]);

  const totals = useMemo(
    () => ({
      sent: runs.reduce((sum, item) => sum + item.summary.sent, 0),
      failed: runs.reduce((sum, item) => sum + item.summary.failed, 0),
      active: campaigns.filter((item) => item.status === "active").length,
    }),
    [campaigns, runs]
  );

  function createNew() {
    const firstChannel = readyChannels[0] || channels[0];
    const next = emptyCampaign();
    if (firstChannel) {
      next.channelId = firstChannel.id;
      next.deliveryMode = isOfficial(firstChannel.provider) ? "template" : "text";
    }
    setEditor(next);
    setSelectedId("");
    setPreview(null);
    setStep("remetente");
    setNotice("");
    setError("");
  }

  function chooseChannel(channel: Channel) {
    setEditor((current) => ({
      ...current,
      channelId: channel.id,
      deliveryMode: isOfficial(channel.provider) ? "template" : "text",
    }));
    setPreview(null);
  }

  async function save() {
    if (!tenant?.tenantId || !canManage) return null;
    setWorking("save");
    setError("");
    setNotice("");
    try {
      const path = editor.id
        ? `/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}`
        : `/api/tenant/${tenant.tenantId}/outbound-campaigns`;
      const response = await authedFetch(path, {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const payload = (await response.json()) as { campaignId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao salvar disparo.");
      const campaignId = editor.id || payload.campaignId || "";
      await load();
      setSelectedId(campaignId);
      setNotice(editor.id ? "Disparo atualizado." : "Disparo salvo como rascunho.");
      return campaignId;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar disparo.");
      return null;
    } finally {
      setWorking(null);
    }
  }

  async function simulate() {
    const campaignId = editor.id || (await save());
    if (!tenant?.tenantId || !campaignId) return;
    setWorking("preview");
    setError("");
    try {
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/outbound-campaigns/${campaignId}/preview`,
        { method: "POST" }
      );
      const payload = (await response.json()) as Preview & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao simular publico.");
      setPreview({ summary: payload.summary, sample: payload.sample || [] });
      setStep("revisao");
      setNotice(`${payload.summary.estimatedSend} contatos aptos para receber.`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Falha ao simular publico.");
    } finally {
      setWorking(null);
    }
  }

  async function dispatch() {
    if (!tenant?.tenantId || !editor.id || !preview || !canManage) return;
    if (!window.confirm(`Confirmar o envio para ate ${preview.summary.estimatedSend} contatos?`)) return;
    setWorking("send");
    setError("");
    try {
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}/dispatch`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { summary?: Run["summary"]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao iniciar disparo.");
      await load();
      setNotice(
        `${payload.summary?.sent || 0} enviados, ${payload.summary?.skipped || 0} ignorados e ${payload.summary?.failed || 0} falhas.`
      );
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "Falha ao iniciar disparo.");
    } finally {
      setWorking(null);
    }
  }

  async function remove() {
    if (!tenant?.tenantId || !editor.id || !canManage) return;
    if (!window.confirm(`Apagar definitivamente "${editor.name}"?`)) return;
    setWorking("delete");
    setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao apagar disparo.");
      setEditor(emptyCampaign());
      setSelectedId("");
      setPreview(null);
      await load();
      setNotice("Disparo apagado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao apagar disparo.");
    } finally {
      setWorking(null);
    }
  }

  async function uploadMedia(file: File) {
    if (!tenant?.tenantId || !canManage) return;
    setWorking("media");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/media`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { media?: Campaign["headerMedia"]; error?: string };
      if (!response.ok || !payload.media) throw new Error(payload.error || "Falha ao subir arquivo.");
      setEditor((current) => ({ ...current, headerMedia: payload.media || null }));
      setPreview(null);
      setNotice(`${file.name} anexado ao disparo.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao subir arquivo.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-primary)]" /></div>;
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <SectionHeader
        title="Disparos em Massa"
        subtitle="Escolha o numero, segmente a base, revise a mensagem e acompanhe cada envio."
        action={
          canManage ? (
            <ClientActionButton tone="primary" onClick={createNew}>
              <Plus className="h-4 w-4" /> Novo disparo
            </ClientActionButton>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryMetric label="Enviados" value={totals.sent} icon={Send} tone="text-emerald-600" />
        <SummaryMetric label="Ativos" value={totals.active} icon={Play} tone="text-blue-600" />
        <SummaryMetric label="Falhas" value={totals.failed} icon={AlertTriangle} tone="text-rose-600" />
        <SummaryMetric label="Numeros prontos" value={readyChannels.length} icon={Smartphone} tone="text-violet-600" />
      </section>

      {error ? <Feedback tone="error" text={error} /> : null}
      {notice ? <Feedback tone="success" text={notice} /> : null}

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_310px]">
        <aside className="order-2 xl:order-1">
          <PanelCard className="overflow-hidden p-0">
            <div className="border-b border-[var(--cliente-border)] p-4">
              <p className="text-sm font-bold text-[var(--cliente-card-text)]">Seus disparos</p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{campaigns.length} salvos</p>
            </div>
            <div className="max-h-[620px] divide-y divide-[var(--cliente-border)] overflow-y-auto">
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedId(campaign.id)}
                  className={`w-full p-4 text-left transition hover:bg-[var(--cliente-surface-hover)] ${
                    selectedId === campaign.id ? "bg-[var(--cliente-primary-soft)]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-[var(--cliente-card-text)]">{campaign.name}</p>
                    <MoreHorizontal className="h-4 w-4 shrink-0 text-[var(--cliente-card-text-soft)]" />
                  </div>
                  <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(campaign.lastRunAt)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <StateBadge
                      label={campaign.status === "paused" ? "pausado" : campaign.status === "active" ? "ativo" : "rascunho"}
                      tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}
                    />
                    <span className="text-xs font-semibold text-[var(--cliente-card-text-muted)]">
                      {campaign.lastRunSummary?.sent || 0} envios
                    </span>
                  </div>
                </button>
              ))}
              {!campaigns.length ? (
                <div className="p-4">
                  <EmptyState title="Nenhum disparo" description="Crie o primeiro envio segmentado." />
                </div>
              ) : null}
            </div>
          </PanelCard>
        </aside>

        <main className="order-1 min-w-0 xl:order-2">
          <PanelCard className="overflow-hidden p-0">
            <div className="border-b border-[var(--cliente-border)] px-4 py-4 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  value={editor.name}
                  onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                  className="min-w-0 flex-1 border-0 bg-transparent text-xl font-extrabold text-[var(--cliente-card-text)] outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                  placeholder="Nome do disparo"
                />
                <StateBadge label={`${readiness}% pronto`} tone={readiness >= 80 ? "success" : "warning"} />
              </div>
            </div>

            <div className="flex overflow-x-auto border-b border-[var(--cliente-border)] px-2 md:px-4">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const active = step === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    className={`flex min-w-max items-center gap-2 border-b-2 px-3 py-4 text-sm font-semibold transition md:px-4 ${
                      active
                        ? "border-[var(--cliente-primary)] text-[var(--cliente-primary)]"
                        : "border-transparent text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${active ? "bg-[var(--cliente-primary)] text-white" : "bg-[var(--cliente-surface-muted)]"}`}>
                      {active ? <Icon className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="p-4 md:p-6">
              {step === "remetente" ? (
                <SenderStep channels={channels} selectedId={editor.channelId} onSelect={chooseChannel} />
              ) : null}
              {step === "publico" ? (
                <AudienceStep editor={editor} onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }} />
              ) : null}
              {step === "conteudo" ? (
                <ContentStep
                  editor={editor}
                  official={officialChannel}
                  uploading={working === "media"}
                  onUpload={uploadMedia}
                  onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }}
                />
              ) : null}
              {step === "revisao" ? (
                <ReviewStep editor={editor} channel={selectedChannel} preview={preview} riskLevel={riskLevel} />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-4 md:px-6">
              <div className="flex gap-2">
                {editor.id ? (
                  <ClientActionButton tone="danger" onClick={() => void remove()} disabled={Boolean(working)}>
                    {working === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">Apagar</span>
                  </ClientActionButton>
                ) : null}
                <ClientActionButton tone="secondary" onClick={() => void save()} disabled={Boolean(working) || !canManage}>
                  {working === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                </ClientActionButton>
              </div>
              <div className="flex gap-2">
                <ClientActionButton tone="secondary" onClick={() => void simulate()} disabled={Boolean(working) || !editor.channelId || !canManage}>
                  {working === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />} Simular
                </ClientActionButton>
                <ClientActionButton tone="success" onClick={() => void dispatch()} disabled={Boolean(working) || !preview || !editor.id || !canManage}>
                  {working === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar agora
                </ClientActionButton>
              </div>
            </div>
          </PanelCard>
        </main>

        <aside className="order-3">
          <PhonePreview editor={editor} official={officialChannel} />
          <div className="mt-4">
            <PanelCard className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[var(--cliente-card-text)]">Protecao da conta</p>
                  <p className="text-xs text-[var(--cliente-card-text-soft)]">Opt-out e telefones invalidos sao ignorados.</p>
                </div>
              </div>
            </PanelCard>
          </div>
        </aside>
      </div>

      <PanelCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[var(--cliente-card-text)]">Historico recente</p>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Resultado real das ultimas execucoes.</p>
          </div>
          <Clock3 className="h-5 w-5 text-[var(--cliente-card-text-soft)]" />
        </div>
        <div className="mt-4 divide-y divide-[var(--cliente-border)]">
          {runs.slice(0, 8).map((run) => (
            <div key={run.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-5">
              <div>
                <p className="font-semibold text-[var(--cliente-card-text)]">{run.campaignName}</p>
                <p className="text-xs text-[var(--cliente-card-text-soft)]">{formatDate(run.createdAt)}</p>
              </div>
              <span className="text-emerald-600">{run.summary.sent} enviados</span>
              <span className="text-amber-600">{run.summary.skipped} ignorados</span>
              <span className="text-rose-600">{run.summary.failed} falhas</span>
            </div>
          ))}
          {!runs.length ? <p className="py-6 text-center text-sm text-[var(--cliente-card-text-soft)]">Nenhum envio executado ainda.</p> : null}
        </div>
      </PanelCard>
    </div>
  );
}

function SummaryMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Send; tone: string }) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-[var(--cliente-card-text)]">{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
    </PanelCard>
  );
}

function Feedback({ tone, text }: { tone: "error" | "success"; text: string }) {
  const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`flex items-center gap-2 rounded-[16px] border px-4 py-3 text-sm ${tone === "error" ? "border-rose-300/30 bg-rose-500/10 text-rose-700" : "border-emerald-300/30 bg-emerald-500/10 text-emerald-700"}`}>
      <Icon className="h-4 w-4 shrink-0" /> {text}
    </div>
  );
}

function SenderStep({ channels, selectedId, onSelect }: { channels: Channel[]; selectedId: string; onSelect: (channel: Channel) => void }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Qual numero vai enviar?</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Cada disparo fica vinculado ao numero escolhido e preserva esse contexto nas respostas.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {channels.map((channel) => {
          const selected = channel.id === selectedId;
          const official = isOfficial(channel.provider);
          const ready = channel.outboundReady || channel.status === "active";
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onSelect(channel)}
              className={`relative overflow-hidden rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5 ${
                selected ? "border-emerald-500 bg-emerald-500/8 shadow-sm" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{channel.displayName || "WhatsApp"}</p>
                    {selected ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span> : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{channel.phoneNumber || "Numero conectado"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StateBadge label={official ? "API oficial" : "Sessao conectada"} tone={official ? "info" : "success"} />
                    <StateBadge label={ready ? "pronto" : "revisar conexao"} tone={ready ? "success" : "warning"} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!channels.length ? <EmptyState title="Nenhum WhatsApp conectado" description="Conecte um numero em Configuracoes > Canais antes de criar o disparo." /> : null}
    </div>
  );
}

function AudienceStep({ editor, onChange }: { editor: Campaign; onChange: (patch: Partial<Campaign>) => void }) {
  const changeFilter = (key: keyof Campaign["filters"], value: string) =>
    onChange({ filters: { ...editor.filters, [key]: splitList(value) } });
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Quem deve receber?</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Combine filtros. Quem pediu para nao receber sera removido automaticamente.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Temperatura" hint="Ex.: quente, morno">
          <input value={editor.filters.heat.join(", ")} onChange={(event) => changeFilter("heat", event.target.value)} className="client-input" placeholder="quente, morno" />
        </Field>
        <Field label="Etiquetas" hint="Separe por virgula">
          <input value={editor.filters.tags.join(", ")} onChange={(event) => changeFilter("tags", event.target.value)} className="client-input" placeholder="cliente, proposta enviada" />
        </Field>
        <Field label="Origem" hint="Meta, Google, indicacao...">
          <input value={editor.filters.sources.join(", ")} onChange={(event) => changeFilter("sources", event.target.value)} className="client-input" placeholder="instagram, google_ads" />
        </Field>
        <Field label="Etapa do funil" hint="Use o identificador da etapa">
          <input value={editor.filters.stageIds.join(", ")} onChange={(event) => changeFilter("stageIds", event.target.value)} className="client-input" placeholder="novo_lead, proposta" />
        </Field>
      </div>
      <div className="mt-5 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--cliente-card-text)]">Limite desta execucao</p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Comece pequeno e aumente depois de validar resposta e entrega.</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={500} step={1} value={editor.maxRecipients} onChange={(event) => onChange({ maxRecipients: Number(event.target.value) })} className="w-36 accent-[var(--cliente-primary)]" />
            <input type="number" min={1} max={500} value={editor.maxRecipients} onChange={(event) => onChange({ maxRecipients: Math.max(1, Math.min(500, Number(event.target.value))) })} className="client-input w-20 text-center" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentStep({
  editor,
  official,
  uploading,
  onUpload,
  onChange,
}: {
  editor: Campaign;
  official: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<Campaign>) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">O que sera enviado?</h3>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{official ? "A API oficial exige um template aprovado para iniciar conversas." : "A sessao conectada aceita texto livre dentro de uma cadencia responsavel."}</p>
        </div>
        <StateBadge label={official ? "template obrigatorio" : "mensagem livre"} tone={official ? "info" : "success"} />
      </div>
      <div className="mt-5">
        {official ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome do template" hint="Exatamente como aprovado na Meta">
              <input value={editor.templateName} onChange={(event) => onChange({ templateName: event.target.value, deliveryMode: "template" })} className="client-input" placeholder="oferta_junho_2026" />
            </Field>
            <Field label="Idioma" hint="Codigo aprovado">
              <select value={editor.languageCode} onChange={(event) => onChange({ languageCode: event.target.value })} className="client-input">
                <option value="pt_BR">Portugues (Brasil)</option>
                <option value="en_US">English (US)</option>
                <option value="es">Espanol</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Variaveis do template" hint="Uma por linha. Use {nome}, {empresa}, {origem} ou texto fixo.">
                <textarea value={editor.bodyParams.join("\n")} onChange={(event) => onChange({ bodyParams: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 20) })} className="client-input min-h-28 resize-y" placeholder={"{nome}\nNome da oferta"} />
              </Field>
            </div>
          </div>
        ) : (
          <Field label="Mensagem" hint="Personalize com {nome}, {empresa}, {telefone}, {stage} e {origem}.">
            <textarea value={editor.messageTemplate} onChange={(event) => onChange({ messageTemplate: event.target.value, deliveryMode: "text" })} className="client-input min-h-44 resize-y text-[15px] leading-6" />
          </Field>
        )}
      </div>
      {editor.headerMedia ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-emerald-300/40 bg-emerald-500/8 p-4">
          <div className="flex min-w-0 items-center gap-3">
            {editor.headerMedia.type === "image" ? <ImageIcon className="h-5 w-5 text-emerald-600" /> : editor.headerMedia.type === "video" ? <Video className="h-5 w-5 text-emerald-600" /> : <FileText className="h-5 w-5 text-emerald-600" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{editor.headerMedia.filename || "Arquivo anexado"}</p>
              <p className="text-xs text-[var(--cliente-card-text-soft)]">{official ? "Cabecalho do template" : "Enviado com a mensagem"}</p>
            </div>
          </div>
          <button type="button" onClick={() => onChange({ headerMedia: null })} className="text-sm font-semibold text-rose-600">Remover</button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-[18px] border border-dashed border-[var(--cliente-border-strong)] bg-[var(--cliente-surface-muted)] px-4 py-7 text-center transition hover:bg-[var(--cliente-surface-hover)]">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-primary)]" /> : <ImageIcon className="h-5 w-5 text-[var(--cliente-primary)]" />}
          <span>
            <span className="block text-sm font-semibold text-[var(--cliente-card-text)]">{uploading ? "Enviando arquivo..." : "Adicionar imagem, video ou documento"}</span>
            <span className="mt-1 block text-xs text-[var(--cliente-card-text-soft)]">Upload direto. Imagens ate 12 MB, videos ate 64 MB e documentos ate 24 MB.</span>
          </span>
          <input
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function ReviewStep({ editor, channel, preview, riskLevel }: { editor: Campaign; channel: Channel | null; preview: Preview | null; riskLevel: string }) {
  const checks = [
    { label: "Numero remetente", value: channel?.displayName || "Nao escolhido", done: Boolean(channel) },
    { label: "Publico apto", value: preview ? `${preview.summary.estimatedSend} contatos` : "Simulacao pendente", done: Boolean(preview) },
    { label: "Consentimento", value: preview ? `${preview.summary.blockedByConsent} removidos` : "Verificado ao simular", done: Boolean(preview) },
    { label: "Conteudo", value: editor.deliveryMode === "template" ? editor.templateName || "Template pendente" : `${editor.messageTemplate.length} caracteres`, done: editor.deliveryMode === "template" ? Boolean(editor.templateName) : editor.messageTemplate.length > 9 },
  ];
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Ultima revisao</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">O envio so e liberado depois da simulacao da base.</p>
      <div className="mt-5 divide-y divide-[var(--cliente-border)] rounded-[18px] border border-[var(--cliente-border)]">
        {checks.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.label}</p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.value}</p>
            </div>
            {item.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ChevronRight className="h-5 w-5 text-amber-500" />}
          </div>
        ))}
      </div>
      <div className={`mt-4 rounded-[18px] border p-4 ${riskLevel === "alto" ? "border-rose-300/40 bg-rose-500/8" : riskLevel === "medio" ? "border-amber-300/40 bg-amber-500/8" : "border-emerald-300/40 bg-emerald-500/8"}`}>
        <p className="text-sm font-bold text-[var(--cliente-card-text)]">Risco operacional: {riskLevel}</p>
        <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Limite atual de {editor.maxRecipients} contatos. A Altum respeita opt-out, telefones validos e o remetente selecionado.</p>
      </div>
    </div>
  );
}

function PhonePreview({ editor, official }: { editor: Campaign; official: boolean }) {
  const text = official
    ? editor.templateName
      ? `Template ${editor.templateName}\n${editor.bodyParams.join(" | ")}`
      : "Escolha um template aprovado para visualizar."
    : editor.messageTemplate || "Sua mensagem aparece aqui.";
  return (
    <div className="mx-auto max-w-[310px] overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-[#efeae2] shadow-xl">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><MessageCircle className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Previa do WhatsApp</p>
          <p className="text-[11px] text-white/70">mensagem comercial</p>
        </div>
      </div>
      <div className="min-h-[330px] bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,.36)_1px,transparent_1px)] bg-[length:18px_18px] p-4 pt-20">
        <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-3 shadow-sm">
          <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-800">{text}</p>
          <p className="mt-1 text-right text-[10px] text-slate-500">agora ✓✓</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--cliente-card-text)]">{label}</span>
      {hint ? <span className="ml-2 text-xs text-[var(--cliente-card-text-soft)]">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
