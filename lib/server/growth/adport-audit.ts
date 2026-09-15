import type {
  AdProvider,
  AuditFinding,
  FindingsRepository,
  FindingStatus,
  NormalizedQuery,
  Report,
  ReportRow,
  WriteGuard,
  WriteOperation,
  WritePreview,
  WriteResult,
} from "@adport/core";
import type { GrowthBriefing, GrowthCampaignGroup } from "./contracts";

class MemoryFindingsRepository implements FindingsRepository {
  private readonly rows = new Map<string, AuditFinding>();
  async list(filter?: { status?: FindingStatus; provider?: string }) {
    return [...this.rows.values()].filter((row) => (!filter?.status || row.status === filter.status) && (!filter?.provider || row.provider === filter.provider));
  }
  async get(id: string) { return this.rows.get(id); }
  async save(finding: AuditFinding) { this.rows.set(finding.id, finding); }
  async setStatus(id: string, status: FindingStatus) {
    const finding = this.rows.get(id);
    if (!finding) throw new Error("Finding nao encontrado.");
    const updated = { ...finding, status, updatedAt: new Date().toISOString() };
    this.rows.set(id, updated);
    return updated;
  }
}

function asReportRow(group: GrowthCampaignGroup): ReportRow {
  const ctr = group.impressions > 0 ? Number(((group.clicks / group.impressions) * 100).toFixed(4)) : 0;
  const cpc = group.clicks > 0 ? Number((group.spend / group.clicks).toFixed(4)) : 0;
  const cpa = group.wonLeads > 0 ? Number((group.spend / group.wonLeads).toFixed(4)) : 0;
  return {
    provider: group.platform,
    accountId: group.adAccountId,
    entity: { level: "campaign", id: group.campaignId, name: group.label, status: "ENABLED" },
    metrics: {
      spend: group.spend,
      impressions: group.impressions,
      clicks: group.clicks,
      conversions: group.wonLeads,
      ctr,
      cpc,
      cpa,
    },
  };
}

class AltumGrowthProvider implements AdProvider {
  readonly id: string;
  private readonly rows: ReportRow[];

  constructor(id: string, rows: ReportRow[]) { this.id = id; this.rows = rows; }
  capabilities() { return { serverDryRun: false }; }
  async listAccounts() {
    return [...new Set(this.rows.map((row) => row.accountId))].map((id) => ({ provider: this.id, id, name: id }));
  }
  standardActions() {
    return { pauseCampaign: (accountId: string, campaignId: string) => ({ tool: "draft_campaign_pause", input: { platform: this.id, adAccountId: accountId, campaignId } }) };
  }
  async report(query: NormalizedQuery): Promise<Report> {
    const accountIds = query.accountIds ? new Set(query.accountIds) : null;
    const rows = accountIds ? this.rows.filter((row) => accountIds.has(row.accountId)) : this.rows;
    return { rows: rows.slice(0, query.limit || 1000), truncated: rows.length > (query.limit || 1000) };
  }
  async previewWrite(operation: WriteOperation, guard: WriteGuard): Promise<WritePreview> {
    void operation;
    void guard;
    throw new Error("Use o adaptador de previa de campanha.");
  }
  async applyWrite(operation: WriteOperation, guard: WriteGuard): Promise<WriteResult> {
    void operation;
    void guard;
    throw new Error("Conector de escrita nao habilitado.");
  }
}

function inclusiveEnd(to: string) {
  const time = Date.parse(to);
  return Number.isFinite(time) ? new Date(Math.max(0, time - 1)).toISOString().slice(0, 10) : to.slice(0, 10);
}

export async function runAdportGrowthAudit(briefing: GrowthBriefing) {
  const { AuditRunner, ProviderRegistry, corePerformancePack } = await import("@adport/core");
  const registry = new ProviderRegistry();
  const rows = briefing.campaigns
    .filter((group) => group.platform && group.campaignId && group.adAccountId)
    .map(asReportRow);
  const platforms = [...new Set(rows.map((row) => row.provider))];
  for (const platform of platforms) {
    registry.register(new AltumGrowthProvider(platform, rows.filter((row) => row.provider === platform)));
  }
  if (!platforms.length) {
    return { engine: "@adport/core", version: "0.6.0", pack: "core-performance", findings: [], counts: { critical: 0, warn: 0, info: 0 }, evaluatedAccounts: 0 };
  }

  const runner = new AuditRunner(registry, new MemoryFindingsRepository());
  const result = await runner.run({
    dateRange: { start: briefing.from.slice(0, 10), end: inclusiveEnd(briefing.to) },
    packs: [corePerformancePack],
    persist: false,
  });
  return {
    engine: "@adport/core",
    version: "0.6.0",
    pack: `${corePerformancePack.name}@${corePerformancePack.version}`,
    ...result,
  };
}
