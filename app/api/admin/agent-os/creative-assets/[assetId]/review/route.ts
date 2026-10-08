import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function fail(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha na revisão do resultado criativo:", error);
  return Response.json({ error: "Não foi possível registrar a revisão deste resultado." }, { status: 500 });
}

export async function PATCH(request: Request, context: { params: Promise<{ assetId: string }> }) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { assetId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(assetId)) throw new RouteAuthError(400, "asset_invalid", "Resultado inválido.");
    const body = await request.json().catch(() => ({})) as { decision?: unknown };
    const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : "";
    if (!decision) throw new RouteAuthError(400, "review_invalid", "Escolha manter ou descartar o resultado.");
    const assetRef = adminDb.collection("creative_assets").doc(assetId);
    const asset = await assetRef.get();
    if (!asset.exists) throw new RouteAuthError(404, "asset_missing", "Resultado não encontrado.");
    await assetRef.set({ reviewStatus: decision, reviewedBy: actor.uid, reviewedByName: actor.name, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await adminDb.collection("audit_logs").add({ type: `creative_asset_${decision}`, actorId: actor.uid, actorName: actor.name, tenantId: asset.get("tenantId") || null, assetId, creativeJobId: asset.get("creativeJobId") || null, createdAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true, decision });
  } catch (error) { return fail(error); }
}
