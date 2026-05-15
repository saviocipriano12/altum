"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Filter,
  LayoutDashboard,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  Receipt,
  Search,
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
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import { ClientOpportunitiesHeader } from "@/app/cliente/painel/components/client-opportunities-header";
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

type ActiveTab = "proposals" | "finance" | "charges" | "create";

const BUDGET_STATUSES = ["Rascunho", "Enviado", "Aprovado", "Perdido"] as const;
const FINANCE_STATUSES = ["pendente", "pago", "cancelado"] as const;
const BILLING_TYPES = ["PIX", "BOLETO", "CREDIT_CARD"] as const;

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

function budgetTone(status?: string) {
  if (status === "Aprovado") return "success" as const;
  if (status === "Perdido") return "danger" as const;
  if (status === "Enviado") return "info" as const;
  return "neutral" as const;
}

function financeTone(status?: string) {
  if (status === "pago") return "success" as const;
  if (status === "cancelado") return "danger" as const;
  return "warning" as const;
}

function initials(name?: string) {
  const parts = String(name || "Contato")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "CT";
}

function fieldId(name: string) {
  return `commercial_${name}`;
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
  const [activeTab, setActiveTab] = useState<ActiveTab>("proposals");

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
    () => leads.find((lead) => lead.id === (budgetForm.leadId || financeForm.leadId || chargeForm.leadId || leadFromQuery)) || null,
    [budgetForm.leadId, chargeForm.leadId, financeForm.leadId, leadFromQuery, leads]
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
    setBudgetForm((current) => ({ ...current, leadId: current.leadId || leadFromQuery }));
    setFinanceForm((current) => ({ ...current, leadId: current.leadId || leadFromQuery }));
    setChargeForm((current) => ({ ...current, leadId: current.leadId || leadFromQuery }));
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
        detail: `${overdueRevenue.length} lançamento(s) atrasados somando ${money(overdueAmount)}.`,
        href: "/cliente/painel/comercial?financeStatus=pendente",
        tone: "danger",
        badge: "cobrança",
      });
    }

    if (sentBudgets.length > 0) {
      const sentValue = sentBudgets.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
      items.push({
        id: "sent_budgets",
        title: "Propostas aguardando decisão",
        detail: `${sentBudgets.length} proposta(s) enviadas totalizando ${money(sentValue)}.`,
        href: "/cliente/painel/comercial?budgetStatus=Enviado",
        tone: "warning",
        badge: "follow-up",
      });
    }

    if (summary.pendingRevenue > 0) {
      items.push({
        id: "pending_revenue",
        title: "Receita pendente para converter",
        detail: `${money(summary.pendingRevenue)} ainda depende de pagamento ou conclusão comercial.`,
        href: "/cliente/painel/comercial?financeStatus=pendente",
        tone: "info",
        badge: "receita",
      });
    }

    if (summary.approvedBudgets === 0 && summary.budgets > 0) {
      items.push({
        id: "no_approved",
        title: "Nenhuma proposta aprovada",
        detail: "A mesa comercial ainda não converteu propostas em aprovação nesta base atual.",
        href: "/cliente/painel/comercial",
        tone: "warning",
        badge: "atenção",
      });
    }

    if (lostBudgets.length > 0) {
      items.push({
        id: "lost",
        title: "Propostas perdidas na janela atual",
        detail: `${lostBudgets.length} oportunidade(s) foram marcadas como perdidas e merecem revisão.`,
        href: "/cliente/painel/comercial?budgetStatus=Perdido",
        tone: "neutral",
        badge: "revisar",
      });
    }

    return items.slice(0, 4);
  }, [budgets, overdueRevenue, summary.approvedBudgets, summary.budgets, summary.pendingRevenue]);

  const selectedLeadSummary = useMemo(() => {
    if (!selectedLead) {
      return { budgets: 0, approvedBudgets: 0, approvedValue: 0, paidRevenue: 0, pendingRevenue: 0 };
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
      setNotice("Proposta criada com sucesso.");
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
        setError(payload.error || "Falha ao criar lançamento.");
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
      setNotice("Lançamento criado com sucesso.");
      await load();
    } catch {
      setError("Falha ao criar lançamento.");
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
      setNotice("Conteúdo da cobrança copiado.");
      setTimeout(() => {
        setCopiedChargeKey((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      setError("Falha ao copiar conteúdo da cobrança.");
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
        setError(payload.error || "Falha ao gerar cobrança.");
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
      setActiveTab("charges");
      setNotice("Cobrança criada no Asaas e registrada no financeiro.");
      await load();
    } catch {
      setError("Falha ao gerar cobrança.");
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
    setActiveTab("charges");
    setNotice("Cobrança preparada com base na proposta selecionada.");
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
    setActiveTab("create");
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
    setActiveTab("create");
    setNotice("Sugestão da IA aplicada na proposta.");
    setError(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
        </div>
      </div>
    );
  }

  if (error && !budgets.length && !finance.length) {
    return <EmptyState title="Falha ao carregar comercial" description={error} />;
  }

  return (
    <div className="comercial-refined client-daily-page space-y-6">
      <ClientOpportunitiesHeader activeView="proposals" action={<StateBadge label="Mesa comercial" tone="info" />} />

      <div aria-live="polite" className="space-y-3">
        {error ? <NoticeCard tone="danger" message={error} /> : null}
        {notice ? <NoticeCard tone="success" message={notice} /> : null}
      </div>

      <CommercialHero
        canOperate={canOperate}
        allowAdvanced={allowAdvanced}
        businessProfileLabel={businessProfile.label}
        onCreateProposal={() => setActiveTab("create")}
        onCreateCharge={() => setActiveTab("charges")}
        onCreateFinance={() => setActiveTab("create")}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/cliente/painel/comercial" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] focus-visible:ring-offset-2">
          <MetricCard label="Propostas" value={String(summary.budgets)} icon={FileText} tone="brand" trend={`${budgets.filter((item) => item.status === "Rascunho").length} em rascunho`} />
        </Link>
        <Link href="/cliente/painel/comercial?budgetStatus=Aprovado" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] focus-visible:ring-offset-2">
          <MetricCard label="Aprovadas" value={String(summary.approvedBudgets)} icon={BadgeDollarSign} tone="success" trend="prontas para faturar" />
        </Link>
        <Link href="/cliente/painel/comercial?budgetStatus=Aprovado" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] focus-visible:ring-offset-2">
          <MetricCard label="Valor aprovado" value={money(summary.approvedValue)} icon={Wallet} tone="ai" trend="potencial fechado" />
        </Link>
        <Link href="/cliente/painel/comercial?financeStatus=pago" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] focus-visible:ring-offset-2">
          <MetricCard label="Receita paga" value={money(summary.paidRevenue)} icon={Receipt} tone="success" trend="recebido" />
        </Link>
        <Link href="/cliente/painel/comercial?financeStatus=pendente" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] focus-visible:ring-offset-2">
          <MetricCard label="Receita pendente" value={money(summary.pendingRevenue)} icon={ArrowRightLeft} tone="warning" trend="a vencer ou em aberto" />
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <PriorityPanel focusSignals={focusSignals} />

          <PanelCard className="overflow-hidden p-0">
            <TabNavigation activeTab={activeTab} onChange={setActiveTab} allowAdvanced={allowAdvanced} />

            <div className="p-5 md:p-6">
              {activeTab === "proposals" ? (
                <BudgetList
                  canOperate={canOperate}
                  budgetSearch={budgetSearch}
                  budgetStatusFilter={budgetStatusFilter}
                  displayedBudgets={displayedBudgets}
                  filteredBudgets={filteredBudgets}
                  selectedLead={selectedLead}
                  onSearchChange={setBudgetSearch}
                  onStatusFilterChange={setBudgetStatusFilter}
                  onStatusUpdate={updateBudgetStatus}
                  onPrepareCharge={prefillChargeFromBudget}
                />
              ) : null}

              {activeTab === "finance" ? (
                <FinanceList
                  canOperate={canOperate}
                  financeSearch={financeSearch}
                  financeStatusFilter={financeStatusFilter}
                  financeTypeFilter={financeTypeFilter}
                  displayedFinance={displayedFinance}
                  filteredFinance={filteredFinance}
                  selectedLead={selectedLead}
                  onSearchChange={setFinanceSearch}
                  onStatusFilterChange={setFinanceStatusFilter}
                  onTypeFilterChange={setFinanceTypeFilter}
                  onStatusUpdate={updateFinanceStatus}
                />
              ) : null}

              {activeTab === "charges" ? (
                <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                  {allowAdvanced ? (
                    <ChargeForm
                      canOperate={canOperate}
                      creatingCharge={creatingCharge}
                      chargeForm={chargeForm}
                      leads={leads}
                      budgets={budgets}
                      availableChargeBudgets={availableChargeBudgets}
                      onSubmit={createCharge}
                      onChange={setChargeForm}
                    />
                  ) : (
                    <AdvancedLockedPanel onEnable={() => setExperienceMode("completo")} />
                  )}
                  <ChargeReturnPanel
                    chargePreview={chargePreview}
                    copiedChargeKey={copiedChargeKey}
                    onCopy={copyChargeValue}
                  />
                </div>
              ) : null}

              {activeTab === "create" ? (
                allowAdvanced ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <BudgetForm
                      canOperate={canOperate}
                      savingBudget={savingBudget}
                      budgetForm={budgetForm}
                      leads={leads}
                      onSubmit={createBudget}
                      onChange={setBudgetForm}
                    />
                    <FinanceForm
                      canOperate={canOperate}
                      savingFinance={savingFinance}
                      financeForm={financeForm}
                      leads={leads}
                      onSubmit={createFinance}
                      onChange={setFinanceForm}
                    />
                  </div>
                ) : (
                  <AdvancedLockedPanel onEnable={() => setExperienceMode("completo")} />
                )
              ) : null}
            </div>
          </PanelCard>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {selectedLead ? (
            <LeadContextPanel
              selectedLead={selectedLead}
              selectedLeadSummary={selectedLeadSummary}
              selectedLeadAiLogs={selectedLeadAiLogs}
              canOperate={canOperate}
              onApplyAiSuggestion={applyAiCommercialSuggestion}
            />
          ) : (
            <BusinessProfilePanel
              allowAdvanced={allowAdvanced}
              businessProfile={businessProfile}
              playbookPreset={playbookPreset}
              canOperate={canOperate}
              onApplyOffer={applyBusinessOfferPreset}
              onEnableAdvanced={() => setExperienceMode("completo")}
            />
          )}

          <DeskSummaryPanel summary={summary} overdueRevenue={overdueRevenue} budgets={budgets} />
        </aside>
      </section>
    </div>
  );
}

