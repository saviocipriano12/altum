import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { AI_QUEUE_JOB_TYPE } from "@/lib/server/ai/queue";

type JobStatus = "pending" | "processing" | "retrying" | "done" | "dead_letter";

type JobItem = {
  id: string;
  tenantId: string;
  chatId: string;
  messageId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  updatedAt: unknown;
};

function normalizeStatus(value: unknown): JobStatus {
  const raw = String(value || "").toLowerCase();
  if (raw === "processing") return "processing";
  if (raw === "retrying") return "retrying";
  if (raw === "done") return "done";
  if (raw === "dead_letter") return "dead_letter";
  return "pending";
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { searchParams } = new URL(req.url);
    const tenantIdFilter = String(searchParams.get("tenantId") || "").trim();
    const limitRaw = Number(searchParams.get("limit") || 200);
    const limit = Number.isNaN(limitRaw) ? 200 : Math.min(500, Math.max(20, Math.round(limitRaw)));

    const snap = await adminDb
      .collection("jobs")
      .where("type", "==", AI_QUEUE_JOB_TYPE)
      .limit(limit)
      .get();

    const items: JobItem[] = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          tenantId: String(data.tenantId || ""),
          chatId: String(data.chatId || ""),
          messageId: String(data.messageId || ""),
          status: normalizeStatus(data.status),
          attempts: typeof data.attempts === "number" ? data.attempts : 0,
          maxAttempts: typeof data.maxAttempts === "number" ? data.maxAttempts : 0,
          lastError: String(data.lastError || ""),
          updatedAt: data.updatedAt || null,
        };
      })
      .filter((item) => (tenantIdFilter ? item.tenantId === tenantIdFilter : true))
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));

    const counts = {
      pending: items.filter((item) => item.status === "pending").length,
      processing: items.filter((item) => item.status === "processing").length,
      retrying: items.filter((item) => item.status === "retrying").length,
      done: items.filter((item) => item.status === "done").length,
      deadLetter: items.filter((item) => item.status === "dead_letter").length,
    };

    const deadLetters = items
      .filter((item) => item.status === "dead_letter")
      .slice(0, 30);

    const retryQueue = items
      .filter((item) => item.status === "retrying")
      .slice(0, 30);

    return NextResponse.json({
      ok: true,
      filter: {
        tenantId: tenantIdFilter || null,
        limit,
      },
      counts,
      total: items.length,
      deadLetters,
      retryQueue,
      recent: items.slice(0, 80),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao consultar resumo da fila de IA:", error);
    return NextResponse.json({ error: "Falha ao consultar fila de IA." }, { status: 500 });
  }
}
