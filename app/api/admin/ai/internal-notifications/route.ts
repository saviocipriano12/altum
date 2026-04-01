import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { searchParams } = new URL(req.url);
    const tenantId = cleanText(searchParams.get("tenantId"), 140);
    const limitRaw = Number(searchParams.get("limit") || 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(10, Math.round(limitRaw))) : 30;

    const base = adminDb.collection("ai_internal_notifications").orderBy("createdAt", "desc").limit(limit * 2);
    const snap = await base.get();

    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          tenantId: cleanText(data.tenantId, 140),
          chatId: cleanText(data.chatId, 160),
          leadId: cleanText(data.leadId, 160),
          type: cleanText(data.type, 80),
          severity: cleanText(data.severity, 20),
          title: cleanText(data.title, 180),
          detail: cleanText(data.detail, 280),
          status: cleanText(data.status, 40) || "open",
          createdAt: data.createdAt || null,
        };
      })
      .filter((item) => item.tenantId)
      .filter((item) => (tenantId ? item.tenantId === tenantId : true))
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao consultar notificacoes internas da IA:", error);
    return NextResponse.json({ error: "Falha ao consultar notificacoes internas da IA." }, { status: 500 });
  }
}
