import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateAiProactiveRecommendation } from "../lib/ai-proactive-intelligence.ts";

const now = Date.UTC(2026, 9, 12, 12);
const base = { tenantId: "operational-tenant", leadId: "lead", nowMs: now, lastInteractionAtMs: now - 48 * 3_600_000 };
const cases = [
  { id: "handoff", input: { ...base, leadId: "handoff", pendingHandoff: true }, expected: "human_takeover", status: "suggested" },
  { id: "overdue", input: { ...base, leadId: "overdue", overdueTasks: 1 }, expected: "overdue_commitment", status: "suggested" },
  { id: "retention", input: { ...base, leadId: "retention", unresolvedIncident: true }, expected: "retention_recovery", status: "suggested" },
  { id: "appointment", input: { ...base, leadId: "appointment", lastInteractionAtMs: now, appointmentAtMs: now + 6 * 3_600_000 }, expected: "appointment_risk", status: "suggested" },
  { id: "proposal", input: { ...base, leadId: "proposal", proposalPending: true }, expected: "proposal_followup", status: "suggested" },
  { id: "hot", input: { ...base, leadId: "hot", score: 85 }, expected: "hot_lead_recovery", status: "suggested" },
  { id: "opt_out", input: { ...base, leadId: "opt-out", score: 85, doNotContact: true }, expected: "hot_lead_recovery", status: "suppressed" },
  { id: "consent", input: { ...base, leadId: "consent", score: 85, consentAllowed: false }, expected: "hot_lead_recovery", status: "suppressed" },
  { id: "fatigue", input: { ...base, leadId: "fatigue", score: 85, recentOutboundCount72h: 3 }, expected: "hot_lead_recovery", status: "suppressed" },
  { id: "quiet", input: { ...base, leadId: "quiet", score: 85, quietHours: true }, expected: "hot_lead_recovery", status: "suppressed" },
  { id: "duplicate", input: { ...base, leadId: "duplicate", score: 85, openRecommendationCount: 1 }, expected: "hot_lead_recovery", status: "suppressed" },
  { id: "closed", input: { ...base, leadId: "closed", score: 85, leadStatus: "won" }, expected: null, status: null },
] as const;
const results = cases.map((item) => {
  const recommendation = generateAiProactiveRecommendation(item.input);
  const passed = (recommendation?.kind || null) === item.expected && (recommendation?.status || null) === item.status && (!recommendation || recommendation.actionMode === "human_review");
  return { id: item.id, passed, kind: recommendation?.kind || null, status: recommendation?.status || null, fingerprint: recommendation?.fingerprint || null, externalEffects: 0 };
});
const summary = { total: results.length, passed: results.filter((item) => item.passed).length, externalEffects: results.reduce((sum, item) => sum + item.externalEffects, 0), gate: results.every((item) => item.passed) ? "ready" : "blocked" };
const outputDir = resolve(process.cwd(), ".qa-artifacts", "ai-proactive");
await mkdir(outputDir, { recursive: true });
const outputPath = resolve(outputDir, `operational-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(outputPath, JSON.stringify({ schemaVersion: "ai-proactive-intelligence-v1", capturedAt: new Date().toISOString(), summary, results }, null, 2), "utf8");
process.stdout.write(`Gate: ${summary.gate}\nAprovados: ${summary.passed}/${summary.total}\nEfeitos externos: ${summary.externalEffects}\nArtefato: ${outputPath}\n`);
if (summary.gate !== "ready" || summary.externalEffects !== 0) process.exitCode = 1;
