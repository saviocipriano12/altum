import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { corpusCaseHash, evaluationCorpus, summarizeCorpus } from "./ai-rebuild/corpus.mts";
// Structural audit may hash the reserved cases. It never submits transcripts to
// an agent/model, executes scenarios or produces detailed holdout tuning feedback.
const cases = await evaluationCorpus({ includeHoldout: true });
const summary = summarizeCorpus(cases);
const report = { capturedAt: new Date().toISOString(), ...summary,
  boundary: "Specification inventory and hashes only. Not scenario execution, semantic coverage proof or blind human approval.",
  entries: cases.map(item => ({ id: item.scenario.id, partition: item.partition, family: item.family, variant: item.variant,
    critical: item.critical, repetitions: item.critical ? 5 : 3, hash: corpusCaseHash(item), executor: item.executor })) };
const directory = fileURLToPath(new URL("../.qa-artifacts/ai-rebuild/", import.meta.url));
await mkdir(directory, { recursive: true });
const path = join(directory, `corpus-${Date.now()}.json`);
await writeFile(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: path, ...summary }, null, 2));
if (!summary.structuralSpecificationsValid) process.exitCode = 2;
