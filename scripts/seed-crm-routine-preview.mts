import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import net from "node:net";
import { commercialTaskIndexMatches, withCommercialTaskIndex } from "../lib/crm-task-index.ts";

// No configurable production target. This fixture owns only its separate demo tenant.
Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
for (const port of [8080, 9099]) await new Promise<void>((resolve, reject) => {
  const socket = net.connect({ host: "127.0.0.1", port }); socket.setTimeout(1500);
  socket.on("connect", () => { socket.destroy(); resolve(); });
  socket.on("error", reject); socket.on("timeout", () => { socket.destroy(); reject(Error(`Missing local emulator ${port}`)); });
});
const projectId = "demo-altum-qa-lab", tenantId = "qa_crm_routine_preview_20261022", fixture = "crm-routine-preview-v1";
const uid = `${tenantId}_owner`, email = "crmrotina@qa.invalid", password = "AltumDemo2026!";
const app = initializeApp({ projectId }, "crm-routine-preview"), db = getFirestore(app), auth = getAuth(app);
try {
  try { const user = await auth.getUser(uid); if (user.email !== email) throw Error("Unexpected demo identity; refusing replacement"); }
  catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found")) throw error;
    await auth.createUser({ uid, email, password, emailVerified: true, displayName: "Vendedor · demonstração CRM" });
  }
  const root = db.collection("tenants").doc(tenantId), existing = await root.get();
  if (existing.exists) {
    if (existing.data()?.qaFixture !== fixture) throw Error("Unexpected demo tenant; refusing replacement");
    console.log(JSON.stringify({ ready: true, existing: true, preserved: true, projectId, tenantId, email }));
  } else {
    const now = Date.now(), batch = db.batch();
    const put = (collection: string, id: string, data: Record<string, unknown>) => batch.create(db.collection(collection).doc(id), { tenantId, qaFixture: fixture, ...data });
    put("tenants", tenantId, { name: "CRM · Demonstração local", status: "active", billingStatus: "active", accessStatus: "active", clientId: tenantId });
    put("tenant_settings", tenantId, { name: "CRM · Demonstração local", ai: { enabled: false, responsePaused: true } });
    put("users", uid, { uid, email, name: "Vendedor · demonstração CRM", role: "client_owner", status: "active" });
    put("client_portal_users", uid, { uid, email, name: "Vendedor · demonstração CRM", clientId: tenantId, tenantName: "CRM · Demonstração local", role: "client_owner", status: "active" });
    put("tenant_users", `${tenantId}_${uid}`, { userId: uid, email, name: "Vendedor · demonstração CRM", role: "client_owner", status: "active", isDefault: true });
    put("tenant_entitlements", tenantId, { mode: "custom", version: 1, modules: { crm: true, inbox: true, automation: true, whatsapp: true, ai: false }, limits: {}, taskIndexWriteProtocol: 1, taskIndexReadProtocol: 0 });
    const leadId = (index: number) => `${tenantId}_customer_${String(index).padStart(3, "0")}`;
    for (let index = 0; index < 205; index++) put("leads", leadId(index), {
      nome: index === 204 ? "Acácia · cliente fictício sem retorno" : `Cliente fictício ${String(index + 1).padStart(3, "0")}`,
      title: index === 204 ? "Primeira compra" : `Negociação fictícia ${index + 1}`, stage: "contato", pipelineStage: "contato", ownerId: uid, owner: "Vendedor · demonstração CRM", version: 1,
    });
    const titles = ["Confirmar disponibilidade", "Enviar orçamento", "Retornar proposta", "Agendar conversa"];
    for (let index = 0; index < 42; index++) put("lead_tasks", `${tenantId}_task_${String(index).padStart(3, "0")}`, withCommercialTaskIndex({
      leadId: leadId(index % 12), title: `${titles[index % titles.length]} · cliente fictício ${index % 12 + 1}`,
      status: index < 30 ? "pending" : index < 36 ? "done" : index < 40 ? "canceled" : index === 40 ? false : "pending",
      dueAt: index === 41 ? "prazo inválido fictício" : index % 7 === 0 ? null : Timestamp.fromMillis(now + (index - 5) * 3600000),
      ownerUserId: uid, ownerName: "Vendedor · demonstração CRM", version: 1, source: "manual", createdBy: uid, createdAt: Timestamp.fromMillis(now),
    }));
    await batch.commit();
    await db.runTransaction(async tx => {
      const tasks = await tx.get(db.collection("lead_tasks").where("tenantId", "==", tenantId));
      const leads = await tx.get(db.collection("leads").where("tenantId", "==", tenantId));
      const control = await tx.get(db.collection("tenant_entitlements").doc(tenantId));
      if (tasks.size !== 42 || leads.size !== 205 || control.data()?.qaFixture !== fixture ||
        !tasks.docs.every(row => commercialTaskIndexMatches(row.data()))) throw Error("Demo coverage changed; paging remains disabled");
      tx.update(control.ref, { taskIndexReadProtocol: 1, taskIndexCoverageRevision: fixture });
    });
    console.log(JSON.stringify({ ready: true, localOnly: true, projectId, tenantId, email, customers: 205, tasks: 42, actualAiProof: false }));
  }
} finally { await db.terminate(); await deleteApp(app); }
