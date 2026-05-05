"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardPen,
  Copy,
  ExternalLink,
  GripVertical,
  Loader2,
  Megaphone,
  Plus,
  Settings2,
  Save,
  ShieldCheck,
  Trash2,
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
  defaultCaptureLandingConfig,
  normalizeCaptureLandingConfig,
  type CaptureLandingConfig,
} from "@/lib/capture-landing";
import {
  type CaptureFieldDefinition,
  type CaptureFieldType,
} from "@/lib/capture-form";
import {
  getBusinessProfile,
  getBusinessProfileCapturePreset,
  getBusinessProfilePipelineStages,
  type BusinessProfileId,
} from "@/lib/business-profiles";

type CaptureForm = {
  id: string;
  name: string;
  description?: string;
  sourceLabel?: string;
  defaultPipelineStage?: string;
  defaultOwnerId?: string;
  defaultOwnerName?: string;
  tags?: string[];
  status?: string;
  successMessage?: string;
  submitLabel?: string;
  widgetLauncherLabel?: string;
  widgetGreeting?: string;
  requirePhone?: boolean;
  requireEmail?: boolean;
  collectCompany?: boolean;
  collectMessage?: boolean;
  fields?: CaptureFieldDefinition[];
  landing?: CaptureLandingConfig;
  submissionsCount?: number;
  lastSubmissionAt?: string | null;
  updatedAt?: string | null;
};

type CaptureSubmission = {
  id: string;
  formId: string;
  formName: string;
  leadId: string;
  leadName: string;
  phone?: string;
  email?: string;
  sourceLabel?: string;
  createdAt?: string | null;
};

type FormsPayload = {
  forms?: CaptureForm[];
  recentSubmissions?: CaptureSubmission[];
  topSources?: Array<{ label: string; total: number }>;
  topCampaigns?: Array<{ label: string; total: number }>;
  formPerformance?: Array<{ id: string; name: string; total: number; lastSubmissionAt?: string | null }>;
  error?: string;
};

type UserPayload = {
  items?: Array<{ userId?: string; name?: string; role?: string; status?: string }>;
};

type ChannelsPayload = {
  items?: Array<{ type?: string; phoneNumber?: string; status?: string }>;
};

type SettingsPayload = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

const STATUS_OPTIONS = ["draft", "active", "inactive"] as const;

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("pt-BR");
}

function emptyFormState() {
  return {
    id: "",
    name: "",
    description: "",
    sourceLabel: "Formulario site",
    defaultPipelineStage: "captado",
    defaultOwnerId: "",
    tagsInput: "",
    status: "draft",
    successMessage: "Contato recebido com sucesso.",
    submitLabel: "Enviar",
    widgetLauncherLabel: "Abrir chat",
    widgetGreeting: "Digite sua mensagem para iniciar o atendimento.",
    requirePhone: false,
    requireEmail: false,
    collectCompany: true,
    collectMessage: true,
    fields: [] as CaptureFieldDefinition[],
    landing: defaultCaptureLandingConfig(),
  };
}

function metricsToText(metrics: CaptureLandingConfig["metrics"]) {
  return metrics.map((item) => `${item.label}: ${item.value}`).join("\n");
}

function testimonialsToText(testimonials: CaptureLandingConfig["testimonials"]) {
  return testimonials.map((item) => `${item.quote} | ${item.author}${item.role ? ` | ${item.role}` : ""}`).join("\n");
}

function faqToText(faq: CaptureLandingConfig["faq"]) {
  return faq.map((item) => `${item.question} | ${item.answer}`).join("\n");
}

function parseLineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMetrics(value: string) {
  return parseLineList(value)
    .map((line) => {
      const [label, metricValue] = line.split(":").map((item) => item.trim());
      if (!label || !metricValue) return null;
      return { label, value: metricValue };
    })
    .filter(Boolean) as CaptureLandingConfig["metrics"];
}

function parseTestimonials(value: string) {
  return parseLineList(value)
    .map((line) => {
      const [quote, author, role] = line.split("|").map((item) => item.trim());
      if (!quote || !author) return null;
      return { quote, author, role: role || "" };
    })
    .filter(Boolean) as CaptureLandingConfig["testimonials"];
}

