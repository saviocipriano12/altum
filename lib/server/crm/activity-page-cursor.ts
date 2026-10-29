import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class ActivityPageError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export type ActivityPageCursor = {
  version: 1; scope: string; startedAt: number; expiresAt: number;
  after: [number, number, string]; reviewSeen: boolean;
};
const purpose = Buffer.from("altum:crm:activity-page:1");
function key() {
  const value = process.env.CRM_ACTIVITY_CURSOR_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new ActivityPageError(503, "activity_paging_unavailable", "A consulta paginada ainda não está disponível.");
  return Buffer.from(value, "hex");
}
export const activityPageScope = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function encodeActivityPageCursor(value: ActivityPageCursor) {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(purpose);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function decodeActivityPageCursor(token: string, scope: string, now = Date.now()): ActivityPageCursor {
  const secret = key();
  try {
    if (token.length < 40 || token.length > 2048 || !/^[a-zA-Z0-9_-]+$/.test(token)) throw Error();
    const bytes = Buffer.from(token, "base64url");
    if (bytes.toString("base64url") !== token) throw Error();
    const decipher = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
    decipher.setAAD(purpose); decipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
    if (value.version !== 1 || value.scope !== scope || !Number.isSafeInteger(value.startedAt) ||
      !Number.isSafeInteger(value.expiresAt) || value.startedAt > now || value.expiresAt <= now ||
      value.expiresAt - value.startedAt !== 600000 || typeof value.reviewSeen !== "boolean" ||
      !Array.isArray(value.after) || value.after.length !== 3 || ![0, 1].includes(value.after[0]) ||
      !Number.isSafeInteger(value.after[1]) || typeof value.after[2] !== "string" || !value.after[2] ||
      value.after[2].length > 300 || value.after[2].includes("/")) throw Error();
    return value as ActivityPageCursor;
  } catch { throw new ActivityPageError(400, "activity_cursor_invalid", "Esta consulta expirou ou mudou. Atualize os retornos para continuar."); }
}
export function assertActivityPageKey() { key(); }
