import { EvaluationSpendLedger } from "../../scripts/ai-rebuild/spend-ledger.mts";
const [path, callId, maximum, mode] = process.argv.slice(2);
const ledger = new EvaluationSpendLedger(path);
try {
  ledger.reserve({ callId, fingerprint: "a".repeat(64), maximumMicrousd: Number(maximum) });
  if (mode === "crash") process.exit(71); // OS closes SQLite; durable reserve remains.
  console.log(JSON.stringify({ reserved: true, balance: ledger.snapshot() }));
} catch (error) {
  console.log(JSON.stringify({ reserved: false, error: error instanceof Error ? error.message : "unknown" }));
} finally { ledger.close(); }
