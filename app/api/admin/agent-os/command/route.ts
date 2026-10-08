import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { runBusinessCopilot } from "@/lib/server/ai/business-copilot";
import { planCommand } from "@/lib/server/agent-os/command-planner";
import { buildMissionTaskSeeds } from "@/lib/server/agent-os/missions";
import { buildCreativeDrafts, type CreativeFormat } from "@/lib/server/agent-os/creative-drafts";
import { creativeSkillReferences } from "@/lib/server/agent-os/external-skills";
import { extractPrivateAttachmentContext } from "@/lib/server/agent-os/command-attachments";
import { formatPrivateConversationMemory } from "@/lib/server/agent-os/conversation-memory";
import { buildLandingDraft } from "@/lib/server/agent-os/landing-draft";
import { inferMediaPreference, planMediaConnections, routeAvatarAnchorConnection, routeCreativeModel, routeMediaConnection } from "@/lib/server/agent-os/creative-model-router";
import { selectIdentityProfile } from "@/lib/server/agent-os/identity-routing";
import { buildCampaignPlan } from "@/lib/server/agent-os/campaign-plan";
import { isAvatarRightsConfirmation, parseAvatarCommand } from "@/lib/server/agent-os/avatar-command";
import { approveLatestConversationAction, isExplicitApprovalMessage } from "@/lib/server/agent-os/conversation-approval";
import { avatarReferenceStatus } from "@/lib/server/agent-os/avatar-reference-state";
import { parseCreativeReviewMessage, reviewLatestConversationAsset } from "@/lib/server/agent-os/conversation-asset-review";
import { dispatchMissionToOpenClaw } from "@/lib/server/agent-os/openclaw-runtime";
import { parseCreativeRenderSelection } from "@/lib/server/agent-os/creative-render-selection";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";

function date(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString() : null;
}

function failure(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no Comando Altum:", error);
  return Response.json({ error: "Não foi possível processar o comando." }, { status: 500 });
}

function titleFrom(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 72) || "Nova conversa";
}

