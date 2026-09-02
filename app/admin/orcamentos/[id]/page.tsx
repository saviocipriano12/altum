"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { TimestampLike } from "@/app/types/domain";

import { Zap } from "lucide-react";

import {
  ArrowLeft,
  Loader2,
  FileText,
  UserCircle2,
  Target,
  DollarSign,
  Calendar,
  CheckCircle2,
  XCircle,
  PencilLine,
  Save,
  Send,
  BadgeCheck,
  Ban,
  PlusCircle,
} from "lucide-react";

type OrcamentoStatus = "Rascunho" | "Enviado" | "Aprovado" | "Perdido";
type OrcamentoTipo = "Projeto unico" | "Recorrente";

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
  validade?: string | null;
  resumo?: string | null;
  createdAt?: TimestampLike | number | null;
}

const STATUS_OPTIONS: OrcamentoStatus[] = ["Rascunho", "Enviado", "Aprovado", "Perdido"];
const TIPO_OPTIONS: OrcamentoTipo[] = ["Projeto unico", "Recorrente"];

export default function OrcamentoDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [newStatus, setNewStatus] = useState<OrcamentoStatus | null>(null);
  const [creatingFinanceiro, setCreatingFinanceiro] = useState(false);

  const [form, setForm] = useState({
    titulo: "",
    tipo: "Projeto unico" as OrcamentoTipo,
    status: "Rascunho" as OrcamentoStatus,
    valorTotal: "",
    validade: "",
    resumo: "",
  });

  useEffect(() => {
    async function fetchOrcamento() {
      try {
        const response = await authedFetch(`/api/admin/records/orcamentos/${encodeURIComponent(params.id)}`);
        const payload = (await response.json()) as { item?: Orcamento; error?: string };
        if (response.ok && payload.item) {
          const data = payload.item;

          setOrc(data);
          setForm({
            titulo: data.titulo || "",
            tipo: (data.tipo || "Projeto unico") as OrcamentoTipo,
            status: (data.status || "Rascunho") as OrcamentoStatus,
            valorTotal: typeof data.valorTotal === "number" ? String(data.valorTotal) : "",
            validade: data.validade || "",
            resumo: data.resumo || "",
          });
        } else {
          setOrc(null);
        }
      } catch (err) {
        console.error("Erro ao carregar orcamento:", err);
        setOrc(null);
      } finally {
        setLoading(false);
      }
    }

    fetchOrcamento();
  }, [params.id]);

  const createdAtDate =
    typeof orc?.createdAt === "number"
      ? new Date(orc.createdAt)
      : orc?.createdAt &&
          typeof orc.createdAt === "object" &&
          typeof orc.createdAt.toDate === "function"
        ? orc.createdAt.toDate()
        : null;

  const createdAtFormatted = createdAtDate
    ? createdAtDate.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const statusPill =
    orc?.status === "Aprovado"
      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
      : orc?.status === "Enviado"
      ? "bg-blue-500/10 text-blue-300 border border-blue-500/40"
      : orc?.status === "Perdido"
      ? "bg-red-500/10 text-red-300 border border-red-500/40"
      : "bg-white/5 text-white/60 border border-white/20";

  async function applyStatusUpdate() {
    if (!orc || !newStatus) return;

    try {
      setSaving(true);
      const res = await authedFetch("/api/orcamentos/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetId: orc.id,
          patch: { status: newStatus },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar status.");

      setOrc((prev) => (prev ? { ...prev, status: newStatus } : prev));
      setNewStatus(null);
    } catch (err) {
      console.error("Erro ao atualizar status do orcamento:", err);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdits() {
    if (!orc) return;

    try {
      setSaving(true);

      const parsedValor = form.valorTotal.trim()
        ? Number(form.valorTotal.replace(",", "."))
        : null;

      const payload: {
        titulo: string;
        tipo: OrcamentoTipo;
        status: OrcamentoStatus;
        validade: string | null;
        resumo: string | null;
        valorTotal: number | null;
      } = {
        titulo: form.titulo.trim() || "Orcamento",
        tipo: form.tipo,
        status: form.status,
        validade: form.validade.trim() || null,
        resumo: form.resumo.trim() || null,
        valorTotal: parsedValor,
      };

      const res = await authedFetch("/api/orcamentos/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetId: orc.id,
          patch: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar alteracoes.");

      setOrc((prev) =>
        prev
          ? {
              ...prev,
              titulo: payload.titulo,
              tipo: payload.tipo,
              status: payload.status,
              validade: payload.validade,
              resumo: payload.resumo,
              valorTotal: typeof payload.valorTotal === "number" ? payload.valorTotal : undefined,
            }
          : prev
      );

      setEditing(false);
      setNewStatus(null);
    } catch (err) {
      console.error("Erro ao salvar alteracoes do orcamento:", err);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdits() {
    if (!orc) return;
    setForm({
      titulo: orc.titulo || "",
      tipo: orc.tipo || "Projeto unico",
      status: orc.status || "Rascunho",
      valorTotal: typeof orc.valorTotal === "number" ? String(orc.valorTotal) : "",
      validade: orc.validade || "",
      resumo: orc.resumo || "",
    });
    setEditing(false);
  }

  async function gerarLancamentoNoFinanceiro() {
    if (!orc) return;

    try {
      setCreatingFinanceiro(true);

      const valor = typeof orc.valorTotal === "number" ? orc.valorTotal : undefined;
      if (!valor) {
        alert("Defina o valor total do orcamento antes de gerar o lancamento.");
        return;
      }

      const res = await authedFetch("/api/finance/transactions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: orc.clientId,
          clientName: orc.clientName || "Cliente",
          projectId: orc.projectId || null,
          projectTitle: orc.projectTitle || null,
          tipo: "Receita",
          categoria: orc.tipo === "Recorrente" ? "Mensalidade" : "Projeto",
          status: "pendente",
          descricao: "Orcamento aprovado - " + (orc.titulo || "Sem titulo"),
          valor,
          referencia: orc.titulo || "Orcamento",
          vencimento: null,
          meioPagamento: null,
          dataPagamento: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao criar lancamento.");

      alert("Lancamento criado no Financeiro.");
    } catch (err) {
      console.error("Erro ao gerar lancamento no financeiro:", err);
      alert("Falha ao criar lancamento no Financeiro.");
    } finally {
      setCreatingFinanceiro(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando orcamento...
        </div>
      </div>
    );
  }

  if (!orc) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/orcamentos")}
          className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para orcamentos
        </button>

        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          Orcamento nao encontrado.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topo */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <button
            onClick={() => router.push("/admin/orcamentos")}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para orcamentos
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-wide">{orc.titulo}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusPill}`}>
              {orc.status}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] border border-white/10 bg-white/5 text-white/70">
              {orc.tipo}
            </span>
          </div>

          <p className="text-sm text-white/60 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <UserCircle2 className="h-4 w-4 text-white/40" />
              {orc.clientName}
            </span>
            {orc.projectTitle && (
              <span className="inline-flex items-center gap-1">
                <Target className="h-4 w-4 text-white/40" />
                {orc.projectTitle}
              </span>
            )}
          </p>

          {createdAtFormatted && (
            <p className="text-[11px] text-white/40">Criado em {createdAtFormatted}</p>
          )}
        </div>

        {/* Acoes topo */}
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
          >
            <PencilLine className="h-4 w-4 text-white/70" />
            {editing ? "Sair da edicao" : "Editar orcamento"}
          </button>

          <button
            onClick={gerarLancamentoNoFinanceiro}
            disabled={creatingFinanceiro}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-[11px] hover:bg-blue-500 transition disabled:opacity-60"
          >
            {creatingFinanceiro ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Gerar lancamento no Financeiro
              </>
            )}
          </button>

          <Link
            href="/admin/financeiro"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
          >
            <DollarSign className="h-4 w-4 text-white/70" />
            Abrir Financeiro
          </Link>

          {orc.projectId && (
            <Link
              href={`/admin/projetos/${orc.projectId}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
            >
              <Target className="h-4 w-4 text-white/70" />
              Abrir Projeto
            </Link>
          )}

          {orc.clientId && (
            <Link
              href={`/admin/clientes/${orc.clientId}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] hover:bg-white/10 transition"
            >
              <UserCircle2 className="h-4 w-4 text-white/70" />
              Abrir Cliente
            </Link>
          )}
        </div>
      </div>

      {/* Barra de status (rapida) */}
      <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
        <p className="text-[11px] uppercase tracking-wide text-white/50">Atualizar status</p>
        <div className="mt-2 flex flex-wrap gap-2">
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
              {s === "Rascunho" ? (
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3 text-white/70" /> {s}
                </span>
              ) : s === "Enviado" ? (
                <span className="inline-flex items-center gap-1">
                  <Send className="h-3 w-3 text-blue-200" /> {s}
                </span>
              ) : s === "Aprovado" ? (
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck className="h-3 w-3 text-emerald-200" /> {s}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Ban className="h-3 w-3 text-red-200" /> {s}
                </span>
              )}
            </button>
          ))}
        </div>

        {newStatus && (
          <button
            disabled={saving}
            onClick={applyStatusUpdate}
            className="inline-flex items-center gap-2 mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] hover:bg-emerald-500 transition disabled:opacity-60"
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

      {/* Conteudo (detalhes + edicao) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                Detalhes do orcamento
              </h2>
              <FileText className="h-4 w-4 text-white/40" />
            </div>

            {editing ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <p className="text-[11px] text-white/50">Titulo</p>
                  <input
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    value={form.titulo}
                    onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/50">Tipo</p>
                  <select
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as OrcamentoTipo }))}
                  >
                    {TIPO_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/50">Status</p>
                  <select
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OrcamentoStatus }))}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/50">Valor total</p>
                  <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
                    <DollarSign size={14} className="text-white/40" />
                    <input
                      className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                      placeholder="Ex: 8200"
                      value={form.valorTotal}
                      onChange={(e) => setForm((f) => ({ ...f, valorTotal: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/50">Validade</p>
                  <div className="flex items-center gap-2 rounded-lg bg-black/50 px-3 py-2 border border-white/10">
                    <Calendar size={14} className="text-white/40" />
                    <input
                      className="w-full bg-transparent text-xs outline-none placeholder:text-white/40"
                      placeholder="Ex: 7 dias, ate 10/01"
                      value={form.validade}
                      onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <p className="text-[11px] text-white/50">Resumo</p>
                  <input
                    className="w-full rounded-lg bg-black/50 px-3 py-2 text-xs outline-none border border-white/10"
                    placeholder="Ex: LP + Trafego + CRM + Automacoes"
                    value={form.resumo}
                    onChange={(e) => setForm((f) => ({ ...f, resumo: e.target.value }))}
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
              <div className="space-y-2 text-xs text-white/70">
                <div className="inline-flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-white/40" />
                  <span>
                    Valor:{" "}
                    {typeof orc.valorTotal === "number"
                      ? orc.valorTotal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "-"}
                  </span>
                </div>

                <div className="inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-white/40" />
                  <span>Tipo: {orc.tipo}</span>
                </div>

                {orc.validade && (
                  <div className="inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-white/40" />
                    <span>Validade: {orc.validade}</span>
                  </div>
                )}

                {orc.resumo && (
                  <p className="text-[11px] text-white/60 mt-1">
                    <span className="text-white/50">Resumo:</span> {orc.resumo}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 mb-2">
              Proximas evolucoes (v10)
            </h2>
            <ul className="space-y-1 text-xs text-white/60">
              <li>- Gerar PDF da proposta (template ALTUM) com 1 clique.</li>
              <li>- Link publico de proposta (cliente assina/aprova).</li>
              <li>- Ao aprovar: criar projeto + recorrencia + automacoes.</li>
            </ul>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Cliente & vinculo
            </h2>

            <p className="text-sm text-white/80">{orc.clientName}</p>

            {orc.projectTitle ? (
              <p className="text-xs text-white/60">
                Vinculado ao projeto: <span className="text-white/80">{orc.projectTitle}</span>
              </p>
            ) : (
              <p className="text-xs text-white/60">
                Sem projeto vinculado (ok para orcamento inicial).
              </p>
            )}

            <div className="pt-2 flex flex-col gap-2 text-xs">
              {orc.clientId && (
                <Link
                  href={`/admin/clientes/${orc.clientId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-500 transition"
                >
                  <UserCircle2 size={14} /> Abrir cliente
                </Link>
              )}

              {orc.projectId && (
                <Link
                  href={`/admin/projetos/${orc.projectId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white hover:bg-white/10 transition"
                >
                  <Target size={14} /> Abrir projeto
                </Link>
              )}

              <Link
                href="/admin/financeiro"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white hover:bg-white/10 transition"
              >
                <DollarSign size={14} /> Financeiro
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Acoes rapidas
            </h2>

            <button
              onClick={() => setEditing(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 transition"
            >
              <PencilLine size={14} /> Editar
            </button>

            <button
              onClick={gerarLancamentoNoFinanceiro}
              disabled={creatingFinanceiro}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500 transition disabled:opacity-60"
            >
              {creatingFinanceiro ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <PlusCircle size={14} /> Gerar lancamento no Financeiro
                </>
              )}
            </button>

            <p className="text-[11px] text-white/40 pt-1">
              Dica: quando o orcamento for aprovado, voce ja cria o lancamento pendente e controla o caixa.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-[#0b0b0b] to-black p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100">
                Pipeline operacional
              </h2>
              <Zap className="h-4 w-4 text-emerald-300" />
            </div>
            <p className="text-xs text-emerald-100/80">
              Ao marcar como <b>Aprovado</b>, mantenha este fluxo operacional conectado a:
              Projeto + Financeiro + Atividade de onboarding + automacoes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


