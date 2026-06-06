import test from "node:test";
import assert from "node:assert/strict";
import { buildOutboundJobSchedule } from "../lib/server/outbound-scheduling.ts";

test("outbound schedule splits contacts by rate and spaces jobs by one minute", () => {
  const startsAt = new Date("2026-06-06T12:00:00.000Z");
  const jobs = buildOutboundJobSchedule({
    leadIds: ["a", "b", "c", "d", "e"],
    sendRatePerMinute: 2,
    startsAt,
  });

  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((job) => job.leadIds), [["a", "b"], ["c", "d"], ["e"]]);
  assert.deepEqual(
    jobs.map((job) => job.dueAt.toISOString()),
    [
      "2026-06-06T12:00:00.000Z",
      "2026-06-06T12:01:00.000Z",
      "2026-06-06T12:02:00.000Z",
    ]
  );
});

test("outbound schedule removes duplicate and empty lead ids and clamps rate", () => {
  const jobs = buildOutboundJobSchedule({
    leadIds: ["a", " ", "a", "b"],
    sendRatePerMinute: 999,
    startsAt: new Date("2026-06-06T12:00:00.000Z"),
  });

  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0]?.leadIds, ["a", "b"]);
});
