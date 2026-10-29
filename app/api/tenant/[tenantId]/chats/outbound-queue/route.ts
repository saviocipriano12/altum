import { after, NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { reconcileTenantWhatsAppDeliveryReceipts } from "@/lib/server/whatsapp-delivery-reconciliation";
import {
  getTenantChatOutboundHealth,
  processChatOutboundJobs,
  reprocessTenantChatOutboundJob,
} from "@/lib/server/chat-outbound";

async function authorize(req: Request, tenantId: string) {
  const user = await requireRequestUser(req);
  const membership = await assertTenantAccess(user.uid, tenantId);
  await assertTenantModule(tenantId, "inbox");
  assertTenantCapability(membership, "respond_inbox");
  return { user, membership };
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    await authorize(req, tenantId);
    return NextResponse.json({ ok: true, ...(await getTenantChatOutboundHealth(tenantId)) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar fila." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await context.params;
    const { user, membership } = await authorize(req, tenantId);
    const body = await req.json() as { action?: string; cursor?: string | null; limit?: number; jobId?: string; confirmedNotDelivered?: boolean };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Dados de manutencao invalidos.");
    if (body.action === "reconcile_delivery") {
      assertTenantCapability(membership, "manage_channels");
      assertTenantCapability(membership, "view_team_records");
      if (body.cursor != null && typeof body.cursor !== "string") throw new Error("Cursor invalido.");
      return NextResponse.json({ ok: true, ...(await reconcileTenantWhatsAppDeliveryReceipts({
        tenantId, actorId: user.uid, cursor: body.cursor, limit: body.limit,
      })) });
    }
    if (body.action && body.action !== "reprocess") throw new Error("Acao de manutencao invalida.");
    const result = await reprocessTenantChatOutboundJob({
      tenantId,
      jobId: String(body.jobId || ""),
      actorId: user.uid,
      actorName: user.name,
      confirmedNotDelivered: body.confirmedNotDelivered === true,
    });
    after(() => processChatOutboundJobs({ jobId: result.jobId, limit: 1 }).catch((error) => {
      console.error("Falha ao executar reprocessamento de envio:", error);
    }));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    const message = error instanceof Error ? error.message : "Falha ao reprocessar envio.";
    return NextResponse.json({ error: message }, { status: /Confirme|nao esta disponivel/i.test(message) ? 409 : 400 });
  }
}
