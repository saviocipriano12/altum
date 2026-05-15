import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export type MetaConversationChannelType = "instagram" | "messenger";
export type MetaWebhookChannelType = MetaConversationChannelType | "meta_ads";

type ChannelDoc = {
  tenantId?: string;
  type?: string;
  provider?: string;
  accessToken?: string;
  appSecret?: string;
  status?: string;
  displayName?: string;
  externalAccountId?: string;
  pageId?: string;
  username?: string;
  metadata?: Record<string, unknown>;
};

export type MetaChannelConfig = {
  id: string;
  tenantId: string;
  type: MetaConversationChannelType;
  provider: string;
  displayName?: string;
  accessToken: string;
  appSecret?: string;
  verifyToken?: string;
  externalAccountId?: string;
  pageId?: string;
  username?: string;
};

export type MetaWebhookChannelConfig = Omit<MetaChannelConfig, "type"> & {
  type: MetaWebhookChannelType;
  metadata?: Record<string, string>;
};

function normalizeString(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeType(value: unknown): MetaConversationChannelType | null {
  const normalized = normalizeString(value, 60).toLowerCase();
  if (normalized === "instagram" || normalized === "messenger") {
    return normalized;
  }
  return null;
}

function normalizeWebhookType(value: unknown): MetaWebhookChannelType | null {
  const normalized = normalizeString(value, 60).toLowerCase();
  if (normalized === "instagram" || normalized === "messenger" || normalized === "meta_ads") {
    return normalized;
  }
  return null;
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    const normalizedKey = normalizeString(key, 80);
    const normalizedValue = normalizeString(entry, 400);
    if (!normalizedKey || !normalizedValue) return acc;
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
}

function normalizeMetaChannelDoc(id: string, data: ChannelDoc): MetaChannelConfig | null {
  const tenantId = normalizeString(data.tenantId, 180);
  const type = normalizeType(data.type);
  const status = normalizeString(data.status || "active", 40).toLowerCase();
  const accessToken = normalizeString(decryptSecret(data.accessToken));
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};

  if (!tenantId || !type || status !== "active" || !accessToken) return null;

  return {
    id,
    tenantId,
    type,
    provider: normalizeString(data.provider, 120) || type,
    displayName: normalizeString(data.displayName, 160) || type,
    accessToken,
    appSecret:
      normalizeString(decryptSecret(data.appSecret), 400) ||
      normalizeString(metadata.appSecret, 400) ||
      undefined,
    verifyToken:
      normalizeString((data as { verifyToken?: unknown }).verifyToken, 240) ||
      normalizeString(metadata.verifyToken, 240) ||
      normalizeString(metadata.webhookVerifyToken, 240) ||
      undefined,
    externalAccountId:
      normalizeString(data.externalAccountId, 180) ||
      normalizeString(metadata.instagramBusinessId, 180) ||
      undefined,
    pageId: normalizeString(data.pageId, 180) || normalizeString(metadata.pageId, 180) || undefined,
    username: normalizeString(data.username, 180) || undefined,
  };
}

function normalizeMetaWebhookChannelDoc(id: string, data: ChannelDoc): MetaWebhookChannelConfig | null {
  const tenantId = normalizeString(data.tenantId, 180);
  const type = normalizeWebhookType(data.type);
  const status = normalizeString(data.status || "active", 40).toLowerCase();
  const accessToken = normalizeString(decryptSecret(data.accessToken));
  const metadata = normalizeMetadata(data.metadata);

  if (!tenantId || !type || status !== "active" || !accessToken) return null;

  return {
    id,
    tenantId,
    type,
    provider: normalizeString(data.provider, 120) || type,
    displayName: normalizeString(data.displayName, 160) || type,
    accessToken,
    appSecret:
      normalizeString(decryptSecret(data.appSecret), 400) ||
      normalizeString(metadata.appSecret, 400) ||
      undefined,
    verifyToken:
      normalizeString((data as { verifyToken?: unknown }).verifyToken, 240) ||
      normalizeString(metadata.verifyToken, 240) ||
      normalizeString(metadata.webhookVerifyToken, 240) ||
      undefined,
    externalAccountId:
      normalizeString(data.externalAccountId, 180) ||
      normalizeString(metadata.instagramBusinessId, 180) ||
      undefined,
    pageId: normalizeString(data.pageId, 180) || normalizeString(metadata.pageId, 180) || undefined,
    username: normalizeString(data.username, 180) || undefined,
    metadata,
  };
}

