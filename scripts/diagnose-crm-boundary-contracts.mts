import { mkdir, writeFile } from "node:fs/promises";
import { validateCommercialExtraction, type SemanticMessage } from "../lib/server/crm/semantic-extraction.ts";
import { commercialReadStatus } from "../lib/crm-read-state.ts";
const cases = [
  { id: "correct_declaration", text: "Meu orçamento é 5000 reais", field: "budgetBand", value: "5000 reais", shouldAccept: true },
  { id: "negated_interest", text: "Não tenho interesse em CRM", field: "serviceInterest", value: "CRM", shouldAccept: false },
  { id: "withdrawn_budget", text: "Meu orçamento é 5000 reais, mas retiro essa informação.", field: "budgetBand", value: "5000 reais", shouldAccept: false },
  { id: "third_party_quote", text: "Meu sócio falou: meu orçamento é 5000 reais. Ainda não defini o meu.", field: "budgetBand", value: "5000 reais", shouldAccept: false },
  { id: "hypothesis", text: "Se meu orçamento é 5000 reais, podemos simular.", field: "budgetBand", value: "5000 reais", shouldAccept: false },
  { id: "missing_currency", text: "Meu orçamento é 2000 dólares", field: "budgetBand", value: "2000", shouldAccept: false },
  { id: "invented_value", text: "Meu orçamento é 5000 reais", field: "budgetBand", value: "9000 reais", shouldAccept: false },
  { id: "seller_not_buyer", text: "Meu orçamento é 5000 reais", field: "budgetBand", value: "5000 reais", shouldAccept: false, sender: "agent" as const },
  { id: "low_confidence", text: "Meu orçamento é 5000 reais", field: "budgetBand", value: "5000 reais", shouldAccept: false, confidence: 0.4 },
  { id: "wrong_source", text: "Meu orçamento é 5000 reais", field: "budgetBand", value: "5000 reais", shouldAccept: false, messageId: "invented" },
];
const validation = cases.map(row => {
  const messages: SemanticMessage[] = [{ id: "source", sender: row.sender || "client", kind: "text", text: row.text }];
  const result = validateCommercialExtraction({ facts: [{ field: row.field, value: row.value, excerpt: row.text, messageId: row.messageId || "source", confidence: row.confidence ?? 1 }] }, messages);
  return { ...row, actualAccepted: result.facts.length > 0, result, safetyPassed: (result.facts.length > 0) === row.shouldAccept };
});
const readStatuses = ["not_enabled", "disabled", "outside_scope", "budget_exhausted", "provider_unavailable", "completed", "cached", "failed", "review_required", "unknown_future_status"].map(semanticStatus => ({
  semanticStatus, actual: commercialReadStatus({ mediaType: "text", mediaError: false, mediaInterpreted: false, semanticStatus }), semanticSuccess: ["completed", "cached"].includes(semanticStatus) }));
await mkdir(".qa-artifacts/crm-deep-diagnostic", { recursive: true });
await writeFile(".qa-artifacts/crm-deep-diagnostic/boundary-contracts.json", JSON.stringify({ at: new Date().toISOString(), faultInjection: true, liveProvider: false,
  explanation: "Deliberately wrong model output tests defensive validation, not model error frequency. Literal citation alone is not semantic truth.", validation, readStatuses }, null, 2));
console.log(JSON.stringify({ validationChecks: validation.length, safetyPassed: validation.filter(row => row.safetyPassed).length, acceptedWrongMeaning: validation.filter(row => !row.safetyPassed).map(row => row.id), readStatuses }));
