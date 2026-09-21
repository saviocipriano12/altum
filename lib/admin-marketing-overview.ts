export type AdminMarketingRow = { id: string } & Record<string, unknown>;
export type AdminMarketingInput = {
  tenants: AdminMarketingRow[];
  clients: AdminMarketingRow[];
  accounts: AdminMarketingRow[];
  channels: AdminMarketingRow[];
  tracking: AdminMarketingRow[];
  metaReports: AdminMarketingRow[];
  googleReports: AdminMarketingRow[];
  drafts: AdminMarketingRow[];
  pixels: AdminMarketingRow[];
};

const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 240) : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const changeFields = new Set(["action", "expectedStatus", "from", "to", "currency", "nextStatus", "name", "objective", "dailyBudget", "initialStatus", "countries", "optimizationGoal", "pageId", "link", "imageUrl", "message", "headline", "description", "callToAction", "creativeId", "adSetName", "campaignName", "text", "matchType", "cpcBid", "headlines", "descriptions", "finalUrls", "path1", "path2", "strategy", "targetCpa", "targetRoas", "cpcBidCeiling", "tone", "instructions", "guardrails", "notes", "conditions", "match", "segmentId", "channelId", "maxRecipients"]);
function changeDetails(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => changeFields.has(key)).map(([key, entry]) => [key,
    key === "conditions" && Array.isArray(entry) ? entry.slice(0, 20).map(item => {
      const condition = object(item);
      return { field: text(condition.field), operator: text(condition.operator), ...(condition.value !== undefined ? { value: typeof condition.value === "string" ? condition.value.slice(0, 500) : number(condition.value) } : {}) };
    }) : typeof entry === "string" ? entry.slice(0, 4000) : typeof entry === "number" && Number.isFinite(entry) ? entry : Array.isArray(entry) ? entry.slice(0, 20).map(item => typeof item === "string" ? item.slice(0, 500) : null).filter(item => item !== null) : null,
  ]));
}
export function adminDraftPreviewComplete(value: unknown) {
  const change = object(value), details = changeDetails(change);
  return Object.keys(change).length > 0 && Object.keys(change).length === Object.keys(details).length
    && Object.entries(change).every(([key, entry]) => JSON.stringify(entry) === JSON.stringify(details[key]));
}
function date(value: unknown): string | null {
  if (value == null) return null;
  const timestamp = object(value);
  const parsed = typeof timestamp.toDate === "function" ? (timestamp.toDate as () => Date)() : new Date(value as string | number);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

// Explicit projections: credentials, public write keys and provider payloads never leave this boundary.
export function buildAdminMarketingOverview(input: AdminMarketingInput, now = Date.now()) {
  const tenants = new Map(input.tenants.map(row => [row.id, row]));
  const clients = new Map(input.clients.map(row => [row.id, row]));
  const legacy = new Map<string, string[]>();
  for (const tenant of input.tenants) {
    const clientId = text(tenant.legacyClientId);
    if (clientId) legacy.set(clientId, [...(legacy.get(clientId) || []), tenant.id]);
  }
  function company(row: AdminMarketingRow, config = false) {
    const clientId = text(row.clientId);
    const candidates = legacy.get(clientId) || [];
    const declared = text(row.tenantId) || (config ? row.id : "");
    const tenantId = declared || (candidates.length === 1 ? candidates[0] : "");
    const tenant = tenants.get(tenantId);
    const client = clients.get(clientId || text(tenant?.legacyClientId));
    return {
      tenantId: tenant ? tenantId : null,
      clientId: client?.id || null,
      companyName: text(tenant?.name) || text(client?.name) || text(row.clientName) || "Empresa sem vínculo confirmado",
      linked: Boolean(tenant),
    };
  }
  const accounts = [
    ...input.accounts.map(row => ({ row, source: "ad_accounts" as const })),
    ...input.channels.filter(row => ["meta_ads", "google_ads"].includes(text(row.type))).map(row => ({ row, source: "tenant_channels" as const })),
  ].map(({ row, source }) => {
    const platform = text(source === "ad_accounts" ? row.platform : row.type);
    const hasCredential = Boolean(platform === "google_ads" ? row.refreshToken : row.accessToken);
    const externalAccountId = text(row.externalAccountId);
    return {
      id: `${source}:${row.id}`, recordId: row.id, source, ...company(row), platform,
      name: text(row.accountLabel || row.name || row.label || row.displayName) || "Conta sem nome",
      externalAccountId, status: text(row.status) || "Não informado",
      credentialRecorded: hasCredential,
      configurationComplete: Boolean(externalAccountId && hasCredential),
      connectionStatus: text(row.connectionStatus) || "Não validada",
      needsReauthorization: ["reauth_required", "revoked", "disconnected", "expired", "error", "blocked"].includes(text(row.connectionStatus)),
      lastSyncAt: date(row.lastSyncAt),
    };
  });
  const latest = new Map<string, { row: AdminMarketingRow; platform: string }>();
  for (const [platform, reports] of [["meta_ads", input.metaReports], ["google_ads", input.googleReports]] as const) {
    for (const row of reports) {
      const key = `${platform}:${text(row.tenantId)}:${text(row.channelId) || row.id}`;
      const current = latest.get(key);
      if (!current || (date(row.generatedAt) || "") > (date(current.row.generatedAt) || "")) latest.set(key, { row, platform });
    }
  }
  const campaigns = [...latest.values()].flatMap(({ row, platform }) => {
    const report = object(row.report);
    const generatedAt = date(row.generatedAt);
    const currency = text(report.currency);
    return (Array.isArray(report.campaigns) ? report.campaigns : []).map((value, index) => {
      const campaign = object(value);
      return {
        id: `${platform}:${row.id}:${text(campaign.id) || index}`, ...company(row),
        platform, channelId: text(row.channelId), accountId: text(report.accountId), campaignId: text(campaign.id),
        name: text(campaign.name) || "Campanha sem nome", status: text(campaign.status) || "Não informado",
        currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
        spend: number(campaign.spend), conversions: number(platform === "meta_ads" ? campaign.leads : campaign.conversions),
        conversionLabel: platform === "meta_ads" ? "Leads" : "Conversões",
        roas: number(campaign.roas), from: text(report.from), to: text(report.to), generatedAt,
        dailyBudget: number(campaign.dailyBudget),
        stale: !generatedAt || now - Date.parse(generatedAt) > 86400_000,
      };
    });
  });
  const tracking = input.tracking.map(row => ({
    id: row.id, ...company(row, true), enabled: row.enabled === true,
    domains: Array.isArray(row.allowedDomains) ? row.allowedDomains.filter((domain): domain is string => typeof domain === "string").map(text) : [],
    consentMode: row.consentMode === "implicit" ? "implicit" : "required",
    lastEventAt: date(row.lastEventAt), lastEventName: text(row.lastEventName),
  }));
  const companies = input.tenants.map(row => ({ id: row.id, name: text(row.name) || row.id }));
  const drafts = input.drafts.map(row => {
    const target = object(row.target); const change = object(row.proposedChange);
    return { id: row.id, ...company(row), type: text(row.type), title: text(row.title) || text(change.objective) || "Recomendação",
      status: text(row.status), reason: text(row.reason),
      evidence: Array.isArray(row.evidence) ? row.evidence.map(text).filter(Boolean).slice(0, 10) : [],
      target: { platform: text(target.platform), campaignId: text(target.campaignId), campaignName: text(target.campaignName), adAccountId: text(target.adAccountId) },
      change: { action: text(change.action), from: number(change.from), to: number(change.to), currency: text(change.currency), nextStatus: text(change.nextStatus) },
      details: changeDetails(change),
      previewComplete: adminDraftPreviewComplete(change),
      createdAt: date(row.createdAt), reviewedAt: date(row.reviewedAt), appliedAt: date(row.appliedAt),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const pixels = input.pixels.map(row => ({ id: row.id, ...company(row), provider: text(row.provider), name: text(row.name), externalId: text(row.externalId),
    domains: Array.isArray(row.domains) ? row.domains.map(text).filter(Boolean) : [], verificationStatus: text(row.verificationStatus) || "unverified", createdAt: date(row.createdAt) }));
  return {
    companies, accounts, campaigns, tracking, drafts, pixels,
    summary: {
      companies: input.tenants.length, accountRecords: accounts.length,
      incompleteAccounts: accounts.filter(row => !row.configurationComplete || !row.linked).length,
      campaigns: campaigns.length, staleCampaigns: campaigns.filter(row => row.stale).length,
      trackingEnabled: tracking.filter(row => row.enabled).length,
    },
  };
}

export type AdminMarketingOverview = ReturnType<typeof buildAdminMarketingOverview>;
