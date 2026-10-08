function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cleanName(value: string) {
  return value.replace(/[^\p{L}\p{N} .'-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Detects only an explicit request to create an identity. It never treats a
 * request to merely use an existing avatar as permission to create one. */
export function parseAvatarCommand(message: string) {
  const text = normalized(message);
  const mentionsIdentity = /\b(avatar|clone|personagem|apresentador virtual)\b/.test(text);
  const createsIdentity = /\b(crie|criar|quero|novo|montar|faca|fazer)\b/.test(text);
  if (!mentionsIdentity || !createsIdentity) return null;
  const identityType = /\b(personagem|character)\b/.test(text) ? "character" as const : "person" as const;
  const named = message.match(/(?:chamad[oa]|nome(?:\s+dele|\s+dela)?\s*[=:]?|do|da)\s+["“']?([\p{L}][\p{L}\p{N} .'-]{1,80})/iu)?.[1];
  const displayName = cleanName(named || (identityType === "character" ? "Novo personagem" : "Novo avatar"));
  const rightsConfirmed = identityType === "character"
    ? /\b(confirmo|autorizo|tenho\s+direitos|personagem\s+(?:e|é)\s+meu)\b/.test(text)
    : /\b(confirmo|autorizo|tenho\s+direito|sou\s+o\s+titular|imagem\s+e\s+voz\s+autorizad)/.test(text);
  return { identityType, displayName, rightsConfirmed };
}

/** Evaluated only against a pending request in the same private conversation.
 * It cannot authorize a profile from another company or chat. */
export function isAvatarRightsConfirmation(message: string) {
  const text = normalized(message).replace(/\s+/g, " ").trim();
  if (/\b(nao|nunca|recusar|cancelar|rejeit)/.test(text)) return false;
  return /\b(confirmo|autorizo|tenho\s+(?:os\s+)?direitos|sou\s+(?:o|a)\s+titular|a\s+imagem\s+e\s+a\s+voz\s+estao\s+autorizad|o\s+personagem\s+(?:e|é)\s+meu)\b/.test(text);
}
