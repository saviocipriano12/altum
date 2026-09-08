export const AGENCY_SELLER_ROLES = ["sdr", "closer", "agency_agent"] as const;
export const AGENCY_ADMIN_ONLY_ROLES = ["admin", "agency_owner", "agency_admin"] as const;
export const CLIENT_USER_ROLES = [
  "client",
  "client_owner",
  "client_admin",
  "client_agent",
  "client_viewer",
] as const;

const SELLER_ROLE_SET = new Set<string>(AGENCY_SELLER_ROLES);
const CLIENT_ROLE_SET = new Set<string>(CLIENT_USER_ROLES);
const ADMIN_ROLE_SET = new Set<string>(AGENCY_ADMIN_ONLY_ROLES);

export function normalizeRoleValue(role: unknown) {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

export function isAgencySellerRole(role: unknown) {
  return SELLER_ROLE_SET.has(normalizeRoleValue(role));
}

export function isClientRole(role: unknown) {
  return CLIENT_ROLE_SET.has(normalizeRoleValue(role));
}

export function isAgencyAdminOnlyRole(role: unknown) {
  return ADMIN_ROLE_SET.has(normalizeRoleValue(role));
}

export function canReceiveDistributedLeads(role: unknown) {
  return isAgencySellerRole(role);
}
