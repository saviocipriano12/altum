const OFFICIAL_PROVIDERS = new Set([
  "meta_whatsapp", "meta_cloud", "whatsapp_cloud", "whatsapp_cloud_api", "whatsapp_business_cloud_api",
]);

export function requiresWhatsAppTemplate(input: {
  channel?: string;
  provider?: string;
  lastInboundAt?: number | null;
  requiresTemplate?: boolean;
  now?: number;
}) {
  if ((input.channel || "whatsapp").trim().toLowerCase() !== "whatsapp") return false;
  if (!OFFICIAL_PROVIDERS.has((input.provider || "").trim().toLowerCase())) return false;
  if (input.requiresTemplate) return true;
  if (!input.lastInboundAt || !Number.isFinite(input.lastInboundAt)) return true;
  return (input.now ?? Date.now()) - input.lastInboundAt >= 24 * 60 * 60 * 1000;
}
