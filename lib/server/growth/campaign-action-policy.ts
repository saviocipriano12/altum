import type {
  AdProvider,
  AuditEntry,
  AuditEntryStore,
  NormalizedQuery,
  PendingOperation,
  PendingOperationStore,
  Report,
  WriteGuard,
  WriteOperation,
  WritePreview,
  WriteResult,
} from "@adport/core";
import type { GrowthRow } from "./contracts";

export const CAMPAIGN_ACTION_POLICY = {
  maxBudgetDeltaPercent: 25,
  maxDailyBudget: 100_000,
  pendingTtlMinutes: 15,
  supportedPlatforms: ["meta_ads", "google_ads"] as const,
} as const;

export type CampaignPlatform = typeof CAMPAIGN_ACTION_POLICY.supportedPlatforms[number];

export type CampaignTarget = {
  platform: CampaignPlatform;
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  channelId: string;
  snapshotId: string;
  snapshotDate: string;
};

export class CampaignPolicyError extends Error {
  readonly code: "CAMPAIGN_NOT_FOUND" | "CAMPAIGN_AMBIGUOUS" | "POLICY_VIOLATION";

  constructor(code: CampaignPolicyError["code"], message: string) {
    super(message);
    this.name = "CampaignPolicyError";
    this.code = code;
  }
}

class MemoryPendingStore implements PendingOperationStore {
  private readonly entries = new Map<string, PendingOperation>();

  async put(operation: PendingOperation) { this.entries.set(operation.id, operation); }
  async get(id: string) { return this.entries.get(id); }
  async delete(id: string) { this.entries.delete(id); }
  async sweep(now = new Date()) {
    for (const [id, operation] of this.entries) {
      if (Date.parse(operation.expiresAt) < now.getTime()) this.entries.delete(id);
    }
  }
}

class MemoryAuditStore implements AuditEntryStore {
  readonly entries: Array<Omit<AuditEntry, "ts">> = [];
  async append(entry: Omit<AuditEntry, "ts">) { this.entries.push(entry); }
}

class AltumCampaignPreviewProvider implements AdProvider {
  readonly id: string;

  constructor(platform: CampaignPlatform) { this.id = platform; }
  capabilities() { return { serverDryRun: false }; }
  async listAccounts() { return []; }
  async report(query: NormalizedQuery): Promise<Report> { void query; return { rows: [] }; }
  async previewWrite(operation: WriteOperation, guard: WriteGuard): Promise<WritePreview> {
    void guard;
    if (operation.provider !== this.id) throw new Error("Provider diferente do alvo validado.");
    const campaignId = clean(operation.payload.campaignId);
    const campaignName = clean(operation.payload.campaignName) || campaignId;
    if (!campaignId) throw new Error("campaignId obrigatorio.");

    if (operation.tool === "draft_campaign_pause") {
      return {
        summary: `Pausar campanha ${campaignName} (${campaignId})`,
        changes: [`~ campaign ${campaignId} status ACTIVE -> PAUSED`],
        coercions: [],
        budgetDeltas: [],
        serverValidated: false,
      };
    }

    if (operation.tool === "draft_campaign_budget_change") {
      const fromMicros = Number(operation.payload.currentDailyBudgetMicros);
      const toMicros = Number(operation.payload.proposedDailyBudgetMicros);
      if (!Number.isSafeInteger(fromMicros) || fromMicros <= 0 || !Number.isSafeInteger(toMicros) || toMicros <= 0) {
        throw new Error("Orcamentos devem ser valores positivos e seguros.");
      }
      return {
        summary: `Alterar verba diaria da campanha ${campaignName} (${campaignId})`,
        changes: [`~ campaign ${campaignId} daily_budget ${fromMicros} -> ${toMicros} micros`],
        coercions: [],
        budgetDeltas: [{ target: `campaign ${campaignId} daily budget`, fromMicros, toMicros }],
        serverValidated: false,
      };
    }

    throw new Error("Acao de campanha nao suportada.");
  }
  async applyWrite(operation: WriteOperation, guard: WriteGuard): Promise<WriteResult> {
    void operation;
    void guard;
    throw new Error("Este adaptador permite somente previa. Use um conector autenticado para aplicar.");
  }
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function latestFirst(a: GrowthRow, b: GrowthRow) {
  return clean(b.dateRef, 20).localeCompare(clean(a.dateRef, 20));
}

export function resolveCampaignTarget(
  snapshots: GrowthRow[],
  input: { platform: CampaignPlatform; campaignId: string; adAccountId?: string }
): CampaignTarget {
  const campaignId = clean(input.campaignId);
  const adAccountId = clean(input.adAccountId);
  const matches = snapshots
    .filter((row) => clean(row.platform, 40) === input.platform && clean(row.campaignId) === campaignId)
    .filter((row) => !adAccountId || clean(row.adAccountId) === adAccountId)
    .sort(latestFirst);

  if (!matches.length) {
    throw new CampaignPolicyError(
      "CAMPAIGN_NOT_FOUND",
      "A campanha nao foi encontrada nos snapshots autorizados. Sincronize dados no nivel da campanha e use o campaignId retornado pela Altum."
    );
  }

  const accounts = new Set(matches.map((row) => clean(row.adAccountId)).filter(Boolean));
  if (!adAccountId && accounts.size > 1) {
    throw new CampaignPolicyError(
      "CAMPAIGN_AMBIGUOUS",
      "O mesmo campaignId apareceu em mais de uma conta. Informe adAccountId para selecionar o alvo exato."
    );
  }

  const row = matches[0];
  return {
    platform: input.platform,
    campaignId,
    campaignName: clean(row.campaignName) || campaignId,
    adAccountId: clean(row.adAccountId),
    channelId: clean(row.channelId),
    snapshotId: row.id,
    snapshotDate: clean(row.dateRef, 20),
  };
}

function moneyToMicros(value: number) {
  const micros = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new CampaignPolicyError("POLICY_VIOLATION", "O orcamento informado nao pode ser convertido com seguranca.");
  }
  return micros;
}

