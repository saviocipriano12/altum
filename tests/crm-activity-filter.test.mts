import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommercialActivity } from "../lib/crm-activity.ts";
import { parseActivityFilters, filterCommercialActivities, activityViewPreference } from "../lib/crm-activity-filter.ts";
const now = new Date("2026-10-23T01:00:00Z");
function filters(query = "") { return parseActivityFilters(new URLSearchParams(query)); }
const rows = [
  normalizeCommercialActivity("task", "call", { title: "Ligação de confirmação", status: "pending", dueAt: "2026-10-23T00:30:00Z", ownerUserId: "seller" }, { nome: "João" }),
  normalizeCommercialActivity("task", "future", { title: "Proposta", status: "pending", dueAt: "2026-10-23T13:00:00Z", ownerUserId: "peer" }),
  normalizeCommercialActivity("task", "plan", { title: "Planejar retorno", status: "pending" }, { ownerId: "seller" }),
  normalizeCommercialActivity("task", "closed", { title: "Já atendido", status: "done", dueAt: "2026-10-21T13:00:00Z", ownerUserId: "seller" }),
];
test("today uses the seller's timezone rather than the server calendar", () => {
  assert.deepEqual(filterCommercialActivities(rows, filters("due=today&timeZone=America/Sao_Paulo"), "seller", now).map(row => row.recordId), ["call"]);
  assert.deepEqual(filterCommercialActivities(rows, filters("due=today&timeZone=UTC"), "seller", now).map(row => row.recordId), ["call", "future"]);
});
test("overdue excludes concluded returns and never invents a deadline for undated ones", () => {
  assert.deepEqual(filterCommercialActivities(rows, filters("due=overdue"), "seller", now).map(row => row.recordId), ["call"]);
  assert.deepEqual(filterCommercialActivities(rows, filters("due=undated"), "seller", now).map(row => row.recordId), ["plan"]);
});
test("mine honors the normalized legacy responsible seller, without selecting another seller", () => {
  assert.deepEqual(filterCommercialActivities(rows, filters("owner=mine&status=pending"), "seller", now).map(row => row.recordId), ["call", "plan"]);
  assert.equal(filterCommercialActivities(rows, filters("owner=mine"), "unknown", now).length, 0);
});
test("search combines with filters and handles accented customer names and titles", () => {
  assert.deepEqual(filterCommercialActivities(rows, filters("q=joao&status=pending&owner=mine"), "seller", now).map(row => row.recordId), ["call"]);
  assert.equal(filterCommercialActivities(rows, filters("q=confirmacao"), "seller", now).length, 1);
  assert.equal(filterCommercialActivities(rows, filters("q=joao&status=done"), "seller", now).length, 0);
});
test("invalid filters and timezones fail explicitly instead of widening the result", () => {
  for (const query of ["status=closed", "owner=peer", "due=tomorrow", "timeZone=invalid/timezone", `q=${"a".repeat(121)}`]) assert.throws(() => filters(query));
  assert.equal(filterCommercialActivities(rows, filters(), "seller", now).length, rows.length);
});
test("saved view preferences whitelist choices without persisting search or customer data", () => {
  assert.deepEqual(activityViewPreference(JSON.stringify({ status: "done", owner: "mine", due: "today", q: "private customer" })), { status: "done", owner: "mine", due: "today" });
  for (const input of [null, "invalid", "[]", '{"status":"foreign"}', "{}", '"pending"']) assert.deepEqual(activityViewPreference(input), { status: "pending", owner: "all", due: "all" });
});