async function prepareLatestConversationCreative(input: { tenantId: string; conversationId: string; message: string; actor: { uid: string; name: string } }) {
  const selection = parseCreativeRenderSelection(input.message);
  if (!selection) return null;
  const [missions, projects, connections] = await Promise.all([
    adminDb.collection("agent_missions").where("tenantId", "==", input.tenantId).limit(200).get(),
    adminDb.collection("creative_projects").where("tenantId", "==", input.tenantId).limit(200).get(),
    adminDb.collection("tool_connections").limit(200).get(),
  ]);
  const conversationMissionIds = new Set(missions.docs.filter((doc) => doc.get("conversationId") === input.conversationId).map((doc) => doc.id));
  const project = projects.docs
    .filter((doc) => conversationMissionIds.has(String(doc.get("missionId") || "")) && ["image", "video"].includes(String(doc.get("format") || "")))
    .sort((left, right) => (right.get("updatedAt")?.toMillis?.() || 0) - (left.get("updatedAt")?.toMillis?.() || 0))[0];
  if (!project) return null;
  const outputs = await adminDb.collection("creative_outputs").where("projectId", "==", project.id).limit(20).get();
  const output = outputs.docs.sort((left, right) => String(left.get("title") || "").localeCompare(String(right.get("title") || "")))[selection.ordinal] || outputs.docs[0];
  if (!output) return null;
  const projectRow = project.data(); const format = String(projectRow.format || "image") as CreativeFormat;
  const capability = format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE";
  const identityProfileId = typeof projectRow.identityProfileId === "string" ? projectRow.identityProfileId : "";
  const profile = identityProfileId ? await adminDb.collection("avatar_profiles").doc(identityProfileId).get() : null;
  const preferredProviderId = profile?.exists && profile.get("status") === "anchored" && typeof profile.get("anchorProviderId") === "string" ? String(profile.get("anchorProviderId")) : null;
  const prompt = String(output.get("content") || projectRow.brief || "");
  const routingInput = {
    tenantId: input.tenantId,
    capability,
    prompt,
    preference: ["economy", "balanced", "quality", "private"].includes(String(projectRow.mediaPreference || "")) ? String(projectRow.mediaPreference) as "economy" | "balanced" | "quality" | "private" : undefined,
    preferredProviderId,
    connections: connections.docs.map((doc) => { const data = doc.data(); return { id: doc.id, providerId: String(data.providerId || ""), displayName: typeof data.displayName === "string" ? data.displayName : undefined, capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [], status: String(data.status || "pending_config"), scope: data.scope === "tenant" ? "tenant" as const : "platform" as const, tenantId: typeof data.tenantId === "string" ? data.tenantId : null, creativeModel: data.creativeModel, health: data.health }; }),
  };
  const mediaPlan = planMediaConnections(routingInput);
  const route = mediaPlan.routes[0] || null;
  if (!route) return { projectId: project.id, missionId: String(projectRow.missionId || "") || null, unavailable: true as const };
  const modelRoute = routeCreativeModel({ providerId: route.connection.providerId, format, prompt, fallbackModel: route.connection.creativeModel });
  const jobRef = adminDb.collection("creative_jobs").doc(); const approvalRef = adminDb.collection("agent_approvals").doc(); const batch = adminDb.batch();
  batch.set(jobRef, { tenantId: input.tenantId, projectId: project.id, outputId: output.id, providerId: route.connection.providerId, providerName: route.connection.displayName || route.connection.providerId, connectionId: route.connection.id, fallbackConnectionIds: mediaPlan.routes.slice(1).map((item) => item.connection.id), capability, format, prompt: prompt.slice(0, 12_000), creativeModel: modelRoute.model, routePurpose: modelRoute.purpose, routingReason: modelRoute.reason, connectionRoutingReason: route.reason, identityProfileId: identityProfileId || null, identityReferenceId: profile?.exists && String(profile.get("anchorProviderId") || "") === route.connection.providerId ? profile.get("anchorReferenceId") || null : null, status: "pending_approval", approvalId: approvalRef.id, createdBy: input.actor.uid, createdByName: input.actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(approvalRef, { tenantId: input.tenantId, missionId: String(projectRow.missionId || "") || null, creativeJobId: jobRef.id, title: `Autorizar geração de ${format === "video" ? "vídeo" : "imagem"}`, summary: `A Altum preparou “${String(output.get("title") || "este conceito")}”. ${route.reason} A geração pode consumir créditos e ficará disponível para revisão antes de qualquer publicação.`, actionType: "creative_media_generation", risk: "medium", status: "pending", createdBy: input.actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(adminDb.collection("audit_logs").doc(), { type: "creative_media_requested_from_conversation", actorId: input.actor.uid, actorName: input.actor.name, tenantId: input.tenantId, projectId: project.id, outputId: output.id, creativeJobId: jobRef.id, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { projectId: project.id, missionId: String(projectRow.missionId || "") || null, outputTitle: String(output.get("title") || "este conceito"), format, jobId: jobRef.id, approvalId: approvalRef.id, unavailable: false as const };
}

async function copyCommandAttachmentsToAvatar(input: { avatarId: string; tenantId: string; actorId: string; attachments: Array<{ id: string; filename: string; contentType: string; size: number; storagePath: string }> }) {
  const eligible = input.attachments.filter((attachment) => /^(image\/(jpeg|png|webp)|audio\/(mpeg|mp4|wav|webm|ogg))$/i.test(attachment.contentType)).slice(0, 8);
  if (!eligible.length) return { visual: 0, voice: 0, ready: false };
  let visual = 0; let voice = 0;
  const profileRef = adminDb.collection("avatar_profiles").doc(input.avatarId);
  for (const attachment of eligible) {
    let data: Buffer | null = null;
    for (const bucketName of firebaseStorageBucketCandidates()) {
      const file = adminStorage.bucket(bucketName).file(attachment.storagePath);
      const [exists] = await file.exists();
      if (exists) { data = (await file.download())[0]; break; }
    }
    if (!data) continue;
    const kind = attachment.contentType.startsWith("image/") ? "visual" : "voice";
    const extension = attachment.filename.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase() || (kind === "visual" ? "jpg" : "webm");
    const storagePath = `avatar-references/${input.tenantId}/${input.avatarId}/${randomUUID()}.${extension}`;
    await saveFirebaseStorageFileWithFallback({ path: storagePath, data, options: { resumable: false, metadata: { contentType: attachment.contentType, cacheControl: "private,max-age=0,no-store", metadata: { tenantId: input.tenantId, avatarId: input.avatarId, uploadedBy: input.actorId, purpose: "avatar_reference_from_command", referenceKind: kind, originalName: attachment.filename } } } });
    await profileRef.collection("references").doc().set({ tenantId: input.tenantId, avatarId: input.avatarId, kind, filename: attachment.filename, contentType: attachment.contentType, size: attachment.size, storagePath, createdBy: input.actorId, createdAt: FieldValue.serverTimestamp(), source: "altum_command" });
    if (kind === "visual") visual += 1; else voice += 1;
  }
  let ready = false;
  if (visual || voice) {
    const allReferences = await profileRef.collection("references").select("kind").get();
    const kinds = new Set(allReferences.docs.map((item) => String(item.get("kind") || "")));
    const status = avatarReferenceStatus(kinds);
    ready = status === "anchor_required";
    await profileRef.set({ referenceCount: FieldValue.increment(visual + voice), status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { visual, voice, ready };
}

export async function GET(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const requestedConversationId = new URL(request.url).searchParams.get("conversationId")?.trim() || "";
    const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim() || "";
    const [messages, conversations, ideas, tenants, missions, tasks, approvals, creativeProjects, creativeOutputs, creativeJobs, creativeAssets, captureForms] = await Promise.all([
      adminDb.collection("agent_command_messages").where("ownerId", "==", actor.uid).limit(250).get(),
      adminDb.collection("agent_conversations").where("ownerId", "==", actor.uid).limit(100).get(),
      adminDb.collection("agent_ideas").where("ownerId", "==", actor.uid).limit(100).get(),
      adminDb.collection("tenants").orderBy("__name__").limit(200).get(),
      adminDb.collection("agent_missions").limit(200).get(),
      adminDb.collection("agent_tasks").limit(500).get(),
      adminDb.collection("agent_approvals").limit(200).get(),
      adminDb.collection("creative_projects").limit(200).get(),
      adminDb.collection("creative_outputs").limit(500).get(),
      adminDb.collection("creative_jobs").limit(500).get(),
      adminDb.collection("creative_assets").limit(500).get(),
      adminDb.collection("capture_forms").limit(300).get(),
    ]);
    const conversationItems = conversations.docs.map((doc) => {
      const row = doc.data();
      return { id: doc.id, tenantId: String(row.tenantId || ""), title: String(row.title || "Nova conversa"), kind: row.kind === "project" ? "project" : "general", createdAt: date(row.createdAt), updatedAt: date(row.updatedAt) };
    }).sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
    const visibleConversations = requestedTenantId ? conversationItems.filter((item) => item.tenantId === requestedTenantId) : conversationItems;
    const selectedConversationId = requestedConversationId && visibleConversations.some((item) => item.id === requestedConversationId)
      ? requestedConversationId : visibleConversations[0]?.id || "legacy";

    const tasksByMission = new Map<string, Array<{ title: string; status: string; sequence: number }>>();
    for (const task of tasks.docs) {
      const row = task.data(); const missionId = typeof row.missionId === "string" ? row.missionId : "";
      if (!missionId) continue;
      const current = tasksByMission.get(missionId) || [];
      current.push({ title: String(row.title || "Etapa"), status: String(row.status || "queued"), sequence: Number(row.sequence || 0) });
      tasksByMission.set(missionId, current);
    }
    const approvalByMission = new Map<string, { id: string; title: string; summary: string; risk: string; status: string }>();
    for (const approval of approvals.docs) {
      const row = approval.data(); const missionId = typeof row.missionId === "string" ? row.missionId : "";
      if (missionId && row.status === "pending") approvalByMission.set(missionId, { id: approval.id, title: String(row.title || "Ação pendente"), summary: String(row.summary || ""), risk: String(row.risk || "medium"), status: "pending" });
    }
    const assetsByJob = new Map(creativeAssets.docs.map((asset) => [String(asset.get("creativeJobId") || asset.id), { id: asset.id, reviewStatus: String(asset.get("reviewStatus") || "pending") }]));
    const jobsByOutput = new Map<string, Array<{ id: string; status: string; providerName: string; format: string; autoStart: boolean; pipelineStatus: string | null; assetId: string | null; assetReviewStatus: string | null; assetUrl: string | null }>>();
    for (const job of creativeJobs.docs) {
      const row = job.data(); const outputId = typeof row.outputId === "string" ? row.outputId : "";
      if (!outputId) continue;
      const current = jobsByOutput.get(outputId) || [];
      const storedAsset = assetsByJob.get(job.id);
      current.push({ id: job.id, status: String(row.status || "queued"), providerName: String(row.providerName || row.providerId || "Altum"), format: String(row.format || "image"), autoStart: row.autoStart === true, pipelineStatus: typeof row.pipelineStatus === "string" ? row.pipelineStatus : null, assetId: storedAsset?.id || null, assetReviewStatus: storedAsset?.reviewStatus || null, assetUrl: storedAsset ? `/api/admin/agent-os/creative-assets/${storedAsset.id}/download` : typeof row.assetUrl === "string" ? row.assetUrl : null });
      jobsByOutput.set(outputId, current);
    }
    const outputsByProject = new Map<string, Array<{ id: string; title: string; content: string; status: string; jobs: Array<{ id: string; status: string; providerName: string; format: string; autoStart: boolean; pipelineStatus: string | null; assetId: string | null; assetReviewStatus: string | null; assetUrl: string | null }>}>>();
    for (const output of creativeOutputs.docs) {
      const row = output.data(); const projectId = typeof row.projectId === "string" ? row.projectId : "";
      if (!projectId) continue;
      const current = outputsByProject.get(projectId) || [];
      current.push({ id: output.id, title: String(row.title || "Conceito"), content: String(row.content || "").slice(0, 6_000), status: String(row.status || "draft"), jobs: jobsByOutput.get(output.id) || [] });
      outputsByProject.set(projectId, current);
    }
    const creativeByProject = new Map(creativeProjects.docs.map((doc) => {
      const row = doc.data();
      return [doc.id, { projectId: doc.id, format: String(row.format || "image"), status: String(row.status || "draft"), outputs: outputsByProject.get(doc.id) || [] }];
    }));
    const landingByForm = new Map(captureForms.docs.map((doc) => [doc.id, { formId: doc.id, status: String(doc.get("status") || "draft"), title: String(doc.get("name") || "Landing page"), publicUrl: String(doc.get("status") || "draft") === "active" ? `/f/${doc.id}` : null }]));
    const missionById = new Map(missions.docs.map((doc) => {
      const row = doc.data(); const missionTasks = (tasksByMission.get(doc.id) || []).sort((a, b) => a.sequence - b.sequence);
      const creativeProjectId = typeof row.creativeProjectId === "string" ? row.creativeProjectId : null;
      const captureFormId = typeof row.captureFormId === "string" ? row.captureFormId : null;
      const campaignPlan = row.campaignPlan && typeof row.campaignPlan === "object" ? row.campaignPlan as Record<string, unknown> : null;
      return [doc.id, { id: doc.id, title: String(row.title || "Missão"), template: String(row.template || "custom"), creativeProjectId, creative: creativeProjectId ? creativeByProject.get(creativeProjectId) || null : null, landing: captureFormId ? landingByForm.get(captureFormId) || null : null, campaign: campaignPlan ? { hypothesis: String(campaignPlan.hypothesis || ""), assetMatrix: Array.isArray(campaignPlan.assetMatrix) ? campaignPlan.assetMatrix.slice(0, 6).map((item) => item && typeof item === "object" ? { kind: String((item as Record<string, unknown>).kind || "Material"), purpose: String((item as Record<string, unknown>).purpose || ""), status: String((item as Record<string, unknown>).status || "draft") } : null).filter(Boolean) : [] } : null, status: String(row.status || "planned"), runtimeStatus: typeof row.runtimeStatus === "string" ? row.runtimeStatus : null, runtimeMessage: typeof row.runtimeMessage === "string" ? row.runtimeMessage : null, progress: Number(row.progress || 0), taskTotal: missionTasks.length, taskCompleted: missionTasks.filter((task) => task.status === "completed").length, nextTask: missionTasks.find((task) => ["ready", "queued", "waiting_approval"].includes(task.status)) || null, approval: approvalByMission.get(doc.id) || null }];
    }));
    const items = messages.docs.map((doc) => {
      const row = doc.data(); const missionId = typeof row.missionId === "string" ? row.missionId : null;
      const attachments = Array.isArray(row.attachments) ? row.attachments.map((attachment) => attachment && typeof attachment === "object" ? { id: typeof attachment.id === "string" ? attachment.id : "", filename: typeof attachment.filename === "string" ? attachment.filename : "Anexo", contentType: typeof attachment.contentType === "string" ? attachment.contentType : "", size: Number(attachment.size || 0) } : null).filter((attachment): attachment is { id: string; filename: string; contentType: string; size: number } => Boolean(attachment?.id)).slice(0, 6) : [];
      return { id: doc.id, tenantId: typeof row.tenantId === "string" ? row.tenantId : "", conversationId: typeof row.conversationId === "string" ? row.conversationId : "legacy", role: row.role === "assistant" ? "assistant" : "user", content: String(row.content || ""), attachments, missionId, mission: missionId ? missionById.get(missionId) || null : null, createdAt: date(row.createdAt) };
    }).filter((item) => item.conversationId === selectedConversationId && (!requestedTenantId || item.tenantId === requestedTenantId)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    const ideaItems = ideas.docs.map((doc) => { const row = doc.data(); return { id: doc.id, tenantId: String(row.tenantId || ""), title: String(row.title || "Ideia"), content: String(row.content || ""), status: String(row.status || "captured"), createdAt: date(row.createdAt) }; }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const assetItems = creativeAssets.docs.map((doc) => { const row = doc.data(); return { id: doc.id, tenantId: String(row.tenantId || ""), projectId: String(row.projectId || ""), outputId: String(row.outputId || ""), type: String(row.type || "image"), providerName: String(row.providerId || "Altum"), createdAt: date(row.createdAt), url: `/api/admin/agent-os/creative-assets/${doc.id}/download` }; }).filter((asset) => !requestedTenantId || asset.tenantId === requestedTenantId).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 24);
    return Response.json({ items, conversations: visibleConversations, selectedConversationId, ideas: requestedTenantId ? ideaItems.filter((item) => item.tenantId === requestedTenantId) : ideaItems, assets: assetItems, tenants: tenants.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name") || doc.id) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const body = await request.json() as { action?: unknown; message?: unknown; tenantId?: unknown; conversationId?: unknown; title?: unknown; content?: unknown; attachmentIds?: unknown };
    const action = typeof body.action === "string" ? body.action : "message";
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim().slice(0, 180) : "";
    if (!tenantId) throw new RouteAuthError(400, "tenant_required", "Escolha a empresa que receberá o contexto.");
    const tenant = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenant.exists) throw new RouteAuthError(404, "tenant_missing", "Empresa não encontrada.");

    if (action === "create_conversation") {
      const ref = adminDb.collection("agent_conversations").doc(); const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
      await ref.set({ ownerId: actor.uid, tenantId, title: title || "Nova conversa", kind: "general", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return Response.json({ ok: true, conversationId: ref.id }, { status: 201 });
    }
    if (action === "save_idea") {
      const content = typeof body.content === "string" ? body.content.trim().slice(0, 2_400) : "";
      if (content.length < 2) throw new RouteAuthError(400, "invalid_idea", "Escreva a ideia que deseja guardar.");
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : ""; const ref = adminDb.collection("agent_ideas").doc();
      await ref.set({ ownerId: actor.uid, tenantId, title: title || titleFrom(content), content, status: "captured", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await adminDb.collection("audit_logs").add({ type: "agent_idea_captured", actorId: actor.uid, actorName: actor.name, tenantId, ideaId: ref.id, createdAt: FieldValue.serverTimestamp() });
      return Response.json({ ok: true, ideaId: ref.id }, { status: 201 });
    }

    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2_400) : "";
    if (message.length < 2) throw new RouteAuthError(400, "invalid_command", "Escreva o que você quer que a Altum faça.");
    const attachmentIds = Array.isArray(body.attachmentIds) ? [...new Set(body.attachmentIds.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,180}$/.test(id)).slice(0, 6))] : [];
    const attachmentSnapshots = attachmentIds.length ? await Promise.all(attachmentIds.map((id) => adminDb.collection("agent_command_attachments").doc(id).get())) : [];
    if (attachmentSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("ownerId") !== actor.uid || snapshot.get("tenantId") !== tenantId || snapshot.get("status") !== "stored")) throw new RouteAuthError(403, "attachment_unavailable", "Um ou mais anexos não estão disponíveis para esta empresa.");
    const attachments = attachmentSnapshots.map((snapshot) => ({ id: snapshot.id, filename: String(snapshot.get("filename") || "Anexo").slice(0, 180), contentType: String(snapshot.get("contentType") || "").slice(0, 180), size: Number(snapshot.get("size") || 0) }));
    const attachmentContext = attachmentSnapshots.length ? await extractPrivateAttachmentContext(attachmentSnapshots.map((snapshot) => ({ filename: String(snapshot.get("filename") || "Anexo"), contentType: String(snapshot.get("contentType") || ""), storagePath: String(snapshot.get("storagePath") || "") }))) : { text: "", notices: [] as string[], analysis: "" };
    let conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    let conversationRef = conversationId ? adminDb.collection("agent_conversations").doc(conversationId) : null;
    if (conversationRef) {
      const conversation = await conversationRef.get();
      if (!conversation.exists || conversation.get("ownerId") !== actor.uid || conversation.get("tenantId") !== tenantId) throw new RouteAuthError(404, "conversation_missing", "Conversa não encontrada para esta empresa.");
    } else {
      conversationRef = adminDb.collection("agent_conversations").doc(); conversationId = conversationRef.id;
      await conversationRef.set({ ownerId: actor.uid, tenantId, title: titleFrom(message), kind: "general", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }

    const userRef = adminDb.collection("agent_command_messages").doc(); const assistantRef = adminDb.collection("agent_command_messages").doc();
    const avatarCommand = parseAvatarCommand(message);
    if (!avatarCommand && isAvatarRightsConfirmation(message)) {
      const pendingRequests = await adminDb.collection("pending_avatar_requests").where("ownerId", "==", actor.uid).limit(80).get();
      const pending = pendingRequests.docs
        .filter((doc) => doc.get("tenantId") === tenantId && doc.get("conversationId") === conversationId && doc.get("status") === "awaiting_rights")
        .sort((left, right) => (right.get("createdAt")?.toMillis?.() || 0) - (left.get("createdAt")?.toMillis?.() || 0))[0];
      if (pending) {
        const identityType = pending.get("identityType") === "character" ? "character" as const : "person" as const;
        const displayName = String(pending.get("displayName") || (identityType === "character" ? "Novo personagem" : "Novo avatar")).slice(0, 100);
        const avatarRef = adminDb.collection("avatar_profiles").doc();
        const identityAnchor = identityType === "character"
          ? `Manter a identidade visual original de ${displayName}; preservar traços, proporções, estilo e voz das referências privadas aprovadas.`
          : `Manter a identidade visual autorizada de ${displayName}; preservar traços, proporções, estilo e voz das referências privadas aprovadas.`;
        const answer = `Confirmação registrada. Criei o perfil privado de ${identityType === "character" ? "personagem" : "avatar"} “${displayName}”.${attachments.length ? " Vou adicionar as referências compatíveis desta mensagem." : " Agora envie aqui uma foto de referência e uma amostra de voz."} Nada será enviado a uma IA externa até a autorização específica para criar a âncora.`;
        const batch = adminDb.batch();
        batch.set(avatarRef, { tenantId, conversationId, displayName, identityType, role: "creator", identityAnchor, visualStyle: "", voiceDirection: "", continuity: "production", allowedUses: ["organic_content"], restrictions: [], likenessConsent: identityType === "person", voiceConsent: identityType === "person", rightsConfirmed: identityType === "character", disclosureRequired: true, status: "reference_required", consentedAt: FieldValue.serverTimestamp(), createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: "altum_command" });
        batch.set(pending.ref, { status: "confirmed", avatarId: avatarRef.id, confirmedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        batch.set(adminDb.collection("audit_logs").doc(), { type: "avatar_rights_confirmed_from_conversation", actorId: actor.uid, actorName: actor.name, tenantId, avatarId: avatarRef.id, pendingAvatarRequestId: pending.id, identityType, createdAt: FieldValue.serverTimestamp() });
        batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
        batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, createdAt: FieldValue.serverTimestamp() });
        batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
        await batch.commit();
        if (attachments.length) await copyCommandAttachmentsToAvatar({ avatarId: avatarRef.id, tenantId, actorId: actor.uid, attachments: attachmentSnapshots.map((snapshot) => ({ id: snapshot.id, filename: String(snapshot.get("filename") || "Anexo"), contentType: String(snapshot.get("contentType") || "").toLowerCase(), size: Number(snapshot.get("size") || 0), storagePath: String(snapshot.get("storagePath") || "") })) });
        return Response.json({ ok: true, answer, conversationId });
      }
    }
    if (avatarCommand) {
      const batch = adminDb.batch();
      let createdAvatarId = "";
      let answer: string;
      if (!avatarCommand.rightsConfirmed) {
        const pendingRef = adminDb.collection("pending_avatar_requests").doc();
        batch.set(pendingRef, { ownerId: actor.uid, tenantId, conversationId, displayName: avatarCommand.displayName, identityType: avatarCommand.identityType, status: "awaiting_rights", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        answer = avatarCommand.identityType === "character"
          ? `Posso preparar o perfil de “${avatarCommand.displayName}”, mas preciso da sua confirmação antes: responda dizendo que o personagem é seu ou que você tem os direitos para usá-lo. Depois pedirei as referências visuais privadas.`
          : `Posso preparar o perfil de “${avatarCommand.displayName}”, mas preciso da sua confirmação explícita de que você tem autorização de imagem e voz dessa pessoa. Depois pedirei as referências privadas; nada será enviado a uma IA externa sem outra aprovação.`;
      } else {
        const avatarRef = adminDb.collection("avatar_profiles").doc();
        createdAvatarId = avatarRef.id;
        const identityAnchor = avatarCommand.identityType === "character"
          ? `Manter a identidade visual original de ${avatarCommand.displayName}; preservar traços, proporções, estilo e voz das referências privadas aprovadas.`
          : `Manter a identidade visual autorizada de ${avatarCommand.displayName}; preservar traços, proporções, estilo e voz das referências privadas aprovadas.`;
        batch.set(avatarRef, {
          tenantId, conversationId, displayName: avatarCommand.displayName, identityType: avatarCommand.identityType, role: "creator", identityAnchor,
          visualStyle: "", voiceDirection: "", continuity: "production", allowedUses: ["organic_content"], restrictions: [],
          likenessConsent: avatarCommand.identityType === "person", voiceConsent: avatarCommand.identityType === "person", rightsConfirmed: avatarCommand.identityType === "character", disclosureRequired: true,
          status: "reference_required", consentedAt: FieldValue.serverTimestamp(), createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: "altum_command",
        });
        batch.set(adminDb.collection("audit_logs").doc(), { type: "avatar_profile_created_from_command", actorId: actor.uid, actorName: actor.name, tenantId, avatarId: avatarRef.id, identityType: avatarCommand.identityType, createdAt: FieldValue.serverTimestamp() });
        answer = `Perfil privado de ${avatarCommand.identityType === "character" ? "personagem" : "avatar"} “${avatarCommand.displayName}” criado.${attachments.length ? " Vou adicionar as referências compatíveis que você enviou a esta mensagem." : " Agora anexe pelo menos uma foto de referência e uma amostra de voz."} Eu só vou pedir autorização para enviar essas referências quando a âncora estiver pronta para ser criada. Por enquanto, o uso está limitado a conteúdo orgânico.`;
      }
      batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
      batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, createdAt: FieldValue.serverTimestamp() });
      batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
      await batch.commit();
      if (createdAvatarId && attachmentSnapshots.length) {
        await copyCommandAttachmentsToAvatar({ avatarId: createdAvatarId, tenantId, actorId: actor.uid, attachments: attachmentSnapshots.map((snapshot) => ({ id: snapshot.id, filename: String(snapshot.get("filename") || "Anexo"), contentType: String(snapshot.get("contentType") || "").toLowerCase(), size: Number(snapshot.get("size") || 0), storagePath: String(snapshot.get("storagePath") || "") })) });
      }
      return Response.json({ ok: true, answer, conversationId });
    }

    const hasReferenceAttachment = attachmentSnapshots.some((snapshot) => /^(image\/(jpeg|png|webp)|audio\/(mpeg|mp4|wav|webm|ogg))$/i.test(String(snapshot.get("contentType") || "")));
    if (hasReferenceAttachment) {
      const candidates = await adminDb.collection("avatar_profiles").where("tenantId", "==", tenantId).limit(80).get();
      const profile = candidates.docs
        .filter((doc) => doc.get("conversationId") === conversationId && ["reference_required", "reference_incomplete"].includes(String(doc.get("status") || "")))
        .sort((left, right) => (right.get("createdAt")?.toMillis?.() || 0) - (left.get("createdAt")?.toMillis?.() || 0))[0];
      if (profile) {
        const copied = await copyCommandAttachmentsToAvatar({ avatarId: profile.id, tenantId, actorId: actor.uid, attachments: attachmentSnapshots.map((snapshot) => ({ id: snapshot.id, filename: String(snapshot.get("filename") || "Anexo"), contentType: String(snapshot.get("contentType") || "").toLowerCase(), size: Number(snapshot.get("size") || 0), storagePath: String(snapshot.get("storagePath") || "") })) });
        const name = String(profile.get("displayName") || "este avatar");
        const answer = copied.ready
          ? `Adicionei a foto e a amostra de voz privadas a “${name}”. As referências estão completas; quando quiser, diga “prepare a âncora de ${name}”.`
          : copied.visual
            ? `Adicionei a referência visual a “${name}”. Agora envie uma amostra de voz privada nesta conversa.`
            : copied.voice
              ? `Adicionei a amostra de voz privada a “${name}”. Agora envie uma foto de referência nesta conversa.`
              : `Não consegui identificar uma foto ou áudio compatível para “${name}”. Envie imagem JPG, PNG ou WebP e áudio MP3, M4A, WAV, WebM ou OGG.`;
        const batch = adminDb.batch();
        batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
        batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, createdAt: FieldValue.serverTimestamp() });
        batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
        await batch.commit();
        return Response.json({ ok: true, answer, conversationId });
      }
    }

    const asksForAnchor = /\b(ancore|ancorar|ancora|âncora|preparar\s+(?:o\s+)?avatar)\b/i.test(message);
    if (asksForAnchor) {
      const profiles = await adminDb.collection("avatar_profiles").where("tenantId", "==", tenantId).limit(80).get();
      const selected = selectIdentityProfile({ tenantId, prompt: message, profiles: profiles.docs.map((doc) => { const row = doc.data(); return { id: doc.id, tenantId: String(row.tenantId || ""), displayName: String(row.displayName || ""), identityType: row.identityType === "character" ? "character" as const : "person" as const, identityAnchor: String(row.identityAnchor || ""), visualStyle: String(row.visualStyle || ""), voiceDirection: String(row.voiceDirection || ""), status: String(row.status || "") }; }) });
      const profile = selected ? profiles.docs.find((doc) => doc.id === selected.id) : null;
      let answer = "Não encontrei um avatar correspondente nesta empresa. Diga o nome do avatar que deseja ancorar.";
      let missionIdForAnchor: string | null = null;
      if (profile) {
        const row = profile.data();
        const references = await profile.ref.collection("references").select("kind").get();
        const kinds = new Set(references.docs.map((item) => String(item.get("kind") || "")));
        if (!kinds.has("visual") || !kinds.has("voice")) {
          answer = `Para criar a âncora de “${String(row.displayName || "este avatar")}”, ainda preciso de ${!kinds.has("visual") && !kinds.has("voice") ? "uma foto de referência e uma amostra de voz" : !kinds.has("visual") ? "uma foto de referência" : "uma amostra de voz"}. Envie os arquivos aqui na conversa e peça novamente.`;
        } else {
          const existingJobs = await adminDb.collection("avatar_jobs").where("avatarId", "==", profile.id).limit(30).get();
          const activeJob = existingJobs.docs.some((item) => item.get("stage") === "anchor" && ["pending_approval", "approved_for_anchor", "running"].includes(String(item.get("status") || "")));
          if (activeJob) {
            answer = `Já existe uma criação de âncora em andamento para “${String(row.displayName || "este avatar")}”. Vou acompanhar o resultado antes de iniciar outra.`;
          } else {
          const connections = await adminDb.collection("tool_connections").limit(200).get();
          const route = routeAvatarAnchorConnection({ tenantId, prompt: `${String(row.identityAnchor || row.displayName || "Avatar")} ${String(row.visualStyle || "")}`, connections: connections.docs.map((doc) => { const data = doc.data(); return { id: doc.id, providerId: String(data.providerId || ""), displayName: typeof data.displayName === "string" ? data.displayName : undefined, capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [], status: String(data.status || "pending_config"), scope: data.scope === "tenant" ? "tenant" as const : "platform" as const, tenantId: typeof data.tenantId === "string" ? data.tenantId : null, creativeModel: data.creativeModel, health: data.health }; }) });
          if (!route) {
            answer = `As referências de “${String(row.displayName || "este avatar")}” estão prontas, mas ainda não há uma conexão com âncora de identidade validada. Conecte o Higgsfield em Configurações e peça novamente; outros provedores de vídeo podem continuar sendo usados depois para renderizar.`;
          } else {
            const missionRef = adminDb.collection("agent_missions").doc(); const jobRef = adminDb.collection("avatar_jobs").doc(); const approvalRef = adminDb.collection("agent_approvals").doc(); const batch = adminDb.batch(); missionIdForAnchor = missionRef.id;
            batch.set(missionRef, { tenantId, conversationId, title: `Âncora de avatar: ${String(row.displayName || "Avatar")}`.slice(0, 140), objective: `Criar uma âncora privada e autorizada para ${String(row.displayName || "avatar")}.`, template: "creative", risk: "high", constraints: ["Não compartilhar referências sem aprovação humana.", "Não publicar conteúdo.", "Usar apenas a conexão escolhida pela Altum."], status: "waiting_approval", progress: 0, avatarId: profile.id, source: "altum_command", createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
            batch.set(jobRef, { tenantId, avatarId: profile.id, connectionId: route.connection.id, identityType: row.identityType === "character" ? "character" : "person", identityAnchor: String(row.identityAnchor || "").slice(0, 1800), visualStyle: String(row.visualStyle || "").slice(0, 500), voiceDirection: String(row.voiceDirection || "").slice(0, 500), continuity: String(row.continuity || "production"), type: "avatar_anchor", stage: "anchor", status: "pending_approval", referenceKinds: [...kinds], disclosureRequired: row.disclosureRequired !== false, missionId: missionRef.id, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
            batch.set(approvalRef, { tenantId, missionId: missionRef.id, avatarJobId: jobRef.id, title: `Criar âncora visual privada de ${String(row.displayName || "avatar")}`, summary: `A Altum enviará as referências visuais privadas somente para ${route.connection.displayName || route.connection.providerId}, para criar a âncora de identidade visual. A amostra de voz continuará guardada na Altum; nenhuma clonagem de voz, publicação ou envio externo adicional ocorrerá nesta etapa.`, actionType: "avatar_anchor_creation", risk: "high", proposedPayload: { avatarId: profile.id, connectionId: route.connection.id, providerId: route.connection.providerId, referenceKinds: [...kinds] }, status: "pending", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
            batch.set(adminDb.collection("audit_logs").doc(), { type: "avatar_anchor_requested_from_command", actorId: actor.uid, actorName: actor.name, tenantId, avatarId: profile.id, avatarJobId: jobRef.id, connectionId: route.connection.id, createdAt: FieldValue.serverTimestamp() });
            await batch.commit();
            answer = `As referências de “${String(row.displayName || "este avatar")}” estão completas. Preparei a criação da âncora privada; revise a autorização abaixo. Depois da aprovação, a Altum acompanha a criação e usa a identidade apenas dentro do escopo aprovado.`;
          }
          }
        }
      }
      const batch = adminDb.batch();
      batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
      batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, missionId: missionIdForAnchor, createdAt: FieldValue.serverTimestamp() });
      batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
      await batch.commit();
      return Response.json({ ok: true, answer, missionId: missionIdForAnchor, conversationId });
    }

    if (isExplicitApprovalMessage(message)) {
      const approved = await approveLatestConversationAction({ tenantId, conversationId, actor });
      if (approved.found) {
        const answer = approved.kind === "media"
          ? `Autorização registrada para “${approved.title}”. A Altum colocou a geração na fila e acompanhará o resultado nesta conversa; assim que estiver pronto, ele aparece para sua revisão.`
          : approved.kind === "landing"
            ? `Autorização registrada para “${approved.title}”. A landing foi publicada e a Altum continuará acompanhando os leads por esta conversa.`
            : approved.kind === "avatar"
              ? `Autorização registrada para “${approved.title}”. A Altum iniciou a criação da âncora privada e avisará aqui quando a identidade estiver pronta.`
              : `Autorização registrada para “${approved.title}”. A Altum vai continuar esta etapa e trará qualquer próximo resultado para esta conversa.`;
        const batch = adminDb.batch();
        batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
        batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, createdAt: FieldValue.serverTimestamp() });
        batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
        await batch.commit();
        return Response.json({ ok: true, answer, conversationId });
      }
    }

    const assetDecision = parseCreativeReviewMessage(message);
    if (assetDecision) {
      const reviewed = await reviewLatestConversationAsset({ tenantId, conversationId, actor, decision: assetDecision });
      if (reviewed) {
        const answer = assetDecision === "approved"
          ? `Perfeito. Marquei este ${reviewed.type === "video" ? "vídeo" : "resultado"} como aprovado na sua biblioteca privada. Ele poderá ser reutilizado nas próximas peças e campanhas.`
          : `Certo. Marquei este ${reviewed.type === "video" ? "vídeo" : "resultado"} como descartado. O histórico fica guardado apenas para auditoria; ele não será sugerido para reutilização.`;
        const batch = adminDb.batch();
        batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
        batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, createdAt: FieldValue.serverTimestamp() });
        batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
        await batch.commit();
        return Response.json({ ok: true, answer, conversationId });
      }
    }

    const preparedCreative = await prepareLatestConversationCreative({ tenantId, conversationId, message, actor });
    if (preparedCreative) {
      const answer = preparedCreative.unavailable
        ? "Encontrei o conceito desta conversa, mas ainda não há uma IA conectada que consiga gerar esse tipo de mídia. Você pode adicionar uma conexão em Configurações; depois, basta pedir para gerar novamente aqui."
        : `Preparei “${preparedCreative.outputTitle}” para gerar ${preparedCreative.format === "video" ? "o vídeo" : "a imagem"}. A autorização de uso de créditos aparece abaixo nesta conversa. Quando você confirmar, a Altum inicia e acompanha tudo aqui.`;
      const batch = adminDb.batch();
      batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
      batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, missionId: preparedCreative.missionId, createdAt: FieldValue.serverTimestamp() });
      batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
      await batch.commit();
      return Response.json({ ok: true, answer, missionId: preparedCreative.missionId, conversationId });
    }

    const plan = planCommand(message);
    let missionId: string | null = null; let answer: string;
    if (plan.shouldCreateMission) {
      const missionRef = adminDb.collection("agent_missions").doc(); missionId = missionRef.id;
      const isCampaign = plan.template === "marketing";
      const batch = adminDb.batch(); const creativeProjectRef = plan.template === "creative" || isCampaign ? adminDb.collection("creative_projects").doc() : null;
      const captureFormRef = plan.template === "product" || isCampaign ? adminDb.collection("capture_forms").doc() : null;
      const landingApprovalRef = captureFormRef ? adminDb.collection("agent_approvals").doc() : null;
      const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const creativeFormat: CreativeFormat = normalized.includes("video") ? "video" : normalized.includes("carrossel") ? "carousel" : normalized.includes("copy") ? "copy" : "image";
      const brandSnap = (creativeProjectRef || captureFormRef) ? await adminDb.collection("brand_profiles").doc(tenantId).get() : null;
      const avatarProfiles = creativeProjectRef ? await adminDb.collection("avatar_profiles").where("tenantId", "==", tenantId).limit(80).get() : null;
      const brandRow = brandSnap?.exists ? brandSnap.data() as { positioning?: unknown; audience?: unknown; tone?: unknown; offers?: unknown; restrictions?: unknown } : null;
      const brand = brandRow ? { positioning: String(brandRow.positioning || ""), audience: String(brandRow.audience || ""), tone: String(brandRow.tone || ""), offers: Array.isArray(brandRow.offers) ? brandRow.offers.map(String) : [], restrictions: Array.isArray(brandRow.restrictions) ? brandRow.restrictions.map(String) : [] } : null;
      const missionContext = attachmentContext.text ? `${plan.objective}\n\nContexto extraído dos anexos privados:\n${attachmentContext.text}`.slice(0, 14_000) : plan.objective;
      const identity = avatarProfiles ? selectIdentityProfile({ tenantId, prompt: message, profiles: avatarProfiles.docs.map((doc) => { const row = doc.data(); return { id: doc.id, tenantId: String(row.tenantId || ""), displayName: String(row.displayName || ""), identityType: row.identityType === "character" ? "character" as const : "person" as const, identityAnchor: String(row.identityAnchor || ""), visualStyle: String(row.visualStyle || ""), voiceDirection: String(row.voiceDirection || ""), status: String(row.status || "") }; }) }) : null;
      const creativeBrief = identity?.anchor ? `${missionContext}\n\nIdentidade que deve permanecer em toda a produção:\n${identity.anchor}`.slice(0, 14_000) : missionContext;
      const creativeDrafts = creativeProjectRef ? buildCreativeDrafts({ title: plan.title, brief: creativeBrief, format: creativeFormat, brand }) : [];
      const creativeSources = creativeProjectRef ? creativeSkillReferences(creativeFormat) : [];
      const landingDraft = captureFormRef ? buildLandingDraft({ title: plan.title, objective: missionContext, brand }) : null;
      const campaignPlan = isCampaign ? buildCampaignPlan({ title: plan.title, objective: missionContext, brand }) : null;
      batch.set(missionRef, { tenantId, conversationId, title: plan.title, objective: plan.objective, attachmentIds, attachmentContext: attachmentContext.text || null, attachmentNotices: attachmentContext.notices, template: plan.template, creativeProjectId: creativeProjectRef?.id || null, captureFormId: captureFormRef?.id || null, campaignPlan, budgetBrl: 0, spentBrl: 0, deadline: null, risk: plan.risk, constraints: plan.constraints, status: "planned", progress: 0, source: "altum_command", createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (creativeProjectRef) batch.set(creativeProjectRef, { tenantId, missionId, title: plan.title, brief: creativeBrief, format: creativeFormat, channel: "A definir", mediaPreference: inferMediaPreference(message), identityProfileId: identity?.id || null, identityProfileName: identity?.displayName || null, identityAnchor: identity?.anchor || null, status: "review", source: "altum_command", createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (captureFormRef && landingDraft && landingApprovalRef) {
        batch.set(captureFormRef, { tenantId, name: landingDraft.name, description: landingDraft.description, sourceLabel: "Landing criada pela Altum", defaultPipelineStage: "captado", defaultOwnerId: null, defaultOwnerName: null, tags: ["altum", "landing", "rascunho"], status: "draft", successMessage: "Recebemos seus dados. Em breve entraremos em contato.", submitLabel: "Quero falar com a equipe", widgetLauncherLabel: "Falar com a equipe", widgetGreeting: "Olá! Como podemos ajudar?", requirePhone: true, requireEmail: true, collectCompany: true, collectMessage: true, fields: [], landing: landingDraft.landing, submissionsCount: 0, lastSubmissionAt: null, source: "altum_command", missionId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, updatedByName: actor.name });
        batch.set(landingApprovalRef, { tenantId, missionId, captureFormId: captureFormRef.id, title: "Publicar landing page", summary: `A Altum criou a landing “${landingDraft.name}”. Ao aprovar, ela ficará pública e passará a receber leads no CRM desta empresa.`, actionType: "publish_capture_landing", risk: "medium", status: "pending", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      }
      if (creativeProjectRef) for (const draft of creativeDrafts) batch.set(adminDb.collection("creative_outputs").doc(), { tenantId, projectId: creativeProjectRef.id, title: draft.title, content: draft.content, type: creativeFormat, sourceSkills: creativeSources.map((skill) => ({ id: skill.id, sourceRepo: skill.sourceRepo, sourceCommit: skill.sourceCommit, license: skill.license })), status: "draft", generator: "altum-command+creative-director", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
      for (const [index, task] of buildMissionTaskSeeds(plan.template).entries()) batch.set(adminDb.collection("agent_tasks").doc(), { tenantId, missionId, title: task.title, agent: task.agent, capability: task.capability, requiresApproval: task.requiresApproval, status: index === 0 ? "ready" : "queued", sequence: index + 1, attempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      answer = isCampaign && campaignPlan
        ? `Entendi. Estruturei uma campanha completa para “${campaignPlan.offer}”: hipótese, funil, matriz de vídeo, imagem, carrossel, copy e landing page. Preparei o primeiro criativo e a landing em rascunho nesta conversa.${identity ? ` A identidade de ${identity.displayName} ficará disponível para manter continuidade nas peças visuais.` : ""} Nada será publicado ou terá mídia paga sem a sua aprovação aqui.`
        : plan.template === "creative"
        ? `Entendi. Criei a missão e já preparei ${creativeDrafts.length} conceitos de ${creativeFormat === "video" ? "vídeo" : creativeFormat === "carousel" ? "carrossel" : creativeFormat === "copy" ? "copy" : "imagem"}.${identity ? ` Vou manter a identidade de ${identity.displayName} como referência de continuidade.` : ""}${attachments.length ? " Usei o conteúdo que foi possível extrair dos anexos privados, sem compartilhá-los com serviços externos." : ""} Eles ficam nesta conversa para sua revisão; quando você escolher ou pedir ajustes, a Altum prepara a geração e traz a aprovação de custo aqui mesmo.`
        : plan.template === "product" && landingDraft
          ? `Entendi. Criei uma landing page completa em rascunho, usando o contexto da marca${attachments.length ? " e os dados extraídos dos seus anexos privados" : ""}. Ela ainda não está pública: a aprovação para publicar aparece nesta conversa. Depois da sua decisão, eu entrego o link pronto para captar leads no CRM.`
          : `${attachmentContext.analysis ? `Leitura privada do anexo:\n${attachmentContext.analysis}\n\n` : ""}Entendi. Transformei seu pedido em uma missão de ${plan.template === "revenue" ? "receita" : plan.template === "marketing" ? "marketing" : "execução"}. Vou organizar o trabalho com especialistas e mantenho nesta conversa os resultados e qualquer decisão necessária antes de uma ação externa.`;
      batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
      batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, missionId, createdAt: FieldValue.serverTimestamp() });
      batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message), kind: "project" }, { merge: true });
      batch.set(adminDb.collection("audit_logs").doc(), { type: "agent_command_mission_created", actorId: actor.uid, actorName: actor.name, tenantId, missionId, conversationId, createdAt: FieldValue.serverTimestamp() });
      await batch.commit();
      await dispatchMissionToOpenClaw({
        missionId,
        tenantId,
        conversationId,
        title: plan.title,
        objective: plan.objective,
        template: plan.template,
        risk: plan.risk,
        budgetBrl: 0,
        constraints: plan.constraints,
        operation: "plan",
        actorId: actor.uid,
      });
    } else {
      const [missionSnap, memorySnap, ideasSnap, crossConversationSnap] = await Promise.all([
        adminDb.collection("agent_missions").where("tenantId", "==", tenantId).limit(100).get(),
        adminDb.collection("agent_memories").where("tenantId", "==", tenantId).limit(100).get(),
        adminDb.collection("agent_ideas").where("ownerId", "==", actor.uid).limit(100).get(),
        adminDb.collection("agent_command_messages").where("ownerId", "==", actor.uid).limit(200).get(),
      ]);
      const missionCount = missionSnap.size;
      const fallback = `Posso pesquisar, planejar, criar materiais, organizar um projeto ou colocar uma missão em movimento para ${tenant.get("name") || "esta empresa"}. Para uma execução, basta pedir do seu jeito — eu separo o trabalho e trago decisões importantes para esta conversa.`;
      const historySnapshot = await adminDb.collection("agent_command_messages").where("conversationId", "==", conversationId).limit(40).get();
      const history = historySnapshot.docs
        .map((doc) => {
          const item = doc.data();
          return {
            ownerId: typeof item.ownerId === "string" ? item.ownerId : "",
            tenantId: typeof item.tenantId === "string" ? item.tenantId : "",
            role: item.role === "assistant" ? "assistant" as const : "user" as const,
            content: typeof item.content === "string" ? item.content : "",
            createdAt: date(item.createdAt) || "",
          };
        })
        .filter((item) => item.ownerId === actor.uid && item.tenantId === tenantId && item.content)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice(-12)
        .map(({ role, content }) => ({ role, content }));
      const rememberedContext = formatPrivateConversationMemory({
        memories: memorySnap.docs.map((doc) => ({ summary: String(doc.get("summary") || ""), status: String(doc.get("status") || "candidate") })),
        ideas: ideasSnap.docs.map((doc) => ({ tenantId: String(doc.get("tenantId") || ""), title: String(doc.get("title") || ""), content: String(doc.get("content") || "") })).filter((item) => item.tenantId === tenantId).map(({ title, content }) => ({ title, content })),
        turns: crossConversationSnap.docs.map((doc) => {
          const row = doc.data(); return { role: row.role === "assistant" ? "assistant" as const : "user" as const, content: String(row.content || ""), conversationId: String(row.conversationId || "legacy"), createdAt: date(row.createdAt) || "" , tenantId: String(row.tenantId || "") };
        }).filter((item) => item.tenantId === tenantId).map(({ role, content, conversationId, createdAt }) => ({ role, content, conversationId, createdAt })),
        currentConversationId: conversationId,
      });
      const copilot = await runBusinessCopilot({ tenantId, question: message, facts: `Empresa: ${String(tenant.get("name") || tenantId)}. Missões registradas: ${missionCount}.${rememberedContext ? `\n\nMemória privada da empresa:\n${rememberedContext}` : ""}\n\nResponda de forma útil, direta e sem alegar ter executado acessos externos não confirmados.`, deterministicAnswer: fallback, history });
      answer = copilot.answer || fallback;
      const batch = adminDb.batch();
      batch.set(userRef, { ownerId: actor.uid, tenantId, conversationId, role: "user", content: message, attachments, createdAt: FieldValue.serverTimestamp() });
      batch.set(assistantRef, { ownerId: actor.uid, tenantId, conversationId, role: "assistant", content: answer, provider: copilot.provider || "deterministic", model: copilot.model || null, createdAt: FieldValue.serverTimestamp() });
      batch.set(conversationRef, { updatedAt: FieldValue.serverTimestamp(), title: titleFrom(message) }, { merge: true });
      await batch.commit();
    }
    return Response.json({ ok: true, answer, missionId, conversationId });
  } catch (error) { return failure(error); }
}
