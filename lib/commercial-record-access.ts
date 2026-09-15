import type { TenantMembership } from './server/tenant';

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function hasTeamWideCommercialAccess(membership: TenantMembership) {
  if (
    membership.role === "client_owner" ||
    membership.role === "client_admin" ||
    membership.role === "agency_owner" ||
    membership.role === "agency_admin" ||
    membership.role === "agency_agent"
  ) {
    return true;
  }

  return (
    membership.capabilities.includes("view_team_records") ||
    membership.capabilities.includes("manage_users") ||
    membership.capabilities.includes("manage_settings")
  );
}

export function canAccessAssignedCommercialRecord(
  membership: TenantMembership,
  userId: string,
  record: Record<string, unknown>
) {
  if (hasTeamWideCommercialAccess(membership)) return true;

  const currentUserId = clean(userId, 140);
  const channelScope = clean(record.channelScope, 40).toLowerCase();
  const channelOwnerUserId = clean(record.channelOwnerUserId, 140);
  if (channelScope === "personal" && channelOwnerUserId === currentUserId) return true;
  const ownerId = clean(
    record.assignedTo || record.ownerId || record.ownerUserId || record.assignedUserId || record.responsavelId,
    140
  );

  return Boolean(currentUserId && ownerId === currentUserId);
}
