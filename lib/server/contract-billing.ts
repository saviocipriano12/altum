import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { AGENCY_TENANT_ID, getWhatsAppChannelForTenant, sendMetaTextMessage } from "@/app/lib/server/whatsapp-channel";
import {
  normalizeChargeBillingType,
  resolveChargeMethodForAsaas,
  type TenantChargeBillingType,
} from "@/lib/server/commercial-charge";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

type TenantRow = {
  id: string;
  name: string;
  legacyClientId: string;
};

type ClientRow = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
};

type ContractRow = {
  id: string;
  clientId: string;
  clientName: string;
  status: string;
  title: string;
  monthlyValue: number;
  dueDay: number;
  nextDueDate: string;
  paymentLink: string;
  autoBillingEnabled: boolean;
  autoBillingAdvanceDays: number;
  autoBillingBillingType: TenantChargeBillingType;
  reminderWhatsAppPhones: string[];
  autoSuspendEnabled: boolean;
  autoSuspendBusinessDays: number;
};

type AsaasPaymentPayload = {
  id?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: string;
  errors?: Array<{ description?: string }>;
};

type AsaasPixQrCodePayload = {
  encodedImage?: string;
  payload?: string;
  errors?: Array<{ description?: string }>;
};

type BillingItemStatus = "generated" | "reminded" | "suspended" | "reactivated" | "skipped" | "failed";

export type ContractBillingRunItem = {
  contractId: string;
  clientId: string;
  tenantId: string;
  dueDate: string;
  status: BillingItemStatus;
  reason: string;
  financeId?: string;
  chargeId?: string;
  reminderStatus?: string;
  reminderSent?: number;
  reminderFailed?: number;
};

export type ContractBillingRunResult = {
  processed: number;
  generated: number;
  reminded: number;
  suspended: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  results: ContractBillingRunItem[];
};

