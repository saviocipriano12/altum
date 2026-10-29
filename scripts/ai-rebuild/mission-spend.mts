import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync } from "node:fs";
import { EvaluationSpendLedger, initializeSpendLedger } from "./spend-ledger.mts";
import { EVALUATION_CANDIDATE } from "./budget.mts";

const directory = fileURLToPath(new URL("../../.altum-evaluation/shopify-rebuild/", import.meta.url));
export const MISSION_SPEND_PATH = join(directory, "usd3.sqlite");
const markerPath = join(directory, "authorization-consumed.json");
const marker = { scope: "altum-shopify-rebuild-2026-10-19-usd3", capMicrousd: 3_000_000,
  model: EVALUATION_CANDIDATE.model, workspace: fileURLToPath(new URL("../../", import.meta.url)) };

/** One-time explicit initialization. A missing DB never creates a fresh balance. */
export function initializeMissionSpendOnce() {
  mkdirSync(dirname(MISSION_SPEND_PATH), { recursive: true });
  // Marker survives accidental DB deletion. Never delete either to fix an error.
  const fd = openSync(markerPath, "wx");
  try { writeFileSync(fd, JSON.stringify(marker)); fsyncSync(fd); } finally { closeSync(fd); }
  initializeSpendLedger(MISSION_SPEND_PATH);
  return openMissionSpend();
}
export function openMissionSpend() {
  if (readFileSync(markerPath, "utf8") !== JSON.stringify(marker)) throw new Error("Marcador de autorizacao divergente. Nao iniciar outro saldo.");
  return new EvaluationSpendLedger(MISSION_SPEND_PATH);
}
