export type CompanyRecord = { id: string } & Record<string, unknown>;

export function mergeAdminCompanies(clients: CompanyRecord[], tenants: CompanyRecord[]) {
  const linked = new Map<string, CompanyRecord[]>();
  for (const tenant of tenants) {
    if (typeof tenant.legacyClientId === "string" && tenant.legacyClientId) {
      linked.set(tenant.legacyClientId, [...(linked.get(tenant.legacyClientId) || []), tenant]);
    }
  }
  const clientIds = new Set(clients.map(row => row.id));
  const tenantIds = new Set(tenants.map(row => row.id));
  const project = (row: CompanyRecord, tenant: CompanyRecord | undefined, ambiguous = false) => ({
    id: row.id, name: String(row.name || "Empresa"), niche: String(row.niche || ""),
    city: String(row.city || ""), contactName: String(row.contactName || row.responsibleName || ""),
    email: String(row.email || row.responsibleEmail || ""), phone: String(row.phone || row.telefone || ""),
    site: String(row.site || ""), status: String(row.status || "Em implantação"),
    services: Array.isArray(row.services) ? row.services.filter(item => typeof item === "string") : [],
    ownerId: typeof row.ownerId === "string" ? row.ownerId : null,
    tenantId: ambiguous ? null : tenant?.id || null,
    companyKind: tenantIds.has(row.id) && !clientIds.has(row.id) ? "platform" : "commercial",
    ambiguous, createdAt: row.createdAt || null,
  });
  return [
    ...clients.map(row => { const matches = linked.get(row.id) || []; return project(row, matches.length === 1 ? matches[0] : tenants.find(tenant => tenant.id === row.id), matches.length > 1); }),
    ...tenants.filter(row => !clientIds.has(row.id) && !(typeof row.legacyClientId === "string" && clientIds.has(row.legacyClientId))).map(row => project(row, row)),
  ].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
