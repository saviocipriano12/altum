"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { auth } from "@/firebaseConfig";
import type { PlatformPlan, PlatformPlanId } from "@/lib/platform-plans";
import { isPlanUpgrade } from "@/lib/platform-subscription-policy";
import { formatBrazilianDocument, isValidBrazilianDocument } from "@/lib/brazilian-document";

type BillingState = {
  status: string;
  planId: string;
  pendingPlanId: string | null;
  trialEndsAt: string | null;
  blockAt: string | null;
  accessEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string | null;
  nextDueDate: string | null;
  billingType: string | null;
  value: number | null;
  providerAvailable: boolean;
  canManage: boolean;
};

type Payment = {
  id: string;
  status: string;
  value: number | null;
  dueDate: string | null;
  paidAt: string | null;
  billingType: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "data ainda nao informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function statusMessage(billing: BillingState | null) {
  if (!billing) return null;
  if (billing.status === "past_due") return `Pagamento em atraso. Regularize ate ${formatDate(billing.blockAt)} para evitar o bloqueio.`;
  if (billing.status === "cancel_scheduled") return `Cancelamento agendado. Seu acesso continua ate ${formatDate(billing.accessEndsAt)}.`;
  if (billing.status === "refund_pending") return "Seu estorno esta em processamento. O acesso sera encerrado quando o Asaas confirmar.";
  if (billing.status === "active" || billing.status === "paid") return "Sua assinatura esta ativa.";
  if (billing.status === "pending") return "Aguardando a confirmacao do pagamento pelo Asaas.";
  return `Seu teste gratuito termina em ${formatDate(billing.trialEndsAt)}.`;
}

