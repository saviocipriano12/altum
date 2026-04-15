import { NextResponse } from "next/server";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";
import {
  listPortalPushSubscriptionsByTenantAndUser,
  removePortalPushSubscriptionsByTenantUser,
  removePortalPushSubscriptionForTenantUser,
  upsertPortalPushSubscription,
} from "@/app/lib/server/client-portal-push";
import {
  getWebPushPublicKey,
  isWebPushEnabled,
  normalizeBrowserPushSubscription,
} from "@/app/lib/server/web-push";

type Body = {
  subscription?: unknown;
  endpoint?: string;
};

export async function GET(req: Request) {
  try {
    const portalUser = await requirePortalRequestUser(req);
    const subscriptions = await listPortalPushSubscriptionsByTenantAndUser(
      portalUser.tenantId,
      portalUser.uid
    );
    const ownCount = subscriptions.length;

    return NextResponse.json({
      ok: true,
      enabled: isWebPushEnabled(),
      publicKey: getWebPushPublicKey(),
      tenantId: portalUser.tenantId,
      hasOwnSubscription: ownCount > 0,
      ownSubscriptionCount: ownCount,
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao consultar subscription push do portal:", error);
    return NextResponse.json(
      { error: "Falha ao consultar subscriptions de push." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!isWebPushEnabled()) {
      return NextResponse.json(
        { error: "Push nao configurado no servidor." },
        { status: 503 }
      );
    }

    const portalUser = await requirePortalRequestUser(req);
    const body = (await req.json()) as Body;
    const normalized = normalizeBrowserPushSubscription(body.subscription);
    if (!normalized) {
      return NextResponse.json(
        { error: "Subscription invalida." },
        { status: 400 }
      );
    }

    const result = await upsertPortalPushSubscription({
      tenantId: portalUser.tenantId,
      uid: portalUser.uid,
      subscription: normalized,
      userAgent: req.headers.get("user-agent") || "",
    });

    return NextResponse.json({
      ok: true,
      tenantId: portalUser.tenantId,
      subscriptionId: result.id,
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao salvar subscription push do portal:", error);
    return NextResponse.json(
      { error: "Falha ao salvar subscription de push." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const portalUser = await requirePortalRequestUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const endpoint = String(body.endpoint || "").trim();

    if (!endpoint) {
      const result = await removePortalPushSubscriptionsByTenantUser({
        tenantId: portalUser.tenantId,
        uid: portalUser.uid,
      });

      return NextResponse.json({
        ok: true,
        tenantId: portalUser.tenantId,
        removed: result.removed,
        scope: "user",
      });
    }

    const result = await removePortalPushSubscriptionForTenantUser({
      tenantId: portalUser.tenantId,
      uid: portalUser.uid,
      endpoint,
    });

    return NextResponse.json({
      ok: true,
      tenantId: portalUser.tenantId,
      removed: result.removed,
      scope: "endpoint",
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao remover subscription push do portal:", error);
    return NextResponse.json(
      { error: "Falha ao remover subscription de push." },
      { status: 500 }
    );
  }
}
