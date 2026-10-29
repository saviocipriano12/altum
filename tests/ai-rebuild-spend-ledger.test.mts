import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { EvaluationSpendLedger, initializeSpendLedger } from "../scripts/ai-rebuild/spend-ledger.mts";

const workerPath = fileURLToPath(new URL("./fixtures/ai-rebuild-spend-worker.mts", import.meta.url));
async function fixture(action: (path: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "altum-spend-ledger-"));
  const path = join(directory, "test.sqlite");
  try { initializeSpendLedger(path); await action(path); }
  finally {
    const target = resolve(directory), allowed = resolve(tmpdir());
    assert.ok(target.startsWith(`${allowed}\\`) || target.startsWith(`${allowed}/`));
    assert.ok(target.includes("altum-spend-ledger-"));
    await rm(target, { recursive: true }); // Only a just-created isolated test directory.
  }
}
function child(path: string, id: string, maximum: number, mode = "reserve") {
  return new Promise<{ code: number | null; output: string }>((resolveChild, reject) => {
    const processChild = spawn(process.execPath, ["--import", "tsx", workerPath, path, id, String(maximum), mode], { windowsHide: true });
    let output = "", errors = "";
    processChild.stdout.on("data", data => output += String(data));
    processChild.stderr.on("data", data => errors += String(data));
    processChild.once("error", reject);
    processChild.once("exit", code => code === 0 || code === 71 ? resolveChild({ code, output }) : reject(new Error(errors)));
  });
}
test("cumulative balance survives close/reopen; receipt releases only unused reservation and cannot change", async () => fixture(async path => {
  let ledger = new EvaluationSpendLedger(path);
  ledger.reserve({ callId: "one", fingerprint: "a".repeat(64), maximumMicrousd: 1_000_000 });
  ledger.close(); ledger = new EvaluationSpendLedger(path);
  try {
    assert.equal(ledger.snapshot().remainingMicrousd, 2_000_000);
    ledger.settle({ callId: "one", actualMicrousd: 120_000, receiptId: "receipt-1" });
    assert.equal(ledger.snapshot().remainingMicrousd, 2_880_000);
    assert.equal(ledger.settle({ callId: "one", actualMicrousd: 120_000, receiptId: "receipt-1" }).calls, 1);
    assert.throws(() => ledger.settle({ callId: "one", actualMicrousd: 0, receiptId: "changed" }), /conflitante/);
    assert.throws(() => ledger.reserve({ callId: "one", fingerprint: "a".repeat(64), maximumMicrousd: 1 }), /nao repetir/);
  } finally { ledger.close(); }
}));
test("parallel independent processes cannot reserve more than the cumulative USD 3", async () => fixture(async path => {
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => child(path, `parallel-${i}`, 750_000)));
  assert.equal(results.filter(row => JSON.parse(row.output).reserved).length, 4);
  const ledger = new EvaluationSpendLedger(path);
  try { assert.equal(ledger.snapshot().committedMicrousd, 3_000_000); assert.equal(ledger.snapshot().remainingMicrousd, 0); }
  finally { ledger.close(); }
}));
test("process death after reserve and lost acknowledgement never refund or renew the allowance", async () => fixture(async path => {
  assert.equal((await child(path, "crashed", 2_000_000, "crash")).code, 71);
  const ledger = new EvaluationSpendLedger(path);
  try {
    assert.equal(ledger.markUncertain("crashed").remainingMicrousd, 1_000_000);
    assert.throws(() => ledger.reserve({ callId: "retry", fingerprint: "b".repeat(64), maximumMicrousd: 1_000_001 }), /insuficiente/);
    assert.throws(() => ledger.reserve({ callId: "crashed", fingerprint: "a".repeat(64), maximumMicrousd: 1 }), /nao repetir/);
    assert.throws(() => ledger.reserve({ callId: "crashed", fingerprint: "b".repeat(64), maximumMicrousd: 1 }), /outro payload/);
  } finally { ledger.close(); }
}));
test("invalid values, missing ledger and repeated bootstrap cannot create fresh spending authority", async () => fixture(async path => {
  assert.throws(() => initializeSpendLedger(path));
  assert.throws(() => new EvaluationSpendLedger(`${path}-missing`));
  const ledger = new EvaluationSpendLedger(path);
  try {
    for (const value of [0, -1, 0.5, Infinity]) assert.throws(() => ledger.reserve({ callId: "bad", fingerprint: "a".repeat(64), maximumMicrousd: value }));
    assert.equal(ledger.snapshot().committedMicrousd, 0);
  } finally { ledger.close(); }
  const corrupt = `${path}-corrupt`; await writeFile(corrupt, "not a database");
  assert.throws(() => new EvaluationSpendLedger(corrupt));
}));
test("unexpected provider cost is recorded and freezes further calls instead of hiding an overrun", async () => fixture(async path => {
  const ledger = new EvaluationSpendLedger(path);
  try {
    ledger.reserve({ callId: "overrun", fingerprint: "a".repeat(64), maximumMicrousd: 100 });
    const state = ledger.settle({ callId: "overrun", actualMicrousd: 101, receiptId: "unexpected-provider-rate" });
    assert.equal(state.frozenReason, "provider_cost_exceeded_reservation");
    assert.equal(state.confirmedMicrousd, 101);
    assert.throws(() => ledger.reserve({ callId: "next", fingerprint: "b".repeat(64), maximumMicrousd: 1 }), /congelado/);
  } finally { ledger.close(); }
}));
