import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { executeCreativeJobWithFallback, refreshCreativeJob, type RoutedCreativeExecutionResult } from "@/lib/server/agent-os/creative-executor";
import { loadCreativeExecutionCandidates } from "@/lib/server/agent-os/creative-execution-routing";
import { mediaConnectionAvailability, planMediaConnections } from "@/lib/server/agent-os/creative-model-router";
import { recordCreativeConnectionAttempts } from "@/lib/server/agent-os/creative-connection-health";
import { persistCreativeAsset, signedCreativeAssetUrl } from "@/lib/server/agent-os/creative-asset-storage";
import { classifyPlatformRender } from "@/lib/server/mcp/platform-creative-policy";
import { registerAdminCommercialTools } from "@/lib/server/mcp/admin-commercial-tools";
import { registerAdminAgentOsTools } from "@/lib/server/agent-os/admin-mcp-tools";
import type { Grant } from "@/lib/mcp/contracts";

type PlatformActor = { userId: string; connectionId: string; scopes: readonly string[]; grants?: Grant[]; origin?: string };
type OAuthRuntime = { grantedScopes: readonly string[]; resourceMetadataUrl: string };

const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const safeText = z.string().trim().min(1).max(500);
const connectionPatch = z.object({
  displayName: safeText.optional(),
  chatModel: z.string().trim().max(180).nullable().optional(),
  modelCatalog: z.array(z.string().trim().min(1).max(180)).max(200).optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();
const creativeFormat = z.enum(["image", "carousel", "video", "copy"]);
const missionStatus = z.enum(["planned", "running", "paused", "completed", "cancelled"]);
const renderableConnectionStatuses = ["configured_unapproved", "healthy", "approved"] as const;

function sanitizeConnection(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const row = doc.data();
  return {
    id: doc.id,
    providerId: String(row.providerId || ""),
    displayName: String(row.displayName || row.providerId || "Altum"),
    connectionType: String(row.connectionType || "api"),
    baseUrl: typeof row.baseUrl === "string" ? row.baseUrl : null,
    chatModel: typeof row.chatModel === "string" ? row.chatModel : null,
    modelCatalog: Array.isArray(row.modelCatalog) ? row.modelCatalog.map(String).slice(0, 200) : [],
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String).slice(0, 40) : [],
    notes: typeof row.notes === "string" ? row.notes.slice(0, 2000) : "",
    status: String(row.status || "pending_config"),
    health: row.health && typeof row.health === "object" ? row.health : null,
    credentialConfigured: Boolean(row.credential),
  };
}

function oauthChallenge(runtime: OAuthRuntime, requiredScopes: readonly string[]) {
  return `Bearer resource_metadata="${runtime.resourceMetadataUrl}", error="insufficient_scope", error_description="Autorize as permissoes administrativas necessarias", scope="${requiredScopes.join(" ")}"`;
}

function createPlatformCreativeConcepts(title: string, brief: string, format: z.infer<typeof creativeFormat>) {
  const labels = format === "video" ? ["Narrativa principal", "Cena de impacto", "Fechamento"]
    : format === "carousel" ? ["Gancho", "Desenvolvimento", "Fechamento"]
      : format === "copy" ? ["Mensagem central", "Variação direta", "Chamada para ação"]
        : ["Direção principal", "Variação editorial", "Variação de conversão"];
  return labels.map((label, index) => ({ title: `${title} — ${label}`, content: `Formato: ${format}\nConceito: ${label}\nBriefing: ${brief}\nDireção: proposta ${index + 1} para a marca Altum, com linguagem clara, comercial e sem promessas não comprovadas.` }));
}

/**
 * Exclusive platform-admin surface. It deliberately has no tenantId input and
 * never reads customer CRM, inbox, campaigns, creative projects or agents.
 */
export function createPlatformAdminServer(actor: PlatformActor | null, oauth?: OAuthRuntime) {
  const server = new McpServer(
    { name: "altum-platform-admin", version: "1.0.0" },
    { instructions: "MCP administrativo interno da Altum. Use somente recursos globais da plataforma. Nunca liste, selecione ou acesse empresas, clientes, CRM, conversas, campanhas ou dados de tenant. Credenciais e segredos nunca sao exibidos nem alterados." },
  );
  const register = <S extends z.ZodType>(name: string, description: string, inputSchema: S, requiredScopes: readonly string[], handler: (input: z.infer<S>) => Promise<Record<string, unknown>>) => {
    // The MCP SDK's generic callback type cannot retain a locally generic Zod
    // schema through this helper. Runtime validation remains the SDK's normal
    // Zod validation, while this adapter keeps each registration typed at its
    // call site.
    (server.registerTool as (toolName: string, config: Record<string, unknown>, callback: (input: unknown) => Promise<unknown>) => void)(name, {
      description,
      inputSchema,
      annotations: { readOnlyHint: name.startsWith("altum_admin_get_") || name.startsWith("altum_admin_list_"), destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [...requiredScopes] }] },
    }, async (input) => {
      if (!actor || !requiredScopes.every((scope) => actor.scopes.includes(scope))) {
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code: "INSUFFICIENT_SCOPE" } }) }], ...(oauth ? { _meta: { "mcp/www_authenticate": [oauthChallenge(oauth, requiredScopes)] } } : {}) };
      }
      try {
        const data = await handler(input as z.infer<S>);
        return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        const code = error instanceof Error ? error.message : "UNAVAILABLE";
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code: ["NOT_FOUND", "INVALID_INPUT"].includes(code) ? code : "UNAVAILABLE" } }) }] };
      }
    });
  };

  register("altum_admin_get_platform_status", "Mostra o estado global do MCP administrativo e das conexoes de IA da plataforma, sem dados de empresas ou clientes.", z.object({}).strict(), ["context:read"], async () => {
    const [policy, connections] = await Promise.all([
      adminDb.collection("platform_settings").doc("admin_mcp").get(),
      adminDb.collection("tool_connections").where("scope", "==", "platform").limit(201).get(),
    ]);
    const rows = connections.docs.map(sanitizeConnection);
    return { adminMcpEnabled: policy.get("enabled") === true, platformConnections: { total: rows.length, partial: rows.length > 200, ready: rows.filter((row) => mediaConnectionAvailability(row).available).length }, boundaries: "Ferramentas comerciais e de mídia exigem contexto explícito da empresa e nunca exibem credenciais." };
  });

  register("altum_admin_list_ai_connections", "Lista apenas conexoes globais de IA da Altum, com modelos e capacidades. Nunca retorna credenciais, tokens ou conexoes de empresas.", z.object({}).strict(), ["integrations:read"], async () => {
    const snap = await adminDb.collection("tool_connections").where("scope", "==", "platform").limit(201).get();
    return { items: snap.docs.slice(0, 200).map(sanitizeConnection), partial: snap.size > 200 };
  });

  register("altum_admin_update_ai_connection", "Atualiza metadados seguros de uma conexao global de IA: nome, modelo, catalogo, capacidades e observacoes. Nao aceita nem modifica credenciais, chaves, URLs de segredo ou conexoes de empresas. Use somente apos confirmacao explicita do administrador.", z.object({ connectionId: id, patch: connectionPatch }).strict(), ["integrations:write"], async ({ connectionId, patch }) => {
    if (!Object.keys(patch).length) throw new Error("INVALID_INPUT");
    const ref = adminDb.collection("tool_connections").doc(connectionId);
    const snap = await ref.get();
    if (!snap.exists || snap.get("scope") !== "platform") throw new Error("NOT_FOUND");
    await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor!.userId }, { merge: true });
    await adminDb.collection("audit_logs").add({ type: "admin_mcp_platform_ai_connection_updated", actorId: actor!.userId, connectionId, changedFields: Object.keys(patch), createdAt: FieldValue.serverTimestamp() });
    return { ok: true, connectionId, changedFields: Object.keys(patch) };
  });

  register("altum_admin_get_ai_runtime_summary", "Retorna apenas metricas agregadas da IA da Altum por provedor nos ultimos 30 dias; nao inclui empresas, usuarios, prompts ou execucoes individuais.", z.object({}).strict(), ["reports:read"], async () => {
    const since = Date.now() - 30 * 86400000;
    const snap = await adminDb.collection("ai_usage_ledger").orderBy("createdAt", "desc").limit(1000).get();
    const entries = snap.docs.map((doc) => doc.data()).filter((row) => {
      const value = row.createdAt;
      const time = value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
      return time >= since;
    });
    const providers = new Map<string, { provider: string; runs: number; estimatedCostUsd: number; failures: number }>();
    for (const row of entries) { const provider = String(row.provider || "unknown"); const item = providers.get(provider) || { provider, runs: 0, estimatedCostUsd: 0, failures: 0 }; item.runs++; item.estimatedCostUsd += Number(row.estimatedCostUsd || 0); if (row.status === "error") item.failures++; providers.set(provider, item); }
    return { periodDays: 30, runs: entries.length, providers: [...providers.values()].map((item) => ({ ...item, estimatedCostUsd: Number(item.estimatedCostUsd.toFixed(4)) })).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd) };
  });

  register("altum_admin_create_agent_mission", "Cria uma missão interna da Altum para os agentes administrativos. A missão não recebe empresa, cliente ou dados comerciais. Use para planejar, orquestrar e acompanhar trabalho de IA da própria plataforma.", z.object({ title: z.string().trim().min(4).max(160), objective: z.string().trim().min(12).max(4000), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), constraints: z.array(z.string().trim().min(3).max(500)).max(20).default([]) }).strict(), ["ai:draft"], async ({ title, objective, priority, constraints }) => {
    const ref = adminDb.collection("platform_agent_missions").doc();
    await ref.set({ title, objective, priority, constraints, status: "planned", createdBy: actor!.userId, createdVia: "admin_mcp", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await adminDb.collection("audit_logs").add({ type: "admin_mcp_platform_agent_mission_created", actorId: actor!.userId, missionId: ref.id, createdAt: FieldValue.serverTimestamp() });
    return { ok: true, missionId: ref.id, status: "planned", next: "A missão está registrada para a orquestração interna da Altum. Use altum_admin_update_agent_mission para alterar o estado e registrar resultados." };
  });

  register("altum_admin_list_agent_missions", "Lista missões internas da Altum criadas pelo MCP administrativo. Não retorna missões de empresas clientes.", z.object({ limit: z.number().int().min(1).max(100).default(30) }).strict(), ["context:read"], async ({ limit }) => {
    const snap = await adminDb.collection("platform_agent_missions").orderBy("createdAt", "desc").limit(limit).get();
    return { items: snap.docs.map((doc) => { const row = doc.data(); return { id: doc.id, title: String(row.title || ""), objective: String(row.objective || ""), priority: String(row.priority || "normal"), status: String(row.status || "planned"), result: typeof row.result === "string" ? row.result : null }; }) };
  });

  register("altum_admin_update_agent_mission", "Atualiza o estado ou resultado de uma missão interna da Altum. Não altera agentes, missões ou automações de empresas clientes.", z.object({ missionId: id, status: missionStatus.optional(), result: z.string().trim().min(3).max(6000).optional() }).strict().refine((value) => value.status !== undefined || value.result !== undefined, "Informe status ou resultado."), ["ai:draft"], async ({ missionId, status, result }) => {
    const ref = adminDb.collection("platform_agent_missions").doc(missionId); if (!(await ref.get()).exists) throw new Error("NOT_FOUND");
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: actor!.userId }; if (status) patch.status = status; if (result) patch.result = result;
    await ref.set(patch, { merge: true });
    return { ok: true, missionId, ...(status ? { status } : {}), ...(result ? { result } : {}) };
  });

  register("altum_admin_create_creative_concepts", "Cria conceitos criativos globais para a marca Altum a partir de um briefing. Não associa o material a empresa cliente, não usa dados de tenant e não consome créditos de mídia.", z.object({ title: z.string().trim().min(4).max(160), brief: z.string().trim().min(12).max(6000), format: creativeFormat, channel: z.string().trim().min(2).max(80).default("Altum") }).strict(), ["ai:draft"], async ({ title, brief, format, channel }) => {
    const drafts = createPlatformCreativeConcepts(title, brief, format);
    const projectRef = adminDb.collection("platform_creative_projects").doc(); const batch = adminDb.batch();
    batch.set(projectRef, { title, brief, format, channel, status: "review", createdBy: actor!.userId, createdVia: "admin_mcp", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const concepts: Array<{ id: string; title: string }> = [];
    for (const draft of drafts) { const ref = adminDb.collection("platform_creative_concepts").doc(); concepts.push({ id: ref.id, title: draft.title }); batch.set(ref, { projectId: projectRef.id, title: draft.title, content: draft.content, format, status: "draft", createdBy: actor!.userId, createdAt: FieldValue.serverTimestamp() }); }
    batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_platform_creative_concepts_created", actorId: actor!.userId, projectId: projectRef.id, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
    return { ok: true, projectId: projectRef.id, status: "review", concepts, next: "Os conceitos estão prontos para revisão. Geração de mídia com custo continuará exigindo sua confirmação explícita." };
  });

  register("altum_admin_list_creative_concepts", "Lista projetos e conceitos criativos globais da marca Altum. Não mostra criativos de empresas clientes.", z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(), ["context:read"], async ({ limit }) => {
    const projects = await adminDb.collection("platform_creative_projects").orderBy("createdAt", "desc").limit(limit).get();
    const ids = projects.docs.map((doc) => doc.id); const concepts = ids.length ? await adminDb.collection("platform_creative_concepts").where("projectId", "in", ids.slice(0, 10)).limit(200).get() : null;
    const byProject = new Map<string, Array<Record<string, unknown>>>(); for (const doc of concepts?.docs || []) { const row = doc.data(); const current = byProject.get(String(row.projectId)) || []; current.push({ id: doc.id, title: String(row.title || ""), format: String(row.format || ""), status: String(row.status || "draft"), content: String(row.content || "").slice(0, 4000) }); byProject.set(String(row.projectId), current); }
    return { items: projects.docs.map((doc) => { const row = doc.data(); return { id: doc.id, title: String(row.title || ""), brief: String(row.brief || ""), format: String(row.format || ""), channel: String(row.channel || ""), status: String(row.status || "review"), concepts: byProject.get(doc.id) || [] }; }) };
  });

  register("altum_admin_list_media_connections", "Lista conexões globais compatíveis com imagens e vídeos sem revelar segredos nem dados de clientes.", z.object({}).strict(), ["integrations:read"], async () => {
    const snap = await adminDb.collection("tool_connections").where("scope", "==", "platform").limit(201).get();
    return { items: snap.docs.map(sanitizeConnection).filter((row) => row.capabilities.some((capability) => ["GENERATE_IMAGE", "GENERATE_VIDEO"].includes(capability))), partial: snap.size > 200 };
  });

  register("altum_admin_get_creative_render", "Consulta somente jobs globais da plataforma; nunca lê resultados de clientes.", z.object({ jobId: id }).strict(), ["context:read"], async ({ jobId }) => {
    const doc = await adminDb.collection("platform_creative_jobs").doc(jobId).get();
    if (!doc.exists || doc.get("createdBy") !== actor!.userId) throw new Error("NOT_FOUND");
    const row = doc.data()!;
    const asset = row.assetId ? await adminDb.collection("platform_creative_assets").doc(String(row.assetId)).get() : null;
    const storagePath = asset?.exists && typeof asset.get("storagePath") === "string" ? String(asset.get("storagePath")) : "";
    const assetUrl = storagePath.startsWith("agent-media/platform/")
      ? await signedCreativeAssetUrl(storagePath, `${jobId}.${row.format === "video" ? "mp4" : "png"}`)
      : null;
    return { jobId, status: String(row.status || "unknown"), format: String(row.format || ""), providerId: String(row.providerId || ""), assetId: typeof row.assetId === "string" ? row.assetId : null, assetUrl, stored: Boolean(assetUrl), failureReason: typeof row.failureReason === "string" ? row.failureReason.slice(0, 300) : null };
  });

  register("altum_admin_prepare_creative_render", "Prepara uma imagem ou vídeo global na Altum, sem consumir créditos. Renderização efetiva requer aprovação separada.", z.object({ conceptId: id, connectionId: id.optional() }).strict(), ["ai:draft"], async ({ conceptId, connectionId }) => {
    const concept = await adminDb.collection("platform_creative_concepts").doc(conceptId).get();
    if (!concept.exists) throw new Error("NOT_FOUND");
    const format = String(concept.get("format") || "");
    if (!["image", "video"].includes(format)) throw new Error("INVALID_INPUT");
    const capability = format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE";
    const candidateSnaps = connectionId
      ? [await adminDb.collection("tool_connections").doc(connectionId).get()]
      : (await adminDb.collection("tool_connections").where("scope", "==", "platform").limit(201).get()).docs;
    const connection = candidateSnaps.find((item) => item.exists && item.get("scope") === "platform" && item.get("credential") && ["healthy", "approved"].includes(String(item.get("status") || "")) && Array.isArray(item.get("capabilities")) && (item.get("capabilities") as string[]).includes(capability));
    if (!connection) throw new Error("NOT_FOUND");
    // No provider call here. The selected route is saved for approval and
    // revalidated again at execution time.
    const ref = adminDb.collection("platform_creative_jobs").doc();
    await ref.set({ conceptId, projectId: concept.get("projectId"), format, connectionId: connection.id, providerId: connection.get("providerId") || null, prompt: String(concept.get("content") || "").slice(0, 6000), status: "awaiting_approval", createdBy: actor!.userId, createdAt: FieldValue.serverTimestamp() });
    await adminDb.collection("audit_logs").add({ type: "admin_mcp_platform_render_prepared", actorId: actor!.userId, jobId: ref.id, createdAt: FieldValue.serverTimestamp() });
    return { jobId: ref.id, status: "awaiting_approval", estimatedCost: "unknown", next: "Exige confirmação explícita antes de chamar o provedor. Nenhum crédito foi utilizado." };
  });

  register("altum_admin_confirm_creative_render", "Confirma o gasto de um render global já preparado. Exige confirmação explícita; a confirmação não chama o provedor.", z.object({ jobId: id, confirmation: z.literal("I_CONFIRM_RENDER") }).strict(), ["ai:draft"], async ({ jobId }) => {
    const ref = adminDb.collection("platform_creative_jobs").doc(jobId);
    await adminDb.runTransaction(async (transaction) => {
      const job = await transaction.get(ref);
      if (!job.exists) throw new Error("NOT_FOUND");
      if (job.get("status") !== "awaiting_approval") throw new Error("INVALID_INPUT");
      if (job.get("createdBy") !== actor!.userId) throw new Error("NOT_FOUND");
      transaction.set(ref, { status: "queued", approvedBy: actor!.userId, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_platform_render_confirmed", actorId: actor!.userId, jobId, createdAt: FieldValue.serverTimestamp() });
    });
    return { jobId, status: "queued", next: "Render aprovado e pronto para execução; nenhum crédito foi consumido pela confirmação." };
  });

  register("altum_admin_run_creative_render", "Executa um render global previamente aprovado ou consulta seu resultado. START pode consumir créditos; requer autorização explícita.", z.object({ jobId: id, action: z.enum(["start", "refresh"]).default("start") }).strict(), ["ai:draft"], async ({ jobId, action }) => {
    const ref = adminDb.collection("platform_creative_jobs").doc(jobId);
    const job = await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (!current.exists || current.get("createdBy") !== actor!.userId) throw new Error("NOT_FOUND");
      const expected = action === "start" ? "queued" : "submitted";
      const previousLock = current.get("pollLockUntil");
      const lockExpires = typeof previousLock?.toMillis === "function" ? previousLock.toMillis() : 0;
      if (current.get("status") !== expected || (action === "refresh" && lockExpires > Date.now())) throw new Error("INVALID_INPUT");
      transaction.set(ref, { status: action === "start" ? "running" : "submitted", pollLockUntil: new Date(Date.now() + 90_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return current.data()!;
    });
    try {
      const connection = await adminDb.collection("tool_connections").doc(String(job.connectionId)).get();
      if (!connection.exists || connection.get("scope") !== "platform") throw new Error("INVALID_INPUT");
      if (!connection.get("credential") || !renderableConnectionStatuses.includes(String(connection.get("status") || "") as typeof renderableConnectionStatuses[number])) throw new Error("INVALID_INPUT");
      // Permissions can change after preparation. Recheck the capability just
      // before using paid credits or polling a provider response.
      const requiredCapability = job.format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE";
      const capabilities = connection.get("capabilities");
      if (!Array.isArray(capabilities) || !capabilities.includes(requiredCapability)) throw new Error("INVALID_INPUT");
      const executionJob = { id: jobId, tenantId: "platform", projectId: String(job.projectId || ""), outputId: String(job.conceptId || ""), capability: job.format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE", format: String(job.format), prompt: String(job.prompt), creativeModel: job.creativeModel || undefined, connectionId: String(job.connectionId || ""), fallbackConnectionIds: Array.isArray(job.fallbackConnectionIds) ? job.fallbackConnectionIds : [] };
      const result = action === "start"
        ? await executeCreativeJobWithFallback({ job: executionJob, candidates: await loadCreativeExecutionCandidates(executionJob) })
        : await refreshCreativeJob(connection.data()!, job.providerStatusUrl);
      const routed = action === "start" ? result as RoutedCreativeExecutionResult : null;
      if (routed) await recordCreativeConnectionAttempts(routed.attempts);
      if (result.status === "submitted" && classifyPlatformRender(result, job.providerStatusUrl || null, false) === "needs_reconciliation") {
        // A provider may have accepted a paid request without exposing a way to
        // query it. Never resubmit blindly: preserve the receipt for review.
        await ref.set({ status: "needs_reconciliation", providerJobId: result.providerJobId || null, failureReason: "Provider accepted job without a usable status URL.", pollLockUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { jobId, status: "needs_reconciliation", providerJobId: result.providerJobId || null, next: "Consulte o provedor antes de tentar novamente; a execução pode ter consumido créditos." };
      }
      const asset = result.assetUrl ? await persistCreativeAsset({ sourceUrl: result.assetUrl, tenantId: "platform", jobId, type: String(job.format) }) : null;
      // Provider URLs can expire within minutes. Never promise delivery when
      // the file could not be copied into Altum's private storage.
      if (result.status === "completed" && classifyPlatformRender(result, job.providerStatusUrl || null, asset?.persistence === "stored") === "needs_reconciliation") {
        await ref.set({ status: "needs_reconciliation", providerJobId: result.providerJobId || job.providerJobId || null, providerStatusUrl: result.providerStatusUrl || job.providerStatusUrl || null, failureReason: "Render completed but the file was not persisted in private storage.", pollLockUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { jobId, status: "needs_reconciliation", stored: false, next: "O provedor concluiu a geração, mas o arquivo não pôde ser armazenado; não execute novamente antes de recuperar o original." };
      }
      const batch = adminDb.batch();
      batch.set(ref, { status: result.status, providerJobId: result.providerJobId || job.providerJobId || null, providerStatusUrl: result.providerStatusUrl || job.providerStatusUrl || null, assetId: asset ? jobId : null, pollLockUntil: null, ...(routed ? { connectionId: routed.connectionId, providerId: routed.providerId, executionAttempts: routed.attempts } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (asset) batch.set(adminDb.collection("platform_creative_assets").doc(jobId), { jobId, projectId: job.projectId, format: job.format, sourceUrl: asset.sourceUrl, storagePath: asset.storagePath, persistence: asset.persistence, createdBy: actor!.userId, createdAt: FieldValue.serverTimestamp() });
      batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_platform_render_executed", actorId: actor!.userId, jobId, action, status: result.status, createdAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return { jobId, status: result.status, assetId: asset ? jobId : null, providerJobId: result.providerJobId || null };
    } catch (error) {
      const attempts = error && typeof error === "object" && "attempts" in error ? (error as { attempts?: unknown }).attempts : null;
      if (action === "start" && Array.isArray(attempts)) {
        await recordCreativeConnectionAttempts(attempts.filter((attempt): attempt is import("@/lib/server/agent-os/creative-executor").CreativeExecutionAttempt => Boolean(attempt) && typeof attempt === "object"));
      }
      await ref.set(action === "start"
        ? { status: "needs_reconciliation", failureReason: "Provider submission outcome unknown; inspect provider before retrying.", pollLockUntil: null, updatedAt: FieldValue.serverTimestamp() }
        : { pollLockUntil: null, nextPollAt: new Date(Date.now() + 30_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw error;
    }
  });

  register("altum_admin_list_creative_jobs", "Lista apenas renders globais criados pelo administrador autenticado, sem expor prompts de outros usuários.", z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(), ["context:read"], async ({ limit }) => {
    const snap = await adminDb.collection("platform_creative_jobs").where("createdBy", "==", actor!.userId).limit(100).get();
    return { items: snap.docs.slice(0, limit).map((doc) => ({
      jobId: doc.id, status: String(doc.get("status") || ""), format: String(doc.get("format") || ""),
      providerId: String(doc.get("providerId") || ""), assetId: typeof doc.get("assetId") === "string" ? doc.get("assetId") : null,
    })), partial: snap.size === 100 };
  });

  register("altum_admin_list_creative_models", "Descobre rotas globais de imagem e vídeo configuradas. Não consulta provedores pagos nem expõe credenciais.", z.object({ format: z.enum(["image", "video"]).optional() }).strict(), ["integrations:read"], async ({ format }) => {
    const snap = await adminDb.collection("tool_connections").where("scope", "==", "platform").limit(201).get();
    const rows = snap.docs.map(sanitizeConnection).filter((row) =>
      Boolean(row.credentialConfigured) && mediaConnectionAvailability(row).available &&
      (!format || row.capabilities.includes(format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE")) &&
      row.capabilities.some((capability) => ["GENERATE_IMAGE", "GENERATE_VIDEO"].includes(capability))
    );
    return { items: rows.map((row) => ({ connectionId: row.id, providerId: row.providerId, displayName: row.displayName, model: row.chatModel, modelCatalog: row.modelCatalog, capabilities: row.capabilities, status: row.status, readiness: row.status === "configured_unapproved" ? "ready_for_first_approved_render" : "validated", modelSelection: row.modelCatalog.length || row.chatModel ? "configured" : "provider_default", estimatedCostUsd: null })), partial: snap.size > 200, note: "Uma conexão configurada sem catálogo ainda pode executar o primeiro render aprovado usando o adaptador padrão do provider. Preços e cotas não foram verificados." };
  });
  // ChatGPT asks for tools/list before it has exchanged OAuth credentials.
  // Register the complete schema during that discovery request as an actor
  // with zero scopes/grants; every callback remains denied. The subsequent
  // authenticated server instance carries the real grants and executes work.
  const operationalActor = actor || (oauth ? {
    userId: "unlinked",
    connectionId: "unlinked",
    scopes: [] as string[],
    grants: [] as Grant[],
    origin: new URL(oauth.resourceMetadataUrl).origin,
  } : null);
  if (operationalActor) registerAdminCommercialTools(server, { ...operationalActor, grants: operationalActor.grants || [] });
  if (operationalActor?.origin) registerAdminAgentOsTools(server, { ...operationalActor, grants: operationalActor.grants || [], origin: operationalActor.origin });
  return server;
}
