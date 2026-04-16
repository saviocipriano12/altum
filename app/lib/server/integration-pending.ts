import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret, encryptSecret } from "@/app/lib/server/secret-crypto";
import type { IntegrationChannelType, IntegrationProvider } from "@/app/lib/server/integration-oauth";

type MetaPendingPageOption = {
  id: string;
  name: string;
  pageAccessToken: string;
  instagramBusinessId?: string;
  instagramUsername?: string;
};

type MetaPendingAdAccountOption = {
  id: string;
  accountId: string;
  name: string;
  accountStatus?: string;
  currency?: string;
};

type GooglePendingCustomerOption = {
  id: string;
  customerId: string;
  label: string;
  resourceName?: string;
  currencyCode?: string;
  timeZone?: string;
};

export type PendingSelectionDoc = {
  provider: IntegrationProvider;
  tenantId: string;
  userId: string;
  channelType: IntegrationChannelType;
  redirectPath: string;
  oauthToken?: string;
  oauthScope?: string;
  pages?: MetaPendingPageOption[];
  adAccounts?: MetaPendingAdAccountOption[];
  googleCustomers?: GooglePendingCustomerOption[];
  status: "pending" | "completed" | "expired";
  createdAt?: unknown;
  updatedAt?: unknown;
  expiresAt: Date;
  completedAt?: unknown;
};

export type PublicPendingOption = {
  id: string;
  label: string;
  description?: string;
  meta?: Record<string, string>;
};

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanPath(value: unknown) {
  const normalized = clean(value, 300);
  if (!normalized.startsWith("/")) return "/cliente/painel/configuracoes/canais";
  return normalized;
}

