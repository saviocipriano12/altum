import type { AgentCapability } from "@/lib/server/agent-os/tool-registry";

type CreativeConnection = {
  providerId?: unknown;
  connectionType?: unknown;
  baseUrl?: unknown;
};

const DIRECT_PROVIDER_CAPABILITIES: Record<string, readonly AgentCapability[]> = {
  fal: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AVATAR_VIDEO"],
  replicate: ["GENERATE_IMAGE", "GENERATE_VIDEO"],
  higgsfield: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AVATAR_VIDEO"],
  "ltx-cloud": ["GENERATE_VIDEO"],
  "alibaba-model-studio": ["GENERATE_IMAGE", "GENERATE_VIDEO"],
  xai: ["GENERATE_IMAGE", "GENERATE_VIDEO"],
};

const LOCAL_BRIDGE_PROVIDERS = new Set(["comfyui", "ltx", "openmontage"]);

function providerId(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * The routing layer must only select a connection that has a concrete
 * executor. A provider merely appearing in the catalog is not an executor:
 * sending a made-up generic payload to HeyGen, Hugging Face or another cloud
 * API creates an expensive, misleading failure. Local bridges remain
 * extensible, but only through the explicit Altum Creative v1 bridge contract.
 */
export function hasCreativeProviderContract(connection: CreativeConnection, capability: string) {
  const id = providerId(connection.providerId);
  if ((DIRECT_PROVIDER_CAPABILITIES[id] || []).includes(capability as AgentCapability)) return true;
  const isMediaCapability = ["GENERATE_IMAGE", "GENERATE_VIDEO"].includes(capability);
  if (LOCAL_BRIDGE_PROVIDERS.has(id)) return String(connection.connectionType || "").toLowerCase() !== "api" && isMediaCapability;
  // This is the explicitly extensible Altum Creative v1 bridge. It is not
  // enabled by any catalog provider; it is selected only when an operator
  // intentionally creates a custom, URL-backed media connection.
  return id === "custom-openai-compatible" && typeof connection.baseUrl === "string" && Boolean(connection.baseUrl.trim()) && isMediaCapability;
}

export function creativeProviderContractMessage(connection: CreativeConnection) {
  const id = providerId(connection.providerId) || "este provedor";
  if (LOCAL_BRIDGE_PROVIDERS.has(id)) return "Configure o bridge Altum Creative v1 local para usar este executor.";
  return `A Altum ainda não possui um adaptador de execução certificado para ${id}. A conexão será mantida, mas não receberá pedidos até o adaptador estar pronto.`;
}
