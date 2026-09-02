"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { PlatformPlan } from "@/lib/platform-plans";

type BillingOverview = {
  summary?: {
    totalContracts?: number;
    activeContracts?: number;
    blockedContracts?: number;
    openFinanceCount?: number;
    overdueFinanceCount?: number;
    monthlyPlatformValue?: number;
    overdueAmount?: number;
    stripeReady?: boolean;
  };
  actionItems?: Array<{
    clientId: string;
    clientName: string;
    tenantId?: string | null;
    platformPlan?: string | null;
    accessStatus?: string;
    monthlyValue?: number;
    dueDate?: string | null;
    reasons?: string[];
    severity?: number;
  }>;
  customers?: Array<{
    clientId: string;
    clientName: string;
    tenantId?: string | null;
    responsibleEmail?: string | null;
    signupSource?: string;
    platformPlan?: string | null;
    billingProvider?: string;
    billingStatus?: string;
    accessStatus?: string;
    monthlyValue?: number;
    trialEndsAt?: string | null;
    nextDueDate?: string | null;
    financeStatus?: string | null;
    asaasSubscriptionId?: string | null;
  }>;
  error?: string;
};

type IntegrationOverview = {
  summary?: { total?: number; healthy?: number; missing?: number };
  integrations?: Array<{
    key: string;
    label: string;
    status: "ok" | "missing";
    details: string;
  }>;
  error?: string;
};

