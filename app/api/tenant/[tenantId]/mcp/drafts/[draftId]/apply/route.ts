import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/app/lib/server/firebase-admin";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess, assertChatCommercialAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { normalizePipelineStages, validateCustomizedPipelineStages } from "@/lib/pipeline";
import { saveTenantPipelineStages } from "@/lib/server/crm/pipeline";
import { normalizeAutomationDoc } from "@/lib/server/automations";
import {applyApprovedAppointmentDraft} from "@/lib/server/crm/appointment-draft";
import {AppointmentChangeError} from "@/lib/server/crm/appointment-mutation";
import {assertTransactionalTenantAuthority} from "@/lib/server/tenant-operation-authority";
import { applyApprovedLeadCreationDraft } from "@/lib/server/crm/lead-creation-draft";
import { processIntakeCreation } from "@/lib/server/crm/intake-occurrence";
import { deliverApprovedMcpMessage, McpMessageDeliveryPendingError, McpMessageDeliveryBlockedError } from "@/lib/server/mcp/message-delivery";
import { mcpMessageFingerprint } from "@/lib/server/mcp/message-approval";
import { ChatOutboundIdempotencyError } from "@/lib/server/chat-outbound-idempotency";
import { resolveCanonicalWhatsAppChat } from "@/lib/server/whatsapp-chat-identity";
import { upsertContactProfile } from "@/lib/server/contact-profile";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { getWhatsAppChannelForTenant, isOfficialWhatsAppProvider } from "@/app/lib/server/whatsapp-channel";
import { adportGoogleCredentials, applyAdportCampaignChange, applyAdportGoogleOperation, applyAdportMetaOperation, hasAdportGoogleCredentials, verifyAdportDraftHash } from "@/lib/server/growth/adport-connectors";
import type { CampaignPlatform } from "@/lib/server/growth/campaign-action-policy";
import { normalizeGrowthSegmentConditions } from "@/lib/server/growth/segment-engine";
import { buildOutboundCampaignPatch } from "@/lib/server/outbound-campaigns";
import type { WriteOperation } from "@adport/core";
import { getClientAccessProfile } from "@/lib/client-access-profiles";
import { applyBusinessProfileStarterKit } from "@/lib/server/business-profile-provisioning";
import { getTenantUserUsage } from "@/lib/server/tenant-usage";
import { sendPasswordResetEmail } from "@/lib/server/auth-email";
import { validateMcpAccessToken } from "@/lib/server/mcp/oauth";
import { CommandError } from "@/lib/server/command-center/security";
import { trackProposalOutcome } from "@/lib/server/ai/learning-outcomes";
import { normalizeAltumAssistantRole } from "@/lib/ai-assistant-role";
import { normalizeCommercialOffer } from "@/lib/commercial-offer";
import { applyApprovedCrmDraft, crmDraftTypes, crmDraftFingerprint, CrmDraftMutationConflict } from "@/lib/server/crm/draft-mutation";

export const dynamic = "force-dynamic";

type ProposedAiChange = {
  objective?: unknown;
  tone?: unknown;
  instructions?: unknown;
  guardrails?: unknown;
  notes?: unknown;
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseGuardrails(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => clean(item, 200)).filter(Boolean))).slice(0, 20);
}

function currentAi(settings: Awaited<ReturnType<typeof getTenantSettings>>) {
  return settings?.ai && typeof settings.ai === "object" ? settings.ai as Record<string, unknown> : {};
}

function currentGuardrails(ai: Record<string, unknown>) {
  return parseGuardrails(ai.guardrails);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringList(value: unknown, maxItems = 30, maxLength = 500) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => clean(item, maxLength)).filter(Boolean))).slice(0, maxItems);
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, prefix = "") {
  const fields: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const path = prefix ? `${prefix}.${key}` : key;
    const left = before[key];
    const right = after[key];
    if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      fields.push(...changedFields(record(left), record(right), path));
    } else if (JSON.stringify(left ?? null) !== JSON.stringify(right ?? null)) fields.push(path);
  }
  return fields;
}

function offerContent(value: Record<string, unknown>) {
  const sections: Array<[string, unknown]> = [
    ["Descricao para cliente", value.description], ["Principais beneficios", value.benefits], ["Duvidas frequentes", value.commonQuestions],
    ["Objecoes comuns", value.objections], ["Quando recomendar", value.whenRecommend], ["Quando nao recomendar", value.whenNotRecommend],
    ["Quando chamar humano", value.whenHuman], ["Especificacoes", value.productSpecs], ["Estoque, entrega e envio", value.stockDelivery],
    ["Garantia e troca", value.warranty], ["Escopo do servico", value.serviceScope], ["Duracao ou prazo", value.duration],
    ["Agenda e regras de atendimento", value.schedulingRules], ["Entregaveis", value.deliverables], ["Provas e cases", value.proofAndCases],
    ["Como demonstrar", value.demonstration], ["Condicoes de pagamento", value.paymentConditions], ["Suporte e SLA", value.supportAndSla],
    ["Momento certo para oferecer", value.momentToOffer],
  ];
  return [
    `Nome: ${clean(value.productName, 160)}`,
    `Tipo: ${clean(value.kind, 30) || "produto"}`,
    clean(value.productCategory, 120) ? `Categoria: ${clean(value.productCategory, 120)}` : "",
    clean(value.targetProfile, 2000) ? `Publico ideal: ${clean(value.targetProfile, 2000)}` : "",
    ...sections.map(([label, content]) => clean(content, 8000) ? `${label}: ${clean(content, 8000)}` : ""),
  ].filter(Boolean).join("\n\n").slice(0, 8000);
}

