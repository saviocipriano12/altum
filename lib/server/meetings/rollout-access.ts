import { TenantAccessError, type TenantMembership } from "@/lib/server/tenant";

export function assertMeetingRolloutAccess(membership: Pick<TenantMembership, "role" | "status">) {
  if (membership.status !== "active" || (membership.role !== "agency_owner" && membership.role !== "agency_admin")) {
    throw new TenantAccessError("meeting_rollout_unavailable", "Reuniões com IA estarão disponíveis em breve.");
  }
}
