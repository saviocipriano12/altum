import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantReadinessSnapshot } from "@/lib/server/tenant-readiness";

type Params = {
  params: Promise<{
    tenantId: string;
  }>;
};

function clean(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(req: Request, context: Params) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { tenantId } = await context.params;
    const normalizedTenantId = clean(tenantId, 160);
    if (!normalizedTenantId) {
      return NextResponse.json({ error: "Tenant invalido." }, { status: 400 });
    }

    const snapshot = await getTenantReadinessSnapshot(normalizedTenantId);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao carregar prontidao do tenant no admin:", error);
    return NextResponse.json(
      { error: "Falha ao carregar prontidao do tenant." },
      { status: 500 }
    );
  }
}
