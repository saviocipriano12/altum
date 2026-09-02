"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { AgencyActivity } from "@/app/types/domain";
import { useAuth } from "@/context/AuthContext";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Trash2,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

type Atividade = AgencyActivity & {
  id: string;
  data?: string; // ISO string
  status: "pendente" | "concluida";
};

export default function AtividadesPage() {
  const { user, isAdmin } = useAuth();
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [tipo, setTipo] = useState("followup");
  const [leadId, setLeadId] = useState("");
  const [clienteNome, setClienteNome] = useState("");

  useEffect(() => {
    if (!user) {
      setAtividades([]);
      setLoading(false);
      return;
    }

    let active = true;
    void authedFetch("/api/admin/dashboard?include=atividades")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { atividades?: Atividade[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Falha ao carregar atividades.");
        if (active) {
          setAtividades((payload.atividades || []).sort((a, b) => String(a.data || "").localeCompare(String(b.data || ""))));
        }
      })
      .catch((error) => console.error("Erro ao carregar atividades:", error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, isAdmin, refreshKey]);

  async function criarAtividade(e: React.FormEvent) {
    e.preventDefault();
    if (!descricao.trim()) return;

    try {
      setSaving(true);
      const res = await authedFetch("/api/atividades/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: descricao.trim(),
          data: data || null,
          status: "pendente",
          tipo: tipo || null,
          leadId: leadId || null,
          clienteNome: clienteNome || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao criar atividade.");

      setDescricao("");
      setData("");
      setTipo("followup");
      setLeadId("");
      setClienteNome("");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("Erro ao criar atividade:", err);
      alert("Nao foi possivel criar atividade.");
    } finally {
      setSaving(false);
    }
  }

  async function alternarStatus(id: string, statusAtual: "pendente" | "concluida") {
    try {
      const res = await authedFetch("/api/atividades/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          patch: {
            status: statusAtual === "pendente" ? "concluida" : "pendente",
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao atualizar atividade.");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("Erro ao atualizar atividade:", err);
      alert("Nao foi possivel atualizar atividade.");
    }
  }

  async function removerAtividade(id: string) {
    if (!confirm("Tem certeza que deseja apagar esta atividade?")) return;
    try {
      const res = await authedFetch("/api/atividades/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Falha ao remover atividade.");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("Erro ao remover atividade:", err);
      alert("Nao foi possivel remover atividade.");
    }
  }

  const pendentes = atividades.filter((a) => a.status === "pendente");
  const concluidas = atividades.filter((a) => a.status === "concluida");

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-wide flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            Atividades & Agenda
          </h1>
          <p className="text-sm text-white/60 max-w-xl">
            Organize follow-ups de leads, tarefas internas, reuniões e tudo que
            precisa ser feito dentro da ALTUM.
          </p>
        </div>

        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white"
        >
          Voltar ao dashboard
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* FORMULÁRIO NOVA ATIVIDADE */}
      <section className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-white/70" />
          <div>
            <h2 className="text-sm font-semibold">Nova atividade rápida</h2>
            <p className="text-xs text-white/60">
              Crie uma tarefa em poucos segundos e ela já aparece no painel e no
              dashboard.
            </p>
          </div>
        </div>

        <form
          onSubmit={criarAtividade}
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 items-end"
        >
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs text-white/60">
              Descrição da atividade *
            </label>
            <input
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
              placeholder="Ex: Ligar para o restaurante X para alinhar proposta"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Data / hora
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60">Tipo</label>
            <select
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="followup">Follow-up</option>
              <option value="reuniao">Reunião</option>
              <option value="ligacao">Ligação</option>
              <option value="interno">Tarefa interna</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60">
              Lead / Cliente (opcional)
            </label>
            <input
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
              placeholder="Nome do cliente ou referência do lead"
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60">
              ID do lead (opcional)
            </label>
            <input
              className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none placeholder:text-white/40"
              placeholder="Se quiser relacionar com um lead específico"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
            />
          </div>

          <div className="lg:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 transition disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Adicionar atividade
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* LISTAS: PENDENTES / CONCLUÍDAS */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Pendentes */}
        <div className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-semibold">Pendentes</h2>
            </div>
            <span className="text-[11px] rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              {pendentes.length} em aberto
            </span>
          </div>

          {pendentes.length === 0 && (
            <p className="text-xs text-white/50">
              Nenhuma atividade pendente. Ótimo sinal — operação em dia.
            </p>
          )}

          <div className="space-y-2">
            {pendentes.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-white/10 bg-black/40 p-3 flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{a.descricao}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                    {a.data && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.data).toLocaleString("pt-BR")}
                      </span>
                    )}
                    {a.tipo && (
                      <span className="rounded-full border border-white/10 px-2 py-0.5">
                        {a.tipo}
                      </span>
                    )}
                    {a.clienteNome && (
                      <span className="truncate max-w-[160px]">
                        Cliente: {a.clienteNome}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => alternarStatus(a.id, a.status)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 transition"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Concluir
                  </button>
                  <button
                    onClick={() => removerAtividade(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/20 transition"
                  >
                    <Trash2 className="h-3 w-3" />
                    Apagar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concluídas */}
        <div className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <h2 className="text-sm font-semibold">Concluídas</h2>
            </div>
            <span className="text-[11px] rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
              {concluidas.length} finalizadas
            </span>
          </div>

          {concluidas.length === 0 && (
            <p className="text-xs text-white/50">
              Assim que você começar a marcar tarefas como concluídas, elas
              aparecem aqui.
            </p>
          )}

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {concluidas.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-white/10 bg-black/40 p-3 flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium line-through text-white/70">
                    {a.descricao}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                    {a.data && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.data).toLocaleString("pt-BR")}
                      </span>
                    )}
                    {a.tipo && (
                      <span className="rounded-full border border-white/10 px-2 py-0.5">
                        {a.tipo}
                      </span>
                    )}
                    {a.clienteNome && (
                      <span className="truncate max-w-[160px]">
                        Cliente: {a.clienteNome}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => alternarStatus(a.id, a.status)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 transition"
                >
                  Reabrir
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {loading && (
        <p className="text-xs text-white/40">Carregando atividades…</p>
      )}
    </div>
  );
}
