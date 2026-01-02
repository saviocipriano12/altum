"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  Plus,
  Search,
  Loader2,
  ArrowRight,
  DollarSign,
  Calendar,
  CreditCard,
  AlertTriangle,
  UserCircle2,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

type LancamentoStatus = "Em dia" | "Pendente" | "Atrasado" | "Cancelado";
type LancamentoTipo = "Mensalidade" | "Projeto único" | "Setup" | "Outro";

interface ClienteOption {
  id: string;
  name: string;
}

interface ProjetoOption {
  id: string;
  titulo: string;
  clientName: string;
}

interface Lancamento {
  id: string;
  clientId: string;
  clientName: string;
  projectId?: string | null;
  projectTitle?: string | null;
  tipo: LancamentoTipo;
  status: LancamentoStatus;
  valor: number;
  referencia?: string; // ex: "Jan/2026", "Setup Site", etc
  vencimento?: string; // string livre por enquanto
  meioPagamento?: string;
  createdAt?: any;
  dataPagamento?: any | null;
}

const STATUS_OPTIONS: LancamentoStatus[] = [
  "Em dia",
  "Pendente",
  "Atrasado",
  "Cancelado",
];

const TIPO_OPTIONS: LancamentoTipo[] = [
  "Mensalidade",
  "Projeto único",
  "Setup",
  "Outro",
];

