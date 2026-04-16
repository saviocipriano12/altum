import crypto from "crypto";

const SECRET_PREFIX = "enc:v1:";
const IV_BYTES = 12;

function clean(value: unknown, max = 8000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function readKey() {
  const raw = clean(process.env.SECRET_ENCRYPTION_KEY, 4000);
  if (!raw) return null;

  const tryHex = /^[a-fA-F0-9]{64}$/.test(raw) ? Buffer.from(raw, "hex") : null;
  if (tryHex && tryHex.length === 32) return tryHex;

  try {
    const base64 = Buffer.from(raw, "base64");
    if (base64.length === 32) return base64;
  } catch {
    // ignore
  }

  return null;
}

function parsePayload(value: string) {
  const payload = value.slice(SECRET_PREFIX.length);
  const [ivB64, contentB64, tagB64] = payload.split(".");
  if (!ivB64 || !contentB64 || !tagB64) {
    throw new Error("secret_payload_invalid");
  }

  return {
    iv: Buffer.from(ivB64, "base64"),
    encrypted: Buffer.from(contentB64, "base64"),
    tag: Buffer.from(tagB64, "base64"),
  };
}

export function isEncryptedSecret(value: unknown) {
  const normalized = clean(value, 12000);
  return normalized.startsWith(SECRET_PREFIX);
}

export function hasStoredSecret(value: unknown) {
  const normalized = clean(value, 12000);
  return Boolean(normalized);
}

export function decryptSecret(value: unknown) {
  const normalized = clean(value, 12000);
  if (!normalized) return "";
  if (!isEncryptedSecret(normalized)) return normalized;

  const key = readKey();
  if (!key) {
    throw new Error("secret_encryption_key_missing");
  }

  const { iv, encrypted, tag } = parsePayload(normalized);
  if (iv.length !== IV_BYTES) {
    throw new Error("secret_iv_invalid");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8").trim();
}

export function encryptSecret(value: unknown) {
  const normalized = clean(value, 12000);
  if (!normalized) return "";
  if (isEncryptedSecret(normalized)) return normalized;

  const key = readKey();
  if (!key) {
    throw new Error("secret_encryption_key_missing");
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString("base64")}.${encrypted.toString("base64")}.${tag.toString("base64")}`;
}

export function maskStoredSecret(value: unknown) {
  const normalized = clean(value, 12000);
  if (!normalized) return "";
  if (isEncryptedSecret(normalized)) return "enc_v1_configured";
  if (normalized.length <= 8) return "*".repeat(normalized.length);
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}