function parseFaq(value: string) {
  return parseLineList(value)
    .map((line) => {
      const [question, answer] = line.split("|").map((item) => item.trim());
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter(Boolean) as CaptureLandingConfig["faq"];
}

function createEmptyField(index: number): CaptureFieldDefinition {
  return {
    id: `campo_${index}`,
    label: `Campo ${index}`,
    type: "text",
    required: false,
    placeholder: "",
    helperText: "",
    options: [],
    step: 1,
    showWhenFieldId: "",
    showWhenEquals: "",
  };
}

export default function ClienteCaptacaoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formFromQuery = searchParams.get("formId");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forms, setForms] = useState<CaptureForm[]>([]);
  const [submissions, setSubmissions] = useState<CaptureSubmission[]>([]);
  const [users, setUsers] = useState<Array<{ userId?: string; name?: string }>>([]);
  const [channels, setChannels] = useState<Array<{ type?: string; phoneNumber?: string; status?: string }>>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [topSources, setTopSources] = useState<Array<{ label: string; total: number }>>([]);
  const [topCampaigns, setTopCampaigns] = useState<Array<{ label: string; total: number }>>([]);
  const [formPerformance, setFormPerformance] = useState<Array<{ id: string; name: string; total: number; lastSubmissionAt?: string | null }>>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [siteOrigin, setSiteOrigin] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formState, setFormState] = useState(emptyFormState());

  const canManage = hasCapability("manage_settings");
  const allowAdvanced = experienceMode === "completo";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteOrigin(window.location.origin);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    setLoading(true);
    setError(null);

    try {
      const [formsRes, usersRes, channelsRes, settingsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/capture/forms`),
        authedFetch(`/api/tenant/${tenant.tenantId}/users`),
        authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
      ]);

      const formsPayload = (await formsRes.json()) as FormsPayload;
      const usersPayload = (await usersRes.json()) as UserPayload;
      const channelsPayload = (await channelsRes.json()) as ChannelsPayload;
      const settingsPayload = (await settingsRes.json().catch(() => ({}))) as SettingsPayload;

      if (!formsRes.ok) {
        setError(formsPayload.error || "Falha ao carregar captacao.");
        setForms([]);
        setSubmissions([]);
        return;
      }

      const nextForms = formsPayload.forms || [];
      setForms(nextForms);
      setSubmissions(formsPayload.recentSubmissions || []);
      setTopSources(formsPayload.topSources || []);
      setTopCampaigns(formsPayload.topCampaigns || []);
      setFormPerformance(formsPayload.formPerformance || []);
      setUsers((usersPayload.items || []).filter((item) => item.userId));
      setChannels(channelsPayload.items || []);
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setSelectedFormId((current) => {
        if (current && nextForms.some((item) => item.id === current)) return current;
        if (formFromQuery && nextForms.some((item) => item.id === formFromQuery)) return formFromQuery;
        return nextForms[0]?.id || null;
      });
    } catch {
      setError("Falha ao carregar dados de captacao.");
    } finally {
      setLoading(false);
    }
  }, [formFromQuery, tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedForm = useMemo(
    () => forms.find((item) => item.id === selectedFormId) || null,
    [forms, selectedFormId]
  );
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const capturePreset = useMemo(() => getBusinessProfileCapturePreset(businessProfileId), [businessProfileId]);
  const pipelineStages = useMemo(() => getBusinessProfilePipelineStages(businessProfileId), [businessProfileId]);

  useEffect(() => {
    if (!selectedForm) {
      setFormState(emptyFormState());
      return;
    }

    setFormState({
      id: selectedForm.id,
      name: selectedForm.name || "",
      description: selectedForm.description || "",
      sourceLabel: selectedForm.sourceLabel || "Formulario site",
      defaultPipelineStage: selectedForm.defaultPipelineStage || "captado",
      defaultOwnerId: selectedForm.defaultOwnerId || "",
      tagsInput: (selectedForm.tags || []).join(", "),
      status: selectedForm.status || "draft",
      successMessage: selectedForm.successMessage || "Contato recebido com sucesso.",
      submitLabel: selectedForm.submitLabel || "Enviar",
      widgetLauncherLabel: selectedForm.widgetLauncherLabel || "Abrir chat",
      widgetGreeting: selectedForm.widgetGreeting || "Digite sua mensagem para iniciar o atendimento.",
      requirePhone: Boolean(selectedForm.requirePhone),
      requireEmail: Boolean(selectedForm.requireEmail),
      collectCompany: selectedForm.collectCompany !== false,
      collectMessage: selectedForm.collectMessage !== false,
      fields: selectedForm.fields || [],
      landing: normalizeCaptureLandingConfig(selectedForm.landing),
    });
  }, [selectedForm]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedFormId) next.set("formId", selectedFormId);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/captacao?${nextQuery}` : "/cliente/painel/captacao");
  }, [router, searchParams, selectedFormId]);

  const activeForms = useMemo(() => forms.filter((item) => item.status === "active").length, [forms]);
  const totalSubmissions = useMemo(() => forms.reduce((sum, item) => sum + Number(item.submissionsCount || 0), 0), [forms]);
  const activeWhatsApp = useMemo(
    () => channels.find((channel) => channel.type === "whatsapp" && channel.status === "active" && channel.phoneNumber),
    [channels]
  );
  const normalizedWhatsAppPhone = useMemo(
    () => String(activeWhatsApp?.phoneNumber || "").replace(/\D/g, ""),
    [activeWhatsApp?.phoneNumber]
  );
  const publicUrl = formState.id && siteOrigin ? `${siteOrigin}/f/${formState.id}` : "";
  const embedCode = formState.id && siteOrigin
    ? `<iframe src="${siteOrigin}/embed/f/${formState.id}" width="100%" height="720" style="border:0;border-radius:24px;overflow:hidden"></iframe>`
    : "";
  const launcherCode = formState.id && siteOrigin
    ? `<script>(function(){const b=document.createElement('button');b.innerText=${JSON.stringify(formState.widgetLauncherLabel || "Abrir chat")};Object.assign(b.style,{position:'fixed',right:'24px',bottom:'24px',zIndex:'9999',background:'#2563eb',color:'#fff',border:'0',borderRadius:'999px',padding:'14px 18px',font:'600 14px sans-serif',cursor:'pointer',boxShadow:'0 12px 30px rgba(0,0,0,.24)'});const o=document.createElement('div');o.innerHTML='<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:20px;z-index:9998"><div style="width:min(440px,100%);height:min(760px,100%);position:relative"><button style="position:absolute;right:12px;top:12px;z-index:2;background:#111;color:#fff;border:0;border-radius:999px;width:36px;height:36px;cursor:pointer">x</button><iframe src="${siteOrigin}/widget/f/${formState.id}" style="width:100%;height:100%;border:0;border-radius:28px;overflow:hidden"></iframe></div></div>';const overlay=o.firstChild;const closeBtn=overlay.querySelector('button');b.onclick=()=>overlay.style.display='flex';closeBtn.onclick=()=>overlay.style.display='none';overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.style.display='none'});document.body.appendChild(b);document.body.appendChild(overlay);})();</script>`
    : "";
  const widgetCode = formState.id && siteOrigin
    ? `<iframe src="${siteOrigin}/widget/f/${formState.id}" width="100%" height="760" style="border:0;border-radius:24px;overflow:hidden"></iframe>`
    : "";
  const whatsappCode = normalizedWhatsAppPhone
    ? `<a href="https://wa.me/${normalizedWhatsAppPhone}" target="_blank" rel="noreferrer" style="position:fixed;right:24px;bottom:24px;z-index:9999;background:#25D366;color:#08140c;text-decoration:none;border-radius:999px;padding:14px 18px;font:700 14px sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.24)">WhatsApp</a>`
    : "";

  const focusSignals = useMemo(() => {
    const items: Array<{
      id: string;
      href: string;
      title: string;
      detail: string;
      badge: string;
      tone: "neutral" | "success" | "warning" | "danger" | "info";
    }> = [];

    if (activeForms === 0) {
      items.push({
        id: "no_active_form",
        href: "/cliente/painel/captacao",
        title: "Nenhum formulario ativo",
        detail: "Ative ao menos um formulario para receber contatos publicamente.",
        badge: "configurar",
        tone: "warning",
      });
    }

    if (totalSubmissions === 0) {
      items.push({
        id: "no_submissions",
        href: "/cliente/painel/captacao",
        title: "Sem capturas recentes",
        detail: "Ainda nao houve envios; vale revisar publicacao, embed e origem de trafego.",
        badge: "trafego",
        tone: "info",
      });
    }

    if (!normalizedWhatsAppPhone) {
      items.push({
        id: "no_whatsapp",
        href: "/cliente/painel/configuracoes/canais",
        title: "WhatsApp nao conectado para widget",
        detail: "Conecte um numero ativo para habilitar o botao direto de captacao.",
        badge: "canal",
        tone: "warning",
      });
    }

    if (selectedFormId && publicUrl) {
      items.push({
        id: "current_form",
        href: publicUrl,
        title: "Formulario atual pronto para publicar",
        detail: "Abra a pagina publica e valide a experiencia de captura ponta a ponta.",
        badge: "publico",
        tone: "success",
      });
    }

    return items.slice(0, 4);
  }, [activeForms, normalizedWhatsAppPhone, publicUrl, selectedFormId, totalSubmissions]);

  function handleCreate() {
    if (!canManage) return;
    setSelectedFormId(null);
    setFormState({
      ...emptyFormState(),
      name: capturePreset.nameSuggestion || `Formulario ${forms.length + 1}`,
      description: capturePreset.descriptionSuggestion,
      sourceLabel: capturePreset.sourceLabel,
      defaultPipelineStage: capturePreset.defaultPipelineStage,
      tagsInput: capturePreset.tags.join(", "),
      submitLabel: capturePreset.submitLabel,
      widgetLauncherLabel: capturePreset.widgetLauncherLabel,
      widgetGreeting: capturePreset.widgetGreeting,
      successMessage: capturePreset.successMessage,
      fields: capturePreset.fields,
      landing: capturePreset.landing,
    });
    setNotice(null);
    setError(null);
  }

  function applyBusinessPreset() {
    if (!canManage) return;
    setFormState((current) => ({
      ...current,
      sourceLabel: capturePreset.sourceLabel,
      defaultPipelineStage: capturePreset.defaultPipelineStage,
      tagsInput: capturePreset.tags.join(", "),
      submitLabel: capturePreset.submitLabel,
      widgetLauncherLabel: capturePreset.widgetLauncherLabel,
      widgetGreeting: capturePreset.widgetGreeting,
      successMessage: capturePreset.successMessage,
      fields: capturePreset.fields,
      landing: capturePreset.landing,
      description: current.description || capturePreset.descriptionSuggestion,
      name: current.name || capturePreset.nameSuggestion,
    }));
    setNotice(`Preset aplicado para ${businessProfile.label}.`);
  }

  async function copyValue(key: string, value: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setNotice("Conteudo copiado.");
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      setError("Falha ao copiar conteudo.");
    }
  }

  async function handleSave() {
    if (!tenant?.tenantId || !canManage) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const body = {
        name: formState.name,
        description: formState.description,
        sourceLabel: formState.sourceLabel,
        defaultPipelineStage: formState.defaultPipelineStage,
        defaultOwnerId: formState.defaultOwnerId || null,
        tags: formState.tagsInput,
        status: formState.status,
        successMessage: formState.successMessage,
        submitLabel: formState.submitLabel,
        widgetLauncherLabel: formState.widgetLauncherLabel,
        widgetGreeting: formState.widgetGreeting,
        requirePhone: formState.requirePhone,
        requireEmail: formState.requireEmail,
        collectCompany: formState.collectCompany,
        collectMessage: formState.collectMessage,
        fields: formState.fields,
        landing: formState.landing,
      };

      const isEditing = Boolean(formState.id);
      const path = isEditing
        ? `/api/tenant/${tenant.tenantId}/capture/forms/${formState.id}`
        : `/api/tenant/${tenant.tenantId}/capture/forms`;
      const method = isEditing ? "PATCH" : "POST";

      const res = await authedFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error?: string; formId?: string };

      if (!res.ok) {
        setError(payload.error || "Falha ao salvar formulario.");
        return;
      }

      await loadData();
      if (!isEditing && payload.formId) setSelectedFormId(payload.formId);
      setNotice(isEditing ? "Formulario atualizado." : "Formulario criado.");
    } catch {
      setError("Falha ao salvar formulario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!tenant?.tenantId || !formState.id || !canManage) return;

    setDeleting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/capture/forms/${formState.id}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(payload.error || "Falha ao remover formulario.");
        return;
      }

      await loadData();
      setSelectedFormId(null);
      setFormState(emptyFormState());
      setNotice("Formulario removido.");
    } catch {
      setError("Falha ao remover formulario.");
    } finally {
      setDeleting(false);
    }
  }

  function addField() {
    if (!canManage) return;
    setFormState((current) => ({
      ...current,
      fields: [...current.fields, createEmptyField(current.fields.length + 1)],
    }));
  }

  function updateField(fieldId: string, patch: Partial<CaptureFieldDefinition>) {
    setFormState((current) => ({
      ...current,
      fields: current.fields.map((field) => {
        if (field.id !== fieldId) return field;
        const next = { ...field, ...patch };
        if (patch.type && patch.type !== "select") {
          next.options = [];
        }
        if (!next.showWhenFieldId) {
          next.showWhenEquals = "";
        }
        return next;
      }),
    }));
  }

  function removeField(fieldId: string) {
    if (!canManage) return;
    setFormState((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  }

  function moveField(fieldId: string, direction: "up" | "down") {
    if (!canManage) return;
    setFormState((current) => {
      const index = current.fields.findIndex((field) => field.id === fieldId);
      if (index < 0) return current;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.fields.length) return current;
      const nextFields = [...current.fields];
      const [item] = nextFields.splice(index, 1);
      nextFields.splice(targetIndex, 0, item);
      return { ...current, fields: nextFields };
    });
  }

  const fieldSummary = useMemo(() => {
    const fields = formState.fields || [];
    const stepCount = Math.max(0, ...fields.map((field) => Number(field.step || 1)));
    return {
      total: fields.length,
      required: fields.filter((field) => field.required).length,
      conditional: fields.filter((field) => field.showWhenFieldId).length,
      steps: stepCount,
    };
  }, [formState.fields]);
  const landingSummary = useMemo(() => {
    const landing = normalizeCaptureLandingConfig(formState.landing);
    return {
      highlights: landing.highlights.length,
      metrics: landing.metrics.length,
      testimonials: landing.testimonials.length,
      faq: landing.faq.length,
    };
  }, [formState.landing]);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="captacao-refined client-daily-page space-y-6">
      <SectionHeader
        title="Captacao"
        subtitle="Formularios publicos para transformar trafego em contatos no CRM da operacao."
        action={<StateBadge label="Captacao ativa" tone="info" />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Formularios" value={String(forms.length)} icon={ClipboardPen} trend="ativos e em rascunho" />
        <MetricCard label="Ativos" value={String(activeForms)} icon={ShieldCheck} trend="prontos para receber contatos" />
        <MetricCard label="Envios" value={String(totalSubmissions)} icon={Megaphone} trend="capturas acumuladas" />
        <MetricCard label="Responsaveis" value={String(users.length)} icon={Plus} trend="time disponivel para distribuicao" />
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        {focusSignals.length === 0 ? (
          <PanelCard className="p-4 xl:col-span-4">
            <p className="text-sm font-semibold text-white">Captacao sem alertas criticos</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
              Os formularios e canais principais ja estao em um estado razoavel para operacao.
            </p>
          </PanelCard>
        ) : (
          focusSignals.map((item) =>
            item.href.startsWith("http") ? (
              <a
                key={item.id}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                  </div>
                  <StateBadge label={item.badge} tone={item.tone} />
                </div>
              </a>
            ) : (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                  </div>
                  <StateBadge label={item.badge} tone={item.tone} />
                </div>
              </Link>
            )
          )
        )}
      </section>

      <PanelCard className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle
            title={`Modo do negocio: ${businessProfile.label}`}
            subtitle="Use o perfil ativo da conta para acelerar configuracao de formulario, pagina e qualificacao."
          />
          <div className="flex flex-wrap gap-2">
            <StateBadge label={businessProfile.id} tone="info" />
            {canManage ? (
              <button
                type="button"
                onClick={applyBusinessPreset}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
              >
                <Save className="h-3.5 w-3.5" />
                Aplicar preset do modo
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-sm font-semibold text-white">Campos sugeridos para captacao</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.crm.leadFields.map((field) => (
                <StateBadge key={field} label={field.replaceAll("_", " ")} tone="neutral" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-sm font-semibold text-white">Movimento comercial esperado</p>
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.commercialMotion}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.metrics.map((metric) => (
                <StateBadge key={metric} label={metric} tone="info" />
              ))}
            </div>
          </div>
        </div>
      </PanelCard>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <PanelCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Formularios" subtitle={`${forms.length} configurados`} />
            {canManage ? (
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {forms.length === 0 ? (
              <EmptyState title="Nenhum formulario criado" description="Crie o primeiro formulario publico para capturar contatos no CRM." />
            ) : (
              forms.map((form) => (
                <button
                  key={form.id}
                  type="button"
                  onClick={() => setSelectedFormId(form.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    selectedFormId === form.id
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] hover:bg-[var(--cliente-surface-muted)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{form.name}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{form.sourceLabel || "Formulario"}</p>
                    </div>
                    <StateBadge label={form.status || "draft"} tone={form.status === "active" ? "success" : form.status === "inactive" ? "warning" : "neutral"} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--cliente-card-text-soft)]">
                    <span>{form.submissionsCount || 0} envios</span>
                    <span>{formatDate(form.lastSubmissionAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <CardTitle title={formState.id ? "Editor do formulario" : "Novo formulario"} subtitle="Origem, etapa inicial, responsavel e mensagem de sucesso." />
              <StateBadge label={canManage ? "editavel" : "somente leitura"} tone={canManage ? "info" : "neutral"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Nome" value={formState.name} onChange={(value) => setFormState((current) => ({ ...current, name: value }))} placeholder="Formulario principal" disabled={!canManage} />
              <Field label="Origem" value={formState.sourceLabel} onChange={(value) => setFormState((current) => ({ ...current, sourceLabel: value }))} placeholder="Landing page" disabled={!canManage} />
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Etapa inicial</span>
                <select
                  value={formState.defaultPipelineStage}
                  onChange={(event) => setFormState((current) => ({ ...current, defaultPipelineStage: event.target.value }))}
                  disabled={!canManage}
                  className="client-input w-full rounded-xl px-3 py-2.5 text-sm"
                >
                  {pipelineStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Responsavel padrao</span>
                <select
                  value={formState.defaultOwnerId}
                  onChange={(event) => setFormState((current) => ({ ...current, defaultOwnerId: event.target.value }))}
                  disabled={!canManage}
                  className="client-input w-full rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value="">Distribuicao livre</option>
                  {users.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Descricao</span>
                <textarea
                  value={formState.description}
                  onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                  disabled={!canManage}
                  placeholder="Explique onde este formulario sera usado e qual campanha alimenta esta captacao."
                  className="client-input min-h-[96px] w-full rounded-2xl px-3 py-3 text-sm"
                />
              </label>
              <Field label="Tags iniciais" value={formState.tagsInput} onChange={(value) => setFormState((current) => ({ ...current, tagsInput: value }))} placeholder="lp, meta_ads, topo_funil" disabled={!canManage} />
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Status</span>
                <select
                  value={formState.status}
                  onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))}
                  disabled={!canManage}
                  className="client-input w-full rounded-xl px-3 py-2.5 text-sm"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Mensagem de sucesso" value={formState.successMessage} onChange={(value) => setFormState((current) => ({ ...current, successMessage: value }))} placeholder="Recebemos seu contato" disabled={!canManage} />
              <Field label="CTA do formulario" value={formState.submitLabel} onChange={(value) => setFormState((current) => ({ ...current, submitLabel: value }))} placeholder="Enviar" disabled={!canManage} />
              <Field label="Rotulo do launcher" value={formState.widgetLauncherLabel} onChange={(value) => setFormState((current) => ({ ...current, widgetLauncherLabel: value }))} placeholder="Abrir chat" disabled={!canManage} />
              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Mensagem inicial do widget</span>
                <textarea
                  value={formState.widgetGreeting}
                  onChange={(event) => setFormState((current) => ({ ...current, widgetGreeting: event.target.value }))}
                  disabled={!canManage}
                  placeholder="Digite sua mensagem para iniciar o atendimento."
                  className="client-input min-h-[96px] w-full rounded-2xl px-3 py-3 text-sm disabled:opacity-60"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <ToggleTile
                label="Exigir telefone"
                description="Forca o contato a informar telefone antes do envio."
                checked={Boolean(formState.requirePhone)}
                onChange={(checked) => setFormState((current) => ({ ...current, requirePhone: checked }))}
                disabled={!canManage}
              />
              <ToggleTile
                label="Exigir email"
                description="Usa email como dado obrigatorio da captacao."
                checked={Boolean(formState.requireEmail)}
                onChange={(checked) => setFormState((current) => ({ ...current, requireEmail: checked }))}
                disabled={!canManage}
              />
              <ToggleTile
                label="Coletar empresa"
                description="Exibe o campo empresa no formulario e no widget."
                checked={formState.collectCompany !== false}
                onChange={(checked) => setFormState((current) => ({ ...current, collectCompany: checked }))}
                disabled={!canManage}
              />
              <ToggleTile
                label="Coletar mensagem"
                description="Mantem campo aberto para contexto inicial do contato."
                checked={formState.collectMessage !== false}
                onChange={(checked) => setFormState((current) => ({ ...current, collectMessage: checked }))}
                disabled={!canManage}
              />
            </div>

            {allowAdvanced ? (
            <>
            <div className="mt-5 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Estrutura avancada do formulario</p>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
                    Crie etapas de qualificacao, campos condicionais e perguntas personalizadas para a conta.
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={addField}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Novo campo
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Campos customizados" value={String(fieldSummary.total)} icon={Settings2} trend="perguntas extras da conta" />
                <MetricCard label="Obrigatorios" value={String(fieldSummary.required)} icon={ShieldCheck} trend="dados criticos da captacao" />
                <MetricCard label="Condicionais" value={String(fieldSummary.conditional)} icon={GripVertical} trend="logica por resposta" />
                <MetricCard label="Etapas extras" value={String(fieldSummary.steps)} icon={ClipboardPen} trend="passos alem do bloco base" />
              </div>

              <div className="mt-4 space-y-3">
                {(formState.fields || []).length === 0 ? (
                  <EmptyState
                    title="Sem campos customizados"
                    description="Use o schema para enriquecer a qualificacao com dropdowns, checkboxes, datas, numeros e logica condicional."
                  />
                ) : (
                  (formState.fields || []).map((field, index) => (
                    <CaptureFieldCard
                      key={field.id}
                      index={index}
                      field={field}
                      fields={formState.fields}
                      disabled={!canManage}
                      onUpdate={updateField}
                      onRemove={removeField}
                      onMove={moveField}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Construtor da pagina</p>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
                    Monte a narrativa da pagina publica com hero, prova, depoimentos e FAQ, mantendo o mesmo formulario.
                  </p>
                </div>
                <StateBadge label="pagina publica" tone="info" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Destaques" value={String(landingSummary.highlights)} icon={Megaphone} trend="blocos de valor" />
                <MetricCard label="Metricas" value={String(landingSummary.metrics)} icon={Settings2} trend="provas do hero" />
                <MetricCard label="Depoimentos" value={String(landingSummary.testimonials)} icon={ShieldCheck} trend="prova social" />
                <MetricCard label="FAQ" value={String(landingSummary.faq)} icon={ClipboardPen} trend="objecoes resolvidas" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field
                  label="Badge"
                  value={formState.landing.badge}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      landing: { ...current.landing, badge: value },
                    }))
                  }
                  placeholder="Captacao premium"
                  disabled={!canManage}
                />
                <Field
                  label="Titulo principal"
                  value={formState.landing.heroTitle}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      landing: { ...current.landing, heroTitle: value },
                    }))
                  }
                  placeholder="Atraia contatos com atendimento consultivo e automacao"
                  disabled={!canManage}
                />
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Descricao do hero</span>
                  <textarea
                    value={formState.landing.heroDescription}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        landing: { ...current.landing, heroDescription: event.target.value },
                      }))
                    }
                    disabled={!canManage}
                    placeholder="Explique a proposta de valor da campanha e como o contato sera atendido."
                    className="client-input min-h-[110px] w-full rounded-2xl px-3 py-3 text-sm placeholder:text-[var(--cliente-card-text-soft)]"
                  />
                </label>
                <Field
                  label="Titulo do card do formulario"
                  value={formState.landing.formCardTitle}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      landing: { ...current.landing, formCardTitle: value },
                    }))
                  }
                  placeholder="Solicite um contato"
                  disabled={!canManage}
                />
                <Field
                  label="Nota de CTA"
                  value={formState.landing.ctaNote}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      landing: { ...current.landing, ctaNote: value },
                    }))
                  }
                  placeholder="Resposta comercial com contexto e roteamento."
                  disabled={!canManage}
                />
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Descricao do card do formulario</span>
                  <textarea
                    value={formState.landing.formCardDescription}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        landing: { ...current.landing, formCardDescription: event.target.value },
                      }))
                    }
                    disabled={!canManage}
                    placeholder="Oriente o contato sobre o que acontece depois do envio."
                    className="client-input min-h-[96px] w-full rounded-2xl px-3 py-3 text-sm placeholder:text-[var(--cliente-card-text-soft)]"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Destaques da oferta</span>
                  <textarea
                    value={formState.landing.highlights.join("\n")}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        landing: { ...current.landing, highlights: parseLineList(event.target.value) },
                      }))
                    }
                    disabled={!canManage}
                    placeholder={"Linha por linha.\nEx: Atendimento consultivo em minutos"}
                    className="client-input min-h-[150px] w-full rounded-2xl px-3 py-3 text-sm placeholder:text-[var(--cliente-card-text-soft)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Metricas do hero</span>
                  <textarea
                    value={metricsToText(formState.landing.metrics)}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        landing: { ...current.landing, metrics: parseMetrics(event.target.value) },
                      }))
                    }
                    disabled={!canManage}
                    placeholder={"Uma por linha.\nFluxo: Site -> CRM -> Conversas"}
                    className="client-input min-h-[150px] w-full rounded-2xl px-3 py-3 text-sm placeholder:text-[var(--cliente-card-text-soft)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Depoimentos</span>
                  <textarea
                    value={testimonialsToText(formState.landing.testimonials)}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        landing: { ...current.landing, testimonials: parseTestimonials(event.target.value) },
                      }))
                    }
                    disabled={!canManage}
                    placeholder={'Uma por linha. Formato: "Quote" | Nome | Cargo'}
                    className="client-input min-h-[150px] w-full rounded-2xl px-3 py-3 text-sm placeholder:text-[var(--cliente-card-text-soft)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">FAQ</span>
                  <textarea
                    value={faqToText(formState.landing.faq)}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        landing: { ...current.landing, faq: parseFaq(event.target.value) },
                      }))
                    }
                    disabled={!canManage}
                    placeholder={"Uma por linha. Formato: Pergunta | Resposta"}
                    className="client-input min-h-[150px] w-full rounded-2xl px-3 py-3 text-sm placeholder:text-[var(--cliente-card-text-soft)]"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--cliente-accent)]/15 bg-[var(--cliente-accent-soft)] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-accent)]/80">Preview estrutural</p>
                <div className="mt-3 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel)] p-5">
                    <p className="inline-flex rounded-full border border-[var(--cliente-accent)]/20 bg-[var(--cliente-accent-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-accent)]">
                      {formState.landing.badge || "Captacao premium"}
                    </p>
                    <h3 className="mt-4 text-2xl font-semibold text-[var(--cliente-card-text)]">
                      {formState.landing.heroTitle || formState.name || "Sua pagina de captacao"}
                    </h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">
                      {formState.landing.heroDescription || formState.description || "A narrativa da pagina publica aparecera aqui."}
                    </p>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {formState.landing.metrics.map((metric, index) => (
                        <div key={`${metric.label}_${index}`} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{metric.label}</p>
                          <p className="mt-2 text-sm font-medium text-[var(--cliente-card-text)]">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                    {formState.landing.highlights.length ? (
                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        {formState.landing.highlights.slice(0, 4).map((item) => (
                          <div key={item} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text)]/84">
                            {item}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-5">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                      {formState.landing.formCardTitle || "Solicite um contato"}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[var(--cliente-card-text-soft)]">
                      {formState.landing.formCardDescription || "O card do formulario aparecera aqui."}
                    </p>
                    <div className="mt-5 space-y-2">
                      {formState.landing.testimonials.slice(0, 2).map((item) => (
                        <div key={`${item.author}_${item.quote}`} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                          <p className="text-sm text-[var(--cliente-card-text)]/84">&ldquo;{item.quote}&rdquo;</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                            {item.author}
                            {item.role ? ` | ${item.role}` : ""}
                          </p>
                        </div>
                      ))}
                      {formState.landing.faq.slice(0, 2).map((item) => (
                        <div key={item.question} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                          <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.question}</p>
                          <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">{item.answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Pagina publica</p>
              <p className="mt-2 break-all text-sm text-[var(--cliente-card-text)]/90">
                {publicUrl || "Salve o formulario para gerar a URL publica de captura."}
              </p>
              <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
                Use essa URL como pagina direta. O envio publica no endpoint interno e entra no CRM com conta isolada.
              </p>
              {publicUrl ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyValue("public", publicUrl)}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedKey === "public" ? "Copiado" : "Copiar URL"}
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir
                  </a>
                </div>
              ) : null}
              <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Embed iframe</p>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-xs text-[var(--cliente-card-text)]/80">
                {embedCode || "Salve o formulario para gerar o embed."}
              </pre>
              {embedCode ? (
                <button
                  type="button"
                  onClick={() => void copyValue("embed", embedCode)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedKey === "embed" ? "Copiado" : "Copiar embed"}
                </button>
              ) : null}
              <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
                A pagina publica aceita UTMs, campos base e qualquer schema customizado salvo neste formulario.
              </p>
              <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Botao flutuante</p>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-xs text-[var(--cliente-card-text)]/80">
                {launcherCode || "Salve o formulario para gerar o botao flutuante."}
              </pre>
              {launcherCode ? (
                <button
                  type="button"
                  onClick={() => void copyValue("launcher", launcherCode)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedKey === "launcher" ? "Copiado" : "Copiar botao flutuante"}
                </button>
              ) : null}
              <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Widget iframe</p>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-xs text-[var(--cliente-card-text)]/80">
                {widgetCode || "Salve o formulario para gerar o widget."}
              </pre>
              {widgetCode ? (
                <button
                  type="button"
                  onClick={() => void copyValue("widget", widgetCode)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedKey === "widget" ? "Copiado" : "Copiar widget"}
                </button>
              ) : null}
              <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Botao WhatsApp</p>
              <pre className="mt-2 overflow-x-auto rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-xs text-[var(--cliente-card-text)]/80">
                {whatsappCode || "Configure um canal WhatsApp ativo para gerar o botao direto."}
              </pre>
              {whatsappCode ? (
                <button
                  type="button"
                  onClick={() => void copyValue("whatsapp", whatsappCode)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedKey === "whatsapp" ? "Copiado" : "Copiar botao"}
                </button>
              ) : null}
            </div>
            </>
            ) : (
              <div className="mt-5 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Modo essencial ativo</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">
                  Escondemos estrutura avancada, construtor da pagina e codigos de incorporacao para manter a operacao simples no dia a dia.
                </p>
                <button
                  type="button"
                  onClick={() => setExperienceMode("completo")}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
                >
                  Abrir modo completo
                </button>
              </div>
            )}

            {canManage ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !formState.name.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-55"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar formulario
                </button>
                {formState.id ? (
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
              </div>
            ) : null}
          </PanelCard>

          <PanelCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Envios recentes" subtitle="Ultimos contatos que entraram pelos formularios da conta" />
              <StateBadge label={`${submissions.length} registros`} tone="info" />
            </div>

            <div className="mt-4 space-y-2">
              {submissions.length === 0 ? (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao ha envios recentes para exibir.</p>
              ) : (
                submissions.map((submission) => (
                  <div key={submission.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{submission.leadName}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{submission.email || submission.phone || "Sem contato"}</p>
                      </div>
                      <StateBadge label={submission.sourceLabel || submission.formName} tone="neutral" />
                    </div>
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{submission.formName}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]/80">{formatDate(submission.createdAt)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/cliente/painel/crm?leadId=${encodeURIComponent(submission.leadId)}`}
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                      >
                        Abrir CRM
                      </Link>
                      <Link
                        href={`/cliente/painel/inbox?leadId=${encodeURIComponent(submission.leadId)}`}
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                      >
                        Abrir Conversas
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelCard>

          <section className="grid gap-4 xl:grid-cols-3">
            <PanelCard className="p-5">
              <CardTitle title="Top origens" subtitle="UTM source ou origem declarada do formulario" />
              <div className="mt-4 space-y-2">
                {topSources.length === 0 ? (
                  <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem atribuicao de origem ainda.</p>
                ) : (
                  topSources.map((item) => (
                    <Link
                      key={item.label}
                      href={`/cliente/painel/crm?source=${encodeURIComponent(item.label)}`}
                      className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 transition hover:bg-[var(--cliente-surface-hover)]"
                    >
                      <span className="text-sm text-[var(--cliente-card-text)]/84">{item.label}</span>
                      <StateBadge label={`${item.total} contatos`} tone="neutral" />
                    </Link>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <CardTitle title="Top campanhas" subtitle="UTM campaign mais recorrentes na captura" />
              <div className="mt-4 space-y-2">
                {topCampaigns.length === 0 ? (
                  <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem campanhas identificadas ainda.</p>
                ) : (
                  topCampaigns.map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
                      <span className="text-sm text-[var(--cliente-card-text)]/84">{item.label}</span>
                      <StateBadge label={`${item.total} entradas`} tone="info" />
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <CardTitle title="Performance por formulario" subtitle="Quais formularios estao puxando mais entradas" />
              <div className="mt-4 space-y-2">
                {formPerformance.length === 0 ? (
                  <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem performance registrada ainda.</p>
                ) : (
                  formPerformance.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <StateBadge label={`${item.total} envios`} tone="success" />
                      </div>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(item.lastSubmissionAt)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedFormId(item.id)}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                        >
                          Editar formulario
                        </button>
                        {siteOrigin ? (
                          <a
                            href={`${siteOrigin}/f/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
                          >
                            Abrir pagina publica
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>
          </section>
        </div>
      </section>

      {error ? (
        <div className="rounded-[24px] border border-rose-400/18 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-[24px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{notice}</div>
      ) : null}
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
      <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="client-input w-full rounded-xl px-3 py-2.5 text-sm placeholder:text-[var(--cliente-card-text-soft)] disabled:opacity-60"
      />
    </label>
  );
}

const FIELD_TYPE_OPTIONS: Array<{ value: CaptureFieldType; label: string }> = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "select", label: "Selecao" },
  { value: "number", label: "Numero" },
  { value: "date", label: "Data" },
  { value: "checkbox", label: "Checkbox" },
];

function CaptureFieldCard(props: {
  index: number;
  field: CaptureFieldDefinition;
  fields: CaptureFieldDefinition[];
  disabled: boolean;
  onUpdate: (fieldId: string, patch: Partial<CaptureFieldDefinition>) => void;
  onRemove: (fieldId: string) => void;
  onMove: (fieldId: string, direction: "up" | "down") => void;
}) {
  const availableDependencies = props.fields.filter((item) => item.id !== props.field.id);

  return (
    <div className="captacao-field-card rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Campo {props.index + 1}: {props.field.label}
          </p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
            ID: {props.field.id} · etapa {props.field.step || 1}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => props.onMove(props.field.id, "up")}
            disabled={props.disabled || props.index === 0}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)]/84 transition hover:bg-[var(--cliente-surface-hover)] disabled:opacity-50"
          >
            Subir
          </button>
          <button
            type="button"
            onClick={() => props.onMove(props.field.id, "down")}
            disabled={props.disabled || props.index === props.fields.length - 1}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)]/84 transition hover:bg-[var(--cliente-surface-hover)] disabled:opacity-50"
          >
            Descer
          </button>
          <button
            type="button"
            onClick={() => props.onRemove(props.field.id)}
            disabled={props.disabled}
            className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Rotulo"
          value={props.field.label}
          onChange={(value) => props.onUpdate(props.field.id, { label: value })}
          placeholder="Orcamento estimado"
          disabled={props.disabled}
        />
        <Field
          label="ID tecnico"
          value={props.field.id}
          onChange={(value) =>
            props.onUpdate(props.field.id, {
              id: value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80) || props.field.id,
            })
          }
          placeholder="orcamento_estimado"
          disabled={props.disabled}
        />
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Tipo</span>
          <select
            value={props.field.type}
            onChange={(event) => props.onUpdate(props.field.id, { type: event.target.value as CaptureFieldType })}
            disabled={props.disabled}
            className="client-input w-full rounded-xl px-3 py-2.5 text-sm"
          >
            {FIELD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Placeholder"
          value={props.field.placeholder || ""}
          onChange={(value) => props.onUpdate(props.field.id, { placeholder: value })}
          placeholder="Digite a resposta"
          disabled={props.disabled}
        />
        <Field
          label="Texto de apoio"
          value={props.field.helperText || ""}
          onChange={(value) => props.onUpdate(props.field.id, { helperText: value })}
          placeholder="Use para orientar a resposta"
          disabled={props.disabled}
        />
        <Field
          label="Etapa"
          value={String(props.field.step || 1)}
          onChange={(value) => props.onUpdate(props.field.id, { step: Math.max(1, Math.min(12, Number(value || 1) || 1)) })}
          placeholder="1"
          disabled={props.disabled}
        />
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Dependencia</span>
          <select
            value={props.field.showWhenFieldId || ""}
            onChange={(event) =>
              props.onUpdate(props.field.id, {
                showWhenFieldId: event.target.value,
                showWhenEquals: event.target.value ? props.field.showWhenEquals || "" : "",
              })
            }
            disabled={props.disabled}
            className="client-input w-full rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">Sempre visivel</option>
            {availableDependencies.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Mostrar quando for"
          value={props.field.showWhenEquals || ""}
          onChange={(value) => props.onUpdate(props.field.id, { showWhenEquals: value })}
          placeholder={props.field.type === "checkbox" ? "true" : "Premium"}
          disabled={props.disabled || !props.field.showWhenFieldId}
        />
      </div>

      {props.field.type === "select" ? (
        <div className="mt-3">
          <Field
            label="Opcoes"
            value={(props.field.options || []).join(", ")}
            onChange={(value) =>
              props.onUpdate(props.field.id, {
                options: value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              })
            }
            placeholder="Basico, Intermediario, Premium"
            disabled={props.disabled}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <ToggleTile
          label="Obrigatorio"
          description="Exige preenchimento antes de concluir a etapa."
          checked={props.field.required}
          onChange={(checked) => props.onUpdate(props.field.id, { required: checked })}
          disabled={props.disabled}
        />
      </div>
    </div>
  );
}

function ToggleTile(props: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !props.disabled && props.onChange(!props.checked)}
      disabled={props.disabled}
      className={`captacao-toggle-card rounded-2xl border p-4 text-left transition ${
        props.checked ? "border-[var(--cliente-accent)]/25 bg-[var(--cliente-accent-soft)]" : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)]"
      } disabled:opacity-60`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{props.label}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{props.description}</p>
        </div>
        <StateBadge label={props.checked ? "ativo" : "desligado"} tone={props.checked ? "success" : "neutral"} />
      </div>
    </button>
  );
}


