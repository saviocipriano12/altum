import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

const inputSchema = z.object({
  tenantId: z.string().trim().min(1).max(180),
  positioning: z.string().trim().max(1_400).default(""),
  audience: z.string().trim().max(900).default(""),
  tone: z.string().trim().max(220).default(""),
  primaryColor: z.string().trim().regex(/^$|^#[0-9A-Fa-f]{6}$/).default(""),
  offers: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
  restrictions: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
});

function fail(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no Brand Hub:", error);
  return Response.json({ error: "Não foi possível atualizar o Brand Hub." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const [profiles, tenants] = await Promise.all([adminDb.collection("brand_profiles").limit(200).get(), adminDb.collection("tenants").orderBy("__name__").limit(200).get()]);
    return Response.json({
      items: profiles.docs.map((doc) => { const data = doc.data(); return { id: doc.id, tenantId: String(data.tenantId || ""), positioning: String(data.positioning || ""), audience: String(data.audience || ""), tone: String(data.tone || ""), primaryColor: String(data.primaryColor || ""), offers: Array.isArray(data.offers) ? data.offers.map(String) : [], restrictions: Array.isArray(data.restrictions) ? data.restrictions.map(String) : [] }; }),
      tenants: tenants.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name") || doc.id) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) throw new RouteAuthError(400, "invalid_brand", "Revise os dados do perfil de marca.");
    const input = parsed.data;
    if (!(await adminDb.collection("tenants").doc(input.tenantId).get()).exists) throw new RouteAuthError(404, "tenant_missing", "Empresa não encontrada.");
    const ref = adminDb.collection("brand_profiles").doc(input.tenantId);
    await adminDb.runTransaction(async (transaction) => {
      transaction.set(ref, { ...input, tenantId: input.tenantId, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, updatedByName: actor.name, createdAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(adminDb.collection("audit_logs").doc(), { type: "brand_profile_updated", actorId: actor.uid, actorName: actor.name, tenantId: input.tenantId, createdAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ ok: true });
  } catch (error) { return fail(error); }
}
