import "server-only";
import { FieldPath, Timestamp, type Query, type QuerySnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantAccess, getTenantCapabilities, getTenantSettings, TenantAccessError } from "@/lib/server/tenant";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { canAccessAssignedCommercialRecord, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import type { CommandPorts, Kind, Page, Row } from "./service";
import { CommandError } from "./security";

const collections = { leads: "leads", chats: "chats", channels: "tenant_channels", campaign_snapshots: "campaign_snapshots", ad_creative_snapshots: "ad_creative_snapshots", google_ads_operator_reports: "google_ads_operator_reports", meta_ads_operator_reports: "meta_ads_operator_reports", growth_segments: "growth_segments", growth_events: "growth_events", appointments: "appointments", proposals: "orcamentos", finance: "financeiro" } as const;
const fields: Record<Kind, string[]> = {
  leads: ["tenantId", "nome", "empresa", "pipelineStage", "stage", "ownerId", "assignedTo", "ownerUserId", "assignedUserId", "responsavelId", "heat", "aiCommercialTemperature", "score", "tags", "aiNextAction", "stageUpdatedAt", "createdAt", "updatedAt", "potentialValue", "valorPotencial", "origem", "channel", "sourceLabel", "campaignName", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "gclid", "fbclid", "first_touch", "last_touch", "assisted_touches", "attribution"],
  chats: ["tenantId", "contactName", "name", "leadId", "channel", "channelType", "status", "createdAt", "lastClientMessageAt", "lastAgentMessageAt", "lastMessageTime", "lastMessage", "assignedTo", "ownerId", "ownerUserId", "assignedUserId", "responsavelId"],
  channels: ["tenantId", "type", "status", "connectionStatus", "lastHealthCheckAt"],
  campaign_snapshots: ["tenantId", "clientId", "channelId", "adAccountId", "platform", "accountLabel", "dateRef", "campaignId", "campaignName", "impressions", "clicks", "spend", "leads", "cpl", "roas"],
  ad_creative_snapshots: ["tenantId", "clientId", "channelId", "adAccountId", "platform", "dateRef", "campaignId", "campaignName", "adId", "adName", "impressions", "clicks", "spend", "ctr", "cpc", "frequency"],
  google_ads_operator_reports: ["tenantId", "channelId", "accountId", "report", "generatedAt", "updatedAt", "source"],
  meta_ads_operator_reports: ["tenantId", "channelId", "accountId", "report", "generatedAt", "updatedAt", "source"],
  growth_segments: ["tenantId", "name", "status", "definition", "source", "createdAt", "updatedAt"],
  growth_events: ["tenantId", "name", "occurredAt", "anonymousId", "sessionId", "externalId", "path", "value", "currency", "properties", "attribution"],
  appointments: ["tenantId", "leadId", "status", "startAt", "scheduledAt", "createdAt"],
  proposals: ["tenantId", "leadId", "status", "titulo", "valorTotal", "createdAt", "updatedAt", "ownerId", "assignedTo"],
  finance: ["tenantId", "leadId", "tipo", "status", "valor", "dataPagamento", "createdAt", "updatedAt", "ownerId", "assignedTo"],
};
function rows(snap: QuerySnapshot): Row[] { return snap.docs.map(doc => ({ ...doc.data(), id: doc.id })); }
function page(snap: QuerySnapshot, limit: number, cursor: (row: Row) => string): Page {
  const result = rows(snap);
  const visible = result.slice(0, limit);
  return { rows: visible, next: result.length > limit ? cursor(visible[visible.length - 1]) : null };
}
function position(row: Row) {
  const timestamp = row.createdAt as Timestamp;
  return JSON.stringify([timestamp.seconds, timestamp.nanoseconds, row.id]);
}
function seek(query: Query, after?: string) {
  if (!after) return query;
  const [seconds, nanos, id] = JSON.parse(after) as [number, number, string];
  return query.startAfter(new Timestamp(seconds, nanos), id);
}

/** Repository boundary: all scans constrain tenant before fetching. No provider synchronization. */
export const commandPorts: CommandPorts = {
  async access(userId, tenantId) {
    try {
      const membership = await assertTenantAccess(userId, tenantId);
      if (membership.tenantId !== tenantId || membership.userId !== userId) throw new CommandError("FORBIDDEN");
      const entitlements = await getTenantEntitlements(tenantId);
      return { userId, tenantId, active: membership.status === "active", capabilities: getTenantCapabilities(membership),
        modules: entitlements.modules, entitlementSource: entitlements.mode, teamWideCommercial: hasTeamWideCommercialAccess(membership),
        canRead: row => canAccessAssignedCommercialRecord(membership, userId, row) };
    } catch (error) {
      if (error instanceof TenantAccessError) throw new CommandError("FORBIDDEN");
      throw error;
    }
  },
  async profile(tenantId) {
    const settings = await getTenantSettings(tenantId);
    if (!settings || settings.tenantId !== tenantId) throw new CommandError("UNAVAILABLE", 503);
    return settings;
  },
  async list(tenantId, kind, limit, after) {
    let query = adminDb.collection(collections[kind]).where("tenantId", "==", tenantId)
      .orderBy(FieldPath.documentId()).select(...fields[kind]);
    if (after) query = query.startAfter(after);
    const hardLimit = kind === "ad_creative_snapshots" || kind === "growth_events" || kind === "campaign_snapshots" ? 1500 : 500;
    const safeLimit = Math.min(hardLimit, limit);
    return page(await query.limit(safeLimit + 1).get(), safeLimit, row => row.id);
  },
  async conversation(tenantId, id) {
    const snap = await adminDb.collection("chats").where("tenantId", "==", tenantId)
      .where(FieldPath.documentId(), "==", id).select(...fields.chats).limit(1).get();
    return rows(snap)[0] || null;
  },
  async messages(tenantId, chatId, limit, after) {
    const query = adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", chatId)
      .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc")
      .select("tenantId", "chatId", "text", "sender", "createdAt");
    return page(await seek(query, after).limit(limit + 1).get(), limit, position);
  },
  async events(tenantId, from, to, limit, after) {
    const query = adminDb.collection("audit_logs").where("tenantId", "==", tenantId)
      .where("createdAt", ">=", Timestamp.fromDate(new Date(from))).where("createdAt", "<", Timestamp.fromDate(new Date(to)))
      .orderBy("createdAt", "asc").orderBy(FieldPath.documentId(), "asc").select("tenantId", "createdAt", "action", "type");
    return page(await seek(query, after).limit(limit + 1).get(), limit, position);
  },
  async createDraft(entry) {
    const ref = await adminDb.collection("mcp_action_drafts").add({ ...entry, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    return { id: ref.id, href: `/cliente/painel/configuracoes/mcp?draft=${encodeURIComponent(ref.id)}` };
  },
  async audit(entry) {
    await adminDb.collection("mcp_access_audit").add({ ...entry, recordedAt: Timestamp.now() });
  },
};
