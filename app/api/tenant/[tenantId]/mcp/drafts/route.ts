import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { CampaignPolicyError, createAdportCampaignPreview, resolveCampaignTarget, type CampaignPlatform } from "@/lib/server/growth/campaign-action-policy";
import { GoogleDraftError, prepareGoogleDraft, type GoogleDraftTool, type GoogleOperatorSnapshot } from "@/lib/server/growth/google-ads-actions";
import { MetaDraftError, prepareMetaDraft, type MetaDraftTool, type MetaOperatorSnapshot } from "@/lib/server/growth/meta-ads-actions";
import { hashAdportOperation } from "@/lib/server/growth/adport-connectors";

export const dynamic = "force-dynamic";

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    const snap = await adminDb.collection("mcp_action_drafts").where("tenantId", "==", tenantId).limit(80).get();
    const drafts = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const proposedChange = data.proposedChange && typeof data.proposedChange === "object" ? data.proposedChange as Record<string, unknown> : {};
      const target = data.target && typeof data.target === "object" ? data.target as Record<string, unknown> : null;
      return {
        id: doc.id,
        type: clean(data.type, 120),
        status: clean(data.status, 80) || "pending_review",
        title: clean(data.title, 180) || clean(proposedChange.objective, 180) || "Rascunho MCP",
        source: clean(data.source, 40) || "mcp",
        proposedChange,
        target,
        reason: clean(data.reason, 600),
        evidence: Array.isArray(data.evidence) ? data.evidence.map((item) => clean(item, 300)).filter(Boolean).slice(0, 10) : [],
        providerValidationRequired: data.providerValidationRequired === true,
        createdAt: toIso(data.createdAt),
        reviewedAt: toIso(data.reviewedAt),
        reviewedByName: clean(data.reviewedByName, 140),
        appliedAt: toIso(data.appliedAt),
        appliedByName: clean(data.appliedByName, 140),
      };
    }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return NextResponse.json({ ok: true, tenantId, drafts }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar rascunhos MCP:", error);
    return NextResponse.json({ error: "Falha ao listar rascunhos MCP." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    assertTenantCapability(membership, "manage_channels");
    await assertTenantModule(tenantId, "marketing");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const tool = clean(body.tool, 80);
    const googleTools = ["draft_google_negative_keyword", "draft_google_keyword_pause", "draft_google_ad_group_create", "draft_google_responsive_search_ad", "draft_google_campaign_create", "draft_google_bidding_strategy"];
    const metaTools = ["draft_meta_campaign_create", "draft_meta_ad_set_create", "draft_meta_ad_set_status", "draft_meta_creative_create", "draft_meta_ad_create"];
    if (!["draft_campaign_pause", "draft_campaign_budget_change", ...googleTools, ...metaTools].includes(tool)) return NextResponse.json({ error: "Acao nao permitida neste endpoint." }, { status: 400 });
    const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments as Record<string, unknown> : {};
    const platform = clean(args.platform, 40) as CampaignPlatform;
    const campaignId = clean(args.campaignId, 180);
    const adAccountId = clean(args.adAccountId, 180);
    const reason = clean(args.reason, 600);
    const evidence = Array.isArray(args.evidence) ? args.evidence.map((item) => clean(item, 300)).filter(Boolean).slice(0, 10) : [];
    if (!(["google_ads", "meta_ads"] as string[]).includes(platform) || reason.length < 8 || !evidence.length) return NextResponse.json({ error: "Recomendacao de campanha incompleta." }, { status: 400 });
    if (googleTools.includes(tool)) {
      if (platform !== "google_ads") return NextResponse.json({ error: "Esta acao exige uma conta Google Ads." }, { status: 400 });
      const reports = await adminDb.collection("google_ads_operator_reports").where("tenantId", "==", tenantId).limit(30).get();
      const snapshots = reports.docs.map((doc) => { const data = doc.data(); return { accountId: String(data.accountId || ""), channelId: String(data.channelId || ""), report: data.report || {} } as GoogleOperatorSnapshot; });
      const prepared = prepareGoogleDraft(tool as GoogleDraftTool, args, snapshots);
      const operationHash = await hashAdportOperation(prepared.operation);
      const ref = await adminDb.collection("mcp_action_drafts").add({ tenantId, userId: user.uid, type: prepared.type, source: "google_ads_operator", status: "pending_review", risk: "DRAFT", title: prepared.title, target: prepared.target, reason, evidence, proposedChange: prepared.proposedChange, providerValidationRequired: true, operationHash, adportValidation: { engine: "@adport/core", version: "0.6.0", operation: prepared.operation, preview: prepared.preview }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await adminDb.collection("audit_logs").add({ type: "google_ads_operator_draft_created", tenantId, actorId: user.uid, actorName: user.name, draftId: ref.id, target: prepared.target, createdAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, draftId: ref.id, status: "pending_review", href: `/cliente/painel/configuracoes/mcp?draft=${encodeURIComponent(ref.id)}` }, { status: 201 });
    }
    if (metaTools.includes(tool)) {
      if (platform !== "meta_ads") return NextResponse.json({ error: "Esta ação exige uma conta Meta Ads." }, { status: 400 });
      const reports = await adminDb.collection("meta_ads_operator_reports").where("tenantId", "==", tenantId).limit(30).get();
      const snapshots = reports.docs.map((doc) => { const data = doc.data(); return { accountId: String(data.accountId || ""), channelId: String(data.channelId || ""), report: data.report || {} } as MetaOperatorSnapshot; });
      const prepared = prepareMetaDraft(tool as MetaDraftTool, args, snapshots);
      const operationHash = await hashAdportOperation(prepared.operation);
      const ref = await adminDb.collection("mcp_action_drafts").add({ tenantId, userId: user.uid, type: prepared.type, source: "meta_ads_operator", status: "pending_review", risk: "DRAFT", title: prepared.title, target: prepared.target, reason, evidence, proposedChange: prepared.proposedChange, providerValidationRequired: true, operationHash, adportValidation: { engine: "@adport/core", version: "0.6.0", operation: prepared.operation, preview: prepared.preview }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await adminDb.collection("audit_logs").add({ type: "meta_ads_operator_draft_created", tenantId, actorId: user.uid, actorName: user.name, draftId: ref.id, target: prepared.target, createdAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, draftId: ref.id, status: "pending_review", href: `/cliente/painel/configuracoes/mcp?draft=${encodeURIComponent(ref.id)}` }, { status: 201 });
    }
    const snapshots = await adminDb.collection("campaign_snapshots").where("tenantId", "==", tenantId).limit(200).get();
    const rows = snapshots.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const target = resolveCampaignTarget(rows, { platform, campaignId, adAccountId: adAccountId || undefined });
    const action = tool === "draft_campaign_pause" ? "pause_campaign" as const : "change_daily_budget" as const;
    const currentDailyBudget = Number(args.currentDailyBudget);
    const proposedDailyBudget = Number(args.proposedDailyBudget);
    const currency = clean(args.currency, 3).toUpperCase();
    if (action === "change_daily_budget" && (!Number.isFinite(currentDailyBudget) || currentDailyBudget <= 0 || !Number.isFinite(proposedDailyBudget) || proposedDailyBudget <= 0 || !/^[A-Z]{3}$/.test(currency))) return NextResponse.json({ error: "Orcamento sugerido invalido." }, { status: 400 });
    const adport = await createAdportCampaignPreview({ target, action, currentDailyBudget, proposedDailyBudget, currency, reason, evidence });
    const proposedChange = action === "pause_campaign"
      ? { action, expectedStatus: "active", nextStatus: "paused" }
      : { action, currency, from: Number(currentDailyBudget.toFixed(2)), to: Number(proposedDailyBudget.toFixed(2)), delta: Number((proposedDailyBudget - currentDailyBudget).toFixed(2)), deltaPercent: Number((Math.abs((proposedDailyBudget - currentDailyBudget) / currentDailyBudget) * 100).toFixed(2)), direction: proposedDailyBudget > currentDailyBudget ? "increase" : proposedDailyBudget < currentDailyBudget ? "decrease" : "unchanged" };
    const ref = await adminDb.collection("mcp_action_drafts").add({ tenantId, userId: user.uid, type: action === "pause_campaign" ? "campaign_pause" : "campaign_budget_change", source: "google_ads_operator", status: "pending_review", risk: "DRAFT", title: action === "pause_campaign" ? `Pausar campanha ${target.campaignName}` : `Alterar verba de ${target.campaignName}`, target, reason, evidence, proposedChange, providerValidationRequired: true, sampledSnapshots: rows.length, sourceIncomplete: snapshots.size >= 200, operationHash: adport.operationHash, adportValidation: adport, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await adminDb.collection("audit_logs").add({ type: "google_ads_operator_draft_created", tenantId, actorId: user.uid, actorName: user.name, draftId: ref.id, target, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, draftId: ref.id, status: "pending_review", href: `/cliente/painel/configuracoes/mcp?draft=${encodeURIComponent(ref.id)}` }, { status: 201, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof CampaignPolicyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof GoogleDraftError) return NextResponse.json({ error: error.message, code: "INVALID_GOOGLE_DRAFT" }, { status: 409 });
    if (error instanceof MetaDraftError) return NextResponse.json({ error: error.message, code: "INVALID_META_DRAFT" }, { status: 409 });
    console.error("Erro ao criar rascunho do operador Google Ads:", error);
    return NextResponse.json({ error: "Falha ao preparar a mudanca do Google Ads." }, { status: 500 });
  }
}
