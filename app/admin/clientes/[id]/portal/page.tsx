"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BUSINESS_PROFILES, getBusinessProfile, normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";
import { getBusinessProfileStarterKit } from "@/lib/business-profile-starter-kit";
import { PLATFORM_BILLING_PLANS, type PlatformBillingPlanId } from "@/lib/platform-billing";
import { TenantEntitlementsCard } from "@/app/admin/clientes/[id]/portal/tenant-entitlements-card";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Rocket,
  Save,
  Send,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

type ContractDoc = {
  title?: string;
  status?: "ativo" | "encerrado" | "suspenso";
  monthlyValue?: number;
  dueDay?: number;
  startDate?: string;
  nextDueDate?: string;
  notes?: string;
  paymentLink?: string;
  autoBillingEnabled?: boolean;
  autoBillingAdvanceDays?: number;
  autoBillingBillingType?: "PIX" | "BOLETO" | "CREDIT_CARD";
  reminderWhatsAppPhones?: string;
  autoSuspendEnabled?: boolean;
  autoSuspendBusinessDays?: number;
  platformPlan?: string;
  platformAccessMode?: "stripe_subscription" | "agency_included" | "manual_release" | "disabled";
  platformAccessStatus?: "active" | "trial" | "blocked" | "pending";
  billingProvider?: "stripe" | "asaas" | "manual" | "included";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeSubscriptionStatus?: string;
  stripeCurrentPeriodEnd?: string;
  stripeCheckoutUrl?: string;
  stripeCustomerPortalUrl?: string;
  billingNotes?: string;
  whatsappCostMonthlyBrl?: number;
  telephonyCostMonthlyBrl?: number;
  otherVariableCostMonthlyBrl?: number;
  aiUsdBrlRate?: number;
};

type BillingOverview = {
  tenantId?: string | null;
  accessStatus?: string | null;
  accessMode?: string | null;
  billingProvider?: string | null;
  autoBillingEnabled?: boolean;
  contractStatus?: string | null;
  openFinanceCount?: number;
  overdueFinanceCount?: number;
  paidFinanceCount?: number;
  latestOpenAmount?: number;
  latestOpenDueDate?: string | null;
  latestOpenStatus?: string | null;
  lastPaidAmount?: number;
  lastPaidAt?: number;
  lastAutoChargeDueDate?: string | null;
  lastAutoChargeFinanceId?: string | null;
  stripeSetup?: {
    enabled: boolean;
    planId: PlatformBillingPlanId;
    planLabel: string;
    planPrice: number | null;
    stripeEnvKey: string | null;
    resolvedPriceId: string | null;
    subscriptionStatus: string | null;
    currentPeriodEnd: string | null;
    customerId: string | null;
    subscriptionId: string | null;
    checkoutUrl: string | null;
    customerPortalUrl: string | null;
    missing: string[];
    nextStep: string;
  } | null;
};

type FinanceBrief = {
  id: string;
  descricao?: string;
  valor?: number;
  status?: "pendente" | "pago" | "atrasado" | "cancelado";
  dueDate?: string | null;
  billingType?: string | null;
  paymentLink?: string | null;
  reminderStatus?: string | null;
};

type PortalUserDoc = {
  id: string;
  email?: string;
  name?: string;
  status?: string;
  role?: string;
};

type TenantSummary = {
  tenantId: string;
  status: string;
  businessProfileId: BusinessProfileId;
  niche: string;
};

type TenantReadinessPayload = {
  integrationHealth?: {
    checkedAt?: string;
    healthy?: number;
    total?: number;
    unavailable?: boolean;
    items?: Array<{
      channelId: string;
      type: string;
      label?: string;
      provider?: string;
      actionHref?: string;
      ok: boolean;
      status: string;
      reason?: string;
    }>;
  };
  settings?: {
    businessProfileId?: BusinessProfileId | string;
    inboxRules?: {
      defaultResponseSlaMinutes?: number;
      mode?: string;
    };
  };
  summary?: {
    activeUsers?: number;
    activeChannels?: number;
    activeForms?: number;
    activeAutomations?: number;
    knowledgeDocs?: number;
    readinessScore?: number;
    pilotReady?: boolean;
  };
  blockers?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  modules?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    status: "ready" | "partial" | "pending";
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
  insights?: Array<{
    id: string;
    title: string;
    description: string;
  }>;
};

function badgeToneClass(tone: "neutral" | "success" | "warning" | "danger" | "info" = "neutral") {
  if (tone === "success") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-red-400/20 bg-red-500/10 text-red-100";
  if (tone === "info") return "border-blue-400/20 bg-blue-500/10 text-blue-100";
  return "border-white/10 bg-white/[0.04] text-white/70";
}

