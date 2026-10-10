import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { routeAvatarAnchorConnection } from "@/lib/server/agent-os/creative-model-router";

function fail(error: unknown) { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error("Falha ao solicitar âncora de avatar:", error); return NextResponse.json({ error: "Não foi possível preparar a criação da âncora." }, { status: 500 }); }

export async function POST(request: Request, context: { params: Promise<{ avatarId: string }> }) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { avatarId } = await context.params;
    const body = await request.json().catch(() => ({})) as { connectionId?: unknown };
    let connectionId = typeof body.connectionId === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(body.connectionId) ? body.connectionId : "";
    const profileRef = adminDb.collection("avatar_profiles").doc(avatarId);
    const [profileSnap, references] = await Promise.all([profileRef.get(), profileRef.collection("references").select("kind").get()]);
    if (!profileSnap.exists) throw new RouteAuthError(404, "avatar_missing", "Avatar não encontrado.");
    const profile = profileSnap.data() || {};
    const authorized = profile.identityType === "character" ? profile.rightsConfirmed === true : profile.likenessConsent === true && profile.voiceConsent === true;
    if (!authorized) throw new RouteAuthError(409, "consent_missing", "A identidade e a voz precisam estar autorizadas antes da âncora.");
    const kinds = new Set(references.docs.map((item) => String(item.get("kind") || "")));
    if (!kinds.has("visual") || !kinds.has("voice")) throw new RouteAuthError(409, "references_missing", "Anexe ao menos uma referência visual e uma amostra de voz.");
    let connectionSnap = connectionId ? await adminDb.collection("tool_connections").doc(connectionId).get() : null;
    if (!connectionSnap) {
      const connections = await adminDb.collection("tool_connections").limit(200).get();
      const route = routeAvatarAnchorConnection({ tenantId: String(profile.tenantId || ""), prompt: `${String(profile.identityAnchor || profile.displayName || "Avatar")} ${String(profile.visualStyle || "")}`, connections: connections.docs.map((doc) => { const data = doc.data(); return { id: doc.id, providerId: String(data.providerId || ""), displayName: typeof data.displayName === "string" ? data.displayName : undefined, capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [], status: String(data.status || "pending_config"), credentialConfigured: Boolean(data.credential), scope: data.scope === "tenant" ? "tenant" as const : "platform" as const, tenantId: typeof data.tenantId === "string" ? data.tenantId : null, creativeModel: data.creativeModel, health: data.health }; }) });
      if (!route) throw new RouteAuthError(409, "avatar_connection_missing", "Conecte uma IA de avatar antes de preparar esta âncora.");
      connectionId = route.connection.id; connectionSnap = connections.docs.find((doc) => doc.id === connectionId) || null;
    }
    if (!connectionSnap || !connectionSnap.exists) throw new RouteAuthError(404, "connection_missing", "Conexão de provider não encontrada.");
    const connection = connectionSnap.data() || {};
    const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities.map(String) : [];
    const isScoped = connection.scope === "platform" || (connection.scope === "tenant" && connection.tenantId === profile.tenantId);
    if (String(connection.providerId || "").toLowerCase() !== "higgsfield" || !connection.credential || !isScoped || !capabilities.includes("GENERATE_AVATAR_VIDEO") || !["configured_unapproved", "healthy", "approved"].includes(String(connection.status || ""))) throw new RouteAuthError(409, "connection_unavailable", "Essa conexão ainda não possui uma credencial e um adaptador de âncora de identidade validados.");
    const existingJobs = await adminDb.collection("avatar_jobs").where("avatarId", "==", avatarId).limit(30).get();
    const hasActiveAnchor = existingJobs.docs.some((item) => { const row = item.data(); return row.stage === "anchor" && ["pending_approval", "approved_for_anchor", "running"].includes(String(row.status || "")); });
    if (hasActiveAnchor) throw new RouteAuthError(409, "anchor_already_requested", "Já existe uma solicitação de âncora em andamento para este avatar.");
    const jobRef = adminDb.collection("avatar_jobs").doc(); const approvalRef = adminDb.collection("agent_approvals").doc(); const batch = adminDb.batch();
    batch.set(jobRef, { tenantId: profile.tenantId, avatarId, connectionId, identityType: profile.identityType === "character" ? "character" : "person", identityAnchor: String(profile.identityAnchor || "").slice(0, 1800), visualStyle: String(profile.visualStyle || "").slice(0, 500), voiceDirection: String(profile.voiceDirection || "").slice(0, 500), continuity: String(profile.continuity || "production"), type: "avatar_anchor", stage: "anchor", status: "pending_approval", referenceKinds: [...kinds], disclosureRequired: profile.disclosureRequired !== false, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    batch.set(approvalRef, { tenantId: profile.tenantId, missionId: "", avatarJobId: jobRef.id, title: `Criar âncora visual privada de ${String(profile.displayName || "avatar")}`, summary: "Autoriza enviar somente as referências visuais privadas deste avatar para criar a âncora de identidade visual. A voz continua guardada na Altum e não será clonada nesta etapa. Nenhuma publicação será feita.", actionType: "avatar_anchor_creation", risk: "high", proposedPayload: { avatarId, connectionId, providerId: connection.providerId || null, referenceKinds: [...kinds] }, status: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "avatar_anchor_requested", actorId: actor.uid, actorName: actor.name, tenantId: profile.tenantId, avatarId, avatarJobId: jobRef.id, connectionId, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return NextResponse.json({ ok: true, jobId: jobRef.id, approvalId: approvalRef.id, status: "pending_approval" }, { status: 201 });
  } catch (error) { return fail(error); }
}
