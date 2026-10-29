import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";

export type TenantDeletionAuthority = { userId: string; capability: "edit_leads" | "respond_inbox" };

/** Bind every policy source to the deletion commit. Existing access rules remain
 * the evaluator; a concurrent policy change invalidates the transaction too. */
export async function assertDeletionAuthority(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; authority: TenantDeletionAuthority; record: Record<string, unknown>;
  entity: "lead" | "chat"; parent?: Record<string, unknown>;
}) {
  const { userId, capability } = input.authority;
  if (!userId || userId.includes("/") ||
      (input.entity === "lead" && capability !== "edit_leads") ||
      (input.entity === "chat" && capability !== "respond_inbox" && !(capability === "edit_leads" && input.parent))) {
    throw new TenantAccessError("deletion_authority_invalid", "Permissao de exclusao invalida.");
  }
  const channelId = input.entity === "chat" && typeof input.record.channelId === "string" ? input.record.channelId.trim() : "";
  if (channelId.includes("/")) throw new TenantAccessError("chat_channel_invalid", "Canal da conversa invalido.");
  const [user, , , , , , channel] = await Promise.all([
    tx.get(adminDb.collection("users").doc(userId)),
    tx.get(adminDb.collection("tenant_users").where("userId", "==", userId).where("tenantId", "==", input.tenantId).limit(1)),
    tx.get(adminDb.collection("tenant_users").doc(`${input.tenantId}_${userId}`)),
    tx.get(adminDb.collection("tenants").doc(input.tenantId)),
    tx.get(adminDb.collection("client_portal_users").doc(userId)),
    tx.get(adminDb.collection("tenant_entitlements").doc(input.tenantId)),
    channelId ? tx.get(adminDb.collection("tenant_channels").doc(channelId)) : Promise.resolve(null),
  ]);
  if (user.data()?.status === "blocked") throw new TenantAccessError("user_blocked", "Acesso do usuario bloqueado.");
  const membership = await assertTenantAccess(userId, input.tenantId);
  assertTenantCapability(membership, capability);
  await assertTenantModule(input.tenantId, capability === "edit_leads" ? "crm" : "inbox");
  if (input.record.tenantId !== input.tenantId || input.parent && input.parent.tenantId !== input.tenantId) {
    throw new TenantAccessError("deletion_tenant_mismatch", "Registro fora desta empresa.");
  }
  if (input.parent) assertAssignedCommercialRecordAccess(membership, userId, input.parent);
  let record = input.record;
  if (channel?.exists) {
    const current = channel.data()!;
    if (current.tenantId !== input.tenantId) throw new TenantAccessError("chat_channel_tenant_mismatch", "Canal fora desta empresa.");
    record = { ...record, channelScope: current.channelScope, channelOwnerUserId: current.ownerUserId };
  }
  assertAssignedCommercialRecordAccess(membership, userId, record);
}
