"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Globe2,
  Instagram,
  Loader2,
  MessageCircle,
  Package,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";
import { BUSINESS_PROFILES, type BusinessProfileId } from "@/lib/business-profiles";
import type { TenantModuleId } from "@/lib/tenant-entitlements";
import type { SalesMotion } from "@/lib/sales-journey";
import type { BusinessBlueprint } from "@/lib/business-blueprint";

type OnboardingState = {
  currentStep: number;
  company: {
    name: string;
    segment: string;
    location: string;
    website: string;
    instagram: string;
    description: string;
    audience: string;
    businessHours: string;
    toneOfVoice: string;
    businessProfileId: BusinessProfileId;
  };
  offer: {
    offeringType: "products" | "services" | "both";
    summary: string;
    paymentMethods: string;
    deliveryPolicy: string;
    exchangePolicy: string;
    warrantyPolicy: string;
  };
  sales: {
    salesMotion: SalesMotion;
    operationNarrative: string;
    salesCycle: string;
    averageTicket: string;
    leadSources: string[];
    serviceStyle: "human" | "ai_assisted" | "ai_first";
    goals: string[];
    commonQuestions: string[];
    specialRules: string[];
  };
  imports: { spreadsheet: boolean; catalog: boolean; website: boolean; ecommerce: boolean };
};

type ProductSnapshot = {
  state: OnboardingState;
  status: string;
  preparedAt?: unknown;
  modules: Record<TenantModuleId, boolean>;
  channels: Array<{ id: string; type: string; displayName: string; status: string; connectionStatus: string }>;
  commerceConnections: Array<{ id: string; provider: string; status: string; connectionStatus: string }>;
  imports: { catalogItems: number; knowledgeDocs: number };
  blueprint?: { draft?: BusinessBlueprint; active?: BusinessBlueprint; status?: string };
};

type ApiPayload = {
  product?: ProductSnapshot;
  preparation?: {
    pipelineApplied?: boolean;
    automationsCreated?: number;
    knowledgeDocsCreated?: number;
    organizationalMemoryReady?: boolean;
    suggestedTags?: string[];
    leadFields?: string[];
  };
  error?: string;
  blueprint?: BusinessBlueprint;
  interpreted?: Partial<Pick<OnboardingState, "company" | "offer" | "sales">> & { assumptions?: string[]; missingInformation?: string[] };
  warning?: string;
};

const EMPTY_STATE: OnboardingState = {
  currentStep: 1,
  company: { name: "", segment: "", location: "", website: "", instagram: "", description: "", audience: "", businessHours: "", toneOfVoice: "", businessProfileId: "generic" },
  offer: { offeringType: "both", summary: "", paymentMethods: "", deliveryPolicy: "", exchangePolicy: "", warrantyPolicy: "" },
  sales: { salesMotion: "assisted_purchase", operationNarrative: "", salesCycle: "", averageTicket: "", leadSources: [], serviceStyle: "ai_assisted", goals: [], commonQuestions: [], specialRules: [] },
  imports: { spreadsheet: false, catalog: false, website: false, ecommerce: false },
};

const STEPS = [
  { id: 1, label: "Sua empresa", icon: Building2 },
  { id: 2, label: "O que vende", icon: ShoppingBag },
  { id: 3, label: "Canais", icon: MessageCircle },
  { id: 4, label: "Como vende", icon: Target },
  { id: 5, label: "Importar", icon: FileSpreadsheet },
  { id: 6, label: "Preparar", icon: Sparkles },
];

