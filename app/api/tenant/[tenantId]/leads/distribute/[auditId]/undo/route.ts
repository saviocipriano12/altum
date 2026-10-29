import {NextResponse} from "next/server";
import {requireRequestUser, RouteAuthError} from "@/app/lib/server/route-auth";
import {TenantAccessError} from "@/lib/server/tenant";
import {undoCommercialLeadDistribution, AssignmentChangeError} from "@/lib/server/crm/assignment-mutation";
import {AppointmentChangeError} from "@/lib/server/crm/appointment-mutation";

export async function POST(req: Request, context: {params: Promise<{tenantId: string; auditId: string}>}) {
  try {
    const user = await requireRequestUser(req), {tenantId, auditId} = await context.params;
    return NextResponse.json(await undoCommercialLeadDistribution({tenantId, actorId: user.uid, actorName: user.name, auditId}));
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof TenantAccessError) return NextResponse.json({error: error.message, code: error.code}, {status: 403});
    if (error instanceof AssignmentChangeError || error instanceof AppointmentChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    console.error("Erro ao desfazer distribuição:", error);
    return NextResponse.json({error: "Não foi possível desfazer. Nenhuma alteração parcial foi aplicada."}, {status: 500});
  }
}
