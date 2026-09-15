export type GrowthRow = { id: string; tenantId?: unknown } & Record<string, unknown>;

export type GrowthBriefingInput = {
  leads: GrowthRow[];
  chats: GrowthRow[];
  snapshots: GrowthRow[];
  appointments: GrowthRow[];
  from: string;
  to: string;
  now?: number;
};

export type GrowthCampaignGroup = {
  key: string;
  label: string;
  source: string;
  platform: string;
  campaignId: string;
  adAccountId: string;
  spend: number;
  impressions: number;
  clicks: number;
  paidLeads: number;
  lastTouchLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  meetings: number;
  waitingConversations: number;
  potentialValue: number;
  avgScore: number;
  qualityRate: number;
  winRate: number;
  cpl: number;
  costPerQualifiedLead: number;
  costPerMeeting: number;
  costPerSale: number;
  evidence: string[];
};

export type GrowthBriefing = {
  from: string;
  to: string;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    paidLeads: number;
    attributedLeads: number;
    qualifiedLeads: number;
    wonLeads: number;
    meetings: number;
    waitingConversations: number;
    potentialValue: number;
  };
  campaigns: GrowthCampaignGroup[];
  winners: GrowthCampaignGroup[];
  attention: GrowthCampaignGroup[];
  recommendations: Array<{
    type: string;
    title: string;
    reason: string;
    evidence: string[];
    nextAction?: {
      tool: "draft_campaign_pause" | "draft_campaign_budget_change";
      arguments: { platform: string; campaignId: string; adAccountId?: string };
      requiredInputs?: string[];
    };
  }>;
  coverage: string;
};
