import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  compareAiDigitalTwinRuns,
  buildAiDigitalTwinSnapshot,
  type AiDigitalTwinEvaluationRun,
  type AiDigitalTwinStoredResult,
} from "../lib/ai-digital-twin.ts";

type LiveArtifact = {
  scenarioVersion?: string;
  tenantId?: string;
  model?: string;
  verificationMode?: string;
  summary?: { gate?: string };
  results?: Array<Record<string, unknown>>;
};

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map((item) => clean(item, 100)).filter(Boolean).slice(0, 30) : [];
}

function runtimeOf(result: Record<string, unknown>) {
  return result.runtime && typeof result.runtime === "object" ? result.runtime as Record<string, unknown> : {};
}

function storedResult(result: Record<string, unknown>): AiDigitalTwinStoredResult {
  const runtime = runtimeOf(result);
  return {
    scenarioId: clean(result.scenarioId, 100),
    passed: result.passed === true,
    decision: clean(result.decision, 40) || null,
    responseGoal: clean(result.responseGoal, 80) || null,
    stateAfter: clean(result.stateAfter, 80) || null,
    qualityScore: typeof result.qualityScore === "number" ? result.qualityScore : null,
    latencyMs: typeof runtime.latencyMs === "number" ? runtime.latencyMs : null,
    estimatedCostUsd: typeof runtime.estimatedCostUsd === "number" ? runtime.estimatedCostUsd : null,
    providerFallbackTriggered: runtime.providerFallbackTriggered === true,
    actionPlanExecutionMode: clean(runtime.actionPlanExecutionMode, 40) || null,
    actionPlanReadySteps: list(runtime.actionPlanReadySteps),
    actionPlanApprovalSteps: list(runtime.actionPlanApprovalSteps),
    responseValidationStatus: clean(runtime.responseValidationStatus, 40) || null,
    issues: list(result.issues),
  };
}

function outcomesMatch(baseline: LiveArtifact, candidate: LiveArtifact) {
  const left = new Map((baseline.results || []).map((item) => [clean(item.scenarioId, 100), item.passed === true]));
  const right = new Map((candidate.results || []).map((item) => [clean(item.scenarioId, 100), item.passed === true]));
  return left.size === right.size && [...left].every(([id, passed]) => right.get(id) === passed);
}

function evaluationRun(id: string, artifact: LiveArtifact, stable: boolean): AiDigitalTwinEvaluationRun {
  return {
    id,
    tenantId: clean(artifact.tenantId, 140),
    scenarioVersion: clean(artifact.scenarioVersion, 80),
    summaryGate: clean(artifact.summary?.gate, 40) || null,
    baselineStatus: "ready",
    stabilityStatus: stable ? "stable" : "unstable",
    learningRecommendationFingerprint: null,
    results: (artifact.results || []).map(storedResult),
  };
}

const [baselineArg, candidateArg] = process.argv.slice(2);
if (!baselineArg || !candidateArg) throw new Error("Use: verify-ai-digital-twin-artifacts <baseline.json> <candidate.json>");
const baselinePath = resolve(process.cwd(), baselineArg);
const candidatePath = resolve(process.cwd(), candidateArg);
const baselineArtifact = JSON.parse(await readFile(baselinePath, "utf8")) as LiveArtifact;
const candidateArtifact = JSON.parse(await readFile(candidatePath, "utf8")) as LiveArtifact;
const stable =
  baselineArtifact.verificationMode === "full" &&
  candidateArtifact.verificationMode === "full" &&
  baselineArtifact.scenarioVersion === candidateArtifact.scenarioVersion &&
  baselineArtifact.tenantId === candidateArtifact.tenantId &&
  baselineArtifact.model === candidateArtifact.model &&
  outcomesMatch(baselineArtifact, candidateArtifact);
const tenantId = clean(candidateArtifact.tenantId, 140);
const baseline = evaluationRun(basename(baselinePath), baselineArtifact, true);
const candidate = evaluationRun(basename(candidatePath), candidateArtifact, stable);
const snapshot = buildAiDigitalTwinSnapshot({
  tenantId,
  baselineRunId: baseline.id,
  candidateRunId: candidate.id,
  baselineContextFingerprint: baselineArtifact.scenarioVersion || null,
  candidateContextFingerprint: candidateArtifact.scenarioVersion || null,
});
const comparison = compareAiDigitalTwinRuns({ tenantId, baseline, candidate });
const outputDir = resolve(process.cwd(), ".qa-artifacts", "ai-digital-twin");
await mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = resolve(outputDir, `digital-twin-${stamp}.json`);
await writeFile(outputPath, JSON.stringify({ capturedAt: new Date().toISOString(), stable, snapshot, comparison }, null, 2), "utf8");
process.stdout.write(`Gemeo digital: ${comparison.status}\n`);
process.stdout.write(`Estabilidade repetida: ${stable ? "aprovada" : "reprovada"}\n`);
process.stdout.write(`Cenarios: ${comparison.scenarioCount}; jornadas: ${comparison.journeyCount}\n`);
process.stdout.write(`Motivos: ${comparison.reasons.join(", ") || "nenhum"}\n`);
process.stdout.write(`Artefato: ${outputPath}\n`);
if (comparison.status !== "ready") process.exitCode = 1;
