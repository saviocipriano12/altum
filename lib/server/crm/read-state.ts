import { adminDb } from "@/app/lib/server/firebase-admin";
import { type CommercialReadState } from "@/lib/crm-read-state";
import { projectCommercialReadIssues } from "./read-issues";
import { matchesConversationCommercialFence, type ConversationCommercialFence } from "./conversation-commercial-context";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { TenantAccessError, isTenantBillingBlocked } from "@/lib/server/tenant";

/** Failed interpretation must be visible without permitting a stale worker to replace a newer client's state. */
export async function recordCommercialReadFailure(fence: ConversationCommercialFence, state: CommercialReadState) {
  await adminDb.runTransaction(async tx => {
    if (!await matchesConversationCommercialFence(tx, fence)) return;
    const [settings] = await Promise.all([tx.get(adminDb.collection("tenant_settings").doc(fence.tenantId)),
      tx.get(adminDb.collection("tenant_entitlements").doc(fence.tenantId)), tx.get(adminDb.collection("tenants").doc(fence.tenantId))]);
    if (settings.data()?.ai?.enabled === false || await isTenantBillingBlocked(fence.tenantId)) return;
    try { await assertTenantModule(fence.tenantId, "crm"); await assertTenantModule(fence.tenantId, "ai"); }
    catch (error) { if (error instanceof TenantAccessError) return; throw error; }
    const ref = adminDb.collection("leads").doc(fence.leadId), lead = await tx.get(ref);
    if (!lead.exists || lead.data()?.tenantId !== fence.tenantId) return;
    const projection = await projectCommercialReadIssues(tx, ref, lead.data()?.aiCommercialReadState, state,
      `${lead.createTime!.seconds}:${lead.createTime!.nanoseconds}`);
    tx.update(ref, { aiCommercialReadState: projection });
  });
}
