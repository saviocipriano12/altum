"use client";

import Link from "next/link";
import { AlertTriangle, Clock3, CreditCard } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

const DAY_MS = 24 * 60 * 60 * 1000;

export function ClienteTrialBanner() {
  const pathname = usePathname();
  const { tenant } = useClienteTenant();
  const [now, setNow] = useState<number | null>(null);
  const trialEndsAt = tenant?.trialEndsAt ? new Date(tenant.trialEndsAt).getTime() : 0;
  const status = String(tenant?.billingStatus || "").toLowerCase();
  const billingBlockAt = tenant?.billingBlockAt ? new Date(tenant.billingBlockAt).getTime() : 0;
  const accessEndsAt = tenant?.accessEndsAt ? new Date(tenant.accessEndsAt).getTime() : 0;

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const remainingDays = trialEndsAt && now ? Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS)) : 0;

  const isPastDue = status === "past_due";
  const isCancelScheduled = status === "cancel_scheduled";
  const isRefundPending = status === "refund_pending";
  const shouldShowTrial = Boolean(trialEndsAt && status !== "active" && status !== "paid");

  if (!now || !pathname?.startsWith("/cliente/painel") || (!shouldShowTrial && !isPastDue && !isCancelScheduled && !isRefundPending)) {
    return null;
  }

  const pending = status === "pending";
  const title = isPastDue
    ? "Pagamento em atraso"
    : isCancelScheduled
      ? "Cancelamento agendado"
      : isRefundPending
        ? "Reembolso em processamento"
        : pending
          ? "Pagamento em processamento"
          : `${remainingDays} dia${remainingDays === 1 ? "" : "s"} restante${remainingDays === 1 ? "" : "s"} no teste`;
  const detail = isPastDue
    ? `Regularize ate ${billingBlockAt ? new Date(billingBlockAt).toLocaleDateString("pt-BR") : "o fim da tolerancia"} para evitar o bloqueio.`
    : isCancelScheduled
      ? `Seu acesso continua ate ${accessEndsAt ? new Date(accessEndsAt).toLocaleDateString("pt-BR") : "o fim do periodo contratado"}.`
      : isRefundPending
        ? "O acesso sera encerrado quando o Asaas confirmar o estorno."
        : pending
          ? "O acesso sera atualizado assim que o Asaas confirmar."
          : "Escolha um plano antes do fim do trial para continuar sem interrupcao.";
  return (
    <aside className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5.6rem)] left-3 right-3 z-[75] rounded-2xl border bg-white p-3 text-slate-950 shadow-[0_22px_70px_-32px_rgba(76,29,149,.65)] sm:left-auto sm:right-5 sm:w-[370px] lg:bottom-5 ${isPastDue ? "border-amber-300" : "border-violet-200"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
          {isPastDue ? <AlertTriangle className="h-5 w-5" /> : pending || isRefundPending ? <CreditCard className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
        </div>
      </div>
      <Link href="/cliente/assinatura" className="mt-3 grid h-10 place-items-center rounded-xl bg-violet-600 text-xs font-black text-white transition hover:bg-violet-700">
        {isPastDue ? "Regularizar agora" : pending || isCancelScheduled || isRefundPending ? "Ver assinatura" : "Conhecer planos"}
      </Link>
    </aside>
  );
}
