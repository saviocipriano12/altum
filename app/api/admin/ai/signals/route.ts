import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type AiDecision = "respond" | "ask_more" | "handoff" | "skip";

type AiSignalItem = {
  id: string;
  tenantId: string;
  tenantName: string;
  legacyClientId: string;
  businessProfileId: string;
  chatId: string;
  leadId: string;
  decision: AiDecision;
  nextAction: string;
  provider: string;
  model: string;
  confidence: number | null;
  createdAt: unknown;
};

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanDecision(value: unknown): AiDecision {
  const raw = cleanText(value, 24).toLowerCase();
  if (raw === "respond") return "respond";
  if (raw === "ask_more") return "ask_more";
  if (raw === "handoff") return "handoff";
  return "skip";
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

function isProposalSignal(action: string) {
  return action === "preparar_proposta_comercial" || action.startsWith("sugerir_oferta_");
}

function isScheduleSignal(action: string) {
  return action === "agendar_proximo_passo";
}

function isQualificationSignal(action: string) {
  return [
    "coletar_campos_obrigatorios",
    "qualificar_contexto_minimo",
    "aprofundar_oportunidade",
    "conduzir_para_proximo_passo",
  ].includes(action);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { searchParams } = new URL(req.url);
    const tenantIdFilter = cleanText(searchParams.get("tenantId"), 140);
    const limitRaw = Number(searchParams.get("limit") || 300);
    const limit = Number.isFinite(limitRaw) ? Math.min(600, Math.max(40, Math.round(limitRaw))) : 300;

    const snap = await adminDb.collection("ai_logs").orderBy("createdAt", "desc").limit(limit).get();

    const rawItems = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        tenantId: cleanText(data.tenantId, 140),
        chatId: cleanText(data.chatId, 160),
        leadId: cleanText(data.leadId, 160),
        decision: cleanDecision(data.decision),
        nextAction: cleanText(data.nextAction, 160).toLowerCase(),
        provider: cleanText(data.provider, 80),
        model: cleanText(data.model, 80),
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        createdAt: data.createdAt || null,
      };
    });

    const items = rawItems
      .filter((item) => item.tenantId)
      .filter((item) => (tenantIdFilter ? item.tenantId === tenantIdFilter : true))
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

    const tenantIds = Array.from(new Set(items.map((item) => item.tenantId)));
    const tenantSettings = await Promise.all(
      tenantIds.map(async (tenantId) => {
        const [settingsSnap, tenantSnap] = await Promise.all([
          adminDb.collection("tenant_settings").doc(tenantId).get(),
          adminDb.collection("tenants").doc(tenantId).get(),
        ]);
        const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
        const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
        return {
          tenantId,
          tenantName: cleanText(settingsData.name, 140) || cleanText(tenantData.name, 140) || tenantId,
          legacyClientId: cleanText(tenantData.legacyClientId, 140),
          businessProfileId: cleanText(settingsData.businessProfileId, 80) || cleanText(tenantData.businessProfileId, 80),
        };
      })
    );

    const tenantInfoMap = new Map(tenantSettings.map((item) => [item.tenantId, item]));
    const normalizedItems: AiSignalItem[] = items.map((item) => ({
      ...item,
      tenantName: tenantInfoMap.get(item.tenantId)?.tenantName || item.tenantId,
      legacyClientId: tenantInfoMap.get(item.tenantId)?.legacyClientId || "",
      businessProfileId: tenantInfoMap.get(item.tenantId)?.businessProfileId || "generic",
    }));

    const tenantMap = normalizedItems.reduce((acc, item) => {
        const current = acc.get(item.tenantId) || {
          tenantId: item.tenantId,
          tenantName: item.tenantName,
          legacyClientId: item.legacyClientId,
          businessProfileId: item.businessProfileId,
          totalSignals: 0,
          handoffs: 0,
          proposalSignals: 0,
          scheduleSignals: 0,
          qualificationSignals: 0,
          lastSignalAt: item.createdAt,
        };

        current.totalSignals += 1;
        if (item.decision === "handoff" || item.nextAction === "assumir_handoff_humano") current.handoffs += 1;
        if (isProposalSignal(item.nextAction)) current.proposalSignals += 1;
        if (isScheduleSignal(item.nextAction)) current.scheduleSignals += 1;
        if (isQualificationSignal(item.nextAction)) current.qualificationSignals += 1;
        if (toTime(item.createdAt) > toTime(current.lastSignalAt)) current.lastSignalAt = item.createdAt;

        acc.set(item.tenantId, current);
        return acc;
      }, new Map<string, {
        tenantId: string;
        tenantName: string;
        legacyClientId: string;
        businessProfileId: string;
        totalSignals: number;
        handoffs: number;
        proposalSignals: number;
        scheduleSignals: number;
        qualificationSignals: number;
        lastSignalAt: unknown;
      }>());

    const tenants = Array.from(tenantMap.values()).sort((a, b) => {
      const totalDiff = b.totalSignals - a.totalSignals;
      if (totalDiff !== 0) return totalDiff;
      return toTime(b.lastSignalAt) - toTime(a.lastSignalAt);
    });

    const topActions = Array.from(
      normalizedItems.reduce((acc, item) => {
        const key = item.nextAction || "sem_acao";
        acc.set(key, (acc.get(key) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const summary = {
      totalSignals: normalizedItems.length,
      handoffs: normalizedItems.filter(
        (item) => item.decision === "handoff" || item.nextAction === "assumir_handoff_humano"
      ).length,
      proposalSignals: normalizedItems.filter((item) => isProposalSignal(item.nextAction)).length,
      scheduleSignals: normalizedItems.filter((item) => isScheduleSignal(item.nextAction)).length,
      qualificationSignals: normalizedItems.filter((item) => isQualificationSignal(item.nextAction)).length,
      activeTenants: tenants.length,
    };

    return NextResponse.json({
      ok: true,
      filter: {
        tenantId: tenantIdFilter || null,
        limit,
      },
      summary,
      tenants: tenants.slice(0, 12),
      topActions,
      recent: normalizedItems.slice(0, 40),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao consultar sinais da IA no admin:", error);
    return NextResponse.json({ error: "Falha ao consultar sinais da IA." }, { status: 500 });
  }
}
