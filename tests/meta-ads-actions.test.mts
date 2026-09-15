import test from "node:test";
import assert from "node:assert/strict";
import { MetaDraftError, prepareMetaDraft, type MetaOperatorSnapshot } from "../lib/server/growth/meta-ads-actions.ts";

const snapshots: MetaOperatorSnapshot[] = [{ accountId: "act_123", channelId: "meta-1", report: { campaigns: [{ id: "10", name: "Leads" }], adSets: [{ id: "20", name: "Brasil", campaignId: "10" }], ads: [] } }];
const base = { adAccountId: "act_123" };

test("prepara campanha, conjunto, criativo e anúncio Meta sempre pausados", () => {
  const campaign = prepareMetaDraft("draft_meta_campaign_create", { ...base, name: "Captação", objective: "OUTCOME_LEADS", dailyBudget: 50 }, snapshots);
  assert.equal(campaign.operation.tool, "meta_create_campaign");
  assert.equal(campaign.operation.payload.status, "PAUSED");
  assert.equal(campaign.operation.payload.daily_budget_cents, 5000);

  const adSet = prepareMetaDraft("draft_meta_ad_set_create", { ...base, campaignId: "10", name: "Sudeste", countries: ["BR"], dailyBudget: 30, optimizationGoal: "LEAD_GENERATION" }, snapshots);
  assert.equal(adSet.operation.tool, "meta_create_ad_set");
  assert.equal(adSet.operation.payload.status, "PAUSED");

  const creative = prepareMetaDraft("draft_meta_creative_create", { ...base, name: "Imagem 1", pageId: "30", link: "https://altum.com.br/oferta", imageUrl: "https://altum.com.br/imagem.jpg", message: "Fale com nossa equipe", headline: "Solicite uma proposta", callToAction: "CONTACT_US" }, snapshots);
  assert.equal(creative.operation.tool, "meta_api_create");
  assert.equal(creative.operation.payload.edge, "adcreatives");

  const ad = prepareMetaDraft("draft_meta_ad_create", { ...base, campaignId: "10", adSetId: "20", creativeId: "40", name: "Anúncio 1" }, snapshots);
  assert.equal(ad.operation.tool, "meta_api_create");
  assert.equal((ad.operation.payload.fields as { status: string }).status, "PAUSED");
});

test("rejeita entidades fora do relatório autorizado e URLs inseguras", () => {
  assert.throws(() => prepareMetaDraft("draft_meta_ad_set_create", { ...base, campaignId: "999", name: "Inválido", countries: ["BR"] }, snapshots), MetaDraftError);
  assert.throws(() => prepareMetaDraft("draft_meta_creative_create", { ...base, name: "Inválido", pageId: "30", link: "javascript:alert(1)", imageUrl: "https://altum.com.br/i.jpg", message: "Texto", headline: "Título" }, snapshots), MetaDraftError);
  assert.throws(() => prepareMetaDraft("draft_meta_ad_create", { ...base, adSetId: "999", creativeId: "40", name: "Inválido" }, snapshots), MetaDraftError);
});
