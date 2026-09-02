import { adminDb } from "@/app/lib/server/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { getAiMonthlyUsageSnapshot } from "@/lib/server/ai/usage-ledger";

export type TenantCommercialUsage = {
  users: number;
  whatsappChannels: number;
  contacts: number;
  messagesPerMonth: number;
  aiRunsPerMonth: number;
  aiEstimatedCostUsd: number;
  automationsPerMonth: number;
  storageMb: number;
  monthRef: string;
  measuredAt: string;
  messagesCapped: boolean;
};

export class TenantUsageLimitError extends Error {
  code = "tenant_storage_limit_reached";
  status = 409;

  constructor(message: string) {
    super(message);
    this.name = "TenantUsageLimitError";
  }
}

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function getTenantUserUsage(tenantId: string) {
  const snap = await adminDb.collection("tenant_users").where("tenantId", "==", tenantId).get();
  const activeClientUsers = snap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const role = clean(data.role, 40).toLowerCase();
    const status = clean(data.status, 40).toLowerCase() || "active";
    return role.startsWith("client_") && status === "active";
  });

  return {
    activeClientUsers: activeClientUsers.length,
    hasActiveEmail(email: string) {
      const normalized = clean(email, 180).toLowerCase();
      return activeClientUsers.some((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return clean(data.email, 180).toLowerCase() === normalized;
      });
    },
  };
}

export async function countTenantWhatsAppChannels(tenantId: string) {
  const snap = await adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).get();
  return snap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return clean(data.type, 40).toLowerCase() === "whatsapp";
  }).length;
}

function monthRef(referenceDate = new Date()) {
  return `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usageDocId(tenantId: string, referenceDate = new Date()) {
  return `${tenantId}_${monthRef(referenceDate)}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 300);
}

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

async function ensureAutomationUsageCounter(tenantId: string, referenceDate = new Date()) {
  const ref = adminDb.collection("tenant_usage_monthly").doc(usageDocId(tenantId, referenceDate));
  const snap = await ref.get();
  const stored = snap.exists ? Number((snap.data() as Record<string, unknown>).automationExecutions) : Number.NaN;
  if (Number.isFinite(stored) && stored >= 0) return ref;

  const start = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1);
  const end = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1);
  const jobsSnap = await adminDb.collection("jobs").where("tenantId", "==", tenantId).limit(10_000).get();
  const automationExecutions = jobsSnap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const timestamp = toMillis(data.createdAt);
    const status = clean(data.status, 40).toLowerCase();
    return (
      clean(data.type, 80) === "automation_execution" &&
      timestamp >= start &&
      timestamp < end &&
      (Number(data.actionsExecuted || 0) > 0 || status === "error")
    );
  }).length;

  await ref.set({
    tenantId,
    monthRef: monthRef(referenceDate),
    automationExecutions,
    initializedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return ref;
}

export async function getTenantAutomationExecutionUsage(tenantId: string, referenceDate = new Date()) {
  const ref = await ensureAutomationUsageCounter(tenantId, referenceDate);
  const snap = await ref.get();
  return Math.max(0, Math.round(Number((snap.data() as Record<string, unknown> | undefined)?.automationExecutions || 0)));
}

function numericSize(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function getTenantStoredBytes(tenantId: string) {
  const [messagesSnap, kbDocsSnap] = await Promise.all([
    adminDb.collection("messages").where("tenantId", "==", tenantId).limit(50_000).get(),
    adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(5_000).get(),
  ]);
  const messageBytes = messagesSnap.docs.reduce((total, doc) => {
    const data = doc.data() as Record<string, unknown>;
    return total + numericSize(data.mediaSize);
  }, 0);
  const knowledgeBytes = kbDocsSnap.docs.reduce((total, doc) => {
    const data = doc.data() as Record<string, unknown>;
    return total + (numericSize(data.mediaSize) || numericSize(data.fileSize) || numericSize(data.sizeBytes));
  }, 0);
  return messageBytes + knowledgeBytes;
}

export async function assertTenantStorageAvailable(tenantId: string, incomingBytes: number) {
  const entitlements = await getTenantEntitlements(tenantId);
  const limitMb = Number(entitlements.limits.storageMb || 0);
  if (!Number.isFinite(limitMb) || limitMb <= 0) return;

  const normalizedIncoming = Math.max(0, Number(incomingBytes || 0));
  const storedBytes = await getTenantStoredBytes(tenantId);
  const limitBytes = limitMb * 1024 * 1024;
  if (storedBytes + normalizedIncoming <= limitBytes) return;

  throw new TenantUsageLimitError(
    `Armazenamento contratado atingido (${Math.round(limitMb)} MB). Libere espaço ou ajuste o plano para enviar novos arquivos.`
  );
}

export async function getTenantCommercialUsage(
  tenantId: string,
  referenceDate = new Date()
): Promise<TenantCommercialUsage> {
  const normalizedTenantId = clean(tenantId, 180);
  if (!normalizedTenantId) throw new Error("Tenant invalido para leitura de uso.");

  const monthStart = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1);
  const messageReadLimit = 50_000;

  const [userUsage, whatsappChannels, contactsSnap, messagesSnap, kbDocsSnap, aiUsage, automationUsage] =
    await Promise.all([
      getTenantUserUsage(normalizedTenantId),
      countTenantWhatsAppChannels(normalizedTenantId),
      adminDb.collection("leads").where("tenantId", "==", normalizedTenantId).count().get(),
      adminDb.collection("messages").where("tenantId", "==", normalizedTenantId).limit(messageReadLimit).get(),
      adminDb.collection("kb_docs").where("tenantId", "==", normalizedTenantId).limit(5_000).get(),
      getAiMonthlyUsageSnapshot(normalizedTenantId, referenceDate),
      getTenantAutomationExecutionUsage(normalizedTenantId, referenceDate),
    ]);

  let messagesPerMonth = 0;
  let storedBytes = 0;
  for (const doc of messagesSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const createdAt = toMillis(data.createdAt);
    if (createdAt >= monthStart && createdAt < nextMonthStart) messagesPerMonth += 1;
    storedBytes += numericSize(data.mediaSize);
  }
  for (const doc of kbDocsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    storedBytes += numericSize(data.mediaSize) || numericSize(data.fileSize) || numericSize(data.sizeBytes);
  }

  return {
    users: userUsage.activeClientUsers,
    whatsappChannels,
    contacts: Math.max(0, Number(contactsSnap.data().count || 0)),
    messagesPerMonth,
    aiRunsPerMonth: aiUsage.runs,
    aiEstimatedCostUsd: Math.max(0, Number(aiUsage.estimatedCostUsd || 0)),
    automationsPerMonth: automationUsage,
    storageMb: Math.round((storedBytes / (1024 * 1024)) * 10) / 10,
    monthRef: monthRef(referenceDate),
    measuredAt: new Date().toISOString(),
    messagesCapped: messagesSnap.size >= messageReadLimit,
  };
}

export async function reserveTenantAutomationExecution(tenantId: string) {
  const entitlements = await getTenantEntitlements(tenantId);
  const limit = Number(entitlements.limits.automationsPerMonth || 0);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true, limit: 0, currentUsage: 0 };
  }

  const ref = await ensureAutomationUsageCounter(tenantId);
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const currentUsage = Math.max(0, Number((snap.data() as Record<string, unknown> | undefined)?.automationExecutions || 0));
    if (currentUsage >= limit) return { allowed: false, limit, currentUsage };
    transaction.set(ref, {
      tenantId,
      monthRef: monthRef(),
      automationExecutions: currentUsage + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { allowed: true, limit, currentUsage: currentUsage + 1 };
  });
}
