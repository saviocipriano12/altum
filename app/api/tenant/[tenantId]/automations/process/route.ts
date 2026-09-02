import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { processPendingAutomationActions, processWaitingReplyAutomations } from "@/lib/server/automations";
import { processInboxWatchdog } from "@/lib/server/inbox-watchdog";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "automation");
    assertTenantCapability(membership, "manage_automations");

    const [scheduled, waitingReply, inboxWatchdog] = await Promise.all([
      processPendingAutomationActions({ tenantId, limit: 40 }),
      processWaitingReplyAutomations({ tenantId, limit: 80 }),
      processInboxWatchdog({ tenantId, limit: 120 }),
    ]);
    return NextResponse.json({ ok: true, tenantId, result: { scheduled, waitingReply, inboxWatchdog } });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao processar automacoes agendadas do tenant:", error);
    return NextResponse.json({ error: "Falha ao processar automacoes agendadas." }, { status: 500 });
  }
}
