"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarClock, CheckCircle2, CreditCard, Loader2, Target, Wallet } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type DashboardData = {
  portalUser?: {
    name?: string;
    email?: string;
    tenantId?: string;
    tenantName?: string;
    tenantRole?: string;
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

export default function ClientePainelOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await authedFetch("/api/client-portal/dashboard");
        const payload = (await res.json()) as DashboardData;
        if (!mounted) return;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar overview.");
          setLoading(false);
          return;
        }

        setData(payload);
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar dados do painel.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const kpis = data?.kpis;

  const cards = useMemo(
    () => [
      {
        label: "Impressoes",
        value: (kpis?.impressions || 0).toLocaleString("pt-BR"),
        icon: <BarChart3 className="h-4 w-4" />,
      },
      { label: "Cliques", value: (kpis?.clicks || 0).toLocaleString("pt-BR"), icon: <Target className="h-4 w-4" /> },
      { label: "Leads", value: (kpis?.leads || 0).toLocaleString("pt-BR"), icon: <Activity className="h-4 w-4" /> },
      { label: "Investimento", value: brl(Number(kpis?.spend || 0)), icon: <Wallet className="h-4 w-4" /> },
    ],
    [kpis]
  );

  if (loading) {
    return (
      <div className="min-h-[45vh] flex items-center justify-center text-white">
        <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
        {error || "Falha ao carregar painel."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">Performance de campanhas</h2>
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
                  {account.platform || "plataforma"} - status: {account.status || "ativo"}
                </p>
              </div>
            ))}
            {(data.adAccounts || []).length === 0 && (
              <p className="text-sm text-white/55">Nenhuma conta de anuncio conectada ainda.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-white/50" />
            Contrato e cobranca
          </h2>

          {data.contract ? (
            <>
              <p className="text-sm text-white/90">{data.contract.title || "Contrato ativo"}</p>
              <p className="text-xs text-white/60">Status: {data.contract.status || "ativo"}</p>
              <p className="text-xs text-white/60">Mensalidade: {brl(Number(data.contract.monthlyValue || 0))}</p>
              <p className="text-xs text-white/60">
                Vencimento: dia {Number(data.contract.dueDay || 0)}
                {data.contract.nextDueDate ? ` - proxima: ${data.contract.nextDueDate}` : ""}
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
            <p className="text-sm text-white/55">Contrato ainda nao configurado no portal.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#111] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">Entregas e projetos</h2>
          {(data.projects || []).slice(0, 8).map((project) => (
            <div key={project.id} className="rounded-lg border border-white/10 bg-black/40 p-3">
              <p className="text-sm text-white/90">{project.titulo || "Projeto"}</p>
              <p className="text-xs text-white/60">
                {project.status || "status"} - {project.canalPrincipal || "canal nao informado"}
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
              <p className="text-sm text-white/90">{tx.descricao || "Lancamento"}</p>
              <p className="text-xs text-white/60">
                {String(tx.status || "pendente")} - {brl(Number(tx.valor || 0))}
              </p>
            </div>
          ))}
          {(data.finance || []).length === 0 && <p className="text-sm text-white/55">Sem lancamentos para exibir.</p>}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Recebido: {brl(Number(kpis?.paid || 0))}
            </div>
            <div className="mt-1">Pendente: {brl(Number(kpis?.pending || 0))}</div>
          </div>
        </div>
      </section>
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
