import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { adminBatchSchema } from "@/lib/admin-batch";
import { clean } from "@/lib/server/command-center/security";
import { adminDraftPreviewComplete } from "@/lib/admin-marketing-overview";
import { POST as metaSync } from "@/app/api/tenant/[tenantId]/growth/meta-ads/operator/route";
import { POST as googleSync } from "@/app/api/tenant/[tenantId]/growth/google-ads/operator/route";
import { POST as createDraft } from "@/app/api/tenant/[tenantId]/mcp/drafts/route";
import { PATCH as reviewDraft } from "@/app/api/tenant/[tenantId]/mcp/drafts/[draftId]/route";
import { POST as applyDraft } from "@/app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route";
import { POST as discoverPixels } from "@/app/api/admin/marketing/pixels/discover/route";

export const maxDuration = 300;
type ItemResult = { index: number; tenantId: string; ok: boolean; status: string; httpStatus: number; draftId?: string; error?: string };
export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_admin"] });
    const snap = await adminDb.collection("admin_marketing_batches").orderBy("createdAt", "desc").limit(30).get();
    return NextResponse.json({ items: snap.docs.map(doc => { const row = doc.data(); return { id: doc.id, action: row.action, status: row.status, total: row.total, actorName: row.actorName, results: row.results || [], createdAt: row.createdAt?.toDate?.().toISOString?.() || null }; }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("Falha na operação de mídia em lote:", error);
  return NextResponse.json({ error: "Não foi possível concluir a operação. Consulte o histórico antes de repetir." }, { status: 500 });
}
export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] });
    const parsed = adminBatchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Operação incompleta ou inválida.", issues: parsed.error.issues.map(issue => issue.message) }, { status: 400 });
    const body = parsed.data;
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const batchId = createHash("sha256").update(`${actor.uid}:${body.requestKey}`).digest("hex");
    const ref = adminDb.collection("admin_marketing_batches").doc(batchId);
    const previous = await adminDb.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (snap.exists) {
        if (snap.data()?.requestHash !== requestHash) throw new RouteAuthError(409, "batch_request_changed", "A chave já foi usada para outra operação.");
        return snap.data()!;
      }
      transaction.create(ref, { actorId: actor.uid, actorName: actor.name, action: body.action, requestHash, total: body.targets.length, status: "running", results: [], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return null;
    });
    if (previous) return NextResponse.json({ id: batchId, status: previous.status, results: previous.results || [], reused: true }, { status: previous.status === "running" ? 409 : 200 });
    const results: ItemResult[] = [];
    for (const [index, target] of body.targets.entries()) {
      await ref.set({ activeTarget: { index, tenantId: target.tenantId, channelId: target.channelId || null, draftId: target.draftId || null }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const subRequest = new Request(req.url, { method: body.action === "approve" || body.action === "reject" ? "PATCH" : "POST", headers: { authorization: req.headers.get("authorization") || "", "content-type": "application/json" }, body: JSON.stringify(["sync", "discover_pixels"].includes(body.action) ? { tenantId: target.tenantId, channelId: target.channelId, rangeDays: body.rangeDays || 30 } : body.action === "draft" ? { tool: target.tool, arguments: target.arguments } : { action: body.action }) });
      try {
        if (["approve", "apply"].includes(body.action)) {
          const draft = await adminDb.collection("mcp_action_drafts").doc(target.draftId!).get();
          if (!draft.exists || draft.data()?.tenantId !== target.tenantId || !adminDraftPreviewComplete(draft.data()?.proposedChange)) {
            throw new RouteAuthError(409, "incomplete_preview", "A alteração exige revisão completa na área da empresa antes de aprovação ou aplicação.");
          }
        }
        const context = { params: Promise.resolve({ tenantId: target.tenantId, draftId: target.draftId || "" }) };
        const response = body.action === "sync" ? await (target.platform === "meta_ads" ? metaSync : googleSync)(subRequest, context)
          : body.action === "discover_pixels" ? await discoverPixels(subRequest)
          : body.action === "draft" ? await createDraft(subRequest, context)
          : body.action === "apply" ? await applyDraft(subRequest, context) : await reviewDraft(subRequest, context);
        const payload = await response.json();
        results.push({ index, tenantId: target.tenantId, ok: response.ok && payload.ok !== false, httpStatus: response.status, status: clean(payload.status, 80) || (response.ok && payload.ok !== false ? "completed" : "failed"),
          ...(typeof payload.draftId === "string" ? { draftId: payload.draftId } : {}),
          ...(!response.ok || payload.ok === false ? { error: clean(payload.error, 240) || "Ação não concluída." } : {}),
        });
      } catch (error) {
        if (error instanceof RouteAuthError) {
          results.push({ index, tenantId: target.tenantId, ok: false, status: "failed", httpStatus: error.status, error: error.message });
          await ref.set({ results, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          continue;
        }
        console.error("Resultado inconclusivo de alvo do lote:", error);
        results.push({ index, tenantId: target.tenantId, ok: false, status: "unknown", httpStatus: 500, error: "Resultado inconclusivo. Confira o estado da conta antes de repetir." });
      }
      await ref.set({ results, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const status = results.every(row => row.ok) ? "completed" : "completed_with_errors";
    await ref.set({ status, activeTarget: null, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ id: batchId, status, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
