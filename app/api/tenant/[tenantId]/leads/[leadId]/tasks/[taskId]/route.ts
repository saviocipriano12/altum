import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { TenantAccessError } from "@/lib/server/tenant";
import { updateCommercialTask, TaskMutationError } from "@/lib/server/crm/activity-mutation";

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; leadId: string; taskId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId, leadId, taskId } = await context.params;
    const result = await updateCommercialTask({ tenantId, leadId, taskId, userId: user.uid, userName: user.name }, await req.json());
    return NextResponse.json({ ok: true, tenantId, leadId, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof TaskMutationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados da tarefa invalidos." }, { status: 400 });
    console.error("Erro ao atualizar retorno:", error);
    return NextResponse.json({ error: "Falha ao atualizar retorno." }, { status: 500 });
  }
}