import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  assertTenantRole,
  TenantAccessError,
} from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  buildOutboundCampaignPatch,
  normalizeOutboundCampaign,
  processOutboundCampaignJobs,
} from "@/lib/server/outbound-campaigns";

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

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  return null;
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantRole(membership, "client_viewer");

    await processOutboundCampaignJobs({ tenantId, limit: 100 }).catch((error) => {
      console.warn("Falha ao processar fila outbound durante listagem:", error);
    });

    const [campaignsSnap, runsSnap, deliveriesSnap] = await Promise.all([
      adminDb.collection("outbound_campaigns").where("tenantId", "==", tenantId).limit(120).get(),
      adminDb.collection("outbound_campaign_runs").where("tenantId", "==", tenantId).limit(120).get(),
      adminDb.collection("outbound_campaign_deliveries").where("tenantId", "==", tenantId).limit(1200).get(),
    ]);

    const deliveryMetrics = deliveriesSnap.docs.reduce<Record<string, {
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      responded: number;
      converted: number;
    }>>((acc, doc) => {
      const data = doc.data() as Record<string, unknown>;
      const campaignId = String(data.campaignId || "").trim();
      if (!campaignId) return acc;
      const current = acc[campaignId] || { sent: 0, delivered: 0, read: 0, failed: 0, responded: 0, converted: 0 };
      const status = String(data.deliveryStatus || data.status || "").toLowerCase();
      if (status === "failed") current.failed += 1;
      else {
        current.sent += 1;
        if (status === "delivered" || status === "read") current.delivered += 1;
        if (status === "read") current.read += 1;
      }
      if (data.respondedAt) current.responded += 1;
      if (data.convertedAt || data.conversionEventId) current.converted += 1;
      acc[campaignId] = current;
      return acc;
    }, {});

    const items = campaignsSnap.docs
      .map((doc) => ({
        ...normalizeOutboundCampaign({ id: doc.id, data: doc.data() as Record<string, unknown> }),
        deliveryMetrics: deliveryMetrics[doc.id] || { sent: 0, delivered: 0, read: 0, failed: 0, responded: 0, converted: 0 },
      }))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const runs = runsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const summary = data.summary && typeof data.summary === "object" ? (data.summary as Record<string, unknown>) : {};
        return {
          id: doc.id,
          campaignId: String(data.campaignId || ""),
          campaignName: String(data.campaignName || "Campanha outbound"),
          channel: "whatsapp",
          summary: {
            sent: Number(summary.sent || 0),
            skipped: Number(summary.skipped || 0),
            failed: Number(summary.failed || 0),
            totalMatched: Number(summary.totalMatched || 0),
          },
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 20);

    return NextResponse.json({ ok: true, tenantId, items, runs });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar campanhas outbound:", error);
    return NextResponse.json({ error: "Falha ao listar campanhas outbound." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_automations");

    const body = (await req.json()) as Body;
    const patch = buildOutboundCampaignPatch({
      tenantId,
      ...body,
      actor: { id: user.uid, name: user.name },
    });

    const ref = adminDb.collection("outbound_campaigns").doc();
    await ref.set({
      ...patch,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.name,
      lastRunAt: null,
      lastRunSummary: null,
    });

    return NextResponse.json({ ok: true, tenantId, campaignId: ref.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar campanha outbound:", error);
    return NextResponse.json({ error: "Falha ao criar campanha outbound." }, { status: 500 });
  }
}
