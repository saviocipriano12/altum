"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { authedFetch } from "@/app/lib/authed-fetch";
import type {
  FinanceStatus,
  FinanceTransaction,
  TimestampLike,
} from "@/app/types/domain";
import {
  ArrowLeft,
  UserCircle2,
  Target,
  DollarSign,
  Calendar,
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

type FinancialRecord = FinanceTransaction & {
  clientId?: string;
  clientName?: string;
  projectId?: string | null;
  projectTitle?: string | null;
  meioPagamento?: string;
  dataPagamento?: TimestampLike | number | null;
};

function asMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function asDateTime(value?: TimestampLike | number | null) {
  if (!value) return null;
  const date =
    typeof value === "number"
      ? new Date(value)
      : typeof value.toDate === "function"
      ? value.toDate()
      : null;

  if (!date) return null;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeStatus(raw?: string): FinanceStatus {
  const value = (raw || "").toLowerCase();
  if (value === "pago" || value === "em dia") return "pago";
  if (value === "atrasado") return "atrasado";
  if (value === "cancelado") return "cancelado";
  return "pendente";
}

const STATUS_LABEL: Record<FinanceStatus, string> = {
  pago: "Pago",
  pendente: "Pendente",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

function statusClass(status: FinanceStatus) {
  if (status === "pago") {
    return "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40";
  }
  if (status === "pendente") {
    return "bg-amber-500/10 text-amber-300 border border-amber-500/40";
  }
  if (status === "atrasado") {
    return "bg-red-500/10 text-red-300 border border-red-500/40";
  }
  return "bg-white/5 text-white/60 border border-white/20";
}

export default function FinanceiroDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [record, setRecord] = useState<FinancialRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [nextStatus, setNextStatus] = useState<FinanceStatus | null>(null);
  const [setPaymentDateNow, setSetPaymentDateNow] = useState(true);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const response = await authedFetch(`/api/admin/records/financeiro/${encodeURIComponent(params.id)}`);
        const payload = (await response.json()) as { item?: FinancialRecord; error?: string };
        if (!response.ok || !payload.item) {
          setRecord(null);
          return;
        }

        const data = payload.item;
        setRecord({
          ...data,
          status: normalizeStatus(data.status),
          tipo: data.tipo || "Receita",
          descricao: data.descricao || data.referencia || "Lancamento financeiro",
          valor: Number(data.valor || 0),
          categoria: data.categoria || "Outros",
        });
      } catch (error) {
        console.error("Erro ao carregar lancamento financeiro:", error);
        setRecord(null);
      } finally {
        setLoading(false);
      }
    }

    void fetchRecord();
  }, [params.id]);

  const headerTitle = record?.referencia || record?.descricao || record?.tipo || "Lancamento";
  const createdAtFormatted = asDateTime(record?.createdAt ?? null);
  const paidAtFormatted = asDateTime(record?.dataPagamento ?? null);

  const canApply = useMemo(() => {
    if (!record || !nextStatus) return false;
    return normalizeStatus(record.status) !== nextStatus;
  }, [record, nextStatus]);

  async function applyStatusUpdate() {
    if (!record || !nextStatus) return;

    try {
      setUpdating(true);
      const res = await authedFetch("/api/finance/transactions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: record.id,
          status: nextStatus,
          dataPagamentoNow: nextStatus === "pago" && setPaymentDateNow,
          clearDataPagamento: nextStatus !== "pago",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha ao atualizar status.");

      setRecord((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              dataPagamento:
                nextStatus === "pago"
                  ? setPaymentDateNow
                    ? { toDate: () => new Date() }
                    : prev.dataPagamento ?? { toDate: () => new Date() }
                  : null,
            }
          : prev
      );

      setNextStatus(null);
      setSetPaymentDateNow(true);
    } catch (error) {
      console.error("Erro ao atualizar lancamento financeiro:", error);
      alert("Erro ao atualizar status.");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando lancamento...
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/financeiro")}
          className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para financeiro
        </button>

        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          Lancamento nao encontrado.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <button
            onClick={() => router.push("/admin/financeiro")}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para financeiro
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-wide">{headerTitle}</h1>

            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClass(
                normalizeStatus(record.status)
              )}`}
            >
              {STATUS_LABEL[normalizeStatus(record.status)]}
            </span>

            <span className="rounded-full px-2 py-0.5 text-[10px] border border-white/10 bg-white/5 text-white/70">
              {record.tipo}
            </span>
          </div>

          <p className="text-sm text-white/60">
            <span className="inline-flex items-center gap-1">
              <UserCircle2 className="h-4 w-4 text-white/40" />
              {record.clientName || "Cliente nao vinculado"}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <p className="text-[11px] text-white/50">Atualizar status</p>

          <div className="flex flex-wrap gap-2">
            {(["pago", "pendente", "atrasado", "cancelado"] as FinanceStatus[]).map(
              (status) => (
                <button
                  key={status}
                  disabled={updating}
                  onClick={() => setNextStatus(status)}
                  className={`px-3 py-1 rounded-lg text-[11px] ${
                    nextStatus === status
                      ? "bg-blue-600 text-white"
                      : "bg-white/5 text-white/70 border border-white/10"
                  }`}
                >
                  {STATUS_LABEL[status]}
                </button>
              )
            )}
          </div>

          {nextStatus === "pago" && (
            <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-white/60">
              <input
                type="checkbox"
                checked={setPaymentDateNow}
                onChange={(event) => setSetPaymentDateNow(event.target.checked)}
                className="h-3 w-3 rounded border border-white/40 bg-black"
              />
              Registrar data de pagamento agora
            </label>
          )}

          {nextStatus && (
            <button
              disabled={updating || !canApply}
              onClick={applyStatusUpdate}
              className="inline-flex items-center gap-2 mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {updating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Aplicar
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Detalhes financeiros
            </h2>

            <div className="space-y-2 text-xs text-white/70">
              <div className="inline-flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-white/40" />
                <span>Valor: {asMoney(record.valor)}</span>
              </div>

              {record.projectTitle && (
                <div className="inline-flex items-center gap-2">
                  <Target className="h-4 w-4 text-white/40" />
                  <span>Projeto vinculado: {record.projectTitle}</span>
                </div>
              )}

              {record.vencimento && (
                <div className="inline-flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-white/40" />
                  <span>Vencimento: {record.vencimento}</span>
                </div>
              )}

              {record.meioPagamento && (
                <div className="inline-flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-white/40" />
                  <span>Meio de pagamento: {record.meioPagamento}</span>
                </div>
              )}

              {createdAtFormatted && <p className="mt-1 text-white/50">Criado em {createdAtFormatted}</p>}

              {paidAtFormatted && (
                <p className="mt-1 text-emerald-300 inline-flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="h-3 w-3" />
                  Pago em {paidAtFormatted}
                </p>
              )}

              {normalizeStatus(record.status) === "atrasado" && (
                <p className="mt-1 text-red-300 inline-flex items-center gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  Este lancamento esta marcado como atrasado.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 mb-2">
              Integracao de cobranca
            </h2>
            <p className="text-xs text-white/60">
              Este registro ja esta alinhado ao modulo financeiro principal. Proximo passo:
              conectar conciliacao automatica via gateway e regras de notificacao.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Relacoes
            </h2>

            {record.clientId ? (
              <Link
                href={`/admin/clientes/${record.clientId}`}
                className="inline-flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200"
              >
                <UserCircle2 className="h-3 w-3" />
                Abrir cliente
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="text-xs text-white/60">Cliente sem vinculacao por id.</p>
            )}

            {record.projectId ? (
              <Link
                href={`/admin/projetos/${record.projectId}`}
                className="inline-flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200"
              >
                <Target className="h-3 w-3" />
                Abrir projeto
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="text-xs text-white/60">Projeto nao vinculado.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Acoes rapidas
            </h2>

            <div className="space-y-2 text-xs">
              <button
                onClick={() => setNextStatus("pago")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-500 transition"
              >
                <CreditCard size={14} />
                Marcar como pago
              </button>

              <button
                onClick={() => setNextStatus("cancelado")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-red-300 hover:bg-red-500/10 transition"
              >
                <XCircle size={14} />
                Cancelar lancamento
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