function CommercialHero({
  canOperate,
  allowAdvanced,
  businessProfileLabel,
  onCreateProposal,
  onCreateCharge,
  onCreateFinance,
}: {
  canOperate: boolean;
  allowAdvanced: boolean;
  businessProfileLabel: string;
  onCreateProposal: () => void;
  onCreateCharge: () => void;
  onCreateFinance: () => void;
}) {
  return (
    <PanelCard tone="spotlight" className="overflow-hidden p-5 md:p-7">
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/84">
              Mesa comercial
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-semibold text-white/84">
              <Sparkles className="h-3.5 w-3.5" />
              {allowAdvanced ? "Modo completo" : "Modo essencial"}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-white md:text-4xl">
            Controle propostas, cobranças e receita com uma rotina comercial mais clara.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72">
            Perfil ativo: {businessProfileLabel}. Priorize follow-ups, acompanhe valores em aberto e transforme oportunidade em fechamento sem perder contexto.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <HeroButton icon={Receipt} label="Novo lançamento" disabled={!canOperate || !allowAdvanced} onClick={onCreateFinance} />
          <HeroButton icon={WalletCards} label="Gerar cobrança" disabled={!canOperate || !allowAdvanced} onClick={onCreateCharge} />
          <HeroButton icon={Plus} label="Nova proposta" variant="primary" disabled={!canOperate || !allowAdvanced} onClick={onCreateProposal} />
        </div>
      </div>
    </PanelCard>
  );
}

