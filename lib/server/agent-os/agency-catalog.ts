import agencyAgentRegistry from "@/config/reviewed-agency-agents.json";
import { z } from "zod";

const agencyCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal("review_queue"),
    source: z.object({
      repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
      commit: z.string().regex(/^[a-f0-9]{40}$/i),
      license: z.string().min(2),
    }),
    agents: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
          sourcePath: z.string().endsWith(".md"),
          division: z.string().min(2),
          altumRole: z.string().min(3),
        }),
      )
      .min(1),
  })
  .strict();

const catalog = agencyCatalogSchema.parse(agencyAgentRegistry);
const indexedAgents = new Map(catalog.agents.map((agent) => [agent.id, agent]));

if (indexedAgents.size !== catalog.agents.length) {
  throw new Error("O catálogo Agency Agents contém IDs duplicados.");
}

export type ImportedAgencyAgent = z.infer<
  typeof agencyCatalogSchema
>["agents"][number];

export function getImportedAgencyAgent(agentId: string) {
  const agent = indexedAgents.get(agentId);
  if (!agent) return null;
  return {
    agentId: agent.id,
    displayRole: agent.altumRole,
    division: agent.division,
    status: "review_required" as const,
    source: catalog.source,
    sourcePath: agent.sourcePath,
  };
}

export function isImportedAgencyAgent(agentId: string) {
  return indexedAgents.has(agentId);
}

export const importedAgencyAgentIds = Object.freeze([...indexedAgents.keys()]);

/**
 * The source registry is deliberately review-only. Consumers receive a copy
 * rather than the mutable parsed JSON object, so a UI cannot accidentally
 * change the catalog that mission planning relies on.
 */
export function getImportedAgencyAgents() {
  return catalog.agents.map((agent) => getImportedAgencyAgent(agent.id)!);
}
