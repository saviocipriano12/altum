import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function clean(value: unknown, max = 140) {
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

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const { searchParams } = new URL(req.url);
    const clientId = clean(searchParams.get("clientId"), 120);
    if (!clientId) {
      return NextResponse.json({ error: "Parametro obrigatorio: clientId." }, { status: 400 });
    }

    const contractSnap = await adminDb.collection("client_contracts").doc(clientId).get().catch((error) => {
      if (isResourceExhausted(error)) {
        throw new RouteAuthError(
          429,
          "firebase_quota_exceeded",
          "A cota do Firebase/Firestore foi excedida. Aguarde a liberacao da cota ou ative billing no Firebase."
        );
      }
      throw error;
    });
    if (!contractSnap.exists) {
      return NextResponse.json({ ok: true, contract: null });
    }

    return NextResponse.json({
      ok: true,
      contract: {
        id: contractSnap.id,
        ...(contractSnap.data() as Record<string, unknown>),
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao buscar contrato do portal:", error);
    return NextResponse.json({ error: "Falha ao buscar contrato do portal." }, { status: 500 });
  }
}
