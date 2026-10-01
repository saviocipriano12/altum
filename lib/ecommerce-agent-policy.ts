export type EcommerceAgentMode = "off" | "shadow" | "automatic";

export type EcommerceAgentRollout = {
  mode: EcommerceAgentMode;
  agentVersion: string;
  rolloutPercent: number;
  maxActionsPerRun: number;
  experiment: EcommerceAgentExperiment;
};

export type EcommerceAgentExperiment = {
  enabled: boolean;
  challengerVersion: string;
  challengerPercent: number;
  autoRollback: boolean;
  minSampleSize: number;
  maxFailureRate: number;
  maxRelativeConversionDrop: number;
};

function clean(value: unknown, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function clampFraction(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function normalizeEcommerceAgentRollout(value: unknown, legacyAutoSend = false): EcommerceAgentRollout {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const requestedMode = clean(raw.mode, 20).toLowerCase();
  const mode: EcommerceAgentMode = requestedMode === "shadow" || requestedMode === "automatic"
    ? requestedMode
    : legacyAutoSend
      ? "automatic"
      : "off";
  const experimentRaw = raw.experiment && typeof raw.experiment === "object" && !Array.isArray(raw.experiment)
    ? raw.experiment as Record<string, unknown>
    : {};
  return {
    mode,
    agentVersion: clean(raw.agentVersion, 60) || "ecommerce-v1",
    rolloutPercent: clamp(raw.rolloutPercent, 0, 100, mode === "automatic" ? 100 : 0),
    maxActionsPerRun: clamp(raw.maxActionsPerRun, 1, 25, 10),
    experiment: {
      enabled: experimentRaw.enabled === true && Boolean(clean(experimentRaw.challengerVersion, 60)),
      challengerVersion: clean(experimentRaw.challengerVersion, 60),
      challengerPercent: clamp(experimentRaw.challengerPercent, 1, 50, 10),
      autoRollback: experimentRaw.autoRollback === true,
      minSampleSize: clamp(experimentRaw.minSampleSize, 20, 1000, 50),
      maxFailureRate: clampFraction(experimentRaw.maxFailureRate, 0.01, 0.5, 0.15),
      maxRelativeConversionDrop: clampFraction(experimentRaw.maxRelativeConversionDrop, 0.05, 0.8, 0.25),
    },
  };
}

export function ecommerceRolloutBucket(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function decideEcommerceAgentExecution(input: {
  rollout: EcommerceAgentRollout;
  tenantId: string;
  actionId: string;
  subjectKey?: string;
  templateEnabled: boolean;
  hasTemplate: boolean;
  hasPhone: boolean;
}) {
  const stableKey = input.subjectKey || input.actionId;
  const bucket = ecommerceRolloutBucket(`${input.tenantId}:${stableKey}`);
  const experimentBucket = ecommerceRolloutBucket(`${input.tenantId}:${stableKey}:experiment`);
  const assignedVersion = input.rollout.experiment.enabled && experimentBucket < input.rollout.experiment.challengerPercent
    ? input.rollout.experiment.challengerVersion
    : input.rollout.agentVersion;
  if (!input.templateEnabled || !input.hasTemplate) {
    return { eligible: false, shouldSend: false, bucket, experimentBucket, assignedVersion, reason: "template_disabled" as const };
  }
  if (!input.hasPhone) {
    return { eligible: false, shouldSend: false, bucket, experimentBucket, assignedVersion, reason: "missing_phone" as const };
  }
  if (input.rollout.mode === "off") {
    return { eligible: true, shouldSend: false, bucket, experimentBucket, assignedVersion, reason: "mode_off" as const };
  }
  if (input.rollout.mode === "shadow") {
    return { eligible: true, shouldSend: false, bucket, experimentBucket, assignedVersion, reason: "shadow_only" as const };
  }
  if (bucket >= input.rollout.rolloutPercent) {
    return { eligible: true, shouldSend: false, bucket, experimentBucket, assignedVersion, reason: "outside_rollout" as const };
  }
  return { eligible: true, shouldSend: true, bucket, experimentBucket, assignedVersion, reason: "approved" as const };
}