export default function AssinaturaPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [checkout, setCheckout] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState("");

  const loadBilling = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setBilling(null);
      return;
    }
    const token = await user.getIdToken();
    const response = await fetch("/api/billing/asaas/subscription", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { billing?: BillingState; payments?: Payment[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel carregar sua assinatura.");
    setBilling(payload.billing || null);
    setPayments(payload.payments || []);
  }, []);

  useEffect(() => {
    setCheckout(new URLSearchParams(window.location.search).get("checkout"));
    const unsubscribe = onAuthStateChanged(auth, async () => {
      try {
        const response = await fetch("/api/public/platform-plans", { cache: "no-store" });
        const payload = (await response.json()) as { plans?: PlatformPlan[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Planos indisponiveis.");
        setPlans(payload.plans || []);
        await loadBilling();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Planos indisponiveis.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [loadBilling]);

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === billing?.planId) || null,
    [billing?.planId, plans]
  );
  const hasSubscription = Boolean(billing?.subscriptionId);

  async function startCheckout(planId: string) {
    const user = auth.currentUser;
    if (!user) return window.location.assign("/cliente/login?next=/cliente/painel/configuracoes/faturamento");
    setSubmitting(planId);
    setError("");
    setSuccess("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/billing/asaas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId, cpfCnpj }),
      });
      const payload = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "Nao foi possivel abrir o checkout.");
      window.location.assign(payload.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao iniciar pagamento.");
      setSubmitting(null);
    }
  }

  function requestCheckout(planId: string) {
    setError("");
    setCheckoutPlanId(planId);
    setCpfCnpj("");
  }

  async function manageSubscription(action: "upgrade" | "cancel", planId?: PlatformPlanId) {
    const user = auth.currentUser;
    if (!user) return window.location.assign("/cliente/login?next=/cliente/painel/configuracoes/faturamento");
    setSubmitting(action === "upgrade" ? String(planId) : "cancel");
    setError("");
    setSuccess("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/billing/asaas/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          planId,
          confirmation: action === "cancel" ? "CANCELAR" : undefined,
          reason: cancelReason,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; action?: string; accessEndsAt?: string };
      if (!response.ok) throw new Error(payload.error || "Nao foi possivel alterar a assinatura.");
      if (payload.action === "upgrade") {
        setSuccess("Upgrade concluido. Os novos recursos ja foram liberados e o novo valor sera usado nas proximas cobrancas.");
      } else if (payload.action === "refund_pending") {
        setSuccess("Solicitacao recebida. O estorno esta em processamento e a recorrencia foi encerrada.");
      } else {
        setSuccess(`Cancelamento agendado. Seu acesso continua ate ${formatDate(payload.accessEndsAt || null)}.`);
      }
      setShowCancel(false);
      await loadBilling();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel alterar a assinatura.");
    } finally {
      setSubmitting(null);
    }
  }

  const banner = statusMessage(billing);

  return (
    <main className="min-h-full rounded-[24px] bg-[var(--cliente-bg)] px-2 py-2 text-[var(--cliente-text)] sm:px-4 sm:py-4" data-tour-key="subscription-content">
      <div className="mx-auto max-w-6xl">
        <Link href="/cliente/painel" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" /> Voltar ao painel
        </Link>
        <div className="mt-6 text-center">
          <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
            <ShieldCheck className="h-4 w-4" /> Pagamento protegido pelo Asaas
          </span>
          <h1 className="mt-5 text-4xl font-black tracking-tight">Sua assinatura ALTUM</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">Escolha um plano, acompanhe o pagamento e gerencie upgrade ou cancelamento em um unico lugar.</p>
        </div>

        {banner ? (
          <div className={`mx-auto mt-7 flex max-w-2xl items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${billing?.status === "past_due" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
            {billing?.status === "past_due" ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> : <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />}
            <span>{banner}</span>
          </div>
        ) : null}
        {checkout === "success" ? <p className="mx-auto mt-4 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">Pagamento enviado. Assim que o Asaas confirmar, seu acesso sera atualizado automaticamente.</p> : null}
        {checkout === "cancelled" || checkout === "expired" ? <p className="mx-auto mt-4 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-bold text-amber-800">O checkout nao foi concluido. Voce pode gerar um novo link abaixo.</p> : null}
        {success ? <p role="status" className="mx-auto mt-4 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">{success}</p> : null}
        {error ? <p role="alert" className="mx-auto mt-4 max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm font-bold text-red-700">{error}</p> : null}

        {loading ? <Loader2 className="mx-auto mt-14 h-7 w-7 animate-spin text-blue-600" /> : (
          <section className="mt-10 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const current = billing?.planId === plan.id && (billing.status === "active" || billing.status === "paid" || billing.status === "past_due" || billing.status === "cancel_scheduled");
              const upgrade = hasSubscription && (billing?.status === "active" || billing?.status === "paid") && isPlanUpgrade(billing?.planId, plan.id);
              return (
                <article key={plan.id} className={`flex flex-col rounded-[26px] border bg-white p-6 shadow-sm ${current ? "border-emerald-300 ring-4 ring-emerald-100" : plan.featured ? "border-blue-300 ring-4 ring-blue-100" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-wider text-blue-700">{plan.name}</p>
                    {current ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">Plano atual</span> : null}
                  </div>
                  <p className="mt-4 text-3xl font-black">{plan.monthlyPrice ? plan.monthlyPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Sob consulta"}<span className="text-sm font-semibold text-slate-400">{plan.monthlyPrice ? "/mes" : ""}</span></p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>
                  <ul className="my-5 space-y-2 text-sm text-slate-700">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {feature}</li>)}</ul>
                  {current ? <div className="mt-auto grid h-12 place-items-center rounded-xl bg-emerald-50 text-sm font-black text-emerald-700">Assinatura atual</div>
                    : upgrade ? <button onClick={() => void manageSubscription("upgrade", plan.id)} disabled={Boolean(submitting) || billing?.status === "cancel_scheduled"} className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-black text-white disabled:opacity-60">{submitting === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Fazer upgrade</button>
                        : !hasSubscription && plan.checkoutEnabled && plan.monthlyPrice ? <button onClick={() => requestCheckout(plan.id)} disabled={Boolean(submitting)} className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-60">{submitting === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Assinar agora</button>
                        : <a href="/contato?interest=estrutura_assistida" className="mt-auto grid h-12 place-items-center rounded-xl border border-slate-200 text-sm font-black text-slate-700">Falar com a Altum</a>}
                </article>
              );
            })}
          </section>
        )}

        {billing?.canManage && hasSubscription && billing.status !== "cancel_scheduled" && billing.status !== "refund_pending" ? (
          <section className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-5">
            {!showCancel ? (
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div><p className="font-black">Precisa cancelar?</p><p className="mt-1 text-xs leading-5 text-slate-500">Ate 7 dias do primeiro pagamento, solicitamos estorno integral. Depois, o acesso continua ate o fim do ciclo pago.</p></div>
                <button onClick={() => setShowCancel(true)} className="h-10 shrink-0 rounded-xl border border-red-200 px-4 text-xs font-black text-red-700 hover:bg-red-50">Solicitar cancelamento</button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between"><p className="font-black text-red-800">Confirmar cancelamento</p><button onClick={() => setShowCancel(false)} aria-label="Fechar"><X className="h-4 w-4 text-slate-400" /></button></div>
                <p className="mt-2 text-xs leading-5 text-slate-600">Esta solicitacao pode iniciar um estorno financeiro ou interromper as proximas cobrancas. A operacao fica registrada na auditoria.</p>
                <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} maxLength={300} placeholder="Conte o motivo do cancelamento (opcional)" className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-red-400" />
                <button onClick={() => void manageSubscription("cancel")} disabled={Boolean(submitting)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-60">{submitting === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar cancelamento</button>
              </div>
            )}
          </section>
        ) : null}

        {hasSubscription ? (
          <section className="mt-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]" data-tour-key="billing-history">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
              <p className="text-sm font-black">Pagamento e proxima cobranca</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Forma atual</dt><dd className="font-bold">{billing?.billingType === "PIX" ? "Pix" : billing?.billingType === "CREDIT_CARD" ? "Cartao" : "Asaas"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Proximo vencimento</dt><dd className="font-bold">{formatDate(billing?.nextDueDate || null)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Valor</dt><dd className="font-bold">{billing?.value ? billing.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Conforme o plano"}</dd></div>
              </dl>
              <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Cartoes e dados bancarios ficam no ambiente seguro do Asaas. A Altum nao recebe nem armazena o numero do cartao.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
              <p className="text-sm font-black">Historico de cobrancas</p>
              <div className="mt-4 space-y-2">
                {payments.length ? payments.map((payment) => (
                  <div key={payment.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-bold">{payment.value?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "Cobranca"}</p><p className="text-xs text-slate-500">Vencimento: {formatDate(payment.dueDate)}</p></div>
                    <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{payment.status}</span>{payment.invoiceUrl || payment.bankSlipUrl ? <a href={payment.invoiceUrl || payment.bankSlipUrl || "#"} target="_blank" rel="noreferrer" className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">Abrir cobranca</a> : null}</div>
                  </div>
                )) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">O historico aparecera assim que o Asaas criar a primeira cobranca.</p>}
              </div>
            </article>
          </section>
        ) : null}

        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 text-xs leading-6 text-slate-500">
          <p className="font-black text-slate-800">Politica da assinatura</p>
          <p className="mt-1">Reembolso integral quando o cancelamento e solicitado em ate 7 dias do primeiro pagamento. Depois desse prazo, nao ha reembolso e o acesso permanece ate o fim do periodo contratado. Pagamentos atrasados possuem 3 dias corridos de tolerancia antes do bloqueio.</p>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">A ALTUM nao recebe nem armazena os dados do seu cartao. Plano atual: <strong>{activePlan?.name || billing?.planId || "nao contratado"}</strong>.</p>
      </div>

      {checkoutPlanId ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Identificacao para pagamento">
          <section className="w-full max-w-md rounded-[24px] bg-white p-6 text-slate-950 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-blue-700">Checkout seguro</p><h2 className="mt-1 text-xl font-black">Informe o CPF ou CNPJ</h2></div><button onClick={() => setCheckoutPlanId(null)} aria-label="Fechar"><X className="h-5 w-5" /></button></div>
            <p className="mt-3 text-sm leading-6 text-slate-600">O Asaas exige este dado para emitir a assinatura. A Altum guarda somente os quatro ultimos digitos para conciliacao.</p>
            <label className="mt-5 block text-xs font-black text-slate-700">CPF ou CNPJ</label>
            <input value={cpfCnpj} onChange={(event) => setCpfCnpj(formatBrazilianDocument(event.target.value))} inputMode="numeric" autoFocus placeholder="000.000.000-00" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500" />
            {cpfCnpj && !isValidBrazilianDocument(cpfCnpj) ? <p className="mt-2 text-xs font-bold text-red-600">Confira os digitos do documento.</p> : null}
            <button onClick={() => void startCheckout(checkoutPlanId)} disabled={!isValidBrazilianDocument(cpfCnpj) || Boolean(submitting)} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Continuar no Asaas</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
