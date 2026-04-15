import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  BrowserPushSubscription,
  sendWebPushNotification,
} from "@/app/lib/server/web-push";

const SUBSCRIPTIONS_COLLECTION = "client_portal_push_subscriptions";
const STATE_COLLECTION = "client_portal_push_state";
const TEST_RATE_COLLECTION = "client_portal_push_test_rate";

export type TenantCriticalPushSnapshot = {
  slaBreached: number;
  deadLetter: number;
  overdueFollowUps: number;
  waitingReplyBacklog: number;
  aiRiskLevel: "stable" | "warning" | "high";
  capturedAt: string;
};

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeAiQueueStatus(value: unknown) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "dead_letter") return "dead_letter";
  if (status === "retrying") return "retrying";
  if (status === "processing") return "processing";
  if (status === "done") return "done";
  return "pending";
}

function subscriptionDocId(tenantId: string, endpoint: string) {
  return crypto.createHash("sha256").update(`${tenantId}:${endpoint}`).digest("hex");
}

function pushTestRateDocId(tenantId: string, uid: string) {
  return crypto.createHash("sha256").update(`${tenantId}:${uid}:push-test-rate`).digest("hex");
}

function mapSubscriptionDoc(
  doc:
    | FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
    | FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
) {
  const data = doc.data() as Record<string, unknown> | undefined;
  if (!data) return null;
  return {
    id: doc.id,
    uid: String(data.uid || ""),
    tenantId: String(data.tenantId || ""),
    enabled: data.enabled !== false,
    endpoint: String(data.endpoint || ""),
    subscription: {
      endpoint: String(data.endpoint || ""),
      expirationTime:
        typeof data.expirationTime === "number" || data.expirationTime === null
          ? (data.expirationTime as number | null)
          : null,
      keys:
        data.keys && typeof data.keys === "object"
          ? {
              p256dh: String((data.keys as Record<string, unknown>).p256dh || ""),
              auth: String((data.keys as Record<string, unknown>).auth || ""),
            }
          : { p256dh: "", auth: "" },
    } satisfies BrowserPushSubscription,
  };
}

export async function upsertPortalPushSubscription(input: {
  tenantId: string;
  uid: string;
  subscription: BrowserPushSubscription;
  userAgent?: string;
}) {
  const nowIso = new Date().toISOString();
  const docId = subscriptionDocId(input.tenantId, input.subscription.endpoint);
  const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(docId);
  const existing = await ref.get();

  await ref.set(
    {
      id: docId,
      tenantId: input.tenantId,
      uid: input.uid,
      endpoint: input.subscription.endpoint,
      expirationTime: input.subscription.expirationTime || null,
      keys: input.subscription.keys,
      userAgent: String(input.userAgent || "").slice(0, 500),
      enabled: true,
      lastStatus: "active",
      lastError: null,
      lastNotifiedAt: existing.exists ? existing.get("lastNotifiedAt") || null : null,
      createdAt: existing.exists ? existing.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true }
  );

  return { id: docId };
}

export async function removePortalPushSubscription(input: {
  tenantId: string;
  endpoint: string;
}) {
  const docId = subscriptionDocId(input.tenantId, input.endpoint);
  const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return { removed: false };
  await ref.delete();
  return { removed: true };
}

export async function removePortalPushSubscriptionForTenantUser(input: {
  tenantId: string;
  uid: string;
  endpoint: string;
}) {
  const docId = subscriptionDocId(input.tenantId, input.endpoint);
  const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return { removed: false };

  const data = snap.data() as Record<string, unknown>;
  const belongsToTenant = String(data.tenantId || "") === input.tenantId;
  const belongsToUser = String(data.uid || "") === input.uid;
  if (!belongsToTenant || !belongsToUser) {
    return { removed: false };
  }

  await ref.delete();
  return { removed: true };
}

