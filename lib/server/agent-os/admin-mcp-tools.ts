import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { CommandError } from "@/lib/server/command-center/security";
import type { Grant } from "@/lib/mcp/contracts";
import { buildCreativeDrafts, type CreativeFormat } from "@/lib/server/agent-os/creative-drafts";
import { creativeSkillReferences } from "@/lib/server/agent-os/external-skills";
import { mediaConnectionAvailability, planMediaConnections, routeCreativeModel, routeMediaConnection } from "@/lib/server/agent-os/creative-model-router";
import { executeCreativeJobWithFallback, refreshCreativeJob, type RoutedCreativeExecutionResult } from "@/lib/server/agent-os/creative-executor";
import { loadCreativeExecutionCandidates } from "@/lib/server/agent-os/creative-execution-routing";
import { recordCreativeConnectionAttempts } from "@/lib/server/agent-os/creative-connection-health";
import { persistCreativeAsset } from "@/lib/server/agent-os/creative-asset-storage";
import { assessCreativeAsset } from "@/lib/server/agent-os/creative-quality";

type McpActor = { userId: string; connectionId: string; grants: Grant[]; origin: string };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const brief = z.string().trim().min(12).max(12_000);
const creativeFormat = z.enum(["image", "carousel", "video", "copy"]);

function iso(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString() : null;
}

function grantFor(actor: McpActor, tenantId: string, scope: string) {
  const grant = actor.grants.find((item) => item.tenantId === tenantId && item.scopes.includes(scope as never));
  if (!grant) throw new CommandError("FORBIDDEN", 403);
  return grant;
}

function response(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

function resultUrl(actor: McpActor, jobId: string) {
  return `${actor.origin.replace(/\/$/, "")}/api/admin/agent-os/creative-assets/${encodeURIComponent(jobId)}/download`;
}

function mcpError(error: unknown) {
  const code = error instanceof CommandError ? error.code : "UNAVAILABLE";
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: { code } }) }] };
}

function mediaCapability(format: CreativeFormat) {
  return format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE";
}

function safeConnection(row: FirebaseFirestore.DocumentData) {
  return {
    id: String(row.id || ""), provider: String(row.providerId || "Altum"), name: String(row.displayName || row.providerId || "Altum"),
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String).slice(0, 20) : [],
    status: String(row.status || "pending_config"), health: row.health, credentialConfigured: Boolean(row.credential),
  };
}

/**
 * Agent OS tools made available to the remote ChatGPT connector. They never
 * return credentials; every call is constrained to the OAuth tenant grants.
 */
