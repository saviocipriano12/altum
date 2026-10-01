export type CommercialVisualMatch = {
  id: string;
  confidence: number;
  reason: string | null;
};

export type CommercialVisualMatchDecision = {
  status: "strong_match" | "similar_options" | "no_reliable_match";
  matches: CommercialVisualMatch[];
  topConfidence: number;
  customerGuidance: string;
};

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function decideCommercialVisualMatches(
  value: unknown,
  allowedIds: Iterable<string>
): CommercialVisualMatchDecision {
  const allowed = new Set(Array.from(allowedIds, String));
  const seen = new Set<string>();
  const matches = (Array.isArray(value) ? value : [])
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const id = clean(row.id, 180);
      if (!id || !allowed.has(id) || seen.has(id)) return null;
      const rawConfidence = Number(row.confidence);
      if (!Number.isFinite(rawConfidence)) return null;
      const confidence = Math.max(0, Math.min(1, rawConfidence));
      if (confidence < 0.52) return null;
      seen.add(id);
      return { id, confidence, reason: clean(row.reason, 240) || null };
    })
    .filter((item): item is CommercialVisualMatch => Boolean(item))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const topConfidence = matches[0]?.confidence || 0;
  if (topConfidence >= 0.72) {
    return {
      status: "strong_match",
      matches,
      topConfidence,
      customerGuidance: "Encontrei uma opcao visualmente proxima no catalogo. Confirme modelo, variacao e disponibilidade antes de concluir a venda.",
    };
  }
  if (matches.length) {
    return {
      status: "similar_options",
      matches,
      topConfidence,
      customerGuidance: "Encontrei opcoes parecidas, mas nao ha evidencia suficiente para afirmar que sao o mesmo produto. Apresente como alternativas e confirme a preferencia do cliente.",
    };
  }
  return {
    status: "no_reliable_match",
    matches: [],
    topConfidence: 0,
    customerGuidance: "Nao encontrei correspondencia visual confiavel no catalogo. Peca mais detalhes ou transfira para confirmacao humana.",
  };
}

export function commercialVisualMatchBoost(confidence: number) {
  if (confidence >= 0.72) return Number((confidence * 12).toFixed(4));
  if (confidence >= 0.52) return Number((confidence * 4).toFixed(4));
  return 0;
}
