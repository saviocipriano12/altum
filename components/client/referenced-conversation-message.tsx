"use client";
import { useEffect, useState, type ReactNode } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { fetchInboxJson } from "@/lib/inbox-request";
import { selectReferencedMessage, referencedMessageChanged, isConversationMessageId } from "@/lib/conversation-source-link";

/** Kept separate from the paginated timeline: a direct lookup cannot fill its gaps. */
export function ReferencedConversationMessage<T extends { id: string; generation?: string; revision?: string }>({ tenantId, chatId, messageId, generation, expectedRevision, renderMessage }: {
  tenantId: string; chatId: string; messageId: string; generation?: string | null; expectedRevision?: string | null; renderMessage: (message: T) => ReactNode;
}) {
  const [item, setItem] = useState<T | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0), [closed, setClosed] = useState(false);
  useEffect(() => {
    let active = true;
    setItem(null); setBusy(true); setError("");
    void (async () => {
      try {
        // Validate before creating a request; URL input never becomes a path segment.
        if (!isConversationMessageId(messageId)) throw new Error("Referência de mensagem inválida.");
        const { response, payload } = await fetchInboxJson<{ items?: T[] }>(signal => authedFetch(
          `/api/tenant/${encodeURIComponent(tenantId)}/chats/${encodeURIComponent(chatId)}/messages?id=${encodeURIComponent(messageId)}`, { signal }), 15000);
        if (!response.ok) throw new Error(response.status === 403 ? "Você não tem acesso a esta mensagem." : "Não foi possível abrir a mensagem.");
        const result = selectReferencedMessage(payload, messageId, generation);
        if (active) setItem(result);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Não foi possível abrir a mensagem."); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [tenantId, chatId, messageId, generation, attempt]);
  if (closed) return null;
  return <section aria-label="Mensagem vinculada ao CRM" className="max-h-[45%] shrink-0 overflow-y-auto border-b border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
    <div className="mb-3 flex items-center justify-between gap-3 text-xs">
      <p className="font-semibold text-[var(--cliente-primary)]">Mensagem vinculada ao CRM</p>
      <button type="button" onClick={() => setClosed(true)} className="font-semibold">Fechar mensagem</button>
    </div>
    {busy ? <p role="status" className="text-xs">Abrindo mensagem…</p> : null}
    {error ? <div className="space-y-2 text-xs"><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="font-semibold underline">Tentar novamente</button></div> : null}
    {item && referencedMessageChanged(item.revision, expectedRevision) ? <p role="status" className="mb-2 text-xs text-amber-700">Esta mensagem foi atualizada após o registro no CRM. Confira o conteúdo atual antes de usar a informação.</p> : null}
    {item ? renderMessage(item) : null}
  </section>;
}
