import Link from "next/link";
import { conversationSourceHref } from "@/lib/conversation-source-link";
import type { CommercialEvidenceFact as Fact } from "@/lib/crm-field-evidence";

export function CommercialEvidenceFact({ fact }: { fact: Fact }) {
  return <div className="min-w-0 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">{fact.label}</p>
    <p className="mt-1 break-words text-xs font-bold text-[var(--cliente-card-text)]">{fact.value}</p>
    {fact.sourceLabel || fact.excerpt ? <details className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
      <summary className="cursor-pointer">{fact.sourceLabel || "Ver origem"}</summary>
      {fact.excerpt ? <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[var(--cliente-border)] pl-2">{fact.excerpt}</blockquote> : null}
      {fact.conversationHref ? <Link href={fact.conversationHref} className="mt-2 inline-block font-semibold text-[var(--cliente-primary)]">Abrir conversa</Link> : null}
    </details> : null}
  </div>;
}

export function CommercialMediaInsight({ insight }: { insight?: unknown }) {
  if (!insight || typeof insight !== "object") return null;
  const row = insight as Record<string, unknown>;
  if (typeof row.text !== "string" || !row.text.trim() || row.reviewRequired !== true || !["image", "document", "video"].includes(String(row.kind))) return null;
  const label = row.kind === "image" ? "Imagem" : row.kind === "document" ? "Documento" : "Vídeo";
  return <details className="mt-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-xs text-[var(--cliente-card-text)]">
    <summary className="cursor-pointer font-semibold">{label} · revisar interpretação</summary>
    <p className="mt-2 whitespace-pre-wrap break-words">{row.text}</p>
    <p className="mt-2 text-[var(--cliente-card-text-soft)]">Interpretação da mídia. Confirme com o cliente antes de usar como qualificação.</p>
    {conversationSourceHref(row.chatId, row.messageId, row.sourceOrder, row.sourceRevision) ? <Link href={conversationSourceHref(row.chatId, row.messageId, row.sourceOrder, row.sourceRevision)!} className="mt-2 inline-block font-semibold text-[var(--cliente-primary)]">Abrir mensagem e conferir mídia</Link> : null}
  </details>;
}
