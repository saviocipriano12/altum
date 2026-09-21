import { persistOperatorReport } from "@/lib/server/growth/operator-storage";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { adportGoogleCredentials, fetchAdportGoogleOperatorReport, hasAdportGoogleCredentials } from "@/lib/server/growth/adport-connectors";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type ChannelRow = Record<string, unknown> & { id: string };

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function serializedDate(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | null;
  return timestamp?.toDate?.().toISOString?.() || null;
}

function channelView(channel: ChannelRow) {
  const metadata = channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata) ? channel.metadata as Record<string, unknown> : {};
  return {
    id: channel.id,
    name: clean(channel.name || channel.label || metadata.accountName) || "Google Ads",
    accountId: clean(channel.externalAccountId),
    status: clean(channel.status, 30) || "unknown",
    connectionStatus: clean(channel.connectionStatus, 30) || "unknown",
    ready: channel.status === "active" && Boolean(channel.externalAccountId && channel.refreshToken),
  };
}

function routeError(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  console.error("Falha no operador Google Ads:", error);
  return NextResponse.json({ error: "Nao foi possivel atualizar o Google Ads. Confira a conexao e tente novamente." }, { status: 500 });
}

async function googleChannels(tenantId: string) {
  const snap = await adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(30).get();
  return snap.docs.map((doc): ChannelRow => ({ id: doc.id, ...doc.data() })).filter((channel) => channel.type === "google_ads");
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "view_metrics");
    const channels = await googleChannels(tenantId);
    const reportsSnap = await adminDb.collection("google_ads_operator_reports").where("tenantId", "==", tenantId).limit(30).get();
    const reports = reportsSnap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, channelId: data.channelId, generatedAt: serializedDate(data.generatedAt), report: data.report || null };
    }).sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
    return NextResponse.json({ ok: true, channels: channels.map(channelView), reports });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_channels");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const channelId = clean(body.channelId, 120);
    const rangeDays = [7, 14, 30].includes(Number(body.rangeDays)) ? Number(body.rangeDays) : 30;
    if (!channelId) return NextResponse.json({ error: "Selecione uma conta Google Ads." }, { status: 400 });
    const channelSnap = await adminDb.collection("tenant_channels").doc(channelId).get();
    const channel = channelSnap.exists ? ({ id: channelSnap.id, ...channelSnap.data() } as ChannelRow) : null;
    if (!channel || channel.tenantId !== tenantId || channel.type !== "google_ads") return NextResponse.json({ error: "Conta Google Ads nao encontrada." }, { status: 404 });
    const refreshToken = clean(decryptSecret(channel.refreshToken), 4000);
    const accountId = clean(channel.externalAccountId).replace(/[^\d]/g, "");
    if (channel.status !== "active" || !accountId || !hasAdportGoogleCredentials({ refreshToken })) {
      return NextResponse.json({ error: "Conexao incompleta. Ative o canal e configure a credencial Google Ads antes da leitura ao vivo." }, { status: 409 });
    }
    const metadata = channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata) ? channel.metadata as Record<string, unknown> : {};
    const to = new Date(); const from = new Date(to.getTime() - (rangeDays - 1) * 86400_000);
    const report = await fetchAdportGoogleOperatorReport({
      platform: "google_ads", accountId, channelId,
      from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
      currency: clean(metadata.currency, 3) || "BRL",
      ...adportGoogleCredentials({ refreshToken, loginCustomerId: clean(metadata.loginCustomerId) || clean(channel.pageId) }),
    });
    const reportId = `${tenantId}_${channelId}`.replaceAll("/", "_");
    await persistOperatorReport(channelSnap, "google_ads_operator_reports", reportId, {
      tenantId, channelId, accountId, report,
      generatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid,
      source: "adport_google_ads_api",
    });
    return NextResponse.json({ ok: true, channel: channelView(channel), generatedAt: new Date().toISOString(), report });
  } catch (error) {
    return routeError(error);
  }
}
