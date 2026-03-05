"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/firebaseConfig";
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
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
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

  const [form, setForm] = useState<LaunchForm>(initialForm);

  // 1. CARREGAMENTO COM REGRA DE NEGÓCIO
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
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
      }
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-black"><Loader2 className="animate-spin text-white/20" size={50}/></div>;
  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/80">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 lg:p-12 font-sans selection:bg-blue-500/20">
      
      {/* HEADER */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
             <div className={cx("px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border", 
                isAdmin ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20")}>
                {isAdmin ? "Authority System" : "Consultor Altum"}
             </div>
             <button onClick={() => setHideValues(!hideValues)} className="text-white/10 hover:text-white transition">
                {hideValues ? <EyeOff size={18}/> : <Eye size={18}/>}
             </button>
          </div>
          <h1 className="text-7xl lg:text-8xl font-black tracking-tighter uppercase italic leading-none">
            Cofre <span className="text-white/10">Altum</span>
          </h1>
        </div>

        {isAdmin && (
           <button onClick={() => setIsModalOpen(true)} className="bg-white text-black font-black px-10 py-5 rounded-full transition hover:bg-zinc-200 flex items-center gap-3 shadow-2xl active:scale-95 text-xs uppercase tracking-widest">
             <Plus size={20} strokeWidth={4}/> Novo Lançamento
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
          <StatBox label={isAdmin ? "MRR Ativo" : "Próximo Repasse"} valor={hideValues ? "****" : (isAdmin ? money(stats.mrr) : money(stats.proximoRepasseValor))} sub={isAdmin ? "Recorrência Mensal" : (stats.proximoRepasseData ? `Previsto: ${stats.proximoRepasseData}` : "Sem data prevista")} icone={<History size={16}/>}/>
          <StatBox label={isAdmin ? "Lucro Líquido" : "Saldo Disponível"} valor={hideValues ? "****" : (isAdmin ? money(stats.lucroLiquido) : money(stats.pendentePayout))} sub="Líquido Real" icone={<Calculator size={16}/>} destaque />
      </div>

      {/* NAVEGAÇÃO SaaS */}
      <div className="max-w-7xl mx-auto mt-20">
        <div className="flex gap-10 border-b border-white/5 pb-4 overflow-x-auto scrollbar-hide">
            <NavTab active={activeTab === "resumo"} click={() => setActiveTab("resumo")} label="Estatísticas BI"/>
            <NavTab active={activeTab === "vendas"} click={() => setActiveTab("vendas")} label="Receitas / Vendas"/>
            {isAdmin && <NavTab active={activeTab === "contas"} click={() => setActiveTab("contas")} label="Saídas / Despesas"/>}
            {isAdmin && <NavTab active={activeTab === "equipe"} click={() => setActiveTab("equipe")} label="Gestão de Time"/>}
        </div>

        {/* CONTEÚDO DINMICO */}
        <div className="mt-12">
            {activeTab === "resumo" && <ResumoVisual transactions={data} />}
            
            {(activeTab === "vendas" || activeTab === "contas") && (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18}/>
                        <input placeholder="Filtrar lançamentos..." className="w-full bg-transparent border border-white/10 rounded-full py-3 pl-12 pr-4 text-xs focus:border-white/30 transition outline-none" value={search} onChange={e => setSearch(e.target.value)}/>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/98 backdrop-blur-3xl p-6">
            <form onSubmit={handleSave} className="bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-12 max-w-xl w-full shadow-4xl animate-in zoom-in">
                <div className="flex justify-between items-center mb-10 text-white">
                    <h3 className="text-3xl font-black uppercase italic tracking-tighter">Novo Registro</h3>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white/5 rounded-full transition"><X/></button>
                </div>
                <div className="grid grid-cols-2 gap-6 text-white text-xs font-bold uppercase tracking-widest">
                    <div className="col-span-full">
                        <label className="text-white/20 mb-2 block">Descrição / Cliente</label>
                        <input required value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-5 outline-none focus:border-white/20 transition"/>
                    </div>
                    <div>
                        <label className="text-white/20 mb-2 block">Valor Bruto</label>
                        <input required type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-5 outline-none focus:border-white/20 transition"/>
                    </div>
                    <div>
                        <label className="text-white/20 mb-2 block">Tipo</label>
                        <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as FinTipo, categoria: e.target.value === "Receita" ? "Mensalidade" : "Infra/API"})} className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-5 outline-none appearance-none">
                            <option value="Receita">Receita (Entrada)</option>
                            <option value="Despesa">Despesa (Gasto)</option>
                        </select>
                    </div>
                    {form.tipo === "Receita" && (
                        <>
                            <div>
                                <label className="text-white/20 mb-2 block">Vendedor</label>
                                <select
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
                                  className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-5 outline-none"
                                >
                                    <option value="">Direto / Admin</option>
                                    {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-white/20 mb-2 block">Comissão (%)</label>
                                <input type="number" value={form.comissaoPercent} onChange={e => setForm({...form, comissaoPercent: e.target.value})} className="w-full bg-white/[0.02] border border-white/5 rounded-xl p-5 outline-none"/>
                            </div>
                        </>
                    )}
                    <div className="col-span-full pt-6">
                        <button disabled={saving} className="w-full py-6 bg-white text-black font-black rounded-full hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-2xl">
                            {saving ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>} Efetivar Operação
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
        <div className={cx("p-10 border border-white/5 rounded-3xl relative overflow-hidden transition-all", 
            destaque ? "bg-white text-black shadow-2xl scale-[1.02]" : "bg-[#0A0A0A]")}>
            <div className={cx("absolute top-6 right-6 opacity-10", destaque ? "text-black" : "text-white")}>{icone}</div>
            <p className={cx("text-[10px] font-black uppercase tracking-[0.3em] mb-6", destaque ? "text-black/30" : "text-white/20")}>{label}</p>
            <h3 className="text-4xl font-black tracking-tighter leading-none">{valor}</h3>
            <p className={cx("text-[10px] mt-4 font-bold uppercase tracking-widest", destaque ? "text-black/30" : "text-white/5")}>{sub}</p>
        </div>
    );
}

function NavTab({ active, click, label }: { active: boolean; click: () => void; label: string }) {
    return (
        <button onClick={click} className={cx("text-[11px] font-black uppercase tracking-[0.4em] pb-3 border-b-2 transition-all shrink-0", 
            active ? "text-white border-white" : "text-white/5 border-transparent hover:text-white/20")}>
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
        <div className="overflow-x-auto border-t border-white/5">
            <table className="w-full text-left">
                <thead className="text-[10px] font-black uppercase text-white/10 tracking-[0.2em]">
                    <tr>
                        <th className="py-8 pr-4">Timeline</th>
                        <th className="py-8 pr-4">Identificação</th>
                        <th className="py-8 pr-4">Montante</th>
                        <th className="py-8 text-right">Status / Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {lista.map((t: Transaction) => (
                        <tr key={t.id} className="group transition-colors hover:bg-white/[0.01]">
                            <td className="py-8 pr-4 text-[10px] font-mono text-white/10 italic">{t.vencimento}</td>
                            <td className="py-8 pr-4">
                                <p className="text-sm font-black text-white/70 uppercase tracking-tighter group-hover:text-white transition-colors">{t.descricao}</p>
                                <p className="text-[10px] text-white/10 font-bold uppercase mt-1 tracking-widest">{t.categoria}</p>
                            </td>
                            <td className="py-8 pr-4 text-xs font-black">
                                {isAdmin ? (
                                  <span className={t.tipo === "Despesa" ? "text-white/20" : "text-white/80"}>
                                      {t.tipo === "Despesa" ? "-" : ""}{esconderValores ? "****" : money(t.valor)}
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <span className={t.tipo === "Despesa" ? "text-white/20" : "text-emerald-300"}>
                                      {esconderValores ? "****" : money(t.valorComissao ?? 0)}
                                    </span>
                                    <p className="text-[10px] uppercase tracking-widest text-white/25">
                                      venda {esconderValores ? "****" : money(t.valor)}
                                    </p>
                                  </div>
                                )}
                            </td>
                            <td className="py-8 text-right">
                                <div className="flex items-center justify-end gap-6">
                                    {isAdmin ? (
                                        <select 
                                            value={t.status} 
                                            onChange={(e) => onUpdateStatus(t.id, e.target.value as FinStatus)}
                                            className="bg-transparent text-[10px] font-black uppercase outline-none text-white/30 hover:text-white transition cursor-pointer"
                                        >
                                            <option value="pago">Finalizado</option>
                                            <option value="pendente">Aguardando</option>
                                            <option value="atrasado">Em Atraso</option>
                                            <option value="cancelado">Cancelado</option>
                                        </select>
                                    ) : (
                                        <span className="text-[10px] font-black uppercase text-white/20">{t.status}</span>
                                    )}
                                    {isAdmin && <button onClick={() => onDelete(t.id)} className="opacity-0 group-hover:opacity-100 text-white/10 hover:text-red-500 transition"><Trash2 size={16}/></button>}
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
            <div className="p-12 border border-white/5 bg-[#080808] rounded-[3rem] flex justify-between items-center">
                <div>
                    <p className="text-[10px] font-black uppercase text-white/20 tracking-[0.3em]">Payout Acumulado</p>
                    <h3 className="text-6xl font-black mt-3 tracking-tighter">{money(pendente)}</h3>
                </div>
                <HandCoins size={48} className="text-white/5"/>
            </div>

            <div className="bg-[#0a0a0a] border border-white/5 rounded-[3rem] overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-white/5 text-[10px] font-black uppercase text-white/20 tracking-widest">
                        <tr>
                            <th className="px-10 py-8">Consultor</th>
                            <th className="px-10 py-8">Comissão</th>
                            <th className="px-10 py-8 text-right">Liquidação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {lista.filter((t) => t.tipo === "Receita" && t.status === "pago").map((t) => (
                            <tr key={t.id}>
                                <td className="px-10 py-8 font-bold text-white text-xs uppercase">{t.vendedorNome} <br/><span className="text-[9px] text-white/20 font-black tracking-widest">{t.descricao}</span></td>
                                <td className="px-10 py-8 font-black text-white/80">{money(t.valorComissao ?? 0)}</td>
                                <td className="px-10 py-8 text-right">
                                    <button 
                                        onClick={() => onTogglePayout(t.id, t.payoutStatus || "pendente")}
                                        className={cx("px-6 py-2 rounded-full text-[10px] font-black uppercase border transition-all",
                                            t.payoutStatus === "liquidado" ? "bg-white text-black border-white" : "bg-white/5 text-white/30 border-white/10 hover:border-white/40")}
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

    return (
        <div className="h-[450px] w-full animate-in fade-in duration-1000">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="noir" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fff" stopOpacity={0.05}/>
                            <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#ffffff10', fontSize: 10, fontWeight: 'bold'}} dy={15} />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip cursor={{stroke: 'white', strokeWidth: 0.5}} contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #ffffff05', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="total" stroke="#ffffff10" strokeWidth={1.5} fillOpacity={1} fill="url(#noir)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}




