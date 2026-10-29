import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess } from "@/lib/server/commercial-access";
import { readQueryPages } from "@/lib/server/query-pages";
import { activityDateIso } from "@/lib/crm-activity";
import { createCommercialTask, TaskMutationError } from "@/lib/server/crm/activity-mutation";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm"); assertTenantRole(membership, "client_viewer");
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });
    const snap = await readQueryPages(adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", leadId));
    const items = snap.docs.map((doc): Record<string, unknown> & { id: string; dueAt: string | null } => ({ ...doc.data(), id: doc.id, dueAt: activityDateIso(doc.data().dueAt), revision: `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}` }))
      .sort((a,b) => Number(["done", "canceled"].includes(String(a.status))) - Number(["done", "canceled"].includes(String(b.status))) ||
        (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.id.localeCompare(b.id));
    return NextResponse.json({ ok: true, tenantId, leadId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar tarefas:", error);
    return NextResponse.json({ error: "Falha ao carregar retornos." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId, leadId } = await context.params;
    const result = await createCommercialTask({ tenantId, leadId, userId: user.uid, userName: user.name }, await req.json());
    return NextResponse.json({ ok: true, tenantId, leadId, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof TaskMutationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados da tarefa invalidos." }, { status: 400 });
    console.error("Erro ao criar retorno:", error);
    return NextResponse.json({ error: "Falha ao criar retorno." }, { status: 500 });
  }
}
