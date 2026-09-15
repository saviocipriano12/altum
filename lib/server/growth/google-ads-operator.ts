export type GoogleAdsCampaign = {
  id: string;
  name: string;
  status: string;
  channelType: string;
  biddingStrategy: string;
  dailyBudget: number;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
};

export type GoogleAdsKeyword = {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  criterionId: string;
  text: string;
  matchType: string;
  status: string;
  qualityScore: number | null;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
};

export type GoogleAdsSearchTerm = {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  term: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
};

export type GoogleAdsAd = {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  id: string;
  status: string;
  strength: string;
  headlines: string[];
  descriptions: string[];
  finalUrls: string[];
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
};

export type GoogleAdsOperatorInput = {
  accountId: string;
  channelId: string;
  currency: string;
  from: string;
  to: string;
  campaigns: GoogleAdsCampaign[];
  keywords: GoogleAdsKeyword[];
  searchTerms: GoogleAdsSearchTerm[];
  ads: GoogleAdsAd[];
};

export type GoogleAdsRecommendation = {
  id: string;
  type: "stop_waste" | "scale_winner" | "negative_keyword" | "keyword_quality" | "improve_ad";
  severity: "high" | "medium" | "opportunity";
  title: string;
  detail: string;
  evidence: string[];
  campaignId?: string;
  campaignName?: string;
  nextAction?: {
    tool: "draft_campaign_pause" | "draft_campaign_budget_change" | "draft_google_negative_keyword";
    arguments: Record<string, unknown>;
  };
};

