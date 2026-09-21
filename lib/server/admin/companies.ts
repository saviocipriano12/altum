import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, RouteAuthError, type RequestUser } from "@/app/lib/server/route-auth";

export async function resolveAdminCompany(actor: RequestUser, id: string) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new RouteAuthError(400, "invalid_company", "Empresa inválida.");
  const [client, directTenant] = await Promise.all([
    adminDb.collection("clientes").doc(id).get(), adminDb.collection("tenants").doc(id).get(),
  ]);
  if (client.exists) {
    const data = client.data()!;
    if (!isAdmin(actor) && data.ownerId !== actor.uid) throw new RouteAuthError(403, "company_access_denied", "Empresa fora da sua carteira.");
    const linked = await adminDb.collection("tenants").where("legacyClientId", "==", id).limit(2).get();
    if (linked.size > 1) throw new RouteAuthError(409, "ambiguous_company", "Há mais de uma empresa SaaS vinculada a este cadastro. Revise o vínculo.");
    return { id, data, tenantId: linked.docs[0]?.id || (directTenant.exists ? directTenant.id : null), kind: "commercial" as const };
  }
  if (!directTenant.exists) throw new RouteAuthError(404, "company_not_found", "Empresa não encontrada.");
  if (!isAdmin(actor)) {
    throw new RouteAuthError(403, "company_access_denied", "Empresas SaaS sem cadastro comercial exigem um administrador da Altum.");
  }
  return { id, data: directTenant.data()!, tenantId: id, kind: "platform" as const };
}
