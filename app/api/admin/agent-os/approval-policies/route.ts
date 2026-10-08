import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { APPROVAL_CAPABILITIES, normalizeApprovalPolicy } from "@/lib/server/agent-os/approval-policy";

const policySchema = z.object({ tenantId: z.string().trim().min(1).max(180), approvals: z.record(z.string(), z.boolean()).default({}) });
function failure(error: unknown) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha nas políticas de aprovação:", error); return Response.json({ error: "Não foi possível atualizar as políticas." }, { status: 500 }); }

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const [policies, tenants] = await Promise.all([adminDb.collection("agent_approval_policies").limit(200).get(), adminDb.collection("tenants").orderBy("__name__").limit(200).get()]);
    const byTenant = new Map(policies.docs.map((doc) => [String(doc.get("tenantId") || doc.id), normalizeApprovalPolicy(doc.get("approvals"))]));
    return Response.json({ items: tenants.docs.map((tenant) => ({ tenantId: tenant.id, tenantName: String(tenant.get("name") || tenant.id), approvals: byTenant.get(tenant.id) || normalizeApprovalPolicy({}) })), capabilities: APPROVAL_CAPABILITIES }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const parsed = policySchema.safeParse(await request.json());
    if (!parsed.success) throw new RouteAuthError(400, "invalid_policy", "Revise a empresa e as políticas informadas.");
    const input = parsed.data;
    if (!(await adminDb.collection("tenants").doc(input.tenantId).get()).exists) throw new RouteAuthError(404, "tenant_missing", "Empresa não encontrada.");
    const approvals = normalizeApprovalPolicy(input.approvals);
    const batch = adminDb.batch();
    batch.set(adminDb.collection("agent_approval_policies").doc(input.tenantId), { tenantId: input.tenantId, approvals, updatedBy: actor.uid, updatedByName: actor.name, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "agent_approval_policy_updated", actorId: actor.uid, actorName: actor.name, tenantId: input.tenantId, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return Response.json({ ok: true, approvals });
  } catch (error) { return failure(error); }
}
