import manifestConfig from "@/config/agency-agent-manifests.json";
import {
  activationReadiness,
  agentManifestSchema,
  type AgentManifest,
} from "@/lib/server/agent-os/agent-manifest";
import { getImportedAgencyAgents } from "@/lib/server/agent-os/agency-catalog";

const manifestDocumentSchema = agentManifestSchema.array();
const manifests = manifestDocumentSchema.parse(manifestConfig.manifests);
const manifestByAgentId = new Map(
  manifests.map((manifest) => [manifest.agentId, manifest]),
);

export type AgencyCatalogEntry = {
  agentId: string;
  displayName: string;
  role: string;
  division: string;
  source: { repo: string; commit: string; license: string; path: string };
  reviewStatus: "review_required" | "not_configured";
  manifest: AgentManifest | null;
  activation: ReturnType<typeof activationReadiness>;
};

function entryFromManifest(manifest: AgentManifest) {
  return {
    displayName: manifest.displayName,
    role: manifest.role,
    source: manifest.source,
    manifest,
    reviewStatus:
      manifest.status === "review_required"
        ? ("review_required" as const)
        : ("not_configured" as const),
    activation: activationReadiness(manifest),
  };
}

export function getAgencyCatalog(): AgencyCatalogEntry[] {
  return getImportedAgencyAgents().map((imported) => {
    const manifest = manifestByAgentId.get(imported.agentId);
    if (!manifest) {
      return {
        agentId: imported.agentId,
        displayName: imported.displayRole,
        role: imported.displayRole,
        division: imported.division,
        source: { ...imported.source, path: imported.sourcePath },
        reviewStatus: "not_configured" as const,
        manifest: null,
        activation: {
          ready: false,
          blockers: [
            "Crie e revise o manifesto operacional antes de ativar este agente.",
          ],
        },
      };
    }
    return {
      agentId: imported.agentId,
      division: imported.division,
      ...entryFromManifest(manifest),
    };
  });
}
