import test from "node:test";
import assert from "node:assert/strict";
import { monthlyPeriodEnd, paidAccessEnd, billingLink, paymentLabel, fiscalLabel } from "../lib/subscription-lifecycle.ts";

test("monthly access preserves the calendar anchor through short months", () => {
  assert.equal(monthlyPeriodEnd("2026-01-31")?.toISOString(), "2026-02-28T03:00:00.000Z");
  assert.equal(monthlyPeriodEnd("2028-01-31")?.toISOString(), "2028-02-29T03:00:00.000Z");
  assert.equal(monthlyPeriodEnd("2026-12-15")?.toISOString(), "2027-01-15T03:00:00.000Z");
});
test("only paid charges extend access; refund and future open invoices do not", () => {
  assert.equal(paidAccessEnd([
    { status: "RECEIVED", dueDate: "2026-08-15" },
    { status: "CONFIRMED", dueDate: "2026-09-15" },
    { status: "PENDING", dueDate: "2026-10-15" },
    { status: "REFUNDED", dueDate: "2026-11-15" },
  ])?.toISOString(), "2026-10-15T03:00:00.000Z");
  assert.equal(paidAccessEnd([{ status: "OVERDUE", dueDate: "2026-09-15" }]), null);
});
test("February does not shift an established month-end subscription anchor", () => {
  assert.equal(paidAccessEnd([{ status: "RECEIVED", dueDate: "2026-01-31" }, { status: "RECEIVED", dueDate: "2026-02-28" }])?.toISOString(), "2026-03-31T03:00:00.000Z");
});
test("billing links reject executable protocols, embedded credentials and malformed URLs", () => {
  for (const value of ["javascript:alert(1)", "http://asaas.com", "https://user:pass@asaas.com", "bad", null]) assert.equal(billingLink(value), null);
  assert.equal(billingLink("https://asaas.com/i/abc"), "https://asaas.com/i/abc");
});
test("financial and fiscal statuses are distinct human descriptions", () => {
  assert.equal(paymentLabel("OVERDUE"), "Em atraso");
  assert.equal(fiscalLabel("AUTHORIZED"), "Emitida");
  assert.equal(paymentLabel("UNKNOWN"), "Em processamento");
});