export default function FinanceiroPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [projetos, setProjetos] = useState<ProjetoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    projectId: "",
    tipo: "Mensalidade" as LancamentoTipo,
    status: "Pendente" as LancamentoStatus,
    valor: "",
    referencia: "",
    vencimento: "",
    meioPagamento: "",
  });

  // Carrega clientes
  useEffect(() => {
    const q = query(collection(db, "clientes"), orderBy("name", "asc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: ClienteOption[] = snap.docs.map((d) => ({
          id: d.id,
          name: (d.data() as any).name || "Cliente sem nome",
        }));
        setClientes(docs);
      },
      (err) => {
        console.error("Erro ao carregar clientes para financeiro:", err);
      }
    );

    return () => unsub();
  }, []);

  // Carrega projetos
  useEffect(() => {
    const q = query(collection(db, "projetos"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: ProjetoOption[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            titulo: data.titulo || "Projeto",
            clientName: data.clientName || "Cliente",
          };
        });
        setProjetos(docs);
      },
      (err) => {
        console.error("Erro ao carregar projetos para financeiro:", err);
      }
    );

    return () => unsub();
  }, []);

  // Carrega lançamentos financeiros
  useEffect(() => {
    const q = query(collection(db, "financeiro"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: Lancamento[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Lancamento, "id">),
        }));
        setLancamentos(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Erro ao carregar financeiro:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredLancamentos = useMemo(() => {
    if (!search.trim()) return lancamentos;
    const term = search.toLowerCase();
    return lancamentos.filter((l) => {
      return (
        l.clientName.toLowerCase().includes(term) ||
        (l.projectTitle || "").toLowerCase().includes(term) ||
        (l.referencia || "").toLowerCase().includes(term)
      );
    });
  }, [lancamentos, search]);

  // KPIs
  const totalPendente = lancamentos
    .filter((l) => l.status === "Pendente" || l.status === "Atrasado")
    .reduce((sum, l) => sum + (l.valor || 0), 0);

  const totalEmDia = lancamentos
    .filter((l) => l.status === "Em dia")
    .reduce((sum, l) => sum + (l.valor || 0), 0);

  const atrasados = lancamentos.filter((l) => l.status === "Atrasado").length;

  async function handleCreateLancamento(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) return;
    if (!form.valor.trim()) return;

    try {
      setCreating(true);

      const clienteSelecionado = clientes.find(
        (c) => c.id === form.clientId
      );

      const projetoSelecionado = form.projectId
        ? projetos.find((p) => p.id === form.projectId)
        : undefined;

      const valorNumber = Number(form.valor.replace(",", "."));

      await addDoc(collection(db, "financeiro"), {
        clientId: form.clientId,
        clientName: clienteSelecionado?.name || "Cliente",
        projectId: form.projectId || null,
        projectTitle: projetoSelecionado ? projetoSelecionado.titulo : null,
        tipo: form.tipo,
        status: form.status,
        valor: valorNumber,
        referencia: form.referencia.trim() || null,
        vencimento: form.vencimento.trim() || null,
        meioPagamento: form.meioPagamento.trim() || null,
        createdAt: serverTimestamp(),
        dataPagamento: null,
      });

      setForm({
        clientId: "",
        projectId: "",
        tipo: "Mensalidade",
        status: "Pendente",
        valor: "",
        referencia: "",
        vencimento: "",
        meioPagamento: "",
      });
    } catch (err) {
      console.error("Erro ao criar lançamento financeiro:", err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Financeiro</h1>
          <p className="text-sm text-white/60">
            Visão financeira da ALTUM: mensalidades, projetos únicos, setups e status das cobranças.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-emerald-200">
                Recebido
              </span>
              <TrendingUp className="h-3 w-3 text-emerald-300" />
            </div>
            <p className="mt-1 text-sm font-semibold text-emerald-100">
              {totalEmDia.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-amber-100">
                Em aberto
              </span>
              <DollarSign className="h-3 w-3 text-amber-200" />
            </div>
            <p className="mt-1 text-sm font-semibold text-amber-50">
              {totalPendente.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-red-100">
                Atrasados
              </span>
              <AlertTriangle className="h-3 w-3 text-red-200" />
            </div>
            <p className="mt-1 text-sm font-semibold text-red-50">
              {atrasados}
            </p>
          </div>
        </div>
      </div>

      {/* Filtro + criação */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Busca */}
        <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Buscar lançamento
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white/80">
            <Search size={16} className="text-white/40" />
            <input
              placeholder="Cliente, projeto ou referência"
              className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Novo lançamento */}
        <form
          onSubmit={handleCreateLancamento}
          className="rounded-xl border border-white/10 bg-[#111111] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Novo lançamento financeiro
            </p>
            <span className="text-[11px] text-white/40">
              MVP • depois conectamos automações
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {/* Cliente */}
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.clientId}
              onChange={(e) =>
                setForm((f) => ({ ...f, clientId: e.target.value }))
              }
            >
              <option value="">Selecione um cliente *</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Projeto opcional */}
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.projectId}
              onChange={(e) =>
                setForm((f) => ({ ...f, projectId: e.target.value }))
              }
            >
              <option value="">Vincular a um projeto (opcional)</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo} • {p.clientName}
                </option>
              ))}
            </select>

            {/* Tipo */}
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.tipo}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tipo: e.target.value as LancamentoTipo,
                }))
              }
            >
              {TIPO_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Status */}
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as LancamentoStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Valor */}
            <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
              <DollarSign size={14} className="text-white/40" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                placeholder="Valor (ex: 1500)"
                value={form.valor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valor: e.target.value }))
                }
              />
            </div>

            {/* Referência */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Referência (ex: Jan/2026, Setup Site)"
              value={form.referencia}
              onChange={(e) =>
                setForm((f) => ({ ...f, referencia: e.target.value }))
              }
            />

            {/* Vencimento */}
            <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
              <Calendar size={14} className="text-white/40" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                placeholder="Vencimento (ex: 10/01/2026)"
                value={form.vencimento}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vencimento: e.target.value }))
                }
              />
            </div>

            {/* Meio de pagamento */}
            <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10 md:col-span-2">
              <CreditCard size={14} className="text-white/40" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                placeholder="Meio de pagamento (ex: Pix, Cartão, Boleto)"
                value={form.meioPagamento}
                onChange={(e) =>
                  setForm((f) => ({ ...f, meioPagamento: e.target.value }))
                }
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Plus size={14} />
                Salvar lançamento
              </>
            )}
          </button>
        </form>
      </div>

      {/* Lista de lançamentos */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" />
            Carregando financeiro...
          </div>
        )}

        {!loading && filteredLancamentos.length === 0 && (
          <p className="text-sm text-white/50">
            Nenhum lançamento encontrado. Crie o primeiro usando o formulário acima.
          </p>
        )}

        {filteredLancamentos.map((l) => {
          const statusStyles =
            l.status === "Em dia"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
              : l.status === "Pendente"
              ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
              : l.status === "Atrasado"
              ? "bg-red-500/10 text-red-300 border border-red-500/40"
              : "bg-white/5 text-white/60 border border-white/20";

          return (
            <div
              key={l.id}
              className="rounded-xl border border-white/10 bg-[#101010] p-4 hover:border-blue-500/60 transition"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                {/* Esquerda */}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-white/90">
                      {l.referencia || l.tipo}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles}`}
                    >
                      {l.status}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] border border-white/10 bg-white/5 text-white/70">
                      {l.tipo}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 size={14} className="text-white/40" />
                      {l.clientName}
                    </span>
                    {l.projectTitle && (
                      <span className="inline-flex items-center gap-1">
                        <Target size={14} className="text-white/40" />
                        {l.projectTitle}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <DollarSign size={14} className="text-white/40" />
                      {l.valor.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60 mt-1">
                    {l.vencimento && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={13} className="text-white/40" />
                        Vencimento: {l.vencimento}
                      </span>
                    )}
                    {l.meioPagamento && (
                      <span className="inline-flex items-center gap-1">
                        <CreditCard size={13} className="text-white/40" />
                        {l.meioPagamento}
                      </span>
                    )}
                  </div>
                </div>

                {/* Direita */}
                <div className="flex flex-col items-start gap-2 text-xs text-white/70 md:items-end">
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
                    ID: {l.id.slice(0, 6)}…
                  </span>

                  <Link
                    href={`/admin/financeiro/${l.id}`}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] hover:bg-white/10 transition"
                  >
                    <span>Ver detalhes</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