function dedupeChannels(items: MetaChannelConfig[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function queryChannelsByField(field: "externalAccountId" | "pageId", value: string) {
  const normalized = normalizeString(value, 180);
  if (!normalized) return [] as MetaChannelConfig[];

  const snap = await adminDb
    .collection("tenant_channels")
    .where(field, "==", normalized)
    .limit(10)
    .get();

  return snap.docs
    .map((doc) => normalizeMetaChannelDoc(doc.id, doc.data() as ChannelDoc))
    .filter((item): item is MetaChannelConfig => Boolean(item));
}

async function queryChannelsByMetadataField(field: "instagramBusinessId" | "pageId", value: string) {
  const normalized = normalizeString(value, 180);
  if (!normalized) return [] as MetaChannelConfig[];

  const snap = await adminDb
    .collection("tenant_channels")
    .where(`metadata.${field}`, "==", normalized)
    .limit(10)
    .get();

  return snap.docs
    .map((doc) => normalizeMetaChannelDoc(doc.id, doc.data() as ChannelDoc))
    .filter((item): item is MetaChannelConfig => Boolean(item));
}

async function queryWebhookChannelsByField(field: "externalAccountId" | "pageId", value: string) {
  const normalized = normalizeString(value, 180);
  if (!normalized) return [] as MetaWebhookChannelConfig[];

  const snap = await adminDb
    .collection("tenant_channels")
    .where(field, "==", normalized)
    .limit(10)
    .get();

  return snap.docs
    .map((doc) => normalizeMetaWebhookChannelDoc(doc.id, doc.data() as ChannelDoc))
    .filter((item): item is MetaWebhookChannelConfig => Boolean(item));
}

async function queryWebhookChannelsByMetadataField(field: "instagramBusinessId" | "pageId", value: string) {
  const normalized = normalizeString(value, 180);
  if (!normalized) return [] as MetaWebhookChannelConfig[];

  const snap = await adminDb
    .collection("tenant_channels")
    .where(`metadata.${field}`, "==", normalized)
    .limit(10)
    .get();

  return snap.docs
    .map((doc) => normalizeMetaWebhookChannelDoc(doc.id, doc.data() as ChannelDoc))
    .filter((item): item is MetaWebhookChannelConfig => Boolean(item));
}

export function isMetaConversationChannelType(value: string): value is MetaConversationChannelType {
  return value === "instagram" || value === "messenger";
}

export async function getMetaChannelByVerifyToken(verifyToken: string) {
  const normalized = normalizeString(verifyToken, 240);
  if (!normalized) return null;

  const snap = await adminDb
    .collection("tenant_channels")
    .where("verifyToken", "==", normalized)
    .limit(10)
    .get();

  const fromRoot = snap.docs
    .map((doc) => normalizeMetaWebhookChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item): item is MetaWebhookChannelConfig => Boolean(item));
  if (fromRoot) return fromRoot;

  const legacySnap = await adminDb
    .collection("tenant_channels")
    .where("metadata.verifyToken", "==", normalized)
    .limit(10)
    .get();

  return (
    legacySnap.docs
      .map((doc) => normalizeMetaWebhookChannelDoc(doc.id, doc.data() as ChannelDoc))
      .find((item): item is MetaWebhookChannelConfig => Boolean(item)) || null
  );
}

export async function getMetaAdsChannelForLeadgen(input: {
  entryId?: string | null;
  formId?: string | null;
}) {
  const entryId = normalizeString(input.entryId, 180);
  const formId = normalizeString(input.formId, 180);

  const candidates = [
    ...(await queryWebhookChannelsByField("pageId", entryId)),
    ...(await queryWebhookChannelsByField("externalAccountId", entryId)),
    ...(await queryWebhookChannelsByMetadataField("pageId", entryId)),
    ...(await queryWebhookChannelsByMetadataField("instagramBusinessId", entryId)),
  ].filter((item) => item.type === "meta_ads");

  const byPage = candidates.find((item) => item.pageId === entryId);
  if (byPage) return byPage;

  if (formId) {
    const formSnap = await adminDb
      .collection("tenant_channels")
      .where("type", "==", "meta_ads")
      .where("metadata.formId", "==", formId)
      .limit(5)
      .get();

    const byForm = formSnap.docs
      .map((doc) => normalizeMetaWebhookChannelDoc(doc.id, doc.data() as ChannelDoc))
      .find((item): item is MetaWebhookChannelConfig => Boolean(item));

    if (byForm) return byForm;
  }

  return candidates[0] || null;
}

export async function getMetaChannelForTenant(
  tenantId: string,
  type: MetaConversationChannelType,
  options?: {
    channelId?: string | null;
    externalAccountId?: string | null;
    pageId?: string | null;
  }
) {
  const normalizedTenantId = normalizeString(tenantId, 180);
  if (!normalizedTenantId) return null;

  const requestedChannelId = normalizeString(options?.channelId, 180);
  if (requestedChannelId) {
    const snap = await adminDb.collection("tenant_channels").doc(requestedChannelId).get();
    if (snap.exists) {
      const parsed = normalizeMetaChannelDoc(requestedChannelId, snap.data() as ChannelDoc);
      if (parsed && parsed.tenantId === normalizedTenantId && parsed.type === type) {
        return parsed;
      }
    }
  }

  const accountCandidates = dedupeChannels([
    ...(await queryChannelsByField("externalAccountId", options?.externalAccountId || "")),
    ...(await queryChannelsByField("pageId", options?.pageId || "")),
    ...(await queryChannelsByMetadataField("instagramBusinessId", options?.externalAccountId || "")),
    ...(await queryChannelsByMetadataField("pageId", options?.pageId || "")),
  ]);

  const preferredAccountMatch = accountCandidates.find(
    (item) => item.tenantId === normalizedTenantId && item.type === type
  );
  if (preferredAccountMatch) return preferredAccountMatch;

  const snap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", normalizedTenantId)
    .where("type", "==", type)
    .limit(10)
    .get();

  return (
    snap.docs
      .map((doc) => normalizeMetaChannelDoc(doc.id, doc.data() as ChannelDoc))
      .find((item): item is MetaChannelConfig => Boolean(item)) || null
  );
}

export async function findMetaChannelForWebhook(input: {
  objectType?: string | null;
  entryId?: string | null;
  recipientId?: string | null;
}) {
  const objectType = normalizeString(input.objectType, 40).toLowerCase();
  const candidates = dedupeChannels([
    ...(await queryChannelsByField("externalAccountId", input.recipientId || "")),
    ...(await queryChannelsByField("pageId", input.recipientId || "")),
    ...(await queryChannelsByField("externalAccountId", input.entryId || "")),
    ...(await queryChannelsByField("pageId", input.entryId || "")),
    ...(await queryChannelsByMetadataField("instagramBusinessId", input.recipientId || "")),
    ...(await queryChannelsByMetadataField("pageId", input.recipientId || "")),
    ...(await queryChannelsByMetadataField("instagramBusinessId", input.entryId || "")),
    ...(await queryChannelsByMetadataField("pageId", input.entryId || "")),
  ]);

  if (candidates.length === 0) return null;

  if (objectType === "instagram") {
    return candidates.find((item) => item.type === "instagram") || null;
  }

  if (objectType === "page") {
    return (
      candidates.find(
        (item) =>
          item.type === "messenger" &&
          [item.externalAccountId, item.pageId].includes(normalizeString(input.recipientId, 180))
      ) ||
      candidates.find((item) => item.type === "instagram") ||
      candidates.find((item) => item.type === "messenger") ||
      null
    );
  }

  return candidates[0] || null;
}

export async function sendMetaConversationText(input: {
  channel: MetaChannelConfig;
  recipientId: string;
  text: string;
}) {
  const response = await fetch(`https://graph.facebook.com/${VERSION}/me/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.channel.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: input.recipientId },
      messaging_type: "RESPONSE",
      message: { text: input.text },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const errMessage = payload?.error?.message || "Erro na API da Meta.";
    throw new Error(errMessage);
  }

  return payload;
}

export async function fetchMetaConversationProfile(input: {
  channel: MetaChannelConfig;
  userId: string;
}) {
  const userId = normalizeString(input.userId, 180);
  if (!userId) return null;

  const fieldSets =
    input.channel.type === "instagram"
      ? ["name,username,profile_pic", "name,profile_pic", "username,profile_pic"]
      : ["first_name,last_name,profile_pic", "name,profile_pic"];

  for (const fields of fieldSets) {
    const url = new URL(`https://graph.facebook.com/${VERSION}/${encodeURIComponent(userId)}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", input.channel.accessToken);

    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) continue;

    const firstName = normalizeString(payload.first_name, 120);
    const lastName = normalizeString(payload.last_name, 120);
    const name =
      normalizeString(payload.name, 180) ||
      [firstName, lastName].filter(Boolean).join(" ").trim();
    const username = normalizeString(payload.username, 180);
    const photoUrl = normalizeString(payload.profile_pic, 1200);

    if (name || username || photoUrl) {
      return {
        name,
        username,
        photoUrl,
      };
    }
  }

  return null;
}
