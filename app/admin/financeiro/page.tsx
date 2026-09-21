"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/app/lib/authed-fetch";
import type {
  FinanceCategory as Categoria,
  FinanceStatus as FinStatus,
  FinanceTransaction as Transaction,
  FinanceType as FinTipo,
  PayoutStatus,
  TeamMemberDoc,
} from "@/app/types/domain";
import {
  TrendingUp, ArrowDownRight, Loader2,
  Zap, Plus, X, Calculator, HandCoins, Search, Trash2,
  Eye, EyeOff, CheckCircle2, History
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

/* ======================================================
   CONFIGURAÇÕES E TIPAGENS
====================================================== */
type FinanceTab = "resumo" | "vendas" | "contas" | "equipe";

interface SellerOption {
  id: string;
  name: string;
  commissionRate?: number;
}

interface BillingOverviewSummary {
  totalContracts: number;
  activeContracts: number;
  blockedContracts: number;
  stripeContracts: number;
  includedContracts: number;
  manualContracts: number;
  openFinanceCount: number;
  overdueFinanceCount: number;
  monthlyPlatformValue: number;
  overdueAmount: number;
  stripeReady: boolean;
  stripeMissing: string[];
}

interface BillingActionItem {
  clientId: string;
  clientName: string;
  tenantId?: string | null;
  platformPlan?: string | null;
  billingProvider: string;
  accessMode: string;
  accessStatus: string;
  monthlyValue: number;
  dueDate?: string | null;
  financeStatus?: string | null;
  reasons: string[];
  severity: number;
}

interface LaunchForm {
  descricao: string;
  valor: string;
  comissaoPercent: string;
  vendedorId: string;
  tipo: FinTipo;
  categoria: Categoria;
  status: FinStatus;
  vencimento: string;
  referencia: string;
}

const money = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");
const toDate = (value?: string | number | null) => {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const initialForm: LaunchForm = {
  descricao: "",
  valor: "",
  comissaoPercent: "10",
  vendedorId: "",
  tipo: "Receita",
  categoria: "Mensalidade",
  status: "pendente",
  vencimento: new Date().toISOString().split("T")[0],
  referencia: "",
};

export default function FinanceiroMasterPage() {
  const { user, isAdmin } = useAuth();

  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FinanceTab>("resumo");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [search, setSearch] = useState("");
  const [hideValues, setHideValues] = useState(false);
  const [billingSummary, setBillingSummary] = useState<BillingOverviewSummary | null>(null);
  const [billingItems, setBillingItems] = useState<BillingActionItem[]>([]);

  const [form, setForm] = useState<LaunchForm>(initialForm);
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. CARREGAMENTO COM REGRA DE NEGÓCIO
  useEffect(() => {
    if (!isModalOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) setIsModalOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [isModalOpen, saving]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    /* Legacy client listener retained below for historical context; data now loads through the authenticated API.
    const ref = collection(db, "financeiro");

    // Admin vê o macro / Vendedor vê apenas seu micro
    const q = isAdmin
      ? query(ref, orderBy("createdAt", "desc"))
      : query(ref, where("vendedorId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
        const sorted = [...rows].sort((a, b) => {
          const aTs =
            typeof a.createdAt === "number"
              ? a.createdAt
              : typeof a.createdAt === "object" && a.createdAt && "toDate" in a.createdAt && typeof a.createdAt.toDate === "function"
                ? a.createdAt.toDate().getTime()
                : 0;
          const bTs =
            typeof b.createdAt === "number"
              ? b.createdAt
              : typeof b.createdAt === "object" && b.createdAt && "toDate" in b.createdAt && typeof b.createdAt.toDate === "function"
                ? b.createdAt.toDate().getTime()
                : 0;
          return bTs - aTs;
        });
        setData(sorted);
        setLoadError(null);
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao carregar financeiro:", error);
        setLoadError("Não foi possível carregar o financeiro agora.");
        setLoading(false);
      }
    );

    if (isAdmin) {
      getDocs(collection(db, "users")).then(snap => {
        setSellers(
          snap.docs.map((d) => {
            const userData = d.data() as TeamMemberDoc;
            return {
              id: d.id,
              name: userData.name || "Sem Nome",
              commissionRate: Number((userData as { commissionRate?: number }).commissionRate || 0),
            };
          })
        );
      });
    }
    return () => unsub();
    */
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      authedFetch("/api/admin/dashboard?include=financeiro"),
      isAdmin ? authedFetch("/api/admin/users?detailed=true") : Promise.resolve(null),
    ])
      .then(async ([financeResponse, usersResponse]) => {
        const financePayload = (await financeResponse.json()) as { financeiro?: Transaction[]; error?: string };
        if (!financeResponse.ok) throw new Error(financePayload.error || "Falha ao carregar financeiro.");
        const rows = Array.isArray(financePayload.financeiro) ? financePayload.financeiro : [];
        const timestamp = (value: unknown) => {
          if (typeof value === "number") return value;
          if (typeof value === "string") return new Date(value).getTime() || 0;
          if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
            return (value as { toDate: () => Date }).toDate().getTime();
          }
          return 0;
        };
        if (cancelled) return;
        setData([...rows].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)));
        if (usersResponse) {
          const usersPayload = (await usersResponse.json()) as { items?: Array<TeamMemberDoc & { id: string }> };
          setSellers((usersPayload.items || []).map((item) => ({
            id: item.id,
            name: item.name || "Sem Nome",
            commissionRate: Number(item.commissionRate || 0),
          })));
        }
        setLoadError(null);
      })
      .catch((error) => {
        console.error("Erro ao carregar financeiro:", error);
        if (!cancelled) {
          setData([]);
          setSellers([]);
          setLoadError("Não foi possível carregar o financeiro agora.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, refreshKey]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    async function loadBillingOverview() {
      try {
        const res = await authedFetch("/api/admin/billing/overview");
        const payload = (await res.json()) as {
          summary?: BillingOverviewSummary;
          actionItems?: BillingActionItem[];
        };
        if (!res.ok) return;
        setBillingSummary(payload.summary || null);
        setBillingItems(Array.isArray(payload.actionItems) ? payload.actionItems : []);
      } catch (error) {
        console.error("Erro ao carregar overview de billing:", error);
      }
    }

    void loadBillingOverview();
  }, [user, isAdmin]);

  // 2. MOTOR DE CÁLCULO SaaS
  const stats = useMemo(() => {
    const receitas = data.filter(t => t.tipo === "Receita" && t.status === "pago");
    const despesas = data.filter(t => t.tipo === "Despesa" && t.status === "pago");

    const faturamentoBruto = receitas.reduce((acc, t) => acc + t.valor, 0);
    const custoFixo = despesas.reduce((acc, t) => acc + t.valor, 0);
    const comissoesTotais = receitas.reduce((acc, t) => acc + (t.valorComissao || 0), 0);

    const mrr = data
      .filter(t => t.categoria === "Mensalidade" && t.status === "pago")
      .reduce((acc, t) => acc + t.valor, 0);

    const pendentePayout = data
      .filter(t => t.tipo === "Receita" && t.status === "pago" && t.payoutStatus !== "liquidado")
      .reduce((acc, t) => acc + (t.valorComissao || 0), 0);

    const previsaoComissao = data
      .filter((t) => t.tipo === "Receita" && t.status !== "cancelado" && t.payoutStatus !== "liquidado")
      .reduce((acc, t) => acc + (t.valorComissao || 0), 0);

    const proximoRepasse = data
      .filter((t) => t.tipo === "Receita" && t.status !== "cancelado" && t.payoutStatus !== "liquidado")
      .sort((a, b) => {
        const da = toDate(a.vencimento)?.getTime() || Number.MAX_SAFE_INTEGER;
        const db = toDate(b.vencimento)?.getTime() || Number.MAX_SAFE_INTEGER;
        return da - db;
      })[0] || null;

    return {
      principal: isAdmin ? faturamentoBruto : comissoesTotais,
      custoFixo,
      mrr,
      lucroLiquido: faturamentoBruto - custoFixo - comissoesTotais,
      pendentePayout,
      previsaoComissao,
      proximoRepasseValor: proximoRepasse?.valorComissao || 0,
      proximoRepasseData: proximoRepasse?.vencimento || null,
    };
  }, [data, isAdmin]);

    // 3. HANDLERS (ACOES)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const v = parseFloat(form.valor);
      const commissionPercent = Number(form.comissaoPercent || 0);
      const c = form.tipo === "Receita" ? (v * commissionPercent) / 100 : 0;
      const vend = sellers.find((s) => s.id === form.vendedorId);

      const res = await authedFetch("/api/finance/transactions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          valor: v,
          commissionRate: commissionPercent,
          valorComissao: c,
          vendedorNome: vend?.name || (isAdmin ? "Agencia" : user?.displayName),
          vendedorId: form.vendedorId || user?.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao criar lancamento.");

      setRefreshKey((value) => value + 1);
      setIsModalOpen(false);
      setForm((prev) => ({ ...prev, descricao: "", valor: "", referencia: "" }));
    } catch (error) {
      console.error(error);
      alert("Erro ao criar lancamento.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, s: FinStatus) => {
    const res = await authedFetch("/api/finance/transactions/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: s }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || "Falha ao atualizar status.");
    } else {
      setRefreshKey((value) => value + 1);
    }
  };

  const handleTogglePayout = async (id: string, current: PayoutStatus) => {
    const res = await authedFetch("/api/finance/transactions/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        payoutStatus: current === "liquidado" ? "pendente" : "liquidado",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || "Falha ao atualizar payout.");
    } else {
      setRefreshKey((value) => value + 1);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja remover este registro permanentemente?")) {
      const res = await authedFetch("/api/finance/transactions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Falha ao remover registro.");
      } else {
        setRefreshKey((value) => value + 1);
      }
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-slate-400" size={50}/></div>;
  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-900">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">

      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
             <div className={cx("px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border",
                isAdmin ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-blue-500/10 text-blue-700 border-blue-500/20")}>
                {isAdmin ? "Gestão financeira" : "Consultor Altum"}
             </div>
             <button aria-label={hideValues ? "Mostrar valores" : "Ocultar valores"} onClick={() => setHideValues(!hideValues)} className="text-slate-400 hover:text-slate-900 transition">
                {hideValues ? <EyeOff size={18}/> : <Eye size={18}/>}
             </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Financeiro
          </h1>
        </div>

        {isAdmin && (
           <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg transition hover:bg-indigo-700 flex items-center gap-2 text-sm">
             <Plus size={16}/> Novo Lançamento
           </button>
        )}
      </div>

      {/* MÉTRICAS DE IMPACTO */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBox label={isAdmin ? "Faturamento Bruto" : "Comissões Confirmadas"} valor={hideValues ? "****" : money(stats.principal)} sub="Vendas Pagas" icone={<TrendingUp size={16}/>}/>
          {isAdmin ? (
            <StatBox label="Despesas Fixas" valor={hideValues ? "****" : `-${money(stats.custoFixo)}`} sub="Infra + APIs" icone={<ArrowDownRight size={16}/>}/>
          ) : (
            <StatBox label="Comissão Prevista" valor={hideValues ? "****" : money(stats.previsaoComissao)} sub="Pendente de repasse" icone={<Zap size={16}/>}/>
          )}
          <StatBox label={isAdmin ? "MRR Ativo" : "Próximo Repasse"} valor={hideValues ? "****" : (isAdmin ? money(stats.mrr) : money(stats.proximoRepasseValor))} sub={isAdmin ? "Recorrência Mensal" : (stats.proximoRepasseData ? ` ${stats.proximoRepasseData}` : "Sem data prevista")} icone={<History size={16}/>}/>
          <StatBox label={isAdmin ? "Lucro Líquido" : "Saldo Disponível"} valor={hideValues ? "****" : (isAdmin ? money(stats.lucroLiquido) : money(stats.pendentePayout))} sub="Líquido Real" icone={<Calculator size={16}/>} destaque />
      </div>

      {/* NAVEGAÇÃO SaaS */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="flex gap-6 border-b border-slate-200 pb-4 overflow-x-auto scrollbar-hide">
            <NavTab active={activeTab === "resumo"} click={() => setActiveTab("resumo")} label="Visão geral"/>
            <NavTab active={activeTab === "vendas"} click={() => setActiveTab("vendas")} label="Receitas"/>
            {isAdmin && <NavTab active={activeTab === "contas"} click={() => setActiveTab("contas")} label="Despesas"/>}
            {isAdmin && <NavTab active={activeTab === "equipe"} click={() => setActiveTab("equipe")} label="Comissões"/>}
        </div>

        {/* CONTEÚDO DINMICO */}
        <div className="mt-6">
            {activeTab === "resumo" && (
              <div className="space-y-10">
                {isAdmin && billingSummary ? (
                  <BillingOpsPanel summary={billingSummary} items={billingItems} esconderValores={hideValues} />
                ) : null}
                <ResumoVisual transactions={data} />
              </div>
            )}

            {(activeTab === "vendas" || activeTab === "contas") && (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input placeholder="Filtrar lançamentos..." className="w-full bg-transparent border border-slate-200 rounded-full py-3 pl-12 pr-4 text-xs focus:border-slate-200 transition outline-none" value={search} onChange={e => setSearch(e.target.value)}/>
                    </div>
                    <TabelaFinanceira
                        lista={data.filter(t => {
                            const match = (t.descricao || "").toLowerCase().includes(search.toLowerCase());
                            const tipo = activeTab === "vendas" ? t.tipo === "Receita" : t.tipo === "Despesa";
                            return match && tipo;
                        })}
                        isAdmin={isAdmin!}
                        esconderValores={hideValues}
                        onUpdateStatus={handleUpdateStatus}
                        onDelete={handleDelete}
                    />
                </div>
            )}

            {activeTab === "equipe" && isAdmin && (
                <ModuloEquipe lista={data} pendente={stats.pendentePayout} onTogglePayout={handleTogglePayout}/>
            )}
        </div>
      </div>

      {/* MODAL DE LANÇAMENTO (ROBUSTO) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <form role="dialog" aria-modal="true" aria-labelledby="finance-entry-title" onSubmit={handleSave} className="max-h-[90dvh] overflow-y-auto bg-white border border-slate-200 rounded-2xl p-6 max-w-xl w-full shadow-4xl animate-in zoom-in">
                <div className="flex justify-between items-center mb-5 text-slate-900">
                    <h3 id="finance-entry-title" className="text-xl font-semibold">Novo lançamento</h3>
                    <button type="button" aria-label="Fechar novo lançamento" disabled={saving} onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-slate-50 rounded-full transition"><X/></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-slate-900 text-sm font-medium">
                    <div className="col-span-full">
                        <label htmlFor="finance-descricao" className="text-slate-700 mb-1.5 block">Descrição / Cliente</label>
                        <input id="finance-descricao" autoFocus required value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"/>
                    </div>
                    <div>
                        <label htmlFor="finance-valor" className="text-slate-700 mb-1.5 block">Valor Bruto</label>
                        <input id="finance-valor" required type="number" min="0.01" step="0.01" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"/>
                    </div>
                    <div>
                        <label htmlFor="finance-tipo" className="text-slate-700 mb-1.5 block">Tipo</label>
                        <select id="finance-tipo" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as FinTipo, categoria: e.target.value === "Receita" ? "Mensalidade" : "Infra/API"})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500">
                            <option value="Receita">Receita (Entrada)</option>
                            <option value="Despesa">Despesa (Gasto)</option>
                        </select>
                    </div>
                    {form.tipo === "Receita" && (
                        <>
                            <div>
                                <label htmlFor="finance-vendedorId" className="text-slate-700 mb-1.5 block">Vendedor</label>
                                <select id="finance-vendedorId"
                                  value={form.vendedorId}
                                  onChange={e => {
                                    const nextSellerId = e.target.value;
                                    const selectedSeller = sellers.find((seller) => seller.id === nextSellerId);
                                    setForm({
                                      ...form,
                                      vendedorId: nextSellerId,
                                      comissaoPercent: selectedSeller
                                        ? String(selectedSeller.commissionRate || 0)
                                        : form.comissaoPercent,
                                    });
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500"
                                >
                                    <option value="">Direto / Admin</option>
                                    {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="finance-comissaoPercent" className="text-slate-700 mb-1.5 block">Comissão (%)</label>
                                <input id="finance-comissaoPercent" type="number" min="0" max="100" value={form.comissaoPercent} onChange={e => setForm({...form, comissaoPercent: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-500"/>
                            </div>
                        </>
                    )}
                    <div className="col-span-full flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => setIsModalOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600">Cancelar</button>
                        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50">
                            {saving ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>} Salvar lançamento
                        </button>
                    </div>
                </div>
            </form>
        </div>
      )}
    </div>
  );
}

/* ======================================================
   SUB-COMPONENTES (VISUAL PREMIUM)
====================================================== */

function StatBox({
  label,
  valor,
  sub,
  icone,
  destaque,
}: {
  label: string;
  valor: string;
  sub: string;
  icone: React.ReactNode;
  destaque?: boolean;
}) {
    return (
        <div className={cx("p-5 border border-slate-200 rounded-xl relative overflow-hidden transition-all",
            destaque ? "bg-white text-black shadow-sm" : "bg-white")}>
            <div className={cx("absolute top-6 right-6 opacity-10", destaque ? "text-black" : "text-slate-900")}>{icone}</div>
            <p className={cx("text-[10px] font-medium text-sm mb-3", destaque ? "text-black/30" : "text-slate-400")}>{label}</p>
            <h3 className="text-2xl font-semibold tracking-tight leading-none">{valor}</h3>
            <p className={cx("text-[10px] mt-4 font-bold uppercase tracking-widest", destaque ? "text-black/30" : "text-slate-400")}>{sub}</p>
        </div>
    );
}

function NavTab({ active, click, label }: { active: boolean; click: () => void; label: string }) {
    return (
        <button onClick={click} className={cx("text-sm font-medium pb-3 border-b-2 transition-all shrink-0",
            active ? "text-indigo-700 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-900")}>
            {label}
        </button>
    );
}

function TabelaFinanceira({
  lista,
  isAdmin,
  esconderValores,
  onUpdateStatus,
  onDelete,
}: {
  lista: Transaction[];
  isAdmin: boolean;
  esconderValores: boolean;
  onUpdateStatus: (id: string, status: FinStatus) => void;
  onDelete: (id: string) => void;
}) {
    return (
        <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full text-left">
                <thead className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                    <tr>
                        <th className="py-4 pr-4">Vencimento</th>
                        <th className="py-4 pr-4">Identificação</th>
                        <th className="py-4 pr-4">Valor</th>
                        <th className="py-4 text-right">Status / Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                    {lista.map((t: Transaction) => (
                        <tr key={t.id} className="group transition-colors hover:bg-slate-50">
                            <td className="py-4 pr-4 text-[10px] font-mono text-slate-400 italic">{t.vencimento}</td>
                            <td className="py-4 pr-4">
                                <p className="text-sm font-black text-slate-700 uppercase tracking-tighter group-hover:text-slate-900 transition-colors">{t.descricao}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{t.categoria}</p>
                            </td>
                            <td className="py-4 pr-4 text-xs font-black">
                                {isAdmin ? (
                                  <span className={t.tipo === "Despesa" ? "text-slate-400" : "text-slate-900"}>
                                      {t.tipo === "Despesa" ? "-" : ""}{esconderValores ? "****" : money(t.valor)}
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <span className={t.tipo === "Despesa" ? "text-slate-400" : "text-emerald-700"}>
                                      {esconderValores ? "****" : money(t.valorComissao ?? 0)}
                                    </span>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400">
                                      venda {esconderValores ? "****" : money(t.valor)}
                                    </p>
                                  </div>
                                )}
                            </td>
                            <td className="py-4 text-right">
                                <div className="flex items-center justify-end gap-6">
                                    {isAdmin ? (
                                        <select
                                            value={t.status}
                                            onChange={(e) => onUpdateStatus(t.id, e.target.value as FinStatus)}
                                            className="bg-transparent text-[10px] font-black uppercase outline-none text-slate-400 hover:text-slate-900 transition cursor-pointer"
                                        >
                                            <option value="pago">Finalizado</option>
                                            <option value="pendente">Aguardando</option>
                                            <option value="atrasado">Em Atraso</option>
                                            <option value="cancelado">Cancelado</option>
                                        </select>
                                    ) : (
                                        <span className="text-[10px] font-black uppercase text-slate-400">{t.status}</span>
                                    )}
                                    {isAdmin && <button onClick={() => onDelete(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition"><Trash2 size={16}/></button>}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ModuloEquipe({
  lista,
  pendente,
  onTogglePayout,
}: {
  lista: Transaction[];
  pendente: number;
  onTogglePayout: (id: string, current: PayoutStatus) => void;
}) {
    return (
        <div className="space-y-6 animate-in zoom-in duration-500">
            <div className="p-6 border border-slate-200 bg-white rounded-2xl flex justify-between items-center">
                <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Payout Acumulado</p>
                    <h3 className="text-6xl font-black mt-3 tracking-tighter">{money(pendente)}</h3>
                </div>
                <HandCoins size={48} className="text-slate-400"/>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <tr>
                            <th className="px-10 py-8">Consultor</th>
                            <th className="px-10 py-8">Comissão</th>
                            <th className="px-10 py-8 text-right">Liquidação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {lista.filter((t) => t.tipo === "Receita" && t.status === "pago").map((t) => (
                            <tr key={t.id}>
                                <td className="px-10 py-8 font-bold text-slate-900 text-xs uppercase">{t.vendedorNome} <br/><span className="text-[9px] text-slate-400 font-black tracking-widest">{t.descricao}</span></td>
                                <td className="px-10 py-8 font-black text-slate-900">{money(t.valorComissao ?? 0)}</td>
                                <td className="px-10 py-8 text-right">
                                    <button
                                        onClick={() => onTogglePayout(t.id, t.payoutStatus || "pendente")}
                                        className={cx("px-6 py-2 rounded-full text-[10px] font-black uppercase border transition-all",
                                            t.payoutStatus === "liquidado" ? "bg-white text-black border-slate-200" : "bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-200")}
                                    >
                                        {t.payoutStatus === "liquidado" ? "PAGO ✓" : "DAR BAIXA"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ResumoVisual({ transactions }: { transactions: Transaction[] }) {
    const chartData = useMemo(() => {
        const meses: Record<string, number> = {};
        transactions.filter((t) => t.tipo === "Receita" && t.status === "pago").forEach((t) => {
            const m = new Date(t.vencimento || new Date().toISOString().split("T")[0]).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            meses[m] = (meses[m] || 0) + t.valor;
        });
        return Object.entries(meses).map(([name, total]) => ({ name, total }));
    }, [transactions]);

    if (!chartData.length) return <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">As receitas pagas aparecerão aqui ao registrar os primeiros lançamentos.</p>;
    return (
        <div className="h-[300px] w-full animate-in fade-in duration-1000">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="noir" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontWeight: 'bold'}} dy={15} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip cursor={{stroke: '#cbd5e1', strokeWidth: 1}} contentStyle={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={1.5} fillOpacity={1} fill="url(#noir)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function BillingOpsPanel({
  summary,
  items,
  esconderValores,
}: {
  summary: BillingOverviewSummary;
  items: BillingActionItem[];
  esconderValores: boolean;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium text-slate-400">Plataforma ativa</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight">
            {summary.activeContracts}
            <span className="ml-2 text-base text-slate-400">/ {summary.totalContracts}</span>
          </h3>
          <p className="mt-3 text-xs text-slate-400">
            {summary.blockedContracts} bloqueados
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium text-slate-400">MRR da plataforma</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight">
            {esconderValores ? "****" : money(summary.monthlyPlatformValue)}
          </h3>
          <p className="mt-3 text-xs text-slate-400">
            contratos com acesso ou estrutura ativa
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium text-slate-400">Cobrancas abertas</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight">
            {summary.openFinanceCount}
          </h3>
          <p className="mt-3 text-xs text-slate-400">
            {summary.overdueFinanceCount} em atraso
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium text-slate-400">Trilho Stripe</p>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight">
            {summary.stripeContracts}
          </h3>
          <p className="mt-3 text-xs text-slate-400">
            {summary.stripeReady ? "ambiente pronto" : `faltando ${summary.stripeMissing.length} chave(s)`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Fila de atencao</p>
              <h3 className="mt-3 text-2xl font-black tracking-tight">Quem precisa de acao agora</h3>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-slate-400">Em risco</p>
              <p className="mt-2 text-lg font-black text-slate-900">
                {esconderValores ? "****" : money(summary.overdueAmount)}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Nenhum cliente com alerta operacional relevante no momento.
              </div>
            ) : (
              items.map((item) => (
                <div key={`${item.clientId}-${item.accessMode}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <Link href={`/admin/clientes/${encodeURIComponent(item.clientId)}/portal`} className="text-sm font-semibold text-indigo-600 hover:underline">{item.clientName}</Link>
                      <p className="mt-1 text-xs text-slate-400">
                        {item.platformPlan || "sem plano"} • {item.billingProvider} • {item.accessMode}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs font-medium text-slate-500">
                        {item.accessStatus}
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {esconderValores ? "****" : money(item.monthlyValue)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.reasons.map((reason) => (
                      <span key={reason} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
                        {reason}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-400">
                    {item.dueDate ? `proximo marco ${item.dueDate}` : "sem vencimento mapeado"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium text-slate-400">Composicao operacional</p>
          <div className="mt-6 space-y-4">
            <MiniMetric label="Stripe" value={summary.stripeContracts} />
            <MiniMetric label="Incluso na agencia" value={summary.includedContracts} />
            <MiniMetric label="Manual / Asaas" value={summary.manualContracts} />
            <MiniMetric label="Atrasos" value={summary.overdueFinanceCount} />
          </div>

          <Link href="/admin/saas" className="mt-6 inline-block text-sm font-medium text-indigo-600">Gerenciar contratos e acessos →</Link>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</span>
      <span className="text-lg font-black text-slate-900">{value}</span>
    </div>
  );
}




