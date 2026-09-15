import type { WriteOperation } from "@adport/core";

export type MetaDraftTool =
  | "draft_meta_campaign_create"
  | "draft_meta_ad_set_create"
  | "draft_meta_ad_set_status"
  | "draft_meta_creative_create"
  | "draft_meta_ad_create";

export type MetaOperatorSnapshot = {
  accountId: string;
  channelId: string;
  report: {
    campaigns?: Array<{ id?: string; name?: string }>;
    adSets?: Array<{ id?: string; name?: string; campaignId?: string }>;
    ads?: Array<{ id?: string; name?: string; adSetId?: string }>;
  };
};

export type PreparedMetaDraft = {
  type: string;
  title: string;
  target: Record<string, unknown>;
  proposedChange: Record<string, unknown>;
  operation: WriteOperation;
  preview: { summary: string; changes: string[]; serverValidated: false };
};

export class MetaDraftError extends Error {}

const clean = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const digits = (value: unknown) => clean(value).replace(/[^\d]/g, "");
const positiveMoney = (value: unknown, label: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100_000) throw new MetaDraftError(`${label} inválido.`);
  return parsed;
};
const validUrl = (value: unknown) => {
  const url = clean(value, 500);
  try { return ["http:", "https:"].includes(new URL(url).protocol) ? url : ""; } catch { return ""; }
};