function money(value?: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateLabel(value?: string | number | null) {
  if (!value) return "Nao informado";
  if (typeof value === "number") {
    return new Date(value).toLocaleDateString("pt-BR");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

function financeStatusClass(status?: string | null) {
  if (status === "active") return badgeToneClass("success");
  if (status === "trial") return badgeToneClass("info");
  if (status === "pending") return badgeToneClass("warning");
  if (status === "blocked") return badgeToneClass("danger");
  if (status === "pago") return badgeToneClass("success");
  if (status === "atrasado") return badgeToneClass("danger");
  if (status === "cancelado") return badgeToneClass("neutral");
  return badgeToneClass("warning");
}

export default function ClientePortalAdminPage() {
  const { isAdmin } = useAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params.id;

  const [clientName, setClientName] = useState("");
  const [clientNiche, setClientNiche] = useState("");
  const [tenantSummary, setTenantSummary] = useState<TenantSummary | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<BusinessProfileId>("generic");
  const [loading, setLoading] = useState(true);
  const [savingContract, setSavingContract] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [portalUsers, setPortalUsers] = useState<PortalUserDoc[]>([]);
  const [applyStarterKit, setApplyStarterKit] = useState(true);
  const [readiness, setReadiness] = useState<TenantReadinessPayload | null>(null);
  const [billingOverview, setBillingOverview] = useState<BillingOverview | null>(null);
  const [recentFinance, setRecentFinance] = useState<FinanceBrief[]>([]);
  const [billingAction, setBillingAction] = useState<"release_access" | "block_access" | "send_reminder" | null>(null);
  const [stripeAction, setStripeAction] = useState<"create_checkout" | "open_portal" | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const [contract, setContract] = useState<ContractDoc>({
    title: "Contrato de Prestacao de Servicos",
    status: "ativo",
    monthlyValue: 0,
    dueDay: 10,
    startDate: "",
    nextDueDate: "",
    notes: "",
    paymentLink: "",
    autoBillingEnabled: false,
    autoBillingAdvanceDays: 5,
    autoBillingBillingType: "PIX",
    reminderWhatsAppPhones: "",
    autoSuspendEnabled: true,
    autoSuspendBusinessDays: 2,
    platformPlan: "Operacao",
    platformAccessMode: "manual_release",
    platformAccessStatus: "active",
    billingProvider: "manual",
    stripeCustomerId: "",
    stripeSubscriptionId: "",
    stripePriceId: "",
    stripeSubscriptionStatus: "",
    stripeCurrentPeriodEnd: "",
    stripeCheckoutUrl: "",
    stripeCustomerPortalUrl: "",
    billingNotes: "",
    whatsappCostMonthlyBrl: 0,
    telephonyCostMonthlyBrl: 0,
    otherVariableCostMonthlyBrl: 0,
    aiUsdBrlRate: 5.5,
  });
  const selectedProfile = getBusinessProfile(selectedProfileId);
  const starterKit = useMemo(() => getBusinessProfileStarterKit(selectedProfileId), [selectedProfileId]);
  const readinessScore = Number(readiness?.summary?.readinessScore || 0);
  const pilotReady = readiness?.summary?.pilotReady === true;
  const blockers = readiness?.blockers || [];
  const modules = readiness?.modules || [];
  const readinessInsights = readiness?.insights || [];
  const integrationHealth = readiness?.integrationHealth;
  const integrationHealthItems = integrationHealth?.items || [];
  const onboardingChecklist = useMemo(
    () => [
      {
        id: "tenant",
        title: "Tenant provisionado",
        description: "Cliente ligado ao workspace multi-tenant com perfil operacional definido.",
        done: Boolean(tenantSummary),
      },
      {
        id: "starter_kit",
        title: "Pacote inicial aplicado",
        description: "Pipeline do perfil e automacoes base semeadas para acelerar o piloto.",
        done: Number(readiness?.summary?.activeAutomations || 0) >= starterKit.automations.length,
      },
      {
        id: "portal_user",
        title: "Primeiro usuario convidado",
        description: "Responsavel do cliente com acesso para operar inbox, CRM e comercial.",
        done: portalUsers.length > 0,
      },
      {
        id: "entry",
        title: "Canal ou captacao ativa",
        description: "Pelo menos um canal externo ou formulario pronto para receber demanda real.",
        done:
          Number(readiness?.summary?.activeChannels || 0) > 0 ||
          Number(readiness?.summary?.activeForms || 0) > 0,
      },
      {
        id: "ai",
        title: "IA e conhecimento revisados",
        description: "Base minima para atendimento assistido antes do primeiro lead real.",
        done: Number(readiness?.summary?.knowledgeDocs || 0) > 0,
      },
      {
        id: "pilot",
        title: "Tenant liberado para piloto",
        description: "Readiness suficiente para entrar em go-live controlado.",
        done: pilotReady,
      },
    ],
    [pilotReady, portalUsers.length, readiness?.summary?.activeAutomations, readiness?.summary?.activeChannels, readiness?.summary?.activeForms, readiness?.summary?.knowledgeDocs, starterKit.automations.length, tenantSummary]
  );

  useEffect(() => {
    if (!isAdmin) {
      router.push("/admin/clientes");
    }
  }, [isAdmin, router]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, usersRes, contractRes] = await Promise.all([
        authedFetch(`/api/admin/clientes/${encodeURIComponent(clientId)}/summary`),
        authedFetch(`/api/admin/client-portal/users/list?clientId=${encodeURIComponent(clientId)}`),
        authedFetch(`/api/admin/client-portal/contracts/get?clientId=${encodeURIComponent(clientId)}`),
      ]);

      const summaryData = (await summaryRes.json()) as {
        client?: { name?: string; niche?: string };
        tenant?: {
          id: string;
          status?: string;
          niche?: string;
          businessProfileId?: string;
          settings?: { niche?: string; businessProfileId?: string } | null;
        } | null;
        error?: string;
      };
      if (!summaryRes.ok || !summaryData.client) {
        throw new Error(summaryData.error || "Falha ao carregar cliente.");
      }
      const clientData = summaryData.client;
      setClientName(clientData.name || "Cliente");
      setClientNiche(clientData.niche || "Nao informado");

      const usersData = (await usersRes.json()) as { items?: PortalUserDoc[]; error?: string };
      const contractData = (await contractRes.json()) as {
        contract?: ContractDoc | null;
        billingOverview?: BillingOverview | null;
        recentFinance?: FinanceBrief[];
        error?: string;
      };
      const loadWarnings: string[] = [];
      if (!usersRes.ok) {
        loadWarnings.push(usersData.error || "Falha ao carregar acessos.");
        setPortalUsers([]);
      } else {
        setPortalUsers(usersData.items || []);
      }

      if (!contractRes.ok) {
        loadWarnings.push(contractData.error || "Falha ao carregar contrato.");
        setBillingOverview(null);
        setRecentFinance([]);
        setBillingNotice(null);
      }

      if (summaryData.tenant) {
        const tenantData = summaryData.tenant;
        const tenantSettings = tenantData.settings;
        const nextProfileId = normalizeBusinessProfileId(
          tenantSettings?.businessProfileId || tenantData.businessProfileId
        );
        setTenantSummary({
          tenantId: tenantData.id,
          status: String(tenantData.status || "active"),
          businessProfileId: nextProfileId,
          niche: String(tenantSettings?.niche || tenantData.niche || clientData.niche || "Nao informado"),
        });
        setSelectedProfileId(nextProfileId);
        setApplyStarterKit(false);

        const readinessRes = await authedFetch(`/api/admin/tenants/${tenantData.id}/readiness`);
        const readinessData = (await readinessRes.json()) as TenantReadinessPayload & { error?: string };
        if (!readinessRes.ok) {
          loadWarnings.push(readinessData.error || "Falha ao carregar onboarding do tenant.");
          setReadiness(null);
        } else {
          setReadiness(readinessData);
        }
      } else {
        setTenantSummary(null);
        setSelectedProfileId("generic");
        setApplyStarterKit(true);
        setReadiness(null);
      }

      if (loadWarnings.length > 0) {
        setError(loadWarnings.join(" "));
      }

      if (contractRes.ok && contractData.contract) {
        setBillingOverview(contractData.billingOverview || null);
        setRecentFinance(contractData.recentFinance || []);
        setContract({
          title: contractData.contract.title || "Contrato de Prestacao de Servicos",
          status: contractData.contract.status || "ativo",
          monthlyValue: Number(contractData.contract.monthlyValue || 0),
          dueDay: Number(contractData.contract.dueDay || 10),
          startDate: contractData.contract.startDate || "",
          nextDueDate: contractData.contract.nextDueDate || "",
          notes: contractData.contract.notes || "",
          paymentLink: contractData.contract.paymentLink || "",
          autoBillingEnabled: contractData.contract.autoBillingEnabled === true,
          autoBillingAdvanceDays: Number(contractData.contract.autoBillingAdvanceDays || 5),
          autoBillingBillingType:
            contractData.contract.autoBillingBillingType === "BOLETO" ||
            contractData.contract.autoBillingBillingType === "CREDIT_CARD"
              ? contractData.contract.autoBillingBillingType
              : "PIX",
          reminderWhatsAppPhones: Array.isArray(contractData.contract.reminderWhatsAppPhones)
            ? contractData.contract.reminderWhatsAppPhones.join("\n")
            : "",
          autoSuspendEnabled: contractData.contract.autoSuspendEnabled !== false,
          autoSuspendBusinessDays: Number(contractData.contract.autoSuspendBusinessDays || 2),
          platformPlan: contractData.contract.platformPlan || "Operacao",
          platformAccessMode: contractData.contract.platformAccessMode || "manual_release",
          platformAccessStatus: contractData.contract.platformAccessStatus || "active",
          billingProvider: contractData.contract.billingProvider || "manual",
          stripeCustomerId: contractData.contract.stripeCustomerId || "",
          stripeSubscriptionId: contractData.contract.stripeSubscriptionId || "",
          stripePriceId: contractData.contract.stripePriceId || "",
          stripeSubscriptionStatus: contractData.contract.stripeSubscriptionStatus || "",
          stripeCurrentPeriodEnd: contractData.contract.stripeCurrentPeriodEnd || "",
          stripeCheckoutUrl: contractData.contract.stripeCheckoutUrl || "",
          stripeCustomerPortalUrl: contractData.contract.stripeCustomerPortalUrl || "",
          billingNotes: contractData.contract.billingNotes || "",
          whatsappCostMonthlyBrl: Number(contractData.contract.whatsappCostMonthlyBrl || 0),
          telephonyCostMonthlyBrl: Number(contractData.contract.telephonyCostMonthlyBrl || 0),
          otherVariableCostMonthlyBrl: Number(contractData.contract.otherVariableCostMonthlyBrl || 0),
          aiUsdBrlRate: Number(contractData.contract.aiUsdBrlRate || 5.5),
        });
      } else if (contractRes.ok) {
        setBillingOverview(contractData.billingOverview || null);
        setRecentFinance(contractData.recentFinance || []);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao carregar portal do cliente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function invitePortalUser(e: FormEvent) {
    e.preventDefault();
    if (!tenantSummary?.tenantId) {
      setError("Provisione o tenant antes de convidar o primeiro usuario do cliente.");
      return;
    }
    setInviting(true);
    setError(null);
    setInviteLink("");
    try {
      const res = await authedFetch(`/api/admin/tenants/${tenantSummary.tenantId}/users/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          name: inviteName.trim(),
          role: "client_admin",
        }),
      });
      const data = (await res.json()) as { inviteLink?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao convidar usuario.");

      setInviteLink(data.inviteLink || "");
      setInviteEmail("");
      setInviteName("");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao convidar usuario.");
    } finally {
      setInviting(false);
    }
  }

  async function saveContract(e: FormEvent) {
    e.preventDefault();
    setSavingContract(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/client-portal/contracts/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          ...contract,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao salvar contrato.");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao salvar contrato.");
    } finally {
      setSavingContract(false);
    }
  }

  async function runBillingAction(action: "release_access" | "block_access" | "send_reminder") {
    setBillingAction(action);
    setError(null);
    setBillingNotice(null);
    try {
      const res = await authedFetch("/api/admin/client-portal/contracts/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          tenantId: tenantSummary?.tenantId || billingOverview?.tenantId || "",
          action,
          note: contract.billingNotes || contract.notes || "",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reminderStatus?: string;
        reminderSent?: number;
        reminderFailed?: number;
      };
      if (!res.ok) throw new Error(data.error || "Falha ao executar acao de billing.");

      if (action === "send_reminder") {
        setBillingNotice(
          `Lembrete executado. Status: ${data.reminderStatus || "processado"}. Enviados: ${Number(
            data.reminderSent || 0
          )}. Falhas: ${Number(data.reminderFailed || 0)}.`
        );
      } else if (action === "release_access") {
        setBillingNotice("Acesso do tenant liberado manualmente pelo admin.");
      } else {
        setBillingNotice("Acesso do tenant bloqueado manualmente pelo admin.");
      }

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao executar acao de billing.");
    } finally {
      setBillingAction(null);
    }
  }

  async function runStripeAction(action: "create_checkout" | "open_portal") {
    setStripeAction(action);
    setError(null);
    setBillingNotice(null);
    try {
      const res = await authedFetch("/api/admin/client-portal/contracts/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          tenantId: tenantSummary?.tenantId || billingOverview?.tenantId || "",
          action,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        checkoutUrl?: string;
        portalUrl?: string;
      };

      if (!res.ok) throw new Error(data.error || "Falha ao executar acao Stripe.");

      const destinationUrl = data.checkoutUrl || data.portalUrl || "";
      if (destinationUrl) {
        window.open(destinationUrl, "_blank", "noopener,noreferrer");
      }

      setBillingNotice(
        action === "create_checkout"
          ? "Checkout Stripe gerado e aberto em nova aba."
          : "Portal Stripe do cliente aberto em nova aba."
      );
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao executar acao Stripe.");
    } finally {
      setStripeAction(null);
    }
  }

  async function saveProvisioning(e: FormEvent) {
    e.preventDefault();
    setProvisioning(true);
    setError(null);
    try {
      if (!tenantSummary) {
        const res = await authedFetch("/api/admin/tenants/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientName || "Cliente",
            niche: clientNiche || "Nao informado",
            legacyClientId: clientId,
            businessProfileId: selectedProfileId,
            applyStarterKit,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Falha ao provisionar tenant.");
      } else {
        const res = await authedFetch(`/api/admin/tenants/${tenantSummary.tenantId}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessProfileId: selectedProfileId,
            niche: clientNiche || tenantSummary.niche || "Nao informado",
            applyStarterKit,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Falha ao atualizar modo operacional.");
      }

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao salvar provisionamento.");
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href={`/admin/clientes/${clientId}`}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao cliente
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Portal do Cliente</h1>
          <p className="text-sm text-white/60">
            Configuracao de acesso e contrato do cliente: {clientName || "..." }
          </p>
        </div>
        {tenantSummary ? (
          <Link
            href={`/cliente/painel?tenantId=${encodeURIComponent(tenantSummary.tenantId)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-100 transition hover:bg-blue-500/20"
          >
            <Rocket className="h-4 w-4" />
            Abrir painel como ALTUM
          </Link>
        ) : null}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-white/60 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando portal...
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={saveProvisioning} className="rounded-2xl border border-blue-500/20 bg-blue-950/10 p-4 space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-100">
                  Provisionamento operacional do portal
                </h2>
                <p className="mt-1 text-sm text-white/65">
                  Conecte o cliente ao tenant certo e defina o modo operacional que vai orientar IA, CRM, pipeline e captacao.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white/55">
                {tenantSummary ? `Tenant ${tenantSummary.tenantId}` : "Tenant pendente"}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                <label className="block text-xs uppercase tracking-[0.16em] text-white/45">
                  Modo do negocio
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(normalizeBusinessProfileId(e.target.value))}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                  >
                    {Object.values(BUSINESS_PROFILES).map((profile) => (
                      <option key={profile.id} value={profile.id} className="bg-[#111111] text-white">
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-sm font-medium text-white">{selectedProfile.label}</p>
                  <p className="mt-2 text-xs text-white/55">{selectedProfile.description}</p>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-white/40">Movimento comercial</p>
                  <p className="mt-1 text-sm text-white/78">{selectedProfile.commercialMotion}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedProfile.metrics.slice(0, 4).map((metric) => (
                    <span key={metric} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                      {metric}
                    </span>
                  ))}
                </div>

                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <input
                    type="checkbox"
                    checked={applyStarterKit}
                    onChange={(event) => setApplyStarterKit(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/15 bg-black/50"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {tenantSummary ? "Reaplicar pacote inicial deste modo" : "Aplicar pacote inicial automaticamente"}
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                      Semear pipeline do perfil, {starterKit.automations.length} automacoes base e metadados do starter kit para acelerar o go-live.
                    </p>
                  </div>
                </label>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Estado atual</p>
                  <p className="mt-1 text-sm text-white/84">
                    {tenantSummary
                      ? `Tenant ativo com modo ${getBusinessProfile(tenantSummary.businessProfileId).label}.`
                      : "Cliente ainda sem tenant provisionado para o portal multi-tenant."}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Campos criticos do CRM</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedProfile.crm.leadFields.slice(0, 6).map((field) => (
                      <span key={field} className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                        {field}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Pacote inicial deste modo</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {starterKit.pipelineStages.slice(0, 4).map((stage) => (
                      <span key={stage.id} className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                        {stage.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2">
                    {starterKit.automations.slice(0, 5).map((automation) => (
                      <div key={automation.key} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <p className="text-sm text-white/88">{automation.name}</p>
                        <p className="mt-1 text-xs text-white/50">{automation.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={provisioning}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                >
                  {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {tenantSummary ? "Salvar modo operacional" : "Provisionar tenant com este modo"}
                </button>
              </div>
            </div>
          </form>

          {tenantSummary ? (
            <TenantEntitlementsCard
              tenantId={tenantSummary.tenantId}
              tenantName={clientName || "Cliente"}
              monthlyValue={contract.monthlyValue || 0}
              whatsappCostMonthlyBrl={contract.whatsappCostMonthlyBrl || 0}
              telephonyCostMonthlyBrl={contract.telephonyCostMonthlyBrl || 0}
              otherVariableCostMonthlyBrl={contract.otherVariableCostMonthlyBrl || 0}
              aiUsdBrlRate={contract.aiUsdBrlRate || 5.5}
            />
          ) : null}

        {tenantSummary && (
          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-white/72">
                    Onboarding do cliente
                  </h2>
                  <p className="mt-1 text-sm text-white/58">
                    O que falta fechar para este tenant entrar em piloto controlado sem depender de memoria operacional.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${pilotReady ? badgeToneClass("success") : badgeToneClass("warning")}`}>
                    {pilotReady ? "piloto liberado" : `${blockers.length} pendencias`}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${badgeToneClass("info")}`}>
                    prontidao {readinessScore}%
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center gap-2 text-white/82">
                    <Rocket className="h-4 w-4 text-blue-200" />
                    <p className="text-xs uppercase tracking-[0.16em]">Go-live</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-white">{readinessScore}%</p>
                  <p className="mt-2 text-xs text-white/52">score de prontidao atual</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center gap-2 text-white/82">
                    <TriangleAlert className="h-4 w-4 text-amber-200" />
                    <p className="text-xs uppercase tracking-[0.16em]">Bloqueios</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-white">{blockers.length}</p>
                  <p className="mt-2 text-xs text-white/52">itens antes do piloto</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center gap-2 text-white/82">
                    <ShieldCheck className="h-4 w-4 text-emerald-200" />
                    <p className="text-xs uppercase tracking-[0.16em]">Automacoes</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {Number(readiness?.summary?.activeAutomations || 0)}
                  </p>
                  <p className="mt-2 text-xs text-white/52">playbooks ativos no tenant</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center gap-2 text-white/82">
                    <UserPlus className="h-4 w-4 text-blue-200" />
                    <p className="text-xs uppercase tracking-[0.16em]">Acessos</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-white">{portalUsers.length}</p>
                  <p className="mt-2 text-xs text-white/52">usuarios convidados</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Checklist do onboarding</p>
                  {onboardingChecklist.map((item, index) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 ${
                        item.done
                          ? "border-emerald-400/18 bg-emerald-500/10"
                          : "border-white/10 bg-black/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {item.done ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-200" />
                          ) : (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[10px] text-white/55">
                              {index + 1}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                          <p className="mt-2 text-sm text-white/56">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Bloqueios e atalhos</p>
                  {blockers.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                      Sem bloqueios criticos. Esse tenant ja pode entrar em piloto controlado.
                    </div>
                  ) : (
                    blockers.slice(0, 6).map((blocker) => (
                      <Link
                        key={blocker.id}
                        href={blocker.href}
                        className="block rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:bg-white/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{blocker.title}</p>
                            <p className="mt-2 text-sm text-white/56">{blocker.description}</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${badgeToneClass(blocker.tone)}`}>
                            {blocker.badge}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-white/72">
                      Saude das integracoes
                    </h2>
                    <p className="mt-1 text-sm text-white/58">
                      Validacao real dos canais e lojas usados na operacao deste cliente.
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${badgeToneClass(
                    integrationHealth?.unavailable
                      ? "warning"
                      : Number(integrationHealth?.total || 0) > 0 && Number(integrationHealth?.healthy || 0) === Number(integrationHealth?.total || 0)
                        ? "success"
                        : "warning"
                  )}`}>
                    {integrationHealth?.unavailable
                      ? "verificacao indisponivel"
                      : `${Number(integrationHealth?.healthy || 0)}/${Number(integrationHealth?.total || 0)} saudaveis`}
                  </span>
                </div>

                {integrationHealthItems.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/55">
                    Nenhum canal ou ecommerce configurado para validar.
                  </div>
                ) : (
                  integrationHealthItems.slice(0, 8).map((item) => (
                    <Link
                      key={`${item.type}:${item.channelId}`}
                      href={item.actionHref || "/cliente/painel/configuracoes/canais"}
                      className="block rounded-2xl border border-white/10 bg-black/30 p-4 transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.label || item.provider || item.type}</p>
                          <p className="mt-1 text-xs text-white/48">{item.provider || item.type}</p>
                          <p className="mt-2 text-sm text-white/58">{item.reason || (item.ok ? "Conexao pronta para operar." : "Conexao precisa de atencao.")}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${badgeToneClass(item.ok ? "success" : "warning")}`}>
                          {item.ok ? "operando" : "revisar"}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
                {integrationHealth?.checkedAt ? (
                  <p className="text-[11px] text-white/38">Ultima verificacao: {formatDateLabel(integrationHealth.checkedAt)}</p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-white/72">
                    Leituras do tenant
                  </h2>
                  <p className="mt-1 text-sm text-white/58">
                    Resumo operacional para a ALTUM saber se o cliente esta pronto para operar no dia 1.
                  </p>
                </div>
                {readinessInsights.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/55">
                    Ainda sem leituras suficientes.
                  </div>
                ) : (
                  readinessInsights.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-2 text-sm text-white/56">{item.description}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-white/72">
                    Mapa dos modulos
                  </h2>
                  <p className="mt-1 text-sm text-white/58">
                    Onde o tenant ja esta pronto e onde ainda existe fechamento operacional.
                  </p>
                </div>
                <div className="space-y-2">
                  {modules.slice(0, 6).map((moduleItem) => (
                    <Link
                      key={moduleItem.id}
                      href={moduleItem.href}
                      className="block rounded-2xl border border-white/10 bg-black/30 p-3 transition hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{moduleItem.title}</p>
                          <p className="mt-1 text-xs text-white/54">{moduleItem.description}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${badgeToneClass(moduleItem.tone)}`}>
                          {moduleItem.badge}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={invitePortalUser} className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-blue-300" />
              Convidar usuario do cliente
            </h2>

            <p className="text-sm text-white/55">
              O primeiro convite sai como <span className="font-medium text-white">client_admin</span>, para o cliente conseguir editar empresa, canais, operacao e usuarios sem depender da ALTUM.
            </p>

            {!tenantSummary ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Provisione o tenant antes de gerar o primeiro convite.
              </div>
            ) : null}

            <input
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Nome do usuario cliente"
            />
            <input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="email@cliente.com"
            />

            <button
              type="submit"
              disabled={inviting || !tenantSummary}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Gerar convite
            </button>

            {inviteLink && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                <p className="text-xs text-emerald-100 mb-1">Link de ativacao:</p>
                <textarea
                  readOnly
                  value={inviteLink}
                  className="w-full h-24 rounded border border-emerald-500/30 bg-black/40 p-2 text-xs text-emerald-100"
                />
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-white/45">Acessos ativos</p>
              {portalUsers.length === 0 ? (
                <p className="text-sm text-white/55">Nenhum usuario convidado.</p>
              ) : (
                portalUsers.map((portalUser) => (
                  <div key={portalUser.id} className="rounded-lg border border-white/10 bg-black/40 p-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-white/90">{portalUser.name || "Usuario"}</p>
                      <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-blue-100">
                        {String(portalUser.role || "client_viewer").replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-xs text-white/55">
                      {portalUser.email || "-"} - {portalUser.status || "active"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </form>

          <form onSubmit={saveContract} className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Contrato do portal
            </h2>

            <p className="text-sm text-white/55">
              Aqui o admin define como a plataforma entra na conta do cliente: assinatura propria, acesso incluso pela agencia ou liberacao manual com total governanca da Altum.
            </p>

            {billingNotice ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {billingNotice}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Acesso atual</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${financeStatusClass(billingOverview?.accessStatus || contract.platformAccessStatus || "active")}`}>
                    {billingOverview?.accessStatus || contract.platformAccessStatus || "active"}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${badgeToneClass("info")}`}>
                    {contract.platformAccessMode || billingOverview?.accessMode || "manual_release"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-white/55">
                  Provider: {contract.billingProvider || billingOverview?.billingProvider || "manual"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Financeiro aberto</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {Number(billingOverview?.openFinanceCount || 0)}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  {Number(billingOverview?.overdueFinanceCount || 0)} em atraso
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Proximo vencimento</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {formatDateLabel(billingOverview?.latestOpenDueDate || contract.nextDueDate || null)}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  {money(billingOverview?.latestOpenAmount || contract.monthlyValue || 0)}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Ultimo pago</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {billingOverview?.lastPaidAt ? formatDateLabel(billingOverview.lastPaidAt) : "Sem confirmacao"}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  {money(billingOverview?.lastPaidAmount || 0)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runBillingAction("send_reminder")}
                disabled={billingAction !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 disabled:opacity-60"
              >
                {billingAction === "send_reminder" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar lembrete agora
              </button>
              <button
                type="button"
                onClick={() => void runBillingAction("release_access")}
                disabled={billingAction !== null || !tenantSummary?.tenantId}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
              >
                {billingAction === "release_access" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Liberar acesso
              </button>
              <button
                type="button"
                onClick={() => void runBillingAction("block_access")}
                disabled={billingAction !== null || !tenantSummary?.tenantId}
                className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:opacity-60"
              >
                {billingAction === "block_access" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TriangleAlert className="h-4 w-4" />}
                Bloquear acesso
              </button>
              <button
                type="button"
                onClick={() => void runStripeAction("create_checkout")}
                disabled={stripeAction !== null || !billingOverview?.stripeSetup?.resolvedPriceId}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/20 disabled:opacity-60"
              >
                {stripeAction === "create_checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Gerar checkout Stripe
              </button>
              <button
                type="button"
                onClick={() => void runStripeAction("open_portal")}
                disabled={stripeAction !== null || !contract.stripeCustomerId}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/[0.08] disabled:opacity-60"
              >
                {stripeAction === "open_portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Abrir portal Stripe
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Ultimos lancamentos</p>
              {recentFinance.length === 0 ? (
                <p className="text-sm text-white/55">Sem lancamentos recentes vinculados ao contrato.</p>
              ) : (
                recentFinance.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{item.descricao || "Lancamento"}</p>
                        <p className="mt-1 text-xs text-white/55">
                          {formatDateLabel(item.dueDate || null)} - {money(item.valor || 0)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${financeStatusClass(item.status || "pendente")}`}>
                        {item.status || "pendente"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Prontidao Stripe</p>
                  <p className="mt-1 text-sm text-white/55">
                    Estrutura preparada para assinatura da plataforma sem ativar cobranca real ainda.
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${billingOverview?.stripeSetup?.enabled ? financeStatusClass(billingOverview?.stripeSetup?.missing.length ? "pending" : "active") : badgeToneClass("neutral")}`}>
                  {billingOverview?.stripeSetup?.enabled ? "trilho ativo" : "nao ativo"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Plano mapeado</p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {billingOverview?.stripeSetup?.planLabel || "Nao definido"}
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    {billingOverview?.stripeSetup?.planPrice
                      ? money(billingOverview.stripeSetup.planPrice)
                      : "Sob diagnostico"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Price ID do ambiente</p>
                  <p className="mt-2 text-xs font-mono text-white/82 break-all">
                    {billingOverview?.stripeSetup?.resolvedPriceId || "Nao encontrado"}
                  </p>
                  <p className="mt-1 text-[11px] text-white/45">
                    {billingOverview?.stripeSetup?.stripeEnvKey || "Sem env padrao"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Proximo passo</p>
                <p className="mt-2 text-sm text-white/78">
                  {billingOverview?.stripeSetup?.nextStep || "Defina provider e plano para preparar a assinatura."}
                </p>
                {billingOverview?.stripeSetup?.missing?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {billingOverview.stripeSetup.missing.map((item) => (
                      <span key={item} className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${badgeToneClass("warning")}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {contract.stripeCheckoutUrl || contract.stripeCustomerPortalUrl ? (
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={contract.stripeCheckoutUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80 hover:bg-white/[0.05]"
                  >
                    Ultimo checkout Stripe
                  </a>
                  <a
                    href={contract.stripeCustomerPortalUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80 hover:bg-white/[0.05]"
                  >
                    Ultimo portal do cliente
                  </a>
                </div>
              ) : null}
            </div>

            <input
              value={contract.title || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Titulo do contrato"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                value={contract.status || "ativo"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    status: e.target.value as ContractDoc["status"],
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="encerrado">Encerrado</option>
              </select>
              <input
                type="number"
                min={0}
                value={contract.monthlyValue || 0}
                onChange={(e) => setContract((prev) => ({ ...prev, monthlyValue: Number(e.target.value || 0) }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Valor mensal"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                min={1}
                max={31}
                value={contract.dueDay || 10}
                onChange={(e) => setContract((prev) => ({ ...prev, dueDay: Number(e.target.value || 10) }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Dia venc."
              />
              <input
                type="date"
                value={contract.startDate || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, startDate: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <input
                type="date"
                value={contract.nextDueDate || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, nextDueDate: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">Custos mensais conhecidos</p>
              <p className="mt-1 text-xs leading-5 text-white/55">Registre faturas externas para acompanhar a margem real desta conta. O custo de IA é medido automaticamente em dólar.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-white/60">
                  WhatsApp / Meta (R$)
                  <input type="number" min={0} step="0.01" value={contract.whatsappCostMonthlyBrl || 0} onChange={(e) => setContract((prev) => ({ ...prev, whatsappCostMonthlyBrl: Number(e.target.value || 0) }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label className="text-xs text-white/60">
                  Telefonia (R$)
                  <input type="number" min={0} step="0.01" value={contract.telephonyCostMonthlyBrl || 0} onChange={(e) => setContract((prev) => ({ ...prev, telephonyCostMonthlyBrl: Number(e.target.value || 0) }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label className="text-xs text-white/60">
                  Outros custos (R$)
                  <input type="number" min={0} step="0.01" value={contract.otherVariableCostMonthlyBrl || 0} onChange={(e) => setContract((prev) => ({ ...prev, otherVariableCostMonthlyBrl: Number(e.target.value || 0) }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" />
                </label>
                <label className="text-xs text-white/60">
                  Cotação USD/BRL
                  <input type="number" min={0} step="0.0001" value={contract.aiUsdBrlRate || 5.5} onChange={(e) => setContract((prev) => ({ ...prev, aiUsdBrlRate: Number(e.target.value || 0) }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none" />
                </label>
              </div>
            </div>

            <input
              value={contract.paymentLink || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, paymentLink: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Link de pagamento"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                value={contract.platformPlan || "operacao"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    platformPlan: e.target.value,
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                {PLATFORM_BILLING_PLANS.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.label}
                  </option>
                ))}
              </select>
              <select
                value={contract.billingProvider || "manual"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    billingProvider: e.target.value as ContractDoc["billingProvider"],
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="manual">Manual</option>
                <option value="stripe">Stripe</option>
                <option value="asaas">Asaas</option>
                <option value="included">Incluso na agencia</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <select
                value={contract.platformAccessMode || "manual_release"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    platformAccessMode: e.target.value as ContractDoc["platformAccessMode"],
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="manual_release">Liberacao manual</option>
                <option value="stripe_subscription">Assinatura da plataforma</option>
                <option value="agency_included">Incluso no contrato da agencia</option>
                <option value="disabled">Sem acesso</option>
              </select>
              <select
                value={contract.platformAccessStatus || "active"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    platformAccessStatus: e.target.value as ContractDoc["platformAccessStatus"],
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="active">Acesso ativo</option>
                <option value="trial">Trial</option>
                <option value="pending">Pendente</option>
                <option value="blocked">Bloqueado</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                value={contract.stripeCustomerId || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripeCustomerId: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Stripe customer ID"
              />
              <input
                value={contract.stripeSubscriptionId || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripeSubscriptionId: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Stripe subscription ID"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                value={contract.stripePriceId || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripePriceId: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Stripe price ID"
              />
              <input
                value={contract.stripeSubscriptionStatus || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripeSubscriptionStatus: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Status da subscription"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <input
                type="date"
                value={contract.stripeCurrentPeriodEnd || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripeCurrentPeriodEnd: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <input
                value={contract.stripeCheckoutUrl || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripeCheckoutUrl: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="URL de checkout Stripe"
              />
              <input
                value={contract.stripeCustomerPortalUrl || ""}
                onChange={(e) => setContract((prev) => ({ ...prev, stripeCustomerPortalUrl: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="URL do portal do cliente"
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <input
                type="checkbox"
                checked={contract.autoBillingEnabled === true}
                onChange={(e) => setContract((prev) => ({ ...prev, autoBillingEnabled: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40"
              />
              <div>
                <p className="text-sm text-white/90">Ativar cobranca automatica recorrente</p>
                <p className="mt-1 text-xs text-white/55">
                  Gera cobranca automaticamente no Asaas com antecedencia configurada antes do vencimento.
                </p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min={1}
                max={15}
                value={contract.autoBillingAdvanceDays || 5}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    autoBillingAdvanceDays: Number(e.target.value || 5),
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                placeholder="Antecedencia (dias)"
              />
              <select
                value={contract.autoBillingBillingType || "PIX"}
                onChange={(e) =>
                  setContract((prev) => ({
                    ...prev,
                    autoBillingBillingType: e.target.value as ContractDoc["autoBillingBillingType"],
                  }))
                }
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDIT_CARD">Cartao</option>
              </select>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <input
                type="checkbox"
                checked={contract.autoSuspendEnabled !== false}
                onChange={(e) => setContract((prev) => ({ ...prev, autoSuspendEnabled: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-black/40"
              />
              <div>
                <p className="text-sm text-white/90">Bloquear acesso automaticamente se atrasar</p>
                <p className="mt-1 text-xs text-white/55">
                  Pausa o painel do cliente e a IA depois do prazo, sem apagar nenhum dado.
                </p>
              </div>
            </label>

            <input
              type="number"
              min={1}
              max={10}
              value={contract.autoSuspendBusinessDays || 2}
              onChange={(e) =>
                setContract((prev) => ({
                  ...prev,
                  autoSuspendBusinessDays: Number(e.target.value || 2),
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Bloquear apos quantos dias uteis de atraso"
            />

            <textarea
              value={contract.reminderWhatsAppPhones || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, reminderWhatsAppPhones: e.target.value }))}
              className="w-full h-20 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="WhatsApps para aviso de cobranca (um por linha, ex: 5511999999999)"
            />

            <textarea
              value={contract.notes || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full h-24 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Observacoes do contrato"
            />

            <textarea
              value={contract.billingNotes || ""}
              onChange={(e) => setContract((prev) => ({ ...prev, billingNotes: e.target.value }))}
              className="w-full h-24 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              placeholder="Notas internas de billing, liberacao manual, combinados com agencia ou observacoes para a operacao."
            />

            <button
              type="submit"
              disabled={savingContract}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
            >
              {savingContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar contrato
            </button>
          </form>
        </div>
        </div>
      )}
    </div>
  );
}
