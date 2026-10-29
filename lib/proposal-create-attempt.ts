type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function storageKey(tenantId: string, userId: string) {
  if (!tenantId || !userId) throw new Error("Conta da proposta nao identificada.");
  return `altum:proposal-create:v1:${JSON.stringify([tenantId, userId])}`;
}
/** Keep only an opaque intent, never customer data, notes or credentials.
 * A failed/unknown response must not release this key. No automatic expiry. */
export function getProposalCreateAttempt(storage: AttemptStorage, tenantId: string, userId: string, makeId: () => string = () => crypto.randomUUID()) {
  const key = storageKey(tenantId, userId), stored = storage.getItem(key);
  if (stored !== null) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(stored)) throw new Error("Tentativa anterior precisa de revisao antes de criar outra proposta.");
    return stored;
  }
  const requestId = makeId();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) throw new Error("Identificador de proposta invalido.");
  storage.setItem(key, requestId);
  if (storage.getItem(key) !== requestId) throw new Error("Nao foi possivel proteger a criacao. Verifique o armazenamento do navegador.");
  return requestId;
}
export function completeProposalCreateAttempt(storage: AttemptStorage, tenantId: string, userId: string, requestId: string) {
  const key = storageKey(tenantId, userId);
  if (storage.getItem(key) === requestId) storage.removeItem(key);
}
