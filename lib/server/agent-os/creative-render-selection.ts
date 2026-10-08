/** Interprets a conversational choice of an already proposed creative. */
export function parseCreativeRenderSelection(message: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const asksToRender = /\b(gere|gerar|renderize|renderizar|produza|produzir|crie|criar)\b/.test(normalized);
  const refersToDraft = /\b(conceito|rascunho|criativo|primeir[oa]?|segund[oa]?|terceir[oa]?|video|imagem)\b/.test(normalized);
  const explicitlyRequestsNewWork = /\b(nov[oa]|outro|outra|do zero|diferente)\b/.test(normalized);
  if (!asksToRender || !refersToDraft || explicitlyRequestsNewWork) return null;
  const ordinal = /\b(segund[oa]?|2[ºoªa]?)\b/.test(normalized) ? 1 : /\b(terceir[oa]?|3[ºoªa]?)\b/.test(normalized) ? 2 : 0;
  return { ordinal };
}
