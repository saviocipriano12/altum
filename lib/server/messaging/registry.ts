import { isOfficialWhatsAppProvider, type WhatsAppChannelConfig } from "@/app/lib/server/whatsapp-channel";
import { EvolutionMessagingProvider } from "./evolution-provider";
import { LegacyGatewayMessagingProvider } from "./legacy-gateway-provider";
import { MetaCloudMessagingProvider } from "./meta-cloud-provider";
import type { MessagingProvider } from "./types";

export function isEvolutionWhatsAppProvider(provider: string) {
  const value = String(provider || "").trim().toLowerCase();
  return value === "evolution" || value === "evolution_api";
}

export function getWhatsAppMessagingProvider(channel: WhatsAppChannelConfig): MessagingProvider {
  if (isOfficialWhatsAppProvider(channel.provider)) return new MetaCloudMessagingProvider(channel);
  if (isEvolutionWhatsAppProvider(channel.provider)) return new EvolutionMessagingProvider(channel);
  return new LegacyGatewayMessagingProvider(channel);
}
