import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { decryptSecret } = await import("../app/lib/server/secret-crypto.ts");

const tenantId = process.env.ALTUM_CONVERSION_AUDIT_TENANT_ID?.trim();
if (process.argv.includes("--history") && !tenantId) {
  throw new Error("History audit requires an explicit tenant scope.");
}
let query = adminDb.collection("tenant_channels").where("type", "in", ["meta_ads", "google_ads"]);
if (tenantId) query = query.where("tenantId", "==", tenantId);
const channels = await query.limit(101).get();

function hasSecret(value: unknown) {
  try { return Boolean(decryptSecret(value)); } catch { return false; }
}

const items = channels.docs.slice(0, 100).map((doc) => {
  const data = doc.data();
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  return {
    channelId: doc.id,
    tenantId: data.tenantId,
    type: data.type,
    status: data.status || "unknown",
    tokenReadable: hasSecret(data.accessToken) || Boolean(metadata.accessToken),
    refreshTokenReadable: hasSecret(data.refreshToken),
    datasetConfigured: Boolean(metadata.pixelId || metadata.metaPixelId || data.pixelId),
    pageConfigured: Boolean(metadata.pageId || data.pageId),
    testEventCodeConfigured: Boolean(metadata.testEventCode || process.env.META_TEST_EVENT_CODE),
    googleCustomerConfigured: Boolean(data.externalAccountId),
    googleActionsConfigured: ["leadConversionActionId", "qualifiedConversionActionId", "meetingConversionActionId", "meetingCompletedConversionActionId", "saleConversionActionId"].filter((key) => Boolean(metadata[key])),
  };
});

const providerChecks = [];
if (process.argv.includes("--verify-datasets")) {
  for (const doc of channels.docs.slice(0, 100)) {
    const data = doc.data();
    if (data.type !== "meta_ads") continue;
    const metadata = data.metadata || {};
    const datasetId = String(metadata.pixelId || metadata.metaPixelId || data.pixelId || "").trim();
    let token = "";
    try { token = decryptSecret(data.accessToken) || String(metadata.accessToken || ""); } catch { /* Report unavailable, never the secret. */ }
    if (!datasetId || !token) continue;
    try {
      const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}/${encodeURIComponent(datasetId)}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({}));
      providerChecks.push({ channelId: doc.id, datasetAccessible: response.ok && Boolean(payload.id), httpStatus: response.status, errorCode: payload.error?.code || null });
    } catch {
      providerChecks.push({ channelId: doc.id, datasetAccessible: false, networkError: true });
    }
  }
}

let history: Record<string, unknown> | undefined;
if (process.argv.includes("--history")) {
  const { FieldPath } = await import("firebase-admin/firestore");
  const base = adminDb.collection("conversion_dispatches")
    .where("tenantId", "==", tenantId).orderBy(FieldPath.documentId());
  let cursor: string | undefined;
  let examined = 0;
  const states: Record<string, number> = {};
  const failureCategories: Record<string, number> = {};
  let processedWithMetaReceipt = 0;
  let processedWithGoogleReceipt = 0;
  let processedWithoutVerifiedReceipt = 0;
  for (;;) {
    const page = await (cursor ? base.startAfter(cursor) : base).limit(250).get();
    for (const doc of page.docs) {
      const data = doc.data();
      examined += 1;
      const status = String(data.status || "unknown");
      states[status] = (states[status] || 0) + 1;
      if (status === "processed") {
        const response = data.response || {};
        if (data.provider === "meta" && Number(response.events_received) >= 1) processedWithMetaReceipt += 1;
        else if (data.provider === "google" && !response.partialFailureError && Array.isArray(response.results) && response.results.length > 0) processedWithGoogleReceipt += 1;
        else processedWithoutVerifiedReceipt += 1;
      }
      if (["failed", "retry", "dead_letter"].includes(status)) {
        // Aggregate only allowlisted categories, never raw errors or customer data.
        const error = String(data.error || "").toLowerCase();
        const category = /access token|oauth|190|expired token/.test(error) ? "authentication"
          : /page.?id|pagina/.test(error) ? "missing_page"
          : /gclid|click.?id/.test(error) ? "missing_click_identifier"
          : /timeout|abort|fetch failed/.test(error) ? "network"
          : "other_or_unrecorded";
        failureCategories[category] = (failureCategories[category] || 0) + 1;
      }
    }
    if (page.size < 250) break;
    cursor = page.docs[page.docs.length - 1].id;
  }
  history = { tenantId, coverage: { complete: true, examined, paginated: true, snapshotConsistent: false }, states, failureCategories,
    processedWithMetaReceipt, processedWithGoogleReceipt, processedWithoutVerifiedReceipt,
    limitation: "Provider receipt is not proof of campaign matching or revenue attribution. Live writes may occur during pagination." };
}

console.log(JSON.stringify({
  readOnly: true,
  checkedAt: new Date().toISOString(),
  coverage: { complete: channels.size <= 100, examined: items.length, limit: 100 },
  globalCredentials: {
    metaTokenConfigured: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN || process.env.META_ADS_ACCESS_TOKEN),
    metaDatasetConfigured: Boolean(process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID),
    googleDeveloperTokenConfigured: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
    googleOAuthConfigured: Boolean(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET),
  },
  items,
  providerChecks,
  history,
}, null, 2));
