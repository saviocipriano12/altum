/** A participant's push name is never the group's name. */
export function isGenericWhatsAppGroupName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return !name || /^(?:grupo\s*[·•-]\s*)?(?:grupo(?: do whatsapp)?|\d+(?:@g\.us)?)$/i.test(name);
}

export function whatsAppConversationName(chat: { isGroup?: boolean; groupName?: string; contactName?: string; contactPhone?: string }) {
  if (chat.isGroup) {
    return [chat.groupName, chat.contactName].find((name) => !isGenericWhatsAppGroupName(name)) || "Grupo do WhatsApp";
  }
  return chat.contactName || chat.contactPhone || "Contato sem nome";
}