export function registerAdminAgentOsTools(server: McpServer, actor: McpActor) {
  server.registerTool("altum_agent_overview", {
    description: "Mostra o que a Altum pode executar nas empresas autorizadas: missões, resultados de mídia e conexões disponíveis. Não revela chaves, URLs privadas ou configurações técnicas.",
    inputSchema: z.object({ tenantId: id }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] },
  }, async ({ tenantId }) => {
    try {
      grantFor(actor, tenantId, "context:read");
      const [tenant, missions, jobs, assets, connections] = await Promise.all([
        adminDb.collection("tenants").doc(tenantId).get(),
        adminDb.collection("agent_missions").where("tenantId", "==", tenantId).limit(40).get(),
        adminDb.collection("creative_jobs").where("tenantId", "==", tenantId).limit(60).get(),
        adminDb.collection("creative_assets").where("tenantId", "==", tenantId).limit(40).get(),
        adminDb.collection("tool_connections").limit(200).get(),
      ]);
      if (!tenant.exists) throw new CommandError("NOT_FOUND", 404);
      const usableConnections = connections.docs.map((doc) => ({ ...safeConnection(doc.data()), id: doc.id })).filter((item) => item.credentialConfigured && mediaConnectionAvailability(item).available);
      return response({ tenant: { id: tenantId, name: String(tenant.get("name") || tenantId) }, missions: missions.docs.map((doc) => ({ id: doc.id, title: String(doc.get("title") || "Missão"), status: String(doc.get("status") || "planned") })), media: { jobs: jobs.size, readyAssets: assets.size, connections: usableConnections } });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_list_creative_projects", {
    description: "Lista projetos criativos e seus conceitos na Altum. Use antes de criar outro projeto ou renderizar uma variação.",
    inputSchema: z.object({ tenantId: id, limit: z.number().int().min(1).max(30).default(12) }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] },
  }, async ({ tenantId, limit }) => {
    try {
      grantFor(actor, tenantId, "context:read");
      const [projects, outputs] = await Promise.all([
        adminDb.collection("creative_projects").where("tenantId", "==", tenantId).limit(limit).get(),
        adminDb.collection("creative_outputs").where("tenantId", "==", tenantId).limit(120).get(),
      ]);
      const outputsByProject = new Map<string, Array<Record<string, unknown>>>();
      for (const doc of outputs.docs) {
        const current = outputsByProject.get(String(doc.get("projectId") || "")) || [];
        current.push({ id: doc.id, title: String(doc.get("title") || "Conceito"), format: String(doc.get("type") || "image"), status: String(doc.get("status") || "draft") });
        outputsByProject.set(String(doc.get("projectId") || ""), current);
      }
      return response({ items: projects.docs.map((doc) => ({ id: doc.id, title: String(doc.get("title") || "Projeto criativo"), brief: String(doc.get("brief") || "").slice(0, 1200), format: String(doc.get("format") || "image"), status: String(doc.get("status") || "draft"), concepts: outputsByProject.get(doc.id) || [] })) });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_create_creative_project", {
    description: "Cria na Altum um projeto de imagem, vídeo, carrossel ou copy e prepara conceitos. Não gasta créditos de mídia. Use o briefing do usuário, sem inventar promessas ou resultados.",
    inputSchema: z.object({ tenantId: id, title: z.string().trim().min(4).max(140), brief, format: creativeFormat, channel: z.string().trim().min(2).max(80).default("Campanha digital") }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:draft"] }] },
  }, async ({ tenantId, title, brief: creativeBrief, format, channel }) => {
    try {
      grantFor(actor, tenantId, "ai:draft");
      const [tenant, brand] = await Promise.all([adminDb.collection("tenants").doc(tenantId).get(), adminDb.collection("brand_profiles").doc(tenantId).get()]);
      if (!tenant.exists) throw new CommandError("NOT_FOUND", 404);
      const profile = brand.exists ? brand.data()! : null;
      const drafts = buildCreativeDrafts({ title, brief: creativeBrief, format, brand: profile ? { positioning: String(profile.positioning || ""), audience: String(profile.audience || ""), tone: String(profile.tone || ""), offers: Array.isArray(profile.offers) ? profile.offers.map(String) : [], restrictions: Array.isArray(profile.restrictions) ? profile.restrictions.map(String) : [] } : null });
      const projectRef = adminDb.collection("creative_projects").doc();
      const batch = adminDb.batch();
      batch.set(projectRef, { tenantId, title, brief: creativeBrief, format, channel, status: "review", createdBy: actor.userId, createdByName: "ChatGPT via MCP", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: "admin_mcp" });
      const concepts: Array<{ id: string; title: string }> = [];
      for (const draft of drafts) {
        const outputRef = adminDb.collection("creative_outputs").doc(); concepts.push({ id: outputRef.id, title: draft.title });
        batch.set(outputRef, { tenantId, projectId: projectRef.id, title: draft.title, content: draft.content, type: format, status: "draft", sourceSkills: creativeSkillReferences(format).map((skill) => ({ id: skill.id, sourceRepo: skill.sourceRepo, sourceCommit: skill.sourceCommit, license: skill.license })), generator: "altum-mcp+creative-director", createdBy: actor.userId, createdAt: FieldValue.serverTimestamp() });
      }
      batch.set(adminDb.collection("audit_logs").doc(), { type: "admin_mcp_creative_project_created", actorId: actor.userId, connectionId: actor.connectionId, tenantId, projectId: projectRef.id, createdAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return response({ ok: true, projectId: projectRef.id, concepts, next: "Peça confirmação explícita do usuário antes de chamar altum_queue_creative_render para uma imagem ou vídeo." });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_queue_creative_render", {
    description: "Prepara uma renderização de imagem ou vídeo a partir de um conceito da Altum. Cria uma aprovação de custo; não chama o provedor nem consome crédito ainda.",
    inputSchema: z.object({ tenantId: id, projectId: id, conceptId: id, connectionId: id.optional(), model: z.string().trim().min(3).max(180).optional() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:draft"] }] },
  }, async ({ tenantId, projectId, conceptId, connectionId, model }) => {
    try {
      grantFor(actor, tenantId, "ai:draft");
      const [projectSnap, outputSnap, allConnections] = await Promise.all([adminDb.collection("creative_projects").doc(projectId).get(), adminDb.collection("creative_outputs").doc(conceptId).get(), adminDb.collection("tool_connections").limit(200).get()]);
      if (!projectSnap.exists || !outputSnap.exists || String(projectSnap.get("tenantId") || "") !== tenantId || String(outputSnap.get("projectId") || "") !== projectId) throw new CommandError("NOT_FOUND", 404);
      const format = creativeFormat.parse(String(projectSnap.get("format") || "image"));
      if (format === "copy" || format === "carousel") throw new CommandError("INVALID_INPUT", 400);
      const capability = mediaCapability(format);
      const prompt = String(outputSnap.get("content") || projectSnap.get("brief") || "");
      const automaticPlan = planMediaConnections({
        tenantId,
        capability,
        prompt,
        connections: allConnections.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            providerId: String(data.providerId || ""),
            displayName: typeof data.displayName === "string" ? data.displayName : undefined,
            capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [],
            status: String(data.status || "pending_config"), credentialConfigured: Boolean(data.credential),
            scope: data.scope === "tenant" ? "tenant" as const : "platform" as const,
            tenantId: typeof data.tenantId === "string" ? data.tenantId : null,
            creativeModel: data.creativeModel, health: data.health,
          };
        }),
      });
      const automaticRoute = automaticPlan.routes[0] || null;
      const selected = connectionId ? allConnections.docs.find((doc) => doc.id === connectionId) : allConnections.docs.find((doc) => doc.id === automaticRoute?.connection.id);
      if (!selected) throw new CommandError("NOT_FOUND", 404);
      const connection = selected.data();
      if (!connection.credential) throw new CommandError("FORBIDDEN", 403);
      if (!Array.isArray(connection.capabilities) || !connection.capabilities.map(String).includes(capability) || !mediaConnectionAvailability({ status: String(connection.status || ""), health: connection.health }).available) throw new CommandError("FORBIDDEN", 403);
      const catalog = Array.isArray(connection.modelCatalog) ? connection.modelCatalog.map(String) : [];
      if (model && catalog.length && !catalog.includes(model)) throw new CommandError("INVALID_INPUT", 400);
      const route = routeCreativeModel({ providerId: String(connection.providerId || ""), format, prompt, fallbackModel: model || connection.creativeModel });
      const fallbackConnectionIds = automaticPlan.routes.map((item) => item.connection.id).filter((candidateId) => candidateId !== selected.id);
      const jobRef = adminDb.collection("creative_jobs").doc(); const approvalRef = adminDb.collection("agent_approvals").doc(); const batch = adminDb.batch();
      batch.set(jobRef, { tenantId, projectId, outputId: conceptId, providerId: String(connection.providerId || ""), providerName: String(connection.displayName || connection.providerId || "Altum"), connectionId: selected.id, fallbackConnectionIds, capability, format, prompt: prompt.slice(0, 12_000), creativeModel: model || route.model, routePurpose: route.purpose, routingReason: route.reason, connectionRoutingReason: connectionId ? "Conexão escolhida manualmente; alternativas saudáveis ficam como fallback." : automaticRoute?.reason || null, status: "pending_approval", approvalId: approvalRef.id, createdBy: actor.userId, createdByName: "ChatGPT via MCP", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      batch.set(approvalRef, { tenantId, missionId: null, creativeJobId: jobRef.id, title: `Autorizar geração de ${format === "video" ? "vídeo" : "imagem"}`, summary: `A Altum preparou esta geração pelo fluxo do ChatGPT.${automaticRoute ? ` ${automaticRoute.reason}` : ""} Pode consumir créditos.`, actionType: "creative_media_generation", risk: "medium", status: "pending", createdBy: actor.userId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return response({ ok: true, jobId: jobRef.id, approvalId: approvalRef.id, status: "pending_approval", routing: automaticRoute ? { preference: automaticRoute.preference, reason: automaticRoute.reason } : { reason: "Uma conexão específica foi solicitada." }, next: "Mostre ao usuário que a geração usará créditos. Só depois de ele confirmar explicitamente, chame altum_confirm_creative_render." });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_confirm_creative_render", {
    description: "Confirma uma renderização de mídia que já foi preparada. Só use depois que o usuário tiver confirmado de forma inequívoca que autoriza o consumo de créditos para este job.",
    inputSchema: z.object({ tenantId: id, jobId: id, confirmation: z.literal("I_CONFIRM_RENDER") }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:draft"] }] },
  }, async ({ tenantId, jobId }) => {
    try {
      grantFor(actor, tenantId, "ai:draft");
      const jobRef = adminDb.collection("creative_jobs").doc(jobId); const snap = await jobRef.get();
      if (!snap.exists || String(snap.get("tenantId") || "") !== tenantId) throw new CommandError("NOT_FOUND", 404);
      if (snap.get("status") !== "pending_approval") throw new CommandError("INVALID_INPUT", 400);
      const approvalId = String(snap.get("approvalId") || "");
      const batch = adminDb.batch();
      batch.set(jobRef, { status: "queued", approvedBy: actor.userId, approvedByName: "ChatGPT via MCP", approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (approvalId) batch.set(adminDb.collection("agent_approvals").doc(approvalId), { status: "approved", decidedBy: actor.userId, decidedByName: "ChatGPT via MCP", decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
      return response({ ok: true, jobId, status: "queued", next: "Chame altum_run_creative_render para iniciar a renderização." });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_run_creative_render", {
    description: "Inicia ou consulta uma renderização de mídia já confirmada. A chamada start consome crédito no provedor conectado; refresh apenas busca um resultado já iniciado. Nunca revela a chave do provedor.",
    inputSchema: z.object({ tenantId: id, jobId: id, action: z.enum(["start", "refresh"]).default("start") }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:draft"] }] },
  }, async ({ tenantId, jobId, action }) => {
    try {
      grantFor(actor, tenantId, "ai:draft");
      const jobRef = adminDb.collection("creative_jobs").doc(jobId); const jobSnap = await jobRef.get();
      if (!jobSnap.exists || String(jobSnap.get("tenantId") || "") !== tenantId) throw new CommandError("NOT_FOUND", 404);
      const job = jobSnap.data()!; const refresh = action === "refresh";
      if ((!refresh && job.status !== "queued") || (refresh && job.status !== "submitted")) throw new CommandError("INVALID_INPUT", 400);
      const connectionSnap = await adminDb.collection("tool_connections").doc(String(job.connectionId || "")).get();
      if (!connectionSnap.exists) throw new CommandError("NOT_FOUND", 404);
      if (!refresh) await jobRef.set({ status: "running", startedAt: FieldValue.serverTimestamp(), startedBy: actor.userId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const executionJob = { id: jobId, capability: String(job.capability || ""), format: String(job.format || "image"), prompt: String(job.prompt || ""), tenantId, projectId: String(job.projectId || ""), outputId: String(job.outputId || ""), creativeModel: job.creativeModel, identityReferenceId: job.identityReferenceId, connectionId: String(job.connectionId || ""), fallbackConnectionIds: Array.isArray(job.fallbackConnectionIds) ? job.fallbackConnectionIds : [] };
      const result = refresh ? await refreshCreativeJob(connectionSnap.data()!, job.providerStatusUrl) : await executeCreativeJobWithFallback({ job: executionJob, candidates: await loadCreativeExecutionCandidates(executionJob) });
      const routed = refresh ? null : result as RoutedCreativeExecutionResult;
      if (routed) await recordCreativeConnectionAttempts(routed.attempts);
      const saved = result.assetUrl ? await persistCreativeAsset({ sourceUrl: result.assetUrl, tenantId, jobId, type: String(job.format || "image") }) : null;
      const batch = adminDb.batch();
      batch.set(jobRef, { status: result.status, providerJobId: result.providerJobId, providerStatusUrl: result.providerStatusUrl, assetUrl: result.assetUrl, ...(routed ? { connectionId: routed.connectionId, providerId: routed.providerId, executionAttempts: routed.attempts } : {}), completedAt: result.status === "completed" ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (saved && result.assetUrl) batch.set(adminDb.collection("creative_assets").doc(jobId), { tenantId, projectId: job.projectId, outputId: job.outputId, creativeJobId: jobId, type: job.format, url: saved.sourceUrl, sourceUrl: saved.sourceUrl, storagePath: saved.storagePath, contentType: saved.contentType, size: saved.size, persistence: saved.persistence, qualityPreflight: assessCreativeAsset({ type: String(job.format || "image"), persistence: saved.persistence, contentType: saved.contentType, size: saved.size, identityProfileId: job.identityProfileId }), reviewStatus: "pending", providerId: job.providerId || null, createdBy: actor.userId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
      return response({ ok: true, jobId, status: result.status, providerJobId: result.providerJobId, resultUrl: result.status === "completed" ? resultUrl(actor, jobId) : null, next: result.status === "submitted" ? "A renderização está em andamento. Chame novamente com action refresh." : "Resultado pronto na Altum; apresente o link seguro ao usuário." });
    } catch (error) {
      const attempts = error && typeof error === "object" && "attempts" in error ? (error as { attempts?: unknown }).attempts : null;
      if (Array.isArray(attempts)) await recordCreativeConnectionAttempts(attempts.filter((attempt): attempt is import("@/lib/server/agent-os/creative-executor").CreativeExecutionAttempt => Boolean(attempt) && typeof attempt === "object")).catch(() => undefined);
      await adminDb.collection("creative_jobs").doc(jobId).set({ status: "failed", failureReason: error instanceof Error ? error.message.slice(0, 500) : "media_execution_failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
      return mcpError(error);
    }
  });

  server.registerTool("altum_get_creative_render", {
    description: "Consulta o estado e o link seguro de uma renderização. Use para acompanhar vídeos e imagens iniciados pela Altum.",
    inputSchema: z.object({ tenantId: id, jobId: id }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["context:read"] }] },
  }, async ({ tenantId, jobId }) => {
    try {
      grantFor(actor, tenantId, "context:read");
      const [job, asset] = await Promise.all([adminDb.collection("creative_jobs").doc(jobId).get(), adminDb.collection("creative_assets").doc(jobId).get()]);
      if (!job.exists || String(job.get("tenantId") || "") !== tenantId) throw new CommandError("NOT_FOUND", 404);
      const status = String(job.get("status") || "queued");
      return response({ jobId, status, provider: String(job.get("providerName") || job.get("providerId") || "Altum"), type: String(job.get("format") || "image"), createdAt: iso(job.get("createdAt")), resultUrl: asset.exists || status === "completed" ? resultUrl(actor, jobId) : null, failureReason: status === "failed" ? String(job.get("failureReason") || "A geração não foi concluída.") : null });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_review_creative_result", {
    description: "Registra a decisão final sobre uma imagem ou vídeo já gerado pela Altum. Só aprove quando o usuário tiver visto o resultado ou confirmado claramente que deseja mantê-lo. Não publica nem veicula o material.",
    inputSchema: z.object({ tenantId: id, assetId: id, decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1000).optional() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:draft"] }] },
  }, async ({ tenantId, assetId, decision, note }) => {
    try {
      grantFor(actor, tenantId, "ai:draft");
      const assetRef = adminDb.collection("creative_assets").doc(assetId);
      const asset = await assetRef.get();
      if (!asset.exists || String(asset.get("tenantId") || "") !== tenantId) throw new CommandError("NOT_FOUND", 404);
      if (asset.get("reviewStatus") !== "pending") throw new CommandError("INVALID_INPUT", 400);
      await assetRef.set({ reviewStatus: decision, reviewNote: note || null, reviewedBy: actor.userId, reviewedByName: "ChatGPT via MCP", reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminDb.collection("audit_logs").add({ type: `admin_mcp_creative_asset_${decision}`, actorId: actor.userId, connectionId: actor.connectionId, tenantId, assetId, createdAt: FieldValue.serverTimestamp() });
      return response({ ok: true, assetId, decision, resultUrl: resultUrl(actor, String(asset.get("creativeJobId") || assetId)), message: decision === "approved" ? "Resultado aprovado e disponível para reutilização na Altum." : "Resultado descartado. O arquivo permanece privado no histórico para auditoria." });
    } catch (error) { return mcpError(error); }
  });

  server.registerTool("altum_save_idea", {
    description: "Guarda uma ideia do usuário na memória privada da empresa para ser retomada depois pela Altum ou pelo ChatGPT conectado.",
    inputSchema: z.object({ tenantId: id, title: z.string().trim().min(3).max(140), content: z.string().trim().min(3).max(6000) }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:draft"] }] },
  }, async ({ tenantId, title, content }) => {
    try {
      grantFor(actor, tenantId, "ai:draft");
      const ref = adminDb.collection("agent_ideas").doc();
      await ref.set({ tenantId, ownerId: actor.userId, title, content, source: "admin_mcp", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return response({ ok: true, ideaId: ref.id, message: "Ideia salva na memória privada da Altum." });
    } catch (error) { return mcpError(error); }
  });
}
