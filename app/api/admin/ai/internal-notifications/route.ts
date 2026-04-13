import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildAiAlertGuidance, sanitizeText, toTenantOperationalSnapshot, toTime } from "@/lib/server/ai/observability";

function severityWeight(value: string) {
  if (value === "high") return 2;
  if (value === "warning") return 1;
  return 0;
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { searchParams } = new URL(req.url);
    const tenantId = sanitizeText(searchParams.get("tenantId"), 140);
    const statusFilter = sanitizeText(searchParams.get("status"), 40);
    const limitRaw = Number(searchParams.get("limit") || 40);
    const limit = Number.isFinite(limitRaw) ? Math.min(120, Math.max(10, Math.round(limitRaw))) : 40;

    const snap = await adminDb
      .collection("ai_internal_notifications")
      .orderBy("updatedAt", "desc")
      .limit(limit * 3)
      .get();

    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const guidance = buildAiAlertGuidance({
          type: sanitizeText(data.type, 80),
          errorCode: sanitizeText(data.errorCode, 80),
          reasonCode: sanitizeText(data.reasonCode, 80),
          title: sanitizeText(data.title, 180),
          detail: sanitizeText(data.detail, 320),
        });
        return {
          id: doc.id,
          tenantId: sanitizeText(data.tenantId, 140),
          chatId: sanitizeText(data.chatId, 160),
          leadId: sanitizeText(data.leadId, 160),
          type: sanitizeText(data.type, 80),
          severity: sanitizeText(data.severity, 20) || "info",
          title: sanitizeText(data.title, 180),
          detail: sanitizeText(data.detail, 320),
          status: sanitizeText(data.status, 40) || "open",
          source: sanitizeText(data.source, 80),
          category: sanitizeText(data.category, 40),
          scope: sanitizeText(data.scope, 80),
          errorCode: sanitizeText(data.errorCode, 80),
          reasonCode: sanitizeText(data.reasonCode, 80),
          occurrences: typeof data.occurrences === "number" ? data.occurrences : 1,
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
          firstOccurredAt: data.firstOccurredAt || data.createdAt || null,
          lastOccurredAt: data.lastOccurredAt || data.updatedAt || data.createdAt || null,
          resolvedAt: data.resolvedAt || null,
          alertType: guidance.type,
          probableCause: guidance.probableCause,
          recommendedAction: guidance.recommendedAction,
          href: guidance.href,
        };
      })
      .filter((item) => item.tenantId)
      .filter((item) => (tenantId ? item.tenantId === tenantId : true))
      .filter((item) => (statusFilter ? item.status === statusFilter : true))
      .slice(0, limit);

    const riskCards = items
      .filter((item) => item.status !== "resolved")
      .sort((a, b) => {
        if (severityWeight(a.severity) !== severityWeight(b.severity)) {
          return severityWeight(b.severity) - severityWeight(a.severity);
        }
        return toTime(b.lastOccurredAt) - toTime(a.lastOccurredAt);
      })
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        type: item.type,
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        lastOccurredAt: item.lastOccurredAt,
        occurrences: item.occurrences,
        errorCode: item.errorCode,
        reasonCode: item.reasonCode,
        alertType: item.alertType,
        probableCause: item.probableCause,
        recommendedAction: item.recommendedAction,
        href: item.href,
      }));

    const summaryByType = items
      .filter((item) => item.status !== "resolved")
      .reduce<Record<string, number>>((acc, item) => {
        const key = item.alertType || "unknown";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    const tenantStatusMap = items
      .filter((item) => item.status !== "resolved")
      .reduce<Map<string, { high: boolean; warning: boolean; count: number }>>((acc, item) => {
        const current = acc.get(item.tenantId) || { high: false, warning: false, count: 0 };
        if (item.severity === "high") current.high = true;
        if (item.severity === "warning") current.warning = true;
        current.count += 1;
        acc.set(item.tenantId, current);
        return acc;
      }, new Map());
    const tenantOperational = Array.from(tenantStatusMap.entries()).map(([tenantId, signals]) => {
      const operational = toTenantOperationalSnapshot({
        hasHighSeverityAlert: signals.high,
        hasWarningAlert: signals.warning,
      });
      return {
        tenantId,
        status: operational.status,
        reason: operational.reason,
        openAlerts: signals.count,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      riskCards,
      summary: {
        total: items.length,
        open: items.filter((item) => item.status !== "resolved").length,
        byType: summaryByType,
      },
      tenantOperational,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao consultar notificacoes internas da IA:", error);
    return NextResponse.json({ error: "Falha ao consultar notificacoes internas da IA." }, { status: 500 });
  }
}
