import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isGoogleAdsServerConfigured } from "@/app/lib/server/google-ads";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type ConversionHealthItem = {
  channelId: string;
  type: "meta_ads" | "google_ads";
  displayName: string;
  ready: boolean;
  status: string;
  issues: string[];
  configuredEvents: string[];
  recent: {
    processed: number;
    failed: number;
    claimed: number;
    skipped: number;
    total: number;
    lastStatus?: string;
    lastError?: string;
    lastEventAt?: string | null;
  };
};

function clean(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function metadataOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
  return value as Record<string, unknown>;
}

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
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function countDispatches(
  docs: Array<{ channelId: string; status: string; error?: string; updatedAt?: unknown; processedAt?: unknown }>,
  channelId: string
) {
  const related = docs.filter((doc) => doc.channelId === channelId);
  const recent = related
    .slice()
    .sort((a, b) => {
      const aTime = new Date(toIso(a.processedAt || a.updatedAt) || 0).getTime();
      const bTime = new Date(toIso(b.processedAt || b.updatedAt) || 0).getTime();
      return bTime - aTime;
    });
  const last = recent[0];
  return {
    processed: related.filter((doc) => doc.status === "processed").length,
    failed: related.filter((doc) => doc.status === "failed").length,
    claimed: related.filter((doc) => doc.status === "claimed").length,
    skipped: related.filter((doc) => doc.status === "skipped").length,
    total: related.length,
    lastStatus: last?.status,
    lastError: last?.error,
    lastEventAt: toIso(last?.processedAt || last?.updatedAt),
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    if (
      !hasTenantCapability(membership, "manage_channels") &&
      !hasTenantCapability(membership, "view_metrics")
    ) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para ver diagnostico de conversoes.");
    }

    const [channelsSnap, dispatchSnap] = await Promise.all([
      adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(60).get(),
      adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).limit(120).get(),
    ]);

    const dispatches = dispatchSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        channelId: clean(data.channelId, 180),
        status: clean(data.status, 60),
        error: clean(data.error, 500),
        updatedAt: data.updatedAt,
        processedAt: data.processedAt,
      };
    });

    const items: ConversionHealthItem[] = [];

    channelsSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const type = clean(data.type, 40) as ConversionHealthItem["type"];
      if (type !== "meta_ads" && type !== "google_ads") return;

      const metadata = metadataOf(data.metadata);
      const status = clean(data.status, 40) || "draft";
      const issues: string[] = [];
      const configuredEvents: string[] = [];

      if (status !== "active") {
        issues.push("Conector nao esta ativo.");
      }

      if (type === "meta_ads") {
        const pixelId = clean(metadata.pixelId || metadata.metaPixelId || data.pixelId, 120);
        const accessToken = clean(decryptSecret(data.accessToken), 5000);
        if (!pixelId) issues.push("Meta Pixel ID nao configurado.");
        if (!accessToken) issues.push("Token da Meta ausente ou invalido.");
        if (pixelId) configuredEvents.push("Lead", "QualifiedLead", "Schedule", "ScheduleCompleted", "Purchase");
      }

      if (type === "google_ads") {
        const customerId = clean(data.externalAccountId, 120).replace(/[^\d]/g, "");
        const accessToken = clean(decryptSecret(data.accessToken), 5000);
        const refreshToken = clean(decryptSecret(data.refreshToken), 5000);
        const actionMap = [
          ["leadConversionActionId", "lead_created"],
          ["qualifiedConversionActionId", "lead_qualified"],
          ["meetingConversionActionId", "meeting_scheduled"],
          ["meetingCompletedConversionActionId", "meeting_completed"],
          ["saleConversionActionId", "sale_won"],
        ] as const;
        for (const [key, label] of actionMap) {
          if (clean(metadata[key], 180)) configuredEvents.push(label);
        }
        if (!isGoogleAdsServerConfigured()) issues.push("Servidor sem credenciais globais do Google Ads.");
        if (!customerId) issues.push("Customer ID do Google Ads nao configurado.");
        if (!accessToken && !refreshToken) issues.push("Token OAuth do Google ausente.");
        if (configuredEvents.length === 0) issues.push("Nenhuma Conversion Action configurada.");
      }

      items.push({
        channelId: doc.id,
        type,
        displayName: clean(data.displayName, 120) || (type === "meta_ads" ? "Meta Ads" : "Google Ads"),
        ready: issues.length === 0,
        status,
        issues,
        configuredEvents,
        recent: countDispatches(dispatches, doc.id),
      });
    });

    const issues = items.flatMap((item) => item.issues.map((issue) => `${item.displayName}: ${issue}`));
    if (items.length === 0) {
      issues.push("Nenhum conector Meta Ads ou Google Ads configurado para conversoes.");
    }

    return NextResponse.json({
      tenantId,
      checkedAt: new Date().toISOString(),
      ok: issues.length === 0,
      summary: {
        total: items.length,
        ready: items.filter((item) => item.ready).length,
        failedRecent: items.reduce((sum, item) => sum + item.recent.failed, 0),
        processedRecent: items.reduce((sum, item) => sum + item.recent.processed, 0),
      },
      issues,
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao diagnosticar conversoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao diagnosticar conversoes." }, { status: 500 });
  }
}
