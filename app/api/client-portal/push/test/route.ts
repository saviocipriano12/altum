import { NextResponse } from "next/server";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";
import {
  consumePortalPushTestQuota,
  sendCriticalPushToTenantUser,
} from "@/app/lib/server/client-portal-push";
import { isWebPushEnabled } from "@/app/lib/server/web-push";

export async function POST(req: Request) {
  try {
    if (!isWebPushEnabled()) {
      return NextResponse.json(
        { error: "Push nao configurado no servidor." },
        { status: 503 }
      );
    }

    const portalUser = await requirePortalRequestUser(req);
    const quota = await consumePortalPushTestQuota({
      tenantId: portalUser.tenantId,
      uid: portalUser.uid,
      cooldownMs: 60_000,
    });

    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Aguarde ${quota.retryAfterSeconds}s para testar push novamente.`,
          retryAfterSeconds: quota.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(quota.retryAfterSeconds),
          },
        }
      );
    }

    const result = await sendCriticalPushToTenantUser({
      tenantId: portalUser.tenantId,
      uid: portalUser.uid,
      title: "Teste de alerta ALTUM",
      body: "Push configurado com sucesso no portal do cliente.",
      tag: "push_test",
      url: "/cliente/painel",
      ttl: 60,
    });

    return NextResponse.json({
      ok: true,
      tenantId: portalUser.tenantId,
      result,
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao enviar push de teste do portal:", error);
    return NextResponse.json(
      { error: "Falha ao enviar push de teste." },
      { status: 500 }
    );
  }
}
