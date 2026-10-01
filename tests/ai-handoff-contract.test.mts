import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("every resolved handoff passes an explicit handoff plan to CRM actions", async () => {
  const source = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /plan:\s*\{\s*\.\.\.plannerDecision,\s*decision:\s*"handoff",\s*stateAfter:\s*"handoff",\s*reason:\s*plannerDecision\.reason \|\| choice\.reason/s
  );
});

test("copilot keeps commercial actions suppressed but still creates a safety handoff task", async () => {
  const source = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");

  assert.match(source, /if \(isCopilot\) \{\s*if \(input\.plan\.decision !== "handoff"\) return \["copilot_actions_suppressed"\]/s);
  assert.match(source, /title: "Assumir handoff solicitado pela IA",\s*type: "handoff",\s*priority: "high"/s);
  assert.match(source, /return \["copilot_actions_suppressed", "handoff_to_human", "notify_internal_team"\]/);
});
