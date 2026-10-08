import type { AgentCapability, ProviderAvailability, RoutingMode } from "@/lib/server/agent-os/tool-registry";

export type ModelProviderCandidate = { slug: string; capabilities: readonly string[]; availability: ProviderAvailability; healthy?: boolean; latencyRank?: number; qualityRank?: number };

const MODE_ORDER: Record<RoutingMode, ProviderAvailability[]> = {
  FREE_FIRST: ["FREE", "FREE_TIER", "SELF_HOSTED", "CREDIT", "SUBSCRIPTION", "PAID"],
  BALANCED: ["SELF_HOSTED", "FREE_TIER", "PAID", "CREDIT", "SUBSCRIPTION", "FREE"],
  QUALITY_FIRST: ["PAID", "SUBSCRIPTION", "CREDIT", "SELF_HOSTED", "FREE_TIER", "FREE"],
  FASTEST: ["FREE_TIER", "PAID", "SELF_HOSTED", "CREDIT", "SUBSCRIPTION", "FREE"],
  CHEAPEST: ["FREE", "FREE_TIER", "SELF_HOSTED", "CREDIT", "PAID", "SUBSCRIPTION"],
  LOCAL_ONLY: ["SELF_HOSTED"],
  PRIVACY_FIRST: ["SELF_HOSTED", "SUBSCRIPTION", "PAID", "FREE_TIER", "CREDIT", "FREE"],
};

export function routeCapability(input: { capability: AgentCapability; mode: RoutingMode; providers: ModelProviderCandidate[] }) {
  const order = MODE_ORDER[input.mode];
  return input.providers
    .filter((provider) => provider.healthy !== false && provider.capabilities.includes(input.capability) && order.includes(provider.availability))
    .sort((left, right) => {
      const availability = order.indexOf(left.availability) - order.indexOf(right.availability);
      if (availability) return availability;
      if (input.mode === "QUALITY_FIRST") return (right.qualityRank || 0) - (left.qualityRank || 0);
      if (input.mode === "FASTEST") return (left.latencyRank || Number.MAX_SAFE_INTEGER) - (right.latencyRank || Number.MAX_SAFE_INTEGER);
      return 0;
    });
}
