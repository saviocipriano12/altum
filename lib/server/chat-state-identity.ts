/** Keep the existing Firestore key unchanged; this is not a schema migration.
 * Delivery and authorization need an ID without loading the conversation engine.
 */
export function getChatStateDocId(tenantId: string, chatId: string) {
  return `${tenantId.trim()}_${chatId.trim()}`;
}
