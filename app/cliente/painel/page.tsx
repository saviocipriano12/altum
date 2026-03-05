"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/firebaseConfig";
import { useRouter } from "next/navigation";
import { authedFetch } from "@/app/lib/authed-fetch";
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  Target,
  Wallet,
} from "lucide-react";

type DashboardData = {
  portalUser?: {
    name?: string;
    email?: string;
    clientName?: string;
  };
  client?: {
    name?: string;
    niche?: string;
    city?: string;
    site?: string;
  };
  contract?: {
    title?: string;
    status?: string;
    monthlyValue?: number;
    dueDay?: number;
    nextDueDate?: string;
    paymentLink?: string;
    notes?: string;
  } | null;
  kpis?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    ctr?: number;
    cpc?: number;
    cpl?: number;
    paid?: number;
    pending?: number;
    projects?: number;
    budgets?: number;
  };
  adAccounts?: Array<{
    id: string;
    accountLabel?: string;
    platform?: string;
    status?: string;
  }>;
  projects?: Array<{
    id: string;
    titulo?: string;
    status?: string;
    canalPrincipal?: string;
  }>;
  finance?: Array<{
    id: string;
    descricao?: string;
    valor?: number;
    status?: string;
    createdAt?: unknown;
  }>;
  error?: string;
};

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ClientePainelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/cliente/login");
        return;
      }

      try {
        const res = await authedFetch("/api/client-portal/dashboard");
        const payload = (await res.json()) as DashboardData;
        if (!res.ok) {
          setError(payload.error || "Falha ao carregar painel.");
          setLoading(false);
          return;
        }
        setData(payload);
      } catch {
        setError("Falha ao carregar painel do cliente.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const kpis = data?.kpis;
  const cards = useMemo(
    () => [
      { label: "Impressões", value: (kpis?.impressions || 0).toLocaleString("pt-BR"), icon: <BarChart3 className="h-4 w-4" /> },
      { label: "Cliques", value: (kpis?.clicks || 0).toLocaleString("pt-BR"), icon: <Target className="h-4 w-4" /> },
      { label: "Leads", value: (kpis?.leads || 0).toLocaleString("pt-BR"), icon: <Activity className="h-4 w-4" /> },
      { label: "Investimento", value: brl(Number(kpis?.spend || 0)), icon: <Wallet className="h-4 w-4" /> },
    ],
    [kpis]
  );

  async function logout() {
    await signOut(auth);
    router.push("/cliente/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center text-white">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center p-4 text-white">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
          {error || "Falha ao carregar painel."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white">
      <header className="border-b border-white/10 bg-[#101010]">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/45">Portal ALTUM</p>
            <h1 className="text-xl font-semibold">{data.client?.name || data.portalUser?.clientName || "Cliente"}</h1>
            <p className="text-xs text-white/55">
              {(data.client?.niche || "Nicho não informado") + " • " + (data.client?.city || "Cidade não informada")}
            </p>
          </div>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-white/10 bg-[#111] p-4">
              <p className="text-[11px] uppercase tracking-wide text-white/45">{card.label}</p>
              <p className="text-2xl font-semibold mt-1">{card.value}</p>
              <div className="mt-2 text-white/40">{card.icon}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#111] p-4 space-y-3 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Performance de campanhas
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="CTR" value={`${Number(kpis?.ctr || 0).toFixed(2)}%`} />
              <Metric label="CPC" value={brl(Number(kpis?.cpc || 0))} />
              <Metric label="CPL" value={brl(Number(kpis?.cpl || 0))} />
            </div>

            <div className="space-y-2">
              {(data.adAccounts || []).map((account) => (
                <div key={account.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-sm text-white/90">{account.accountLabel || "Conta"}</p>
                  <p className="text-xs text-white/55">
                    {account.platform || "plataforma"} • status: {account.status || "ativo"}
                  </p>
                </div>
              ))}
              {(data.adAccounts || []).length === 0 && (
                <p className="text-sm text-white/55">Nenhuma conta de anúncio conectada ainda.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-white/50" />
              Contrato e cobrança
            </h2>

            {data.contract ? (
              <>
                <p className="text-sm text-white/90">{data.contract.title || "Contrato ativo"}</p>
                <p className="text-xs text-white/60">Status: {data.contract.status || "ativo"}</p>
                <p className="text-xs text-white/60">
                  Mensalidade: {brl(Number(data.contract.monthlyValue || 0))}
                </p>
                <p className="text-xs text-white/60">
                  Vencimento: dia {Number(data.contract.dueDay || 0)}{" "}
                  {data.contract.nextDueDate ? `• próxima: ${data.contract.nextDueDate}` : ""}
                </p>
                {data.contract.paymentLink && (
                  <a
                    href={data.contract.paymentLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100 hover:bg-blue-500/20"
                  >
                    Fazer pagamento
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-white/55">Contrato ainda não configurado no portal.</p>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Entregas e projetos
            </h2>
            {(data.projects || []).slice(0, 8).map((project) => (
              <div key={project.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="text-sm text-white/90">{project.titulo || "Projeto"}</p>
                <p className="text-xs text-white/60">
                  {project.status || "status"} • {project.canalPrincipal || "canal não informado"}
                </p>
              </div>
            ))}
            {(data.projects || []).length === 0 && (
              <p className="text-sm text-white/55">Sem projetos vinculados no momento.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-white/50" />
              Financeiro recente
            </h2>
            {(data.finance || []).slice(0, 8).map((tx) => (
              <div key={tx.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
                <p className="text-sm text-white/90">{tx.descricao || "Lançamento"}</p>
                <p className="text-xs text-white/60">
                  {String(tx.status || "pendente")} • {brl(Number(tx.valor || 0))}
                </p>
              </div>
            ))}
            {(data.finance || []).length === 0 && (
              <p className="text-sm text-white/55">Sem lançamentos para exibir.</p>
            )}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Recebido: {brl(Number(kpis?.paid || 0))}
              </div>
              <div className="mt-1">Pendente: {brl(Number(kpis?.pending || 0))}</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
      <p className="text-lg font-semibold text-white mt-1">{value}</p>
    </div>
  );
}
