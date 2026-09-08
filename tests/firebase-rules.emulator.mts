import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "demo-altum-rules";
let environment: RulesTestEnvironment;

const identities = {
  agencyAdmin: "agency-admin",
  tenantOwner: "tenant-a-owner",
  tenantAdmin: "tenant-a-admin",
  tenantAgent: "tenant-a-agent-a",
  tenantAgentB: "tenant-a-agent-b",
  tenantViewer: "tenant-a-viewer",
  otherTenantAdmin: "tenant-b-admin",
} as const;

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function seedAuthorizationFixtures() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const activeUser = (role: string) => ({ role, status: "active" });
    const membership = (tenantId: string, userId: string, role: string) => ({
      tenantId,
      userId,
      role,
      status: "active",
      isDefault: true,
      capabilities: [],
    });

    await Promise.all([
      setDoc(doc(db, "users", identities.agencyAdmin), activeUser("agency_admin")),
      setDoc(doc(db, "users", identities.tenantOwner), activeUser("client_owner")),
      setDoc(doc(db, "users", identities.tenantAdmin), activeUser("client_admin")),
      setDoc(doc(db, "users", identities.tenantAgent), activeUser("client_agent")),
      setDoc(doc(db, "users", identities.tenantAgentB), activeUser("client_agent")),
      setDoc(doc(db, "users", identities.tenantViewer), activeUser("client_viewer")),
      setDoc(doc(db, "users", identities.otherTenantAdmin), activeUser("client_admin")),
      setDoc(
        doc(db, "tenant_users", `tenant-a_${identities.tenantOwner}`),
        membership("tenant-a", identities.tenantOwner, "client_owner")
      ),
      setDoc(
        doc(db, "tenant_users", `tenant-a_${identities.tenantAdmin}`),
        membership("tenant-a", identities.tenantAdmin, "client_admin")
      ),
      setDoc(
        doc(db, "tenant_users", `tenant-a_${identities.tenantAgent}`),
        membership("tenant-a", identities.tenantAgent, "client_agent")
      ),
      setDoc(
        doc(db, "tenant_users", `tenant-a_${identities.tenantAgentB}`),
        membership("tenant-a", identities.tenantAgentB, "client_agent")
      ),
      setDoc(
        doc(db, "tenant_users", `tenant-a_${identities.tenantViewer}`),
        membership("tenant-a", identities.tenantViewer, "client_viewer")
      ),
      setDoc(
        doc(db, "tenant_users", `tenant-b_${identities.otherTenantAdmin}`),
        membership("tenant-b", identities.otherTenantAdmin, "client_admin")
      ),
      setDoc(doc(db, "leads", "lead-a"), {
        tenantId: "tenant-a",
        assignedTo: identities.tenantAgent,
        name: "Lead A",
      }),
      setDoc(doc(db, "leads", "lead-b"), {
        tenantId: "tenant-a",
        assignedTo: identities.tenantAgentB,
        name: "Lead B",
      }),
      setDoc(doc(db, "pipeline", "pipeline-a"), { tenantId: "tenant-a", stages: [] }),
      setDoc(doc(db, "automations", "automation-a"), { tenantId: "tenant-a", enabled: false }),
      setDoc(doc(db, "ai_logs", "log-a"), { tenantId: "tenant-a", status: "ok" }),
    ]);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await source("firestore.rules") },
    storage: { rules: await source("storage.rules") },
  });
  await seedAuthorizationFixtures();
});

after(async () => {
  await environment.cleanup();
});

test("nega leitura de registro comercial pertencente a outro tenant", async () => {
  const db = environment.authenticatedContext(identities.otherTenantAdmin).firestore();
  await assertFails(getDoc(doc(db, "leads", "lead-a")));
});

test("permite alteracao comercial legitima sem mudar o tenant", async () => {
  const db = environment.authenticatedContext(identities.tenantAdmin).firestore();
  await assertSucceeds(updateDoc(doc(db, "leads", "lead-a"), { name: "Lead atualizado" }));
});

