import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function serializable(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (Array.isArray(value)) return value.map(serializable);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializable(item)])
  );
}

export async function GET(req: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_agent"] });
    const { leadId } = await context.params;
    const cleanLeadId = String(leadId || "").trim();
    if (!cleanLeadId) return NextResponse.json({ error: "Lead invalido." }, { status: 400 });

    const leadRef = adminDb.collection("leads").doc(cleanLeadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });

    const leadData = leadSnap.data() as { ownerId?: string | null };
    if (!isAdmin(actor) && leadData.ownerId !== actor.uid) {
      return NextResponse.json({ error: "Sem permissao para acessar este lead." }, { status: 403 });
    }

    const eventsSnap = await leadRef.collection("events").orderBy("createdAt", "desc").limit(20).get();
    return NextResponse.json({
      ok: true,
      lead: { id: leadSnap.id, ...(serializable(leadSnap.data()) as Record<string, unknown>) },
      events: eventsSnap.docs.map((event) => ({
        id: event.id,
        ...(serializable(event.data()) as Record<string, unknown>),
      })),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao carregar detalhe do lead:", error);
    return NextResponse.json({ error: "Falha ao carregar detalhe do lead." }, { status: 500 });
  }
}
