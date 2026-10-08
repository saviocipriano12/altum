import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "app", "api", "admin", "agent-os", "creative-jobs", "[jobId]", "execute", "route.ts"), "utf8");

test("render manual claims queued job transactionally before charging provider", () => {
  const claim = source.indexOf('adminDb.runTransaction(async (transaction)');
  const execution = source.indexOf('await executeCreativeJobWithFallback');
  assert.ok(claim > -1 && claim < execution);
  assert.match(source, /current\.get\("status"\) !== "queued"/);
  assert.match(source, /job_already_claimed/);
  assert.match(source, /transaction\.set\(jobRef/);
});

test("manual refresh shares worker lease and preserves submitted jobs on transient outages", () => {
  assert.match(source, /job_refresh_busy/);
  assert.match(source, /pollLockUntil: new Date\(Date\.now\(\) \+ 90_000\)/);
  assert.match(source, /if \(refresh\) \{[\s\S]*?pollLockUntil: null, nextPollAt: new Date\(Date\.now\(\) \+ 30_000\)/);
});

test("refresh polls the connection which actually submitted the generation", () => {
  assert.match(source, /candidates\.find\(\(item\) => item\.id === job\.connectionId\)/);
  assert.match(source, /provider_connection_missing/);
  assert.match(source, /refreshCreativeJob\(primaryConnection/);
});
