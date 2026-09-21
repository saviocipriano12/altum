import { z } from "zod";
export const strategySchema = z.object({ tenantId: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),
  name: z.string().trim().min(3).max(160), hypothesis: z.string().trim().min(15).max(1200),
  platform: z.enum(["meta_ads", "google_ads"]), channelId: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),
  campaignId: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/), metric: z.enum(["cost_per_conversion", "conversions", "roas"]),
}).strict();
export type StrategyObservation = { value: number | null; conversions: number | null; currency: string | null; from: string; to: string; generatedAt: string; reportId: string };
export function compareStrategyObservations(metric: string, baseline: StrategyObservation, observed: StrategyObservation) {
  const days = (row: StrategyObservation) => (Date.parse(row.to) - Date.parse(row.from)) / 86400000;
  const problems: string[] = [];
  if (baseline.value === null || observed.value === null || baseline.value <= 0) problems.push("Indicador ausente ou base igual a zero.");
  if (metric === "cost_per_conversion" && (!baseline.currency || baseline.currency !== observed.currency)) problems.push("Moedas ausentes ou diferentes.");
  if (!Number.isFinite(days(baseline)) || days(baseline) < 0 || days(baseline) !== days(observed)) problems.push("Janelas com duração diferente ou inválida.");
  if (Date.parse(observed.from) <= Date.parse(baseline.to) || baseline.reportId === observed.reportId) problems.push("Janelas sobrepostas ou mesmo relatório.");
  if ((baseline.conversions ?? 0) < 10 || (observed.conversions ?? 0) < 10) problems.push("Amostra insuficiente: mínimo de dez conversões em cada janela.");
  if (problems.length) return { outcome: "inconclusive", percent: null, reasons: problems, causal: false };
  const percent = Number(((observed.value! - baseline.value!) / baseline.value! * 100).toFixed(2));
  return { outcome: percent === 0 ? "unchanged" : (metric === "cost_per_conversion" ? percent < 0 : percent > 0) ? "improved" : "worsened", percent, reasons: ["Comparação observacional; não demonstra causalidade da estratégia."], causal: false };
}
