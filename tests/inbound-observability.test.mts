import assert from "node:assert/strict";
import test from "node:test";
import {
  getInboundEventMetricDocId,
  normalizeInboundEventMetric,
} from "../lib/server/messaging/inbound-observability.ts";

test("inbound metric ids do not expose tenant ids and stay stable", () => {
  const first = getInboundEventMetricDocId("tenant-sensitive-name", "2026-10-10");
  const repeated = getInboundEventMetricDocId("tenant-sensitive-name", "2026-10-10");
  const other = getInboundEventMetricDocId("other-tenant", "2026-10-10");
  assert.equal(first, repeated);
  assert.notEqual(first, other);
  assert.doesNotMatch(first, /sensitive/);
});

test("inbound metrics bound reason and attachment cardinality", () => {
  const metric = normalizeInboundEventMetric({
    tenantId: "tenant-a",
    channel: "whatsapp",
    outcome: "invalid",
    reason: "Missing Provider ID / Timestamp",
    deliveryClass: "future clock skew",
    attachmentCount: 999,
    date: new Date("2026-10-10T12:00:00.000Z"),
  });
  assert.equal(metric.reason, "missing_provider_id_timestamp");
  assert.equal(metric.deliveryClass, "future_clock_skew");
  assert.equal(metric.attachmentCount, 12);
  assert.equal(metric.dateRef, "2026-10-10");
});