export type GoogleAdsOperatorReport = GoogleAdsOperatorInput & {
  totals: {
    campaigns: number;
    activeCampaigns: number;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    conversionValue: number;
    ctr: number;
    cpc: number;
    cpa: number;
    roas: number;
  };
  recommendations: GoogleAdsRecommendation[];
  coverage: {
    campaignRows: number;
    keywordRows: number;
    searchTermRows: number;
    adRows: number;
    searchTermsExcludePerformanceMax: true;
  };
  source: { project: "AdPort"; package: "@adport/provider-google"; mode: "live_google_ads_api" };
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function rounded(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function analyzeGoogleAdsOperator(input: GoogleAdsOperatorInput): GoogleAdsOperatorReport {
  const totals = input.campaigns.reduce((result, campaign) => ({
    campaigns: result.campaigns + 1,
    activeCampaigns: result.activeCampaigns + (campaign.status === "ENABLED" ? 1 : 0),
    impressions: result.impressions + campaign.impressions,
    clicks: result.clicks + campaign.clicks,
    spend: result.spend + campaign.spend,
    conversions: result.conversions + campaign.conversions,
    conversionValue: result.conversionValue + campaign.conversionValue,
  }), { campaigns: 0, activeCampaigns: 0, impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0 });

  const recommendations: GoogleAdsRecommendation[] = [];
  for (const campaign of input.campaigns) {
    if (campaign.status === "ENABLED" && campaign.spend >= 25 && campaign.conversions === 0) {
      recommendations.push({
        id: `stop-waste-${campaign.id}`,
        type: "stop_waste",
        severity: "high",
        title: `Revisar gasto sem conversao em ${campaign.name}`,
        detail: "A campanha consumiu verba na janela e nao registrou conversoes. A IA pode preparar uma pausa para aprovacao.",
        evidence: [`Gasto: ${money(campaign.spend, input.currency)}`, `${campaign.clicks} cliques e 0 conversoes`],
        campaignId: campaign.id,
        campaignName: campaign.name,
        nextAction: {
          tool: "draft_campaign_pause",
          arguments: { platform: "google_ads", campaignId: campaign.id, adAccountId: input.accountId, reason: "Campanha ativa consumiu verba sem registrar conversoes na janela analisada.", evidence: [`Gasto de ${money(campaign.spend, input.currency)} com ${campaign.clicks} cliques e nenhuma conversao.`] },
        },
      });
    } else if (campaign.status === "ENABLED" && campaign.dailyBudget > 0 && campaign.conversions >= 2 && campaign.roas >= 2) {
      const proposed = rounded(campaign.dailyBudget * 1.1);
      recommendations.push({
        id: `scale-${campaign.id}`,
        type: "scale_winner",
        severity: "opportunity",
        title: `Avaliar aumento gradual em ${campaign.name}`,
        detail: "A campanha tem conversoes e retorno positivo. A IA pode preparar um aumento de 10% para aprovacao.",
        evidence: [`ROAS: ${campaign.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`, `${campaign.conversions.toLocaleString("pt-BR")} conversoes`],
        campaignId: campaign.id,
        campaignName: campaign.name,
        nextAction: {
          tool: "draft_campaign_budget_change",
          arguments: { platform: "google_ads", campaignId: campaign.id, adAccountId: input.accountId, currentDailyBudget: campaign.dailyBudget, proposedDailyBudget: proposed, currency: input.currency, reason: "Campanha com conversoes e retorno positivo na janela analisada.", evidence: [`ROAS ${campaign.roas}x com ${campaign.conversions} conversoes.`] },
        },
      });
    }
  }

  for (const term of input.searchTerms.filter((item) => item.spend >= 15 && item.conversions === 0).slice(0, 20)) {
    recommendations.push({
      id: `negative-${term.campaignId}-${term.adGroupId}-${term.term}`.slice(0, 180),
      type: "negative_keyword",
      severity: term.spend >= 50 ? "high" : "medium",
      title: `Revisar termo: ${term.term}`,
      detail: "O termo recebeu cliques e consumiu verba sem conversao. Revise a intencao antes de adiciona-lo como palavra negativa.",
      evidence: [`Gasto: ${money(term.spend, input.currency)}`, `${term.clicks} cliques e 0 conversoes`],
      campaignId: term.campaignId,
      campaignName: term.campaignName,
      nextAction: {
        tool: "draft_google_negative_keyword",
        arguments: { platform: "google_ads", campaignId: term.campaignId, adGroupId: term.adGroupId, adAccountId: input.accountId, text: term.term, matchType: "EXACT", reason: "Termo pesquisado consumiu verba sem registrar conversoes na janela analisada.", evidence: [`Gasto de ${money(term.spend, input.currency)} com ${term.clicks} cliques e nenhuma conversao.`] },
      },
    });
  }

  for (const keyword of input.keywords.filter((item) => item.qualityScore != null && item.qualityScore <= 4 && item.spend > 0).slice(0, 20)) {
    recommendations.push({
      id: `quality-${keyword.criterionId}`,
      type: "keyword_quality",
      severity: "medium",
      title: `Melhorar qualidade de “${keyword.text}”`,
      detail: "A palavra-chave tem indice de qualidade baixo. Alinhe termo, anuncio e pagina de destino antes de aumentar investimento.",
      evidence: [`Indice de qualidade: ${keyword.qualityScore}/10`, `Gasto: ${money(keyword.spend, input.currency)}`],
      campaignId: keyword.campaignId,
      campaignName: keyword.campaignName,
    });
  }

  for (const ad of input.ads.filter((item) => ["POOR", "AVERAGE"].includes(item.strength) && item.impressions > 0).slice(0, 20)) {
    recommendations.push({
      id: `creative-${ad.id}`,
      type: "improve_ad",
      severity: ad.strength === "POOR" ? "high" : "medium",
      title: `Fortalecer anuncio em ${ad.adGroupName}`,
      detail: "O Google classificou a forca do anuncio abaixo de boa. Revise variedade de titulos, descricoes e aderencia as palavras-chave.",
      evidence: [`Forca do anuncio: ${ad.strength}`, `${ad.impressions.toLocaleString("pt-BR")} impressoes`],
      campaignId: ad.campaignId,
      campaignName: ad.campaignName,
    });
  }

  const ranked = { high: 0, medium: 1, opportunity: 2 } as const;
  recommendations.sort((a, b) => ranked[a.severity] - ranked[b.severity]);
  return {
    ...input,
    totals: {
      ...totals,
      spend: rounded(totals.spend),
      conversionValue: rounded(totals.conversionValue),
      ctr: rounded(ratio(totals.clicks * 100, totals.impressions), 4),
      cpc: rounded(ratio(totals.spend, totals.clicks), 4),
      cpa: rounded(ratio(totals.spend, totals.conversions), 4),
      roas: rounded(ratio(totals.conversionValue, totals.spend), 4),
    },
    recommendations: recommendations.slice(0, 50),
    coverage: { campaignRows: input.campaigns.length, keywordRows: input.keywords.length, searchTermRows: input.searchTerms.length, adRows: input.ads.length, searchTermsExcludePerformanceMax: true },
    source: { project: "AdPort", package: "@adport/provider-google", mode: "live_google_ads_api" },
  };
}
