import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { generateLiveMeetingCoach } from "@/lib/server/ai/meeting-assistant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = {
  leadId?: string | null;
  transcript?: string;
  notes?: string;
  objective?: string;
  language?: string;
  translateTo?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

async function resolveLead(tenantId: string, leadId: string) {
  if (!leadId) return null;
  const snap = await adminDb.collection("leads").doc(leadId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId, 160) !== tenantId) return null;
  return data;
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertTenantRole(membership, "client_viewer");

    const body = (await req.json().catch(() => ({}))) as Body;
    const transcript = clean(body.transcript, 10000);
    const notes = clean(body.notes, 2500);
    if (!transcript && !notes) {
      return NextResponse.json({ error: "Informe transcricao ou notas para a IA orientar a reuniao." }, { status: 400 });
    }

    const lead = await resolveLead(tenantId, clean(body.leadId, 180));
    const coach = await generateLiveMeetingCoach({
      transcript,
      notes,
      objective: clean(body.objective, 700),
      language: clean(body.language, 80) || "pt_BR",
      translateTo: clean(body.translateTo, 80),
      lead,
    });

    return NextResponse.json({ ok: true, tenantId, coach });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro no coaching ao vivo da reuniao:", error);
    return NextResponse.json({ error: "Falha ao orientar reuniao ao vivo." }, { status: 500 });
  }
}
