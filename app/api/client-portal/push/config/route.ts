import { NextResponse } from "next/server";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";
import { getWebPushPublicKey, isWebPushEnabled } from "@/app/lib/server/web-push";

export async function GET(req: Request) {
  try {
    const portalUser = await requirePortalRequestUser(req);
    return NextResponse.json({
      ok: true,
      tenantId: portalUser.tenantId,
      enabled: isWebPushEnabled(),
      publicKey: getWebPushPublicKey(),
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao ler config de push do portal:", error);
    return NextResponse.json(
      { error: "Falha ao carregar configuracao de push." },
      { status: 500 }
    );
  }
}