function money(value?: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function accessLabel(status?: string) {
  if (status === "trial") return "Teste gratuito";
  if (status === "blocked") return "Bloqueado";
  if (status === "pending") return "Pagamento pendente";
  return "Ativo";
}

function accessTone(status?: string) {
  if (status === "blocked") return "bg-red-100 text-red-700";
  if (status === "trial") return "bg-blue-100 text-blue-700";
  if (status === "pending") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

export default function AdminSaasPage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationOverview | null>(null);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<"all" | "trial" | "active" | "attention">("all");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, plansResponse, integrationsResponse] = await Promise.all([
        authedFetch("/api/admin/billing/overview"),
        authedFetch("/api/admin/billing/plans"),
        authedFetch("/api/admin/integrations/status"),
      ]);
      const payload = (await response.json().catch(() => ({}))) as BillingOverview;
      const plansPayload = (await plansResponse.json().catch(() => ({}))) as { plans?: PlatformPlan[] };
      const integrationsPayload = (await integrationsResponse.json().catch(() => ({}))) as IntegrationOverview;
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar a operacao SaaS.");
      setOverview(payload);
      if (plansResponse.ok) setPlans(plansPayload.plans || []);
      if (integrationsResponse.ok) setIntegrations(integrationsPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a operacao SaaS.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function savePlan(plan: PlatformPlan) {
    setSavingPlan(plan.id);
    setError(null);
    try {
      const response = await authedFetch("/api/admin/billing/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, monthlyPrice: plan.monthlyPrice, active: plan.active, checkoutEnabled: plan.checkoutEnabled }),
      });
      const payload = (await response.json().catch(() => ({}))) as { plans?: PlatformPlan[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao salvar plano.");
      setPlans(payload.plans || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar plano.");
    } finally {
      setSavingPlan(null);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const summary = overview?.summary || {};
  const actionItems = overview?.actionItems || [];
  const integrationItems = integrations?.integrations || [];
  const missingIntegrations = integrationItems.filter((item) => item.status === "missing");
  const customers = useMemo(() => overview?.customers || [], [overview?.customers]);
  const visibleCustomers = useMemo(() => customers.filter((customer) => {
    const term = customerSearch.trim().toLowerCase();
    const matchesTerm = !term || [customer.clientName, customer.responsibleEmail, customer.platformPlan]
      .some((value) => String(value || "").toLowerCase().includes(term));
    const matchesFilter = customerFilter === "all"
      || (customerFilter === "trial" && customer.accessStatus === "trial")
      || (customerFilter === "active" && customer.accessStatus === "active")
      || (customerFilter === "attention" && ["blocked", "pending"].includes(customer.accessStatus || ""));
    return matchesTerm && matchesFilter;
  }), [customerFilter, customerSearch, customers]);

  return (
    <main className="mx-auto max-w-[1480px] space-y-6 pb-12 text-slate-950">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 bg-[linear-gradient(135deg,#0f172a,#172554_58%,#1d4ed8)] px-6 py-7 text-white md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">Altum · administracao</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Operacao SaaS</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Empresas, receita, acesso e riscos comerciais em uma unica fila de decisao.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/clientes" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-blue-50">
              <Building2 className="h-4 w-4" /> Empresas
            </Link>
            <button type="button" onClick={() => void loadOverview()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-5 w-5" /> {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Empresas ativas" value={String(summary.activeContracts || 0)} detail={`${summary.totalContracts || 0} contratos`} icon={CheckCircle2} tone="emerald" />
        <Metric label="Receita mensal" value={money(summary.monthlyPlatformValue)} detail="valor contratado" icon={CircleDollarSign} tone="blue" />
        <Metric label="Acessos bloqueados" value={String(summary.blockedContracts || 0)} detail="exigem revisao" icon={ShieldAlert} tone="red" />
        <Metric label="Cobrancas abertas" value={String(summary.openFinanceCount || 0)} detail={`${summary.overdueFinanceCount || 0} em atraso`} icon={CreditCard} tone="amber" />
        <Metric label="Valor em atraso" value={money(summary.overdueAmount)} detail={`${integrations?.summary?.healthy || 0}/${integrations?.summary?.total || 0} integrações prontas`} icon={Settings2} tone="violet" />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Clientes da plataforma</p>
            <h2 className="mt-1 text-xl font-black">Empresas, acessos e assinaturas</h2>
            <p className="mt-1 text-sm text-slate-500">Inclui cadastros públicos, trials e clientes adicionados pela equipe Altum.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Buscar empresa ou e-mail" className="w-full bg-transparent text-sm outline-none" />
            </label>
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value as typeof customerFilter)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none">
              <option value="all">Todos</option>
              <option value="trial">Em teste</option>
              <option value="active">Ativos</option>
              <option value="attention">Exigem atenção</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              <tr><th className="px-5 py-3">Empresa</th><th className="px-4 py-3">Acesso</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Cobrança</th><th className="px-4 py-3">Próxima data</th><th className="px-5 py-3 text-right">Gestão</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={6} className="px-5 py-6"><LoadingRow /></td></tr> : null}
              {!loading && visibleCustomers.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-sm font-semibold text-slate-500">Nenhuma empresa encontrada com este filtro.</td></tr> : null}
              {visibleCustomers.map((customer) => (
                <tr key={customer.clientId} className="transition hover:bg-blue-50/30">
                  <td className="px-5 py-4"><p className="font-black text-slate-950">{customer.clientName}</p><p className="mt-1 text-xs text-slate-500">{customer.responsibleEmail || "Sem e-mail"}{customer.signupSource === "self_service" ? " · cadastro público" : ""}</p></td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${accessTone(customer.accessStatus)}`}>{accessLabel(customer.accessStatus)}</span>{customer.accessStatus === "trial" ? <p className="mt-1.5 text-[11px] text-slate-500">até {dateLabel(customer.trialEndsAt)}</p> : null}</td>
                  <td className="px-4 py-4"><p className="font-bold capitalize text-slate-800">{customer.accessStatus === "trial" ? "Teste completo" : customer.platformPlan || "Personalizado"}</p><p className="mt-1 text-xs text-slate-500">{customer.accessStatus === "trial" ? `plano futuro: ${customer.platformPlan || "a definir"}` : `${money(customer.monthlyValue)}/mês`}</p></td>
                  <td className="px-4 py-4"><p className="font-bold capitalize text-slate-800">{customer.billingProvider || "manual"}</p><p className="mt-1 text-xs text-slate-500">{customer.asaasSubscriptionId ? "Assinatura vinculada" : customer.billingStatus === "trial" ? "Ainda sem cobrança" : customer.billingStatus || "Sem status"}</p></td>
                  <td className="px-4 py-4 font-semibold text-slate-700">{dateLabel(customer.nextDueDate || customer.trialEndsAt)}</td>
                  <td className="px-5 py-4 text-right"><Link href={`/admin/clientes/${encodeURIComponent(customer.clientId)}/portal`} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Gerenciar <ArrowRight className="h-3.5 w-3.5" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Fila do dono</p>
              <h2 className="mt-1 text-xl font-black">Empresas que precisam de atencao</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{actionItems.length} pendencias</span>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? <LoadingRow /> : null}
            {!loading && actionItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">
                Nenhuma pendencia comercial ou de acesso encontrada.
              </div>
            ) : null}
            {actionItems.map((item) => (
              <article key={`${item.clientId}-${item.tenantId || "tenant"}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-black text-slate-950">{item.clientName}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.accessStatus === "blocked" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {item.accessStatus === "blocked" ? "bloqueado" : "atencao"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.platformPlan || "Plano personalizado"} · {money(item.monthlyValue)}/mes</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(item.reasons || []).map((reason) => <span key={reason} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{reason}</span>)}
                    </div>
                  </div>
                  <Link href={`/admin/clientes/${item.clientId}/portal`} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700">
                    Abrir empresa <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Acesso rapido</p>
          <h2 className="mt-1 text-xl font-black">Administrar a plataforma</h2>
          <div className="mt-5 space-y-2">
            <QuickLink href="/admin/clientes" icon={Building2} title="Empresas e contratos" detail="modulos, limites, canais e usuarios" />
            <QuickLink href="/admin/financeiro" icon={CreditCard} title="Cobranca" detail="vencimentos, status e recebimentos" />
            <QuickLink href="/admin/ia" icon={Bot} title="IA da plataforma" detail="uso, custo, sinais e falhas" />
            <QuickLink href="/admin/equipe" icon={Users} title="Equipe Altum" detail="papeis e acessos internos" />
          </div>
        </aside>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Saude operacional</p>
              <h2 className="mt-1 text-xl font-black">Integracoes da plataforma</h2>
              <p className="mt-1 text-sm text-slate-500">Mostra apenas o estado operacional, sem expor credenciais.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${missingIntegrations.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
              {loading ? "Verificando" : missingIntegrations.length ? `${missingIntegrations.length} pendencias` : "Tudo pronto"}
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {loading ? <LoadingRow /> : null}
            {!loading && integrationItems.map((item) => (
              <article key={item.key} className={`rounded-2xl border p-4 ${item.status === "ok" ? "border-emerald-100 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60"}`}>
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.status === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {item.status === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0"><span className="block text-sm font-black text-slate-900">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{item.status === "ok" ? "Configurado para operar." : "Configuracao necessaria antes de liberar este recurso."}</span></span>
                </div>
              </article>
            ))}
            {!loading && integrationItems.length === 0 ? <p className="text-sm text-slate-500">Nao foi possivel carregar a saude das integracoes.</p> : null}
          </div>
        </div>
        <aside className="rounded-[24px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm md:p-6">
          <PlugZap className="h-5 w-5 text-blue-300" />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-blue-200">Proxima acao</p>
          <h2 className="mt-1 text-xl font-black">Libere a operacao por empresa.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">Cadastre a empresa, defina modulos e limites, conecte os canais e acompanhe cobranca e acesso no mesmo lugar.</p>
          <Link href="/admin/clientes" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:bg-blue-50">
            Abrir empresas <ExternalLink className="h-4 w-4" />
          </Link>
        </aside>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Oferta self-service</p><h2 className="mt-1 text-xl font-black">Planos e valores do checkout</h2><p className="mt-1 text-sm text-slate-500">Alteracoes passam a valer para novos checkouts. Assinaturas existentes nao sao reajustadas automaticamente.</p></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black">{plan.name}</p><p className="text-xs text-slate-500">{plan.id}</p></div><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={plan.active} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, active: event.target.checked } : item))} /> Ativo</label></div><label className="mt-4 block text-xs font-bold text-slate-600">Mensalidade (R$)</label><input type="number" min="1" step="0.01" disabled={plan.monthlyPrice === null} value={plan.monthlyPrice ?? ""} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, monthlyPrice: event.target.value ? Number(event.target.value) : null } : item))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500" placeholder="Sob consulta" /><label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" disabled={plan.monthlyPrice === null} checked={plan.checkoutEnabled} onChange={(event) => setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, checkoutEnabled: event.target.checked } : item))} /> Disponivel no checkout</label><button type="button" onClick={() => void savePlan(plan)} disabled={savingPlan === plan.id} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60">{savingPlan === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />} Salvar plano</button></article>)}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Building2; tone: "blue" | "emerald" | "red" | "amber" | "violet" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span><p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

function QuickLink({ href, icon: Icon, title, detail }: { href: string; icon: typeof Building2; title: string; detail: string }) {
  return <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/50"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link>;
}

function LoadingRow() {
  return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando operacao...</div>;
}
