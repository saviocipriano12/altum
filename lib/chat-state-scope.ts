export class ChatStateIdentityError extends Error {
  readonly code = "chat_state_identity_conflict";
  readonly status = 409;
  constructor() { super("O controle desta conversa precisa de revisao antes de continuar."); this.name = "ChatStateIdentityError"; }
}

export class ChatStateContextError extends Error {
  readonly code = "chat_state_context_changed";
  readonly status = 409;
  constructor() { super("Esta conversa mudou. Atualize antes de continuar."); this.name = "ChatStateContextError"; }
}

export function assertChatStateScope(row: Record<string, unknown> | undefined, tenantId: string, chatId: string) {
  if (row && (row.tenantId !== tenantId || row.chatId !== chatId)) throw new ChatStateIdentityError();
}
