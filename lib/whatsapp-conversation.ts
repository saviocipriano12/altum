// Evolution/Baileys identifies group conversations by the complete @g.us JID.
export function isWhatsAppGroup(value: unknown) {
  return typeof value === "string" && /^[0-9]+(?:-[0-9]+)?@g\.us$/i.test(value.trim());
}
export function resolveWhatsAppRecipient(address: string | undefined, provider: string, normalizePhone: (value: string | undefined) => string) {
  if (isWhatsAppGroup(address)) {
    if (!["evolution", "evolution_api"].includes(provider.toLowerCase())) throw new Error("Este canal nao oferece envio para grupos pela Altum.");
    return address!.trim().toLowerCase();
  }
  return normalizePhone(address);
}
