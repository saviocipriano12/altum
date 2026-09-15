import type { WriteOperation } from "@adport/core";

export type GoogleDraftTool =
  | "draft_google_negative_keyword"
  | "draft_google_keyword_pause"
  | "draft_google_ad_group_create"
  | "draft_google_responsive_search_ad"
  | "draft_google_campaign_create"
  | "draft_google_bidding_strategy";

export type GoogleOperatorSnapshot = {
  accountId: string;
  channelId: string;
  report: {
    campaigns?: Array<{ id?: string; name?: string }>;
    keywords?: Array<{ campaignId?: string; adGroupId?: string; criterionId?: string; text?: string }>;
    searchTerms?: Array<{ campaignId?: string; adGroupId?: string; term?: string }>;
    ads?: Array<{ campaignId?: string; adGroupId?: string; id?: string }>;
  };
};

export type PreparedGoogleDraft = {
  type: string;
  title: string;
  target: Record<string, unknown>;
  proposedChange: Record<string, unknown>;
  operation: WriteOperation;
  preview: { summary: string; changes: string[]; serverValidated: false };
};

export class GoogleDraftError extends Error {}
const clean = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const digits = (value: unknown) => clean(value).replace(/[^\d]/g, "");
const positiveMoney = (value: unknown, label: string) => { const number = Number(value); if (!Number.isFinite(number) || number <= 0 || number > 100_000) throw new GoogleDraftError(`${label} invalido.`); return number; };
const micros = (value: number) => Math.round(value * 1_000_000);

