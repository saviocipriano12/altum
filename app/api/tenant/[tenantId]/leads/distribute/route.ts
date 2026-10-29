import {NextResponse} from "next/server";
import {requireRequestUser, RouteAuthError} from "@/app/lib/server/route-auth";
import {TenantAccessError} from "@/lib/server/tenant";
import {distributeCommercialLeads, AssignmentChangeError, type AssignmentMode} from "@/lib/server/crm/assignment-mutation";
import {AppointmentChangeError} from "@/lib/server/crm/appointment-mutation";

export async function POST(req: Request, context: {params: Promise<{tenantId: string}>}) {
  try {
    const user = await requireRequestUser(req), {tenantId} = await context.params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const leadIds = Array.isArray(body.leadIds) ? [...new Set(body.leadIds)] : [];
    if (leadIds.some(id => typeof id !== "string") || leadIds.length > 100 || body.requestId !== undefined && typeof body.requestId !== "string") return NextResponse.json({error: "Selecione até 100 oportunidades válidas."}, {status: 400});
    const mode: AssignmentMode = ["random", "specific", "unassign"].includes(String(body.mode)) ? body.mode as AssignmentMode : "balanced";
    if (mode === "unassign" && !leadIds.length) return NextResponse.json({error: "Selecione ao menos uma oportunidade para remover o responsável."}, {status: 400});
    const result = await distributeCommercialLeads({tenantId, actorId: user.uid, actorName: user.name, leadIds: leadIds as string[], mode,
      onlyUnassigned: mode === "unassign" ? false : body.onlyUnassigned !== false,
      assigneeUserId: typeof body.assigneeUserId === "string" ? body.assigneeUserId : undefined,
      teamId: typeof body.teamId === "string" ? body.teamId : undefined, requestId: body.requestId as string | undefined});
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof TenantAccessError) return NextResponse.json({error: error.message, code: error.code}, {status: 403});
    if (error instanceof AssignmentChangeError || error instanceof AppointmentChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    console.error("Erro ao distribuir oportunidades:", error);
    return NextResponse.json({error: "Não foi possível distribuir as oportunidades. Nenhuma alteração parcial foi aplicada."}, {status: 500});
  }
}