export function prepareMetaDraft(tool: MetaDraftTool, args: Record<string, unknown>, snapshots: MetaOperatorSnapshot[]): PreparedMetaDraft {
  const accountId = digits(args.adAccountId);
  const snapshot = snapshots.find((item) => digits(item.accountId) === accountId);
  if (!accountId || !snapshot) throw new MetaDraftError("Conta Meta Ads não encontrada no último relatório autorizado.");

  const baseTarget = { platform: "meta_ads", adAccountId: `act_${accountId}`, channelId: snapshot.channelId };
  const campaignId = digits(args.campaignId);
  const adSetId = digits(args.adSetId);
  const campaigns = snapshot.report.campaigns || [];
  const adSets = snapshot.report.adSets || [];
  const knownCampaign = campaigns.find((item) => digits(item.id) === campaignId);
  const knownAdSet = adSets.find((item) => digits(item.id) === adSetId && (!campaignId || digits(item.campaignId) === campaignId));

  if (tool === "draft_meta_campaign_create") {
    const name = clean(args.name, 120);
    const objective = clean(args.objective, 60).toUpperCase();
    const dailyBudget = args.dailyBudget == null ? undefined : positiveMoney(args.dailyBudget, "Orçamento diário");
    const allowedObjectives = ["OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS", "OUTCOME_APP_PROMOTION"];
    if (!name || !allowedObjectives.includes(objective)) throw new MetaDraftError("Nome ou objetivo da campanha inválido.");
    const operation: WriteOperation = { tool: "meta_create_campaign", provider: "meta", accountId, kind: "create", payload: { name, objective, status: "PAUSED", special_ad_categories: [], ...(dailyBudget ? { daily_budget_cents: Math.round(dailyBudget * 100) } : {}) } };
    return { type: "meta_campaign_create", title: `Criar campanha ${name}`, target: baseTarget, proposedChange: { action: "create_campaign", name, objective, dailyBudget: dailyBudget || null, initialStatus: "PAUSED" }, operation, preview: { summary: `Criar campanha pausada ${name}`, changes: [`+ campanha ${name}`, `+ objetivo ${objective}`, ...(dailyBudget ? [`+ orçamento diário ${dailyBudget}`] : [])], serverValidated: false } };
  }

  if (tool === "draft_meta_ad_set_create") {
    if (!knownCampaign) throw new MetaDraftError("Campanha não encontrada no último relatório autorizado.");
    const name = clean(args.name, 120);
    const countries = Array.isArray(args.countries) ? args.countries.map((item) => clean(item, 2).toUpperCase()).filter((item) => /^[A-Z]{2}$/.test(item)).slice(0, 25) : [];
    const dailyBudget = args.dailyBudget == null ? undefined : positiveMoney(args.dailyBudget, "Orçamento diário");
    const optimizationGoal = clean(args.optimizationGoal, 60).toUpperCase() || "LEAD_GENERATION";
    if (!name || !countries.length) throw new MetaDraftError("Informe o nome e ao menos um país válido para o conjunto.");
    const operation: WriteOperation = { tool: "meta_create_ad_set", provider: "meta", accountId, kind: "create", payload: { campaign_id: campaignId, name, countries, optimization_goal: optimizationGoal, billing_event: "IMPRESSIONS", status: "PAUSED", ...(dailyBudget ? { daily_budget_cents: Math.round(dailyBudget * 100) } : {}) } };
    return { type: "meta_ad_set_create", title: `Criar conjunto ${name}`, target: { ...baseTarget, campaignId }, proposedChange: { action: "create_ad_set", name, campaignName: knownCampaign.name || campaignId, countries, optimizationGoal, dailyBudget: dailyBudget || null, initialStatus: "PAUSED" }, operation, preview: { summary: `Criar conjunto pausado ${name}`, changes: [`+ conjunto em ${knownCampaign.name || campaignId}`, `+ países ${countries.join(", ")}`, ...(dailyBudget ? [`+ orçamento diário ${dailyBudget}`] : [])], serverValidated: false } };
  }

  if (tool === "draft_meta_ad_set_status") {
    if (!knownAdSet) throw new MetaDraftError("Conjunto não encontrado no último relatório autorizado.");
    const status = clean(args.status, 20).toUpperCase();
    if (!["ACTIVE", "PAUSED"].includes(status)) throw new MetaDraftError("Estado do conjunto inválido.");
    const operation: WriteOperation = { tool: "meta_set_ad_set_status", provider: "meta", accountId, kind: "update", payload: { ad_set_id: adSetId, status } };
    return { type: "meta_ad_set_status", title: `${status === "ACTIVE" ? "Ativar" : "Pausar"} conjunto ${knownAdSet.name || adSetId}`, target: { ...baseTarget, campaignId: digits(knownAdSet.campaignId), adSetId }, proposedChange: { action: "set_ad_set_status", name: knownAdSet.name || adSetId, nextStatus: status }, operation, preview: { summary: `${status === "ACTIVE" ? "Ativar" : "Pausar"} conjunto`, changes: [`~ conjunto ${adSetId} → ${status}`], serverValidated: false } };
  }

  if (tool === "draft_meta_creative_create") {
    const name = clean(args.name, 120);
    const pageId = digits(args.pageId);
    const link = validUrl(args.link);
    const imageUrl = validUrl(args.imageUrl);
    const message = clean(args.message, 2_200);
    const headline = clean(args.headline, 255);
    const description = clean(args.description, 255);
    const callToAction = clean(args.callToAction, 40).toUpperCase() || "LEARN_MORE";
    if (!name || !pageId || !link || !imageUrl || !message || !headline) throw new MetaDraftError("Criativo incompleto. Informe página, imagem, destino, texto e título válidos.");
    const linkData: Record<string, unknown> = { link, picture: imageUrl, message, name: headline, call_to_action: { type: callToAction, value: { link } } };
    if (description) linkData.description = description;
    const operation: WriteOperation = { tool: "meta_api_create", provider: "meta", accountId, kind: "create", payload: { edge: "adcreatives", fields: { name, object_story_spec: { page_id: pageId, link_data: linkData }, ...(digits(args.instagramActorId) ? { instagram_actor_id: digits(args.instagramActorId) } : {}) } } };
    return { type: "meta_creative_create", title: `Criar criativo ${name}`, target: baseTarget, proposedChange: { action: "create_creative", name, pageId, link, imageUrl, message, headline, description, callToAction }, operation, preview: { summary: `Criar criativo ${name}`, changes: [`+ imagem ${imageUrl}`, `+ destino ${link}`, `+ CTA ${callToAction}`], serverValidated: false } };
  }

  if (!knownAdSet) throw new MetaDraftError("Conjunto não encontrado no último relatório autorizado.");
  const name = clean(args.name, 120);
  const creativeId = digits(args.creativeId);
  if (!name || !creativeId) throw new MetaDraftError("Informe nome e ID do criativo aprovado.");
  const operation: WriteOperation = { tool: "meta_api_create", provider: "meta", accountId, kind: "create", payload: { edge: "ads", fields: { name, adset_id: adSetId, creative: { creative_id: creativeId }, status: "PAUSED" } } };
  return { type: "meta_ad_create", title: `Criar anúncio ${name}`, target: { ...baseTarget, campaignId: digits(knownAdSet.campaignId), adSetId, creativeId }, proposedChange: { action: "create_ad", name, creativeId, adSetName: knownAdSet.name || adSetId, initialStatus: "PAUSED" }, operation, preview: { summary: `Criar anúncio pausado ${name}`, changes: [`+ anúncio em ${knownAdSet.name || adSetId}`, `+ criativo ${creativeId}`], serverValidated: false } };
}
