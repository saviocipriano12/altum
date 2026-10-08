export const APPROVAL_CAPABILITIES = [
  "EXTERNAL_MESSAGING",
  "PUBLISH_OR_ADS_WRITE",
  "SPEND_MONEY",
  "DELETE_DATA",
  "BROWSER_AUTHENTICATED_ACTION",
  "CRM_WRITE",
] as const;

export type ApprovalCapability = (typeof APPROVAL_CAPABILITIES)[number];

export const HARD_APPROVAL_CAPABILITIES = new Set<ApprovalCapability>([
  "EXTERNAL_MESSAGING",
  "PUBLISH_OR_ADS_WRITE",
  "SPEND_MONEY",
  "DELETE_DATA",
  "BROWSER_AUTHENTICATED_ACTION",
]);

export const DEFAULT_APPROVAL_POLICY: Record<ApprovalCapability, boolean> = {
  EXTERNAL_MESSAGING: true,
  PUBLISH_OR_ADS_WRITE: true,
  SPEND_MONEY: true,
  DELETE_DATA: true,
  BROWSER_AUTHENTICATED_ACTION: true,
  CRM_WRITE: false,
};

export function normalizeApprovalPolicy(value: unknown): Record<ApprovalCapability, boolean> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return APPROVAL_CAPABILITIES.reduce((policy, capability) => {
    policy[capability] = HARD_APPROVAL_CAPABILITIES.has(capability) ? true : source[capability] === true;
    return policy;
  }, { ...DEFAULT_APPROVAL_POLICY });
}

