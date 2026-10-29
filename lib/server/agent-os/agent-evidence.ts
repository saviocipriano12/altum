export const EVIDENCE_KINDS = [
  "source",
  "artifact",
  "receipt",
  "measurement",
  "approval",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

function safeEvidenceUri(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeRuntimeArtifactEvidence(input: {
  kind: string;
  label: string;
  url?: string;
}) {
  const kind: EvidenceKind = (EVIDENCE_KINDS as readonly string[]).includes(
    input.kind,
  )
    ? (input.kind as EvidenceKind)
    : "artifact";
  return {
    kind,
    label: input.label.trim(),
    uri: safeEvidenceUri(input.url),
  };
}
