import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  text?: string;
};

function cleanString(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toSeconds(value: unknown) {
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return Math.floor((value as { toDate: () => Date }).toDate().getTime() / 1000);
  }
  return 0;
}

async function assertLeadInTenant(tenantId: string, leadId: string) {
  const leadRef = adminDb.collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
  }

  const lead = leadSnap.data() as { tenantId?: string };
  if ((lead.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Lead fora do tenant informado.");
  }

  return leadRef;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    await assertLeadInTenant(tenantId, leadId);

    const snap = await adminDb
      .collection("lead_notes")
      .where("tenantId", "==", tenantId)
      .where("leadId", "==", leadId)
      .limit(100)
      .get();

    const items = snap.docs
      .map(
        (doc): Record<string, unknown> & { id: string; createdAt?: unknown } => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        })
      )
      .sort((a, b) => toSeconds(b.createdAt) - toSeconds(a.createdAt));

    return NextResponse.json({ ok: true, tenantId, leadId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar notas do lead:", error);
    return NextResponse.json({ error: "Falha ao listar notas do lead." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "edit_leads");
    const leadRef = await assertLeadInTenant(tenantId, leadId);

    const body = (await req.json()) as Body;
    const text = cleanString(body.text, 1600);
    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    await Promise.all([
      adminDb.collection("lead_notes").add({
        tenantId,
        leadId,
        text,
        authorId: user.uid,
        authorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      leadRef.collection("events").add({
        type: "note_added",
        title: "Nota adicionada",
        detail: text.slice(0, 240),
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, leadId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar nota do lead:", error);
    return NextResponse.json({ error: "Falha ao criar nota do lead." }, { status: 500 });
  }
}
