export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type InboxDraft = {
  version: 1;
  text: string;
  updatedAt: number;
  attempt?: { id: string; text: string; replyToId: string | null; channelId?: string | null };
};
export const INBOX_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inboxDraftKey(tenantId: string, userId: string, conversationId: string) {
  return `altum:inbox-draft:v1:${[tenantId, userId, conversationId].map(encodeURIComponent).join(":")}`;
}

/** Local drafts never enqueue or resend a message automatically. */
export class InboxDraftStore {
  private memory = new Map<string, InboxDraft>();
  constructor(private storage: DraftStorage, private now = () => Date.now()) {}

  read(key: string): InboxDraft {
    const cached = this.memory.get(key);
    if (cached && this.now() - cached.updatedAt < INBOX_DRAFT_TTL_MS) return cached;
    this.memory.delete(key);
    try {
      const data = JSON.parse(this.storage.getItem(key) || "null") as InboxDraft | null;
      if (data?.version === 1 && typeof data.text === "string" && Number.isFinite(data.updatedAt)
        && data.updatedAt <= this.now() && this.now() - data.updatedAt < INBOX_DRAFT_TTL_MS
        && (!data.attempt || (typeof data.attempt.id === "string" && typeof data.attempt.text === "string"
          && (data.attempt.replyToId === null || typeof data.attempt.replyToId === "string")
          && (data.attempt.channelId === undefined || data.attempt.channelId === null || typeof data.attempt.channelId === "string")))) {
        this.memory.set(key, data);
        return data;
      }
      this.storage.removeItem(key);
    } catch { /* Restricted storage must not prevent composing a message. */ }
    return { version: 1, text: "", updatedAt: this.now() };
  }

  private save(key: string, draft: InboxDraft) {
    this.memory.set(key, draft);
    try {
      if (!draft.text && !draft.attempt) this.storage.removeItem(key);
      else this.storage.setItem(key, JSON.stringify(draft));
      return true;
    } catch { return false; }
  }

  setText(key: string, text: string) {
    const draft = { ...this.read(key), text, updatedAt: this.now() };
    return { draft, persisted: this.save(key, draft) };
  }

  beginAttempt(key: string, text: string, replyToId: string | null, createId: () => string, options?: { channelId: string | null }) {
    const draft = this.read(key);
    // After a reload, reuse the original reply target and request ID when the
    // same unacknowledged message is retried without selecting another reply.
    const previous = draft.attempt;
    const attempt = previous && previous.text === text && (!replyToId || previous.replyToId === replyToId)
      ? previous : { id: createId(), text, replyToId, ...(options ? { channelId: options.channelId } : {}) };
    const next = { ...draft, attempt, updatedAt: this.now() };
    return { attempt, persisted: this.save(key, next) };
  }

  acknowledge(key: string, attemptId: string) {
    const draft = this.read(key);
    if (draft.attempt?.id !== attemptId) return draft;
    const next: InboxDraft = { version: 1, updatedAt: this.now(),
      text: draft.text.trim() === draft.attempt.text ? "" : draft.text };
    this.save(key, next);
    return next;
  }

  completeLeadStart(key: string, targetKey: string, attemptId: string, sent: boolean) {
    const draft = this.read(key);
    if (draft.attempt?.id !== attemptId || key === targetKey) return { applied: false, moved: false, persisted: true };
    const remaining = sent ? this.acknowledge(key, attemptId) : draft;
    const target = this.read(targetKey);
    if (!remaining.text) return { applied: true, moved: true, persisted: true };
    // Never replace a draft (or uncertain send) already present in the destination.
    if (target.text && target.text !== remaining.text) return { applied: true, moved: false, persisted: true };
    const saved = this.setText(targetKey, remaining.text);
    if (!saved.persisted) return { applied: true, moved: false, persisted: false };
    const persisted = this.save(key, { version: 1, text: "", updatedAt: this.now() });
    return { applied: true, moved: true, persisted };
  }
}
