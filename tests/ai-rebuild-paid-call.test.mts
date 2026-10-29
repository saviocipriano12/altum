import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { initializeSpendLedger, EvaluationSpendLedger } from "../scripts/ai-rebuild/spend-ledger.mts";
import { executeBudgetedEvaluationCall, MAX_CALL_RESERVATION_MICROUSD, type PaidEvaluationCall } from "../scripts/ai-rebuild/paid-model-call.mts";
import { developmentCorpus, corpusCaseHash } from "../scripts/ai-rebuild/corpus.mts";
import { EVALUATION_CANDIDATE } from "../scripts/ai-rebuild/budget.mts";
const scenario = developmentCorpus()[0];
function input(): PaidEvaluationCall { return { callId: "test-paid-boundary", caseId: scenario.scenario.id,
  caseHash: corpusCaseHash(scenario), syntheticData: true, messages: [{ role: "user", content: "Synthetic JSON test" }] }; }
async function fixture(action: (ledger: EvaluationSpendLedger) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "altum-paid-boundary-")), path = join(directory, "ledger.sqlite");
  initializeSpendLedger(path); const ledger = new EvaluationSpendLedger(path);
  try { await action(ledger); } finally {
    ledger.close(); const target = resolve(directory), base = resolve(tmpdir());
    assert.ok(target.startsWith(`${base}\\`) || target.startsWith(`${base}/`)); assert.ok(target.includes("altum-paid-boundary-"));
    await rm(target, { recursive: true });
  }
}
test("transport sees committed reserve, pinned model/output/tier and settles reported tokens only", async () => fixture(async ledger => {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(ledger.snapshot().committedMicrousd, MAX_CALL_RESERVATION_MICROUSD);
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, EVALUATION_CANDIDATE.model); assert.equal(body.max_completion_tokens, 1500);
    assert.equal(body.service_tier, "default"); assert.equal(body.store, false); assert.equal(body.n, 1);
    assert.equal(body.tools, undefined); assert.equal(options?.redirect, "error");
    return Response.json({ id: "chatcmpl-fixture-1", model: body.model, usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [] });
  };
  const result = await executeBudgetedEvaluationCall(input(), { ledger, transport, apiKey: "fake-not-real" });
  assert.equal(result.receipt.chargedUpperBoundMicrousd, 72); assert.equal(result.balance.outstanding, 0);
  await assert.rejects(executeBudgetedEvaluationCall(input(), { ledger, transport, apiKey: "fake-not-real" }), /nao repetir/);
  assert.equal(calls, 1);
}));
test("no credential, holdout/unknown case, changed revision and unsupported payload fail before reservation", async () => fixture(async ledger => {
  const transport: typeof fetch = async () => { throw new Error("Must not dispatch"); };
  await assert.rejects(executeBudgetedEvaluationCall(input(), { ledger, transport, apiKey: "" }), /Chave/);
  await assert.rejects(executeBudgetedEvaluationCall({ ...input(), caseId: "unknown-reserved-case" }, { ledger, transport, apiKey: "fake" }), /desenvolvimento/);
  await assert.rejects(executeBudgetedEvaluationCall({ ...input(), caseHash: "changed" }, { ledger, transport, apiKey: "fake" }), /revisao/);
  assert.equal(ledger.snapshot().calls, 0);
}));
test("timeout and invalid/missing usage keep full reservation without automatic retry", async () => fixture(async ledger => {
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; throw new Error("simulated unknown result"); };
  await assert.rejects(executeBudgetedEvaluationCall(input(), { ledger, transport, apiKey: "fake" }), /unknown/);
  assert.equal(ledger.snapshot().committedMicrousd, MAX_CALL_RESERVATION_MICROUSD);
  assert.equal(ledger.snapshot().outstanding, 1); assert.equal(calls, 1);
  const missing: typeof fetch = async () => Response.json({ id: "no-usage", model: EVALUATION_CANDIDATE.model });
  await assert.rejects(executeBudgetedEvaluationCall({ ...input(), callId: "missing-usage" }, { ledger, transport: missing, apiKey: "fake" }), /Recibo/);
  assert.equal(ledger.snapshot().committedMicrousd, MAX_CALL_RESERVATION_MICROUSD * 2);
}));
test("insufficient cumulative balance never reaches the transport", async () => fixture(async ledger => {
  ledger.reserve({ callId: "previous-usage", fingerprint: "a".repeat(64), maximumMicrousd: 3_000_000 });
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; return Response.json({}); };
  await assert.rejects(executeBudgetedEvaluationCall(input(), { ledger, transport, apiKey: "fake" }), /insuficiente/);
  assert.equal(calls, 0);
}));
