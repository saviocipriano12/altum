import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("aprovação inicia a renderização no servidor, sem depender do navegador", () => {
  const route = readFileSync(join(process.cwd(), "app/api/admin/agent-os/approvals/route.ts"), "utf8");
  const command = readFileSync(join(process.cwd(), "app/admin/comando/page.tsx"), "utf8");
  assert.match(route, /processAutomaticCreativeContinuations\(\{ jobId: creativeJobId, limit: 1 \}\)/);
  assert.doesNotMatch(command, /payload\.creativeJobId\) await runCreative/);
});
