/**
 * Adapted from TheMattBerman/meta-ads-kit (MIT), scripts/meta-kit.sh.
 * Upstream commit: dffa0daf6ed1e278481e9408af3be6aaf9709b28
 * The upstream implementation groups daily ad insights, compares the first and
 * last CTR, and flags CTR decay or excessive frequency. Altum adds tenant-safe
 * inputs, spend/traffic evidence, stable ordering, and structured MCP output.
 */

export type CreativeSnapshot = {
  id: string;
  tenantId?: unknown;
  platform?: unknown;
  adAccountId?: unknown;
  channelId?: unknown;
  campaignId?: unknown;
  campaignName?: unknown;
  adId?: unknown;
  adName?: unknown;
  dateRef?: unknown;
  spend?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  ctr?: unknown;
  cpc?: unknown;
  frequency?: unknown;
};

export type CreativeFatigueThresholds = {
  minCtr: number;
  maxFrequency: number;
  minSpend: number;
  fatigueCtrDropPercent: number;
};

export const META_ADS_KIT_DEFAULTS: CreativeFatigueThresholds = {
  minCtr: 1,
  maxFrequency: 3.5,
  minSpend: 10,
  fatigueCtrDropPercent: 20,
};

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validDate(value: unknown) {
  const date = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function analyzeCreativeFatigue(
  snapshots: CreativeSnapshot[],
  thresholds: Partial<CreativeFatigueThresholds> = {}
) {
  const config = {
    minCtr: thresholds.minCtr ?? META_ADS_KIT_DEFAULTS.minCtr,
    maxFrequency: thresholds.maxFrequency ?? META_ADS_KIT_DEFAULTS.maxFrequency,
    minSpend: thresholds.minSpend ?? META_ADS_KIT_DEFAULTS.minSpend,
    fatigueCtrDropPercent: thresholds.fatigueCtrDropPercent ?? META_ADS_KIT_DEFAULTS.fatigueCtrDropPercent,
  };
  const grouped = new Map<string, CreativeSnapshot[]>();

  for (const row of snapshots) {
    const adId = clean(row.adId);
    const dateRef = validDate(row.dateRef);
    if (!adId || !dateRef) continue;
    const key = `${clean(row.adAccountId)}::${adId}`;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  const creatives = Array.from(grouped.values()).map((rawRows) => {
    const rows = rawRows.sort((a, b) => validDate(a.dateRef).localeCompare(validDate(b.dateRef)));
    const first = rows[0];
    const last = rows.at(-1)!;
    const startCtr = Math.max(0, number(first.ctr));
    const endCtr = Math.max(0, number(last.ctr));
    const endFrequency = Math.max(0, number(last.frequency));
    const ctrDropPercent = startCtr > 0 ? ((startCtr - endCtr) / startCtr) * 100 : 0;
    const spend = rows.reduce((sum, row) => sum + Math.max(0, number(row.spend)), 0);
    const impressions = rows.reduce((sum, row) => sum + Math.max(0, number(row.impressions)), 0);
    const clicks = rows.reduce((sum, row) => sum + Math.max(0, number(row.clicks)), 0);
    const cpc = clicks > 0 ? spend / clicks : 0;
    const status = rows.length < 3
      ? "INSUFFICIENT_DATA"
      : ctrDropPercent >= config.fatigueCtrDropPercent
        ? "FATIGUED"
        : endFrequency > config.maxFrequency
          ? "HIGH_FREQUENCY"
          : spend >= config.minSpend && endCtr < config.minCtr
            ? "LOW_CTR"
            : "OK";

    return {
      adId: clean(last.adId),
      adName: clean(last.adName) || clean(last.adId),
      campaignId: clean(last.campaignId),
      campaignName: clean(last.campaignName) || clean(last.campaignId),
      adAccountId: clean(last.adAccountId),
      channelId: clean(last.channelId),
      platform: clean(last.platform, 40) || "meta_ads",
      status,
      dataPoints: rows.length,
      firstDate: validDate(first.dateRef),
      lastDate: validDate(last.dateRef),
      startCtr: round(startCtr, 4),
      endCtr: round(endCtr, 4),
      ctrDropPercent: round(ctrDropPercent, 1),
      endFrequency: round(endFrequency, 2),
      spend: round(spend),
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      cpc: round(cpc, 4),
      evidence: [
        `${rows.length} dia(s) entre ${validDate(first.dateRef)} e ${validDate(last.dateRef)}.`,
        `CTR foi de ${round(startCtr, 2)}% para ${round(endCtr, 2)}% (${round(ctrDropPercent, 1)}% de queda).`,
        `Frequencia final ${round(endFrequency, 2)}; gasto acumulado ${round(spend)}.`,
      ],
    };
  }).sort((a, b) => {
    const priority: Record<string, number> = { FATIGUED: 0, HIGH_FREQUENCY: 1, LOW_CTR: 2, OK: 3, INSUFFICIENT_DATA: 4 };
    return priority[a.status] - priority[b.status] || b.spend - a.spend || a.adName.localeCompare(b.adName);
  });

  return {
    thresholds: config,
    summary: {
      analyzed: creatives.length,
      fatigued: creatives.filter((item) => item.status === "FATIGUED").length,
      highFrequency: creatives.filter((item) => item.status === "HIGH_FREQUENCY").length,
      lowCtr: creatives.filter((item) => item.status === "LOW_CTR").length,
      healthy: creatives.filter((item) => item.status === "OK").length,
      insufficientData: creatives.filter((item) => item.status === "INSUFFICIENT_DATA").length,
    },
    attention: creatives.filter((item) => ["FATIGUED", "HIGH_FREQUENCY", "LOW_CTR"].includes(item.status)),
    creatives,
    source: {
      project: "TheMattBerman/meta-ads-kit",
      license: "MIT",
      upstreamCommit: "dffa0daf6ed1e278481e9408af3be6aaf9709b28",
      adaptation: "Regra de fadiga por queda de CTR e frequencia, executada sobre snapshots isolados por tenant.",
    },
  };
}
