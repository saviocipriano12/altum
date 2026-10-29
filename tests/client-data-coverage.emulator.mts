import assert from "node:assert/strict";
import { after, before, test } from "node:test";

Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { adminDb: db, adminAuth: auth } = await import("../app/lib/server/firebase-admin.ts");
const { GET: search } = await import("../app/api/tenant/[tenantId]/search/route.ts");
const { GET: metrics } = await import("../app/api/tenant/[tenantId]/metrics-summary/route.ts");
const { GET: followUps } = await import("../app/api/tenant/[tenantId]/follow-ups/route.ts");
const { POST: ask } = await import("../app/api/tenant/[tenantId]/business-insights/ask/route.ts");
const { GET: appointments, POST: createAppointment } = await import("../app/api/tenant/[tenantId]/appointments/route.ts");
const { PATCH: patchAppointment } = await import("../app/api/tenant/[tenantId]/appointments/[appointmentId]/route.ts");
const suffix = Date.now().toString();
const tenantId = `qa_coverage_${suffix}`, ownerId = `${tenantId}_owner`, agentId = `${tenantId}_agent`;
const email = `${ownerId}@example.invalid`, password = "CoverageLocalOnly123!";
let ownerToken = "", agentToken = "";
const startAt = "2027-03-01T13:00:00.000Z", endAt = "2027-03-01T14:00:00.000Z";
const now = new Date();
const collections = ["leads", "chats", "appointments", "lead_tasks", "orcamentos", "financeiro"];
async function seed(collection: string, count: number, make: (i: number) => Record<string, unknown>) {
  for (let offset = 0; offset < count; offset += 400) {
    const batch = db.batch();
    for (let i = offset; i < Math.min(offset + 400, count); i++) batch.set(db.collection(collection).doc(`${tenantId}_${String(i).padStart(5, "0")}`), { tenantId, ...make(i) });
    await batch.commit();
  }
}
async function login(address: string) {
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password, returnSecureToken: true }), signal: AbortSignal.timeout(10000),
  });
  assert.equal(res.status, 200);
  return (await res.json()).idToken as string;
}
function request(path: string, token = ownerToken, body?: Record<string, unknown>, method = "POST") {
  return new Request(`http://127.0.0.1/api/tenant/${tenantId}/${path}`, {
    method: body ? method : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const context = () => ({ params: Promise.resolve({ tenantId }) });

before(async () => {
  await db.collection("tenants").doc(tenantId).set({ name: "Fictícia QA" });
  for (const [uid, role] of [[ownerId, "client_owner"], [agentId, "client_agent"]]) {
    await auth.createUser({ uid, email: `${uid}@example.invalid`, emailVerified: true, password });
    await db.collection("users").doc(uid).set({ uid, email: `${uid}@example.invalid`, name: "QA", role, status: "active" });
    await db.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role, status: "active" });
  }
  ownerToken = await login(email); agentToken = await login(`${agentId}@example.invalid`);
  await seed("leads", 801, i => ({ nome: i === 800 ? "EncontrarFinal" : `Cliente ${i}`, ownerId: i === 800 ? agentId : ownerId, createdAt: now, pipelineStage: "captado" }));
  await seed("chats", 401, i => ({ contactName: i === 400 ? "EncontrarFinal" : `Conversa ${i}`, assignedTo: i === 400 ? agentId : ownerId, createdAt: now, status: "open" }));
  await seed("appointments", 501, i => ({ title: `Agenda ${i}`, startAt, endAt, status: "scheduled", ownerUserId: i === 500 ? ownerId : `other_${i}` }));
  await seed("lead_tasks", 301, i => ({ title: i === 300 ? "TarefaFinalUnica" : `Tarefa ${i}`, leadId: `${tenantId}_00800`, status: "pending" }));
  await seed("orcamentos", 201, i => ({ titulo: i === 200 ? "EncontrarFinal" : `Proposta ${i}`, leadId: `${tenantId}_00800` }));
  await seed("financeiro", 401, i => ({ descricao: i === 400 ? "EncontrarFinal" : `Financeiro ${i}`, leadId: `${tenantId}_00800`, tipo: "Receita", status: "pendente", createdAt: now }));
});
after(async () => {
  for (const name of collections) {
    const snap = await db.collection(name).where("tenantId", "==", tenantId).get();
    for (let i = 0; i < snap.size; i += 400) {
      const batch = db.batch(); snap.docs.slice(i, i + 400).forEach(doc => batch.delete(doc.ref)); await batch.commit();
    }
  }
  for (const uid of [ownerId, agentId]) {
    await db.collection("users").doc(uid).delete(); await db.collection("tenant_users").doc(`${tenantId}_${uid}`).delete();
    await auth.deleteUser(uid);
  }
  await db.collection("tenants").doc(tenantId).delete(); await db.terminate();
});

test("actual search route finds records beyond previous collection cutoffs", async () => {
  const response = await search(request("search?q=EncontrarFinal"), context());
  assert.equal(response.status, 200); const data = await response.json();
  for (const key of ["leads", "chats", "budgets", "finance"]) assert.equal(data[key].length, 1, key);
  const tasks = await search(request("search?q=TarefaFinalUnica"), context());
  assert.equal(tasks.status, 200);
  assert.equal((await tasks.json()).tasks[0].id, `${tenantId}_00300`);
});
test("late-page access remains restricted to the assigned seller", async () => {
  const response = await search(request("search?q=Cliente", agentToken), context());
  assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.leads.length, 0);
  const own = await search(request("search?q=EncontrarFinal", agentToken), context());
  const visible = await own.json(); assert.equal(visible.leads.length, 1); assert.equal(visible.budgets.length, 1);
});
test("metrics count leads and conversations beyond previous limits", async () => {
  const response = await metrics(request("metrics-summary"), context());
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.metrics.totalLeads, 801); assert.equal(data.metrics.conversations, 401);
});
test("follow-ups include the 301st task", async () => {
  const response = await followUps(request("follow-ups"), context());
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.summary.total, 301);
  assert.ok(data.items.some((item: { id: string }) => item.id === `${tenantId}_00300`));
});
test("business questions use the full authorized base without any external model request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("EXTERNAL_REQUEST_BLOCKED_IN_QA");
    return originalFetch(input, init);
  };
  try {
    const response = await ask(request("business-insights/ask", ownerToken, { question: "Quantos clientes temos na carteira?" }), context());
    assert.equal(response.status, 200); const data = await response.json();
    assert.equal(data.metrics.leads, 801);
  } finally { globalThis.fetch = originalFetch; }
});
test("agenda lists all 501 appointments and detects a conflict on the last page", async () => {
  const response = await appointments(request("appointments"), context());
  assert.equal(response.status, 200); assert.equal((await response.json()).items.length, 501);
  const conflict = await createAppointment(request("appointments", ownerToken, { title: "Conflito QA", startAt, endAt }), context());
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).conflictId, `${tenantId}_00500`);
});
test("invalid dates are rejected without creating or corrupting an appointment", async () => {
  const invalid = await createAppointment(request("appointments", ownerToken, { title: "Inválido QA", startAt, endAt: "2027-03-01T12:00:00.000Z" }), context());
  assert.equal(invalid.status, 400);
  const appointmentId = `${tenantId}_00500`;
  const patched = await patchAppointment(request(`appointments/${appointmentId}`, ownerToken, { startAt: "not-a-date" }, "PATCH"), { params: Promise.resolve({ tenantId, appointmentId }) });
  assert.equal(patched.status, 400); assert.equal((await db.collection("appointments").doc(appointmentId).get()).data()?.startAt, startAt);
});
test("missing authentication and unrelated tenant remain forbidden", async () => {
  const missing = await search(new Request("http://127.0.0.1/search?q=EncontrarFinal"), context()); assert.equal(missing.status, 401);
  const other = await search(request("search?q=EncontrarFinal"), { params: Promise.resolve({ tenantId: `${tenantId}_other` }) });
  assert.equal(other.status, 403);
});
