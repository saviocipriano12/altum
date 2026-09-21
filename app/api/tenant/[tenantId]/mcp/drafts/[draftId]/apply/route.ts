import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { adportGoogleCredentials, applyAdportCampaignChange, applyAdportGoogleOperation, applyAdportMetaOperation, hasAdportGoogleCredentials, verifyAdportDraftHash } from "@/lib/server/growth/adport-connectors";
import type { CampaignPlatform } from "@/lib/server/growth/campaign-action-policy";
import { normalizeGrowthSegmentConditions } from "@/lib/server/growth/segment-engine";
import { buildOutboundCampaignPatch } from "@/lib/server/outbound-campaigns";
import type { WriteOperation } from "@adport/core";

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

function sameAccount(platform: CampaignPlatform, left: string, right: string) {
  if (platform === "meta_ads") return left.replace(/^act_/, "") === right.replace(/^act_/, "");
  return left.replace(/[^\d]/g, "") === right.replace(/[^\d]/g, "");
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; draftId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, draftId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const safeDraftId = clean(draftId, 180);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(safeDraftId)) {
      return NextResponse.json({ error: "Rascunho invalido." }, { status: 400 });
    }

    const draftRef = adminDb.collection("mcp_action_drafts").doc(safeDraftId);
    const draftSnap = await draftRef.get();
    if (!draftSnap.exists) return NextResponse.json({ error: "Rascunho nao encontrado." }, { status: 404 });
    const draft = draftSnap.data() as Record<string, unknown>;
    if (draft.tenantId !== tenantId) return NextResponse.json({ error: "Sem permissao para este rascunho." }, { status: 403 });
    if (draft.status !== "approved_pending_apply") {
      return NextResponse.json({ error: "Aprove o rascunho antes de aplicar." }, { status: 409 });
    }
    if (draft.appliedAt) return NextResponse.json({ error: "Rascunho ja aplicado." }, { status: 409 });

    const draftType = clean(draft.type, 120);
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
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof Error && error.message === "DRAFT_STATE_CHANGED") return NextResponse.json({ error: "O estado do rascunho mudou. Atualize a pagina antes de tentar novamente." }, { status: 409 });
    const providerCode = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (["POLICY_VIOLATION", "PENDING_MISMATCH", "PROVIDER_ERROR", "INVALID_INPUT"].includes(providerCode)) {
      return NextResponse.json({ error: clean(error instanceof Error ? error.message : "Mudanca recusada pelo provedor."), code: providerCode }, { status: providerCode === "PROVIDER_ERROR" ? 502 : 409 });
    }
    console.error("Erro ao aplicar rascunho MCP:", error);
    return NextResponse.json({ error: "Falha ao aplicar rascunho MCP." }, { status: 500 });
  }
}
