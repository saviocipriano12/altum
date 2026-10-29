/** Recovery must merge an existing history, but an empty view needs page metadata. */
export function shouldLoadInboxIncrementally(messageCount: number, newestCursor: string | null, requested?: boolean) {
  return requested !== false && messageCount > 0 && Boolean(newestCursor);
}

/** One load per selected scope; a new scope may supersede a slow old request. */
export class InboxLoadGate {
  private sequence = 0;
  private active: { tenantId: string; chatId: string; token: number } | null = null;
  begin(tenantId: string, chatId: string) {
    if (this.active?.tenantId === tenantId && this.active.chatId === chatId) return null;
    const token = ++this.sequence;
    this.active = { tenantId, chatId, token };
    return token;
  }
  finish(token: number) {
    if (this.active?.token === token) this.active = null;
  }
  invalidate() {
    this.active = null;
  }
}
