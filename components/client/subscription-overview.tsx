"use client";

import { CreditCard, FileText, RefreshCw } from "lucide-react";
import { fiscalLabel, paymentLabel } from "@/lib/subscription-lifecycle";

export type SubscriptionPayment = { id: string; status: string; value: number | null; dueDate: string | null; paidAt: string | null; invoiceUrl: string | null; bankSlipUrl: string | null };
export type SubscriptionInvoice = { id: string; status: string; number: string | null; value: number; effectiveDate: string; pdfUrl: string | null; xmlUrl: string | null };
export type SubscriptionActivity = { id: string; action: string; createdAt: string | null; protocol: string | null; pending: boolean };

function date(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value));
}
function money(value: number | null) { return value === null ? "Conforme o plano" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export function SubscriptionOverview(props: {
  planName: string; value: number | null; nextDueDate: string | null; accessEndsAt: string | null;
  cancelled: boolean; providerAvailable: boolean; operationPending: boolean; fiscalStatus: string;
  payments: SubscriptionPayment[]; invoices: SubscriptionInvoice[]; invoicesAvailable: boolean;
  activity: SubscriptionActivity[]; onRefresh: () => void; refreshing: boolean;
}) {
  return <section className="mt-7 space-y-5 text-slate-900" data-tour-key="billing-history">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Seu plano</p><h2 className="mt-1 text-2xl font-bold">{props.planName}</h2></div><button onClick={props.onRefresh} disabled={props.refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${props.refreshing ? "animate-spin" : ""}`} /> Atualizar</button></div>
      <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Mensalidade</dt><dd className="mt-1 text-lg font-bold">{money(props.value)}</dd></div><div><dt className="text-xs text-slate-500">{props.cancelled ? "Acesso até" : "Próxima cobrança"}</dt><dd className="mt-1 font-semibold">{date(props.cancelled ? props.accessEndsAt : props.nextDueDate)}</dd></div><div><dt className="text-xs text-slate-500">Pagamento</dt><dd className="mt-1 flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-blue-600" /> Cartão de crédito</dd></div></dl>
      {props.operationPending ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Sua solicitação precisa ser conciliada. Não inicie outra assinatura. Você pode tentar o cancelamento novamente ou falar com a Altum.</p> : null}
      {!props.providerAvailable ? <p className="mt-4 text-sm text-amber-800">Não foi possível consultar o Asaas agora. Atualize para conferir os dados mais recentes.</p> : null}
      <p className="mt-4 text-xs text-slate-500">O cartão é tratado pelo Asaas. Para atualizar o meio de pagamento, abra a cobrança ou <a href="mailto:suporte.altum@gmail.com" className="font-semibold text-blue-700">fale com a Altum</a>.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Cobranças e pagamentos</h2><div className="mt-4 divide-y divide-slate-100">{props.payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{money(payment.value)}</p><p className="mt-1 text-xs text-slate-500">Vencimento {date(payment.dueDate)}{payment.paidAt ? ` · Pago em ${date(payment.paidAt)}` : ""}</p><p className={`mt-1 text-xs font-semibold ${payment.status === "OVERDUE" ? "text-red-700" : "text-slate-600"}`}>{paymentLabel(payment.status)}</p></div>{payment.invoiceUrl ? <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Abrir cobrança</a> : null}</div>)}{!props.payments.length ? <p className="py-4 text-sm text-slate-500">As cobranças aparecerão após a contratação.</p> : null}</div></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-blue-600" /> Notas fiscais</h2><div className="mt-4 divide-y divide-slate-100">{props.invoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{invoice.number ? `Nota ${invoice.number}` : "Nota fiscal"} · {money(invoice.value)}</p><p className="mt-1 text-xs text-slate-500">{date(invoice.effectiveDate)} · {fiscalLabel(invoice.status)}</p></div><div className="flex gap-2">{invoice.status === "AUTHORIZED" && invoice.pdfUrl ? <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">PDF</a> : null}{invoice.status === "AUTHORIZED" && invoice.xmlUrl ? <a href={invoice.xmlUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-xs font-bold">XML</a> : null}</div></div>)}{!props.invoices.length ? <p className="py-4 text-sm text-slate-500">{!props.invoicesAvailable ? "Não foi possível consultar as notas agora." : props.fiscalStatus === "not_configured" ? "A emissão fiscal ainda precisa ser habilitada pela Altum. Solicite sua nota pelo suporte." : "Nenhuma nota fiscal disponível neste momento."}</p> : null}</div><a href="mailto:suporte.altum@gmail.com?subject=Nota%20fiscal%20Altum" className="mt-3 inline-flex text-xs font-bold text-blue-700">Solicitar ajuda com a nota fiscal</a></article>
    </div>
    {props.activity.length ? <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Solicitações da assinatura</h2><ul className="mt-3 divide-y divide-slate-100">{props.activity.map((activity) => <li key={activity.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{activity.pending ? "Cancelamento em conciliação" : "Cancelamento registrado"}{activity.protocol ? ` · Protocolo ${activity.protocol}` : ""}</span><span className="text-xs text-slate-500">{date(activity.createdAt)}</span></li>)}</ul></article> : null}
  </section>;
}
