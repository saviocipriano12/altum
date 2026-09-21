export function canManageAgencyUser(actorRole: string, currentRole?: unknown, nextRole?: unknown) {
  if (["admin", "agency_owner"].includes(actorRole)) return true;
  if (actorRole !== "agency_admin") return false;
  return ![currentRole, nextRole].some(role => role === "admin" || role === "agency_owner");
}