export function prepareGoogleDraft(tool: GoogleDraftTool, args: Record<string, unknown>, snapshots: GoogleOperatorSnapshot[]): PreparedGoogleDraft {
  const accountId = digits(args.adAccountId);
  const snapshot = snapshots.find((item) => digits(item.accountId) === accountId);
  if (!accountId || !snapshot) throw new GoogleDraftError("Conta Google Ads nao encontrada no ultimo relatorio autorizado.");
  const baseTarget = { platform: "google_ads", adAccountId: accountId, channelId: snapshot.channelId };
  const campaignId = clean(args.campaignId); const adGroupId = clean(args.adGroupId); const criterionId = clean(args.criterionId);
  const campaigns = snapshot.report.campaigns || []; const keywords = snapshot.report.keywords || [];
  const knownCampaign = campaigns.find((item) => item.id === campaignId);
  const knownAdGroup = [...keywords, ...(snapshot.report.searchTerms || []), ...(snapshot.report.ads || [])].some((item) => item.campaignId === campaignId && item.adGroupId === adGroupId);

  if (tool === "draft_google_negative_keyword") {
    const text = clean(args.text, 80); const matchType = clean(args.matchType, 20).toUpperCase() || "EXACT";
    const observed = (snapshot.report.searchTerms || []).some((item) => item.campaignId === campaignId && item.adGroupId === adGroupId && item.term === text);
    if (!observed || !["EXACT", "PHRASE", "BROAD"].includes(matchType)) throw new GoogleDraftError("Termo pesquisado ou correspondencia invalida.");
    const operation: WriteOperation = { tool: "google_add_keywords", provider: "google", accountId, kind: "create", payload: { ad_group_id: adGroupId, keywords: [{ text, match_type: matchType }], negative: true } };
    return { type: "google_negative_keyword", title: `Adicionar “${text}” como palavra negativa`, target: { ...baseTarget, campaignId, adGroupId, text }, proposedChange: { action: "add_negative_keyword", text, matchType }, operation, preview: { summary: `Adicionar “${text}” como palavra-chave negativa`, changes: [`+ negative keyword ${matchType}: ${text}`], serverValidated: false } };
  }
  if (tool === "draft_google_keyword_pause") {
    const keyword = keywords.find((item) => item.campaignId === campaignId && item.adGroupId === adGroupId && item.criterionId === criterionId);
    if (!keyword) throw new GoogleDraftError("Palavra-chave nao encontrada no ultimo relatorio autorizado.");
    const operation: WriteOperation = { tool: "google_set_keyword_status", provider: "google", accountId, kind: "update", payload: { ad_group_id: adGroupId, criterion_id: criterionId, status: "PAUSED" } };
    return { type: "google_keyword_pause", title: `Pausar palavra-chave “${clean(keyword.text, 80)}”`, target: { ...baseTarget, campaignId, adGroupId, criterionId }, proposedChange: { action: "pause_keyword", text: keyword.text, nextStatus: "PAUSED" }, operation, preview: { summary: `Pausar palavra-chave “${clean(keyword.text, 80)}”`, changes: [`~ keyword ${criterionId} status -> PAUSED`], serverValidated: false } };
  }
  if (tool === "draft_google_ad_group_create") {
    if (!knownCampaign) throw new GoogleDraftError("Campanha nao encontrada no ultimo relatorio autorizado.");
    const name = clean(args.name, 120); if (!name) throw new GoogleDraftError("Nome do grupo obrigatorio.");
    const bid = args.cpcBid == null ? undefined : positiveMoney(args.cpcBid, "Lance CPC");
    const payload = { campaign_id: campaignId, name, ...(bid ? { cpc_bid_micros: micros(bid) } : {}) };
    const operation: WriteOperation = { tool: "google_create_ad_group", provider: "google", accountId, kind: "create", payload };
    return { type: "google_ad_group_create", title: `Criar grupo ${name}`, target: { ...baseTarget, campaignId }, proposedChange: { action: "create_ad_group", name, cpcBid: bid || null, initialStatus: "ENABLED", inheritsCampaignState: true }, operation, preview: { summary: `Criar grupo ${name}`, changes: [`+ ad group ${name} ativo, herdando o estado da campanha ${knownCampaign.name || campaignId}`], serverValidated: false } };
  }
  if (tool === "draft_google_responsive_search_ad") {
    if (!knownAdGroup) throw new GoogleDraftError("Grupo de anuncios nao encontrado no ultimo relatorio autorizado.");
    const headlines = Array.isArray(args.headlines) ? args.headlines.map((item) => clean(item, 31)).filter(Boolean) : [];
    const descriptions = Array.isArray(args.descriptions) ? args.descriptions.map((item) => clean(item, 91)).filter(Boolean) : [];
    const finalUrls = Array.isArray(args.finalUrls) ? args.finalUrls.map((item) => clean(item, 500)).filter(Boolean) : [];
    if (headlines.length < 3 || headlines.length > 15 || headlines.some((item) => item.length > 30)) throw new GoogleDraftError("Informe de 3 a 15 titulos com ate 30 caracteres.");
    if (descriptions.length < 2 || descriptions.length > 4 || descriptions.some((item) => item.length > 90)) throw new GoogleDraftError("Informe de 2 a 4 descricoes com ate 90 caracteres.");
    if (!finalUrls.length || finalUrls.some((item) => { try { return !["http:", "https:"].includes(new URL(item).protocol); } catch { return true; } })) throw new GoogleDraftError("URL final invalida.");
    const operation: WriteOperation = { tool: "google_create_responsive_search_ad", provider: "google", accountId, kind: "create", payload: { ad_group_id: adGroupId, headlines, descriptions, final_urls: finalUrls, ...(clean(args.path1, 15) ? { path1: clean(args.path1, 15) } : {}), ...(clean(args.path2, 15) ? { path2: clean(args.path2, 15) } : {}) } };
    return { type: "google_responsive_search_ad", title: `Criar anuncio em ${adGroupId}`, target: { ...baseTarget, campaignId, adGroupId }, proposedChange: { action: "create_responsive_search_ad", headlines, descriptions, finalUrls, initialStatus: "PAUSED" }, operation, preview: { summary: "Criar anuncio responsivo pausado", changes: [`+ RSA com ${headlines.length} titulos e ${descriptions.length} descricoes`], serverValidated: false } };
  }
  if (tool === "draft_google_campaign_create") {
    const name = clean(args.name, 120); const dailyBudget = positiveMoney(args.dailyBudget, "Orcamento diario"); const channelType = clean(args.channelType, 30).toUpperCase() || "SEARCH";
    if (!name || !["SEARCH", "DISPLAY", "SHOPPING", "VIDEO", "PERFORMANCE_MAX"].includes(channelType)) throw new GoogleDraftError("Nome ou tipo de campanha invalido.");
    const operation: WriteOperation = { tool: "google_create_campaign", provider: "google", accountId, kind: "create", payload: { name, daily_budget_micros: micros(dailyBudget), channel_type: channelType, status: "PAUSED" } };
    return { type: "google_campaign_create", title: `Criar campanha ${name}`, target: baseTarget, proposedChange: { action: "create_campaign", name, dailyBudget, channelType, initialStatus: "PAUSED" }, operation, preview: { summary: `Criar campanha pausada ${name}`, changes: [`+ campaign ${name}`, `+ daily budget ${dailyBudget}`], serverValidated: false } };
  }
  if (!knownCampaign) throw new GoogleDraftError("Campanha nao encontrada no ultimo relatorio autorizado.");
  const strategy = clean(args.strategy, 40).toUpperCase();
  if (!["MANUAL_CPC", "MAXIMIZE_CLICKS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"].includes(strategy)) throw new GoogleDraftError("Estrategia de lance invalida.");
  const payload: Record<string, unknown> = { campaign_id: campaignId, strategy };
  if (args.targetCpa != null) payload.target_cpa_micros = micros(positiveMoney(args.targetCpa, "CPA alvo"));
  if (args.targetRoas != null) { const roas = Number(args.targetRoas); if (!Number.isFinite(roas) || roas <= 0 || roas > 100) throw new GoogleDraftError("ROAS alvo invalido."); payload.target_roas = roas; }
  if (args.cpcBidCeiling != null) payload.cpc_bid_ceiling_micros = micros(positiveMoney(args.cpcBidCeiling, "Limite CPC"));
  const operation: WriteOperation = { tool: "google_set_bidding_strategy", provider: "google", accountId, kind: "update", payload };
  return { type: "google_bidding_strategy", title: `Alterar lances de ${knownCampaign.name || campaignId}`, target: { ...baseTarget, campaignId }, proposedChange: { action: "set_bidding_strategy", ...payload }, operation, preview: { summary: `Alterar estrategia para ${strategy}`, changes: [`~ campaign ${campaignId} bidding -> ${strategy}`], serverValidated: false } };
}
