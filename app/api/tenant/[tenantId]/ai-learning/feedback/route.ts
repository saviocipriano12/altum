import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess } from "@/lib/server/commercial-access";
import { recordAiLearningSignal, refreshTenantLearningRecommendations } from "@/lib/server/ai/learning-signals";
import type { AiLearningDirection, AiLearningSignalType, AiLearningTargetKind } from "@/lib/server/ai/learning-policy";

const ALLOWED_TYPES = new Set<AiLearningSignalType>(["explicit_feedback", "human_edit", "customer_reply", "silence", "handoff"]);
const ALLOWED_DIRECTIONS = new Set<AiLearningDirection>(["positive", "negative", "neutral"]);
const ALLOWED_TARGETS = new Set<AiLearningTargetKind>(["offer", "next_action", "closing_motion", "objection", "channel", "role", "action_family"]);

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "edit_leads");
    const body = await req.json() as {
      eventId?: string;
      leadId?: string;
      type?: AiLearningSignalType;
      direction?: AiLearningDirection;
      targetKind?: AiLearningTargetKind;
      targetId?: string;
      note?: string;
      referenceType?: string;
      referenceId?: string;
    };
    const eventId = clean(body.eventId, 180);
    const leadId = clean(body.leadId, 180);
    const type = clean(body.type, 60) as AiLearningSignalType;
    const direction = clean(body.direction, 20) as AiLearningDirection;
    const targetKind = clean(body.targetKind, 60) as AiLearningTargetKind;
    const targetId = clean(body.targetId, 160);
    if (!eventId || !leadId || !ALLOWED_TYPES.has(type) || !ALLOWED_DIRECTIONS.has(direction) || !ALLOWED_TARGETS.has(targetKind) || !targetId) {
      return NextResponse.json({ error: "Feedback incompleto ou invalido." }, { status: 400 });
    }
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    const source = type === "explicit_feedback" || type === "human_edit"
      ? "human_operator"
      : type === "customer_reply"
        ? "customer"
        : "system";
    const result = await recordAiLearningSignal({
      tenantId,
      dedupeKey: `feedback:${eventId}`,
      relationshipId: leadId,
      type,
      source,
      direction,
      targetKind,
      targetId,
      rawCandidate: body.note,
      referenceType: clean(body.referenceType, 60) || "operator_feedback",
      referenceId: clean(body.referenceId, 180) || eventId,
    });
    if (result.status === "accepted") await refreshTenantLearningRecommendations(tenantId);
    const rejectedReason = "classification" in result ? result.classification.rejectedReason : result.reason;
    return NextResponse.json({ ok: true, tenantId, status: result.status, rejectedReason: rejectedReason || null });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao registrar feedback de aprendizado:", error);
    return NextResponse.json({ error: "Falha ao registrar feedback da IA." }, { status: 500 });
  }
}
