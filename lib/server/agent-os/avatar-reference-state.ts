export function avatarReferenceStatus(kinds: Iterable<string>) {
  const known = new Set(kinds);
  return known.has("visual") && known.has("voice") ? "anchor_required" : "reference_incomplete";
}