function HeroButton({
  icon: Icon,
  label,
  disabled,
  variant = "secondary",
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "bg-white text-[var(--cliente-accent)] shadow-[0_20px_50px_-28px_rgba(255,255,255,0.7)] hover:bg-white/92"
          : "border border-white/16 bg-white/12 text-white hover:bg-white/16"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function NoticeCard({ tone, message }: { tone: "success" | "danger"; message: string }) {
  const isDanger = tone === "danger";
  return (
    <div
      className={`rounded-[22px] border px-4 py-3 text-sm ${
        isDanger
          ? "border-red-500/20 bg-red-500/10 text-red-100"
          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
      }`}
    >
      <div className="flex items-center gap-2">
        {isDanger ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        <span>{message}</span>
      </div>
    </div>
  );
}

function PriorityPanel({ focusSignals }: { focusSignals: FocusSignal[] }) {
  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle title="Prioridades de hoje" subtitle="Ações com maior impacto em receita agora." />
        <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-1 text-xs text-[var(--cliente-card-text-soft)]">
          Atualizado agora
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {focusSignals.length ? (
          focusSignals.slice(0, 3).map((item) => <PriorityCard key={item.id} item={item} />)
        ) : (
          <div className="lg:col-span-3">
            <EmptyState title="Sem gargalos comerciais fortes" description="A mesa comercial está sem alertas críticos neste momento." />
          </div>
        )}
      </div>
    </PanelCard>
  );
}

function PriorityCard({ item }: { item: FocusSignal }) {
  const toneClass =
    item.tone === "danger"
      ? "border-red-500/18 bg-red-500/8"
      : item.tone === "warning"
        ? "border-amber-500/18 bg-amber-500/8"
        : item.tone === "success"
          ? "border-emerald-500/18 bg-emerald-500/8"
          : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)]";

  return (
    <Link
      href={item.href}
      className={`group rounded-[24px] border p-4 transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <StateBadge label={item.badge} tone={item.tone} />
          <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{item.detail}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--cliente-card-text-soft)] transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function TabNavigation({
  activeTab,
  onChange,
  allowAdvanced,
}: {
  activeTab: ActiveTab;
  onChange: (tab: ActiveTab) => void;
  allowAdvanced: boolean;
}) {
  const tabs: Array<{ id: ActiveTab; label: string; icon: typeof FileText; protected?: boolean }> = [
    { id: "proposals", label: "Propostas", icon: FileText },
    { id: "finance", label: "Financeiro", icon: Receipt },
    { id: "charges", label: "Cobranças", icon: CreditCard, protected: true },
    { id: "create", label: "Criar", icon: Plus, protected: true },
  ];

  return (
    <div className="border-b border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 md:px-5">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`inline-flex min-w-max items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] ${
                active
                  ? "bg-[var(--cliente-accent)] text-white shadow-[0_18px_36px_-28px_rgba(37,99,235,0.6)]"
                  : "text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)] hover:text-[var(--cliente-card-text)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.protected && !allowAdvanced ? <span className="text-[10px] opacity-70">completo</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BudgetList({
  canOperate,
  budgetSearch,
  budgetStatusFilter,
  displayedBudgets,
  filteredBudgets,
  selectedLead,
  onSearchChange,
  onStatusFilterChange,
  onStatusUpdate,
  onPrepareCharge,
}: {
  canOperate: boolean;
  budgetSearch: string;
  budgetStatusFilter: string;
  displayedBudgets: BudgetItem[];
  filteredBudgets: BudgetItem[];
  selectedLead: LeadItem | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onStatusUpdate: (budgetId: string, status: string) => Promise<void>;
  onPrepareCharge: (budget: BudgetItem) => void;
}) {
  return (
    <div>
      <ListHeader
        title="Funil de propostas"
        subtitle="Envio, aprovação e perda comercial por contato."
        count={filteredBudgets.length}
      />

      <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr_auto]">
        <SearchInput
          value={budgetSearch}
          onChange={onSearchChange}
          placeholder="Buscar proposta, contato ou resumo"
          label="Buscar propostas"
        />
        <SelectField
          label="Status da proposta"
          value={budgetStatusFilter}
          onChange={onStatusFilterChange}
          options={[
            { value: "all", label: "Todos os status" },
            ...BUDGET_STATUSES.map((status) => ({ value: status, label: status })),
          ]}
        />
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2.5 text-sm font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
        >
          <Filter className="h-4 w-4" />
          Filtros
        </button>
      </div>

      <div className="mt-4 divide-y divide-[var(--cliente-border)] overflow-hidden rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)]">
        {filteredBudgets.length ? (
          filteredBudgets.map((budget) => (
            <BudgetRow
              key={budget.id}
              budget={budget}
              selected={Boolean(selectedLead && budget.leadId === selectedLead.id)}
              canOperate={canOperate}
              onStatusUpdate={onStatusUpdate}
              onPrepareCharge={onPrepareCharge}
            />
          ))
        ) : (
          <div className="p-5">
            <EmptyState
              title="Nenhuma proposta encontrada"
              description={
                displayedBudgets.length
                  ? "Nenhuma proposta corresponde aos filtros atuais."
                  : "Crie a primeira proposta vinculada a um contato para fechar o fluxo comercial."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetRow({
  budget,
  selected,
  canOperate,
  onStatusUpdate,
  onPrepareCharge,
}: {
  budget: BudgetItem;
  selected: boolean;
  canOperate: boolean;
  onStatusUpdate: (budgetId: string, status: string) => Promise<void>;
  onPrepareCharge: (budget: BudgetItem) => void;
}) {
  return (
    <div className={`p-4 transition ${selected ? "bg-[var(--cliente-accent-soft)]" : "hover:bg-[var(--cliente-surface-muted)]"}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px_140px_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar label={budget.leadName || budget.titulo || "Proposta"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{budget.titulo || "Proposta"}</p>
            <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
              {budget.leadName || "Sem contato"} • validade {formatDate(budget.validade)}
            </p>
            {budget.resumo ? <p className="mt-2 line-clamp-2 text-sm text-[var(--cliente-card-text-muted)]">{budget.resumo}</p> : null}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{money(Number(budget.valorTotal || 0))}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Valor total</p>
        </div>

        <StateBadge label={budget.status || "Rascunho"} tone={budgetTone(budget.status)} />

        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          {budget.leadId ? (
            <>
              <SmallLink href={`/cliente/painel/crm?leadId=${encodeURIComponent(budget.leadId)}`}>CRM</SmallLink>
              <SmallLink href={`/cliente/painel/inbox?leadId=${encodeURIComponent(budget.leadId)}`}>Inbox</SmallLink>
            </>
          ) : null}
          {canOperate && budget.status === "Aprovado" ? (
            <button
              type="button"
              onClick={() => onPrepareCharge(budget)}
              className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Cobrar
            </button>
          ) : null}
          <MoreVertical className="h-4 w-4 self-center text-[var(--cliente-card-text-soft)]" />
        </div>
      </div>

      {canOperate ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-0 lg:pl-12">
          {BUDGET_STATUSES.map((status) => (
            <StatusButton
              key={status}
              active={budget.status === status}
              label={status}
              onClick={() => void onStatusUpdate(budget.id, status)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FinanceList({
  canOperate,
  financeSearch,
  financeStatusFilter,
  financeTypeFilter,
  displayedFinance,
  filteredFinance,
  selectedLead,
  onSearchChange,
  onStatusFilterChange,
  onTypeFilterChange,
  onStatusUpdate,
}: {
  canOperate: boolean;
  financeSearch: string;
  financeStatusFilter: string;
  financeTypeFilter: string;
  displayedFinance: FinanceItem[];
  filteredFinance: FinanceItem[];
  selectedLead: LeadItem | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onStatusUpdate: (financeId: string, status: string) => Promise<void>;
}) {
  return (
    <div>
      <ListHeader
        title="Financeiro comercial"
        subtitle="Receitas e despesas ligadas ao tenant e aos contatos."
        count={filteredFinance.length}
      />

      <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.8fr_0.8fr]">
        <SearchInput
          value={financeSearch}
          onChange={onSearchChange}
          placeholder="Buscar descrição, contato, categoria ou meio"
          label="Buscar lançamentos"
        />
        <SelectField
          label="Status financeiro"
          value={financeStatusFilter}
          onChange={onStatusFilterChange}
          options={[
            { value: "all", label: "Todos os status" },
            { value: "pendente", label: "Pendente" },
            { value: "pago", label: "Pago" },
            { value: "cancelado", label: "Cancelado" },
          ]}
        />
        <SelectField
          label="Tipo financeiro"
          value={financeTypeFilter}
          onChange={onTypeFilterChange}
          options={[
            { value: "all", label: "Receitas e despesas" },
            { value: "Receita", label: "Receita" },
            { value: "Despesa", label: "Despesa" },
          ]}
        />
      </div>

      <div className="mt-4 divide-y divide-[var(--cliente-border)] overflow-hidden rounded-[26px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)]">
        {filteredFinance.length ? (
          filteredFinance.map((item) => (
            <FinanceRow
              key={item.id}
              item={item}
              selected={Boolean(selectedLead && item.leadId === selectedLead.id)}
              canOperate={canOperate}
              onStatusUpdate={onStatusUpdate}
            />
          ))
        ) : (
          <div className="p-5">
            <EmptyState
              title="Nenhum lançamento encontrado"
              description={
                displayedFinance.length
                  ? "Nenhum lançamento corresponde aos filtros atuais."
                  : "Registre receitas e despesas para consolidar o valor entregue ao cliente."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FinanceRow({
  item,
  selected,
  canOperate,
  onStatusUpdate,
}: {
  item: FinanceItem;
  selected: boolean;
  canOperate: boolean;
  onStatusUpdate: (financeId: string, status: string) => Promise<void>;
}) {
  return (
    <div className={`p-4 transition ${selected ? "bg-[var(--cliente-accent-soft)]" : "hover:bg-[var(--cliente-surface-muted)]"}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px_140px_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar label={item.leadName || item.descricao || "Lançamento"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{item.descricao || "Lançamento"}</p>
            <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
              {item.leadName || "Sem contato"} • vencimento {formatDate(item.vencimento)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--cliente-card-text-soft)]">
              <span>{item.tipo || "Receita"}</span>
              <span>•</span>
              <span>{item.categoria || "Sem categoria"}</span>
              {item.meioPagamento ? <span>• {item.meioPagamento}</span> : null}
              {item.billingType ? <span>• {item.billingType}</span> : null}
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{money(Number(item.valor || 0))}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Valor</p>
        </div>

        <StateBadge label={item.status || "pendente"} tone={financeTone(item.status)} />

        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          {item.leadId ? (
            <>
              <SmallLink href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`}>CRM</SmallLink>
              <SmallLink href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`}>Inbox</SmallLink>
            </>
          ) : null}
          {item.invoiceUrl ? <ExternalSmallLink href={item.invoiceUrl}>Cobrança</ExternalSmallLink> : null}
          {item.bankSlipUrl ? <ExternalSmallLink href={item.bankSlipUrl}>Boleto</ExternalSmallLink> : null}
        </div>
      </div>

      {canOperate ? (
        <div className="mt-3 flex flex-wrap gap-2 pl-0 lg:pl-12">
          {FINANCE_STATUSES.map((status) => (
            <StatusButton
              key={status}
              active={item.status === status}
              label={status}
              onClick={() => void onStatusUpdate(item.id, status)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BudgetForm({
  canOperate,
  savingBudget,
  budgetForm,
  leads,
  onSubmit,
  onChange,
}: {
  canOperate: boolean;
  savingBudget: boolean;
  budgetForm: {
    leadId: string;
    titulo: string;
    tipo: string;
    status: string;
    valorTotal: string;
    validade: string;
    resumo: string;
  };
  leads: LeadItem[];
  onSubmit: (event: FormEvent) => Promise<void>;
  onChange: React.Dispatch<React.SetStateAction<typeof budgetForm>>;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
      <CardTitle title="Nova proposta" subtitle="Crie uma proposta comercial vinculada ao contato." />
      <div className="mt-5 space-y-4">
        <SelectField
          label="Contato"
          value={budgetForm.leadId}
          onChange={(value) => onChange((current) => ({ ...current, leadId: value }))}
          disabled={!canOperate}
          options={[
            { value: "", label: "Selecione um contato" },
            ...leads.map((lead) => ({ value: lead.id, label: `${lead.nome || "Contato"}${lead.empresa ? ` • ${lead.empresa}` : ""}` })),
          ]}
        />
        <TextField
          label="Título da proposta"
          value={budgetForm.titulo}
          onChange={(value) => onChange((current) => ({ ...current, titulo: value }))}
          disabled={!canOperate}
          placeholder="Ex: Proposta performance trimestral"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField
            label="Tipo"
            value={budgetForm.tipo}
            onChange={(value) => onChange((current) => ({ ...current, tipo: value }))}
            disabled={!canOperate}
            options={[{ value: "Projeto unico", label: "Projeto único" }, { value: "Recorrente", label: "Recorrente" }]}
          />
          <SelectField
            label="Status"
            value={budgetForm.status}
            onChange={(value) => onChange((current) => ({ ...current, status: value }))}
            disabled={!canOperate}
            options={BUDGET_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <TextField
            label="Valor total"
            value={budgetForm.valorTotal}
            onChange={(value) => onChange((current) => ({ ...current, valorTotal: value }))}
            disabled={!canOperate}
            placeholder="R$ 0,00"
            inputMode="decimal"
          />
        </div>
        <TextField
          label="Validade"
          type="date"
          value={budgetForm.validade}
          onChange={(value) => onChange((current) => ({ ...current, validade: value }))}
          disabled={!canOperate}
        />
        <TextareaField
          label="Resumo comercial"
          value={budgetForm.resumo}
          onChange={(value) => onChange((current) => ({ ...current, resumo: value }))}
          disabled={!canOperate}
          placeholder="Escopo, premissas e resumo comercial"
        />
        <PrimaryButton type="submit" disabled={!canOperate || savingBudget} loading={savingBudget} icon={Plus}>
          Salvar proposta
        </PrimaryButton>
      </div>
    </form>
  );
}

function FinanceForm({
  canOperate,
  savingFinance,
  financeForm,
  leads,
  onSubmit,
  onChange,
}: {
  canOperate: boolean;
  savingFinance: boolean;
  financeForm: {
    leadId: string;
    descricao: string;
    tipo: string;
    categoria: string;
    status: string;
    valor: string;
    vencimento: string;
    meioPagamento: string;
  };
  leads: LeadItem[];
  onSubmit: (event: FormEvent) => Promise<void>;
  onChange: React.Dispatch<React.SetStateAction<typeof financeForm>>;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
      <CardTitle title="Novo lançamento" subtitle="Receita ou despesa comercial com vínculo ao contato." />
      <div className="mt-5 space-y-4">
        <SelectField
          label="Contato"
          value={financeForm.leadId}
          onChange={(value) => onChange((current) => ({ ...current, leadId: value }))}
          disabled={!canOperate}
          options={[
            { value: "", label: "Sem contato vinculado" },
            ...leads.map((lead) => ({ value: lead.id, label: `${lead.nome || "Contato"}${lead.empresa ? ` • ${lead.empresa}` : ""}` })),
          ]}
        />
        <TextField
          label="Descrição"
          value={financeForm.descricao}
          onChange={(value) => onChange((current) => ({ ...current, descricao: value }))}
          disabled={!canOperate}
          placeholder="Ex: Sinal da proposta ou setup inicial"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            label="Tipo"
            value={financeForm.tipo}
            onChange={(value) =>
              onChange((current) => ({
                ...current,
                tipo: value,
                categoria: value === "Despesa" ? "Despesa operacional" : "Receita comercial",
              }))
            }
            disabled={!canOperate}
            options={[{ value: "Receita", label: "Receita" }, { value: "Despesa", label: "Despesa" }]}
          />
          <TextField
            label="Valor"
            value={financeForm.valor}
            onChange={(value) => onChange((current) => ({ ...current, valor: value }))}
            disabled={!canOperate}
            placeholder="R$ 0,00"
            inputMode="decimal"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Vencimento"
            type="date"
            value={financeForm.vencimento}
            onChange={(value) => onChange((current) => ({ ...current, vencimento: value }))}
            disabled={!canOperate}
          />
          <SelectField
            label="Status"
            value={financeForm.status}
            onChange={(value) => onChange((current) => ({ ...current, status: value }))}
            disabled={!canOperate}
            options={FINANCE_STATUSES.map((status) => ({ value: status, label: status }))}
          />
        </div>
        <TextField
          label="Meio de pagamento"
          value={financeForm.meioPagamento}
          onChange={(value) => onChange((current) => ({ ...current, meioPagamento: value }))}
          disabled={!canOperate}
          placeholder="Ex: Pix, boleto, cartão"
        />
        <PrimaryButton type="submit" disabled={!canOperate || savingFinance} loading={savingFinance} icon={Plus}>
          Salvar lançamento
        </PrimaryButton>
      </div>
    </form>
  );
}

function ChargeForm({
  canOperate,
  creatingCharge,
  chargeForm,
  leads,
  budgets,
  availableChargeBudgets,
  onSubmit,
  onChange,
}: {
  canOperate: boolean;
  creatingCharge: boolean;
  chargeForm: {
    leadId: string;
    budgetId: string;
    description: string;
    amount: string;
    dueDate: string;
    billingType: string;
  };
  leads: LeadItem[];
  budgets: BudgetItem[];
  availableChargeBudgets: BudgetItem[];
  onSubmit: (event: FormEvent) => Promise<void>;
  onChange: React.Dispatch<React.SetStateAction<typeof chargeForm>>;
}) {
  const chargeLead = leads.find((item) => item.id === chargeForm.leadId);

  return (
    <form onSubmit={onSubmit} className="rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
      <CardTitle title="Gerar cobrança" subtitle="Crie link de pagamento, PIX ou boleto dentro do tenant." />

      {chargeLead ? (
        <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar label={chargeLead.nome || "Contato"} />
              <div>
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{chargeLead.nome || "Contato"}</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                  {chargeLead.empresa || chargeLead.email || chargeLead.telefone || "Sem contato principal"}
                </p>
              </div>
            </div>
            {chargeLead.pipelineStage || chargeLead.stage ? (
              <StateBadge label={chargeLead.pipelineStage || chargeLead.stage || "captado"} tone="info" />
            ) : null}
          </div>
          {!chargeLead.email ? (
            <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Este contato ainda não tem e-mail. Para gerar cobrança Asaas, preencha o e-mail no CRM.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <SelectField
          label="Contato"
          value={chargeForm.leadId}
          onChange={(nextLeadId) => {
            const lead = leads.find((item) => item.id === nextLeadId);
            onChange((current) => ({
              ...current,
              leadId: nextLeadId,
              budgetId: "",
              description: current.description || lead?.nome || "",
            }));
          }}
          disabled={!canOperate}
          options={[
            { value: "", label: "Selecione um contato" },
            ...leads.map((lead) => ({ value: lead.id, label: `${lead.nome || "Contato"}${lead.empresa ? ` • ${lead.empresa}` : ""}` })),
          ]}
        />
        <SelectField
          label="Proposta vinculada"
          value={chargeForm.budgetId}
          onChange={(nextBudgetId) => {
            const budget = budgets.find((item) => item.id === nextBudgetId);
            onChange((current) => ({
              ...current,
              budgetId: nextBudgetId,
              description: budget?.titulo || current.description,
              amount: budget?.valorTotal ? String(Number(budget.valorTotal)) : current.amount,
              dueDate: budget?.validade || current.dueDate,
            }));
          }}
          disabled={!canOperate || !chargeForm.leadId}
          options={[
            { value: "", label: "Sem proposta vinculada" },
            ...availableChargeBudgets.map((budget) => ({
              value: budget.id,
              label: `${budget.titulo || "Proposta"} • ${money(Number(budget.valorTotal || 0))}`,
            })),
          ]}
        />
        <TextField
          label="Descrição da cobrança"
          value={chargeForm.description}
          onChange={(value) => onChange((current) => ({ ...current, description: value }))}
          disabled={!canOperate}
          placeholder="Descrição da cobrança"
        />
        <div className="grid gap-3 md:grid-cols-3">
          <TextField
            label="Valor"
            value={chargeForm.amount}
            onChange={(value) => onChange((current) => ({ ...current, amount: value }))}
            disabled={!canOperate}
            placeholder="R$ 0,00"
            inputMode="decimal"
          />
          <TextField
            label="Vencimento"
            type="date"
            value={chargeForm.dueDate}
            onChange={(value) => onChange((current) => ({ ...current, dueDate: value }))}
            disabled={!canOperate}
          />
          <SelectField
            label="Pagamento"
            value={chargeForm.billingType}
            onChange={(value) => onChange((current) => ({ ...current, billingType: value }))}
            disabled={!canOperate}
            options={BILLING_TYPES.map((type) => ({ value: type, label: type }))}
          />
        </div>
        <PrimaryButton
          type="submit"
          disabled={!canOperate || creatingCharge || !chargeForm.leadId || !chargeForm.amount || !chargeLead?.email}
          loading={creatingCharge}
          icon={WalletCards}
        >
          Gerar cobrança
        </PrimaryButton>
      </div>
    </form>
  );
}

function ChargeReturnPanel({
  chargePreview,
  copiedChargeKey,
  onCopy,
}: {
  chargePreview: {
    chargeId: string;
    financeId: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    billingType?: string;
    pix?: { encodedImage?: string; payload?: string };
  } | null;
  copiedChargeKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
}) {
  return (
    <div className="rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
      <CardTitle title="Retorno da cobrança" subtitle="Link, boleto ou PIX da última cobrança gerada." />
      {chargePreview ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Charge #{chargePreview.chargeId}</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Financeiro vinculado: {chargePreview.financeId}</p>
              </div>
              <StateBadge label={chargePreview.billingType || "cobrança"} tone="success" />
            </div>

            {chargePreview.invoiceUrl ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <ExternalAction href={chargePreview.invoiceUrl}>Abrir link</ExternalAction>
                <CopyButton copied={copiedChargeKey === "invoice"} onClick={() => void onCopy("invoice", chargePreview.invoiceUrl || "")}>
                  Copiar link
                </CopyButton>
              </div>
            ) : null}

            {chargePreview.bankSlipUrl ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <ExternalAction href={chargePreview.bankSlipUrl}>Abrir boleto</ExternalAction>
              </div>
            ) : null}

            {chargePreview.pix?.encodedImage ? (
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">PIX gerado</p>
                <Image
                  src={`data:image/png;base64,${chargePreview.pix.encodedImage}`}
                  alt="QR Code PIX"
                  width={192}
                  height={192}
                  className="mt-3 h-48 w-48 rounded-2xl border border-[var(--cliente-border)] bg-white p-2"
                  unoptimized
                />
                {chargePreview.pix.payload ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CopyButton copied={copiedChargeKey === "pix"} onClick={() => void onCopy("pix", chargePreview.pix?.payload || "")}>
                      Copiar payload PIX
                    </CopyButton>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState title="Nenhuma cobrança gerada nesta sessão" description="Depois de criar uma cobrança, o retorno com link, boleto ou PIX aparece aqui." />
        </div>
      )}
    </div>
  );
}

function LeadContextPanel({
  selectedLead,
  selectedLeadSummary,
  selectedLeadAiLogs,
  canOperate,
  onApplyAiSuggestion,
}: {
  selectedLead: LeadItem;
  selectedLeadSummary: {
    budgets: number;
    approvedBudgets: number;
    approvedValue: number;
    paidRevenue: number;
    pendingRevenue: number;
  };
  selectedLeadAiLogs: AiSignalLog[];
  canOperate: boolean;
  onApplyAiSuggestion: (log: AiSignalLog) => void;
}) {
  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar label={selectedLead.nome || "Contato"} size="lg" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Contato em foco</p>
            <h3 className="mt-2 truncate text-xl font-semibold text-[var(--cliente-card-text)]">{selectedLead.nome || "Contato"}</h3>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
              {selectedLead.empresa || selectedLead.email || selectedLead.telefone || "Sem contato principal"}
            </p>
          </div>
        </div>
        {selectedLead.pipelineStage || selectedLead.stage ? (
          <StateBadge label={selectedLead.pipelineStage || selectedLead.stage || "captado"} tone="info" />
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniMetric label="Propostas" value={String(selectedLeadSummary.budgets)} />
        <MiniMetric label="Aprovadas" value={String(selectedLeadSummary.approvedBudgets)} />
        <MiniMetric label="Receita paga" value={money(selectedLeadSummary.paidRevenue)} />
        <MiniMetric label="Pendente" value={money(selectedLeadSummary.pendingRevenue)} />
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
        <ActionLink href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`} icon={Mail}>Ir para Inbox</ActionLink>
        <ActionLink href={`/cliente/painel/pipeline?leadId=${encodeURIComponent(selectedLead.id)}`} icon={LayoutDashboard}>Ver pipeline</ActionLink>
        <ActionLink href={`/cliente/painel/crm?leadId=${encodeURIComponent(selectedLead.id)}`} icon={Target}>Abrir CRM</ActionLink>
      </div>

      {selectedLead.email || selectedLead.telefone ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--cliente-card-text-soft)]">
          {selectedLead.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selectedLead.email}</span> : null}
          {selectedLead.telefone ? <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{selectedLead.telefone}</span> : null}
        </div>
      ) : null}

      {selectedLeadAiLogs.length ? (
        <div className="mt-5 rounded-2xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Pulso comercial da IA</p>
          <div className="mt-3 space-y-3">
            {selectedLeadAiLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                <p className="text-sm font-medium text-[var(--cliente-card-text)]">{humanizeAiNextAction(log.nextAction)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(log.extractedFields || {}).slice(0, 4).map(([field, value]) => (
                    <span key={`${log.id}_${field}`} className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                      {field}: {value}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyAiSuggestion(log)}
                    disabled={!canOperate}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50"
                  >
                    Aplicar na proposta
                  </button>
                  {log.nextAction === "agendar_proximo_passo" ? (
                    <Link href={`/cliente/painel/agenda?leadId=${encodeURIComponent(selectedLead.id)}`} className="rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-accent)] transition hover:brightness-95">
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
  );
}

function BusinessProfilePanel({
  allowAdvanced,
  businessProfile,
  playbookPreset,
  canOperate,
  onApplyOffer,
  onEnableAdvanced,
}: {
  allowAdvanced: boolean;
  businessProfile: ReturnType<typeof getBusinessProfile>;
  playbookPreset: ReturnType<typeof getBusinessProfilePlaybookPreset>;
  canOperate: boolean;
  onApplyOffer: (index: number) => void;
  onEnableAdvanced: () => void;
}) {
  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <CardTitle title={`Modo do negócio: ${businessProfile.label}`} subtitle="Ofertas e leitura comercial para este tenant." />
        <StateBadge label={businessProfile.id} tone="info" />
      </div>

      <div className="mt-4 rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
        <p className="text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.description}</p>
        <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Movimento comercial: {businessProfile.commercialMotion}</p>
        <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Métricas naturais: {businessProfile.metrics.join(" · ")}</p>
      </div>

      {allowAdvanced ? (
        <div className="mt-4 space-y-3">
          {playbookPreset.offers.slice(0, 2).map((offer, index) => (
            <div key={offer.title} className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{offer.title}</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{offer.category} · {offer.targetProfile}</p>
                  <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{offer.whenToOffer}</p>
                </div>
                <StateBadge label={money(offer.priceFrom)} tone="success" />
              </div>
              {canOperate ? (
                <button
                  type="button"
                  onClick={() => onApplyOffer(index)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Aplicar na proposta
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <p className="text-sm text-[var(--cliente-card-text-muted)]">
            No modo essencial, a criação avançada fica protegida. Ative o modo completo para usar presets, propostas e cobranças.
          </p>
          <button
            type="button"
            onClick={onEnableAdvanced}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
          >
            Abrir modo completo
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function DeskSummaryPanel({
  summary,
  overdueRevenue,
  budgets,
}: {
  summary: {
    budgets: number;
    approvedBudgets: number;
    approvedValue: number;
    paidRevenue: number;
    pendingRevenue: number;
  };
  overdueRevenue: FinanceItem[];
  budgets: BudgetItem[];
}) {
  return (
    <PanelCard className="p-5 md:p-6">
      <CardTitle title="Resumo da mesa" subtitle="Leitura rápida da operação comercial." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <DeskCard
          title="Valor médio aprovado"
          value={summary.approvedBudgets > 0 ? money(summary.approvedValue / summary.approvedBudgets) : money(0)}
          detail="média por proposta aprovada"
        />
        <DeskCard
          title="Receita em risco"
          value={money(overdueRevenue.reduce((sum, item) => sum + Number(item.valor || 0), 0))}
          detail={`${overdueRevenue.length} vencimento(s) em atraso`}
        />
        <DeskCard
          title="Propostas enviadas"
          value={String(budgets.filter((item) => item.status === "Enviado").length)}
          detail="aguardando decisão do contato"
        />
      </div>
    </PanelCard>
  );
}

function AdvancedLockedPanel({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="rounded-[28px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-5">
      <CardTitle title="Criação avançada protegida" subtitle="No modo essencial deixamos apenas leitura, acompanhamento e atualização de status." />
      <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
        Para criar propostas, lançamentos e cobranças direto daqui, ative o modo completo.
      </p>
      <button
        type="button"
        onClick={onEnable}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
      >
        Ativar modo completo
      </button>
    </div>
  );
}

function ListHeader({ title, subtitle, count }: { title: string; subtitle: string; count: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <CardTitle title={title} subtitle={subtitle} />
      <span className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-1 text-xs font-medium text-[var(--cliente-card-text-soft)]">
        {count} item(ns)
      </span>
    </div>
  );
}

function SearchInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const id = fieldId(label.replace(/\s+/g, "_").toLowerCase());
  return (
    <label htmlFor={id} className="block">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-soft)]" />
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="client-input w-full rounded-xl border px-9 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)]"
        />
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  const id = fieldId(label.replace(/\s+/g, "_").toLowerCase());
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--cliente-card-text-muted)]">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="client-input w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={`${label}_${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const id = fieldId(label.replace(/\s+/g, "_").toLowerCase());
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--cliente-card-text-muted)]">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="client-input w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = fieldId(label.replace(/\s+/g, "_").toLowerCase());
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--cliente-card-text-muted)]">{label}</span>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={4}
        className="client-input w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function PrimaryButton({
  children,
  type,
  disabled,
  loading,
  icon: Icon,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  icon: typeof Plus;
}) {
  return (
    <button
      type={type || "button"}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

function StatusButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)] ${
        active
          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
          : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

function SmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)]"
    >
      {children}
    </Link>
  );
}

function ExternalSmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)]"
    >
      {children}
    </a>
  );
}

function ExternalAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)]"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

function CopyButton({ copied, onClick, children }: { copied: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)]"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copiado" : children}
    </button>
  );
}

function Avatar({ label, size = "md" }: { label: string; size?: "md" | "lg" }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-2xl bg-[var(--cliente-accent)] font-semibold text-white shadow-sm ${
        size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
      }`}
    >
      {initials(label)}
    </div>
  );
}

function ActionLink({ href, icon: Icon, children }: { href: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-between gap-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-accent)]"
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {children}
      </span>
      <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function DeskCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]">
          <CalendarDays className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{title}</p>
          <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{value}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
        </div>
      </div>
    </div>
  );
}
