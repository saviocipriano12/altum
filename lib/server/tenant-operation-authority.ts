import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, type TenantCapability } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import type { TenantModuleId } from "@/lib/tenant-entitlements";

/** Track all current policy sources in the commit, using the existing policy
 * evaluator. Revocation invalidates a concurrent transaction instead of leaving
 * an earlier membership snapshot authoritative for the write. */
export async function assertTransactionalTenantAuthority(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; userId: string; capability?: TenantCapability; module: TenantModuleId;
}) {
  const [user] = await Promise.all([
    tx.get(adminDb.collection("users").doc(input.userId)),
    tx.get(adminDb.collection("tenant_users").where("userId", "==", input.userId).where("tenantId", "==", input.tenantId).limit(1)),
    tx.get(adminDb.collection("tenant_users").doc(`${input.tenantId}_${input.userId}`)),
    tx.get(adminDb.collection("tenants").doc(input.tenantId)),
    tx.get(adminDb.collection("client_portal_users").doc(input.userId)),
    tx.get(adminDb.collection("tenant_entitlements").doc(input.tenantId)),
  ]);
  if (user.data()?.status === "blocked") throw new TenantAccessError("user_blocked", "Acesso do usuario bloqueado.");
  const membership = await assertTenantAccess(input.userId, input.tenantId);
  if (input.capability) assertTenantCapability(membership, input.capability);
  await assertTenantModule(input.tenantId, input.module);
  return membership;
}
