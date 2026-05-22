"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  WalletCards,
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
  CrmTextarea,
  CrmWorkspace,
  formatCrmDate,
  formatCrmMoney,
  toCrmDate,
} from "@/app/cliente/painel/components/crm-workspace";
import { getPipelineStageLabel } from "@/lib/pipeline";

type LeadItem = {
  id: string;
  nome?: string;
  empresa?: string;
  email?: string;
  telefone?: string;
  pipelineStage?: string;
  stage?: string;
  potentialValue?: number | null;
  owner?: string;
};

type BudgetItem = {
  id: string;
  titulo?: string;
  leadId?: string;
  leadName?: string;
  status?: string;
  valorTotal?: number;
  validade?: string;
  resumo?: string;
  updatedAt?: unknown;
};

type FinanceItem = {
  id: string;
  descricao?: string;
  tipo?: string;
  categoria?: string;
  status?: string;
  valor?: number;
  leadId?: string;
  leadName?: string;
  vencimento?: string;
  meioPagamento?: string;
  billingType?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  updatedAt?: unknown;
};

type ChargePreview = {
  chargeId?: string;
  financeId?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: string;
  pix?: { payload?: string };
};

type ActiveTab = "proposals" | "finance" | "charges" | "new";

const budgetStatuses = ["Rascunho", "Enviado", "Aprovado", "Perdido"];
const financeStatuses = ["pendente", "pago", "cancelado"];
const billingTypes = ["PIX", "BOLETO", "CREDIT_CARD"];

function nextBusinessDate(days = 3) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function budgetTone(status?: string) {
  if (status === "Aprovado") return "green" as const;
  if (status === "Perdido") return "red" as const;
  if (status === "Enviado") return "blue" as const;
  return "neutral" as const;
}

function financeTone(status?: string) {
  if (status === "pago") return "green" as const;
  if (status === "cancelado") return "red" as const;
  return "orange" as const;
}

