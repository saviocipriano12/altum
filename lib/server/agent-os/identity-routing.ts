export type IdentityProfileCandidate = {
  id: string;
  tenantId: string;
  displayName: string;
  identityType?: "person" | "character";
  identityAnchor?: string;
  visualStyle?: string;
  voiceDirection?: string;
  status?: string;
};

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Picks an identity only when the request actually asks for a person/character.
 * A user can name a profile ("use Savio") or use natural terms such as avatar.
 */
export function selectIdentityProfile(input: { prompt: string; tenantId: string; profiles: IdentityProfileCandidate[] }) {
  const text = normalized(input.prompt);
  const asksForIdentity = /avatar|clone|apresentador|pessoa falando|talking.?head|ugc|personagem|personagem/.test(text);
  if (!asksForIdentity) return null;
  const candidates = input.profiles.filter((profile) => profile.tenantId === input.tenantId && profile.displayName.trim());
  if (!candidates.length) return null;
  const selected = [...candidates].sort((left, right) => {
    const a = text.includes(normalized(left.displayName)) ? 1 : 0;
    const b = text.includes(normalized(right.displayName)) ? 1 : 0;
    return b - a || left.displayName.localeCompare(right.displayName);
  })[0];
  return {
    ...selected,
    anchor: [selected.identityAnchor, selected.visualStyle && `Estilo: ${selected.visualStyle}`, selected.voiceDirection && `Voz: ${selected.voiceDirection}`].filter(Boolean).join("\n").slice(0, 2400),
  };
}
