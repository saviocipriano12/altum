"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
import {
  Plus,
  Search,
  Loader2,
  ArrowRight,
  FileText,
  UserCircle2,
  Target,
  DollarSign,
  Calendar,
} from "lucide-react";
import type { TimestampLike } from "@/app/types/domain";

type OrcamentoStatus = "Rascunho" | "Enviado" | "Aprovado" | "Perdido";
type OrcamentoTipo = "Projeto unico" | "Recorrente";

interface ClienteOption {
  id: string;
  name: string;
}

interface ProjetoOption {
  id: string;
  titulo: string;
  clientName: string;
}

interface Orcamento {
  id: string;
  titulo: string;
  clientId: string;
  clientName: string;
  projectId?: string | null;
  projectTitle?: string | null;
  tipo: OrcamentoTipo;
  status: OrcamentoStatus;
  valorTotal?: number;
  validade?: string;
  resumo?: string;
  createdAt?: TimestampLike | number | null;
}

const STATUS_OPTIONS: OrcamentoStatus[] = [
  "Rascunho",
  "Enviado",
  "Aprovado",
  "Perdido",
];

const TIPO_OPTIONS: OrcamentoTipo[] = ["Projeto unico", "Recorrente"];

export default function OrcamentosPage() {
  const { user, isAdmin } = useAuth();
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [projetos, setProjetos] = useState<ProjetoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    projectId: "",
    titulo: "",
    tipo: "Projeto unico" as OrcamentoTipo,
    status: "Rascunho" as OrcamentoStatus,
    valorTotal: "",
    validade: "",
    resumo: "",
  });

  // Carrega clientes
  useEffect(() => {
    if (!user) {
      setClientes([]);
      return;
    }

    const clientsRef = collection(db, "clientes");
    const q = isAdmin
      ? query(clientsRef, orderBy("name", "asc"))
      : query(clientsRef, where("ownerId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: ClienteOption[] = snap.docs.map((d) => ({
          id: d.id,
          name: ((d.data() as { name?: string }).name) || "Cliente sem nome",
        }));
        setClientes(docs);
      },
      (err) => {
        console.error("Erro ao carregar clientes para orcamentos:", err);
      }
    );

    return () => unsub();
  }, [user, isAdmin]);

  // Carrega projetos
  useEffect(() => {
    if (!user) {
      setProjetos([]);
      return;
    }

    const projectsRef = collection(db, "projetos");
    const q = isAdmin
      ? query(projectsRef, orderBy("createdAt", "desc"))
      : query(projectsRef, where("ownerId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: ProjetoOption[] = snap.docs.map((d) => {
          const data = d.data() as { titulo?: string; clientName?: string };
          return {
            id: d.id,
            titulo: data.titulo || "Projeto",
            clientName: data.clientName || "Cliente",
          };
        });
        setProjetos(docs);
      },
      (err) => {
        console.error("Erro ao carregar projetos para orcamentos:", err);
      }
    );

    return () => unsub();
  }, [user, isAdmin]);

  // Carrega orcamentos
  useEffect(() => {
    if (!user) {
      setOrcamentos([]);
      setLoading(false);
      return;
    }

    const budgetsRef = collection(db, "orcamentos");
    const q = isAdmin
      ? query(budgetsRef, orderBy("createdAt", "desc"))
      : query(budgetsRef, where("ownerId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: Orcamento[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Orcamento, "id">),
        }));
        setOrcamentos(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Erro ao carregar orcamentos:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, isAdmin]);

  const filteredOrcamentos = useMemo(() => {
    if (!search.trim()) return orcamentos;
    const term = search.toLowerCase();
    return orcamentos.filter((o) => {
      return (
        o.titulo.toLowerCase().includes(term) ||
        o.clientName.toLowerCase().includes(term) ||
        (o.projectTitle || "").toLowerCase().includes(term)
      );
    });
  }, [orcamentos, search]);

  const enviados = orcamentos.filter((o) => o.status === "Enviado").length;
  const aprovados = orcamentos.filter((o) => o.status === "Aprovado").length;

  async function handleCreateOrcamento(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    if (!form.clientId) return;

    try {
      setCreating(true);

      const clienteSelecionado = clientes.find(
        (c) => c.id === form.clientId
      );

      const projetoSelecionado = form.projectId
        ? projetos.find((p) => p.id === form.projectId)
        : undefined;

      const valor = form.valorTotal.trim()
        ? Number(form.valorTotal.replace(",", "."))
        : undefined;

      const res = await authedFetch("/api/orcamentos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          clientId: form.clientId,
          clientName: clienteSelecionado?.name || "Cliente",
          projectId: form.projectId || null,
          projectTitle: projetoSelecionado ? projetoSelecionado.titulo : null,
          tipo: form.tipo,
          status: form.status,
          valorTotal: valor,
          validade: form.validade.trim() || null,
          resumo: form.resumo.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao criar orcamento.");

      setForm({
        clientId: "",
        projectId: "",
        titulo: "",
        tipo: "Projeto unico",
        status: "Rascunho",
        valorTotal: "",
        validade: "",
        resumo: "",
      });
    } catch (err) {
      console.error("Erro ao criar orcamento:", err);
      alert("Nao foi possivel criar o orcamento.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Orcamentos</h1>
          <p className="text-sm text-white/60">
            Central de propostas enviadas pela ALTUM: clientes, projetos, valores e status.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          <span className="px-3 py-1 rounded-full border border-blue-500/50 bg-blue-500/10">
            {enviados} enviados
          </span>
          <span className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-500/10">
            {aprovados} aprovados
          </span>
          <span className="px-3 py-1 rounded-full border border-white/20 bg-white/5">
            {orcamentos.length} no total
          </span>
        </div>
      </div>

      {/* Filtro + criacao rapida */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Busca */}
        <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Buscar orcamento
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white/80">
            <Search size={16} className="text-white/40" />
            <input
              placeholder="Titulo, cliente ou projeto"
              className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Novo orcamento rapido */}
        <form
          onSubmit={handleCreateOrcamento}
          className="rounded-xl border border-white/10 bg-[#111111] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Novo orcamento rapido
            </p>
            <span className="text-[11px] text-white/40">
              Cadastro rapido para montar e enviar a proposta completa
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
                  {p.titulo} - {p.clientName}
                </option>
              ))}
            </select>

            {/* Titulo */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Titulo do orcamento *"
              value={form.titulo}
              onChange={(e) =>
                setForm((f) => ({ ...f, titulo: e.target.value }))
              }
            />

            {/* Valor total */}
            <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
              <DollarSign size={14} className="text-white/40" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                placeholder="Valor total (opcional)"
                value={form.valorTotal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valorTotal: e.target.value }))
                }
              />
            </div>

            {/* Tipo */}
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.tipo}
              onChange={(e) =>
                setForm((f) => ({ ...f, tipo: e.target.value as OrcamentoTipo }))
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
                  status: e.target.value as OrcamentoStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Validade */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Validade (ex: 7 dias, ate 10/01)"
              value={form.validade}
              onChange={(e) =>
                setForm((f) => ({ ...f, validade: e.target.value }))
              }
            />

            {/* Resumo */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40 md:col-span-2"
              placeholder="Resumo rapido (ex: LP + Trafego + CRM)"
              value={form.resumo}
              onChange={(e) =>
                setForm((f) => ({ ...f, resumo: e.target.value }))
              }
            />
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
                Salvar orcamento
              </>
            )}
          </button>
        </form>
      </div>

      {/* Lista de orcamentos */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" />
            Carregando orcamentos...
          </div>
        )}

        {!loading && filteredOrcamentos.length === 0 && (
          <p className="text-sm text-white/50">
            Nenhum orcamento encontrado. Crie o primeiro usando o formulario acima.
          </p>
        )}

        {filteredOrcamentos.map((orc) => {
          const statusStyles =
            orc.status === "Aprovado"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
              : orc.status === "Enviado"
              ? "bg-blue-500/10 text-blue-300 border border-blue-500/40"
              : orc.status === "Perdido"
              ? "bg-red-500/10 text-red-300 border border-red-500/40"
              : "bg-white/5 text-white/60 border border-white/20";

          return (
            <div
              key={orc.id}
              className="rounded-xl border border-white/10 bg-[#101010] p-4 hover:border-blue-500/60 transition"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                {/* Esquerda */}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-white/90">
                      {orc.titulo}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles}`}
                    >
                      {orc.status}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide border border-white/15 bg-white/5 text-white/70">
                      {orc.tipo}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 size={14} className="text-white/40" />
                      {orc.clientName}
                    </span>
                    {orc.projectTitle && (
                      <span className="inline-flex items-center gap-1">
                        <Target size={14} className="text-white/40" />
                        {orc.projectTitle}
                      </span>
                    )}
                    {typeof orc.valorTotal === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign size={14} className="text-white/40" />
                        {orc.valorTotal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60 mt-1">
                    {orc.validade && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={13} className="text-white/40" />
                        Validade: {orc.validade}
                      </span>
                    )}
                    {orc.resumo && (
                      <span className="inline-flex items-center gap-1">
                        <FileText size={13} className="text-white/40" />
                        {orc.resumo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Direita */}
                <div className="flex flex-col items-start gap-2 text-xs text-white/70 md:items-end">
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
                    ID: {orc.id.slice(0, 6)}...
                  </span>

                 <Link
  href={`/admin/orcamentos/${orc.id}`}
  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] hover:bg-white/10 transition"
>
  <span>Ver detalhes do orcamento</span>
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