export type ContractBillingRunOptions = {
  tenantId?: string;
  maxContracts?: number;
  dryRun?: boolean;
  now?: Date;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmd(date: Date) {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function parseYmd(value: string) {
  const normalized = clean(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [yearRaw, monthRaw, dayRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysUntil(from: Date, to: Date) {
  const diffMs = startOfUtcDay(to) - startOfUtcDay(from);
  return Math.round(diffMs / 86_400_000);
}

function lastDayOfMonthUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12, 0, 0, 0)).getUTCDate();
}

function dueDateForMonthUtc(year: number, monthIndex: number, dueDay: number) {
  const safeDueDay = Math.max(1, Math.min(31, Math.round(dueDay)));
  const day = Math.min(safeDueDay, lastDayOfMonthUtc(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

function resolveDueDate(contract: ContractRow, now: Date) {
  const explicit = parseYmd(contract.nextDueDate);
  if (explicit) return explicit;

  const baseYear = now.getUTCFullYear();
  const baseMonth = now.getUTCMonth();
  const thisMonthDue = dueDateForMonthUtc(baseYear, baseMonth, contract.dueDay);

  if (daysUntil(now, thisMonthDue) >= 0) {
    return thisMonthDue;
  }

  return dueDateForMonthUtc(baseYear, baseMonth + 1, contract.dueDay);
}

function resolveNextDueDate(currentDueDate: Date, dueDay: number) {
  return dueDateForMonthUtc(currentDueDate.getUTCFullYear(), currentDueDate.getUTCMonth() + 1, dueDay);
}

function parseReminderPhones(value: unknown) {
  const source = Array.isArray(value)
    ? value.map((item) => clean(item, 40))
    : clean(value, 400)
        .split(/[\n,;]+/)
        .map((item) => clean(item, 40));

  return Array.from(
    new Set(
      source
        .map((item) => normalizePhoneBR(item))
        .filter((phone) => phone.length >= 12)
    )
  ).slice(0, 8);
}

function formatDateBr(ymd: string) {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  return parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatCurrencyBr(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizeContractRow(docId: string, data: Record<string, unknown>) {
  const autoBillingBillingType = normalizeChargeBillingType(data.autoBillingBillingType);
  return {
    id: docId,
    clientId: clean(data.clientId, 140) || docId,
    clientName: clean(data.clientName, 180) || "Cliente",
    status: clean(data.status, 40).toLowerCase() || "ativo",
    title: clean(data.title, 180) || "Contrato de Prestacao de Servicos",
    monthlyValue: Number(toNumber(data.monthlyValue, 0).toFixed(2)),
    dueDay: Math.max(1, Math.min(31, Math.round(toNumber(data.dueDay, 10)))),
    nextDueDate: clean(data.nextDueDate, 20),
    paymentLink: clean(data.paymentLink, 500),
    autoBillingEnabled: data.autoBillingEnabled === true,
    autoBillingAdvanceDays: Math.max(1, Math.min(15, Math.round(toNumber(data.autoBillingAdvanceDays, 5)))),
    autoBillingBillingType,
    reminderWhatsAppPhones: parseReminderPhones(data.reminderWhatsAppPhones),
    autoSuspendEnabled: data.autoSuspendEnabled !== false,
    autoSuspendBusinessDays: Math.max(1, Math.min(10, Math.round(toNumber(data.autoSuspendBusinessDays, 2)))),
  } satisfies ContractRow;
}

function resolveContractTenant(
  contract: ContractRow,
  byLegacyClientId: Map<string, TenantRow>,
  byTenantId: Map<string, TenantRow>
) {
  return byTenantId.get(contract.clientId) || byLegacyClientId.get(contract.clientId) || null;
}

async function ensureAsaasCustomer(input: {
  name: string;
  email: string;
  phone?: string;
}) {
  const searchRes = await fetch(
    `${ASAAS_API_URL}/customers?email=${encodeURIComponent(input.email)}`,
    {
      headers: { access_token: ASAAS_API_KEY as string },
    }
  );
  const searchPayload = (await searchRes.json().catch(() => ({}))) as {
    data?: Array<{ id?: string }>;
  };

  const existingId = clean(searchPayload.data?.[0]?.id, 120);
  if (existingId) return existingId;

  const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY as string,
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      mobilePhone: clean(input.phone, 30) || undefined,
    }),
  });

  const createPayload = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    errors?: Array<{ description?: string }>;
  };

  if (!createRes.ok || createPayload.errors?.length) {
    throw new Error(
      clean(createPayload.errors?.[0]?.description, 300) || "Falha ao criar cliente no Asaas."
    );
  }

  const customerId = clean(createPayload.id, 120);
  if (!customerId) {
    throw new Error("Asaas nao retornou customerId valido.");
  }

  return customerId;
}

async function createAsaasCharge(input: {
  customerId: string;
  amount: number;
  dueDate: string;
  billingType: TenantChargeBillingType;
  description: string;
  externalReference: string;
}) {
  const response = await fetch(`${ASAAS_API_URL}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY as string,
    },
    body: JSON.stringify({
      customer: input.customerId,
      billingType: resolveChargeMethodForAsaas(input.billingType),
      value: input.amount,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as AsaasPaymentPayload;
  if (!response.ok || payload.errors?.length) {
    throw new Error(clean(payload.errors?.[0]?.description, 300) || "Falha ao criar cobranca no Asaas.");
  }

  const chargeId = clean(payload.id, 120);
  if (!chargeId) {
    throw new Error("Asaas nao retornou chargeId valido.");
  }

  return {
    id: chargeId,
    invoiceUrl: clean(payload.invoiceUrl, 500) || null,
    bankSlipUrl: clean(payload.bankSlipUrl, 500) || null,
    billingType: clean(payload.billingType, 40) || input.billingType,
    pixPayload: await (async () => {
      if (input.billingType !== "PIX") return null;
      const qrRes = await fetch(`${ASAAS_API_URL}/payments/${chargeId}/pixQrCode`, {
        headers: { access_token: ASAAS_API_KEY as string },
      });
      const qrPayload = (await qrRes.json().catch(() => ({}))) as AsaasPixQrCodePayload;
      if (!qrRes.ok || qrPayload.errors?.length) return null;
      return clean(qrPayload.payload, 1200) || null;
    })(),
  };
}

function buildRunId(contractId: string, dueDate: string) {
  return `${contractId}_${dueDate}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220);
}

async function claimContractRun(contractId: string, dueDate: string) {
  const runId = buildRunId(contractId, dueDate);
  const ref = adminDb.collection("contract_billing_runs").doc(runId);
  let claimed = false;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const status = clean(current.status, 40).toLowerCase();

    if (status === "processing" || status === "success") {
      claimed = false;
      return;
    }

    claimed = true;
    tx.set(
      ref,
      {
        id: runId,
        contractId,
        dueDate,
        status: "processing",
        attempts: FieldValue.increment(1),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { claimed, runId };
}

async function setRunSuccess(input: {
  runId: string;
  financeId: string;
  chargeId: string;
  reminderStatus: string;
  reminderSent: number;
  reminderFailed: number;
}) {
  await adminDb.collection("contract_billing_runs").doc(input.runId).set(
    {
      status: "success",
      financeId: input.financeId,
      chargeId: input.chargeId,
      reminderStatus: input.reminderStatus,
      reminderSent: input.reminderSent,
      reminderFailed: input.reminderFailed,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function setRunFailed(runId: string, error: string) {
  await adminDb.collection("contract_billing_runs").doc(runId).set(
    {
      status: "failed",
      lastError: clean(error, 500) || "Falha na execucao.",
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function sendBillingReminderWhatsapp(input: {
  tenantId: string;
  client: ClientRow;
  contract: ContractRow;
  amount: number;
  dueDate: string;
  invoiceUrl: string;
  paymentLink: string;
  pixPayload?: string | null;
  reminderKind?: "pre_due" | "due_today" | "overdue_blocked";
}) {
  const fallbackPhone = normalizePhoneBR(input.client.phone);
  const recipients = Array.from(
    new Set([...input.contract.reminderWhatsAppPhones, ...(fallbackPhone ? [fallbackPhone] : [])])
  ).filter((phone) => phone.length >= 12);

  if (!recipients.length) {
    return {
      reminderStatus: "skipped_no_recipients",
      reminderSent: 0,
      reminderFailed: 0,
    };
  }

  const channel =
    (await getWhatsAppChannelForTenant(AGENCY_TENANT_ID, { allowAgencyFallback: true })) ||
    (await getWhatsAppChannelForTenant(input.tenantId, { allowAgencyFallback: true }));
  if (!channel) {
    return {
      reminderStatus: "skipped_no_channel",
      reminderSent: 0,
      reminderFailed: recipients.length,
    };
  }

  const paymentTarget = input.invoiceUrl || input.paymentLink;
  const reminderKind = input.reminderKind || "pre_due";
  const heading =
    reminderKind === "due_today"
      ? "ALTUM - Pagamento vence hoje"
      : reminderKind === "overdue_blocked"
        ? "ALTUM - Acesso pausado por pagamento pendente"
        : "ALTUM - Lembrete de pagamento";
  const body = [
    heading,
    `Cliente: ${input.client.name}`,
    `Valor: ${formatCurrencyBr(input.amount)}`,
    `Vencimento: ${formatDateBr(input.dueDate)}`,
    reminderKind === "pre_due"
      ? `Cobranca gerada automaticamente ${input.contract.autoBillingAdvanceDays} dia(s) antes do vencimento.`
      : reminderKind === "due_today"
        ? "Identificamos que esta mensalidade vence hoje."
        : "A plataforma foi pausada ate a confirmacao do pagamento. Nenhum dado foi apagado.",
    input.pixPayload ? `Pix copia e cola: ${input.pixPayload}` : "",
    paymentTarget ? `Pagamento: ${paymentTarget}` : "Pagamento: entre em contato com o financeiro.",
  ].filter(Boolean).join("\n");

  const deliveries = await Promise.allSettled(
    recipients.map((phone) =>
      sendMetaTextMessage({
        channel,
        to: phone,
        text: body,
      })
    )
  );

  const reminderSent = deliveries.filter((item) => item.status === "fulfilled").length;
  const reminderFailed = Math.max(0, recipients.length - reminderSent);
  const reminderStatus =
    reminderFailed === 0 ? "success" : reminderSent > 0 ? "partial_failure" : "failed";

  return {
    reminderStatus,
    reminderSent,
    reminderFailed,
  };
}

function isPaidStatus(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  return normalized === "pago" || normalized === "paid" || normalized === "received" || normalized === "confirmed";
}

function businessDaysAfter(dueDate: Date, now: Date) {
  let count = 0;
  const cursor = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate() + 1, 12));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

async function markTenantBillingBlocked(input: {
  tenantId: string;
  financeId: string;
  contractId: string;
  dueDate: string;
  amount: number;
}) {
  if (!input.tenantId) return;

  await Promise.all([
    adminDb.collection("tenants").doc(input.tenantId).set(
      {
        status: "blocked",
        blockedReason: "billing_overdue",
        billingStatus: "blocked",
        billingBlockedAt: FieldValue.serverTimestamp(),
        billingBlockedFinanceId: input.financeId,
        billingBlockedContractId: input.contractId,
        billingBlockedDueDate: input.dueDate,
        billingBlockedAmount: Number(input.amount || 0),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("tenant_settings").doc(input.tenantId).set(
      {
        billing: {
          status: "blocked",
          reason: "billing_overdue",
          blockedAt: FieldValue.serverTimestamp(),
          financeId: input.financeId,
          contractId: input.contractId,
          dueDate: input.dueDate,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("audit_logs").add({
      type: "tenant_billing_blocked",
      tenantId: input.tenantId,
      financeId: input.financeId,
      contractId: input.contractId,
      dueDate: input.dueDate,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
}

export async function reactivateTenantAfterBillingPayment(input: {
  tenantId: string;
  financeId?: string;
  asaasChargeId?: string;
}) {
  const tenantId = clean(input.tenantId, 140);
  if (!tenantId) return { reactivated: false, reason: "tenant_missing" };

  const pendingSnap = await adminDb
    .collection("financeiro")
    .where("tenantId", "==", tenantId)
    .where("contractAutoBilling", "==", true)
    .limit(200)
    .get();

  const hasOpenOverdue = pendingSnap.docs.some((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (isPaidStatus(data.status) || clean(data.status, 40).toLowerCase() === "cancelado") return false;
    const dueDate = parseYmd(clean(data.contractDueDate || data.vencimento || data.dueDate, 20));
    return Boolean(dueDate && daysUntil(new Date(), dueDate) < 0);
  });

  if (hasOpenOverdue) {
    return { reactivated: false, reason: "open_overdue_finance" };
  }

  await Promise.all([
    adminDb.collection("tenants").doc(tenantId).set(
      {
        status: "active",
        blockedReason: null,
        billingStatus: "active",
        billingReactivatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("tenant_settings").doc(tenantId).set(
      {
        billing: {
          status: "active",
          reason: null,
          reactivatedAt: FieldValue.serverTimestamp(),
          financeId: clean(input.financeId, 140) || null,
          asaasChargeId: clean(input.asaasChargeId, 140) || null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("audit_logs").add({
      type: "tenant_billing_reactivated",
      tenantId,
      financeId: clean(input.financeId, 140) || null,
      asaasChargeId: clean(input.asaasChargeId, 140) || null,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return { reactivated: true, reason: "payment_confirmed" };
}

async function processOpenBillingFollowUps(input: {
  contractsById: Map<string, ContractRow>;
  clientsCache: Map<string, ClientRow>;
  now: Date;
  tenantFilter?: string;
  dryRun?: boolean;
}) {
  const snap = await adminDb
    .collection("financeiro")
    .where("contractAutoBilling", "==", true)
    .limit(800)
    .get();

  const results: ContractBillingRunItem[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const tenantId = clean(data.tenantId, 140);
    if (input.tenantFilter && tenantId !== input.tenantFilter) continue;
    if (!tenantId || isPaidStatus(data.status) || clean(data.status, 40).toLowerCase() === "cancelado") continue;

    const dueDate = clean(data.contractDueDate || data.vencimento || data.dueDate, 20);
    const parsedDueDate = parseYmd(dueDate);
    if (!parsedDueDate) continue;

    const contractId = clean(data.contractId, 140);
    const contract = input.contractsById.get(contractId);
    if (!contract) continue;

    const clientId = clean(data.clientId, 140) || contract.clientId;
    let client = input.clientsCache.get(clientId);
    if (!client) {
      client = await readClientRow(clientId);
      input.clientsCache.set(clientId, client);
    }

    const diffDays = daysUntil(input.now, parsedDueDate);
    const overdueBusinessDays = businessDaysAfter(parsedDueDate, input.now);
    const amount = Number(toNumber(data.valor, contract.monthlyValue).toFixed(2));
    const invoiceUrl = clean(data.invoiceUrl, 500);
    const paymentLink = clean(data.paymentLink, 500) || contract.paymentLink;
    const pixPayload = clean(data.pixPayload, 1200) || null;

    if (diffDays === 0 && !data.dueReminderSentAt) {
      if (!input.dryRun) {
        const reminder = await sendBillingReminderWhatsapp({
          tenantId,
          client,
          contract,
          amount,
          dueDate,
          invoiceUrl,
          paymentLink,
          pixPayload,
          reminderKind: "due_today",
        });
        await doc.ref.set(
          {
            status: "pendente",
            dueReminderStatus: reminder.reminderStatus,
            dueReminderSent: reminder.reminderSent,
            dueReminderFailed: reminder.reminderFailed,
            dueReminderSentAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      results.push({
        contractId,
        clientId,
        tenantId,
        dueDate,
        status: "reminded",
        reason: "due_today_reminder_sent",
        financeId: doc.id,
      });
    }

    if (
      contract.autoSuspendEnabled &&
      overdueBusinessDays >= contract.autoSuspendBusinessDays &&
      !data.billingBlockedAt
    ) {
      if (!input.dryRun) {
        const reminder = await sendBillingReminderWhatsapp({
          tenantId,
          client,
          contract,
          amount,
          dueDate,
          invoiceUrl,
          paymentLink,
          pixPayload,
          reminderKind: "overdue_blocked",
        });
        await Promise.all([
          markTenantBillingBlocked({ tenantId, financeId: doc.id, contractId, dueDate, amount }),
          doc.ref.set(
            {
              status: "atrasado",
              billingBlockedAt: FieldValue.serverTimestamp(),
              billingBlockReminderStatus: reminder.reminderStatus,
              billingBlockReminderSent: reminder.reminderSent,
              billingBlockReminderFailed: reminder.reminderFailed,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          ),
        ]);
      }
      results.push({
        contractId,
        clientId,
        tenantId,
        dueDate,
        status: "suspended",
        reason: "overdue_business_days_reached",
        financeId: doc.id,
      });
    }
  }

  return results;
}

async function listActiveContracts(limit: number) {
  const snap = await adminDb
    .collection("client_contracts")
    .where("status", "==", "ativo")
    .limit(limit)
    .get();

  return snap.docs.map((doc) =>
    normalizeContractRow(doc.id, doc.data() as Record<string, unknown>)
  );
}

async function listTenantRows() {
  const snap = await adminDb.collection("tenants").limit(3000).get();
  return snap.docs.map<TenantRow>((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: clean(data.name, 180) || "Tenant",
      legacyClientId: clean(data.legacyClientId, 140) || doc.id,
    };
  });
}

async function readClientRow(clientId: string) {
  const snap = await adminDb.collection("clientes").doc(clientId).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return {
    id: clientId,
    name: clean(data.name, 180) || "Cliente",
    contactName: clean(data.contactName, 180),
    email: clean(data.email, 180).toLowerCase(),
    phone: clean(data.phone, 40),
  } satisfies ClientRow;
}

export async function runContractBillingCycle(
  options?: ContractBillingRunOptions
): Promise<ContractBillingRunResult> {
  const dryRun = options?.dryRun === true;
  const tenantFilter = clean(options?.tenantId, 140);
  const maxContracts = Math.max(1, Math.min(500, Math.round(toNumber(options?.maxContracts, 120))));
  const now = options?.now instanceof Date ? options.now : new Date();

  if (!dryRun && !ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY nao configurada para cobranca automatica.");
  }

  const [contracts, tenants] = await Promise.all([
    listActiveContracts(maxContracts),
    listTenantRows(),
  ]);

  const tenantByLegacyClientId = new Map<string, TenantRow>();
  const tenantById = new Map<string, TenantRow>();
  for (const tenant of tenants) {
    tenantByLegacyClientId.set(tenant.legacyClientId, tenant);
    tenantById.set(tenant.id, tenant);
  }

  const clientsCache = new Map<string, ClientRow>();
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const results: ContractBillingRunItem[] = [];

  for (const contract of contracts) {
    const dueDate = formatYmd(resolveDueDate(contract, now));
    const tenant = resolveContractTenant(contract, tenantByLegacyClientId, tenantById);
    const tenantId = tenant?.id || "";

    const pushResult = (item: Omit<ContractBillingRunItem, "tenantId" | "dueDate">) => {
      results.push({
        ...item,
        tenantId,
        dueDate,
      });
    };

    if (!tenantId) {
      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "skipped",
        reason: "tenant_not_found",
      });
      continue;
    }

    if (tenantFilter && tenantId !== tenantFilter) {
      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "skipped",
        reason: "tenant_filtered_out",
      });
      continue;
    }

    if (!contract.autoBillingEnabled) {
      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "skipped",
        reason: "auto_billing_disabled",
      });
      continue;
    }

    if (contract.monthlyValue <= 0) {
      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "skipped",
        reason: "invalid_monthly_value",
      });
      continue;
    }

    const remainingDays = daysUntil(now, parseYmd(dueDate) || now);
    if (remainingDays !== contract.autoBillingAdvanceDays) {
      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "skipped",
        reason: "not_due_for_automation_window",
      });
      continue;
    }

    let runId = "";
    if (!dryRun) {
      const claim = await claimContractRun(contract.id, dueDate);
      if (!claim.claimed) {
        pushResult({
          contractId: contract.id,
          clientId: contract.clientId,
          status: "skipped",
          reason: "already_processed_or_running",
        });
        continue;
      }
      runId = claim.runId;
    }

    try {
      let client = clientsCache.get(contract.clientId);
      if (!client) {
        client = await readClientRow(contract.clientId);
        clientsCache.set(contract.clientId, client);
      }

      const customerName = clean(client.contactName, 180) || clean(client.name, 180) || contract.clientName;
      const customerEmail = clean(client.email, 180).toLowerCase();
      const customerPhone = normalizePhoneBR(client.phone);
      if (!customerEmail) {
        throw new Error("Cliente sem email valido para criar cobranca no Asaas.");
      }

      if (dryRun) {
        pushResult({
          contractId: contract.id,
          clientId: contract.clientId,
          status: "generated",
          reason: "dry_run_would_generate",
        });
        continue;
      }

      const customerId = await ensureAsaasCustomer({
        name: customerName || "Cliente",
        email: customerEmail,
        phone: customerPhone || undefined,
      });

      const description = clean(contract.title, 120)
        ? `${clean(contract.title, 120)} - mensalidade`
        : `Mensalidade ALTUM - ${clean(client.name, 120) || "Cliente"}`;

      const charge = await createAsaasCharge({
        customerId,
        amount: contract.monthlyValue,
        dueDate,
        billingType: contract.autoBillingBillingType,
        description,
        externalReference: `contract:${contract.id}:${dueDate}`,
      });

      const financeRef = await adminDb.collection("financeiro").add({
        tenantId,
        clientId: contract.clientId,
        clientName: clean(client.name, 180) || contract.clientName || "Cliente",
        descricao: `Mensalidade automatica - ${clean(client.name, 120) || "Cliente"}`,
        valor: Number(contract.monthlyValue.toFixed(2)),
        tipo: "Receita",
        categoria: "Mensalidade",
        status: "pendente",
        payoutStatus: "pendente",
        vencimento: dueDate,
        referencia: `contract:${contract.id}:${dueDate}`,
        contractId: contract.id,
        contractDueDate: dueDate,
        contractAutoBilling: true,
        asaasChargeId: charge.id,
        billingType: contract.autoBillingBillingType,
        invoiceUrl: charge.invoiceUrl,
        bankSlipUrl: charge.bankSlipUrl,
        pixPayload: charge.pixPayload,
        clientEmail: customerEmail,
        clientPhone: customerPhone || null,
        paymentLink: clean(contract.paymentLink, 500) || charge.invoiceUrl || null,
        createdBy: "system_contract_billing",
        createdByName: "Sistema de Cobranca",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const nextDueDate = formatYmd(resolveNextDueDate(parseYmd(dueDate) || now, contract.dueDay));
      const reminder = await sendBillingReminderWhatsapp({
        tenantId,
        client,
        contract,
        amount: contract.monthlyValue,
        dueDate,
        invoiceUrl: charge.invoiceUrl || "",
        paymentLink: contract.paymentLink,
        pixPayload: charge.pixPayload,
      });

      await Promise.all([
        adminDb.collection("client_contracts").doc(contract.id).set(
          {
            nextDueDate,
            lastAutoChargeAt: FieldValue.serverTimestamp(),
            lastAutoChargeDueDate: dueDate,
            lastAutoChargeFinanceId: financeRef.id,
            lastAutoChargeId: charge.id,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        adminDb.collection("financeiro").doc(financeRef.id).set(
          {
        reminderStatus: reminder.reminderStatus,
        reminderSent: reminder.reminderSent,
        reminderFailed: reminder.reminderFailed,
        preDueReminderSentAt:
          reminder.reminderStatus === "success" || reminder.reminderStatus === "partial_failure"
            ? FieldValue.serverTimestamp()
            : null,
        reminderSentAt:
          reminder.reminderStatus === "success" || reminder.reminderStatus === "partial_failure"
            ? FieldValue.serverTimestamp()
                : null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        adminDb.collection("audit_logs").add({
          type: "contract_auto_billing_charge_created",
          tenantId,
          clientId: contract.clientId,
          contractId: contract.id,
          financeId: financeRef.id,
          asaasChargeId: charge.id,
          dueDate,
          reminderStatus: reminder.reminderStatus,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);

      await setRunSuccess({
        runId,
        financeId: financeRef.id,
        chargeId: charge.id,
        reminderStatus: reminder.reminderStatus,
        reminderSent: reminder.reminderSent,
        reminderFailed: reminder.reminderFailed,
      });

      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "generated",
        reason: "charge_created",
        financeId: financeRef.id,
        chargeId: charge.id,
        reminderStatus: reminder.reminderStatus,
        reminderSent: reminder.reminderSent,
        reminderFailed: reminder.reminderFailed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na cobranca automatica.";
      if (!dryRun && runId) {
        await setRunFailed(runId, message);
      }
      pushResult({
        contractId: contract.id,
        clientId: contract.clientId,
        status: "failed",
        reason: clean(message, 280) || "Falha na cobranca automatica.",
      });
    }
  }

  const followUpResults = await processOpenBillingFollowUps({
    contractsById,
    clientsCache,
    now,
    tenantFilter,
    dryRun,
  });
  results.push(...followUpResults);

  const generated = results.filter((item) => item.status === "generated").length;
  const reminded = results.filter((item) => item.status === "reminded").length;
  const suspended = results.filter((item) => item.status === "suspended").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const skipped = results.filter((item) => item.status === "skipped").length;

  return {
    processed: results.length,
    generated,
    reminded,
    suspended,
    skipped,
    failed,
    dryRun,
    results,
  };
}
