import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { AI_QUEUE_JOB_TYPE } from "@/lib/server/ai/queue";
import { assertTenantAccess, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";

type JobStatus = "pending" | "processing" | "retrying" | "done" | "dead_letter";

function normalizeStatus(value: unknown): JobStatus {
  const raw = String(value || "").toLowerCase();
  if (raw === "processing") return "processing";
  if (raw === "retrying") return "retrying";
  if (raw === "done") return "done";
  if (raw === "dead_letter") return "dead_letter";
  return "pending";
}

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
  if (typeof value === "number") return new Date(value);
  return null;
}

function toTime(value: unknown) {
  return toDate(value)?.getTime() || 0;
}

function toCounter(value: unknown, key: string) {
  if (!value || typeof value !== "object") return 0;
  const counter = (value as Record<string, unknown>)[key];
  return typeof counter === "number" ? counter : 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const [settings, kbSnap, chatStateSnap, chatsSnap, jobsSnap, automationsSnap, metricsSnap] =
      await Promise.all([
        getTenantSettings(tenantId),
        adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(200).get(),
        adminDb.collection("chat_state").where("tenantId", "==", tenantId).limit(300).get(),
        adminDb.collection("chats").where("tenantId", "==", tenantId).limit(250).get(),
        adminDb.collection("jobs").where("tenantId", "==", tenantId).limit(300).get(),
        adminDb.collection("automations").where("tenantId", "==", tenantId).limit(100).get(),
        adminDb.collection("metrics").where("tenantId", "==", tenantId).limit(90).get(),
      ]);

    const ai =
      settings && typeof settings.ai === "object" && settings.ai
        ? (settings.ai as Record<string, unknown>)
        : {};

    const aiEnabled = ai.enabled !== false;
    const guardrails =
      Array.isArray(ai.guardrails) ? ai.guardrails.filter((item) => typeof item === "string").length : 0;

    const pausedChats = chatStateSnap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const aiEnabledForChat = data.aiEnabled !== false;
      const pausedUntil = toDate(data.pausedUntil);
      const humanOwnerUserId = String(data.humanOwnerUserId || "").trim();

      return !aiEnabledForChat || Boolean(humanOwnerUserId) || Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
    }).length;

    const queueJobs = jobsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .filter((item) => String(item.type || "") === AI_QUEUE_JOB_TYPE);

    const queueCounts = {
      pending: queueJobs.filter((item) => normalizeStatus(item.status) === "pending").length,
      processing: queueJobs.filter((item) => normalizeStatus(item.status) === "processing").length,
      retrying: queueJobs.filter((item) => normalizeStatus(item.status) === "retrying").length,
      done: queueJobs.filter((item) => normalizeStatus(item.status) === "done").length,
      deadLetter: queueJobs.filter((item) => normalizeStatus(item.status) === "dead_letter").length,
    };

    const recentQueue = queueJobs
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt))
      .slice(0, 12)
      .map((item) => ({
        id: item.id as string,
        chatId: String(item.chatId || ""),
        status: normalizeStatus(item.status),
        attempts: typeof item.attempts === "number" ? item.attempts : 0,
        updatedAt: item.updatedAt || null,
        lastError: String(item.lastError || ""),
      }));

    const queueMetrics = metricsSnap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((item) => String(item.type || "") === "ai_queue_daily");

    const processedTotal = queueMetrics.reduce(
      (sum, item) => sum + toCounter(item.counters, "processed"),
      0
    );

    const activeAutomations = automationsSnap.empty
      ? aiEnabled
        ? 1
        : 0
      : automationsSnap.docs.filter((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return data.enabled !== false && String(data.status || "active") !== "paused";
        }).length;

    return NextResponse.json({
      ok: true,
      tenantId,
      summary: {
        activeAutomations,
        monitoredConversations: chatsSnap.size,
        pausedConversations: pausedChats,
        kbDocs: kbSnap.size,
        guardrails,
        queue: queueCounts,
        processedTotal,
        aiEnabled,
      },
      recentQueue,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao carregar resumo de automacoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar automacoes." }, { status: 500 });
  }
}
