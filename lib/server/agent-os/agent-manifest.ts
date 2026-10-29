import { z } from "zod";
import { APPROVAL_CAPABILITIES } from "@/lib/server/agent-os/approval-policy";
import { AGENT_CAPABILITIES } from "@/lib/server/agent-os/tool-registry";

export const AGENT_MANIFEST_STATUSES = ["review_required", "active", "disabled", "deprecated"] as const;
export const AGENT_EXECUTION_MODES = ["draft_only", "supervised", "autonomous_limited"] as const;

export type AgentManifestStatus = (typeof AGENT_MANIFEST_STATUSES)[number];
export type AgentExecutionMode = (typeof AGENT_EXECUTION_MODES)[number];

const externalCapabilityApproval: Partial<Record<(typeof AGENT_CAPABILITIES)[number], (typeof APPROVAL_CAPABILITIES)[number]>> = {
  EXTERNAL_MESSAGING: "EXTERNAL_MESSAGING",
  PUBLISH_CONTENT: "PUBLISH_OR_ADS_WRITE",
  PUBLISH_OR_ADS_WRITE: "PUBLISH_OR_ADS_WRITE",
  CRM_WRITE: "CRM_WRITE",
};

export const agentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  agentId: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  version: z.string().trim().regex(/^\d+\.\d+\.\d+$/),
  displayName: z.string().trim().min(3).max(120),
  role: z.string().trim().min(3).max(180),
  status: z.enum(AGENT_MANIFEST_STATUSES),
  executionMode: z.enum(AGENT_EXECUTION_MODES),
  source: z.object({
    repo: z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    commit: z.string().trim().regex(/^[a-f0-9]{40}$/i),
    path: z.string().trim().min(3).max(300),
    license: z.string().trim().min(2).max(80),
  }),
  ownerId: z.string().trim().min(2).max(180).nullable(),
  capabilities: z.array(z.enum(AGENT_CAPABILITIES)).max(24),
  skillIds: z.array(z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,100}$/)).max(32),
  allowedConnectionKinds: z.array(z.enum(["none", "read_only", "approved_write"]))
    .min(1).max(3),
  approvalCapabilities: z.array(z.enum(APPROVAL_CAPABILITIES)).max(APPROVAL_CAPABILITIES.length),
  limits: z.object({
    maxRunMinutes: z.number().int().min(1).max(1_440),
    maxAttempts: z.number().int().min(1).max(10),
    maxCostBrl: z.number().finite().min(0).max(1_000_000),
  }),
  evaluationIds: z.array(z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,120}$/)).max(40),
  escalation: z.object({
    requiresHumanForExternalAction: z.literal(true),
    failureOwner: z.string().trim().min(2).max(180).nullable(),
  }),
}).strict();

export type AgentManifest = z.infer<typeof agentManifestSchema>;

/**
 * A manifest can be valid JSON and still be unsafe to activate. This check is
 * intentionally stricter than the schema and is the gate for a future agent
 * registry promotion workflow.
 */
export function activationReadiness(manifest: AgentManifest) {
  const blockers: string[] = [];
  if (manifest.status !== "active") blockers.push("O manifesto não está marcado como ativo.");
  if (!manifest.ownerId) blockers.push("Defina o responsável interno pelo agente.");
  if (!manifest.escalation.failureOwner) blockers.push("Defina o responsável por falhas e escaladas.");
  if (!manifest.capabilities.length) blockers.push("Defina ao menos uma capacidade permitida.");
  if (!manifest.evaluationIds.length) blockers.push("Defina ao menos uma avaliação antes da ativação.");
  if (manifest.executionMode === "autonomous_limited" && manifest.allowedConnectionKinds.includes("approved_write")) {
    blockers.push("Ações por conexão com escrita aprovada devem iniciar supervisionadas até existir evidência de qualidade.");
  }
  for (const capability of manifest.capabilities) {
    const requiredApproval = externalCapabilityApproval[capability];
    if (requiredApproval && !manifest.approvalCapabilities.includes(requiredApproval)) {
      blockers.push(`A capacidade ${capability} exige a política de aprovação ${requiredApproval}.`);
    }
  }
  return { ready: blockers.length === 0, blockers };
}