function sameAccount(platform: CampaignPlatform, left: string, right: string) {
  if (platform === "meta_ads") return left.replace(/^act_/, "") === right.replace(/^act_/, "");
  return left.replace(/[^\d]/g, "") === right.replace(/[^\d]/g, "");
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; draftId: string }> }
) {
  try {
    const { tenantId, draftId } = await context.params;
    let user: { uid: string; name: string; viaMcp: boolean; scopes: string[] };
    try {
      const sessionUser = await requireRequestUser(req);
      user = { uid: sessionUser.uid, name: sessionUser.name, viaMcp: false, scopes: [] };
    } catch (error) {
      const raw = req.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!(error instanceof RouteAuthError) || !raw) throw error;
      const token = await validateMcpAccessToken(req, raw);
      if (token.tenantId !== tenantId) throw new CommandError("FORBIDDEN", 403);
      user = { uid: token.userId, name: "ChatGPT via MCP", viaMcp: true, scopes: token.grant.scopes };
    }
    const membership = await assertTenantAccess(user.uid, tenantId);

    const safeDraftId = draftId.trim();
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(safeDraftId)) {
      return NextResponse.json({ error: "Rascunho invalido." }, { status: 400 });
    }

    const draftRef = adminDb.collection("mcp_action_drafts").doc(safeDraftId);
    let draftSnap = await draftRef.get();
    if (!draftSnap.exists) return NextResponse.json({ error: "Rascunho nao encontrado." }, { status: 404 });
    let draft = draftSnap.data() as Record<string, unknown>;
    if (draft.tenantId !== tenantId) return NextResponse.json({ error: "Sem permissao para este rascunho." }, { status: 403 });
    if (user.viaMcp && draft.status === "pending_review") {
      const settings = await getTenantSettings(tenantId);
      const mcp = settings?.mcp && typeof settings.mcp === "object" ? settings.mcp as Record<string, unknown> : {};
      const requiredScopes = Array.isArray(draft.requiredScopes) ? draft.requiredScopes.filter((value): value is string => typeof value === "string") : [];
      if (mcp.writeMode !== "autonomous" || draft.autonomousEligible !== true || draft.source !== "mcp" || draft.userId !== user.uid || requiredScopes.some((scope) => !user.scopes.includes(scope))) {
        throw new CommandError("FORBIDDEN", 403);
      }
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(draftRef);
        const value = current.data();
        if (!current.exists || value?.status !== "pending_review" || value?.tenantId !== tenantId || value?.userId !== user.uid) {
          throw new CommandError("DRAFT_STATE_CHANGED", 409);
        }
        let appointmentReview: Record<string, unknown> = {};
        if (value.type === "create_appointment") {
          const actor = await assertTransactionalTenantAuthority(transaction, {tenantId, userId: user.uid, capability: "edit_leads", module: "crm"});
          const currentSettings = (await transaction.get(adminDb.collection("tenant_settings").doc(tenantId))).data();
          const scopes = Array.isArray(value.requiredScopes) ? value.requiredScopes : [];
          if (currentSettings?.mcp?.writeMode !== "autonomous" || value.source !== "mcp" || value.autonomousEligible !== true ||
            ["calendar:write", "crm:read"].some(scope => !user.scopes.includes(scope) || !scopes.includes(scope)) || scopes.some((scope: unknown) => typeof scope !== "string" || !user.scopes.includes(scope))) throw new CommandError("FORBIDDEN", 403);
          const proposed = record(value.proposedChange), leadId = clean(proposed.leadId, 180);
          if (proposed.leadId !== undefined && (!leadId || leadId !== proposed.leadId || leadId.includes("/"))) throw new CommandError("DRAFT_STATE_CHANGED", 409);
          const lead = leadId ? await transaction.get(adminDb.collection("leads").doc(leadId)) : null;
          if (lead && (!lead.exists || lead.data()?.tenantId !== tenantId)) throw new CommandError("FORBIDDEN", 403);
          if (lead) {
            assertAssignedCommercialRecordAccess(actor, user.uid, lead.data()!);
            appointmentReview = {reviewedLeadId: leadId, reviewedLeadVersion: lead.updateTime!, reviewedLeadGeneration: lead.createTime!};
          }
        }
        transaction.set(draftRef, { status: "approved_pending_apply", reviewedAt: FieldValue.serverTimestamp(), reviewedBy: user.uid, reviewedByName: user.name, reviewDecision: "autonomous_policy",
          ...appointmentReview,
          ...((crmDraftTypes.has(String(value.type)) || ["create_lead", "create_appointment"].includes(String(value.type))) ? { reviewedChangeFingerprint: crmDraftFingerprint(value) } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(adminDb.collection("audit_logs").doc(), { type: "mcp_autonomous_action_approved", actorId: user.uid, actorName: user.name, tenantId, draftId: safeDraftId, createdAt: FieldValue.serverTimestamp() });
      });
      draftSnap = await draftRef.get();
      draft = draftSnap.data() as Record<string, unknown>;
    }
    const resumableMessage = ["send_or_reply_conversation", "start_whatsapp_conversation"].includes(String(draft.type)) &&
      record(draft.messageDelivery).protocol === 1 && ["applying", "applied"].includes(String(draft.status));
    const replayableCrm = (crmDraftTypes.has(String(draft.type)) && record(draft.crmMutation).protocol === 1 || draft.type === "create_lead" && record(draft.creationMutation).protocol === 1 || draft.type === "create_appointment" && record(draft.appointmentMutation).protocol === 1) && draft.status === "applied";
    if (draft.status !== "approved_pending_apply" && !resumableMessage && !replayableCrm) {
      return NextResponse.json({ error: "Aprove o rascunho antes de aplicar." }, { status: 409 });
    }
    if (draft.appliedAt && !resumableMessage && !replayableCrm) return NextResponse.json({ error: "Rascunho ja aplicado." }, { status: 409 });

    const draftType = clean(draft.type, 120);
    const operationalTypes = new Set([
      "update_pipeline", "create_lead", "update_lead", "assign_lead", "add_lead_note", "create_lead_task", "upsert_automation", "upsert_kb_document", "update_ai_commercial_profile", "upsert_commercial_offer", "archive_offer",
      "update_business_settings", "configure_lead_fields", "create_appointment", "create_proposal", "update_channel",
      "send_or_reply_conversation", "start_whatsapp_conversation", "upsert_team", "invite_team_member", "update_team_member",
      "configure_commercial_sla", "prepare_operational_onboarding", "configure_commission",
    ]);
    if (operationalTypes.has(draftType)) {
      const proposed = record(draft.proposedChange);
      let claimed = false;
      const claim = async () => {
        await adminDb.runTransaction(async (transaction) => {
          const current = await transaction.get(draftRef);
          if (!current.exists || current.data()?.status !== "approved_pending_apply" || current.data()?.appliedAt) throw new Error("DRAFT_STATE_CHANGED");
          transaction.set(draftRef, { status: "applying", applyingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        });
        claimed = true;
      };
      const finish = async (application: Record<string, unknown>) => Promise.all([
        draftRef.set({ status: "applied", appliedAt: FieldValue.serverTimestamp(), appliedBy: user.uid, appliedByName: user.name, updatedAt: FieldValue.serverTimestamp(), application }, { merge: true }),
        adminDb.collection("audit_logs").add({ type: "mcp_supervised_action_applied", action: draftType, actorId: user.uid, actorName: user.name, tenantId, draftId: safeDraftId, target: draft.target || null, after: application, createdAt: FieldValue.serverTimestamp() }),
      ]);

      try {
      if (draftType === "upsert_team") {
        assertTenantCapability(membership, "manage_users");
        const settings = await getTenantSettings(tenantId);
        const rules = record(settings?.rules);
        const inbox = record(rules.inbox);
        const teams = Array.isArray(inbox.teams) ? inbox.teams.map(record) : [];
        const requestedId = clean(proposed.teamId, 80);
        const generatedId = clean(proposed.name, 100).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
        const teamId = requestedId || generatedId;
        if (!teamId) return NextResponse.json({ error: "Time invalido." }, { status: 409 });
        const team = { id: teamId, name: clean(proposed.name, 100), description: clean(proposed.description, 240), channels: Array.isArray(proposed.channels) ? proposed.channels.map((item) => clean(item, 30)).filter(Boolean).slice(0, 5) : [], isDefault: proposed.setAsDefault === true };
        const nextTeams = [...teams.filter((item) => clean(item.id, 80) !== teamId), team].map((item) => ({ ...item, isDefault: proposed.setAsDefault === true ? clean(item.id, 80) === teamId : item.isDefault === true }));
        const defaultTeam = proposed.setAsDefault === true ? teamId : clean(inbox.defaultTeam, 80) || teamId;
        await claim();
        await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, rules: { ...rules, inbox: { ...inbox, teams: nextTeams, defaultTeam } }, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        await finish({ teamId, team, defaultTeam });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", teamId });
      }

      if (draftType === "invite_team_member") {
        assertTenantCapability(membership, "manage_users");
        const email = clean(proposed.email, 180).toLowerCase();
        const name = clean(proposed.name, 140);
        const profile = getClientAccessProfile(clean(proposed.accessProfile, 40) || "seller");
        const usage = await getTenantUserUsage(tenantId);
        if (!usage.hasActiveEmail(email)) await assertTenantLimitAvailable({ tenantId, limitId: "users", currentUsage: usage.activeClientUsers, increment: 1 });
        const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
        if (!tenantSnap.exists) return NextResponse.json({ error: "Empresa nao encontrada." }, { status: 404 });
        let authUser;
        let createdAuthUser = false;
        try { authUser = await adminAuth.getUserByEmail(email); }
        catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
          if (code !== "auth/user-not-found") throw error;
          authUser = await adminAuth.createUser({ email, displayName: name, emailVerified: true });
          createdAuthUser = true;
        }
        const uid = authUser.uid;
        const memberRef = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
        const [existing, globalUserSnap] = await Promise.all([memberRef.get(), adminDb.collection("users").doc(uid).get()]);
        if (existing.exists) return NextResponse.json({ error: "Esta pessoa ja faz parte da equipe." }, { status: 409 });
        const tenantName = clean(tenantSnap.data()?.name, 180) || "Cliente";
        const team = clean(proposed.teamId, 80);
        const globalUser = globalUserSnap.data() as Record<string, unknown> | undefined;
        const protectedGlobalRoles = new Set(["admin", "closer", "sdr", "agency_owner", "agency_admin", "agency_agent"]);
        const globalRole = protectedGlobalRoles.has(clean(globalUser?.role, 40)) ? globalUser?.role : profile.role;
        await claim();
        const common = { uid, email, name: name || authUser.displayName || email, role: profile.role, status: "active", updatedAt: FieldValue.serverTimestamp() };
        await Promise.all([
          memberRef.set({ ...common, tenantId, userId: uid, team, availability: clean(proposed.availability, 20) || "online", maxOpenChats: typeof proposed.maxOpenChats === "number" ? proposed.maxOpenChats : null, capabilities: profile.capabilities, accessProfile: profile.id, invitedBy: user.uid, invitedByName: user.name, createdAt: FieldValue.serverTimestamp() }),
          adminDb.collection("users").doc(uid).set({ ...common, role: globalRole, status: globalUser?.status === "blocked" ? "blocked" : "active", defaultTenantId: clean(globalUser?.defaultTenantId, 180) || tenantId, ...(globalUserSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }),
          adminDb.collection("client_portal_users").doc(uid).set({ ...common, tenantId, tenantName, clientId: clean(tenantSnap.data()?.legacyClientId, 120) || tenantId, clientName: tenantName, invitedBy: user.uid, invitedByName: user.name, createdAt: FieldValue.serverTimestamp() }, { merge: true }),
        ]);
        let emailDelivery = "not_needed";
        if (createdAuthUser) {
          try { await sendPasswordResetEmail({ email, name: name || tenantName }); emailDelivery = "sent"; }
          catch { emailDelivery = "failed"; }
        }
        await finish({ userId: uid, email, accessProfile: profile.id, teamId: team || null, emailDelivery });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", userId: uid, emailDelivery });
      }

      if (draftType === "update_team_member" || draftType === "configure_commission") {
        assertTenantCapability(membership, "manage_users");
        const targetUserId = clean(proposed.userId, 180);
        const memberRef = adminDb.collection("tenant_users").doc(`${tenantId}_${targetUserId}`);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists || memberSnap.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Pessoa nao encontrada." }, { status: 404 });
        const current = memberSnap.data() as Record<string, unknown>;
        if (clean(current.role, 40) === "client_owner") return NextResponse.json({ error: "O dono da conta nao pode ser alterado pelo MCP." }, { status: 403 });
        if (draftType === "configure_commission" && current.status === "blocked") return NextResponse.json({ error: "A comissao so pode ser configurada para uma pessoa ativa." }, { status: 409 });
        const patch: Record<string, unknown> = {};
        if (draftType === "configure_commission") {
          patch.commissionRate = Math.max(0, Math.min(100, Number(proposed.commissionRate)));
        } else {
          const rawPatch = record(proposed.patch);
          if (targetUserId === user.uid && (rawPatch.status === "blocked" || rawPatch.accessProfile !== undefined)) return NextResponse.json({ error: "Nao e permitido alterar o proprio acesso critico." }, { status: 403 });
          if (rawPatch.accessProfile !== undefined) {
            const profile = getClientAccessProfile(clean(rawPatch.accessProfile, 40));
            patch.accessProfile = profile.id; patch.role = profile.role; patch.capabilities = profile.capabilities;
          }
          if (rawPatch.teamId !== undefined) patch.team = rawPatch.teamId === null ? "" : clean(rawPatch.teamId, 80);
          if (rawPatch.availability !== undefined) patch.availability = clean(rawPatch.availability, 20);
          if (rawPatch.maxOpenChats !== undefined) patch.maxOpenChats = rawPatch.maxOpenChats === null ? null : Number(rawPatch.maxOpenChats);
          if (rawPatch.status !== undefined) patch.status = clean(rawPatch.status, 20);
        }
        await claim();
        await Promise.all([
          memberRef.set({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true }),
          ...(draftType === "configure_commission" ? [adminDb.collection("users").doc(targetUserId).set({ commissionRate: patch.commissionRate, updatedAt: FieldValue.serverTimestamp() }, { merge: true })] : []),
        ]);
        await finish({ userId: targetUserId, patch });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", userId: targetUserId, patch });
      }

      if (draftType === "configure_commercial_sla") {
        assertTenantCapability(membership, "manage_settings");
        const settings = await getTenantSettings(tenantId);
        const rules = record(settings?.rules);
        const inbox = record(rules.inbox);
        const firstResponseMinutes = Math.max(5, Math.min(1440, Math.round(Number(proposed.firstResponseMinutes) || 15)));
        const requestedMode = clean(proposed.assignmentMode, 30);
        const assignmentMode = ["manual", "round_robin", "least_loaded"].includes(requestedMode) ? requestedMode : "least_loaded";
        const patch = { firstResponseSlaMinutes: firstResponseMinutes, assignmentMode, autoAssignOnInbound: proposed.autoAssignOnInbound !== false, businessHoursOnly: proposed.businessHoursOnly === true };
        await claim();
        await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, rules: { ...rules, inbox: { ...inbox, ...patch } }, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        await finish(patch);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", ...patch });
      }

      if (draftType === "prepare_operational_onboarding") {
        assertTenantCapability(membership, "manage_settings");
        await claim();
        const result = await applyBusinessProfileStarterKit({ tenantId, businessProfileId: clean(proposed.businessProfileId, 40), overwriteExisting: proposed.overwriteExisting === true, actorId: user.uid, actorName: user.name });
        await finish(result);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", ...result });
      }

      if (draftType === "update_pipeline") {
        assertTenantCapability(membership, "manage_pipeline");
        await assertTenantModule(tenantId, "crm");
        const validationError = validateCustomizedPipelineStages(proposed.stages);
        if (validationError) return NextResponse.json({ error: validationError }, { status: 409 });
        const stages = normalizePipelineStages(proposed.stages as Array<Record<string, unknown>>);
        if (stages.length < 2) return NextResponse.json({ error: "O funil precisa ter pelo menos duas etapas validas." }, { status: 409 });
        await claim();
        await saveTenantPipelineStages({ tenantId, stages, actorId: user.uid, actorName: user.name });
        await finish({ stages });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", stages });
      }

      if (draftType === "create_lead") {
        const result = await applyApprovedLeadCreationDraft({ tenantId, draftId: safeDraftId, expectedDraftVersion: draftSnap.updateTime!,
          membership, actorId: user.uid, actorName: user.name, viaMcp: user.viaMcp });
        if (!result.replayed) {
          const lead = (await adminDb.collection("leads").doc(String(result.application.leadId)).get()).data();
          if (lead?.tenantId === tenantId) await upsertContactProfile({ tenantId, phone: lead.telefone, email: lead.email,
            leadId: String(result.application.leadId), channel: lead.channel, name: lead.nome, company: lead.empresa })
            .catch(error => console.error("Contato aprovado salvo; perfil auxiliar pendente:", error));
        }
        await processIntakeCreation(result.creationJobId, tenantId)
          .catch(error => console.error("Contato aprovado salvo; automacao inicial pendente:", error));
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", ...result.application, replayed: result.replayed });
      }
      if (crmDraftTypes.has(draftType)) {
        assertTenantCapability(membership, draftType === "create_proposal" ? "manage_commercial" : "edit_leads");
        await assertTenantModule(tenantId, "crm");
        const result = await applyApprovedCrmDraft({ tenantId, draftId: safeDraftId, expectedDraftVersion: draftSnap.updateTime!, membership,
          actorId: user.uid, actorName: user.name, viaMcp: user.viaMcp });
        if (draftType === "create_proposal" && !result.replayed) {
          await trackProposalOutcome({ tenantId, leadId: String(result.application.leadId), budgetId: String(result.application.proposalId), status: "Rascunho" })
            .catch(error => console.error("Proposta gravada; falha no registro auxiliar de aprendizado:", error));
        }
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", ...result.application, replayed: result.replayed });
      }

      if (draftType === "add_lead_note" || draftType === "create_lead_task") {
        assertTenantCapability(membership, "edit_leads");
        await assertTenantModule(tenantId, "crm");
        const leadId = clean(proposed.leadId, 180);
        const leadRef = adminDb.collection("leads").doc(leadId);
        const leadSnap = await leadRef.get();
        if (!leadSnap.exists || leadSnap.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Cliente ou oportunidade nao encontrado." }, { status: 404 });
        assertAssignedCommercialRecordAccess(membership, user.uid, leadSnap.data() as Record<string, unknown>);
        if (draftType === "add_lead_note") {
          const text = clean(proposed.text, 1600);
          await claim();
          const noteRef = adminDb.collection("lead_notes").doc();
          await Promise.all([
            noteRef.set({ tenantId, leadId, text, authorId: user.uid, authorName: user.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }),
            leadRef.collection("events").add({ type: "note_added", title: "Nota adicionada", detail: text.slice(0, 240), actorId: user.uid, actorName: user.name, createdAt: FieldValue.serverTimestamp() }),
          ]);
          await finish({ leadId, noteId: noteRef.id });
          return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", leadId, noteId: noteRef.id });
        }
        const title = clean(proposed.title, 180);
        const dueAt = proposed.dueAt ? new Date(String(proposed.dueAt)) : null;
        if (dueAt && !Number.isFinite(dueAt.getTime())) return NextResponse.json({ error: "Data da tarefa invalida." }, { status: 409 });
        await claim();
        const taskRef = adminDb.collection("lead_tasks").doc();
        await Promise.all([
          taskRef.set(withCommercialTaskIndex({ tenantId, leadId, title, type: clean(proposed.type, 40) || "follow_up", priority: clean(proposed.priority, 20) || "medium", dueAt, status: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: user.uid, createdByName: user.name })),
          leadRef.collection("events").add({ type: "task_created", title: "Tarefa criada", detail: title, actorId: user.uid, actorName: user.name, createdAt: FieldValue.serverTimestamp() }),
        ]);
        await finish({ leadId, taskId: taskRef.id });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", leadId, taskId: taskRef.id });
      }

      if (draftType === "upsert_automation") {
        assertTenantCapability(membership, "manage_automations");
        await assertTenantModule(tenantId, "automation");
        const requestedId = clean(proposed.automationId, 180);
        const ref = requestedId ? adminDb.collection("automations").doc(requestedId) : adminDb.collection("automations").doc();
        if (requestedId) {
          const current = await ref.get();
          if (!current.exists || current.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Automacao nao encontrada." }, { status: 404 });
        }
        const normalized = normalizeAutomationDoc(ref.id, { ...proposed, tenantId, status: proposed.enabled === true ? "active" : "paused" }, tenantId);
        if (!normalized.name || normalized.actions.length === 0) return NextResponse.json({ error: "Automacao invalida." }, { status: 409 });
        await claim();
        await ref.set({ tenantId, name: normalized.name, description: normalized.description, trigger: normalized.trigger, enabled: normalized.enabled, status: normalized.status, conditions: normalized.conditions, actions: normalized.actions, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name, ...(!requestedId ? { createdAt: FieldValue.serverTimestamp(), createdBy: user.uid } : {}) }, { merge: true });
        await finish({ automationId: ref.id, enabled: normalized.enabled, status: normalized.status });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", automationId: ref.id });
      }

      if (draftType === "update_ai_commercial_profile") {
        assertTenantCapability(membership, "manage_ai");
        await assertTenantModule(tenantId, "ai");
        const settings = await getTenantSettings(tenantId);
        const before = currentAi(settings);
        const rawPatch = record(proposed.patch);
        const after: Record<string, unknown> = { ...before };
        const booleanFields = ["enabled", "responsePaused", "handoffNotifyEnabled", "voiceReplyEnabled", "whatsappTemplateFollowUpEnabled"];
        const textFields = ["agentName", "toneOfVoice", "businessSummary", "objective", "responsiblePhone", "voiceReplyVoice", "whatsappTemplateFollowUpName", "whatsappTemplateFollowUpLanguage"];
        const listFields = ["handoffNotifyPhones", "guardrails", "mandatoryQuestions", "escalationTopics", "whatsappTemplateFollowUpParams"];
        for (const key of booleanFields) if (typeof rawPatch[key] === "boolean") after[key] = rawPatch[key];
        for (const key of textFields) if (rawPatch[key] !== undefined) after[key] = rawPatch[key] === null ? "" : clean(rawPatch[key], key === "businessSummary" ? 2000 : 1000);
        for (const key of listFields) if (rawPatch[key] !== undefined) after[key] = stringList(rawPatch[key], key === "handoffNotifyPhones" ? 8 : 20, key === "handoffNotifyPhones" ? 40 : 500);
        if (rawPatch.assistantRole !== undefined) after.assistantRole = normalizeAltumAssistantRole(rawPatch.assistantRole);
        if (rawPatch.voiceReplyMode !== undefined) after.voiceReplyMode = clean(rawPatch.voiceReplyMode, 20);
        if (rawPatch.voiceReplyMaxChars !== undefined) after.voiceReplyMaxChars = Math.max(260, Math.min(1400, Math.round(Number(rawPatch.voiceReplyMaxChars) || 760)));
        if (rawPatch.commercialBrain !== undefined) {
          const currentBrain = record(before.commercialBrain);
          const brainPatch = record(rawPatch.commercialBrain);
          const nextBrain = { ...currentBrain };
          for (const key of ["businessModel", "idealCustomer", "revenuePriorities", "diagnosisStyle", "customSolutionPolicy", "handoffCriteria", "proposalStyle", "followUpStrategy", "forbiddenSalesMoves"]) {
            if (brainPatch[key] !== undefined) nextBrain[key] = brainPatch[key] === null ? "" : clean(brainPatch[key], 2000);
          }
          after.commercialBrain = nextBrain;
        }
        if (rawPatch.operatingProfile !== undefined) {
          const currentOperatingProfile = record(before.operatingProfile);
          const operatingPatch = record(rawPatch.operatingProfile);
          const nextOperatingProfile = { ...currentOperatingProfile };
          for (const key of ["tier", "autonomyMode", "reasoningLevel", "responseStyle", "allowPremiumModels", "preferredProviders", "monthlyBudgetUsd", "monthlyUsageCap"]) {
            if (operatingPatch[key] !== undefined) nextOperatingProfile[key] = operatingPatch[key];
          }
          for (const key of ["conversationModelOverride", "extractionModelOverride"]) {
            if (operatingPatch[key] !== undefined) nextOperatingProfile[key] = operatingPatch[key] === null ? "" : clean(operatingPatch[key], 120);
          }
          after.operatingProfile = nextOperatingProfile;
        }
        if (rawPatch.rollout !== undefined) {
          const currentRollout = record(before.rollout);
          const rolloutPatch = record(rawPatch.rollout);
          const nextRollout = { ...currentRollout };
          for (const key of ["mode", "rolloutPercent"]) if (rolloutPatch[key] !== undefined) nextRollout[key] = rolloutPatch[key];
          if (rolloutPatch.agentVersion !== undefined) nextRollout.agentVersion = rolloutPatch.agentVersion === null ? "" : clean(rolloutPatch.agentVersion, 60);
          after.rollout = nextRollout;
        }
        const changed = changedFields(before, after);
        await claim();
        await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: after, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        const application = { id: tenantId, before, after, changedFields: changed, status: "applied", warnings: [] };
        await finish(application);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, ...application });
      }

      if (draftType === "upsert_commercial_offer") {
        assertTenantCapability(membership, "manage_ai");
        await assertTenantModule(tenantId, "ai");
        const requestedId = clean(proposed.offerId, 180);
        const ref = requestedId ? adminDb.collection("kb_docs").doc(requestedId) : adminDb.collection("kb_docs").doc();
        const existing = requestedId ? await ref.get() : null;
        if (requestedId && (!existing?.exists || existing.data()?.tenantId !== tenantId || existing.data()?.type !== "catalog")) {
          return NextResponse.json({ error: "Oferta nao encontrada." }, { status: 404 });
        }
        const before = existing?.exists ? existing.data() as Record<string, unknown> : {};
        const rawPatch = record(proposed.patch);
        const candidate: Record<string, unknown> = { ...before, ...rawPatch, tenantId, type: "catalog", useInAi: true };
        const relations = ["upsellOfferIds", "crossSellOfferIds", "downsellOfferIds", "incompatibleOfferIds"];
        const referencedIds = new Set<string>();
        for (const key of relations) {
          if (rawPatch[key] !== undefined) candidate[key] = stringList(rawPatch[key], 20, 180).filter((id) => id !== ref.id);
          for (const id of stringList(candidate[key], 20, 180)) referencedIds.add(id);
        }
        if (rawPatch.nextOfferId !== undefined) candidate.nextOfferId = rawPatch.nextOfferId === null ? null : clean(rawPatch.nextOfferId, 180);
        if (candidate.nextOfferId && candidate.nextOfferId !== ref.id) referencedIds.add(String(candidate.nextOfferId));
        if (referencedIds.size) {
          const refs = await Promise.all([...referencedIds].map((id) => adminDb.collection("kb_docs").doc(id).get()));
          const invalid = refs.filter((snap) => !snap.exists || snap.data()?.tenantId !== tenantId || snap.data()?.type !== "catalog").map((snap) => snap.id);
          if (invalid.length) return NextResponse.json({ error: "Uma ou mais ofertas relacionadas sao invalidas.", invalidOfferIds: invalid }, { status: 409 });
        }
        const normalized = normalizeCommercialOffer(candidate);
        const name = normalized.productName;
        if (!name) return NextResponse.json({ error: "Nome da oferta e obrigatorio." }, { status: 409 });
        const serviceKey = normalized.serviceKey || name.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
        const source = clean(candidate.source, 80) || "mcp";
        const tags = Array.from(new Set(["catalogo", `tipo:${normalized.kind}`, `origem:${source}`, normalized.productCategory ? `categoria:${normalized.productCategory}` : "", ...stringList(candidate.tags, 40, 80)].filter(Boolean)));
        const after: Record<string, unknown> = {
          ...candidate, ...normalized, serviceKey, source, tags,
          description: clean(candidate.description, 8000), benefits: clean(candidate.benefits, 8000), commonQuestions: clean(candidate.commonQuestions, 8000),
          objections: clean(candidate.objections, 8000), whenRecommend: clean(candidate.whenRecommend, 8000), whenNotRecommend: clean(candidate.whenNotRecommend, 8000),
          whenHuman: clean(candidate.whenHuman, 8000), productSpecs: clean(candidate.productSpecs, 8000), stockDelivery: clean(candidate.stockDelivery, 8000),
          warranty: clean(candidate.warranty, 8000), serviceScope: clean(candidate.serviceScope, 8000), duration: clean(candidate.duration, 2000),
          schedulingRules: clean(candidate.schedulingRules, 4000), deliverables: clean(candidate.deliverables, 8000), proofAndCases: clean(candidate.proofAndCases, 8000),
          demonstration: clean(candidate.demonstration, 4000), paymentConditions: clean(candidate.paymentConditions, 4000), supportAndSla: clean(candidate.supportAndSla, 4000),
          momentToOffer: clean(candidate.momentToOffer, 4000), content: offerContent({ ...candidate, ...normalized, productName: name }),
        };
        const changed = changedFields(before, after).filter((field) => !["createdAt", "updatedAt", "updatedBy", "updatedByName"].includes(field));
        await claim();
        await ref.set({ ...after, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name, ...(!requestedId ? { createdAt: FieldValue.serverTimestamp(), createdBy: user.uid } : {}) }, { merge: true });
        const application = { id: ref.id, before, after, changedFields: changed, status: "applied", warnings: normalized.kind === "produto" && normalized.inventoryQuantity === null ? ["Estoque ainda nao confirmado."] : [] };
        await finish(application);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, ...application });
      }

      if (draftType === "archive_offer") {
        assertTenantCapability(membership, "manage_ai");
        await assertTenantModule(tenantId, "ai");
        const offerId = clean(proposed.offerId, 180);
        const ref = adminDb.collection("kb_docs").doc(offerId);
        const snap = await ref.get();
        if (!snap.exists || snap.data()?.tenantId !== tenantId || snap.data()?.type !== "catalog") {
          return NextResponse.json({ error: "Oferta nao encontrada." }, { status: 404 });
        }
        const before = snap.data() as Record<string, unknown>;
        const after = { ...before, availability: "paused", useInAi: false, archivedAt: new Date().toISOString() };
        const changed = changedFields(before, after).filter((field) => !["updatedAt", "updatedBy", "updatedByName"].includes(field));
        await claim();
        await ref.set({ availability: "paused", useInAi: false, archivedAt: FieldValue.serverTimestamp(), archivedBy: user.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        const application = { id: ref.id, before, after, changedFields: changed, status: "applied", warnings: [] };
        await finish(application);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, ...application });
      }

      if (draftType === "upsert_kb_document") {
        assertTenantCapability(membership, "manage_ai");
        await assertTenantModule(tenantId, "ai");
        const requestedId = clean(proposed.documentId, 180);
        const ref = requestedId ? adminDb.collection("kb_docs").doc(requestedId) : adminDb.collection("kb_docs").doc();
        if (requestedId) {
          const current = await ref.get();
          if (!current.exists || current.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Documento nao encontrado." }, { status: 404 });
        }
        const content = clean(proposed.content, 8000);
        if (!content) return NextResponse.json({ error: "Conteudo vazio." }, { status: 409 });
        const patch = { tenantId, type: clean(proposed.type, 20) || "faq", content, tags: Array.isArray(proposed.tags) ? proposed.tags.map((item) => clean(item, 80)).filter(Boolean).slice(0, 30) : [], productName: clean(proposed.productName, 160) || null, sku: clean(proposed.sku, 120) || null, priceFrom: typeof proposed.priceFrom === "number" ? proposed.priceFrom : null, priceTo: typeof proposed.priceTo === "number" ? proposed.priceTo : null, currency: clean(proposed.currency, 3).toUpperCase() || "BRL", inventoryQuantity: typeof proposed.inventoryQuantity === "number" ? proposed.inventoryQuantity : null, checkoutUrl: clean(proposed.checkoutUrl, 1200) || null, availability: clean(proposed.availability, 30) || "active", useInAi: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name, ...(!requestedId ? { createdAt: FieldValue.serverTimestamp(), createdBy: user.uid } : {}) };
        await claim();
        await ref.set(patch, { merge: true });
        await finish({ documentId: ref.id, type: patch.type, productName: patch.productName });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", documentId: ref.id });
      }

      if (draftType === "update_business_settings" || draftType === "configure_lead_fields") {
        assertTenantCapability(membership, "manage_settings");
        if (draftType === "configure_lead_fields") await assertTenantModule(tenantId, "crm");
        const settingsPatch = draftType === "update_business_settings"
          ? record(proposed.patch)
          : { crm: { leadFields: Array.isArray(proposed.fields) ? proposed.fields.map((item) => clean(record(item).id, 80)).filter(Boolean) : [], leadFieldDefinitions: Array.isArray(proposed.fields) ? proposed.fields : [], updatedByMcpAt: FieldValue.serverTimestamp() } };
        await claim();
        await adminDb.collection("tenant_settings").doc(tenantId).set({ ...settingsPatch, tenantId, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByName: user.name }, { merge: true });
        await finish({ patch: settingsPatch });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied" });
      }

      if (draftType === "create_appointment") {
        const applied = await applyApprovedAppointmentDraft({tenantId, draftId: safeDraftId, expectedDraft: draftSnap,
          actorId: user.uid, actorName: user.name, viaMcp: user.viaMcp, scopes: user.scopes});
        return NextResponse.json({ok: true, tenantId, draftId: safeDraftId, status: "applied", ...applied.application, replayed: applied.replayed});
      }

      if (draftType === "update_channel") {
        assertTenantCapability(membership, "manage_channels");
        const channelId = clean(proposed.channelId, 180);
        const ref = adminDb.collection("tenant_channels").doc(channelId);
        const current = await ref.get();
        if (!current.exists || current.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
        const allowed = record(proposed.patch);
        const patch = { ...(allowed.status !== undefined ? { status: clean(allowed.status, 20) } : {}), ...(allowed.displayName !== undefined ? { displayName: clean(allowed.displayName, 240) } : {}), ...(allowed.teamId !== undefined ? { teamId: clean(allowed.teamId, 180) } : {}), ...(allowed.ownerUserId !== undefined ? { ownerUserId: clean(allowed.ownerUserId, 180) } : {}), ...(typeof allowed.aiEnabled === "boolean" ? { aiEnabled: allowed.aiEnabled } : {}) };
        await claim();
        await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }, { merge: true });
        await finish({ channelId, patch });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", channelId, patch });
      }

      if (draftType === "send_or_reply_conversation") {
        assertTenantCapability(membership, "respond_inbox");
        await assertTenantModule(tenantId, "inbox");
        const conversationId = clean(proposed.conversationId, 180);
        await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId: conversationId });
        const application = await deliverApprovedMcpMessage({ tenantId, draftId: safeDraftId, chatId: conversationId,
          approvedFingerprint: mcpMessageFingerprint(draft), actor: { id: user.uid, name: user.name } });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", ...application });
      }

      if (draftType === "start_whatsapp_conversation") {
        assertTenantCapability(membership, "respond_inbox");
        await Promise.all([assertTenantModule(tenantId, "crm"), assertTenantModule(tenantId, "inbox"), assertTenantModule(tenantId, "whatsapp")]);
        const leadId = clean(proposed.leadId, 180);
        const leadSnap = await adminDb.collection("leads").doc(leadId).get();
        if (!leadSnap.exists || leadSnap.data()?.tenantId !== tenantId) return NextResponse.json({ error: "Cliente ou oportunidade nao encontrado." }, { status: 404 });
        const lead = leadSnap.data() as Record<string, unknown>;
        assertAssignedCommercialRecordAccess(membership, user.uid, lead);
        const phone = normalizePhoneBR(clean(lead.telefone, 60));
        if (!phone) return NextResponse.json({ error: "O lead nao possui telefone valido." }, { status: 409 });
        const boundChatId = clean(record(draft.messageDelivery).chatId, 180);
        const boundChat = boundChatId ? await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId: boundChatId }) : null;
        const channel = await getWhatsAppChannelForTenant(tenantId, { allowAgencyFallback: false, channelId: clean(proposed.channelId, 180) || clean(record(boundChat).channelId, 180) || null });
        if (!channel) return NextResponse.json({ error: "Canal WhatsApp ativo nao configurado para esta empresa." }, { status: 409 });
        if (channel.channelScope === "personal" && channel.ownerUserId !== user.uid && !hasTeamWideCommercialAccess(membership)) return NextResponse.json({ error: "Este WhatsApp pessoal pertence a outro vendedor." }, { status: 403 });
        const chatsSnap = await adminDb.collection("chats").where("tenantId", "==", tenantId).where("contactPhoneNormalized", "==", phone).limit(20).get();
        const existing = chatsSnap.docs.find((doc) => clean(doc.data().channelId, 180) === channel.id);
        const templateName = clean(proposed.templateName, 180);
        if (!existing && isOfficialWhatsAppProvider(channel.provider) && !templateName) {
          return NextResponse.json({ error: "A API oficial exige templateName aprovado para iniciar uma conversa nova." }, { status: 409 });
        }
        if (existing) await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId: existing.id });
        const resolved = boundChatId ? { chatRef: adminDb.collection("chats").doc(boundChatId) }
          : await resolveCanonicalWhatsAppChat({ tenantId, channelId: channel.id, phone, requireExactChannel: true,
            createData: { tenantId, leadId, contactName: clean(lead.nome, 180) || phone, contactPhone: phone, contactPhoneNormalized: phone, status: "open",
              ownerId: clean(lead.ownerId || lead.assignedTo, 180) || user.uid, ownerName: clean(lead.owner || lead.ownerName, 180) || user.name,
              channel: "whatsapp", channelId: channel.id, channelPhoneNumberId: channel.phoneNumberId,
              createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessageTime: FieldValue.serverTimestamp(), lastMessage: "" } });
        await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId: resolved.chatRef.id });
        await adminDb.runTransaction(async tx => {
          const chat = await tx.get(resolved.chatRef);
          if (chat.data()?.tenantId !== tenantId || chat.data()?.channelId !== channel.id || chat.data()?.isGroup === true ||
            (chat.data()?.leadId && chat.data()?.leadId !== leadId)) throw new CommandError("CONVERSATION_SCOPE_CHANGED", 409);
          if (!chat.data()?.leadId) tx.update(resolved.chatRef, { leadId, updatedAt: FieldValue.serverTimestamp() });
        });
        const application = await deliverApprovedMcpMessage({ tenantId, draftId: safeDraftId, chatId: resolved.chatRef.id,
          approvedFingerprint: mcpMessageFingerprint(draft), actor: { id: user.uid, name: user.name } });
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", ...application });
      }
      throw new Error("UNSUPPORTED_OPERATIONAL_DRAFT");
      } catch (error) {
        if (claimed) {
          await draftRef.set({
            status: "apply_failed_requires_review",
            lastApplyError: "A aplicacao falhou e precisa de nova revisao antes de tentar novamente.",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        throw error;
      }
    }
    if (draftType === "lead_segment") {
      await assertTenantModule(tenantId, "marketing");
      const proposedChange = record(draft.proposedChange);
      const name = clean(proposedChange.name, 120);
      const match = clean(proposedChange.match, 10);
      if (name.length < 3 || !["all", "any"].includes(match)) {
        return NextResponse.json({ error: "Definicao do segmento invalida. Crie um novo rascunho pelo MCP." }, { status: 409 });
      }
      let conditions;
      try {
        conditions = normalizeGrowthSegmentConditions(proposedChange.conditions);
      } catch {
        return NextResponse.json({ error: "Condicoes do segmento invalidas. Crie um novo rascunho pelo MCP." }, { status: 409 });
      }
      const segmentRef = adminDb.collection("growth_segments").doc();
      const auditRef = adminDb.collection("audit_logs").doc();
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(draftRef);
        if (!current.exists || current.data()?.status !== "approved_pending_apply" || current.data()?.appliedAt) {
          throw new Error("DRAFT_STATE_CHANGED");
        }
        transaction.set(segmentRef, {
          tenantId,
          name,
          status: "active",
          definition: { match, conditions },
          source: "mcp",
          sourceDraftId: safeDraftId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: user.uid,
          createdByName: user.name,
        });
        transaction.set(draftRef, {
          status: "applied",
          appliedAt: FieldValue.serverTimestamp(),
          appliedBy: user.uid,
          appliedByName: user.name,
          updatedAt: FieldValue.serverTimestamp(),
          application: { segmentId: segmentRef.id, name, match, conditions },
        }, { merge: true });
        transaction.set(auditRef, {
          type: "mcp_lead_segment_created",
          actorId: user.uid,
          actorName: user.name,
          tenantId,
          draftId: safeDraftId,
          segmentId: segmentRef.id,
          after: { name, match, conditions },
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", segment: { id: segmentRef.id, name, match, conditions } }, {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    if (draftType === "segment_campaign") {
      assertTenantCapability(membership, "manage_channels");
      await Promise.all([assertTenantModule(tenantId, "marketing"), assertTenantModule(tenantId, "whatsapp")]);
      const proposedChange = record(draft.proposedChange);
      const segmentId = clean(proposedChange.segmentId, 180);
      const channelId = clean(proposedChange.channelId, 180);
      const [segmentSnap, channelSnap] = await Promise.all([
        adminDb.collection("growth_segments").doc(segmentId).get(),
        adminDb.collection("tenant_channels").doc(channelId).get(),
      ]);
      const segment = segmentSnap.exists ? segmentSnap.data() as Record<string, unknown> : {};
      const channel = channelSnap.exists ? channelSnap.data() as Record<string, unknown> : {};
      if (segment.tenantId !== tenantId || clean(segment.status, 30) !== "active") {
        return NextResponse.json({ error: "O segmento deixou de estar disponivel para esta empresa." }, { status: 409 });
      }
      if (channel.tenantId !== tenantId || clean(channel.type, 40) !== "whatsapp" || clean(channel.status, 30) !== "active") {
        return NextResponse.json({ error: "O canal WhatsApp deixou de estar disponivel para esta empresa." }, { status: 409 });
      }
      const campaignRef = adminDb.collection("outbound_campaigns").doc();
      const auditRef = adminDb.collection("audit_logs").doc();
      const campaignPatch = buildOutboundCampaignPatch({
        tenantId,
        name: proposedChange.name,
        status: "draft",
        channelId,
        deliveryMode: "text",
        messageTemplate: proposedChange.message,
        maxRecipients: proposedChange.maxRecipients,
        sendRatePerMinute: 20,
        filters: { growthSegmentId: segmentId },
        actor: { id: user.uid, name: user.name },
      });
      if (!clean(campaignPatch.name, 120) || !clean(campaignPatch.messageTemplate, 4000)) {
        return NextResponse.json({ error: "Conteudo da campanha invalido. Crie um novo rascunho pelo MCP." }, { status: 409 });
      }
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(draftRef);
        if (!current.exists || current.data()?.status !== "approved_pending_apply" || current.data()?.appliedAt) throw new Error("DRAFT_STATE_CHANGED");
        transaction.set(campaignRef, { ...campaignPatch, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, createdByName: user.name });
        transaction.set(draftRef, {
          status: "applied",
          appliedAt: FieldValue.serverTimestamp(),
          appliedBy: user.uid,
          appliedByName: user.name,
          updatedAt: FieldValue.serverTimestamp(),
          application: { campaignId: campaignRef.id, status: "draft", segmentId, channelId },
        }, { merge: true });
        transaction.set(auditRef, {
          type: "mcp_segment_campaign_created",
          actorId: user.uid,
          actorName: user.name,
          tenantId,
          draftId: safeDraftId,
          campaignId: campaignRef.id,
          segmentId,
          channelId,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", campaign: { id: campaignRef.id, status: "draft", segmentId, channelId } }, {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    const googleDraftOperations: Record<string, string> = { google_negative_keyword: "google_add_keywords", google_keyword_pause: "google_set_keyword_status", google_ad_group_create: "google_create_ad_group", google_responsive_search_ad: "google_create_responsive_search_ad", google_campaign_create: "google_create_campaign", google_bidding_strategy: "google_set_bidding_strategy" };
    if (googleDraftOperations[draftType]) {
      assertTenantCapability(membership, "manage_channels");
      await assertTenantModule(tenantId, "marketing");
      const target = record(draft.target); const validation = record(draft.adportValidation);
      const operation = record(validation.operation) as unknown as WriteOperation; const expectedHash = clean(draft.operationHash, 128);
      if (!expectedHash || !await verifyAdportDraftHash(operation, expectedHash)) return NextResponse.json({ error: "A integridade do rascunho nao confere." }, { status: 409 });
      if (operation.tool !== googleDraftOperations[draftType] || operation.provider !== "google") return NextResponse.json({ error: "A operacao nao corresponde ao tipo de rascunho." }, { status: 409 });
      const channelId = clean(target.channelId, 180); const accountId = clean(target.adAccountId, 180);
      const channelSnap = await adminDb.collection("tenant_channels").doc(channelId).get(); const channel = channelSnap.exists ? channelSnap.data() as Record<string, unknown> : {};
      if (channel.tenantId !== tenantId || clean(channel.type, 40) !== "google_ads" || !sameAccount("google_ads", clean(channel.externalAccountId, 180), accountId)) return NextResponse.json({ error: "O conector Google Ads mudou ou nao pertence mais a esta empresa." }, { status: 409 });
      const metadata = record(channel.metadata); const refreshToken = clean(decryptSecret(channel.refreshToken), 4000);
      if (!hasAdportGoogleCredentials({ refreshToken })) return NextResponse.json({ error: "Credenciais insuficientes para validar a mudanca no Google." }, { status: 409 });
      const attemptId = randomUUID();
      await adminDb.runTransaction(async (transaction) => { const current = await transaction.get(draftRef); if (!current.exists || current.data()?.status !== "approved_pending_apply" || current.data()?.appliedAt) throw new Error("DRAFT_STATE_CHANGED"); transaction.set(draftRef, { status: "applying", applyAttemptId: attemptId, applyingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
      try {
        const application = await applyAdportGoogleOperation({ accountId, operation, credentials: { platform: "google_ads", ...adportGoogleCredentials({ refreshToken, loginCustomerId: clean(metadata.loginCustomerId, 180) || clean(channel.pageId, 180) }) } });
        await Promise.all([draftRef.set({ status: "applied", appliedAt: FieldValue.serverTimestamp(), appliedBy: user.uid, appliedByName: user.name, updatedAt: FieldValue.serverTimestamp(), application }, { merge: true }), adminDb.collection("audit_logs").add({ type: "mcp_google_ads_draft_applied", action: draftType, actorId: user.uid, actorName: user.name, tenantId, draftId: safeDraftId, target, before: application.preview, after: application.result, operationHash: application.operationHash, createdAt: FieldValue.serverTimestamp() })]);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", preview: application.preview, result: application.result });
      } catch (error) {
        const providerError = clean(error instanceof Error ? error.message : "Falha no provedor.", 800);
        await draftRef.set({ status: "apply_failed_requires_review", lastApplyError: providerError, lastApplyAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        throw error;
      }
    }
    const metaDraftOperations: Record<string, { tool: string; edge?: string }> = {
      meta_campaign_create: { tool: "meta_create_campaign" },
      meta_ad_set_create: { tool: "meta_create_ad_set" },
      meta_ad_set_status: { tool: "meta_set_ad_set_status" },
      meta_creative_create: { tool: "meta_api_create", edge: "adcreatives" },
      meta_ad_create: { tool: "meta_api_create", edge: "ads" },
    };
    if (metaDraftOperations[draftType]) {
      assertTenantCapability(membership, "manage_channels");
      await assertTenantModule(tenantId, "marketing");
      const target = record(draft.target); const validation = record(draft.adportValidation);
      const operation = record(validation.operation) as unknown as WriteOperation; const expectedHash = clean(draft.operationHash, 128);
      const expected = metaDraftOperations[draftType];
      if (!expectedHash || !await verifyAdportDraftHash(operation, expectedHash)) return NextResponse.json({ error: "A integridade do rascunho não confere." }, { status: 409 });
      if (operation.tool !== expected.tool || operation.provider !== "meta" || (expected.edge && clean(record(operation.payload).edge, 40) !== expected.edge)) return NextResponse.json({ error: "A operação não corresponde ao tipo de rascunho." }, { status: 409 });
      const channelId = clean(target.channelId, 180); const accountId = clean(target.adAccountId, 180);
      const channelSnap = await adminDb.collection("tenant_channels").doc(channelId).get(); const channel = channelSnap.exists ? channelSnap.data() as Record<string, unknown> : {};
      if (channel.tenantId !== tenantId || clean(channel.type, 40) !== "meta_ads" || !sameAccount("meta_ads", clean(channel.externalAccountId, 180), accountId)) return NextResponse.json({ error: "O conector Meta Ads mudou ou não pertence mais a esta empresa." }, { status: 409 });
      const metadata = record(channel.metadata); const accessToken = clean(decryptSecret(channel.accessToken), 4000);
      if (!accessToken) return NextResponse.json({ error: "Credenciais insuficientes para validar a mudança no Meta Ads." }, { status: 409 });
      const attemptId = randomUUID();
      await adminDb.runTransaction(async (transaction) => { const current = await transaction.get(draftRef); if (!current.exists || current.data()?.status !== "approved_pending_apply" || current.data()?.appliedAt) throw new Error("DRAFT_STATE_CHANGED"); transaction.set(draftRef, { status: "applying", applyAttemptId: attemptId, applyingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); });
      try {
        const application = await applyAdportMetaOperation({ accountId, operation, credentials: { platform: "meta_ads", accessToken, appId: clean(metadata.appId, 180) || undefined, appSecret: clean(metadata.appSecret, 4000) || undefined } });
        await Promise.all([draftRef.set({ status: "applied", appliedAt: FieldValue.serverTimestamp(), appliedBy: user.uid, appliedByName: user.name, updatedAt: FieldValue.serverTimestamp(), application }, { merge: true }), adminDb.collection("audit_logs").add({ type: "mcp_meta_ads_draft_applied", action: draftType, actorId: user.uid, actorName: user.name, tenantId, draftId: safeDraftId, target, before: application.preview, after: application.result, operationHash: application.operationHash, createdAt: FieldValue.serverTimestamp() })]);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", preview: application.preview, result: application.result });
      } catch (error) {
        const providerError = clean(error instanceof Error ? error.message : "Falha no provedor.", 800);
        await draftRef.set({ status: "apply_failed_requires_review", lastApplyError: providerError, lastApplyAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        throw error;
      }
    }
    if (draftType === "campaign_pause" || draftType === "campaign_budget_change") {
      assertTenantCapability(membership, "manage_channels");
      await assertTenantModule(tenantId, "marketing");
      const target = record(draft.target);
      const proposedChange = record(draft.proposedChange);
      const adportValidation = record(draft.adportValidation);
      const storedOperation = record(adportValidation.operation) as unknown as WriteOperation;
      const expectedHash = clean(draft.operationHash, 128);
      if (!expectedHash || !await verifyAdportDraftHash(storedOperation, expectedHash)) {
        return NextResponse.json({ error: "A integridade do rascunho nao confere. Crie uma nova proposta pelo MCP." }, { status: 409 });
      }

      const platform = clean(target.platform, 40) as CampaignPlatform;
      const campaignId = clean(target.campaignId, 180);
      const accountId = clean(target.adAccountId, 180);
      const channelId = clean(target.channelId, 180);
      if (!(["meta_ads", "google_ads"] as string[]).includes(platform) || !campaignId || !accountId || !channelId) {
        return NextResponse.json({ error: "Rascunho sem alvo completo. Sincronize a campanha e crie uma nova proposta." }, { status: 409 });
      }

      const channelSnap = await adminDb.collection("tenant_channels").doc(channelId).get();
      const channel = channelSnap.exists ? channelSnap.data() as Record<string, unknown> : {};
      const externalAccountId = clean(channel.externalAccountId, 180);
      if (channel.tenantId !== tenantId || clean(channel.type, 40) !== platform || !externalAccountId || !sameAccount(platform, externalAccountId, accountId)) {
        return NextResponse.json({ error: "O conector da campanha mudou ou nao pertence mais a esta empresa." }, { status: 409 });
      }

      const action = draftType === "campaign_pause" ? "pause_campaign" as const : "change_daily_budget" as const;
      const proposedDailyBudget = action === "change_daily_budget" ? Number(proposedChange.to) : undefined;
      if (action === "change_daily_budget" && (!Number.isFinite(proposedDailyBudget) || proposedDailyBudget! <= 0)) {
        return NextResponse.json({ error: "Novo orcamento invalido no rascunho." }, { status: 409 });
      }

      const metadata = record(channel.metadata);
      const accessToken = clean(decryptSecret(channel.accessToken), 4000);
      const refreshToken = clean(decryptSecret(channel.refreshToken), 4000);
      const credentials = platform === "meta_ads"
        ? { platform, accessToken, appId: clean(metadata.appId, 180) || undefined, appSecret: clean(metadata.appSecret, 4000) || undefined }
        : { platform, ...adportGoogleCredentials({ refreshToken, loginCustomerId: clean(metadata.loginCustomerId, 180) || clean(channel.pageId, 180) }) };
      if ((platform === "meta_ads" && !accessToken) || (platform === "google_ads" && !hasAdportGoogleCredentials({ refreshToken }))) {
        return NextResponse.json({ error: "Credenciais insuficientes para validar a mudanca no provedor." }, { status: 409 });
      }

      const attemptId = randomUUID();
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(draftRef);
        if (!current.exists || current.data()?.status !== "approved_pending_apply" || current.data()?.appliedAt) {
          throw new Error("DRAFT_STATE_CHANGED");
        }
        transaction.set(draftRef, {
          status: "applying",
          applyAttemptId: attemptId,
          applyingAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      try {
        const application = await applyAdportCampaignChange({
          platform,
          accountId: externalAccountId,
          campaignId,
          action,
          proposedDailyBudget,
          credentials,
        });
        await Promise.all([
          draftRef.set({
            status: "applied",
            appliedAt: FieldValue.serverTimestamp(),
            appliedBy: user.uid,
            appliedByName: user.name,
            updatedAt: FieldValue.serverTimestamp(),
            application: { preview: application.preview, result: application.result, providerAudit: application.audit, operationHash: application.operationHash },
          }, { merge: true }),
          adminDb.collection("audit_logs").add({
            type: "mcp_campaign_draft_applied",
            actorId: user.uid,
            actorName: user.name,
            tenantId,
            draftId: safeDraftId,
            target: { platform, accountId: externalAccountId, campaignId },
            before: application.preview,
            after: application.result,
            operationHash: application.operationHash,
            createdAt: FieldValue.serverTimestamp(),
          }),
        ]);
        return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", preview: application.preview, result: application.result }, {
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      } catch (error) {
        const providerError = clean(error instanceof Error ? error.message : "Falha no provedor.", 800);
        await Promise.all([
          draftRef.set({ status: "apply_failed_requires_review", lastApplyError: providerError, lastApplyAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
          adminDb.collection("audit_logs").add({ type: "mcp_campaign_draft_apply_failed", actorId: user.uid, actorName: user.name, tenantId, draftId: safeDraftId, error: providerError, createdAt: FieldValue.serverTimestamp() }),
        ]);
        throw error;
      }
    }

    if (draftType !== "ai_behavior_update") return NextResponse.json({ error: "Tipo de rascunho nao suportado." }, { status: 400 });
    assertTenantCapability(membership, "manage_ai");
    await assertTenantModule(tenantId, "ai");

    const proposedChange = draft.proposedChange && typeof draft.proposedChange === "object" ? draft.proposedChange as ProposedAiChange : {};
    const settings = await getTenantSettings(tenantId);
    const ai = currentAi(settings);
    const before = {
      objective: clean(ai.objective, 200),
      toneOfVoice: clean(ai.toneOfVoice, 120),
      guardrails: currentGuardrails(ai),
      mcpAppliedInstructions: clean(ai.mcpAppliedInstructions, 2500),
    };
    const next = {
      ...ai,
      objective: clean(proposedChange.objective, 200) || before.objective,
      toneOfVoice: clean(proposedChange.tone, 120) || before.toneOfVoice,
      guardrails: parseGuardrails(proposedChange.guardrails).length ? parseGuardrails(proposedChange.guardrails) : before.guardrails,
      mcpAppliedInstructions: clean(proposedChange.instructions, 2500) || before.mcpAppliedInstructions,
      mcpLastAppliedDraftId: safeDraftId,
      mcpLastAppliedAt: FieldValue.serverTimestamp(),
      mcpLastAppliedBy: user.uid,
    };
    const after = {
      objective: next.objective,
      toneOfVoice: next.toneOfVoice,
      guardrails: next.guardrails,
      mcpAppliedInstructions: next.mcpAppliedInstructions,
    };

    await Promise.all([
      adminDb.collection("tenant_settings").doc(tenantId).set({
        tenantId,
        ai: next,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      }, { merge: true }),
      draftRef.set({
        status: "applied",
        appliedAt: FieldValue.serverTimestamp(),
        appliedBy: user.uid,
        appliedByName: user.name,
        updatedAt: FieldValue.serverTimestamp(),
        application: { before, after },
      }, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "mcp_action_draft_applied",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        draftId: safeDraftId,
        target: "tenant_settings.ai",
        before,
        after,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status: "applied", before, after }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof AppointmentChangeError) return NextResponse.json({error: error.message, code: error.code}, {status: error.status});
    if (error instanceof CrmDraftMutationConflict) return NextResponse.json({ error: error.message, code: "CRM_DRAFT_CONFLICT" }, { status: 409 });
    if (error instanceof McpMessageDeliveryPendingError) return NextResponse.json({ ok: false, pending: true, status: "applying", jobId: error.jobId, error: error.message }, { status: 409 });
    if (error instanceof McpMessageDeliveryBlockedError) return NextResponse.json({ ok: false, pending: false, code: "delivery_blocked", jobId: error.jobId, error: error.message }, { status: 409 });
    if (error instanceof ChatOutboundIdempotencyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof CommandError) return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    if (error instanceof Error && error.message === "DRAFT_STATE_CHANGED") return NextResponse.json({ error: "O estado do rascunho mudou. Atualize a pagina antes de tentar novamente." }, { status: 409 });
    const providerCode = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (["POLICY_VIOLATION", "PENDING_MISMATCH", "PROVIDER_ERROR", "INVALID_INPUT"].includes(providerCode)) {
      return NextResponse.json({ error: clean(error instanceof Error ? error.message : "Mudanca recusada pelo provedor."), code: providerCode }, { status: providerCode === "PROVIDER_ERROR" ? 502 : 409 });
    }
    console.error("Erro ao aplicar rascunho MCP:", error);
    return NextResponse.json({ error: "Falha ao aplicar rascunho MCP." }, { status: 500 });
  }
}
