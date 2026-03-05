"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { TimestampLike } from "@/app/types/domain";
import { doc, getDoc } from "firebase/firestore";
import {
  ArrowLeft,
  Layers,
  Target,
  UserCircle2,
  DollarSign,
  Calendar,
  ListTodo,
  Zap,
  Activity,
  Loader2,
  PencilLine,
  Save,
  XCircle,
  CheckCircle2,
  PauseCircle,
  Archive,
} from "lucide-react";
type ProjetoStatus = "Onboarding" | "Ativo" | "Pausado" | "Encerrado";

interface Projeto {
  id: string;
  titulo: string;
  status: ProjetoStatus;
  clientId: string;
  clientName: string;
  canalPrincipal: string;
  servicos: string[];
  valorMensal?: number;
  createdAt?: TimestampLike | number | null;
}

function toDate(value?: TimestampLike | number | null) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

const STATUS_OPTIONS: ProjetoStatus[] = [
  "Onboarding",
  "Ativo",
  "Pausado",
  "Encerrado",
];

export default function ProjetoDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState<ProjetoStatus | null>(null);
const [generatingRecurrence, setGeneratingRecurrence] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    canalPrincipal: "",
    servicosText: "",
    valorMensal: "",
  });

  useEffect(() => {
    async function fetchProjeto() {
      try {
        const ref = doc(db, "projetos", params.id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = {
            id: snap.id,
            ...(snap.data() as Omit<Projeto, "id">),
          };

          setProjeto(data);
          setForm({
            titulo: data.titulo || "",
            canalPrincipal: data.canalPrincipal || "",
            servicosText: (data.servicos || []).join(", "),
            valorMensal:
              typeof data.valorMensal === "number" ? String(data.valorMensal) : "",
          });
        } else {
          setProjeto(null);
        }
      } catch (err) {
        console.error("Erro ao carregar projeto:", err);
        setProjeto(null);
      } finally {
        setLoading(false);
      }
    }

    fetchProjeto();
  }, [params.id]);

  async function gerarCarneAnual() {
    if (!projeto) return;
    
    const confirmacao = confirm(
      `Isso ira gerar 12 lancamentos financeiros de R$ ${projeto.valorMensal} para os proximos 12 meses. Confirmar?`
    );
    if (!confirmacao) return;

    if (!projeto.valorMensal || projeto.valorMensal <= 0) {
      alert("Defina um valor mensal para o projeto antes de gerar o carne.");
      return;
    }

    setGeneratingRecurrence(true);

    try {
      const res = await authedFetch("/api/projetos/generate-recurrence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projeto.id,
          months: 12,
          dueDay: 10,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao gerar recorrencia.");
      }
      alert("Sucesso! 12 faturas geradas no Financeiro.");
      
    } catch (err) {
      console.error("Erro ao gerar recorrencia:", err);
      alert("Erro ao gerar recorrencia.");
    } finally {
      setGeneratingRecurrence(false);
    }
  }

  const createdAtFormatted = toDate(projeto?.createdAt ?? null)?.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusColor =
    projeto?.status === "Ativo"
      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
      : projeto?.status === "Onboarding"
      ? "bg-blue-500/10 text-blue-300 border border-blue-500/40"
      : projeto?.status === "Pausado"
      ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
      : "bg-white/5 text-white/60 border border-white/20";

  const servicosArray = useMemo(() => {
    if (!projeto?.servicos) return [];
    return projeto.servicos.filter(Boolean);
  }, [projeto?.servicos]);

  async function applyStatusUpdate() {
    if (!projeto || !newStatus) return;
    try {
      setSaving(true);
      const res = await authedFetch("/api/projetos/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projeto.id,
          patch: { status: newStatus },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar status.");

      setProjeto((prev) => (prev ? { ...prev, status: newStatus } : prev));
      setNewStatus(null);
    } catch (err) {
      console.error("Erro ao atualizar status do projeto:", err);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdits() {
    if (!projeto) return;

    try {
      setSaving(true);

      const servicos = form.servicosText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: { titulo: string; canalPrincipal: string; servicos: string[]; valorMensal?: number | null } = {
        titulo: form.titulo.trim() || "Projeto",
        canalPrincipal: form.canalPrincipal.trim() || "Nao informado",
        servicos,
      };

      if (form.valorMensal.trim()) {
        payload.valorMensal = Number(form.valorMensal.replace(",", "."));
      } else {
        payload.valorMensal = null; // remove
      }

      const res = await authedFetch("/api/projetos/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projeto.id,
          patch: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar alteracoes.");

      setProjeto((prev) =>
        prev
          ? {
              ...prev,
              titulo: payload.titulo,
              canalPrincipal: payload.canalPrincipal,
              servicos: payload.servicos,
              valorMensal:
                typeof payload.valorMensal === "number"
                  ? payload.valorMensal
                  : undefined,
            }
          : prev
      );

      setEditing(false);
    } catch (err) {
      console.error("Erro ao salvar alteracoes do projeto:", err);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdits() {
    if (!projeto) return;
    setForm({
      titulo: projeto.titulo || "",
      canalPrincipal: projeto.canalPrincipal || "",
      servicosText: (projeto.servicos || []).join(", "),
      valorMensal: typeof projeto.valorMensal === "number" ? String(projeto.valorMensal) : "",
    });
    setEditing(false);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando projeto...
        </div>
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/projetos")}
          className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para lista de projetos
        </button>

        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          Projeto nao encontrado. Verifique se o link esta correto ou volte para a
          lista de projetos.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topo / breadcrumb */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <button
            onClick={() => router.push("/admin/projetos")}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para projetos
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-wide">
              {projeto.titulo}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusColor}`}
            >
              {projeto.status}
            </span>
          </div>

          <p className="text-sm text-white/60 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <UserCircle2 className="h-4 w-4 text-white/40" />
              {projeto.clientName}
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-4 w-4 text-white/40" />
              Canal principal: {projeto.canalPrincipal || "Nao informado"}
            </span>
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 text-xs text-white/70 md:items-end">
          {typeof projeto.valorMensal === "number" && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[11px]">
              <DollarSign className="h-4 w-4 text-white/40" />
              <span>
                Retainer:{" "}
                {projeto.valorMensal.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })}
                /mes
              </span>
            </div>
          )}

          {createdAtFormatted && (
            <div className="flex items-center gap-1 text-white/60">
              <Calendar className="h-4 w-4 text-white/40" />
              <span>Inicio em {createdAtFormatted}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-emerald-300">
            <Layers className="h-4 w-4" />
            <span>Projeto da ALTUM</span>
          </div>
        </div>
      </div>

      {/* Acoes (status + edicao + atalhos) */}
      <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Status */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-white/50">
              Status operacional
            </p>

            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  disabled={saving}
                  onClick={() => setNewStatus(s)}
                  className={`px-3 py-1 rounded-lg text-[11px] transition
                    ${
                      newStatus === s
                        ? "bg-blue-600 text-white"
                        : "bg-white/5 text-white/70 border border-white/10 hover:bg-white/10"
                    }`}
                >
                  {s === "Onboarding" ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-blue-200" /> {s}
                    </span>
                  ) : s === "Ativo" ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-200" /> {s}
                    </span>
                  ) : s === "Pausado" ? (
                    <span className="inline-flex items-center gap-1">
                      <PauseCircle className="h-3 w-3 text-amber-200" /> {s}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Archive className="h-3 w-3 text-white/70" /> {s}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {newStatus && (
              <button
                disabled={saving}
                onClick={applyStatusUpdate}
                className="inline-flex items-center gap-2 mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] hover:bg-emerald-500 transition disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Aplicar status
                  </>
                )}
              </button>
            )}
          </div>
<button
  onClick={gerarCarneAnual}
  disabled={generatingRecurrence}
  className=" mt-2 inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-250/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-250/20 transition disabled:opacity-60"
>
  {generatingRecurrence ? (
    <Loader2 size={14} className="animate-spin" />
  ) : (
    <Calendar size={14} />
  )}
  Gerar Carne Anual (12x)
</button>
          {/* Edicao + atalhos */}
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
            >
              <PencilLine className="h-4 w-4 text-white/70" />
              {editing ? "Sair da edicao" : "Editar dados"}
            </button>

            <Link
              href="/admin/financeiro"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
            >
              <DollarSign className="h-4 w-4 text-white/70" />
              Financeiro
            </Link>

            <Link
              href="/admin/orcamentos"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
            >
              <Layers className="h-4 w-4 text-white/70" />
              Orcamentos
            </Link>

            {projeto.clientId && (
              <Link
                href={`/admin/clientes/${projeto.clientId}`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-[11px] hover:bg-blue-500 transition"
              >
                <UserCircle2 className="h-4 w-4" />
                Abrir cliente
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna grande */}
        <div className="space-y-4 lg:col-span-2">
          {/* Escopo / servicos + EDICAO */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                Escopo e servicos
              </h2>
              <ListTodo className="h-4 w-4 text-white/40" />
            </div>

            {/* Campos editaveis */}
            {editing ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <p className="text-[11px] text-white/50">Titulo</p>
                  <input
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    value={form.titulo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, titulo: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/50">Canal principal</p>
                  <input
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    value={form.canalPrincipal}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, canalPrincipal: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/50">Valor mensal (R$)</p>
                  <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
                    <DollarSign size={14} className="text-white/40" />
                    <input
                      className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                      placeholder="Ex: 1500"
                      value={form.valorMensal}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, valorMensal: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <p className="text-[11px] text-white/50">
                    Servicos (separados por virgula)
                  </p>
                  <input
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    placeholder="Ex: Landing Page, Trafego Meta, CRM, Automacoes"
                    value={form.servicosText}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, servicosText: e.target.value }))
                    }
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2 md:col-span-2">
                  <button
                    disabled={saving}
                    onClick={saveEdits}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium hover:bg-blue-500 transition disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Salvar alteracoes
                      </>
                    )}
                  </button>

                  <button
                    disabled={saving}
                    onClick={cancelEdits}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs hover:bg-white/10 transition disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {servicosArray.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {servicosArray.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/60">
                    Nenhum servico especificado ainda. Depois podemos editar o projeto
                    para detalhar escopo, entregaveis e SLA.
                  </p>
                )}

                <p className="mt-2 text-[11px] text-white/40">
                  Area de escopo e anexos do projeto para proposta, onboarding e documentos operacionais.
                </p>
              </>
            )}
          </div>

          {/* Maquina de Prospeccao ligada a este projeto */}
          <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-[#041610] via-[#050608] to-black p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100">
                Maquina de Prospeccao - visao deste projeto
              </h2>
              <Zap className="h-4 w-4 text-emerald-300" />
            </div>

            <p className="text-xs text-emerald-100/80">
              Aqui sera a visao tatica da maquina para este projeto especifico:
              leads, oportunidades, reunioes e pipeline conectado ao CRM.
            </p>

            <div className="grid gap-2 sm:grid-cols-3 text-[11px] text-emerald-100/80">
              <div className="rounded-lg border border-emerald-500/30 bg-black/40 p-2">
                <p className="text-[10px] uppercase tracking-wide">
                  Leads gerados (30 dias)
                </p>
                <p className="mt-1 text-lg font-semibold">-</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-black/40 p-2">
                <p className="text-[10px] uppercase tracking-wide">
                  Reunioes marcadas
                </p>
                <p className="mt-1 text-lg font-semibold">-</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-black/40 p-2">
                <p className="text-[10px] uppercase tracking-wide">
                  Ultima atividade
                </p>
                <p className="mt-1 text-xs">Integracao operacional com automacoes e dados em tempo real</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita: resumo + status operacional */}
        <div className="space-y-4">
          {/* Resumo operacional */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Resumo operacional
            </h2>

            <div className="space-y-2 text-xs text-white/70">
              <div className="flex items-start gap-2">
                <UserCircle2 className="h-4 w-4 text-white/40 mt-0.5" />
                <div>
                  <p className="text-white/80">{projeto.clientName}</p>
                  <p className="text-white/50">
                    Cliente vinculado a este projeto com acesso direto ao painel do cliente.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Target className="h-4 w-4 text-white/40 mt-0.5" />
                <div>
                  <p className="text-white/80">
                    Canal: {projeto.canalPrincipal || "Nao informado"}
                  </p>
                  <p className="text-white/50">
                    Podemos ligar isso ao modulo de midia (Meta, Google, LP, etc).
                  </p>
                </div>
              </div>

              {typeof projeto.valorMensal === "number" && (
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 text-white/40 mt-0.5" />
                  <div>
                    <p className="text-white/80">
                      {projeto.valorMensal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                      /mes
                    </p>
                    <p className="text-white/50">
                      Conectado ao financeiro para recorrencia e previsao de receita.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Proximas acoes / roadmap */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Proximas acoes
            </h2>

            <ul className="space-y-1 text-xs text-white/70">
              <li>- Criar checklist de onboarding especifico deste projeto.</li>
              <li>- Conectar cards deste projeto ao CRM / funil.</li>
              <li>- Ligar a cobranca recorrente ao modulo financeiro.</li>
              <li>- Integrar dados da Maquina de Prospeccao (leads e reunioes).</li>
            </ul>
          </div>

          {/* Atividade geral */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                Atividade recente
              </h2>
              <Activity className="h-4 w-4 text-white/40" />
            </div>

            <p className="text-xs text-white/60">
              Linha do tempo operacional deste projeto (reunioes, disparos, alteracoes de escopo e entregas).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


