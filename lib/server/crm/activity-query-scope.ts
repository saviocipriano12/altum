import type { TenantMembership } from "@/lib/server/tenant";
import type { ActivityFilters } from "@/lib/crm-activity-filter";
import { activityPageScope } from "./activity-page-cursor";

export function commercialActivityQueryScope(input: { tenantId: string; userId: string; membership: TenantMembership;
  filters: ActivityFilters; leadId?: string; pageSize: number; coverageRevision: string }) {
  return activityPageScope([input.tenantId, input.userId, input.membership.role, [...input.membership.capabilities].sort(),
    input.leadId || null, input.filters, input.pageSize, input.coverageRevision, "openRank,dueOrder,id:asc"]);
}
