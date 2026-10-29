function clean(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 180) : ""; }

/** Group identity is the conversation JID, never the participant's telephone. */
export function readGatewayWhatsAppGroup(body: Record<string, unknown>) {
  const groupJid = [body.groupJid, body.from, body.contactPhone, body.phone, body.to]
    .map(clean).find((value) => /@g\.us$/i.test(value)) || "";
  return {
    isGroup: Boolean(groupJid) || body.isGroup === true || body.conversationType === "group",
    groupJid,
    groupName: clean(body.groupName || body.groupSubject),
    participantJid: clean(body.participantJid),
    participantName: clean(body.participantName),
  };
}
