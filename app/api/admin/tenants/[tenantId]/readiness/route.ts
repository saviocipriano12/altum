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

function isResourceExhausted(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const details = "details" in error ? String((error as { details?: unknown }).details || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "8" || details.includes("Quota exceeded") || message.includes("RESOURCE_EXHAUSTED");
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

    const snapshot = await getTenantReadinessSnapshot(normalizedTenantId).catch((error) => {
      if (isResourceExhausted(error)) {
        throw new RouteAuthError(
          429,
          "firebase_quota_exceeded",
          "A cota do Firebase/Firestore foi excedida. Aguarde a liberacao da cota ou ative billing no Firebase."
        );
      }
      throw error;
    });
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
