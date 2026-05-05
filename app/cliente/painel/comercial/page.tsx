"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  BadgeDollarSign,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Sparkles,
  Target,
  Wallet,
  WalletCards,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import {
  getBusinessProfile,
  getBusinessProfilePlaybookPreset,
  type BusinessProfileId,
} from "@/lib/business-profiles";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import { humanizeAiNextAction } from "@/lib/ai-next-actions";

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
  orcamentoId?: string;
  dataPagamento?: string;
  vencimento?: string;
  meioPagamento?: string;
  billingType?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  asaasChargeId?: string;
  updatedAt?: unknown;
};

type FocusSignal = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  badge: string;
};

type TenantSettingsResponse = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

type AiSignalLog = {
  id: string;
  leadId?: string;
  chatId?: string;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  confidence?: number | null;
  nextAction?: string | null;
  extractedFields?: Record<string, string> | null;
  createdAt?: unknown;
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function nextBusinessDate(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export default function ClienteComercialPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const budgetStatusFromQuery = searchParams.get("budgetStatus");
  const financeStatusFromQuery = searchParams.get("financeStatus");
  const financeTypeFromQuery = searchParams.get("financeType");
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingFinance, setSavingFinance] = useState(false);
  const [creatingCharge, setCreatingCharge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [aiLogs, setAiLogs] = useState<AiSignalLog[]>([]);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [finance, setFinance] = useState<FinanceItem[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [budgetSearch, setBudgetSearch] = useState("");
  const [budgetStatusFilter, setBudgetStatusFilter] = useState("all");
  const [financeSearch, setFinanceSearch] = useState("");
  const [financeStatusFilter, setFinanceStatusFilter] = useState("all");
  const [financeTypeFilter, setFinanceTypeFilter] = useState("all");
  const canOperate = hasCapability("manage_commercial");
  const allowAdvanced = experienceMode === "completo";

  const [budgetForm, setBudgetForm] = useState({
    leadId: "",
    titulo: "",
    tipo: "Projeto unico",
    status: "Rascunho",
    valorTotal: "",
    validade: "",
    resumo: "",
  });
  const [financeForm, setFinanceForm] = useState({
    leadId: "",
    descricao: "",
    tipo: "Receita",
    categoria: "Receita comercial",
    status: "pendente",
    valor: "",
    vencimento: "",
    meioPagamento: "",
  });
  const [chargeForm, setChargeForm] = useState({
    leadId: "",
    budgetId: "",
    description: "",
    amount: "",
    dueDate: "",
    billingType: "PIX",
  });
  const [chargePreview, setChargePreview] = useState<{
    chargeId: string;
    financeId: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    billingType?: string;
    pix?: { encodedImage?: string; payload?: string };
  } | null>(null);
  const [copiedChargeKey, setCopiedChargeKey] = useState<string | null>(null);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === (budgetForm.leadId || financeForm.leadId || leadFromQuery)) || null,
    [budgetForm.leadId, financeForm.leadId, leadFromQuery, leads]
  );
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const playbookPreset = useMemo(() => getBusinessProfilePlaybookPreset(businessProfileId), [businessProfileId]);
  const selectedLeadAiLogs = useMemo(() => {
    if (!selectedLead) return [] as AiSignalLog[];
    return aiLogs
      .filter((item) => item.leadId === selectedLead.id && (item.nextAction || item.extractedFields))
      .slice(0, 2);
  }, [aiLogs, selectedLead]);

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);
      const [leadsRes, budgetsRes, financeRes, settingsRes, aiLogsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
        authedFetch(`/api/tenant/${tenant.tenantId}/budgets`),
        authedFetch(`/api/tenant/${tenant.tenantId}/finance`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
      ]);

      const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };
      const budgetsPayload = (await budgetsRes.json()) as { items?: BudgetItem[]; error?: string };
      const financePayload = (await financeRes.json()) as { items?: FinanceItem[]; error?: string };
      const settingsPayload = (await settingsRes.json()) as TenantSettingsResponse;
      const aiLogsPayload = (await aiLogsRes.json().catch(() => ({}))) as { items?: AiSignalLog[] };

      if (!leadsRes.ok || !budgetsRes.ok || !financeRes.ok) {
        setError(leadsPayload.error || budgetsPayload.error || financePayload.error || "Falha ao carregar comercial.");
        return;
      }

      setLeads(leadsPayload.items || []);
      setAiLogs(aiLogsRes.ok ? aiLogsPayload.items || [] : []);
      setBudgets((budgetsPayload.items || []).sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt)));
      setFinance((financePayload.items || []).sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt)));
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
    } catch {
      setError("Falha ao carregar comercial.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!leadFromQuery) return;
    setBudgetForm((current) => ({
      ...current,
      leadId: current.leadId || leadFromQuery,
    }));
    setFinanceForm((current) => ({
      ...current,
      leadId: current.leadId || leadFromQuery,
    }));
    setChargeForm((current) => ({
      ...current,
      leadId: current.leadId || leadFromQuery,
    }));
  }, [leadFromQuery]);

  useEffect(() => {
    if (!selectedLead) return;
    setChargeForm((current) => ({
      ...current,
      leadId: current.leadId || selectedLead.id,
      description: current.description || selectedLead.nome || "",
      dueDate: current.dueDate || nextBusinessDate(3),
    }));
  }, [selectedLead]);

  useEffect(() => {
    if (budgetStatusFromQuery) setBudgetStatusFilter(budgetStatusFromQuery);
    if (financeStatusFromQuery) setFinanceStatusFilter(financeStatusFromQuery);
    if (financeTypeFromQuery) setFinanceTypeFilter(financeTypeFromQuery);
  }, [budgetStatusFromQuery, financeStatusFromQuery, financeTypeFromQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (leadFromQuery) next.set("leadId", leadFromQuery);
    if (budgetStatusFilter !== "all") next.set("budgetStatus", budgetStatusFilter);
    if (financeStatusFilter !== "all") next.set("financeStatus", financeStatusFilter);
    if (financeTypeFilter !== "all") next.set("financeType", financeTypeFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/comercial?${nextQuery}` : "/cliente/painel/comercial");
  }, [budgetStatusFilter, financeStatusFilter, financeTypeFilter, leadFromQuery, router, searchParams]);

  const summary = useMemo(() => {
    const approvedBudgets = budgets.filter((item) => item.status === "Aprovado");
    const paidRevenue = finance
      .filter((item) => item.tipo !== "Despesa" && item.status === "pago")
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const pendingRevenue = finance
      .filter((item) => item.tipo !== "Despesa" && item.status !== "pago")
      .reduce((sum, item) => sum + Number(item.valor || 0), 0);

    return {
      budgets: budgets.length,
      approvedBudgets: approvedBudgets.length,
      approvedValue: approvedBudgets.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0),
      paidRevenue,
      pendingRevenue,
    };
  }, [budgets, finance]);

  const overdueRevenue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return finance.filter((item) => {
      if (item.tipo === "Despesa") return false;
      if (item.status === "pago" || item.status === "cancelado") return false;
      if (!item.vencimento) return false;
      const dueAt = new Date(`${item.vencimento}T00:00:00`);
      return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < today.getTime();
    });
  }, [finance]);

  const focusSignals = useMemo<FocusSignal[]>(() => {
    const items: FocusSignal[] = [];
    const sentBudgets = budgets.filter((item) => item.status === "Enviado");
    const lostBudgets = budgets.filter((item) => item.status === "Perdido");

    if (overdueRevenue.length > 0) {
      const overdueAmount = overdueRevenue.reduce((sum, item) => sum + Number(item.valor || 0), 0);
      items.push({
        id: "overdue_revenue",
        title: "Receita vencida em aberto",
        detail: `${overdueRevenue.length} lancamento(s) atrasados somando ${money(overdueAmount)}.`,
        href: "/cliente/painel/comercial?financeStatus=pendente",
        tone: "danger",
        badge: "cobranca",
      });
    }

    if (sentBudgets.length > 0) {
      const sentValue = sentBudgets.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
      items.push({
        id: "sent_budgets",
        title: "Propostas aguardando decisao",
        detail: `${sentBudgets.length} proposta(s) enviadas ainda sem fechamento, totalizando ${money(sentValue)}.`,
        href: "/cliente/painel/comercial?budgetStatus=Enviado",
        tone: "warning",
        badge: "follow-up",
      });
    }

    if (summary.pendingRevenue > 0) {
      items.push({
        id: "pending_revenue",
        title: "Receita pendente para converter",
        detail: `${money(summary.pendingRevenue)} ainda depende de pagamento ou conclusao comercial.`,
        href: "/cliente/painel/comercial?financeStatus=pendente",
        tone: "info",
        badge: "receita",
      });
    }

    if (summary.approvedBudgets === 0 && summary.budgets > 0) {
      items.push({
        id: "no_approved",
        title: "Nenhuma proposta aprovada",
        detail: "A mesa comercial ainda nao converteu propostas em aprovacao nesta base atual.",
        href: "/cliente/painel/comercial",
        tone: "warning",
        badge: "atencao",
      });
    }

    if (lostBudgets.length > 0) {
      items.push({
        id: "lost",
        title: "Propostas perdidas na janela atual",
        detail: `${lostBudgets.length} oportunidade(s) foram marcadas como perdidas e merecem revisao.`,
        href: "/cliente/painel/comercial?budgetStatus=Perdido",
        tone: "neutral",
        badge: "revisar",
      });
    }

    return items.slice(0, 4);
  }, [budgets, overdueRevenue, summary.approvedBudgets, summary.budgets, summary.pendingRevenue]);

  const selectedLeadSummary = useMemo(() => {
    if (!selectedLead) {
      return {
        budgets: 0,
        approvedBudgets: 0,
        approvedValue: 0,
        paidRevenue: 0,
        pendingRevenue: 0,
      };
    }

    const leadBudgets = budgets.filter((item) => item.leadId === selectedLead.id);
    const approvedBudgets = leadBudgets.filter((item) => item.status === "Aprovado");
    const leadFinance = finance.filter((item) => item.leadId === selectedLead.id);

    return {
      budgets: leadBudgets.length,
      approvedBudgets: approvedBudgets.length,
      approvedValue: approvedBudgets.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0),
      paidRevenue: leadFinance
        .filter((item) => item.tipo !== "Despesa" && item.status === "pago")
        .reduce((sum, item) => sum + Number(item.valor || 0), 0),
      pendingRevenue: leadFinance
        .filter((item) => item.tipo !== "Despesa" && item.status !== "pago")
        .reduce((sum, item) => sum + Number(item.valor || 0), 0),
    };
  }, [budgets, finance, selectedLead]);

  const displayedBudgets = useMemo(() => {
    if (!selectedLead) return budgets;
    const related = budgets.filter((item) => item.leadId === selectedLead.id);
    const others = budgets.filter((item) => item.leadId !== selectedLead.id);
    return [...related, ...others];
  }, [budgets, selectedLead]);

  const displayedFinance = useMemo(() => {
    if (!selectedLead) return finance;
    const related = finance.filter((item) => item.leadId === selectedLead.id);
    const others = finance.filter((item) => item.leadId !== selectedLead.id);
    return [...related, ...others];
  }, [finance, selectedLead]);

  const availableChargeBudgets = useMemo(() => {
    const source = selectedLead ? budgets.filter((item) => item.leadId === selectedLead.id) : budgets;
    return source.filter((item) => item.status === "Aprovado" || item.status === "Enviado" || item.status === "Rascunho");
  }, [budgets, selectedLead]);

  const filteredBudgets = useMemo(() => {
    const search = budgetSearch.trim().toLowerCase();
    return displayedBudgets.filter((budget) => {
      if (budgetStatusFilter !== "all" && budget.status !== budgetStatusFilter) return false;
      if (!search) return true;
      const haystack = [budget.titulo, budget.leadName, budget.resumo, budget.status].join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [budgetSearch, budgetStatusFilter, displayedBudgets]);

  const filteredFinance = useMemo(() => {
    const search = financeSearch.trim().toLowerCase();
    return displayedFinance.filter((item) => {
      if (financeStatusFilter !== "all" && item.status !== financeStatusFilter) return false;
      if (financeTypeFilter !== "all" && item.tipo !== financeTypeFilter) return false;
      if (!search) return true;
      const haystack = [item.descricao, item.leadName, item.categoria, item.status, item.tipo, item.meioPagamento]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [displayedFinance, financeSearch, financeStatusFilter, financeTypeFilter]);

  async function createBudget(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;

    try {
      setSavingBudget(true);
      setNotice(null);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...budgetForm,
          valorTotal: Number(budgetForm.valorTotal || 0),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar proposta.");
        return;
      }
      setBudgetForm({
        leadId: leadFromQuery || "",
        titulo: "",
        tipo: "Projeto unico",
        status: "Rascunho",
        valorTotal: "",
        validade: "",
        resumo: "",
      });
      setNotice("Proposta criada.");
      await load();
    } catch {
      setError("Falha ao criar proposta.");
    } finally {
      setSavingBudget(false);
    }
  }

  async function createFinance(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;

    try {
      setSavingFinance(true);
      setNotice(null);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/finance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...financeForm,
          valor: Number(financeForm.valor || 0),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar lancamento.");
        return;
      }
      setFinanceForm({
        leadId: leadFromQuery || "",
        descricao: "",
        tipo: "Receita",
        categoria: "Receita comercial",
        status: "pendente",
        valor: "",
        vencimento: "",
        meioPagamento: "",
      });
      setNotice("Lancamento criado.");
      await load();
    } catch {
      setError("Falha ao criar lancamento.");
    } finally {
      setSavingFinance(false);
    }
  }

  async function updateBudgetStatus(budgetId: string, status: string) {
    if (!tenant?.tenantId || !canOperate) return;
    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/budgets/${budgetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(payload.error || "Falha ao atualizar proposta.");
      return;
    }
    setNotice("Proposta atualizada.");
    await load();
  }

  async function updateFinanceStatus(financeId: string, status: string) {
    if (!tenant?.tenantId || !canOperate) return;
    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/finance/${financeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(payload.error || "Falha ao atualizar financeiro.");
      return;
    }
    setNotice("Financeiro atualizado.");
    await load();
  }

  async function copyChargeValue(key: string, value: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedChargeKey(key);
      setNotice("Conteudo da cobranca copiado.");
      setTimeout(() => {
        setCopiedChargeKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      setError("Falha ao copiar conteudo da cobranca.");
    }
  }

  async function createCharge(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;

    try {
      setCreatingCharge(true);
      setNotice(null);
      setError(null);
      setChargePreview(null);

      const lead = leads.find((item) => item.id === chargeForm.leadId);
      const selectedBudget = budgets.find((item) => item.id === chargeForm.budgetId);

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
          customerInfo: {
            name: lead?.nome,
            email: lead?.email,
            phone: lead?.telefone,
          },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        chargeId?: string;
        financeId?: string;
        invoiceUrl?: string;
        bankSlipUrl?: string;
        billingType?: string;
        pix?: { encodedImage?: string; payload?: string };
      };

      if (!res.ok || !payload.chargeId || !payload.financeId) {
        setError(payload.error || "Falha ao gerar cobranca.");
        return;
      }

      setChargePreview({
        chargeId: payload.chargeId,
        financeId: payload.financeId,
        invoiceUrl: payload.invoiceUrl,
        bankSlipUrl: payload.bankSlipUrl,
        billingType: payload.billingType,
        pix: payload.pix,
      });
      setChargeForm({
        leadId: chargeForm.leadId,
        budgetId: selectedBudget?.id || "",
        description: selectedBudget?.titulo || chargeForm.description,
        amount: chargeForm.amount,
        dueDate: chargeForm.dueDate,
        billingType: chargeForm.billingType,
      });
      setNotice("Cobranca criada no Asaas e registrada no financeiro.");
      await load();
    } catch {
      setError("Falha ao gerar cobranca.");
    } finally {
      setCreatingCharge(false);
    }
  }

  function prefillChargeFromBudget(budget: BudgetItem) {
    setChargeForm((current) => ({
      ...current,
      leadId: budget.leadId || current.leadId,
      budgetId: budget.id,
      description: budget.titulo || current.description,
      amount: budget.valorTotal ? String(Number(budget.valorTotal)) : current.amount,
      dueDate: budget.validade || current.dueDate || nextBusinessDate(3),
    }));
    setNotice("Cobranca preparada com base na proposta selecionada.");
    setError(null);
  }

  function applyBusinessOfferPreset(index = 0) {
    const offer = playbookPreset.offers[index];
    if (!offer) return;

    setBudgetForm((current) => ({
      ...current,
      leadId: current.leadId || leadFromQuery || selectedLead?.id || "",
      titulo: offer.title,
      resumo: `${offer.whenToOffer}\n\nCliente ideal: ${offer.targetProfile}`,
      valorTotal: offer.priceFrom > 0 ? String(offer.priceFrom) : current.valorTotal,
      validade: current.validade || nextBusinessDate(7),
    }));
    setNotice(`Sugestão comercial do modo ${businessProfile.label} aplicada na proposta.`);
    setError(null);
  }

  function applyAiCommercialSuggestion(log: AiSignalLog) {
    const extractedOffer = String(log.extractedFields?.offer_interest || "").trim().toLowerCase();
    const matchedOffer =
      playbookPreset.offers.find((offer) => offer.title.toLowerCase().includes(extractedOffer) || extractedOffer.includes(offer.title.toLowerCase())) ||
      playbookPreset.offers[0];

    setBudgetForm((current) => ({
      ...current,
      leadId: current.leadId || leadFromQuery || selectedLead?.id || "",
      titulo: current.titulo || matchedOffer?.title || "Proposta comercial",
      resumo:
        current.resumo ||
        [
          matchedOffer?.whenToOffer || "",
          matchedOffer?.targetProfile ? `Cliente ideal: ${matchedOffer.targetProfile}` : "",
          Object.entries(log.extractedFields || {})
            .slice(0, 4)
            .map(([field, value]) => `${field}: ${value}`)
            .join(" | "),
        ]
          .filter(Boolean)
          .join("\n\n"),
      valorTotal: current.valorTotal || (matchedOffer?.priceFrom ? String(matchedOffer.priceFrom) : ""),
      validade: current.validade || nextBusinessDate(7),
    }));
    setNotice("Sugestao da IA aplicada na proposta.");
    setError(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (error && !budgets.length && !finance.length) {
    return <EmptyState title="Falha ao carregar comercial" description={error} />;
  }

  return (
    <div className="comercial-refined client-daily-page space-y-5">
      <SectionHeader
        title="Comercial"
        subtitle="Propostas, receita e acompanhamento financeiro do tenant em um unico modulo."
        action={<StateBadge label="Mesa comercial" tone="info" />}
      />

      {error ? <div className="comercial-notice comercial-notice-danger rounded-[24px] border px-4 py-3 text-sm">{error}</div> : null}
      {notice ? <div className="comercial-notice comercial-notice-success rounded-[24px] border px-4 py-3 text-sm">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/cliente/painel/comercial" className="block">
          <MetricCard label="Propostas" value={String(summary.budgets)} icon={FileText} />
        </Link>
        <Link href="/cliente/painel/comercial?budgetStatus=Aprovado" className="block">
          <MetricCard label="Aprovadas" value={String(summary.approvedBudgets)} icon={BadgeDollarSign} />
        </Link>
        <Link href="/cliente/painel/comercial?budgetStatus=Aprovado" className="block">
          <MetricCard label="Valor aprovado" value={money(summary.approvedValue)} icon={Wallet} />
        </Link>
        <Link href="/cliente/painel/comercial?financeStatus=pago" className="block">
          <MetricCard label="Receita paga" value={money(summary.paidRevenue)} icon={Receipt} />
        </Link>
        <Link href="/cliente/painel/comercial?financeStatus=pendente" className="block">
          <MetricCard label="Receita pendente" value={money(summary.pendingRevenue)} icon={ArrowRightLeft} />
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="comercial-surface-card comercial-hero-card p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <CardTitle title={`Modo do negocio: ${businessProfile.label}`} subtitle="Leitura comercial e ofertas sugeridas para este tenant." />
            <StateBadge label={businessProfile.id} tone="info" />
          </div>
          <div className="comercial-highlight-card comercial-story-card mt-4 rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
            <p className="text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.description}</p>
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Movimento comercial: {businessProfile.commercialMotion}</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Métricas naturais: {businessProfile.metrics.join(" · ")}</p>
          </div>
        </PanelCard>

        {allowAdvanced ? (
          <PanelCard className="comercial-surface-card comercial-offers-card p-5 md:p-6">
            <CardTitle title="Ofertas sugeridas pelo modo" subtitle="Aplique uma sugestão base para acelerar proposta e cobrança." />
            <div className="mt-4 grid gap-3">
              {playbookPreset.offers.slice(0, 3).map((offer, index) => (
                <div key={offer.title} className="comercial-highlight-card comercial-offer-tile rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{offer.title}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{offer.category} · {offer.targetProfile}</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{offer.whenToOffer}</p>
                    </div>
                    <StateBadge label={money(offer.priceFrom)} tone="success" />
                  </div>
                  {canOperate ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => applyBusinessOfferPreset(index)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Aplicar na proposta
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </PanelCard>
        ) : (
          <PanelCard className="comercial-surface-card comercial-offers-card p-5 md:p-6">
            <CardTitle title="Modo essencial ativo" subtitle="Mostrando leitura enxuta para operacao diaria." />
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
              Para editar ofertas sugeridas e acelerar propostas com presets avancados, troque para o modo completo no topo.
            </p>
            <button
              type="button"
              onClick={() => setExperienceMode("completo")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
            >
              Abrir modo completo
            </button>
          </PanelCard>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <PanelCard className="comercial-surface-card comercial-focus-card p-5 md:p-6">
          <CardTitle title="Foco comercial" subtitle="Negociacoes e receita que pedem acao agora" />
          <div className="mt-4 space-y-3">
            {focusSignals.length === 0 ? (
              <EmptyState
                title="Sem alertas comerciais relevantes"
                description="A mesa comercial nao apresenta gargalos urgentes neste recorte."
              />
            ) : (
              focusSignals.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                    </div>
                    <StateBadge label={item.badge} tone={item.tone} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="comercial-surface-card comercial-desk-shell p-5 md:p-6">
          <CardTitle title="Resumo da mesa" subtitle="Leitura rapida da mesa comercial atual" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DeskCard
              title="Valor medio aprovado"
              value={summary.approvedBudgets > 0 ? money(summary.approvedValue / summary.approvedBudgets) : money(0)}
              detail="media por proposta aprovada"
            />
            <DeskCard
              title="Receita em risco"
              value={money(overdueRevenue.reduce((sum, item) => sum + Number(item.valor || 0), 0))}
              detail={`${overdueRevenue.length} vencimento(s) em atraso`}
            />
            <DeskCard
              title="Propostas enviadas"
              value={String(budgets.filter((item) => item.status === "Enviado").length)}
              detail="aguardando decisao do contato"
            />
            <DeskCard
              title="Fluxo financeiro"
              value={summary.pendingRevenue > 0 ? "aberto" : "estavel"}
              detail={`${money(summary.pendingRevenue)} ainda pendente`}
            />
          </div>
        </PanelCard>
      </section>

      {selectedLead ? (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <PanelCard className="comercial-context-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text)]">
                  <WalletCards className="h-3.5 w-3.5" />
                  Contato em negociacao
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-[var(--cliente-card-text)]">{selectedLead.nome || "Contato"}</h3>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                  {selectedLead.empresa || selectedLead.email || selectedLead.telefone || "Sem contato principal"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedLead.pipelineStage || selectedLead.stage ? (
                  <StateBadge label={selectedLead.pipelineStage || selectedLead.stage || "captado"} tone="info" />
                ) : null}
                {selectedLead.owner ? <StateBadge label={selectedLead.owner} tone="neutral" /> : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <MetricCard label="Propostas" value={String(selectedLeadSummary.budgets)} icon={FileText} trend="vinculadas ao contato" />
              <MetricCard label="Aprovadas" value={String(selectedLeadSummary.approvedBudgets)} icon={Target} trend="status comercial" />
              <MetricCard label="Receita paga" value={money(selectedLeadSummary.paidRevenue)} icon={Receipt} trend="valor recebido" />
              <MetricCard label="Pendente" value={money(selectedLeadSummary.pendingRevenue)} icon={Sparkles} trend="receita em aberto" />
            </div>
          </PanelCard>

          <PanelCard className="comercial-side-card p-5 md:p-6">
            <CardTitle title="Continuar operacao" subtitle="Acesse os modulos conectados a este contato." />
            <div className="mt-4 space-y-2">
              <Link
                href={`/cliente/painel/crm?leadId=${encodeURIComponent(selectedLead.id)}`}
                className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <span>Abrir ficha no CRM</span>
                <span className="text-[var(--cliente-card-text-soft)]">→</span>
              </Link>
              <Link
                href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`}
                className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <span>Ver conversas no inbox</span>
                <span className="text-[var(--cliente-card-text-soft)]">→</span>
              </Link>
              <Link
                href={`/cliente/painel/pipeline?leadId=${encodeURIComponent(selectedLead.id)}`}
                className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <span>Destacar no funil</span>
                <span className="text-[var(--cliente-card-text-soft)]">→</span>
              </Link>
              <Link
                href="/cliente/painel/comercial"
                className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <span>Limpar contexto do contato</span>
                <span className="text-[var(--cliente-card-text-soft)]">→</span>
              </Link>
            </div>

            {selectedLeadAiLogs.length ? (
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Pulso comercial da IA</p>
                <div className="mt-3 space-y-3">
                  {selectedLeadAiLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-sm font-medium text-[var(--cliente-card-text)]">{humanizeAiNextAction(log.nextAction)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(log.extractedFields || {}).slice(0, 4).map(([field, value]) => (
                          <span
                            key={`${log.id}_${field}`}
                            className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]"
                          >
                            {field}: {value}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyAiCommercialSuggestion(log)}
                          disabled={!canOperate}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50"
                        >
                          Aplicar na proposta
                        </button>
                        {log.nextAction === "agendar_proximo_passo" ? (
                          <Link
                            href={`/cliente/painel/agenda?leadId=${encodeURIComponent(selectedLead.id)}`}
                            className="rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-accent)] transition hover:brightness-95"
                          >
                            Ir para agenda
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </PanelCard>
        </section>
      ) : null}

      {allowAdvanced ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelCard className="comercial-surface-card comercial-form-card p-5 md:p-6">
          <form onSubmit={createBudget} className="space-y-3">
            <CardTitle title="Nova proposta" subtitle="Crie uma proposta comercial vinculada ao contato." />
            <select
              value={budgetForm.leadId}
              onChange={(event) => setBudgetForm((current) => ({ ...current, leadId: event.target.value }))}
              disabled={!canOperate}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="">Selecione um contato</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome || "Contato"} {lead.empresa ? `• ${lead.empresa}` : ""}
                </option>
              ))}
            </select>
            <input value={budgetForm.titulo} onChange={(event) => setBudgetForm((current) => ({ ...current, titulo: event.target.value }))} disabled={!canOperate} placeholder="Ex: Proposta performance trimestral" className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
            <div className="grid gap-3 md:grid-cols-3">
              <select value={budgetForm.tipo} onChange={(event) => setBudgetForm((current) => ({ ...current, tipo: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm">
                <option>Projeto unico</option>
                <option>Recorrente</option>
              </select>
              <select value={budgetForm.status} onChange={(event) => setBudgetForm((current) => ({ ...current, status: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm">
                <option>Rascunho</option>
                <option>Enviado</option>
                <option>Aprovado</option>
                <option>Perdido</option>
              </select>
              <input value={budgetForm.valorTotal} onChange={(event) => setBudgetForm((current) => ({ ...current, valorTotal: event.target.value }))} disabled={!canOperate} placeholder="Valor total" className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
            </div>
            <input type="date" value={budgetForm.validade} onChange={(event) => setBudgetForm((current) => ({ ...current, validade: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
            <textarea value={budgetForm.resumo} onChange={(event) => setBudgetForm((current) => ({ ...current, resumo: event.target.value }))} disabled={!canOperate} placeholder="Escopo, premissas e resumo comercial" rows={4} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
            <button type="submit" disabled={!canOperate || savingBudget} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60">
              {savingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar proposta
            </button>
          </form>
        </PanelCard>

        <PanelCard className="comercial-surface-card comercial-form-card p-5 md:p-6">
          <form onSubmit={createFinance} className="space-y-3">
            <CardTitle title="Novo lancamento" subtitle="Receita ou despesa comercial com vinculo ao contato." />
            <select
              value={financeForm.leadId}
              onChange={(event) => setFinanceForm((current) => ({ ...current, leadId: event.target.value }))}
              disabled={!canOperate}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="">Sem contato vinculado</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome || "Contato"} {lead.empresa ? `• ${lead.empresa}` : ""}
                </option>
              ))}
            </select>
            <input value={financeForm.descricao} onChange={(event) => setFinanceForm((current) => ({ ...current, descricao: event.target.value }))} disabled={!canOperate} placeholder="Ex: Sinal da proposta ou setup inicial" className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
            <div className="grid gap-3 md:grid-cols-4">
              <select value={financeForm.tipo} onChange={(event) => setFinanceForm((current) => ({ ...current, tipo: event.target.value, categoria: event.target.value === "Despesa" ? "Despesa operacional" : "Receita comercial" }))} disabled={!canOperate} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm">
                <option>Receita</option>
                <option>Despesa</option>
              </select>
              <input value={financeForm.valor} onChange={(event) => setFinanceForm((current) => ({ ...current, valor: event.target.value }))} disabled={!canOperate} placeholder="Valor" className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
              <input type="date" value={financeForm.vencimento} onChange={(event) => setFinanceForm((current) => ({ ...current, vencimento: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
              <select value={financeForm.status} onChange={(event) => setFinanceForm((current) => ({ ...current, status: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border client-input px-3 py-2.5 text-sm">
                <option value="pendente">pendente</option>
                <option value="pago">pago</option>
                <option value="cancelado">cancelado</option>
              </select>
            </div>
            <input value={financeForm.meioPagamento} onChange={(event) => setFinanceForm((current) => ({ ...current, meioPagamento: event.target.value }))} disabled={!canOperate} placeholder="Ex: Pix, boleto, cartao" className="w-full rounded-xl border client-input px-3 py-2.5 text-sm" />
            <button type="submit" disabled={!canOperate || savingFinance} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60">
              {savingFinance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar lancamento
            </button>
          </form>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <PanelCard className="p-5">
          <form onSubmit={createCharge} className="space-y-3">
            <CardTitle title="Gerar cobranca" subtitle="Crie link de pagamento, PIX ou boleto dentro do tenant." />
            {chargeForm.leadId ? (
              (() => {
                const chargeLead = leads.find((item) => item.id === chargeForm.leadId);
                if (!chargeLead) return null;
                return (
                  <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{chargeLead.nome || "Contato"}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                          {chargeLead.empresa || chargeLead.email || chargeLead.telefone || "Sem contato principal"}
                        </p>
                      </div>
                      {chargeLead.pipelineStage || chargeLead.stage ? (
                        <StateBadge label={chargeLead.pipelineStage || chargeLead.stage || "captado"} tone="info" />
                      ) : null}
                    </div>
                    {!chargeLead.email ? (
                      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        Este contato ainda nao tem e-mail. Para gerar cobranca Asaas, preencha o e-mail no CRM.
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : null}
            <select
              value={chargeForm.leadId}
              onChange={(event) => {
                const nextLeadId = event.target.value;
                const lead = leads.find((item) => item.id === nextLeadId);
                setChargeForm((current) => ({
                  ...current,
                  leadId: nextLeadId,
                  budgetId: "",
                  description: current.description || lead?.nome || "",
                }));
              }}
              disabled={!canOperate}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="">Selecione um contato</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome || "Contato"} {lead.empresa ? `• ${lead.empresa}` : ""}
                </option>
              ))}
            </select>
            <select
              value={chargeForm.budgetId}
              onChange={(event) => {
                const nextBudgetId = event.target.value;
                const budget = budgets.find((item) => item.id === nextBudgetId);
                setChargeForm((current) => ({
                  ...current,
                  budgetId: nextBudgetId,
                  description: budget?.titulo || current.description,
                  amount: budget?.valorTotal ? String(Number(budget.valorTotal)) : current.amount,
                  dueDate: budget?.validade || current.dueDate,
                }));
              }}
              disabled={!canOperate || !chargeForm.leadId}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="">Sem proposta vinculada</option>
              {availableChargeBudgets.map((budget) => (
                <option key={budget.id} value={budget.id}>
                  {budget.titulo || "Proposta"} • {money(Number(budget.valorTotal || 0))}
                </option>
              ))}
            </select>
            <input
              value={chargeForm.description}
              onChange={(event) => setChargeForm((current) => ({ ...current, description: event.target.value }))}
              disabled={!canOperate}
              placeholder="Descricao da cobranca"
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={chargeForm.amount}
                onChange={(event) => setChargeForm((current) => ({ ...current, amount: event.target.value }))}
                disabled={!canOperate}
                placeholder="Valor"
                className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
              />
              <input
                type="date"
                value={chargeForm.dueDate}
                onChange={(event) => setChargeForm((current) => ({ ...current, dueDate: event.target.value }))}
                disabled={!canOperate}
                className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
              />
              <select
                value={chargeForm.billingType}
                onChange={(event) => setChargeForm((current) => ({ ...current, billingType: event.target.value }))}
                disabled={!canOperate}
                className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
              >
                <option value="PIX">PIX</option>
                <option value="BOLETO">BOLETO</option>
                <option value="CREDIT_CARD">CREDIT_CARD</option>
              </select>
            </div>
            <button type="submit" disabled={!canOperate || creatingCharge || !chargeForm.leadId || !chargeForm.amount || !leads.find((item) => item.id === chargeForm.leadId)?.email} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60">
              {creatingCharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
              Gerar cobranca
            </button>
          </form>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Retorno da cobranca" subtitle="Link, boleto ou PIX da ultima cobranca gerada neste contexto." />
          {chargePreview ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Charge #{chargePreview.chargeId}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Financeiro vinculado: {chargePreview.financeId}</p>
                  </div>
                  <StateBadge label={chargePreview.billingType || "cobranca"} tone="success" />
                </div>
                {chargePreview.invoiceUrl ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={chargePreview.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir link
                    </a>
                    <button type="button" onClick={() => void copyChargeValue("invoice", chargePreview.invoiceUrl || "")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]">
                      <Copy className="h-3.5 w-3.5" />
                      {copiedChargeKey === "invoice" ? "Copiado" : "Copiar link"}
                    </button>
                  </div>
                ) : null}
                {chargePreview.bankSlipUrl ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={chargePreview.bankSlipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Abrir boleto
                    </a>
                  </div>
                ) : null}
                {chargePreview.pix?.encodedImage ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">PIX gerado</p>
                    <Image src={`data:image/png;base64,${chargePreview.pix.encodedImage}`} alt="QR Code PIX" width={192} height={192} className="mt-3 h-48 w-48 rounded-2xl border border-[var(--cliente-border)] bg-white p-2" unoptimized />
                    {chargePreview.pix.payload ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void copyChargeValue("pix", chargePreview.pix?.payload || "")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]">
                          <Copy className="h-3.5 w-3.5" />
                          {copiedChargeKey === "pix" ? "Copiado" : "Copiar payload PIX"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState title="Nenhuma cobranca gerada nesta sessao" description="Depois de criar uma cobranca, o retorno com link, boleto ou PIX aparece aqui para uso imediato." />
          )}
        </PanelCard>
          </section>
        </>
      ) : (
        <PanelCard className="p-5">
          <CardTitle
            title="Criacao avancada protegida"
            subtitle="No modo essencial deixamos apenas leitura, acompanhamento e atualizacao de status."
          />
          <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
            Para criar propostas, lancamentos e cobrancas direto daqui, ative o modo completo.
          </p>
          <button
            type="button"
            onClick={() => setExperienceMode("completo")}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
          >
            Ativar modo completo
          </button>
        </PanelCard>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelCard className="p-5">
          <CardTitle title="Funil de propostas" subtitle="Envio, aprovacao e perda comercial por contato." />
          <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <input
              value={budgetSearch}
              onChange={(event) => setBudgetSearch(event.target.value)}
              placeholder="Buscar proposta, contato ou resumo"
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            />
            <select
              value={budgetStatusFilter}
              onChange={(event) => setBudgetStatusFilter(event.target.value)}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="all">Todos os status</option>
              <option value="Rascunho">Rascunho</option>
              <option value="Enviado">Enviado</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Perdido">Perdido</option>
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {filteredBudgets.length ? (
              filteredBudgets.map((budget) => (
                <div key={budget.id} className={`rounded-2xl border p-4 ${selectedLead && budget.leadId === selectedLead.id ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{budget.titulo || "Proposta"}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                        {budget.leadName || "Sem contato"} • validade {formatDate(budget.validade)}
                      </p>
                    </div>
                    <div className="text-right">
                      <StateBadge
                        label={budget.status || "Rascunho"}
                        tone={
                          budget.status === "Aprovado"
                            ? "success"
                            : budget.status === "Perdido"
                              ? "danger"
                              : budget.status === "Enviado"
                                ? "info"
                                : "neutral"
                        }
                      />
                      <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">{money(Number(budget.valorTotal || 0))}</p>
                    </div>
                  </div>
                  {budget.resumo ? <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">{budget.resumo}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {budget.leadId ? (
                      <>
                        <Link
                          href={`/cliente/painel/crm?leadId=${encodeURIComponent(budget.leadId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Abrir contato
                        </Link>
                        <Link
                          href={`/cliente/painel/inbox?leadId=${encodeURIComponent(budget.leadId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Ver conversa
                        </Link>
                        {canOperate && budget.status === "Aprovado" ? (
                          <button
                            type="button"
                            onClick={() => prefillChargeFromBudget(budget)}
                            className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 transition hover:bg-emerald-500/15"
                          >
                            Preparar cobranca
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  {canOperate ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["Rascunho", "Enviado", "Aprovado", "Perdido"].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void updateBudgetStatus(budget.id, status)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            budget.status === status
                              ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                              : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                title="Nenhuma proposta encontrada"
                description={
                  displayedBudgets.length
                    ? "Nenhuma proposta corresponde aos filtros atuais."
                    : "Crie a primeira proposta vinculada a um contato para fechar o fluxo comercial."
                }
              />
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Financeiro comercial" subtitle="Receitas e despesas ligadas ao tenant e aos contatos." />
          <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.8fr_0.8fr]">
            <input
              value={financeSearch}
              onChange={(event) => setFinanceSearch(event.target.value)}
              placeholder="Buscar descricao, contato, categoria ou meio"
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            />
            <select
              value={financeStatusFilter}
              onChange={(event) => setFinanceStatusFilter(event.target.value)}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="all">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select
              value={financeTypeFilter}
              onChange={(event) => setFinanceTypeFilter(event.target.value)}
              className="w-full rounded-xl border client-input px-3 py-2.5 text-sm"
            >
              <option value="all">Receitas e despesas</option>
              <option value="Receita">Receita</option>
              <option value="Despesa">Despesa</option>
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {filteredFinance.length ? (
              filteredFinance.map((item) => (
                <div key={item.id} className={`rounded-2xl border p-4 ${selectedLead && item.leadId === selectedLead.id ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.descricao || "Lancamento"}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                        {item.leadName || "Sem contato"} • vencimento {formatDate(item.vencimento)}
                      </p>
                    </div>
                    <div className="text-right">
                      <StateBadge
                        label={item.status || "pendente"}
                        tone={item.status === "pago" ? "success" : item.status === "cancelado" ? "danger" : "warning"}
                      />
                      <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">{money(Number(item.valor || 0))}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--cliente-card-text-soft)]">
                    <span>{item.tipo || "Receita"}</span>
                    <span>•</span>
                    <span>{item.categoria || "Sem categoria"}</span>
                    {item.meioPagamento ? (
                      <>
                        <span>•</span>
                        <span>{item.meioPagamento}</span>
                      </>
                    ) : null}
                    {item.billingType ? (
                      <>
                        <span>•</span>
                        <span>{item.billingType}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.leadId ? (
                      <>
                        <Link
                          href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Abrir contato
                        </Link>
                        <Link
                          href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Ver conversa
                        </Link>
                      </>
                    ) : null}
                    {item.invoiceUrl ? (
                      <a
                        href={item.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                      >
                        Abrir cobranca
                      </a>
                    ) : null}
                    {item.bankSlipUrl ? (
                      <a
                        href={item.bankSlipUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                      >
                        Abrir boleto
                      </a>
                    ) : null}
                  </div>
                  {canOperate ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["pendente", "pago", "cancelado"].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void updateFinanceStatus(item.id, status)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            item.status === status
                              ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                              : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                title="Nenhum lancamento encontrado"
                description={
                  displayedFinance.length
                    ? "Nenhum lancamento corresponde aos filtros atuais."
                    : "Registre receitas e despesas para consolidar o valor entregue ao cliente."
                }
              />
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

function DeskCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="comercial-desk-card rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{title}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );
}




