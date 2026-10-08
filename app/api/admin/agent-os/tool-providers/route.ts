import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { PROVIDER_CATALOG, providerCreateSchema } from "@/lib/server/agent-os/tool-registry";

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no Tool Hub:", error);
  return Response.json({ error: "Não foi possível concluir a operação no Tool Hub." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const custom = await adminDb.collection("tool_providers").orderBy("__name__").limit(200).get();
    return Response.json({
      catalog: PROVIDER_CATALOG,
      custom: custom.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const parsed = providerCreateSchema.safeParse(await request.json());
    if (!parsed.success) throw new RouteAuthError(400, "invalid_provider", "Informe nome, identificador, categoria e pelo menos uma capacidade.");
    const input = parsed.data;
    const ref = adminDb.collection("tool_providers").doc(input.slug);
    const existing = await ref.get();
    if (existing.exists) throw new RouteAuthError(409, "provider_exists", "Já existe um provider com este identificador.");
    await adminDb.runTransaction(async (transaction) => {
      transaction.set(ref, { ...input, source: "custom", status: "cataloged", createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(adminDb.collection("audit_logs").doc(), { type: "agent_tool_provider_cataloged", actorId: actor.uid, actorName: actor.name, providerId: input.slug, createdAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
