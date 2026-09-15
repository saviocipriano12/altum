// Isolated synthetic fixture. Never imported by the production API/repository.
import { CommandCenter, type CommandPorts, type Row, type Kind } from "../../lib/server/command-center/service.ts";
import { CommandError } from "../../lib/server/command-center/security.ts";
import { scopes, type Grant } from "../../lib/mcp/contracts.ts";

export function createDemo(now = Date.now()) {
  const tenantId = "demo-loja", userId = "demo-gestor";
  const date = (hours: number) => new Date(now - hours * 3600_000).toISOString();
  const grants: Grant[] = [{ userId, tenantId, scopes: [...scopes], expiresAt: new Date(now + 86400_000).toISOString() }];
  const data: Record<Kind, Row[]> = {
    leads: [
      { id: "lead-ana", tenantId, nome: "Ana (ficticia)", pipelineStage: "qualificacao", heat: "hot", score: 85, tags: ["prioridade", "varejo"], ownerId: userId, stageUpdatedAt: date(240), createdAt: date(1), updatedAt: date(1), aiNextAction: "Confirmar prazo desejado", potentialValue: 3200, first_touch: { source: "meta", medium: "paid_social", campaign: "Venda Setembro", sourceLabel: "Meta Ads" }, last_touch: { source: "meta", medium: "paid_social", campaign: "Venda Setembro", sourceLabel: "Meta Ads" } },
      { id: "lead-bruno", tenantId, nome: "Bruno (ficticio)", pipelineStage: "ganho", ownerId: userId, stageUpdatedAt: date(3), createdAt: date(3), potentialValue: 7800, first_touch: { source: "google", medium: "cpc", campaign: "Pesquisa Alta Intencao", sourceLabel: "Google Ads" }, last_touch: { source: "google", medium: "cpc", campaign: "Pesquisa Alta Intencao", sourceLabel: "Google Ads" } },
    ],
    chats: [
      { id: "chat-ana", tenantId, contactName: "Ana (fictÃ­cia)", leadId: "lead-ana", channel: "whatsapp", status: "open", assignedTo: userId, createdAt: date(1.5), lastClientMessageAt: date(1), lastAgentMessageAt: date(2), lastMessageTime: date(1), lastMessage: "Consigo receber atÃ© sexta?" },
    ],
    channels: [{ id: "canal-demo", tenantId, type: "whatsapp", status: "active", connectionStatus: "connected", lastHealthCheckAt: date(0.1) }],
    campaign_snapshots: [
      { id: "snap-meta", tenantId, platform: "meta_ads", channelId: "channel-meta-demo", adAccountId: "act-meta-demo", campaignId: "cmp-venda-setembro", campaignName: "Venda Setembro", dateRef: "2026-09-09", spend: 420, impressions: 12000, clicks: 380, leads: 34 },
      { id: "snap-google", tenantId, platform: "google_ads", channelId: "channel-google-demo", adAccountId: "google-demo", campaignId: "cmp-pesquisa-alta", campaignName: "Pesquisa Alta Intencao", dateRef: "2026-09-09", spend: 260, impressions: 2800, clicks: 140, leads: 8 },
      { id: "snap-waste", tenantId, platform: "meta_ads", channelId: "channel-meta-demo", adAccountId: "act-meta-demo", campaignId: "cmp-topo-frio", campaignName: "Topo Frio", dateRef: "2026-09-09", spend: 390, impressions: 18000, clicks: 520, leads: 2 },
    ],
    ad_creative_snapshots: [
      { id: "creative-1-d1", tenantId, platform: "meta_ads", adAccountId: "act-meta-demo", campaignId: "cmp-venda-setembro", campaignName: "Venda Setembro", adId: "ad-video-1", adName: "Video principal", dateRef: "2026-09-07", spend: 30, impressions: 3000, clicks: 90, ctr: 3, cpc: 0.3333, frequency: 1.8 },
      { id: "creative-1-d2", tenantId, platform: "meta_ads", adAccountId: "act-meta-demo", campaignId: "cmp-venda-setembro", campaignName: "Venda Setembro", adId: "ad-video-1", adName: "Video principal", dateRef: "2026-09-08", spend: 35, impressions: 3200, clicks: 70, ctr: 2.1875, cpc: 0.5, frequency: 2.7 },
      { id: "creative-1-d3", tenantId, platform: "meta_ads", adAccountId: "act-meta-demo", campaignId: "cmp-venda-setembro", campaignName: "Venda Setembro", adId: "ad-video-1", adName: "Video principal", dateRef: "2026-09-09", spend: 40, impressions: 3500, clicks: 55, ctr: 1.5714, cpc: 0.7273, frequency: 3.6 },
    ],
    google_ads_operator_reports: [
      { id: "google-operator-demo", tenantId, channelId: "channel-google-demo", accountId: "1234567890", generatedAt: date(0.5), report: { from: "2026-09-03", to: "2026-09-09", currency: "BRL", totals: { campaigns: 1, activeCampaigns: 1, impressions: 2800, clicks: 140, spend: 260, conversions: 8, conversionValue: 7800, ctr: 5, cpc: 1.86, cpa: 32.5, roas: 30 }, campaigns: [{ id: "cmp-pesquisa-alta", name: "Pesquisa Alta Intencao", status: "ENABLED", spend: 260, conversions: 8, roas: 30 }], keywords: [{ campaignId: "cmp-pesquisa-alta", adGroupId: "group-1", criterionId: "keyword-1", text: "crm vendas" }], searchTerms: [{ campaignId: "cmp-pesquisa-alta", adGroupId: "group-1", term: "curso gratis", spend: 30, clicks: 12, conversions: 0 }], ads: [], recommendations: [] } },
    ],
    meta_ads_operator_reports: [{ id: "meta-operator-demo", tenantId, channelId: "channel-meta-demo", accountId: "act_987654321", generatedAt: date(0.5), report: { totals: { campaigns: 2, spend: 810, leads: 36, roas: 2.4 }, campaigns: [{ id: "101", name: "Venda Setembro", status: "ACTIVE" }], adSets: [{ id: "201", name: "Brasil aberto", campaignId: "101", campaignName: "Venda Setembro", status: "ACTIVE" }], ads: [], recommendations: [] } }],
    growth_segments: [
      { id: "segment-meta-prioridade", tenantId, name: "Meta prioritarios", status: "active", definition: { match: "all", conditions: [{ field: "source", operator: "Includes", value: "meta" }] }, createdAt: date(4), updatedAt: date(4) },
    ],
    growth_events: [
      { id: "growth-view", tenantId, name: "page_view", occurredAt: date(2), anonymousId: "visitor-1", sessionId: "session-1", path: "/oferta", value: 0, attribution: { source: "google", campaign: "Pesquisa Alta Intencao" } },
      { id: "growth-sale", tenantId, name: "purchase_completed", occurredAt: date(1), anonymousId: "visitor-1", sessionId: "session-1", path: "/obrigado", value: 7800, currency: "BRL", attribution: { source: "google", campaign: "Pesquisa Alta Intencao" } },
    ],
    appointments: [{ id: "appt-bruno", tenantId, leadId: "lead-bruno", status: "scheduled", startAt: date(0.5) }],
    proposals: [{ id: "proposal-bruno", tenantId, leadId: "lead-bruno", status: "Aprovado", titulo: "Projeto completo", valorTotal: 7800, createdAt: date(2), ownerId: userId }],
    finance: [{ id: "finance-bruno", tenantId, leadId: "lead-bruno", tipo: "Receita", status: "pago", valor: 7800, createdAt: date(1), ownerId: userId }],
  };
  const messages: Row[] = [
    { id: "msg-2", tenantId, chatId: "chat-ana", sender: "client", text: "Consigo receber atÃ© sexta?", createdAt: date(1) },
    { id: "msg-1", tenantId, chatId: "chat-ana", sender: "agent", text: "Qual endereÃ§o de entrega?", createdAt: date(2) },
  ];
  const events: Row[] = [{ id: "evento-1", tenantId, action: "lead_created", createdAt: date(1) }, { id: "evento-2", tenantId, action: "owner_assigned", createdAt: date(1) }];
  const audit: Record<string, unknown>[] = [];
  const drafts: Record<string, unknown>[] = [];
  const slice = (rows: Row[], limit: number, after?: string) => {
    const start = after ? rows.findIndex(r => r.id === after) + 1 : 0;
    const selected = rows.slice(start, start + limit);
    return { rows: selected, next: start + limit < rows.length ? selected.at(-1)!.id : null };
  };
  const ports: CommandPorts = {
    async access(uid, tenant) {
      if (uid !== userId || tenant !== tenantId) throw new CommandError("FORBIDDEN");
      return { userId: uid, tenantId: tenant, active: true, capabilities: ["edit_leads", "respond_inbox", "view_metrics", "manage_settings", "manage_channels"],
        modules: { crm: true, inbox: true, reports: true, whatsapp: true, marketing: true }, entitlementSource: "demo_synthetic", teamWideCommercial: true, canRead: () => true };
    },
    async profile(tenant) { if (tenant !== tenantId) throw new CommandError("FORBIDDEN"); return { name: "Loja demonstracao - DADOS FICTICIOS", timezone: "America/Sao_Paulo", niche: "varejo", updatedAt: date(1), mcp: { enabled: true, writeMode: "draft_only" } }; },
    async list(tenant, kind, limit, after) { return slice(data[kind].filter(r => r.tenantId === tenant).sort((a,b) => a.id.localeCompare(b.id)), limit, after); },
    async conversation(tenant, id) { return data.chats.find(r => r.tenantId === tenant && r.id === id) || null; },
    async messages(tenant, id, limit, after) { return slice(messages.filter(r => r.tenantId === tenant && r.chatId === id), limit, after); },
    async events(tenant, from, to, limit, after) { return slice(events.filter(r => r.tenantId === tenant && String(r.createdAt) >= from && String(r.createdAt) < to), limit, after); },
    async createDraft(entry) { const id = `draft-${drafts.length + 1}`; drafts.push({ id, ...entry }); return { id, href: `/cliente/painel/configuracoes/mcp?draft=${id}` }; },
    async audit(entry) { audit.push(entry); },
  };
  const secret = "synthetic-only-secret-never-used-by-production";
  return { service: new CommandCenter(ports, grants, secret, () => now), ports, grants, secret, userId, tenantId, data, messages, events, audit, drafts, now };
}
