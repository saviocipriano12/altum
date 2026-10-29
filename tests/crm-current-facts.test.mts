import assert from "node:assert/strict";
import test from "node:test";
import { commercialFieldDefinitions, currentCommercialField, type CommercialField } from "../lib/crm-current-facts.ts";
import { commercialEvidenceFacts } from "../lib/crm-field-evidence.ts";

test("every current field overrides all memory fallbacks, including deliberate empty and null", () => {
  for (const field of Object.keys(commercialFieldDefinitions) as CommercialField[]) {
    const key = commercialFieldDefinitions[field].custom;
    for (const value of ["Valor conferido", "", null, 0]) {
      const result = currentCommercialField({ customFields: { [key]: value }, aiMemory: { [field]: "Memória antiga" } }, field, ["Outro alias"]);
      assert.deepEqual(result, { value: value === null ? "" : String(value), authoritative: true }, `${field}: ${value}`);
    }
  }
});
test("unmigrated records retain a compatibility fallback", () => {
  assert.equal(currentCommercialField({ aiMemory: { budgetBand: "3000 reais" } }, "budgetBand").value, "3000 reais");
  assert.equal(currentCommercialField({ customFields: { budget: 1500 } }, "budgetBand").value, "1500");
  assert.equal(currentCommercialField({ aiFieldEvidence: { budgetBand: { value: "2000 reais" } } }, "budgetBand").value, "2000 reais");
});
test("manual proof fences a missing CRM projection even after automatic updates are released", () => {
  const lead = { aiMemory: { budgetBand: "9000 reais" }, aiFieldEvidence: { "custom.orcamento": { source: "manual", value: "", automaticUpdates: true } } };
  assert.deepEqual(currentCommercialField(lead, "budgetBand"), { value: "", authoritative: true });
});
test("UI cannot revive an old quote after empty, null or numeric zero edits", () => {
  for (const value of ["", null, 0]) {
    const facts = commercialEvidenceFacts({ customFields: { orcamento: value }, aiFieldEvidence: {
      budgetBand: { value: "9000 reais", excerpt: "Tenho 9000 reais" },
      "custom.orcamento": { value: "9000 reais", excerpt: "Tenho 9000 reais", source: "customer_message" },
    } });
    if (value === 0) { assert.equal(facts[0].value, "0"); assert.equal(facts[0].excerpt, ""); }
    else assert.deepEqual(facts, []);
  }
});
test("an objective or an active topic cannot silently become a purchase interest", () => {
  assert.deepEqual(commercialEvidenceFacts({ aiFieldEvidence: { primaryGoal: { value: "Melhorar atendimento" }, activeTopic: { value: "Suporte" } } }), []);
});
