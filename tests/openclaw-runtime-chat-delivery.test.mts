import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("eventos do runtime preservam o dono ao entregar atualização no Comando", () => {
  const source = readFileSync(join(process.cwd(), "app", "api", "internal", "agent-runtime", "events", "route.ts"), "utf8");
  assert.match(source, /ownerId: typeof mission\.get\("createdBy"\)/);
  assert.match(source, /if \(conversationId && ownerId && \(message \|\|/);
  assert.match(source, /transaction\.set\(messageRef,/);
  assert.match(source, /activeDispatchId !== event\.dispatchId/);
  assert.match(source, /runtime_dispatch_superseded/);
  assert.match(source, /terminalDispatchStatuses\.includes/);
  assert.match(source, /"completed", "failed", "cancelled", "reconciled"/);
  assert.match(source, /agent_command_messages/);
  assert.match(source, /event\.artifacts\?\.length/);
  assert.match(source, /transaction\.set\(adminDb\.collection\("audit_logs"\)/);
  assert.doesNotMatch(source, /await adminDb\.collection\("audit_logs"\)\.add/);
});

test("fila OpenClaw recupera somente claims antigos com limite de tentativas", () => {
  const source = readFileSync(join(process.cwd(), "app", "api", "internal", "agent-runtime", "missions", "next", "route.ts"), "utf8");
  assert.match(source, /Date\.now\(\) - 15 \* 60 \* 1_000/);
  assert.match(source, /\.where\("status", "==", "claimed"\)/);
  assert.match(source, /attempts >= 3/);
  assert.match(source, /status: "needs_reconciliation"/);
  assert.match(source, /reconciliationRequiredAt/);
  assert.match(source, /reconciliationStatus: "pending_operator_review"/);
  assert.match(source, /lastReclaimedAt/);
  assert.match(source, /transaction\.get\(candidate\.ref\)/);
});
