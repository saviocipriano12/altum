import { initializeMissionSpendOnce, openMissionSpend, MISSION_SPEND_PATH } from "./ai-rebuild/mission-spend.mts";
if (process.argv.slice(2).some(arg => arg !== "--initialize-once")) throw new Error("Opcao nao permitida; caminho e teto nao podem ser sobrescritos.");
const ledger = process.argv.includes("--initialize-once") ? initializeMissionSpendOnce() : openMissionSpend();
try { console.log(JSON.stringify({ ledger: MISSION_SPEND_PATH, ...ledger.snapshot(), paidCallsExecutedByThisCommand: 0 }, null, 2)); }
finally { ledger.close(); }
