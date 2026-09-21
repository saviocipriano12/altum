"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authedFetch } from "@/app/lib/authed-fetch";
import { getBusinessProfile, normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";
import type {
  AgencyActivity,
  AgencyClient,
  AgencyProject,
  FinanceTransaction,
  TimestampLike,
} from "@/app/types/domain";
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe2,
  Calendar,
  BadgeCheck,
  Loader2,
  FileText,
  Zap,
  Briefcase,
  Receipt,
  Wallet,
  Clock3,
  ArrowRight,
} from "lucide-react";

type ClientBudget = {
  id: string;
  title?: string;
  titulo?: string;
  status?: string;
  valorTotal?: number;
  projectTitle?: string | null;
  createdAt?: TimestampLike | number | null;
};

type ClientFinance = FinanceTransaction & {
  clientId?: string;
  clientName?: string;
  projectTitle?: string | null;
};

type ClientActivity = AgencyActivity & {
  data?: string | null;
};

type ClientTenantSummary = {
  tenantId: string;
  status: string;
  businessProfileId: BusinessProfileId;
  niche: string;
};

function toDate(value?: TimestampLike | number | string | null): Date | null {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function formatDateTime(value?: TimestampLike | number | string | null) {
  const date = toDate(value);
  if (!date) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value?: TimestampLike | number | string | null) {
  const date = toDate(value);
  if (!date) return null;
  return date.toLocaleDateString("pt-BR");
}

function asMoney(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function sortByCreatedAtDesc<T extends { createdAt?: TimestampLike | number | null }>(
  items: T[]
) {
  return [...items].sort((a, b) => {
    const aMs = toDate(a.createdAt)?.getTime() ?? 0;
    const bMs = toDate(b.createdAt)?.getTime() ?? 0;
    return bMs - aMs;
  });
}

function statusChip(clientStatus?: string) {
  const raw = (clientStatus || "").toLowerCase();
  if (raw.includes("ativo")) {
    return "bg-emerald-500/10 text-emerald-700 border border-emerald-500/40";
  }
  if (raw.includes("implanta")) {
    return "bg-amber-500/10 text-amber-700 border border-amber-500/40";
  }
  return "bg-blue-500/10 text-blue-700 border border-blue-500/40";
}

export default function ClienteDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<AgencyClient | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const [projects, setProjects] = useState<AgencyProject[]>([]);
  const [budgets, setBudgets] = useState<ClientBudget[]>([]);
  const [transactions, setTransactions] = useState<ClientFinance[]>([]);
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [tenantSummary, setTenantSummary] = useState<ClientTenantSummary | null>(null);

  /*
  useEffect(() => {
    async function fetchClient() {
      try {
        const ref = doc(db, "clientes", params.id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setClient(null);
          return;
        }

        const data = snap.data() as Partial<AgencyClient>;
        setClient({
          id: snap.id,
          name: data.name || "Cliente",
          niche: data.niche || "",
          city: data.city || "",
          status: data.status,
          contactName: data.contactName || "",
          email: data.email || "",
          phone: data.phone || "",
          site: data.site || "",
          services: Array.isArray(data.services) ? data.services : [],
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        });
      } catch (error) {
        console.error("Erro ao buscar cliente:", error);
        setClient(null);
      } finally {
        setLoadingClient(false);
      }
    }

    void fetchClient();
  }, [params.id]);

  useEffect(() => {
    if (!client) return;
    const currentClient = client;

    async function fetchRelatedData() {
      setLoadingRelated(true);
      try {
        const projectsQuery = query(
          collection(db, "projetos"),
          where("clientId", "==", currentClient.id)
        );
        const budgetsQuery = query(
          collection(db, "orcamentos"),
          where("clientId", "==", currentClient.id)
        );
        const financeByIdQuery = query(
          collection(db, "financeiro"),
          where("clientId", "==", currentClient.id),
          limit(20)
        );
        const activitiesByNameQuery = query(
          collection(db, "atividades"),
          where("clienteNome", "==", currentClient.name),
          limit(20)
        );
        const tenantByLegacyClientQuery = query(
          collection(db, "tenants"),
          where("legacyClientId", "==", currentClient.id),
          limit(1)
        );

        const [projectsSnap, budgetsSnap, financeByIdSnap, activitiesSnap, tenantSnap] =
          await Promise.all([
            getDocs(projectsQuery),
            getDocs(budgetsQuery),
            getDocs(financeByIdQuery),
            getDocs(activitiesByNameQuery),
            getDocs(tenantByLegacyClientQuery),
          ]);

        const projectDocs: AgencyProject[] = projectsSnap.docs.map((item) => {
          const data = item.data() as Partial<AgencyProject>;
          return {
            id: item.id,
            titulo: data.titulo || "Projeto",
            status: data.status || "Onboarding",
            clientId: data.clientId || currentClient.id,
            clientName: data.clientName || currentClient.name,
            canalPrincipal: data.canalPrincipal || "",
            servicos: Array.isArray(data.servicos) ? data.servicos : [],
            valorMensal: data.valorMensal,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });

        const budgetDocs = budgetsSnap.docs.map((item) => {
          const data = item.data() as Omit<ClientBudget, "id">;
          return {
            id: item.id,
            ...data,
          };
        });

        let financeDocs = financeByIdSnap.docs.map((item) => {
          const data = item.data() as Omit<ClientFinance, "id">;
          return { id: item.id, ...data };
        });

        if (financeDocs.length === 0 && currentClient.name) {
          const financeByNameSnap = await getDocs(
            query(
              collection(db, "financeiro"),
              where("clientName", "==", currentClient.name),
              limit(20)
            )
          );
          financeDocs = financeByNameSnap.docs.map((item) => {
            const data = item.data() as Omit<ClientFinance, "id">;
            return { id: item.id, ...data };
          });
        }

        const activityDocs = activitiesSnap.docs.map((item) => {
          const data = item.data() as Omit<ClientActivity, "id">;
          return {
            id: item.id,
            descricao: data.descricao || "",
            status: data.status || "pendente",
            data: data.data || null,
            tipo: data.tipo || null,
            leadId: data.leadId || null,
            clienteNome: data.clienteNome || null,
            createdAt: data.createdAt ?? null,
          };
        });

        let nextTenantSummary: ClientTenantSummary | null = null;
        if (!tenantSnap.empty) {
          const tenantDoc = tenantSnap.docs[0];
          const tenantData = tenantDoc.data() as {
            status?: string;
            niche?: string;
            businessProfileId?: string;
          };

          const tenantSettingsSnap = await getDoc(doc(db, "tenant_settings", tenantDoc.id));
          const tenantSettings = tenantSettingsSnap.exists()
            ? (tenantSettingsSnap.data() as { businessProfileId?: string; niche?: string })
            : null;

          nextTenantSummary = {
            tenantId: tenantDoc.id,
            status: String(tenantData.status || "active"),
            businessProfileId: normalizeBusinessProfileId(
              tenantSettings?.businessProfileId || tenantData.businessProfileId
            ),
            niche: String(tenantSettings?.niche || tenantData.niche || currentClient.niche || ""),
          };
        }

        setProjects(sortByCreatedAtDesc(projectDocs));
        setBudgets(sortByCreatedAtDesc(budgetDocs));
        setTransactions(sortByCreatedAtDesc(financeDocs));
        setActivities(sortByCreatedAtDesc(activityDocs));
        setTenantSummary(nextTenantSummary);
      } catch (error) {
        console.error("Erro ao buscar dados conectados do cliente:", error);
        setProjects([]);
        setBudgets([]);
        setTransactions([]);
        setActivities([]);
        setTenantSummary(null);
      } finally {
        setLoadingRelated(false);
      }
    }

    void fetchRelatedData();
  }, [client]);

  */

  useEffect(() => {
    let cancelled = false;
    setLoadingClient(true);
    setLoadingRelated(true);
    void authedFetch(`/api/admin/clientes/${encodeURIComponent(params.id)}/summary`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          client?: AgencyClient;
          projects?: AgencyProject[];
          budgets?: ClientBudget[];
          finance?: ClientFinance[];
          activities?: ClientActivity[];
          tenant?: { id: string; status?: string; niche?: string; businessProfileId?: string; settings?: { niche?: string; businessProfileId?: string } | null } | null;
          error?: string;
        };
        if (!response.ok || !payload.client) throw new Error(payload.error || "Falha ao carregar cliente.");
        if (cancelled) return;
        const currentClient = payload.client;
        setClient({
          ...currentClient,
          name: currentClient.name || "Cliente",
          niche: currentClient.niche || "",
          city: currentClient.city || "",
          contactName: currentClient.contactName || "",
          email: currentClient.email || "",
          phone: currentClient.phone || "",
          site: currentClient.site || "",
          services: Array.isArray(currentClient.services) ? currentClient.services : [],
        });
        setProjects(sortByCreatedAtDesc(payload.projects || []));
        setBudgets(sortByCreatedAtDesc(payload.budgets || []));
        setTransactions(sortByCreatedAtDesc(payload.finance || []));
        setActivities(sortByCreatedAtDesc(payload.activities || []));
        const tenant = payload.tenant;
        setTenantSummary(tenant ? {
          tenantId: tenant.id,
          status: String(tenant.status || "active"),
          businessProfileId: normalizeBusinessProfileId(tenant.settings?.businessProfileId || tenant.businessProfileId),
          niche: String(tenant.settings?.niche || tenant.niche || currentClient.niche || ""),
        } : null);
      })
      .catch((error) => {
        console.error("Erro ao carregar resumo do cliente:", error);
        if (!cancelled) {
          setClient(null);
          setProjects([]);
          setBudgets([]);
          setTransactions([]);
          setActivities([]);
          setTenantSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingClient(false);
          setLoadingRelated(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const clientCreatedAt = formatDateTime(client?.createdAt);
  const businessProfile = tenantSummary ? getBusinessProfile(tenantSummary.businessProfileId) : null;

  const kpis = useMemo(() => {
    const activeProjects = projects.filter((project) => project.status === "Ativo").length;
    const approvedBudgets = budgets.filter((budget) =>
      (budget.status || "").toLowerCase().includes("aprov")
    ).length;

    const paidRevenue = transactions
      .filter(
        (item) =>
          item.tipo === "Receita" && (item.status || "").toLowerCase() === "pago"
      )
      .reduce((total, item) => total + (item.valor || 0), 0);

    const pendingAmount = transactions
      .filter((item) => {
        const status = (item.status || "").toLowerCase();
        return status === "pendente" || status === "atrasado";
      })
      .reduce((total, item) => total + (item.valor || 0), 0);

    const pendingActivities = activities.filter(
      (activity) => activity.status === "pendente"
    ).length;

    return {
      activeProjects,
      approvedBudgets,
      paidRevenue,
      pendingAmount,
      pendingActivities,
    };
  }, [projects, budgets, transactions, activities]);

  if (loadingClient) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando cliente...
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/clientes")}
          className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para lista de clientes
        </button>

        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">
          Cliente nao encontrado. Verifique o link e tente novamente.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <button
            onClick={() => router.push("/admin/clientes")}
            className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-900 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para clientes
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-wide">{client.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusChip(
                String(client.status || "")
              )}`}
            >
              {client.status || "Prospeccao"}
            </span>
          </div>

          <p className="text-sm text-slate-500">
            {(client.niche || "Nicho nao informado") + " • " + (client.city || "Cidade nao informada")}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 text-xs text-slate-700 md:items-end">
          <Link
            href={`/admin/clientes/${client.id}/portal`}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-700 hover:bg-blue-500/20"
          >
            Contratos e acessos
            <ArrowRight className="h-3 w-3" />
          </Link>
          {clientCreatedAt && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>Cliente criado em {clientCreatedAt}</span>
            </div>
          )}
          {tenantSummary && <Link href={`/admin/clientes/${client.id}/portal`} className="text-xs text-slate-500">Gerenciar contrato e acessos</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 xl:grid-cols-5">
        <div className="bg-white p-4 space-y-1">
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">Projetos ativos</p>
          <p className="text-2xl font-semibold">{kpis.activeProjects}</p>
        </div>
        <div className="bg-white p-4 space-y-1">
          <p className="text-[11px] text-slate-500 uppercase tracking-wide">Orcamentos aprovados</p>
          <p className="text-2xl font-semibold">{kpis.approvedBudgets}</p>
        </div>
        <div className="bg-white p-4 space-y-1">
          <p className="text-[11px] text-emerald-700 uppercase tracking-wide">Receita paga</p>
          <p className="text-2xl font-semibold text-emerald-700">{asMoney(kpis.paidRevenue)}</p>
        </div>
        <div className="bg-white p-4 space-y-1">
          <p className="text-[11px] text-amber-700 uppercase tracking-wide">Financeiro pendente</p>
          <p className="text-2xl font-semibold text-amber-700">{asMoney(kpis.pendingAmount)}</p>
        </div>
        <div className="bg-white p-4 space-y-1">
          <p className="text-[11px] text-blue-700 uppercase tracking-wide">Atividades abertas</p>
          <p className="text-2xl font-semibold text-blue-700">{kpis.pendingActivities}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Projetos e propostas
              </h2>
              <Zap className="h-4 w-4 text-emerald-700" />
            </div>

            {loadingRelated ? (
              <div className="text-xs text-emerald-700 inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Carregando modulos conectados...
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700">
                      Projetos recentes
                    </p>
                    <Briefcase className="h-4 w-4 text-emerald-700" />
                  </div>
                  {projects.slice(0, 3).map((project) => (
                    <Link
                      key={project.id}
                      href={`/admin/projetos/${project.id}`}
                      className="text-xs flex items-center justify-between text-slate-900 hover:text-slate-900"
                    >
                      <span className="truncate pr-2">{project.titulo}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </Link>
                  ))}
                  {projects.length === 0 && (
                    <p className="text-xs text-emerald-700">
                      Nenhum projeto vinculado.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700">
                      Propostas recentes
                    </p>
                    <Receipt className="h-4 w-4 text-emerald-700" />
                  </div>
                  {budgets.slice(0, 3).map((budget) => (
                    <Link
                      key={budget.id}
                      href={`/admin/orcamentos/${budget.id}`}
                      className="text-xs flex items-center justify-between text-slate-900 hover:text-slate-900"
                    >
                      <span className="truncate pr-2">
                        {budget.title || budget.titulo || "Orcamento"}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                    </Link>
                  ))}
                  {budgets.length === 0 && (
                    <p className="text-xs text-emerald-700">
                      Nenhum orcamento vinculado.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Informacoes de contato
            </h2>

            <p className="text-xs text-slate-500">
              Contato principal:{" "}
              <span className="text-slate-900 font-medium">
                {client.contactName || "Nao informado"}
              </span>
            </p>

            <div className="flex flex-wrap gap-3 text-xs text-slate-900">
              {client.email && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span>{client.email}</span>
                </div>
              )}

              {client.phone && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <span>{client.phone}</span>
                </div>
              )}

              {client.site && (
                <a
                  href={client.site.startsWith("http") ? client.site : `https://${client.site}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200 text-blue-700 hover:text-blue-700"
                >
                  <Globe2 className="h-4 w-4" />
                  <span>{client.site}</span>
                </a>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Servicos e escopo
              </h2>
              <FileText className="h-4 w-4 text-slate-400" />
            </div>

            {client.services && client.services.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.services.map((service) => (
                  <span
                    key={service}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-900"
                  >
                    {service}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Nenhum servico especificado. Defina o escopo para alinhar projetos e financeiro.
              </p>
            )}
          </div>

        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Financeiro recente
            </h2>

            {transactions.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-900 truncate">{item.descricao || item.referencia || "Lancamento"}</p>
                <p className="text-[11px] text-slate-500">
                  {(item.tipo || "Receita") + " • " + (item.status || "pendente")}
                </p>
                <p className="text-xs text-slate-900">{asMoney(item.valor || 0)}</p>
              </div>
            ))}

            {transactions.length === 0 && (
              <p className="text-xs text-slate-500">
                Sem lancamentos financeiros vinculados a este cliente.
              </p>
            )}

            <Link
              href="/admin/financeiro"
              className="inline-flex items-center gap-2 text-xs text-blue-700 hover:text-blue-700"
            >
              <Wallet className="h-3 w-3" />
              Abrir modulo financeiro
            </Link>
          </div>

          <details className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Configuração da operação</summary>

            {tenantSummary && businessProfile ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Tenant</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{tenantSummary.tenantId}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {tenantSummary.status} · {tenantSummary.niche || "nicho nao informado"}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Modo do negocio</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{businessProfile.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{businessProfile.description}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Foco comercial</p>
                  <p className="mt-1 text-xs text-slate-700">{businessProfile.commercialMotion}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Métricas naturais: {businessProfile.metrics.join(" · ")}
                  </p>
                </div>

                <Link
                  href={`/admin/clientes/${client.id}/portal`}
                  className="inline-flex items-center gap-2 text-xs text-blue-700 hover:text-blue-700"
                >
                  <BadgeCheck className="h-3 w-3" />
                  Abrir portal e continuar provisionamento
                </Link>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Este cliente ainda nao tem tenant/profil de negocio claramente vinculado. Vale revisar o provisionamento do portal.
              </p>
            )}
          </details>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Atividades do cliente
            </h2>

            {activities.slice(0, 5).map((activity) => {
              const date = activity.data ? formatDate(activity.data) : formatDate(activity.createdAt);
              return (
                <div key={activity.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs text-slate-900">{activity.descricao}</p>
                  <p className="text-[11px] text-slate-500">
                    {(activity.status === "concluida" ? "Concluida" : "Pendente") +
                      (date ? ` • ${date}` : "")}
                  </p>
                </div>
              );
            })}

            {activities.length === 0 && (
              <p className="text-xs text-slate-500">
                Nenhuma atividade associada com o nome deste cliente.
              </p>
            )}

            <Link
              href="/admin/atividades"
              className="inline-flex items-center gap-2 text-xs text-blue-700 hover:text-blue-700"
            >
              <Clock3 className="h-3 w-3" />
              Abrir agenda de atividades
            </Link>
          </div>


        </div>
      </div>
    </div>
  );
}
