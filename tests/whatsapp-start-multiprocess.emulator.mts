import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const tenantId = `qa_multiprocess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
before(async () => {
  await adminDb.collection("leads").doc(`lead_${tenantId}`).set({ tenantId, telefone: "5511000000077", nome: "Lead ficticio multi-instancia", ownerId: "qa-process-owner" });
  await adminDb.collection("tenant_channels").doc(`channel_${tenantId}`).set({ tenantId, type: "whatsapp", status: "active", channelScope: "shared" });
});
after(async () => {
  for (const collection of ["leads", "tenant_channels", "chats", "chat_identities", "messages", "chat_outbound_jobs", "chat_state", "chat_outbound_locks"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});
type WorkerResult = { ok: boolean; chatId?: string; jobId?: string; stage?: string; code?: number; message?: string };
function launch(signal: AbortSignal, mode = "same", index = 0) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY|CLIENT_EMAIL/.test(key)) delete env[key];
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/whatsapp-start-process-worker.mts", import.meta.url)), tenantId, mode, String(index)], {
    env, stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-1000); });
  child.stdout?.resume();
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  let doneResolve!: (results: WorkerResult[]) => void;
  let doneReject!: (error: Error) => void;
  let reported = false;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const done = new Promise<WorkerResult[]>((resolve, reject) => { doneResolve = resolve; doneReject = reject; });
  void ready.catch(() => {}); void done.catch(() => {});
  const fail = (error: Error) => { readyReject(error); doneReject(error); };
  const abort = () => { fail(new Error("QA process deadline exceeded")); child.kill(); };
  signal.addEventListener("abort", abort, { once: true });
  child.on("message", (value: { type?: string; results?: WorkerResult[] }) => {
    if (value.type === "ready") readyResolve();
    if (value.type === "done") { reported = true; doneResolve(value.results || []); }
  });
  child.on("error", fail);
  const closed = new Promise<void>((resolve, reject) => child.once("close", (code) => {
    signal.removeEventListener("abort", abort);
    if (!reported || code !== 0) {
      const error = new Error(`QA worker exited ${code}: ${stderr}`);
      fail(error); reject(error);
    } else resolve();
  }));
  void closed.catch(() => {});
  return { child, ready, done, closed };
}
test("five independent SDK processes submit twenty starts into one durable operation", { timeout: 180000 }, async (context) => {
  const workers = Array.from({ length: 5 }, () => launch(context.signal));
  try {
    await Promise.all(workers.map((worker) => worker.ready));
    for (const worker of workers) worker.child.send({ type: "run" });
    const results = (await Promise.all(workers.map((worker) => worker.done))).flat();
    await Promise.all(workers.map((worker) => worker.closed));
    const counts: Record<string, number> = {};
    for (const collection of ["chats", "messages", "chat_outbound_jobs"]) counts[collection] = (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).size;
    const failures = results.filter((result) => !result.ok);
    context.diagnostic(JSON.stringify({ independentProcesses: workers.length, submitted: results.length, counts, failures }));
    assert.equal(results.length, 20);
    assert.equal(failures.length, 0, JSON.stringify(failures));
    assert.equal(new Set(results.map((result) => result.chatId)).size, 1);
    assert.equal(new Set(results.map((result) => result.jobId)).size, 1);
    assert.deepEqual(counts, { chats: 1, messages: 1, chat_outbound_jobs: 1 });
  } finally {
    for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill();
    await Promise.allSettled(workers.map((worker) => worker.closed));
  }
});

test("twenty distinct requests from independent processes keep a complete ordered chain", { timeout: 180000 }, async (context) => {
  const baseline = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size;
  const workers = Array.from({ length: 5 }, (_, index) => launch(context.signal, "distinct", index));
  try {
    await Promise.all(workers.map((worker) => worker.ready));
    for (const worker of workers) worker.child.send({ type: "run" });
    const results = (await Promise.all(workers.map((worker) => worker.done))).flat();
    await Promise.all(workers.map((worker) => worker.closed));
    const failures = results.filter((result) => !result.ok);
    context.diagnostic(JSON.stringify({ independentProcesses: workers.length, distinctSubmitted: results.length, failures }));
    assert.equal(results.length, 20);
    assert.equal(failures.length, 0, JSON.stringify(failures));
    assert.equal(new Set(results.map((result) => result.chatId)).size, 1);
    assert.equal(new Set(results.map((result) => result.jobId)).size, 20);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get();
    assert.equal(jobs.size, baseline + 20);
    const byId = new Map(jobs.docs.map((row) => [row.id, row.data()]));
    const ordered = jobs.docs.map((row) => ({ id: row.id, sequence: Number(row.data().sequence) })).sort((left, right) => left.sequence - right.sequence);
    assert.deepEqual(ordered.map((row) => row.sequence), Array.from({ length: baseline + 20 }, (_, index) => index + 1));
    for (let index = 1; index < ordered.length; index += 1) assert.equal(byId.get(ordered[index].id)?.predecessorJobId, ordered[index - 1].id);
    assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, baseline + 20);
  } finally {
    for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill();
    await Promise.allSettled(workers.map((worker) => worker.closed));
  }
});

test("five processes mix twenty text/media operations into the same unbroken chain", { timeout: 180000 }, async (context) => {
  const chatId = `mixed_${tenantId}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp" });
  const workers = Array.from({ length: 5 }, (_, index) => launch(context.signal, "mixed", index));
  try {
    await Promise.all(workers.map((worker) => worker.ready));
    for (const worker of workers) worker.child.send({ type: "run" });
    const results = (await Promise.all(workers.map((worker) => worker.done))).flat();
    await Promise.all(workers.map((worker) => worker.closed));
    const failures = results.filter((result) => !result.ok);
    context.diagnostic(JSON.stringify({ independentProcesses: workers.length, mixedSubmitted: results.length, failures }));
    assert.equal(results.length, 20);
    assert.equal(failures.length, 0, JSON.stringify(failures));
    assert.equal(new Set(results.map((result) => result.jobId)).size, 20);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
    const ordered = jobs.docs.map((row) => ({ id: row.id, sequence: Number(row.data().sequence), kind: row.data().kind, predecessorJobId: row.data().predecessorJobId })).sort((a, b) => a.sequence - b.sequence);
    assert.equal(ordered.filter((row) => row.kind === "text").length, 10);
    assert.equal(ordered.filter((row) => row.kind === "media").length, 10);
    assert.deepEqual(ordered.map((row) => row.sequence), Array.from({ length: 20 }, (_, index) => index + 1));
    assert.equal(ordered[0].predecessorJobId, null);
    for (let index = 1; index < ordered.length; index++) assert.equal(ordered[index].predecessorJobId, ordered[index - 1].id);
    const chat = (await adminDb.collection("chats").doc(chatId).get()).data()!;
    assert.equal(chat.outboundSequence, 20);
    assert.equal(chat.outboundTailJobId, ordered[19].id);
    assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get()).size, 20);
  } finally {
    for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill();
    await Promise.allSettled(workers.map((worker) => worker.closed));
  }
});