export async function createAdportCampaignPreview(input: {
  target: CampaignTarget;
  action: "pause_campaign" | "change_daily_budget";
  currentDailyBudget?: number;
  proposedDailyBudget?: number;
  currency?: string;
  reason: string;
  evidence: string[];
}) {
  const { AdportError, hashOperation } = await import("@adport/core");
  const { engine, policy, audit } = await createAdportPolicyRuntime();
  const payload: Record<string, unknown> = {
    action: input.action,
    campaignId: input.target.campaignId,
    campaignName: input.target.campaignName,
    reason: input.reason,
    evidence: input.evidence,
  };
  if (input.action === "change_daily_budget") {
    payload.currentDailyBudgetMicros = moneyToMicros(input.currentDailyBudget || 0);
    payload.proposedDailyBudgetMicros = moneyToMicros(input.proposedDailyBudget || 0);
    payload.currency = clean(input.currency, 3).toUpperCase();
  }
  const operation: WriteOperation = {
    tool: input.action === "pause_campaign" ? "draft_campaign_pause" : "draft_campaign_budget_change",
    provider: input.target.platform,
    accountId: input.target.adAccountId,
    kind: "update",
    payload,
  };

  try {
    const validation = await engine.validate(new AltumCampaignPreviewProvider(input.target.platform), operation);
    return {
      engine: "@adport/core",
      version: "0.6.0",
      policy,
      operation,
      operationHash: hashOperation(operation),
      preview: validation.preview,
      pendingOperationId: validation.pendingOperationId,
      expiresAt: validation.expiresAt,
      audit: audit.entries,
    };
  } catch (error) {
    if (error instanceof AdportError) {
      throw new CampaignPolicyError("POLICY_VIOLATION", error.message);
    }
    throw error;
  }
}

export async function createAdportPolicyRuntime(protectedAccounts: string[] = []) {
  const { PolicyEngine, policySchema } = await import("@adport/core");
  const policy = policySchema.parse({
    require_validation: true,
    paused_creation: true,
    max_budget_delta_pct: CAMPAIGN_ACTION_POLICY.maxBudgetDeltaPercent,
    max_daily_budget_micros: CAMPAIGN_ACTION_POLICY.maxDailyBudget * 1_000_000,
    protected_accounts: protectedAccounts,
    pending_ttl_minutes: CAMPAIGN_ACTION_POLICY.pendingTtlMinutes,
  });
  const audit = new MemoryAuditStore();
  const engine = new PolicyEngine(policy, new MemoryPendingStore(), audit);
  return { engine, policy, audit };
}
