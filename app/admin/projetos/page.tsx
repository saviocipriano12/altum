"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useAuth } from "@/context/AuthContext";
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
import type { TimestampLike } from "@/app/types/domain";

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
  createdAt?: TimestampLike | number | string | null;
}

const STATUS_OPTIONS: ProjetoStatus[] = [
  "Onboarding",
  "Ativo",
  "Pausado",
  "Encerrado",
];

export default function ProjetosPage() {
  const { user } = useAuth();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState({
    clientId: "",
    titulo: "",
    canalPrincipal: "",
    servicosText: "",
    valorMensal: "",
    status: "Onboarding" as ProjetoStatus,
  });

  // Dados administrativos passam pelo servidor para manter as regras do Firestore fechadas.
  useEffect(() => {
    if (!user) {
      setClientes([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      authedFetch("/api/clientes"),
      authedFetch("/api/admin/dashboard?include=projetos"),
    ])
      .then(async ([clientsResponse, projectsResponse]) => {
        const clientsPayload = (await clientsResponse.json()) as { clientes?: ClienteOption[] };
        const projectsPayload = (await projectsResponse.json()) as { projetos?: Projeto[] };
        if (!clientsResponse.ok || !projectsResponse.ok) throw new Error("Falha ao carregar projetos.");
        if (cancelled) return;
        setClientes(Array.isArray(clientsPayload.clientes) ? clientsPayload.clientes : []);
        setProjetos(Array.isArray(projectsPayload.projetos) ? projectsPayload.projetos : []);
      })
      .catch((error) => {
        console.error("Erro ao carregar projetos:", error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Falha ao carregar projetos.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, refreshKey]);

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

      const res = await authedFetch("/api/projetos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          clientId: form.clientId,
          clientName: clienteSelecionado?.name || "Cliente",
          canalPrincipal: form.canalPrincipal.trim() || "Nao informado",
          servicos,
          status: form.status,
          valorMensal: valor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao criar projeto.");

      setRefreshKey((value) => value + 1);

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
      alert("Nao foi possivel criar o projeto.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError} Os dados podem estar desatualizados.</p>}
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide">Projetos</h1>
          <p className="text-sm text-slate-500">
            Acompanhe todos os projetos em andamento na ALTUM por cliente, canal e escopo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="px-3 py-1 rounded-full border border-emerald-500/50 bg-emerald-500/10">
            {ativos} ativos - {projetos.length} no total
          </span>
        </div>
      </div>

      {/* Filtro + criacao rapida */}
      <div className="flex flex-col gap-4">
        {/* Busca */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Buscar projeto
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
            <Search size={16} className="text-slate-400" />
            <input
              placeholder="Titulo do projeto, cliente ou canal"
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Novo projeto rapido */}
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-indigo-700">Novo projeto</summary>
        <form
          onSubmit={handleCreateProject}
          className="pt-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Novo projeto rapido
            </p>
            <span className="text-[11px] text-slate-400">
              Cadastro rapido para abrir o projeto e seguir para o detalhamento.
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {/* Cliente */}
            <select
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs outline-none border border-slate-200"
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

            {/* Titulo */}
            <input
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs outline-none border border-slate-200 placeholder:text-slate-400"
              placeholder="Titulo do projeto *"
              value={form.titulo}
              onChange={(e) =>
                setForm((f) => ({ ...f, titulo: e.target.value }))
              }
            />

            {/* Canal principal */}
            <input
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs outline-none border border-slate-200 placeholder:text-slate-400"
              placeholder="Canal principal (Meta, Google, LP, etc.)"
              value={form.canalPrincipal}
              onChange={(e) =>
                setForm((f) => ({ ...f, canalPrincipal: e.target.value }))
              }
            />

            {/* Valor mensal */}
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 border border-slate-200">
              <DollarSign size={14} className="text-slate-400" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                placeholder="Valor mensal (opcional)"
                value={form.valorMensal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valorMensal: e.target.value }))
                }
              />
            </div>

            {/* Status */}
            <select
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs outline-none border border-slate-200"
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

            {/* Servicos */}
            <input
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs outline-none border border-slate-200 placeholder:text-slate-400"
              placeholder="Servicos (separados por virgula)"
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
        </details>
      </div>

      {/* Lista de projetos */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando projetos...
          </div>
        )}

        {!loading && filteredProjetos.length === 0 && (
          <p className="text-sm text-slate-500">
            Nenhum projeto encontrado. Crie o primeiro usando o formulario acima.
          </p>
        )}

        {filteredProjetos.map((projeto) => {
          const statusStyles =
            projeto.status === "Ativo"
              ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/40"
              : projeto.status === "Onboarding"
              ? "bg-blue-500/10 text-blue-700 border border-blue-500/40"
              : projeto.status === "Pausado"
              ? "bg-amber-500/10 text-amber-700 border border-amber-500/40"
              : "bg-slate-50 text-slate-500 border border-slate-200";

          return (
            <div
              key={projeto.id}
              className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-500/60 transition"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                {/* Esquerda */}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {projeto.titulo}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles}`}
                    >
                      {projeto.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <UserCircle2 size={14} className="text-slate-400" />
                      {projeto.clientName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Target size={14} className="text-slate-400" />
                      Canal: {projeto.canalPrincipal}
                    </span>
                    {typeof projeto.valorMensal === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign size={14} className="text-slate-400" />
                        {projeto.valorMensal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                        /mes
                      </span>
                    )}
                  </div>

                  {projeto.servicos && projeto.servicos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {projeto.servicos.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direita */}
                <div className="flex flex-col items-start gap-2 text-xs text-slate-700 md:items-end">
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Layers size={14} className="text-slate-400" />
                    ID: {projeto.id.slice(0, 6)}...
                  </span>

                  <Link
  href={`/admin/projetos/${projeto.id}`}
  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] hover:bg-slate-50 transition"
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


