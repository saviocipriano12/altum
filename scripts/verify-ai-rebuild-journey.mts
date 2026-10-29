import { readFile } from "node:fs/promises";
import { evaluateShopifyDevelopmentJourney } from "./ai-rebuild/journey-outcome.mts";

// Read-only replay: never loads credentials, starts a handler or calls a model.
const path = process.argv[2];
if (!path || process.argv.length !== 3) throw new Error("Informe somente o artefato JSON de uma jornada de desenvolvimento suportada.");
const outcome = evaluateShopifyDevelopmentJourney(JSON.parse(await readFile(path, "utf8")));
console.log(JSON.stringify(outcome, null, 2));
if (!outcome.objectiveChecksPassed) process.exitCode = 2;
