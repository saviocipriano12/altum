import { parseBillingDate } from "./platform-subscription-policy";

export const BILLING_TERMS_VERSION = "2026-09-17";
export const PAID_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

export function monthlyPeriodEnd(value: unknown, anchorDay?: number) {
  const start = parseBillingDate(value);
  if (!start) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(start);
  const part = (key: string) => Number(parts.find((item) => item.type === key)?.value);
  const year = part("year"), month = part("month"), day = part("day");
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, month, Math.min(anchorDay || day, lastDay), 3));
  return end;
}

export function paidAccessEnd(payments: Array<Record<string, unknown>>) {
  const paid = payments.filter((payment) => PAID_STATUSES.has(String(payment.status)) && /^\d{4}-\d{2}-\d{2}$/.test(String(payment.dueDate)));
  const anchorDay = Math.max(0, ...paid.map((payment) => Number(String(payment.dueDate).slice(-2))));
  const ends = paid.map((payment) => monthlyPeriodEnd(payment.dueDate, anchorDay)).filter((date): date is Date => Boolean(date));
  return ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : null;
}

export function billingLink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function paymentLabel(status: string) {
  return ({ PENDING: "Aguardando pagamento", CONFIRMED: "Pagamento aprovado", RECEIVED: "Pago", OVERDUE: "Em atraso", REFUNDED: "Estornado", REFUND_REQUESTED: "Estorno solicitado", REFUND_IN_PROGRESS: "Estorno em andamento", DELETED: "Cancelado", CHARGEBACK_REQUESTED: "Em contestação" } as Record<string, string>)[status] || "Em processamento";
}

export function fiscalLabel(status: string) {
  return ({ AUTHORIZED: "Emitida", SCHEDULED: "Agendada", ERROR: "Falha na emissão", CANCELED: "Cancelada", PROCESSING_CANCELLATION: "Cancelamento em andamento", CANCELLATION_DENIED: "Cancelamento recusado" } as Record<string, string>)[status] || "Em processamento";
}