export default function ClienteComercialPage() {
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId") || "";
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("manage_commercial");

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [finance, setFinance] = useState<FinanceItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("proposals");
  const [search, setSearch] = useState("");
  const [budgetStatus, setBudgetStatus] = useState("all");
  const [financeStatus, setFinanceStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingFinance, setSavingFinance] = useState(false);
  const [creatingCharge, setCreatingCharge] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [chargePreview, setChargePreview] = useState<ChargePreview | null>(null);

  const [budgetForm, setBudgetForm] = useState({
    leadId: leadFromQuery,
    titulo: "",
    tipo: "Projeto unico",
    status: "Rascunho",
    valorTotal: "",
    validade: nextBusinessDate(7),
    resumo: "",
  });
  const [financeForm, setFinanceForm] = useState({
    leadId: leadFromQuery,
    descricao: "",
    tipo: "Receita",
    categoria: "Receita comercial",
    status: "pendente",
    valor: "",
    vencimento: nextBusinessDate(5),
    meioPagamento: "",
  });
  const [chargeForm, setChargeForm] = useState({
    leadId: leadFromQuery,
    budgetId: "",
    description: "",
    amount: "",
    dueDate: nextBusinessDate(3),
    billingType: "PIX",
  });

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, budgetsRes, financeRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
        authedFetch(`/api/tenant/${tenant.tenantId}/budgets`),
        authedFetch(`/api/tenant/${tenant.tenantId}/finance`),
      ]);
      const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };
      const budgetsPayload = (await budgetsRes.json()) as { items?: BudgetItem[]; error?: string };
      const financePayload = (await financeRes.json()) as { items?: FinanceItem[]; error?: string };
      if (!leadsRes.ok || !budgetsRes.ok || !financeRes.ok || leadsPayload.error || budgetsPayload.error || financePayload.error) {
        throw new Error(leadsPayload.error || budgetsPayload.error || financePayload.error || "Falha ao carregar comercial.");
      }
      setLeads(leadsPayload.items || []);
      setBudgets((budgetsPayload.items || []).sort((a, b) => (toCrmDate(b.updatedAt)?.getTime() || 0) - (toCrmDate(a.updatedAt)?.getTime() || 0)));
      setFinance((financePayload.items || []).sort((a, b) => (toCrmDate(b.updatedAt)?.getTime() || 0) - (toCrmDate(a.updatedAt)?.getTime() || 0)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar comercial.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!leadFromQuery) return;
    setBudgetForm((current) => ({ ...current, leadId: leadFromQuery }));
    setFinanceForm((current) => ({ ...current, leadId: leadFromQuery }));
    setChargeForm((current) => ({ ...current, leadId: leadFromQuery }));
  }, [leadFromQuery]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === (leadFromQuery || budgetForm.leadId || financeForm.leadId || chargeForm.leadId)) || null, [budgetForm.leadId, chargeForm.leadId, financeForm.leadId, leadFromQuery, leads]);
  const approvedValue = budgets.filter((item) => item.status === "Aprovado").reduce((sum, item) => sum + (item.valorTotal || 0), 0);
  const pendingFinance = finance.filter((item) => item.status === "pendente").reduce((sum, item) => sum + (item.valor || 0), 0);
  const sentBudgets = budgets.filter((item) => item.status === "Enviado").length;

  const filteredBudgets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return budgets.filter((item) => {
      if (budgetStatus !== "all" && item.status !== budgetStatus) return false;
      if (leadFromQuery && item.leadId !== leadFromQuery) return false;
      if (!term) return true;
      return `${item.titulo || ""} ${item.leadName || ""} ${item.status || ""}`.toLowerCase().includes(term);
    });
  }, [budgetStatus, budgets, leadFromQuery, search]);

  const filteredFinance = useMemo(() => {
    const term = search.trim().toLowerCase();
    return finance.filter((item) => {
      if (financeStatus !== "all" && item.status !== financeStatus) return false;
      if (leadFromQuery && item.leadId !== leadFromQuery) return false;
      if (!term) return true;
      return `${item.descricao || ""} ${item.leadName || ""} ${item.status || ""} ${item.meioPagamento || ""}`.toLowerCase().includes(term);
    });
  }, [finance, financeStatus, leadFromQuery, search]);

  async function createBudget(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;
    setSavingBudget(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...budgetForm, valorTotal: Number(budgetForm.valorTotal || 0) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao criar proposta.");
      setBudgetForm({ leadId: leadFromQuery || "", titulo: "", tipo: "Projeto unico", status: "Rascunho", valorTotal: "", validade: nextBusinessDate(7), resumo: "" });
      setNotice("Proposta criada com sucesso.");
      await load();
      setActiveTab("proposals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar proposta.");
    } finally {
      setSavingBudget(false);
    }
  }

  async function createFinance(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;
    setSavingFinance(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/finance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...financeForm, valor: Number(financeForm.valor || 0) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao criar lancamento.");
      setFinanceForm({ leadId: leadFromQuery || "", descricao: "", tipo: "Receita", categoria: "Receita comercial", status: "pendente", valor: "", vencimento: nextBusinessDate(5), meioPagamento: "" });
      setNotice("Lancamento criado com sucesso.");
      await load();
      setActiveTab("finance");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar lancamento.");
    } finally {
      setSavingFinance(false);
    }
  }

  async function updateBudgetStatus(budgetId: string, nextStatus: string) {
    if (!tenant?.tenantId || !canOperate) return;
    setBusyId(budgetId);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/budgets/${budgetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar proposta.");
      setNotice("Proposta atualizada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar proposta.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateFinanceStatus(financeId: string, nextStatus: string) {
    if (!tenant?.tenantId || !canOperate) return;
    setBusyId(financeId);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/finance/${financeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar financeiro.");
      setNotice("Financeiro atualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar financeiro.");
    } finally {
      setBusyId(null);
    }
  }

  async function createCharge(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;
    setCreatingCharge(true);
    setError(null);
    setNotice(null);
    setChargePreview(null);
    try {
      const lead = leads.find((item) => item.id === chargeForm.leadId);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/finance/create-charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: chargeForm.leadId,
          budgetId: chargeForm.budgetId || null,
          description: chargeForm.description,
          amount: Number(chargeForm.amount || 0),
          dueDate: chargeForm.dueDate,
          billingType: chargeForm.billingType,
          customerInfo: { name: lead?.nome, email: lead?.email, phone: lead?.telefone },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as ChargePreview & { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao gerar cobranca.");
      setChargePreview(payload);
      setNotice("Cobranca criada e registrada no financeiro.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar cobranca.");
    } finally {
      setCreatingCharge(false);
    }
  }

  async function copyValue(key: string, value?: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
  }

  function prepareCharge(budget: BudgetItem) {
    setChargeForm((current) => ({
      ...current,
      leadId: budget.leadId || current.leadId,
      budgetId: budget.id,
      description: budget.titulo || current.description,
      amount: budget.valorTotal ? String(Number(budget.valorTotal)) : current.amount,
      dueDate: budget.validade || current.dueDate || nextBusinessDate(3),
    }));
    setActiveTab("charges");
  }

  return (
    <CrmWorkspace>
      <CrmHero
        active="Propostas"
        title="Propostas, valores e cobrancas dentro do fluxo comercial."
        description="A area comercial fica conectada ao cliente, sem parecer financeiro tecnico: proposta, status, valor e proxima acao."
        assistantTitle="Assistente de proposta"
        assistantSubtitle="Valor, status e cobranca"
        assistantText="A Altum ajuda o time a transformar proposta enviada em retorno, aprovacao e cobranca sem perder o cliente de vista."
        action={
          <>
            <CrmButton type="button" onClick={load}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </CrmButton>
            <CrmButton type="button" tone="primary" onClick={() => setActiveTab("new")}>
              <Plus className="h-4 w-4" />
              Nova proposta
            </CrmButton>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <CrmMetric label="Propostas" value={String(budgets.length)} detail={`${sentBudgets} enviadas`} icon={FileText} tone="blue" />
          <CrmMetric label="Aprovado" value={formatCrmMoney(approvedValue)} detail="receita aprovada" icon={CheckCircle2} tone="green" />
          <CrmMetric label="Pendente" value={formatCrmMoney(pendingFinance)} detail="financeiro aberto" icon={Receipt} tone="orange" />
          <CrmMetric label="Clientes" value={String(leads.length)} detail="base comercial" icon={WalletCards} tone="purple" />
        </div>
      </CrmHero>

      {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}
      {notice ? <CrmNotice tone="green">{notice}</CrmNotice> : null}

      {selectedLead ? (
        <CrmPanel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CrmAvatar name={selectedLead.nome} subtitle={selectedLead.empresa || selectedLead.email || selectedLead.telefone} size="lg" />
            <div className="flex flex-wrap gap-2">
              <CrmBadge tone="blue">{getPipelineStageLabel(selectedLead.pipelineStage || selectedLead.stage || "captado")}</CrmBadge>
              <CrmLinkButton href={`/cliente/painel/crm?leadId=${encodeURIComponent(selectedLead.id)}`}>
                Abrir ficha
                <ArrowRight className="h-4 w-4" />
              </CrmLinkButton>
            </div>
          </div>
        </CrmPanel>
      ) : null}

      <CrmPanel padded={false} className="overflow-hidden">
        <div className="border-b border-[var(--cliente-border)] p-5">
          <CrmSectionTitle eyebrow="Comercial" title="Mesa de propostas" description="Acompanhe propostas, recebimentos e cobrancas com o mesmo contexto do CRM." action={!canOperate ? <CrmBadge tone="orange">somente leitura</CrmBadge> : null} />
          <div className="mt-5 flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-muted)]" />
              <CrmInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar proposta, cliente, pagamento..." className="w-full pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["proposals", "finance", "charges", "new"] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full border px-3 py-2 text-xs font-black transition ${activeTab === tab ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary)] text-white" : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"}`}
                >
                  {tab === "proposals" ? "Propostas" : tab === "finance" ? "Financeiro" : tab === "charges" ? "Cobranca" : "Criar"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "proposals" ? (
          <div>
            <div className="border-b border-[var(--cliente-border)] p-4">
              <CrmSelect value={budgetStatus} onChange={(event) => setBudgetStatus(event.target.value)}>
                <option value="all">Todos status</option>
                {budgetStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </CrmSelect>
            </div>
            <div>
              <div className="hidden border-b border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-5 py-3 text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)] lg:grid lg:grid-cols-[minmax(0,1fr)_150px_160px_220px]">
                <span>Proposta</span>
                <span>Status</span>
                <span>Valor</span>
                <span>Acoes</span>
              </div>
              <div className="divide-y divide-[var(--cliente-border)]">
              {loading ? <div className="p-5"><CrmEmpty title="Carregando propostas" /></div> : null}
              {!loading && filteredBudgets.length === 0 ? <div className="p-5"><CrmEmpty title="Nenhuma proposta encontrada" /></div> : null}
              {filteredBudgets.map((budget) => (
                <article key={budget.id} className="grid gap-4 px-5 py-4 transition hover:bg-[var(--cliente-surface-muted)] lg:grid-cols-[minmax(0,1fr)_150px_160px_220px] lg:items-center">
                  <CrmAvatar name={budget.titulo || "Proposta"} subtitle={budget.leadName || "Sem cliente"} />
                  <CrmBadge tone={budgetTone(budget.status)}>{budget.status || "Rascunho"}</CrmBadge>
                  <div>
                    <p className="text-sm font-black text-[var(--cliente-card-text)]">{formatCrmMoney(budget.valorTotal)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">validade {budget.validade || "-"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <CrmSelect value={budget.status || "Rascunho"} onChange={(event) => updateBudgetStatus(budget.id, event.target.value)} disabled={!canOperate || busyId === budget.id} className="max-w-[130px]">
                      {budgetStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                    </CrmSelect>
                    <CrmButton type="button" onClick={() => prepareCharge(budget)} disabled={!canOperate}>
                      <CreditCard className="h-4 w-4" />
                      Cobrar
                    </CrmButton>
                  </div>
                </article>
              ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "finance" ? (
          <div>
            <div className="border-b border-[var(--cliente-border)] p-4">
              <CrmSelect value={financeStatus} onChange={(event) => setFinanceStatus(event.target.value)}>
                <option value="all">Todos status</option>
                {financeStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </CrmSelect>
            </div>
            <div>
              <div className="hidden border-b border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-5 py-3 text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)] lg:grid lg:grid-cols-[minmax(0,1fr)_130px_160px_180px]">
                <span>Lancamento</span>
                <span>Status</span>
                <span>Valor</span>
                <span>Acoes</span>
              </div>
              <div className="divide-y divide-[var(--cliente-border)]">
              {loading ? <div className="p-5"><CrmEmpty title="Carregando financeiro" /></div> : null}
              {!loading && filteredFinance.length === 0 ? <div className="p-5"><CrmEmpty title="Nenhum lancamento encontrado" /></div> : null}
              {filteredFinance.map((item) => (
                <article key={item.id} className="grid gap-4 px-5 py-4 transition hover:bg-[var(--cliente-surface-muted)] lg:grid-cols-[minmax(0,1fr)_130px_160px_180px] lg:items-center">
                  <CrmAvatar name={item.descricao || "Lancamento"} subtitle={item.leadName || item.categoria || "Financeiro"} />
                  <CrmBadge tone={financeTone(item.status)}>{item.status || "pendente"}</CrmBadge>
                  <div>
                    <p className="text-sm font-black text-[var(--cliente-card-text)]">{formatCrmMoney(item.valor)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.vencimento || formatCrmDate(item.updatedAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <CrmSelect value={item.status || "pendente"} onChange={(event) => updateFinanceStatus(item.id, event.target.value)} disabled={!canOperate || busyId === item.id} className="max-w-[130px]">
                      {financeStatuses.map((statusItem) => <option key={statusItem} value={statusItem}>{statusItem}</option>)}
                    </CrmSelect>
                    {item.invoiceUrl ? <Link href={item.invoiceUrl} target="_blank" className="rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)]">Link</Link> : null}
                  </div>
                </article>
              ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "charges" ? (
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <form onSubmit={createCharge} className="space-y-3">
              <CrmSectionTitle title="Gerar cobranca" description="Crie uma cobranca a partir de uma proposta ou direto para um cliente." />
              <LeadSelect leads={leads} value={chargeForm.leadId} onChange={(leadId) => setChargeForm((current) => ({ ...current, leadId }))} disabled={!canOperate} />
              <CrmSelect value={chargeForm.budgetId} onChange={(event) => {
                const budget = budgets.find((item) => item.id === event.target.value);
                setChargeForm((current) => ({
                  ...current,
                  budgetId: event.target.value,
                  description: budget?.titulo || current.description,
                  amount: budget?.valorTotal ? String(Number(budget.valorTotal)) : current.amount,
                }));
              }} disabled={!canOperate || !chargeForm.leadId} className="w-full">
                <option value="">Sem proposta vinculada</option>
                {budgets.filter((item) => !chargeForm.leadId || item.leadId === chargeForm.leadId).map((item) => <option key={item.id} value={item.id}>{item.titulo || "Proposta"} - {formatCrmMoney(item.valorTotal)}</option>)}
              </CrmSelect>
              <CrmInput value={chargeForm.description} onChange={(event) => setChargeForm((current) => ({ ...current, description: event.target.value }))} disabled={!canOperate} placeholder="Descricao da cobranca" className="w-full" />
              <div className="grid gap-3 md:grid-cols-3">
                <CrmInput type="number" value={chargeForm.amount} onChange={(event) => setChargeForm((current) => ({ ...current, amount: event.target.value }))} disabled={!canOperate} placeholder="Valor" />
                <CrmInput type="date" value={chargeForm.dueDate} onChange={(event) => setChargeForm((current) => ({ ...current, dueDate: event.target.value }))} disabled={!canOperate} />
                <CrmSelect value={chargeForm.billingType} onChange={(event) => setChargeForm((current) => ({ ...current, billingType: event.target.value }))} disabled={!canOperate}>
                  {billingTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                </CrmSelect>
              </div>
              <CrmButton type="submit" tone="primary" disabled={!canOperate || creatingCharge || !chargeForm.leadId || !chargeForm.amount} className="w-full">
                {creatingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Gerar cobranca
              </CrmButton>
            </form>

            <CrmPanel className="xl:sticky xl:top-[132px] xl:self-start">
              <CrmSectionTitle title="Retorno da cobranca" description="Links e dados retornados aparecem aqui." />
              {chargePreview ? (
                <div className="mt-4 space-y-3">
                  {chargePreview.invoiceUrl ? <CopyRow label="Link de pagamento" value={chargePreview.invoiceUrl} copied={copied === "invoice"} onCopy={() => copyValue("invoice", chargePreview.invoiceUrl)} /> : null}
                  {chargePreview.bankSlipUrl ? <CopyRow label="Boleto" value={chargePreview.bankSlipUrl} copied={copied === "bankSlip"} onCopy={() => copyValue("bankSlip", chargePreview.bankSlipUrl)} /> : null}
                  {chargePreview.pix?.payload ? <CopyRow label="Pix copia e cola" value={chargePreview.pix.payload} copied={copied === "pix"} onCopy={() => copyValue("pix", chargePreview.pix?.payload)} /> : null}
                </div>
              ) : (
                <div className="mt-4"><CrmEmpty title="Nenhuma cobranca gerada nesta sessao" /></div>
              )}
            </CrmPanel>
          </div>
        ) : null}

        {activeTab === "new" ? (
          <div className="grid gap-5 p-5 xl:grid-cols-2">
            <form onSubmit={createBudget} className="space-y-3">
              <CrmSectionTitle title="Nova proposta" description="Registre uma proposta comercial para acompanhar ate fechamento." />
              <LeadSelect leads={leads} value={budgetForm.leadId} onChange={(leadId) => setBudgetForm((current) => ({ ...current, leadId }))} disabled={!canOperate} />
              <CrmInput value={budgetForm.titulo} onChange={(event) => setBudgetForm((current) => ({ ...current, titulo: event.target.value }))} disabled={!canOperate} placeholder="Titulo da proposta" className="w-full" />
              <div className="grid gap-3 md:grid-cols-3">
                <CrmInput type="number" value={budgetForm.valorTotal} onChange={(event) => setBudgetForm((current) => ({ ...current, valorTotal: event.target.value }))} disabled={!canOperate} placeholder="Valor" />
                <CrmInput type="date" value={budgetForm.validade} onChange={(event) => setBudgetForm((current) => ({ ...current, validade: event.target.value }))} disabled={!canOperate} />
                <CrmSelect value={budgetForm.status} onChange={(event) => setBudgetForm((current) => ({ ...current, status: event.target.value }))} disabled={!canOperate}>
                  {budgetStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </CrmSelect>
              </div>
              <CrmTextarea value={budgetForm.resumo} onChange={(event) => setBudgetForm((current) => ({ ...current, resumo: event.target.value }))} disabled={!canOperate} placeholder="Resumo comercial" rows={4} className="w-full" />
              <CrmButton type="submit" tone="primary" disabled={!canOperate || savingBudget || !budgetForm.titulo.trim()} className="w-full">
                {savingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar proposta
              </CrmButton>
            </form>

            <form onSubmit={createFinance} className="space-y-3">
              <CrmSectionTitle title="Novo lancamento" description="Registre receita ou pendencia financeira ligada ao cliente." />
              <LeadSelect leads={leads} value={financeForm.leadId} onChange={(leadId) => setFinanceForm((current) => ({ ...current, leadId }))} disabled={!canOperate} />
              <CrmInput value={financeForm.descricao} onChange={(event) => setFinanceForm((current) => ({ ...current, descricao: event.target.value }))} disabled={!canOperate} placeholder="Descricao" className="w-full" />
              <div className="grid gap-3 md:grid-cols-3">
                <CrmInput type="number" value={financeForm.valor} onChange={(event) => setFinanceForm((current) => ({ ...current, valor: event.target.value }))} disabled={!canOperate} placeholder="Valor" />
                <CrmInput type="date" value={financeForm.vencimento} onChange={(event) => setFinanceForm((current) => ({ ...current, vencimento: event.target.value }))} disabled={!canOperate} />
                <CrmSelect value={financeForm.status} onChange={(event) => setFinanceForm((current) => ({ ...current, status: event.target.value }))} disabled={!canOperate}>
                  {financeStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </CrmSelect>
              </div>
              <CrmInput value={financeForm.meioPagamento} onChange={(event) => setFinanceForm((current) => ({ ...current, meioPagamento: event.target.value }))} disabled={!canOperate} placeholder="Meio de pagamento" className="w-full" />
              <CrmButton type="submit" tone="primary" disabled={!canOperate || savingFinance || !financeForm.descricao.trim()} className="w-full">
                {savingFinance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                Criar lancamento
              </CrmButton>
            </form>
          </div>
        ) : null}
      </CrmPanel>
    </CrmWorkspace>
  );
}

function LeadSelect({
  leads,
  value,
  onChange,
  disabled,
}: {
  leads: LeadItem[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <CrmSelect value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="w-full">
      <option value="">Selecionar cliente</option>
      {leads.map((lead) => (
        <option key={lead.id} value={lead.id}>{lead.nome || "Contato"} {lead.empresa ? `- ${lead.empresa}` : ""}</option>
      ))}
    </CrmSelect>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 line-clamp-2 break-all text-xs text-[var(--cliente-card-text)]">{value}</p>
      <CrmButton type="button" onClick={onCopy} className="mt-3 w-full">
        <Copy className="h-4 w-4" />
        {copied ? "Copiado" : "Copiar"}
      </CrmButton>
    </div>
  );
}
