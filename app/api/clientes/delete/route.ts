import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { cancelPlatformSubscription } from "@/lib/server/subscription-cancellation";

type Body = { clientId?: string; confirmation?: string };
const CLIENT_COLLECTIONS = ["projetos", "financeiro", "orcamentos", "ad_accounts", "atividades", "client_contracts"];
const TENANT_COLLECTIONS = ["ad_accounts", "appointments", "automations", "budgets", "chats", "chat_notes", "ecommerce_actions", "ecommerce_orders", "financeiro", "google_ads_reports", "growth_tracking_configs", "handoff_events", "kb_docs", "lead_events", "lead_notes", "lead_tasks", "leads", "marketing_drafts", "marketing_pixels", "messages", "meta_ads_reports", "outbound_campaign_jobs", "projetos", "tenant_channels", "tenant_users"];

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

async function deleteLinkedDocuments(collection: string, field: "clientId" | "tenantId", value: string) {
  let deleted = 0;
  while (true) {
    const snap = await adminDb.collection(collection).where(field, "==", value).limit(250).get();
    if (snap.empty) return deleted;
    await Promise.all(snap.docs.map((doc) => adminDb.recursiveDelete(doc.ref)));
    deleted += snap.size;
    if (snap.size < 250) return deleted;
  }
}

export async function POST(req: Request) {
  try {
    // A permanent deletion cancels billing and removes tenant data. It must not
    // be available to regular agency operators, even when they own a legacy
    // client record.
    const user = await requireRequestUser(req, { roles: ["agency_admin"] });
    const body = (await req.json()) as Body;
    const clientId = clean(body.clientId);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(clientId)) return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });

    const clientRef = adminDb.collection("clientes").doc(clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    const client = clientSnap.data() as Record<string, unknown>;
    const clientName = clean(client.name, 180) || "Empresa";
    if (clean(body.confirmation, 180) !== clientName) return NextResponse.json({ error: "Digite o nome exato da empresa para confirmar a exclusao definitiva." }, { status: 400 });

    const tenantSnap = await adminDb.collection("tenants").where("legacyClientId", "==", clientId).limit(2).get();
    if (tenantSnap.size > 1) return NextResponse.json({ error: "Mais de um workspace esta vinculado a esta empresa. Revise o vinculo antes de excluir." }, { status: 409 });
    const directTenantRef = adminDb.collection("tenants").doc(clientId);
    const tenantDoc = tenantSnap.docs[0] || await directTenantRef.get();
    const tenantRef = tenantSnap.docs[0]?.ref || directTenantRef;
    const tenantId = tenantDoc.exists ? tenantDoc.id : "";
    const tenant = (tenantDoc.data() || {}) as Record<string, unknown>;
    const subscriptionId = clean(tenant.asaasSubscriptionId, 180);

    if (subscriptionId && !["DELETED", "INACTIVE"].includes(clean(tenant.asaasSubscriptionStatus, 80).toUpperCase())) {
      await cancelPlatformSubscription({ tenantId, contractId: clientId, subscriptionId, actorId: user.uid, reason: "Empresa excluida definitivamente pela Altum" });
    }

    let deletedDocuments = 0;
    for (const collection of CLIENT_COLLECTIONS) deletedDocuments += await deleteLinkedDocuments(collection, "clientId", clientId);
    if (tenantId) {
      for (const collection of TENANT_COLLECTIONS) deletedDocuments += await deleteLinkedDocuments(collection, "tenantId", tenantId);
      await Promise.all([
        adminDb.recursiveDelete(adminDb.collection("tenant_settings").doc(tenantId)),
        adminDb.recursiveDelete(adminDb.collection("tenant_entitlements").doc(tenantId)),
        adminDb.recursiveDelete(adminDb.collection("tenant_usage").doc(tenantId)),
        adminDb.recursiveDelete(tenantRef),
      ]);
    }
    await adminDb.recursiveDelete(adminDb.collection("client_contracts").doc(clientId));
    await adminDb.recursiveDelete(clientRef);
    await adminDb.collection("audit_logs").add({
      type: "company_permanently_deleted", actorId: user.uid, actorName: user.name,
      clientId, clientName, tenantId: tenantId || null, deletedDocuments,
      asaasSubscriptionCancelled: Boolean(subscriptionId), createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, clientId, tenantId: tenantId || null, deletedDocuments });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erro ao excluir empresa:", error);
    return NextResponse.json({ error: "Falha ao excluir empresa. Nenhum novo pedido deve ser repetido antes de conferir a ficha." }, { status: 500 });
  }
}
