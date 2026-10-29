import { createHash } from "node:crypto";

export function externalWhatsAppMessageId(tenantId: string, channelId: string, externalId: string) {
  return `wa_external_${createHash("sha256").update(JSON.stringify([tenantId, channelId, externalId])).digest("hex")}`;
}