function splitLines(value: string) {
  return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function joined(value: string[]) {
  return value.join("\n");
}

export default function ClienteOnboardingPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState<OnboardingState>(EMPTY_STATE);
  const [snapshot, setSnapshot] = useState<ProductSnapshot | null>(null);
  const [preparation, setPreparation] = useState<ApiPayload["preparation"]>(undefined);
  const [blueprint, setBlueprint] = useState<BusinessBlueprint | null>(null);
  const canManage = hasCapability("manage_settings");
  const currentStep = Math.max(1, Math.min(6, state.currentStep || 1));

  useEffect(() => {
    if (!tenant?.tenantId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const response = await authedFetch(`/api/tenant/${tenant.tenantId}/onboarding`);
        const payload = await response.json() as ApiPayload;
        if (!mounted) return;
        if (!response.ok || !payload.product) throw new Error(payload.error || "Falha ao carregar a implantacao.");
        setSnapshot(payload.product);
        setState(payload.product.state || EMPTY_STATE);
        setBlueprint(payload.product.blueprint?.draft || payload.product.blueprint?.active || null);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a implantacao.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [tenant?.tenantId]);

  const connectedChannels = useMemo(
    () => (snapshot?.channels || []).filter((channel) => ["ready", "connected"].includes(channel.connectionStatus)),
    [snapshot?.channels]
  );
  const progress = snapshot?.status === "ready" ? 100 : Math.round(((currentStep - 1) / 6) * 100);

  function updateCompany(patch: Partial<OnboardingState["company"]>) {
    setState((current) => ({ ...current, company: { ...current.company, ...patch } }));
  }

  async function persist(nextStep: number) {
    if (!tenant?.tenantId || saving || !canManage) return false;
    if (currentStep === 1 && (!state.company.name.trim() || !state.company.segment.trim())) {
      setError("Informe o nome e o segmento da empresa para continuar.");
      return false;
    }
    if (currentStep === 2 && !state.offer.summary.trim()) {
      setError("Resuma os produtos ou servicos que sua empresa vende.");
      return false;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const nextState = { ...state, currentStep: nextStep };
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", currentStep: nextStep, data: nextState }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.product) throw new Error(payload.error || "Nao foi possivel salvar esta etapa.");
      setState(payload.product.state);
      setSnapshot(payload.product);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Nao foi possivel salvar esta etapa.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function prepareOperation() {
    if (!tenant?.tenantId || preparing || !canManage) return;
    setPreparing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/onboarding/blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: blueprint ? "apply" : "preview", data: state }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.blueprint) throw new Error(payload.error || "Falha ao preparar a operacao.");
      setBlueprint(payload.blueprint);
      if (!blueprint) {
        setNotice("Blueprint gerado. Revise abaixo antes de aplicar.");
      } else {
        const refreshed = await authedFetch(`/api/tenant/${tenant.tenantId}/onboarding`);
        const refreshedPayload = await refreshed.json() as ApiPayload;
        if (refreshed.ok && refreshedPayload.product) {
          setSnapshot(refreshedPayload.product);
          setState(refreshedPayload.product.state);
        }
        setPreparation({ pipelineApplied: true, automationsCreated: payload.blueprint.automations.length, knowledgeDocsCreated: 3, organizationalMemoryReady: true, suggestedTags: payload.blueprint.suggestedTags, leadFields: payload.blueprint.qualificationFields.map((item) => item.id) });
        setNotice("Blueprint aprovado e operacao comercial preparada.");
      }
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "Falha ao preparar a operacao.");
    } finally {
      setPreparing(false);
    }
  }

  async function interpretOperation() {
    if (!tenant?.tenantId || interpreting || !canManage) return;
    const brief = state.sales.operationNarrative.trim();
    if (brief.length < 30) {
      setError("Conte com um pouco mais de detalhe como a empresa atrai, atende e fecha uma venda.");
      return;
    }
    setInterpreting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/onboarding/blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "interpret", brief, current: state }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.interpreted) throw new Error(payload.error || "A IA não conseguiu interpretar a operação.");
      setState((current) => ({
        ...current,
        company: { ...current.company, ...(payload.interpreted?.company || {}) },
        offer: { ...current.offer, ...(payload.interpreted?.offer || {}) },
        sales: { ...current.sales, ...(payload.interpreted?.sales || {}), operationNarrative: brief },
      }));
      const missing = payload.interpreted.missingInformation || [];
      setNotice(payload.warning || (missing.length ? `A IA estruturou a operação. Revise os campos; ainda faltam: ${missing.slice(0, 3).join(", ")}.` : "A IA estruturou a empresa. Revise e avance para gerar o Blueprint."));
    } catch (interpretError) {
      setError(interpretError instanceof Error ? interpretError.message : "A IA não conseguiu interpretar a operação.");
    } finally {
      setInterpreting(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 pb-10">
      <section className="overflow-hidden rounded-[30px] border border-[var(--cliente-border)] bg-[linear-gradient(135deg,#eef4ff_0%,#ffffff_48%,#f3edff_100%)] p-6 shadow-[0_24px_70px_-50px_rgba(37,62,140,0.55)] md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              <Rocket className="h-3.5 w-3.5" /> Implantacao guiada
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">Vamos preparar sua operacao comercial.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Conte como sua empresa vende. A Altum organiza a base inicial e deixa o trabalho diario pronto para sua equipe.</p>
          </div>
          <div className="min-w-[210px] rounded-2xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>Progresso</span><span>{progress}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="mt-3 text-xs text-slate-500">Etapa {currentStep} de 6</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-2 xl:sticky xl:top-24 xl:self-start">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const active = step.id === currentStep;
            const done = snapshot?.status === "ready" || step.id < currentStep;
            return (
              <button key={step.id} type="button" onClick={() => setState((current) => ({ ...current, currentStep: step.id }))} className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${active ? "border-indigo-200 bg-indigo-50 text-indigo-950 shadow-sm" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white"}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${done ? "bg-emerald-100 text-emerald-700" : active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
                <span><span className="block text-[11px] font-semibold uppercase tracking-[0.12em] opacity-55">Etapa {step.id}</span><span className="block text-sm font-semibold">{step.label}</span></span>
              </button>
            );
          })}
          <Link href="/cliente/painel/configuracoes" className="mt-3 flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" /> Voltar para configuracoes</Link>
        </aside>

        <PanelCard className="min-h-[560px] p-5 md:p-7">
          {error ? <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          {notice ? <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

          {currentStep === 1 ? <BusinessBrief value={state.sales.operationNarrative} onChange={(operationNarrative) => setState((current) => ({ ...current, sales: { ...current.sales, operationNarrative } }))} onInterpret={() => void interpretOperation()} interpreting={interpreting} disabled={!canManage} /> : null}

          {currentStep === 1 ? <CompanyStep state={state} update={updateCompany} /> : null}
          {currentStep === 2 ? <OfferStep state={state} setState={setState} /> : null}
          {currentStep === 3 ? <ChannelsStep snapshot={snapshot} connected={connectedChannels.length} /> : null}
          {currentStep === 4 ? <SalesStep state={state} setState={setState} /> : null}
          {currentStep === 5 ? <ImportStep snapshot={snapshot} /> : null}
          {currentStep === 6 && blueprint && snapshot?.status !== "ready" ? <BlueprintPreview blueprint={blueprint} /> : null}
          {currentStep === 6 ? <PrepareStep state={state} snapshot={snapshot} preparation={preparation} blueprint={blueprint} preparing={preparing} onPrepare={() => void prepareOperation()} /> : null}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <button type="button" onClick={() => setState((current) => ({ ...current, currentStep: Math.max(1, currentStep - 1) }))} disabled={currentStep === 1 || saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Voltar</button>
            {currentStep < 6 ? <button type="button" onClick={() => void persist(currentStep + 1)} disabled={saving || !canManage} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar e continuar <ArrowRight className="h-4 w-4" /></button> : snapshot?.status === "ready" ? <Link href="/cliente/painel" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">Entrar na operacao <ArrowRight className="h-4 w-4" /></Link> : <Link href="/cliente/painel/go-live" className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700">Ver o que falta <ArrowRight className="h-4 w-4" /></Link>}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

function BusinessBrief({ value, onChange, onInterpret, interpreting, disabled }: { value: string; onChange: (value: string) => void; onInterpret: () => void; interpreting: boolean; disabled: boolean }) {
  return <div className="mb-7 rounded-3xl border border-violet-200 bg-[linear-gradient(135deg,#f5f3ff,#ffffff)] p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white"><Bot className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-violet-950">Prefere contar tudo de uma vez?</p><p className="mt-1 text-xs leading-5 text-violet-700">Explique com suas palavras o que vende, como os clientes chegam, o que perguntam, como compram e o que acontece depois. A IA preenche a estrutura para você revisar.</p></div></div><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={6} placeholder="Ex.: Somos uma barbearia em Curitiba. Os clientes chegam pelo Instagram e WhatsApp, perguntam preço e horário..." className={`${inputClass} mt-4`} /><button type="button" onClick={onInterpret} disabled={disabled || interpreting || value.trim().length < 30} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50">{interpreting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{interpreting ? "Entendendo sua empresa..." : "Deixar a IA estruturar"}</button></div>;
}

function StepTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-slate-950">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p></div>;
}

function CompanyStep({ state, update }: { state: OnboardingState; update: (patch: Partial<OnboardingState["company"]>) => void }) {
  return <><StepTitle eyebrow="Sobre sua empresa" title="Primeiro, queremos entender seu negocio." description="Essas informacoes formam uma memoria unica usada pelo CRM, relatorios e atendimento da Altum." /><div className="grid gap-4 md:grid-cols-2"><Field label="Nome da empresa" value={state.company.name} onChange={(name) => update({ name })} placeholder="Ex.: Loja Horizonte" /><Field label="Segmento" value={state.company.segment} onChange={(segment) => update({ segment })} placeholder="Ex.: moda feminina" /><Field label="Cidade ou regiao atendida" value={state.company.location} onChange={(location) => update({ location })} placeholder="Ex.: Curitiba e todo o Brasil" /><Field label="Publico principal" value={state.company.audience} onChange={(audience) => update({ audience })} placeholder="Ex.: mulheres de 25 a 45 anos" /><Field label="Site" value={state.company.website} onChange={(website) => update({ website })} placeholder="https://suaempresa.com.br" /><Field label="Instagram" value={state.company.instagram} onChange={(instagram) => update({ instagram })} placeholder="@suaempresa" /><Field label="Horario de atendimento" value={state.company.businessHours} onChange={(businessHours) => update({ businessHours })} placeholder="Ex.: seg. a sex., 9h as 18h" /><Field label="Tom de voz desejado" value={state.company.toneOfVoice} onChange={(toneOfVoice) => update({ toneOfVoice })} placeholder="Ex.: acolhedor, direto e elegante" /><label className="md:col-span-2"><Label>Como voce descreveria a empresa?</Label><textarea value={state.company.description} onChange={(event) => update({ description: event.target.value })} rows={4} placeholder="O que torna sua empresa diferente, quem atende e qual problema resolve?" className={inputClass} /></label><label className="md:col-span-2"><Label>Modelo comercial mais proximo</Label><select value={state.company.businessProfileId} onChange={(event) => update({ businessProfileId: event.target.value as BusinessProfileId })} className={inputClass}>{Object.values(BUSINESS_PROFILES).map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label></div></>;
}

function OfferStep({ state, setState }: { state: OnboardingState; setState: Dispatch<SetStateAction<OnboardingState>> }) {
  const choices = [{ id: "products", label: "Produtos", icon: Package }, { id: "services", label: "Servicos", icon: Store }, { id: "both", label: "Produtos e servicos", icon: ShoppingBag }] as const;
  const update = (patch: Partial<OnboardingState["offer"]>) => setState((current) => ({ ...current, offer: { ...current.offer, ...patch } }));
  return <><StepTitle eyebrow="O que sua empresa vende" title="Como a receita acontece hoje?" description="A Altum adapta catalogo, abordagem e oportunidades ao tipo de oferta da empresa." /><div className="grid gap-3 md:grid-cols-3">{choices.map((choice) => { const Icon = choice.icon; const active = state.offer.offeringType === choice.id; return <button key={choice.id} type="button" onClick={() => update({ offeringType: choice.id })} className={`rounded-2xl border p-4 text-left transition ${active ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><Icon className={`h-5 w-5 ${active ? "text-indigo-600" : "text-slate-500"}`} /><p className="mt-4 text-sm font-semibold text-slate-900">{choice.label}</p></button>; })}</div><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="md:col-span-2"><Label>Resuma suas principais ofertas</Label><textarea value={state.offer.summary} onChange={(event) => update({ summary: event.target.value })} rows={5} placeholder="Ex.: vestidos e acessorios com entrega nacional; consultoria de imagem; ticket entre R$ 200 e R$ 800..." className={inputClass} /></label><Field label="Formas de pagamento" value={state.offer.paymentMethods} onChange={(paymentMethods) => update({ paymentMethods })} placeholder="Ex.: PIX, cartao em ate 6x" /><Field label="Entrega ou prazo de execucao" value={state.offer.deliveryPolicy} onChange={(deliveryPolicy) => update({ deliveryPolicy })} placeholder="Ex.: envio em 2 dias uteis" /><Field label="Trocas e cancelamentos" value={state.offer.exchangePolicy} onChange={(exchangePolicy) => update({ exchangePolicy })} placeholder="Ex.: troca em ate 7 dias" /><Field label="Garantias" value={state.offer.warrantyPolicy} onChange={(warrantyPolicy) => update({ warrantyPolicy })} placeholder="Ex.: garantia de 90 dias" /></div></>;
}

function ChannelsStep({ snapshot, connected }: { snapshot: ProductSnapshot | null; connected: number }) {
  const cards = [
    { label: "WhatsApp", description: "Atendimento, IA e disparos", icon: MessageCircle, href: "/cliente/painel/configuracoes/canais", enabled: snapshot?.modules.whatsapp !== false, connected: snapshot?.channels.some((item) => item.type === "whatsapp" && ["ready", "connected"].includes(item.connectionStatus)) },
    { label: "Instagram", description: "DMs e contexto social", icon: Instagram, href: "/cliente/painel/configuracoes/canais", enabled: snapshot?.modules.instagram !== false, connected: snapshot?.channels.some((item) => item.type === "instagram" && ["ready", "connected"].includes(item.connectionStatus)) },
    { label: "Loja virtual", description: "Produtos, pedidos e rastreio", icon: Store, href: "/cliente/painel/configuracoes/integracoes", enabled: snapshot?.modules.commerce !== false, connected: snapshot?.commerceConnections.some((item) => item.status === "active" || item.connectionStatus === "connected") },
  ];
  return <><StepTitle eyebrow="Conecte seus canais" title="Traga as conversas para um lugar só." description="Você pode continuar agora e conectar outros canais depois. A Altum respeita os módulos contratados pela empresa." /><div className="mb-5 flex items-center gap-2"><StateBadge label={`${connected} conectado(s)`} tone={connected ? "success" : "warning"} /></div><div className="space-y-3">{cards.filter((card) => card.enabled).map((card) => { const Icon = card.icon; return <div key={card.label} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-slate-900">{card.label}</p><p className="mt-1 text-xs text-slate-500">{card.description}</p></div></div><Link href={card.href} className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${card.connected ? "bg-emerald-50 text-emerald-700" : "bg-indigo-600 text-white"}`}>{card.connected ? "Conectado" : "Conectar"}</Link></div>; })}</div></>;
}

function SalesStep({ state, setState }: { state: OnboardingState; setState: Dispatch<SetStateAction<OnboardingState>> }) {
  const update = (patch: Partial<OnboardingState["sales"]>) => setState((current) => ({ ...current, sales: { ...current.sales, ...patch } }));
  return <><StepTitle eyebrow="Como sua empresa vende" title="Ensine o caminho comercial para a Altum." description="Nao precisa ser perfeito. A operacao inicial podera ser ajustada conforme os resultados reais aparecerem." /><div className="grid gap-4 md:grid-cols-2"><label className="md:col-span-2"><Label>Como o cliente normalmente conclui a compra?</Label><select value={state.sales.salesMotion} onChange={(event) => update({ salesMotion: event.target.value as SalesMotion })} className={inputClass}><option value="assisted_purchase">Escolhe com ajuda e compra na conversa</option><option value="direct_checkout">Recebe o produto ou link e paga</option><option value="appointment">Escolhe um horario e agenda</option><option value="store_visit">Marca uma visita presencial</option><option value="consultative">Recebe proposta ou passa por venda consultiva</option><option value="digital_delivery">Paga e recebe acesso ao produto digital</option></select><span className="mt-1.5 block text-xs leading-5 text-slate-500">Isso define a chamada para acao da IA. Uma barbearia oferece horarios; uma loja envia a opcao de compra; uma consultoria avanca para proposta.</span></label><Field label="Ciclo de venda" value={state.sales.salesCycle} onChange={(salesCycle) => update({ salesCycle })} placeholder="Ex.: no mesmo dia, 15 dias..." /><Field label="Ticket medio" value={state.sales.averageTicket} onChange={(averageTicket) => update({ averageTicket })} placeholder="Ex.: R$ 1.500" /><Field label="Principais origens de lead" value={joined(state.sales.leadSources)} onChange={(value) => update({ leadSources: splitLines(value) })} placeholder="Instagram&#10;Indicacao&#10;Google" multiline /><Field label="Objetivos comerciais" value={joined(state.sales.goals)} onChange={(value) => update({ goals: splitLines(value) })} placeholder="Responder mais rapido&#10;Agendar mais reunioes" multiline /><label className="md:col-span-2"><Label>Papel da IA no atendimento</Label><select value={state.sales.serviceStyle} onChange={(event) => update({ serviceStyle: event.target.value as OnboardingState["sales"]["serviceStyle"] })} className={inputClass}><option value="human">Equipe atende; IA apenas apoia</option><option value="ai_assisted">IA responde e chama a equipe quando necessario</option><option value="ai_first">IA conduz a maior parte do atendimento</option></select></label><Field label="Conte com suas palavras como a venda funciona" value={state.sales.operationNarrative} onChange={(operationNarrative) => update({ operationNarrative })} placeholder="Ex.: o cliente chega pelo Instagram, pergunta preço e disponibilidade, escolhe o serviço, recebe dois horários e confirma por PIX. Depois de 20 dias costumamos oferecer retorno..." multiline full /><Field label="Perguntas e respostas frequentes" value={joined(state.sales.commonQuestions)} onChange={(value) => update({ commonQuestions: splitLines(value) })} placeholder="Qual o prazo? | De 3 a 5 dias uteis&#10;Aceita PIX? | Sim, com 5% de desconto" multiline full /><Field label="Regras especiais" value={joined(state.sales.specialRules)} onChange={(value) => update({ specialRules: splitLines(value) })} placeholder="Nunca prometer estoque sem consultar&#10;Desconto acima de 10% precisa de aprovacao" multiline full /></div></>;
}

function ImportStep({ snapshot }: { snapshot: ProductSnapshot | null }) {
  const cards = [
    { label: "Planilha de contatos", description: "Leads e clientes atuais", icon: FileSpreadsheet, href: "/cliente/painel/crm", badge: "Importar contatos", enabled: snapshot?.modules.crm !== false },
    { label: "Catalogo", description: `${snapshot?.imports.catalogItems || 0} item(ns) cadastrado(s)`, icon: Package, href: "/cliente/painel/produtos-servicos/importar", badge: "Importar catalogo", enabled: snapshot?.modules.commerce !== false },
    { label: "Site e documentos", description: `${snapshot?.imports.knowledgeDocs || 0} documento(s) na base`, icon: Globe2, href: "/cliente/painel/conhecimento", badge: "Ensinar a Altum", enabled: snapshot?.modules.ai !== false },
    { label: "Ecommerce", description: "Produtos, pedidos e rastreio", icon: Store, href: "/cliente/painel/configuracoes/integracoes", badge: "Conectar loja", enabled: snapshot?.modules.commerce !== false },
  ];
  return <><StepTitle eyebrow="Importe seus dados" title="Aproveite o que sua empresa já possui." description="Não obrigamos você a refazer cadastros. Importe o essencial agora ou retorne a esta etapa depois." /><div className="grid gap-3 md:grid-cols-2">{cards.filter((card) => card.enabled).map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><Icon className="h-5 w-5 text-indigo-600" /><p className="mt-4 text-sm font-semibold text-slate-900">{card.label}</p><p className="mt-1 text-xs text-slate-500">{card.description}</p><p className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">{card.badge}<ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></p></Link>; })}</div></>;
}

function PrepareStep({ state, snapshot, preparation, preparing, onPrepare }: { state: OnboardingState; snapshot: ProductSnapshot | null; preparation?: ApiPayload["preparation"]; blueprint: BusinessBlueprint | null; preparing: boolean; onPrepare: () => void }) {
  const ready = snapshot?.status === "ready";
  return <><StepTitle eyebrow="Altum prepara sua operacao" title={ready ? "Sua base comercial está pronta." : "Agora vamos transformar respostas em uma operação."} description="A preparação usa o perfil da empresa sem apagar pipelines, automações ou conteúdos que já existam." />{ready ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6"><CheckCircle2 className="h-9 w-9 text-emerald-600" /><h3 className="mt-4 text-xl font-semibold text-emerald-950">Preparação concluída</h3><p className="mt-2 text-sm leading-6 text-emerald-800">A Altum aplicou a estrutura inicial e manteve todas as configurações maduras da conta.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Result label="Memoria da empresa" value={preparation?.organizationalMemoryReady === false ? "Revisar" : "Pronta para CRM e IA"} /><Result label="Pipeline comercial" value={preparation?.pipelineApplied === false ? "Preservado" : "Preparado"} /><Result label="Automacoes iniciais" value={`${preparation?.automationsCreated ?? 0} criada(s)`} /><Result label="Base de conhecimento" value={`${preparation?.knowledgeDocsCreated ?? snapshot.imports.knowledgeDocs} documento(s)`} /><Result label="Perfil de atendimento" value={BUSINESS_PROFILES[state.company.businessProfileId].label} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/cliente/painel/inbox" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"><MessageCircle className="h-4 w-4" />Abrir Conversas</Link><Link href="/cliente/painel/crm" className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"><Target className="h-4 w-4" />Abrir Clientes e oportunidades</Link></div></div> : <div className="rounded-3xl border border-indigo-200 bg-indigo-50/70 p-6"><Bot className="h-8 w-8 text-indigo-600" /><h3 className="mt-4 text-lg font-semibold text-indigo-950">O que será preparado</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{["Memoria unica da empresa", "Pipeline comercial inicial", "Tags e campos sugeridos", "Perguntas e respostas", "Perfil de atendimento da IA", "Automacoes comerciais"].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-700"><Check className="h-4 w-4 text-indigo-600" />{item}</div>)}</div><button type="button" onClick={onPrepare} disabled={preparing} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60">{preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{preparing ? "Preparando sua operacao..." : "Preparar minha operacao"}</button></div>}</>;
}

function BlueprintPreview({ blueprint }: { blueprint: BusinessBlueprint }) {
  return <div className="mb-5 rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Blueprint pronto para revisão</p><h3 className="mt-2 text-xl font-semibold text-slate-950">{blueprint.title}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{blueprint.summary}</p></div><StateBadge label={blueprint.salesMotionLabel} tone="ai" /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Result label="Funil" value={`${blueprint.pipeline.length} etapas`} /><Result label="Retomada inicial" value={`${blueprint.cadence.firstFollowUpHours} horas`} /><Result label="Automacoes" value={`${blueprint.automations.length} fluxos`} /></div><div className="mt-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Etapas que serão criadas</p><div className="mt-3 flex flex-wrap gap-2">{blueprint.pipeline.map((stage) => <span key={stage.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{stage.label}</span>)}</div></div><div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-2xl bg-indigo-50 p-4"><p className="text-xs font-semibold text-indigo-700">Como a venda termina</p><p className="mt-2 text-sm font-semibold text-indigo-950">{blueprint.closing.primaryAction}</p><p className="mt-1 text-xs leading-5 text-indigo-800">{blueprint.closing.objective}</p></div><div className="rounded-2xl bg-violet-50 p-4"><p className="text-xs font-semibold text-violet-700">Comportamento da IA</p><p className="mt-2 text-sm font-semibold text-violet-950">{blueprint.aiPolicy.autonomy === "autonomous" ? "IA conduz com autonomia" : blueprint.aiPolicy.autonomy === "copilot" ? "IA apoia a equipe" : "IA conduz e escala quando necessário"}</p><p className="mt-1 text-xs leading-5 text-violet-800">{blueprint.aiPolicy.guardrails.length} regras de segurança e {blueprint.aiPolicy.handoffWhen.length} critérios de handoff.</p></div></div><p className="mt-4 text-xs leading-5 text-slate-500">Ao aprovar, a Altum atualiza apenas estruturas gerenciadas pelo Blueprint. Pipelines manuais existentes são preservados.</p></div>;
}

function Result({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-emerald-200 bg-white px-3 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-600">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p></div>; }
const inputClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
function Label({ children }: { children: ReactNode }) { return <span className="text-xs font-semibold text-slate-600">{children}</span>; }
function Field({ label, value, onChange, placeholder, multiline, full }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; full?: boolean }) { return <label className={full ? "md:col-span-2" : ""}><Label>{label}</Label>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder={placeholder} className={inputClass} /> : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputClass} />}</label>; }
