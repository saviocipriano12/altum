"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  Layers,
  UserCircle2,
  Target,
  DollarSign,
} from "lucide-react";

type ProjetoStatus = "Onboarding" | "Ativo" | "Pausado" | "Encerrado";

interface ClienteOption {
  id: string;
  name: string;
}

interface Projeto {
  id: string;
  titulo: string;
  status: ProjetoStatus;
  clientId: string;
  clientName: string;
  canalPrincipal: string;
  servicos: string[];
  valorMensal?: number;
  createdAt?: any;
}

const STATUS_OPTIONS: ProjetoStatus[] = [
  "Onboarding",
  "Ativo",
  "Pausado",
  "Encerrado",
];

export default function ProjetosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    titulo: "",
    canalPrincipal: "",
    servicosText: "",
    valorMensal: "",
    status: "Onboarding" as ProjetoStatus,
  });

  // Carrega clientes pra popular o select
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
        console.error("Erro ao carregar clientes para projetos:", err);
      }
    );

    return () => unsub();
  }, []);

  // Carrega projetos em tempo real
  useEffect(() => {
    const q = query(collection(db, "projetos"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: Projeto[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Projeto, "id">),
        }));
        setProjetos(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Erro ao carregar projetos:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredProjetos = useMemo(() => {
    if (!search.trim()) return projetos;
    const term = search.toLowerCase();
    return projetos.filter((p) => {
      return (
        p.titulo.toLowerCase().includes(term) ||
        p.clientName.toLowerCase().includes(term) ||
        p.canalPrincipal.toLowerCase().includes(term)
      );
    });
  }, [projetos, search]);

  const ativos = projetos.filter((p) => p.status === "Ativo").length;

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    if (!form.clientId) return;

    try {
      setCreating(true);

      const clienteSelecionado = clientes.find(
        (c) => c.id === form.clientId
      );

      const servicos = form.servicosText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const valor = form.valorMensal.trim()
        ? Number(form.valorMensal.replace(",", "."))
        : undefined;

      await addDoc(collection(db, "projetos"), {
        titulo: form.titulo.trim(),
        clientId: form.clientId,
        clientName: clienteSelecionado?.name || "Cliente",
        canalPrincipal: form.canalPrincipal.trim() || "Não informado",
        servicos,
        status: form.status,
        valorMensal: valor,
        createdAt: serverTimestamp(),
      });

      setForm({
        clientId: "",
        titulo: "",
        canalPrincipal: "",
        servicosText: "",
        valorMensal: "",
        status: "Onboarding",
      });
    } catch (err) {
      console.error("Erro ao criar projeto:", err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Projetos</h1>
          <p className="text-sm text-white/60">
            Acompanhe todos os projetos em andamento na ALTUM por cliente, canal e escopo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          <span className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-500/10">
            {ativos} ativos • {projetos.length} no total
          </span>
        </div>
      </div>

      {/* Filtro + criação rápida */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Busca */}
        <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
            Buscar projeto
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white/80">
            <Search size={16} className="text-white/40" />
            <input
              placeholder="Título do projeto, cliente ou canal"
              className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Novo projeto rápido */}
        <form
          onSubmit={handleCreateProject}
          className="rounded-xl border border-white/10 bg-[#111111] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Novo projeto rápido
            </p>
            <span className="text-[11px] text-white/40">
              MVP • depois criamos tela completa de gestão
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

            {/* Título */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Título do projeto *"
              value={form.titulo}
              onChange={(e) =>
                setForm((f) => ({ ...f, titulo: e.target.value }))
              }
            />

            {/* Canal principal */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Canal principal (Meta, Google, LP, etc.)"
              value={form.canalPrincipal}
              onChange={(e) =>
                setForm((f) => ({ ...f, canalPrincipal: e.target.value }))
              }
            />

            {/* Valor mensal */}
            <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
              <DollarSign size={14} className="text-white/40" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                placeholder="Valor mensal (opcional)"
                value={form.valorMensal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valorMensal: e.target.value }))
                }
              />
            </div>

            {/* Status */}
            <select
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as ProjetoStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Serviços */}
            <input
              className="rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10 placeholder:text-white/40"
              placeholder="Serviços (separados por vírgula)"
              value={form.servicosText}
              onChange={(e) =>
                setForm((f) => ({ ...f, servicosText: e.target.value }))
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
                Salvar projeto
              </>
            )}
          </button>
        </form>
      </div>

      {/* Lista de projetos */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" />
            Carregando projetos...
          </div>
        )}

        {!loading && filteredProjetos.length === 0 && (
          <p className="text-sm text-white/50">
            Nenhum projeto encontrado. Crie o primeiro usando o formulário acima.
          </p>
        )}

        {filteredProjetos.map((projeto) => {
          const statusStyles =
            projeto.status === "Ativo"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
              : projeto.status === "Onboarding"
              ? "bg-blue-500/10 text-blue-300 border border-blue-500/40"
              : projeto.status === "Pausado"
              ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
              : "bg-white/5 text-white/60 border border-white/20";

          return (
            <div
              key={projeto.id}
              className="rounded-xl border border-white/10 bg-[#101010] p-4 hover:border-blue-500/60 transition"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                {/* Esquerda */}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-white/90">
                      {projeto.titulo}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles}`}
                    >
                      {projeto.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 size={14} className="text-white/40" />
                      {projeto.clientName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Target size={14} className="text-white/40" />
                      Canal: {projeto.canalPrincipal}
                    </span>
                    {typeof projeto.valorMensal === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign size={14} className="text-white/40" />
                        {projeto.valorMensal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                        /mês
                      </span>
                    )}
                  </div>

                  {projeto.servicos && projeto.servicos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {projeto.servicos.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direita */}
                <div className="flex flex-col items-start gap-2 text-xs text-white/70 md:items-end">
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/50">
                    <Layers size={14} className="text-white/40" />
                    ID: {projeto.id.slice(0, 6)}…
                  </span>

                  <Link
  href={`/admin/projetos/${projeto.id}`}
  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] hover:bg-white/10 transition"
>
  <span>Ver detalhes do projeto</span>
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
