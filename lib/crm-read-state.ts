import { conversationSourceHref } from "./conversation-source-link";
export type CommercialReadState = {
  status: "checked" | "awaiting_media" | "media_failed" | "needs_review" | "limited";
  messageId: string; chatId: string; occurredAtMs: number; sourceCreatedAtMs: number;
  sourceOrder?: string;
  sourceRevision?: string;
};

export function commercialReadStatus(input: { mediaType: string; mediaError: boolean; mediaInterpreted: boolean; semanticStatus: string }): CommercialReadState["status"] {
  if (input.mediaError) return "media_failed";
  if (["audio", "image", "video", "document"].includes(input.mediaType) && !input.mediaInterpreted) return "awaiting_media";
  if (["failed", "review_required", "processing"].includes(input.semanticStatus)) return "needs_review";
  if (["budget_exhausted", "budget_not_configured", "provider_unavailable", "unsupported_provider", "model_not_validated", "billing_blocked"].includes(input.semanticStatus)) return "limited";
  return "checked";
}

export function canReplaceCommercialReadState(current: unknown, incoming: CommercialReadState) {
  const row = current && typeof current === "object" ? current as Record<string, unknown> : {};
  const time = Number(row.occurredAtMs || 0), created = Number(row.sourceCreatedAtMs || 0);
  if (incoming.occurredAtMs === time && typeof row.sourceOrder === "string" && incoming.sourceOrder) return incoming.sourceOrder >= row.sourceOrder;
  return incoming.occurredAtMs > time || incoming.occurredAtMs === time && incoming.sourceCreatedAtMs >= created;
}

export function commercialReadNotice(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const summary = value as Record<string, unknown>;
  if (summary.issuesVersion === 1 && summary.pendingCount === 0) return null;
  const row = summary.issuesVersion === 1 && Number(summary.pendingCount) > 0 && summary.pendingSource && typeof summary.pendingSource === "object"
    ? summary.pendingSource as Record<string, unknown> : summary;
  if (typeof row.chatId !== "string" || !row.chatId || row.chatId.length > 180 || row.chatId.includes("/")) return null;
  const messages: Record<string, { title: string; detail: string; action: string }> = {
    awaiting_media: { title: "Mídia ainda sem interpretação", detail: "Confira a mensagem e registre o que for necessário enquanto a leitura não estiver disponível.", action: "Conferir mensagem" },
    media_failed: { title: "Não foi possível interpretar a mídia", detail: "As informações já registradas foram mantidas. Confira o arquivo antes de usar seu conteúdo na negociação.", action: "Abrir conversa e conferir arquivo" },
    needs_review: { title: "A leitura automática precisa de revisão", detail: "Confira a conversa e revise as informações comerciais. Os dados anteriores foram mantidos.", action: "Conferir conversa" },
    limited: { title: "A análise completa está indisponível", detail: "Confira as informações da conversa antes de decidir o próximo passo. A equipe ainda pode registrar e corrigir os dados.", action: "Abrir conversa" },
  };
  const content = Object.hasOwn(messages, String(row.status)) ? messages[String(row.status)] : undefined;
  return content ? { ...content, pendingCount: summary.issuesVersion === 1 ? Number(summary.pendingCount) || 0 : 1,
    href: conversationSourceHref(row.chatId, row.messageId, row.sourceOrder, row.sourceRevision)! } : null;
}
