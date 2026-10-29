const id = (value: unknown, max = 180): value is string => typeof value === "string" && !!value && value.length <= max && !value.includes("/");
export const isConversationMessageId = (value: unknown): value is string => id(value, 300);
export function conversationSourceHref(chatId: unknown, messageId?: unknown, generation?: unknown, revision?: unknown) {
  if (!id(chatId)) return null;
  let href = `/cliente/painel/inbox?chatId=${encodeURIComponent(chatId)}`;
  if (isConversationMessageId(messageId)) {
    href += `&messageId=${encodeURIComponent(messageId)}`;
    if (typeof generation === "string" && /^\d{12}:\d{9}$/.test(generation)) href += `&messageGeneration=${encodeURIComponent(generation)}`;
    if (typeof revision === "string" && /^\d+:\d{1,9}$/.test(revision)) href += `&messageRevision=${encodeURIComponent(revision)}`;
  }
  return href;
}
export function referencedMessageChanged(actual?: string, expected?: string | null) {
  if (!expected) return false;
  const normalize = (value?: string | null) => value && /^\d+:\d{1,9}$/.test(value) ? value.split(":").map(part => String(Number(part))).join(":") : null;
  return !normalize(expected) || normalize(actual) !== normalize(expected);
}
export function selectReferencedMessage<T extends { id: string; generation?: string }>(payload: { items?: T[] }, messageId: string, generation?: string | null): T {
  if (!isConversationMessageId(messageId) || !Array.isArray(payload.items) || payload.items.length !== 1 || payload.items[0]?.id !== messageId)
    throw new Error("A mensagem não está disponível nesta conversa.");
  const item = payload.items[0];
  if (generation && (!/^\d{12}:\d{9}$/.test(generation) || item.generation !== generation))
    throw new Error("A mensagem original foi substituída. Confira a conversa antes de usar este registro.");
  return item;
}
