export function avatarReferenceStatus(kinds: Iterable<string>) {
  const known = new Set(kinds);
  // Visual anchoring trains only a visual reference. Voice is intentionally a
  // separate, opt-in capability so an avatar can be useful before voice
  // cloning is configured and approved.
  return known.has("visual") ? "anchor_required" : "reference_incomplete";
}