test("vendedores do mesmo tenant so leem a propria carteira", async () => {
  const agentADb = environment.authenticatedContext(identities.tenantAgent).firestore();
  const agentBDb = environment.authenticatedContext(identities.tenantAgentB).firestore();

  await assertSucceeds(getDoc(doc(agentADb, "leads", "lead-a")));
  await assertFails(getDoc(doc(agentADb, "leads", "lead-b")));
  await assertSucceeds(getDoc(doc(agentBDb, "leads", "lead-b")));
  await assertFails(updateDoc(doc(agentADb, "leads", "lead-b"), { name: "Tentativa indevida" }));
});

test("usuario nao altera o proprio papel, status ou membership", async () => {
  const agentDb = environment.authenticatedContext(identities.tenantAgent).firestore();

  await assertFails(updateDoc(doc(agentDb, "users", identities.tenantAgent), { role: "agency_admin" }));
  await assertFails(updateDoc(doc(agentDb, "users", identities.tenantAgent), { status: "blocked" }));
  await assertFails(
    updateDoc(doc(agentDb, "tenant_users", `tenant-a_${identities.tenantAgent}`), {
      role: "client_owner",
    })
  );
});

test("nega tenant hopping em leads inclusive para usuario da agencia", async () => {
  const tenantDb = environment.authenticatedContext(identities.tenantAdmin).firestore();
  const agencyDb = environment.authenticatedContext(identities.agencyAdmin).firestore();

  await assertFails(updateDoc(doc(tenantDb, "leads", "lead-a"), { tenantId: "tenant-b" }));
  await assertFails(updateDoc(doc(agencyDb, "leads", "lead-a"), { tenantId: "tenant-b" }));
});

test("viewer nao grava configuracao operacional e admin do tenant pode editar pipeline", async () => {
  const viewerDb = environment.authenticatedContext(identities.tenantViewer).firestore();
  const adminDb = environment.authenticatedContext(identities.tenantAdmin).firestore();

  await assertFails(updateDoc(doc(viewerDb, "pipeline", "pipeline-a"), { stages: ["novo"] }));
  await assertFails(updateDoc(doc(viewerDb, "automations", "automation-a"), { enabled: true }));
  await assertSucceeds(updateDoc(doc(adminDb, "pipeline", "pipeline-a"), { stages: ["novo"] }));
});

test("documentos tecnicos permanecem server-only", async () => {
  const tenantDb = environment.authenticatedContext(identities.tenantAdmin).firestore();
  const agencyDb = environment.authenticatedContext(identities.agencyAdmin).firestore();

  await assertFails(updateDoc(doc(tenantDb, "ai_logs", "log-a"), { status: "changed" }));
  await assertFails(updateDoc(doc(agencyDb, "ai_logs", "log-a"), { status: "changed" }));
  await assertFails(setDoc(doc(tenantDb, "jobs", "forged-job"), { tenantId: "tenant-a" }));
});

test("Storage aceita somente criacao de midia pelo operador no tenant correto", async () => {
  const agentStorage = environment.authenticatedContext(identities.tenantAgent).storage();
  const viewerStorage = environment.authenticatedContext(identities.tenantViewer).storage();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const path = `chat-media/tenant-a/chat-a/${identities.tenantAgent}/safe.png`;
  const metadata = {
    contentType: "image/png",
    customMetadata: {
      tenantId: "tenant-a",
      chatId: "chat-a",
      uploadedBy: identities.tenantAgent,
    },
  };

  await assertSucceeds(uploadBytes(ref(agentStorage, path), bytes, metadata));
  const stored = await assertSucceeds(getBytes(ref(agentStorage, path)));
  assert.equal(stored.byteLength, bytes.byteLength);

  await assertFails(uploadBytes(ref(agentStorage, path), bytes, metadata));
  await assertFails(
    uploadBytes(
      ref(agentStorage, `chat-media/tenant-b/chat-a/${identities.tenantAgent}/wrong-tenant.png`),
      bytes,
      { ...metadata, customMetadata: { ...metadata.customMetadata, tenantId: "tenant-b" } }
    )
  );
  await assertFails(
    uploadBytes(
      ref(viewerStorage, `chat-media/tenant-a/chat-a/${identities.tenantViewer}/viewer.png`),
      bytes,
      {
        ...metadata,
        customMetadata: { ...metadata.customMetadata, uploadedBy: identities.tenantViewer },
      }
    )
  );
});
