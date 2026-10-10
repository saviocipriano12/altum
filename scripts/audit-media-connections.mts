import nextEnv from "@next/env";

// The audit is intentionally read-only and never serializes credentials,
// URLs containing credentials, or provider response bodies.
nextEnv.loadEnvConfig(process.env.ALTUM_ENV_ROOT || process.cwd());

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && !(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)) {
  throw new Error("firebase_admin_credentials_unavailable: configure a service-account credential in the execution environment before auditing live connections");
}

const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { hasCreativeProviderContract } = await import("../lib/server/agent-os/creative-provider-contracts.ts");
const { mediaConnectionAvailability } = await import("../lib/server/agent-os/creative-model-router.ts");

const mediaCapabilities = new Set(["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"]);
const snapshot = await adminDb.collection("tool_connections").limit(500).get();
const rows = snapshot.docs.map((doc) => {
  const data = doc.data();
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities.map(String) : [];
  const claimedMedia = capabilities.filter((capability) => mediaCapabilities.has(capability));
  const certified = claimedMedia.filter((capability) => hasCreativeProviderContract({
    providerId: String(data.providerId || ""),
    connectionType: typeof data.connectionType === "string" ? data.connectionType : undefined,
    baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : undefined,
  }, capability));
  const availability = mediaConnectionAvailability({ status: String(data.status || "pending_config"), health: data.health });
  const credentialConfigured = typeof data.credential === "string" && data.credential.length > 12;
  const state = !claimedMedia.length ? "not_media"
    : !credentialConfigured ? "missing_credential"
      : !certified.length ? "awaiting_certified_adapter"
        : !availability.available ? "temporarily_unavailable"
          : "routable";
  return {
    id: doc.id,
    provider: String(data.providerId || "unknown"),
    name: String(data.displayName || data.providerId || "Conexão"),
    scope: data.scope === "tenant" ? "tenant" : "platform",
    status: String(data.status || "pending_config"),
    state,
    claimedCapabilities: claimedMedia,
    certifiedCapabilities: certified,
    configuredModel: typeof data.creativeModel === "string" ? data.creativeModel : null,
    catalogSize: Array.isArray(data.modelCatalog) ? data.modelCatalog.length : 0,
    health: data.health && typeof data.health === "object" ? String((data.health as { status?: unknown }).status || "unknown") : "not_checked",
  };
}).filter((row) => row.claimedCapabilities.length || row.provider === "freellmapi" || row.provider === "nvidia-nim");

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), totalConnections: snapshot.size, mediaRelevantConnections: rows.length, rows }, null, 2));
