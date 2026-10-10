import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildCreativeDrafts, type CreativeFormat } from "@/lib/server/agent-os/creative-drafts";
import { creativeSkillReferences } from "@/lib/server/agent-os/external-skills";
import { recordAgentMemory } from "@/lib/server/agent-os/memory";
import { mediaConnectionAvailability, planMediaConnections, routeCreativeModel, routeMediaConnection } from "@/lib/server/agent-os/creative-model-router";

const createSchema = z.object({ action: z.literal("create"), tenantId: z.string().trim().min(1).max(180), title: z.string().trim().min(4).max(140), brief: z.string().trim().min(12).max(2400), format: z.enum(["image", "carousel", "video", "copy"]), channel: z.string().trim().min(2).max(80) });
const generateSchema = z.object({ action: z.literal("generate"), projectId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/) });
const queueSchema = z.object({ action: z.literal("queue_media"), projectId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/), outputId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/), connectionId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/).optional() });
type CreativeConnection = { providerId?: unknown; scope?: unknown; tenantId?: unknown; capabilities?: unknown; status?: unknown; displayName?: unknown; health?: unknown; credential?: unknown };

function date(value: unknown) { return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null; }
function failure(error: unknown) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha no Creative Studio:", error); return Response.json({ error: "Não foi possível concluir a operação criativa." }, { status: 500 }); }
function mediaCapability(format: CreativeFormat) { return format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE"; }

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const [projects, outputs, jobs, connections, tenants] = await Promise.all([
      adminDb.collection("creative_projects").limit(100).get(), adminDb.collection("creative_outputs").limit(300).get(), adminDb.collection("creative_jobs").limit(300).get(), adminDb.collection("tool_connections").limit(200).get(), adminDb.collection("tenants").orderBy("__name__").limit(200).get(),
    ]);
    const outputsByProject = new Map<string, Array<Record<string, unknown>>>();
    for (const output of outputs.docs) { const row = output.data(); const projectId = String(row.projectId || ""); const current = outputsByProject.get(projectId) || []; current.push({ id: output.id, title: String(row.title || "Rascunho"), content: String(row.content || ""), status: String(row.status || "draft"), createdAt: date(row.createdAt) }); outputsByProject.set(projectId, current); }
    const jobsByOutput = new Map<string, Array<Record<string, unknown>>>();
    for (const job of jobs.docs) { const row = job.data(); const outputId = String(row.outputId || ""); const current = jobsByOutput.get(outputId) || []; current.push({ id: job.id, status: String(row.status || "queued"), providerName: String(row.providerName || row.providerId || "Provider"), capability: String(row.capability || ""), assetUrl: typeof row.assetUrl === "string" ? row.assetUrl : null, createdAt: date(row.createdAt), approvalId: typeof row.approvalId === "string" ? row.approvalId : null }); jobsByOutput.set(outputId, current); }
    const availableConnections = connections.docs.map((doc) => { const row = doc.data() as CreativeConnection; return { id: doc.id, providerId: String(row.providerId || ""), displayName: String(row.displayName || row.providerId || "Conexão"), scope: row.scope === "tenant" ? "tenant" : "platform", tenantId: typeof row.tenantId === "string" ? row.tenantId : null, capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String) : [], status: String(row.status || "pending_config"), health: row.health, credentialConfigured: Boolean(row.credential) }; }).filter((connection) => connection.credentialConfigured && ["configured_unapproved", "healthy", "approved"].includes(connection.status) && mediaConnectionAvailability({ status: connection.status, health: connection.health }).available);
    return Response.json({
      items: projects.docs.map((doc) => { const row = doc.data(); const projectOutputs = (outputsByProject.get(doc.id) || []).map((output) => ({ ...output, jobs: jobsByOutput.get(String(output.id)) || [] })); return { id: doc.id, tenantId: String(row.tenantId || ""), title: String(row.title || ""), brief: String(row.brief || ""), format: String(row.format || "image"), channel: String(row.channel || ""), status: String(row.status || "draft"), outputs: projectOutputs }; }),
      connections: availableConnections,
      tenants: tenants.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name") || doc.id) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const body = await request.json() as { action?: unknown };
    if (body.action === "create") {
      const parsed = createSchema.safeParse(body); if (!parsed.success) throw new RouteAuthError(400, "invalid_project", "Revise empresa, briefing, formato e canal."); const input = parsed.data;
      if (!(await adminDb.collection("tenants").doc(input.tenantId).get()).exists) throw new RouteAuthError(404, "tenant_missing", "Empresa não encontrada.");
      const ref = adminDb.collection("creative_projects").doc();
      await ref.set({ ...input, status: "draft", createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await adminDb.collection("audit_logs").add({ type: "creative_project_created", actorId: actor.uid, actorName: actor.name, tenantId: input.tenantId, projectId: ref.id, createdAt: FieldValue.serverTimestamp() });
      return Response.json({ ok: true, id: ref.id }, { status: 201 });
    }
    if (body.action === "queue_media") return queueMedia(body, actor);
    return generateDrafts(body, actor);
  } catch (error) { return failure(error); }
}

async function queueMedia(body: unknown, actor: { uid: string; name: string }) {
  const parsed = queueSchema.safeParse(body); if (!parsed.success) throw new RouteAuthError(400, "invalid_media_job", "Escolha um rascunho válido para gerar."); const input = parsed.data;
  const [projectSnap, outputSnap] = await Promise.all([adminDb.collection("creative_projects").doc(input.projectId).get(), adminDb.collection("creative_outputs").doc(input.outputId).get()]);
  if (!projectSnap.exists || !outputSnap.exists) throw new RouteAuthError(404, "creative_missing", "Projeto ou rascunho criativo não encontrado.");
  const project = projectSnap.data()!; const output = outputSnap.data()!; const format = String(project.format || "image") as CreativeFormat;
  const capability = mediaCapability(format);
  const identityProfileId = typeof project.identityProfileId === "string" ? project.identityProfileId : "";
  const identityProfileSnap = identityProfileId ? await adminDb.collection("avatar_profiles").doc(identityProfileId).get() : null;
  const identityProfile = identityProfileSnap && identityProfileSnap.exists && String(identityProfileSnap.get("tenantId") || "") === String(project.tenantId || "") ? identityProfileSnap.data()! : null;
  const preferredIdentityProvider = identityProfile?.status === "anchored" && typeof identityProfile.anchorProviderId === "string" && typeof identityProfile.anchorReferenceId === "string" ? identityProfile.anchorProviderId : null;
  let connectionId = input.connectionId || "";
  let connectionRoutingReason: string | null = null;
  let fallbackConnectionIds: string[] = [];
  let connectionSnap = connectionId ? await adminDb.collection("tool_connections").doc(connectionId).get() : null;
  if (!connectionSnap) {
    const connections = await adminDb.collection("tool_connections").limit(200).get();
    const routingInput = {
      tenantId: String(project.tenantId || ""), capability, prompt: String(output.content || project.brief || ""), preference: ["economy", "balanced", "quality", "private"].includes(String(project.mediaPreference || "")) ? String(project.mediaPreference) as "economy" | "balanced" | "quality" | "private" : undefined, preferredProviderId: preferredIdentityProvider,
      connections: connections.docs.map((doc) => {
        const data = doc.data() as CreativeConnection;
        return { id: doc.id, providerId: String(data.providerId || ""), displayName: typeof data.displayName === "string" ? data.displayName : undefined, capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [], status: String(data.status || "pending_config"), credentialConfigured: Boolean(data.credential), scope: data.scope === "tenant" ? "tenant" as const : "platform" as const, tenantId: typeof data.tenantId === "string" ? data.tenantId : null, creativeModel: (data as { creativeModel?: unknown }).creativeModel, health: (data as CreativeConnection).health };
      }),
    };
    const automaticPlan = planMediaConnections(routingInput);
    const automaticRoute = automaticPlan.routes[0] || null;
    if (!automaticRoute) throw new RouteAuthError(409, "media_connection_missing", `Conecte uma IA que gere ${format === "video" ? "vídeos" : "imagens"} antes de continuar.`);
    connectionId = automaticRoute.connection.id;
    connectionRoutingReason = automaticRoute.reason;
    fallbackConnectionIds = automaticPlan.routes.slice(1).map((item) => item.connection.id);
    connectionSnap = connections.docs.find((doc) => doc.id === connectionId) || null;
  }
  if (!connectionSnap || !connectionSnap.exists) throw new RouteAuthError(404, "connection_missing", "Conexão de mídia não encontrada.");
  const connection = connectionSnap.data() as CreativeConnection;
  if (["copy"].includes(format)) throw new RouteAuthError(409, "media_not_applicable", "Copy não precisa de renderização de mídia.");
  if (String(output.projectId || "") !== input.projectId) throw new RouteAuthError(409, "output_mismatch", "Este rascunho não pertence ao projeto informado.");
  if (connection.scope === "tenant" && connection.tenantId !== project.tenantId) throw new RouteAuthError(403, "connection_scope", "Esta conexão não pertence à empresa do projeto.");
  if (!connection.credential) throw new RouteAuthError(409, "connection_not_ready", "Esta conexão ainda não possui uma chave salva. Escolha uma rota ativa ou conecte a chave.");
  if (!mediaConnectionAvailability({ status: String(connection.status || ""), health: connection.health }).available) throw new RouteAuthError(409, "connection_not_ready", "Esta conexão está indisponível no momento. A Altum tentará outra rota saudável automaticamente.");
  const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities.map(String) : [];
  if (!capabilities.includes(capability)) throw new RouteAuthError(409, "capability_missing", `A conexão escolhida não oferece ${capability === "GENERATE_VIDEO" ? "geração de vídeo" : "geração de imagem"}.`);
  const identityReferenceId = identityProfile && String(connection.providerId || "") === String(identityProfile.anchorProviderId || "") && typeof identityProfile.anchorReferenceId === "string" ? identityProfile.anchorReferenceId : null;
  const identityVideoChain = format === "video" && String(connection.providerId || "").toLowerCase() === "higgsfield" && Boolean(identityReferenceId);
  if (identityVideoChain && !capabilities.includes("GENERATE_IMAGE")) throw new RouteAuthError(409, "identity_frame_capability_missing", "Para criar este vídeo com identidade persistente, esta conexão também precisa permitir geração de imagem.");
  const route = routeCreativeModel({ providerId: String(connection.providerId || ""), format: identityVideoChain ? "image" : format, prompt: String(output.content || project.brief || ""), fallbackModel: (connection as { creativeModel?: unknown }).creativeModel });
  const jobRef = adminDb.collection("creative_jobs").doc(); const approvalRef = adminDb.collection("agent_approvals").doc(); const runRef = adminDb.collection("agent_runs").doc();
  const batch = adminDb.batch();
  // An identity chain is intentionally pinned to its approved identity adapter.
  // Ordinary creative jobs get a persisted fallback order so the worker can
  // finish the request even when one provider is out of quota.
  batch.set(jobRef, { tenantId: project.tenantId, projectId: input.projectId, outputId: input.outputId, providerId: String(connection.providerId || ""), providerName: String(connection.displayName || connection.providerId || "Provider"), connectionId, fallbackConnectionIds: identityVideoChain ? [] : fallbackConnectionIds, capability: identityVideoChain ? "GENERATE_IMAGE" : capability, format: identityVideoChain ? "image" : format, prompt: String(output.content || project.brief || "").slice(0, 12_000), creativeModel: route.model, identityProfileId: identityProfileId || null, identityReferenceId, routePurpose: route.purpose, routingReason: route.reason, connectionRoutingReason, pipeline: identityVideoChain ? { kind: "identity_image_to_video", finalFormat: "video", nextModel: "bytedance/seedance-2.5/image-to-video", autoStartApproved: true } : null, status: "pending_approval", approvalId: approvalRef.id, createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(approvalRef, { tenantId: project.tenantId, missionId: typeof project.missionId === "string" ? project.missionId : null, creativeJobId: jobRef.id, title: `Autorizar geração de ${format === "video" ? "vídeo" : "imagem"}`, summary: `A Altum preparou “${String(output.title || "criativo")}" usando ${String(connection.displayName || connection.providerId || "o provider selecionado")}.${identityReferenceId ? " A identidade aprovada será usada como referência visual." : ""} ${identityVideoChain ? " Ela vai criar uma imagem-base fiel à identidade e animá-la em um vídeo; são duas etapas de geração dentro desta única autorização." : ""} ${connectionRoutingReason ? `${connectionRoutingReason} ` : ""}${route.reason} Isso pode consumir créditos e produzirá apenas uma versão para sua revisão.`, actionType: "creative_media_generation", risk: "medium", status: "pending", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(runRef, { tenantId: project.tenantId, agent: "Creative Producer", capability, status: "waiting_approval", projectId: input.projectId, outputId: input.outputId, creativeJobId: jobRef.id, outputSummary: `Job de ${format} aguardando aprovação de custo e provider.`, createdAt: FieldValue.serverTimestamp() });
  batch.set(adminDb.collection("audit_logs").doc(), { type: "creative_media_job_requested", actorId: actor.uid, actorName: actor.name, tenantId: project.tenantId, projectId: input.projectId, outputId: input.outputId, creativeJobId: jobRef.id, providerId: connection.providerId || null, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return Response.json({ ok: true, jobId: jobRef.id, approvalId: approvalRef.id, status: "pending_approval" }, { status: 201 });
}

async function generateDrafts(body: unknown, actor: { uid: string; name: string }) {
  const parsed = generateSchema.safeParse(body); if (!parsed.success) throw new RouteAuthError(400, "invalid_generation", "Projeto criativo inválido.");
  const projectRef = adminDb.collection("creative_projects").doc(parsed.data.projectId); const projectSnap = await projectRef.get(); if (!projectSnap.exists) throw new RouteAuthError(404, "project_missing", "Projeto criativo não encontrado.");
  const project = projectSnap.data()!; const format = String(project.format || "image") as CreativeFormat; const brandSnap = await adminDb.collection("brand_profiles").doc(String(project.tenantId || "")).get();
  const brand = brandSnap.exists ? brandSnap.data() as { positioning?: string; audience?: string; tone?: string; offers?: string[]; restrictions?: string[] } : null; const sourceSkills = creativeSkillReferences(format);
  const drafts = buildCreativeDrafts({ title: String(project.title || ""), brief: String(project.brief || ""), format, brand: brand ? { positioning: String(brand.positioning || ""), audience: String(brand.audience || ""), tone: String(brand.tone || ""), offers: Array.isArray(brand.offers) ? brand.offers.map(String) : [], restrictions: Array.isArray(brand.restrictions) ? brand.restrictions.map(String) : [] } : null });
  const batch = adminDb.batch(); const runRef = adminDb.collection("agent_runs").doc();
  for (const draft of drafts) batch.set(adminDb.collection("creative_outputs").doc(), { tenantId: project.tenantId, projectId: projectRef.id, title: draft.title, content: draft.content, type: project.format, sourceSkills: sourceSkills.map((skill) => ({ id: skill.id, sourceRepo: skill.sourceRepo, sourceCommit: skill.sourceCommit, license: skill.license })), status: "draft", generator: "creative-director-rules+imported-skills", createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
  batch.set(projectRef, { status: "review", updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
  batch.set(runRef, { tenantId: project.tenantId, agent: "Creative Director", capability: "GENERATE_CREATIVE", status: "completed", projectId: projectRef.id, sourceSkills: sourceSkills.map((skill) => skill.id), outputSummary: `${drafts.length} rascunhos criados para revisão humana.`, createdAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() });
  if (typeof project.missionId === "string" && project.missionId) batch.set(adminDb.collection("agent_command_messages").doc(), { ownerId: actor.uid, tenantId: project.tenantId, conversationId: typeof project.conversationId === "string" ? project.conversationId : "legacy", role: "assistant", missionId: project.missionId, content: `Preparei ${drafts.length} conceitos criativos em rascunho para “${String(project.title || "este projeto")}”. Escolha um conceito e uma conexão de mídia para preparar a geração com aprovação de custo.`, agentRunId: runRef.id, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  await recordAgentMemory({ tenantId: String(project.tenantId || ""), projectId: projectRef.id, kind: "creative_direction", summary: `Direção criativa criada para ${String(project.title || "projeto")}: ${String(project.brief || "").slice(0, 800)}`, evidence: drafts.map((draft) => ({ title: draft.title, type: project.format, sourceSkills: sourceSkills.map((skill) => skill.id) })), confidence: brand ? 0.78 : 0.48, sourceRunId: runRef.id, createdBy: actor.uid });
  return Response.json({ ok: true, count: drafts.length, sourceSkills: sourceSkills.map((skill) => skill.id) });
}
