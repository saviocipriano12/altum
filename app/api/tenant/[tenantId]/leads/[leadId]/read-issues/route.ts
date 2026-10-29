import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { TenantAccessError } from "@/lib/server/tenant";
import { QualificationReviewError } from "@/lib/server/crm/qualification-review";
import { listCommercialReadIssues, reviewCommercialReadIssue } from "@/lib/server/crm/read-issue-review";
async function handle(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }, saving: boolean) {
  try {
    const user = await requireRequestUser(req), params = await context.params, actor = { ...params, userId: user.uid, userName: user.name };
    const result = saving ? await reviewCommercialReadIssue(actor, await req.json()) : await listCommercialReadIssues(actor, new URL(req.url).searchParams.get("cursor") || undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError || error instanceof QualificationReviewError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    console.error("Falha ao conferir pendências de leitura", error);
    return NextResponse.json({ error: "Não foi possível conferir as pendências." }, { status: 500 });
  }
}
export async function GET(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }) { return handle(req, context, false); }
export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; leadId: string }> }) { return handle(req, context, true); }
