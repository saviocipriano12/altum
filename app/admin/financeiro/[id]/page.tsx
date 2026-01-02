"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
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
} from "lucide-react";

type LancamentoStatus = "Em dia" | "Pendente" | "Atrasado" | "Cancelado";

interface Lancamento {
  id: string;
  clientId: string;
  clientName: string;
  projectId?: string | null;
  projectTitle?: string | null;
  tipo: string;
  status: LancamentoStatus;
  valor: number;
  referencia?: string;
  vencimento?: string;
  meioPagamento?: string;
  createdAt?: any;
  dataPagamento?: any | null;
}

export default function FinanceiroDetalhePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [lanc, setLanc] = useState<Lancamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState<LancamentoStatus | null>(null);
  const [marcarPago, setMarcarPago] = useState(false);

  useEffect(() => {
    async function fetchLancamento() {
      try {
        const ref = doc(db, "financeiro", params.id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setLanc({
            id: snap.id,
            ...(snap.data() as Omit<Lancamento, "id">),
          });
        } else {
          setLanc(null);
        }
      } catch (err) {
        console.error("Erro ao carregar lançamento financeiro:", err);
        setLanc(null);
      } finally {
        setLoading(false);
      }
    }

    fetchLancamento();
  }, [params.id]);

  async function applyStatusUpdate() {
    if (!lanc || !newStatus) return;

    try {
      setUpdating(true);

      const ref = doc(db, "financeiro", lanc.id);
      const payload: any = { status: newStatus };

      // Se marcar como "Em dia" e o toggle estiver ativo, seta dataPagamento
      if (newStatus === "Em dia" && marcarPago) {
        payload.dataPagamento = new Date();
      }

      await updateDoc(ref, payload);

      setLanc((prev) =>
        prev ? { ...prev, status: newStatus, dataPagamento: payload.dataPagamento || prev.dataPagamento } : prev
      );

      setNewStatus(null);
      setMarcarPago(false);
    } catch (err) {
      console.error("Erro ao atualizar lançamento financeiro:", err);
    } finally {
      setUpdating(false);
    }
  }

  const createdAtFormatted =
    lanc?.createdAt?.toDate &&
    new Date(lanc.createdAt.toDate()).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const pagoEmFormatted =
    lanc?.dataPagamento?.toDate &&
    new Date(lanc.dataPagamento.toDate()).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando lançamento...
        </div>
      </div>
    );
  }

  if (!lanc) {
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
          Lançamento não encontrado.
        </div>
      </div>
    );
  }

  const statusColor =
    lanc.status === "Em dia"
      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
      : lanc.status === "Pendente"
      ? "bg-amber-500/10 text-amber-300 border border-amber-500/40"
      : lanc.status === "Atrasado"
      ? "bg-red-500/10 text-red-300 border border-red-500/40"
      : "bg-white/5 text-white/60 border border-white/20";

  return (
    <div className="space-y-6">
      {/* Topo */}
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
            <h1 className="text-2xl font-semibold tracking-wide">
              {lanc.referencia || lanc.tipo}
            </h1>

            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusColor}`}
            >
              {lanc.status}
            </span>

            <span className="rounded-full px-2 py-0.5 text-[10px] border border-white/10 bg-white/5 text-white/70">
              {lanc.tipo}
            </span>
          </div>

          <p className="text-sm text-white/60">
            <span className="inline-flex items-center gap-1">
              <UserCircle2 className="h-4 w-4 text-white/40" />
              {lanc.clientName}
            </span>
          </p>
        </div>

        {/* Status update */}
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-[11px] text-white/50">Atualizar status</p>

          <div className="flex flex-wrap gap-2">
            {(["Em dia", "Pendente", "Atrasado", "Cancelado"] as LancamentoStatus[]).map(
              (s) => (
                <button
                  key={s}
                  disabled={updating}
                  onClick={() => setNewStatus(s)}
                  className={`px-3 py-1 rounded-lg text-[11px]
                    ${
                      newStatus === s
                        ? "bg-blue-600 text-white"
                        : "bg-white/5 text-white/70 border border-white/10"
                    }
                  `}
                >
                  {s}
                </button>
              )
            )}
          </div>

          {newStatus === "Em dia" && (
            <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-white/60">
              <input
                type="checkbox"
                checked={marcarPago}
                onChange={(e) => setMarcarPago(e.target.checked)}
                className="h-3 w-3 rounded border border-white/40 bg-black"
              />
              Registrar data de pagamento agora
            </label>
          )}

          {newStatus && (
            <button
              disabled={updating}
              onClick={applyStatusUpdate}
              className="inline-flex items-center gap-2 mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] hover:bg-emerald-500 transition disabled:opacity-60"
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

      {/* GRID */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Detalhes financeiros
            </h2>

            <div className="space-y-2 text-xs text-white/70">
              <div className="inline-flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-white/40" />
                <span>
                  Valor:{" "}
                  {lanc.valor.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </div>

              {lanc.projectTitle && (
                <div className="inline-flex items-center gap-2">
                  <Target className="h-4 w-4 text-white/40" />
                  <span>Projeto vinculado: {lanc.projectTitle}</span>
                </div>
              )}

              {lanc.vencimento && (
                <div className="inline-flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-white/40" />
                  <span>Vencimento: {lanc.vencimento}</span>
                </div>
              )}

              {lanc.meioPagamento && (
                <div className="inline-flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-white/40" />
                  <span>Meio de pagamento: {lanc.meioPagamento}</span>
                </div>
              )}

              {createdAtFormatted && (
                <p className="mt-1 text-white/50">
                  Criado em {createdAtFormatted}
                </p>
              )}

              {pagoEmFormatted && (
                <p className="mt-1 text-emerald-300 inline-flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="h-3 w-3" />
                  Pago em {pagoEmFormatted}
                </p>
              )}

              {lanc.status === "Atrasado" && (
                <p className="mt-1 text-red-300 inline-flex items-center gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  Este lançamento está marcado como atrasado.
                </p>
              )}
            </div>
          </div>

          {/* Placeholder para integrações futuras */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 mb-2">
              Integrações futuras
            </h2>
            <p className="text-xs text-white/60">
              Aqui vamos conectar com gateways de pagamento, automações de cobrança,
              envio de boletos, e conciliação automática.
            </p>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          {/* Cliente */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Cliente
            </h2>
            <p className="text-sm text-white/80">{lanc.clientName}</p>
            <p className="text-xs text-white/60">
              Em breve: atalho direto para o painel completo do cliente.
            </p>
          </div>

          {/* Ações */}
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
              Ações rápidas
            </h2>

            <div className="space-y-2 text-xs">
              <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-500 transition">
                <CreditCard size={14} /> Registrar recebimento manual (futuro)
              </button>

              <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-white hover:bg-white/20 transition">
                <CheckCircle2 size={14} /> Gerar comprovante / recibo (futuro)
              </button>

              <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-red-300 hover:bg-red-500/10 transition">
                <XCircle size={14} /> Cancelar lançamento (futuro)
              </button>
            </div>

            <p className="mt-2 text-[11px] text-white/40">
              Automação futura: lembretes de vencimento, comunicação com o cliente e
              projeção de caixa no dashboard geral.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
