import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");

test("Agent OS collections are explicitly unavailable to direct Firestore clients", () => {
  for (const collection of [
    "agent_missions",
    "agent_tasks",
    "agent_approvals",
    "agent_domain_events",
    "agent_mission_evidence",
    "agent_objectives",
    "agent_programs",
    "agent_runtime_dispatches",
    "agent_runtime_events",
    "agent_task_executions",
    "tool_connections",
    "tool_providers",
  ]) {
    assert.match(
      rules,
      new RegExp(
        `match /${collection}/\\{docId\\} \\{ allow read, write: if false; \\}`,
      ),
      `${collection} must remain server-only`,
    );
  }
});