export async function removePortalPushSubscriptionsByTenantUser(input: {
  tenantId: string;
  uid: string;
}) {
  const snap = await adminDb
    .collection(SUBSCRIPTIONS_COLLECTION)
    .where("tenantId", "==", input.tenantId)
    .where("uid", "==", input.uid)
    .limit(200)
    .get();

  if (snap.empty) {
    return { removed: 0 };
  }

  const batch = adminDb.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  return { removed: snap.size };
}

export async function listPortalPushSubscriptionsByTenant(tenantId: string) {
  const snap = await adminDb
    .collection(SUBSCRIPTIONS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .limit(400)
    .get();

  return snap.docs
    .map((doc) => mapSubscriptionDoc(doc))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.enabled);
}

export async function listPortalPushSubscriptionsByTenantAndUser(
  tenantId: string,
  uid: string
) {
  const snap = await adminDb
    .collection(SUBSCRIPTIONS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .where("uid", "==", uid)
    .limit(200)
    .get();

  return snap.docs
    .map((doc) => mapSubscriptionDoc(doc))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.enabled);
}

export async function consumePortalPushTestQuota(input: {
  tenantId: string;
  uid: string;
  cooldownMs?: number;
}) {
  const nowMs = Date.now();
  const cooldownMs = Math.max(15_000, Math.min(10 * 60_000, input.cooldownMs || 60_000));
  const docId = pushTestRateDocId(input.tenantId, input.uid);
  const ref = adminDb.collection(TEST_RATE_COLLECTION).doc(docId);

  let allowed = false;
  let retryAfterMs = 0;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const lastRequestedAtMs = Number(data.lastRequestedAtMs || 0);
    const elapsedMs = Math.max(0, nowMs - lastRequestedAtMs);

    if (lastRequestedAtMs && elapsedMs < cooldownMs) {
      allowed = false;
      retryAfterMs = cooldownMs - elapsedMs;
      return;
    }

    allowed = true;
    retryAfterMs = 0;
    tx.set(
      ref,
      {
        id: docId,
        tenantId: input.tenantId,
        uid: input.uid,
        lastRequestedAt: FieldValue.serverTimestamp(),
        lastRequestedAtMs: nowMs,
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return {
    allowed,
    retryAfterMs,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

async function sendPushToSubscriptionRecords(
  subscriptions: Array<{
    id: string;
    endpoint: string;
    subscription: BrowserPushSubscription;
  }>,
  input: {
    title: string;
    body: string;
    tag: string;
    url: string;
    ttl?: number;
  }
) {
  if (!subscriptions.length) {
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const uniqueByEndpoint = new Map<string, (typeof subscriptions)[number]>();
  for (const item of subscriptions) {
    if (!item.endpoint) continue;
    if (!uniqueByEndpoint.has(item.endpoint)) {
      uniqueByEndpoint.set(item.endpoint, item);
    }
  }

  const deduped = Array.from(uniqueByEndpoint.values());

  let sent = 0;
  let failed = 0;
  let pruned = 0;

  const nowIso = new Date().toISOString();

  for (const item of deduped) {
    const result = await sendWebPushNotification({
      subscription: item.subscription,
      payload: {
        title: input.title,
        body: input.body,
        tag: input.tag,
        url: input.url,
      },
      ttl: input.ttl,
    });

    const ref = adminDb.collection(SUBSCRIPTIONS_COLLECTION).doc(item.id);
    if (result.ok) {
      sent += 1;
      await ref.set(
        {
          lastStatus: "sent",
          lastError: null,
          lastNotifiedAt: FieldValue.serverTimestamp(),
          lastNotifiedAtIso: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      continue;
    }

    failed += 1;
    const statusCode = Number(result.statusCode || 0);
    const shouldPrune = statusCode === 404 || statusCode === 410;
    if (shouldPrune) {
      pruned += 1;
      await ref.set(
        {
          enabled: false,
          lastStatus: "pruned",
          lastError: result.error || "subscription_gone",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await ref.set(
        {
          lastStatus: "error",
          lastError: result.error || "push_failed",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  return { sent, failed, pruned };
}

export async function sendCriticalPushToTenant(input: {
  tenantId: string;
  title: string;
  body: string;
  tag: string;
  url: string;
  ttl?: number;
}) {
  const subscriptions = await listPortalPushSubscriptionsByTenant(input.tenantId);
  return sendPushToSubscriptionRecords(subscriptions, input);
}

export async function sendCriticalPushToTenantUser(input: {
  tenantId: string;
  uid: string;
  title: string;
  body: string;
  tag: string;
  url: string;
  ttl?: number;
}) {
  const subscriptions = await listPortalPushSubscriptionsByTenantAndUser(
    input.tenantId,
    input.uid
  );
  return sendPushToSubscriptionRecords(subscriptions, input);
}

export async function collectTenantCriticalPushSnapshot(
  tenantId: string
): Promise<TenantCriticalPushSnapshot> {
  const now = Date.now();
  const [chatsSnap, jobsSnap, tasksSnap] = await Promise.all([
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(600).get(),
    adminDb.collection("jobs").where("tenantId", "==", tenantId).limit(800).get(),
    adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).limit(600).get(),
  ]);

  const chats = chatsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const jobs = jobsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const tasks = tasksSnap.docs.map((doc) => doc.data() as Record<string, unknown>);

  const activeChats = chats.filter((chat) => {
    const status = String(chat.status || "open").toLowerCase();
    return status !== "resolved" && status !== "archived";
  });

  const slaBreached = activeChats.filter((chat) => {
    const dueAt = toDate(chat.slaDueAt);
    return Boolean(dueAt && dueAt.getTime() <= now);
  }).length;

  const waitingReplyBacklog = activeChats.filter((chat) => {
    const clientAt = toDate(chat.lastClientMessageAt);
    const agentAt = toDate(chat.lastAgentMessageAt);
    return Boolean(clientAt && (!agentAt || agentAt.getTime() < clientAt.getTime()));
  }).length;

  const overdueFollowUps = tasks.filter((task) => {
    const status = String(task.status || "pending").toLowerCase();
    if (status === "done") return false;
    const dueAt = toDate(task.dueAt);
    return Boolean(dueAt && dueAt.getTime() < now);
  }).length;

  const deadLetter = jobs.filter((job) => normalizeAiQueueStatus(job.status) === "dead_letter").length;
  const retrying = jobs.filter((job) => normalizeAiQueueStatus(job.status) === "retrying").length;
  const aiRiskLevel: TenantCriticalPushSnapshot["aiRiskLevel"] =
    deadLetter > 0 ? "high" : retrying > 0 ? "warning" : "stable";

  return {
    slaBreached,
    deadLetter,
    overdueFollowUps,
    waitingReplyBacklog,
    aiRiskLevel,
    capturedAt: new Date().toISOString(),
  };
}

export async function readTenantCriticalPushState(tenantId: string) {
  const snap = await adminDb.collection(STATE_COLLECTION).doc(tenantId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<TenantCriticalPushSnapshot>;
  return {
    slaBreached: Number(data.slaBreached || 0),
    deadLetter: Number(data.deadLetter || 0),
    overdueFollowUps: Number(data.overdueFollowUps || 0),
    waitingReplyBacklog: Number(data.waitingReplyBacklog || 0),
    aiRiskLevel:
      data.aiRiskLevel === "high" || data.aiRiskLevel === "warning"
        ? data.aiRiskLevel
        : "stable",
    capturedAt: String(data.capturedAt || ""),
  } satisfies TenantCriticalPushSnapshot;
}

export async function saveTenantCriticalPushState(
  tenantId: string,
  state: TenantCriticalPushSnapshot
) {
  await adminDb.collection(STATE_COLLECTION).doc(tenantId).set(
    {
      ...state,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listTenantsWithPushSubscriptions(limit = 200) {
  const snap = await adminDb
    .collection(SUBSCRIPTIONS_COLLECTION)
    .where("enabled", "==", true)
    .limit(Math.max(1, Math.min(2000, limit)))
    .get();

  return Array.from(
    new Set(
      snap.docs
        .map((doc) => String((doc.data() as Record<string, unknown>).tenantId || "").trim())
        .filter(Boolean)
    )
  );
}
