import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  stage?: string;
  status?: string;
};

function clean(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const body = (await req.json()) as Body;
    const stage = clean(body.stage, 80);
    const status = clean(body.status, 80);

    if (!stage) {
      return NextResponse.json({ error: "Campo obrigatorio: stage." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const leadData = leadSnap.data() as { tenantId?: string; pipelineStage?: string };
    if ((leadData.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Lead fora do tenant informado." }, { status: 403 });
    }

    const previousStage = clean(leadData.pipelineStage, 80) || "captado";

    const patch: Record<string, unknown> = {
      pipelineStage: stage,
      stage,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (status) {
      patch.status = status;
    }

    await Promise.all([
      leadRef.set(patch, { merge: true }),
      leadRef.collection("events").add({
        type: "stage_change",
        title: "Stage atualizado",
        detail: `${previousStage} -> ${stage}`,
        previousStage,
        nextStage: stage,
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, leadId, previousStage, stage });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar stage do lead:", error);
    return NextResponse.json({ error: "Falha ao atualizar stage." }, { status: 500 });
  }
}
