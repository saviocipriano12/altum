import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";
import { buildOutboundCampaignPatch } from "@/lib/server/outbound-campaigns";

type Body = {
  name?: unknown;
  status?: unknown;
  channelId?: unknown;
  deliveryMode?: unknown;
  messageTemplate?: unknown;
  templateName?: unknown;
  languageCode?: unknown;
  bodyParams?: unknown;
  headerMedia?: unknown;
  aiFollowup?: unknown;
  automationFlow?: unknown;
  maxRecipients?: unknown;
  scheduledAt?: unknown;
  sendRatePerMinute?: unknown;
  filters?: unknown;
};

async function getCampaign(tenantId: string, campaignId: string) {
  const ref = adminDb.collection("outbound_campaigns").doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new RouteAuthError(404, "campaign_not_found", "Campanha outbound nao encontrada.");
  }
  const data = snap.data() as Record<string, unknown>;
  if (String(data.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Campanha fora do tenant informado.");
  }
  return { ref, data };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; campaignId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, campaignId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_automations");

    const { ref, data } = await getCampaign(tenantId, campaignId);
    const body = (await req.json()) as Body;
    const requestedStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    await ref.set(
      buildOutboundCampaignPatch({
        tenantId,
        ...data,
        ...body,
        actor: { id: user.uid, name: user.name },
      }),
      { merge: true }
    );
    if (requestedStatus === "paused" || requestedStatus === "active") {
      await ref.set(
        { executionStatus: requestedStatus === "paused" ? "paused" : String(data.executionStatus || "idle") === "paused" ? "queued" : data.executionStatus || "idle" },
        { merge: true }
      );
      const jobsSnap = await adminDb
        .collection("outbound_campaign_jobs")
        .where("campaignId", "==", campaignId)
        .limit(1000)
        .get();
      const writer = adminDb.bulkWriter();
      jobsSnap.docs
        .filter((doc) => String(doc.data().tenantId || "") === tenantId)
        .filter((doc) =>
          requestedStatus === "paused"
            ? String(doc.data().status || "") === "ready"
            : String(doc.data().status || "") === "paused"
        )
        .forEach((doc) =>
          writer.update(doc.ref, {
            status: requestedStatus === "paused" ? "paused" : "ready",
          })
        );
      await writer.close();
    }

    return NextResponse.json({ ok: true, tenantId, campaignId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar campanha outbound:", error);
    return NextResponse.json({ error: "Falha ao atualizar campanha outbound." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; campaignId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, campaignId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_automations");

    const { ref, data } = await getCampaign(tenantId, campaignId);
    const [jobsSnap, runSnap] = await Promise.all([
      adminDb.collection("outbound_campaign_jobs").where("campaignId", "==", campaignId).limit(1000).get(),
      data.activeRunId
        ? adminDb.collection("outbound_campaign_runs").doc(String(data.activeRunId)).get()
        : Promise.resolve(null),
    ]);
    const writer = adminDb.bulkWriter();
    jobsSnap.docs
      .filter((doc) => String(doc.data().tenantId || "") === tenantId)
      .filter((doc) => ["staging", "ready", "paused", "processing"].includes(String(doc.data().status || "")))
      .forEach((doc) => writer.update(doc.ref, { status: "cancelled" }));
    if (runSnap?.exists && String(runSnap.data()?.tenantId || "") === tenantId) {
      writer.update(runSnap.ref, { status: "cancelled" });
    }
    await writer.close();
    await ref.delete();

    return NextResponse.json({ ok: true, tenantId, campaignId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao remover campanha outbound:", error);
    return NextResponse.json({ error: "Falha ao remover campanha outbound." }, { status: 500 });
  }
}
