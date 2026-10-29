import { conversationSourceHref } from "./conversation-source-link";
import { currentCommercialField, type CommercialField } from "./crm-current-facts";
export type CommercialEvidenceFact = {
  label: string; value: string; sourceLabel: string; excerpt: string; conversationHref?: string;
};
const text = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function commercialEvidenceFacts(lead?: { customFields?: unknown; aiFieldEvidence?: unknown } | null): CommercialEvidenceFact[] {
  const evidence = record(lead?.aiFieldEvidence);
  const fields = [
    { label: "Interesse", custom: "servico_interesse", field: "serviceInterest", keys: ["serviceInterest"] },
    { label: "Urgência", custom: "urgencia", field: "urgency", keys: ["urgency"] },
    { label: "Orçamento", custom: "orcamento", field: "budgetBand", keys: ["budgetBand"] },
    { label: "Decisor", custom: "decisor", field: "decisionMaker", keys: ["decisionMaker"] },
  ];
  return fields.flatMap(field => {
    // The saved CRM value wins over an older model annotation, including manual corrections.
    const current = currentCommercialField(lead, field.field as CommercialField);
    const key = current.authoritative ? `custom.${field.custom}` : [...field.keys, `custom.${field.custom}`].find(key => text(record(evidence[key]).value));
    const candidate = record(key ? evidence[key] : null);
    // A changed saved value must not display an older quote as its supporting evidence.
    const proof = current.value && text(candidate.value) && current.value !== text(candidate.value) ? {} : candidate;
    const value = current.value;
    if (!value) return [];
    const source = text(proof.source), chatId = text(proof.chatId, 180);
    return [{ label: field.label, value,
      sourceLabel: source === "manual" ? "Registrado pela equipe" : proof.contentKind === "audio_transcription" ? "Extraído de áudio"
        : source === "customer_message" ? "Extraído da conversa" : "",
      excerpt: source === "manual" ? "" : text(proof.excerpt),
      ...(chatId ? { conversationHref: conversationSourceHref(chatId, proof.messageId, proof.sourceOrder, proof.sourceRevision) || undefined } : {}),
    }];
  });
}
