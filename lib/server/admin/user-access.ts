import { adminDb } from "@/app/lib/server/firebase-admin";
import { RouteAuthError, type RequestUser } from "@/app/lib/server/route-auth";
import { canManageAgencyUser } from "@/lib/admin-access";

export async function assertAgencyUserManagement(actor: RequestUser, uid?: string, nextRole?: string) {
  const current = uid ? await adminDb.collection("users").doc(uid).get() : null;
  if (uid && !current?.exists) throw new RouteAuthError(404, "user_not_found", "Usuário não encontrado.");
  if (!canManageAgencyUser(actor.role, current?.data()?.role, nextRole)) {
    throw new RouteAuthError(403, "owner_management_denied", "Somente o proprietário pode gerenciar outro proprietário.");
  }
}