function cleanCustomerId(value: unknown) {
  return clean(value, 120).replace(/[^\d]/g, "");
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createIntegrationPendingSelection(input: {
  provider: IntegrationProvider;
  tenantId: string;
  userId: string;
  channelType: IntegrationChannelType;
  redirectPath: string;
  oauthToken?: string;
  oauthScope?: string;
  pages?: Array<{
    id?: string;
    name?: string;
    pageAccessToken?: string;
    instagramBusinessId?: string;
    instagramUsername?: string;
  }>;
  adAccounts?: Array<{ id?: string; accountId?: string; name?: string }>;
  googleCustomers?: Array<{
    customerId?: string;
    label?: string;
    resourceName?: string;
    currencyCode?: string;
    timeZone?: string;
  }>;
  ttlMinutes?: number;
}) {
  const ttlMinutes = Math.min(30, Math.max(5, Number(input.ttlMinutes || 20)));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const ref = adminDb.collection("integration_pending_links").doc();

  const payload: PendingSelectionDoc = {
    provider: input.provider,
    tenantId: clean(input.tenantId, 180),
    userId: clean(input.userId, 180),
    channelType: input.channelType,
    redirectPath: cleanPath(input.redirectPath),
    oauthToken: encryptSecret(clean(input.oauthToken, 5000)),
    oauthScope: clean(input.oauthScope, 1500),
    pages: (Array.isArray(input.pages) ? input.pages : [])
      .map((item) => ({
        id: clean(item.id, 180),
        name: clean(item.name, 180),
        pageAccessToken: encryptSecret(clean(item.pageAccessToken, 5000)),
        instagramBusinessId: clean(item.instagramBusinessId, 180),
        instagramUsername: clean(item.instagramUsername, 180),
      }))
      .filter((item) => item.id && item.pageAccessToken),
    adAccounts: (Array.isArray(input.adAccounts) ? input.adAccounts : [])
      .map((item) => ({
        id: clean(item.id, 180),
        accountId: clean(item.accountId, 120).replace(/[^\d]/g, ""),
        name: clean(item.name, 180),
        accountStatus: clean((item as { accountStatus?: unknown }).accountStatus, 80),
        currency: clean((item as { currency?: unknown }).currency, 40),
      }))
      .filter((item) => item.id || item.accountId),
    googleCustomers: (Array.isArray(input.googleCustomers) ? input.googleCustomers : [])
      .map((item) => ({
        id: cleanCustomerId(item.customerId),
        customerId: cleanCustomerId(item.customerId),
        label: clean(item.label, 220),
        resourceName: clean(item.resourceName, 220),
        currencyCode: clean(item.currencyCode, 40),
        timeZone: clean(item.timeZone, 80),
      }))
      .filter((item) => item.customerId),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt,
  };

  await ref.set(payload);
  return { pendingId: ref.id, expiresAt };
}

export async function readIntegrationPendingSelection(pendingId: string) {
  const ref = adminDb.collection("integration_pending_links").doc(clean(pendingId, 180));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as PendingSelectionDoc;
  const expiresAt = toDate(data.expiresAt);
  if (!expiresAt || expiresAt.getTime() < Date.now() || data.status !== "pending") {
    await ref.set(
      {
        status: "expired",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return null;
  }

  return {
    ref,
    pendingId: ref.id,
    provider: data.provider,
    tenantId: clean(data.tenantId, 180),
    userId: clean(data.userId, 180),
    channelType: data.channelType,
    redirectPath: cleanPath(data.redirectPath),
    oauthToken: clean(decryptSecret(data.oauthToken), 5000),
    oauthScope: clean(data.oauthScope, 1500),
    pages: (Array.isArray(data.pages) ? data.pages : []).map((item) => ({
      id: clean(item.id, 180),
      name: clean(item.name, 180),
      pageAccessToken: clean(decryptSecret(item.pageAccessToken), 5000),
      instagramBusinessId: clean(item.instagramBusinessId, 180),
      instagramUsername: clean(item.instagramUsername, 180),
    })),
    adAccounts: (Array.isArray(data.adAccounts) ? data.adAccounts : []).map((item) => ({
      id: clean(item.id, 180),
      accountId: clean(item.accountId, 120).replace(/[^\d]/g, ""),
      name: clean(item.name, 180),
      accountStatus: clean(item.accountStatus, 80),
      currency: clean(item.currency, 40),
    })),
    googleCustomers: (Array.isArray(data.googleCustomers) ? data.googleCustomers : []).map((item) => ({
      id: clean(item.id, 180),
      customerId: cleanCustomerId(item.customerId),
      label: clean(item.label, 220),
      resourceName: clean(item.resourceName, 220),
      currencyCode: clean(item.currencyCode, 40),
      timeZone: clean(item.timeZone, 80),
    })),
    expiresAt,
  };
}

export function toPublicPendingSelection(input: Awaited<ReturnType<typeof readIntegrationPendingSelection>>) {
  if (!input) return null;
  let options: PublicPendingOption[] = [];
  if (input.provider === "meta") {
    if (input.channelType === "meta_ads") {
      options = input.adAccounts.map((item) => ({
        id: item.accountId || item.id,
        label: item.name || `Conta ${item.accountId || item.id}`,
        description:
          `${item.accountId ? `ID ${item.accountId}` : "Conta de anuncios"}${item.currency ? ` • ${item.currency}` : ""}`.trim(),
        meta: {
          accountId: item.accountId || "",
          objectId: item.id || "",
          accountStatus: item.accountStatus || "",
        },
      }));
    } else {
      options = input.pages.map((item) => ({
        id: item.id,
        label: item.name || item.instagramUsername || `Pagina ${item.id}`,
        description:
          input.channelType === "instagram"
            ? `${item.instagramUsername ? `@${item.instagramUsername} ` : ""}${item.instagramBusinessId ? `(IG ${item.instagramBusinessId})` : ""}`.trim() ||
              "Instagram Business vinculado"
            : `Page ID ${item.id}`,
        meta: {
          pageId: item.id,
          instagramBusinessId: item.instagramBusinessId || "",
          instagramUsername: item.instagramUsername || "",
        },
      }));
    }
  } else {
    options = input.googleCustomers.map((item) => ({
      id: item.customerId,
      label: item.label || `Google Ads ${item.customerId}`,
      description:
        `${item.resourceName || `Customer ${item.customerId}`}${item.currencyCode ? ` • ${item.currencyCode}` : ""}${item.timeZone ? ` • ${item.timeZone}` : ""}`.trim(),
      meta: {
        customerId: item.customerId,
      },
    }));
  }

  return {
    pendingId: input.pendingId,
    provider: input.provider,
    tenantId: input.tenantId,
    channelType: input.channelType,
    expiresAt: input.expiresAt.toISOString(),
    options,
  };
}
