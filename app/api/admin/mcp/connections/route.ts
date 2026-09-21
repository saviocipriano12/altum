import { adminDb } from "@/app/lib/server/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { setAdminMcpPolicy } from "@/lib/server/mcp/admin-oauth";
import { millis, iso } from "@/lib/server/command-center/security";
function failure(error: unknown) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha na gestão do MCP:", error); return Response.json({ error: "Falha ao gerenciar conexões MCP." }, { status: 500 }); }
export async function GET(req: Request) {
  try { await requireRequestUser(req, { roles: ["agency_admin"] }); const [policy, snap] = await Promise.all([adminDb.collection("platform_settings").doc("admin_mcp").get(), adminDb.collection("admin_mcp_connections").orderBy("createdAt", "desc").limit(101).get()]); return Response.json({ enabled: policy.data()?.enabled === true, partial: snap.size > 100, items: snap.docs.slice(0, 100).map(doc => { const row = doc.data(); return { id: doc.id, clientName: row.clientName, userName: row.userName, tenantIds: row.tenantIds, scopes: row.scopes, createdAt: iso(row.createdAt), expiresAt: iso(row.expiresAt), status: row.revokedAt ? "revoked" : (millis(row.expiresAt) || 0) <= Date.now() ? "expired" : "active" }; }) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function PATCH(req: Request) {
  try { const actor = await requireRequestUser(req, { roles: ["agency_admin"] }); const body = await req.json(); if (typeof body.enabled !== "boolean") throw new RouteAuthError(400, "invalid_policy", "Informe o estado da conexão administrativa."); await setAdminMcpPolicy(actor, body.enabled); return Response.json({ ok: true, enabled: body.enabled }); }
  catch (error) { return failure(error); }
}
export async function DELETE(req: Request) {
  try { const actor = await requireRequestUser(req, { roles: ["agency_admin"] }); const body = await req.json(); if (!/^[A-Za-z0-9_-]{1,180}$/.test(String(body.id))) throw new RouteAuthError(400, "invalid_connection", "Conexão inválida."); const ref = adminDb.collection("admin_mcp_connections").doc(body.id); await adminDb.runTransaction(async transaction => { const snap = await transaction.get(ref); if (!snap.exists) throw new RouteAuthError(404, "connection_missing", "Conexão não encontrada."); transaction.set(ref, { revokedAt: FieldValue.serverTimestamp(), revokedBy: actor.uid }, { merge: true }); transaction.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_revoked", connectionId: ref.id, actorId: actor.uid, createdAt: FieldValue.serverTimestamp() }); }); return Response.json({ ok: true }); }
  catch (error) { return failure(error); }
}
