import assert from "node:assert/strict";
import test from "node:test";
import { commercialRecordIdentity, commercialPotentialValue, commercialValueCoverage, parseCommercialPotentialValue } from "../lib/crm-commercial-record.ts";

test("unknown estimates remain different from a declared zero and do not revive legacy amounts", () => {
  assert.equal(commercialPotentialValue({}), null);
  assert.equal(commercialPotentialValue({ valorPotencial: 700 }), 700);
  assert.equal(commercialPotentialValue({ potentialValue: null, valorPotencial: 700 }), null);
  assert.equal(commercialPotentialValue({ potentialValue: 0, valorPotencial: 700 }), 0);
  for (const value of [false, "", "200", -1, Infinity, NaN]) assert.equal(commercialPotentialValue({ potentialValue: value }), null);
});
test("totals expose their known and missing denominators, including explicit zero", () => {
  assert.deepEqual(commercialValueCoverage([{ potentialValue: 0 }, { potentialValue: 250 }, { potentialValue: null }, {}]),
    { totalValue: 250, knownValueCount: 2, unknownValueCount: 2 });
  assert.deepEqual(commercialValueCoverage([{ potentialValue: null }]), { totalValue: 0, knownValueCount: 0, unknownValueCount: 1 });
});
test("commercial identity retains exact person identifiers without inventing links", () => {
  assert.deepEqual(commercialRecordIdentity({ contactId: "person_a", recordKind: "opportunity", opportunityTitle: " Recompra " }),
    { contactId: "person_a", recordKind: "opportunity", opportunityTitle: "Recompra" });
  for (const contactId of ["person/other", " person", "x".repeat(221), "person\nother"])
    assert.equal(commercialRecordIdentity({ contactId }).contactId, null);
  assert.deepEqual(commercialRecordIdentity({}), { contactId: null, recordKind: "legacy", opportunityTitle: "" });
});
test("empty human entries mean unknown while malformed, negative and unbounded amounts are rejected", () => {
  for (const value of [undefined, null, "", "  "]) assert.deepEqual(parseCommercialPotentialValue(value), { ok: true, value: null });
  for (const value of [false, true, {}, [], -1, Infinity, NaN, 1e13, "abc"]) assert.deepEqual(parseCommercialPotentialValue(value), { ok: false });
  assert.deepEqual(parseCommercialPotentialValue("0"), { ok: true, value: 0 });
  assert.deepEqual(parseCommercialPotentialValue(250.75), { ok: true, value: 250.75 });
});
