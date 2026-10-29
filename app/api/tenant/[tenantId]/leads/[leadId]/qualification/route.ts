import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { TenantAccessError } from "@/lib/server/tenant";
import { readQualificationReview, saveQualificationReview, QualificationReviewError } from "@/lib/server/crm/qualification-review";

async function handle(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }, saving: boolean) {
  try {
    const user = await requireRequestUser(req), params = await context.params;
    const actor = { ...params, userId: user.uid, userName: user.name };
    const result = saving ? await saveQualificationReview(actor, await req.json()) : await readQualificationReview(actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError || error instanceof QualificationReviewError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    console.error("Falha ao revisar qualificação do CRM", error);
    return NextResponse.json({ error: "Não foi possível revisar os dados comerciais." }, { status: 500 });
  }
}
export async function GET(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }) { return handle(req, context, false); }
export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }) { return handle(req, context, true); }
