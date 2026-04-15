import webpush from "web-push";

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type SendPushResult = {
  ok: boolean;
  statusCode?: number;
  error?: string;
};

type SendPushInput = {
  subscription: BrowserPushSubscription;
  payload: Record<string, unknown>;
  ttl?: number;
};

let vapidConfigured = false;

function readVapidConfig() {
  const publicKey = String(process.env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const subject =
    String(process.env.WEB_PUSH_SUBJECT || "").trim() ||
    "mailto:suporte.altum@gmail.com";

  return {
    publicKey,
    privateKey,
    subject,
    enabled: Boolean(publicKey && privateKey),
  };
}

function ensureVapidConfigured() {
  const config = readVapidConfig();
  if (!config.enabled) return config;

  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }

  return config;
}

export function getWebPushPublicKey() {
  const config = readVapidConfig();
  return config.publicKey || null;
}

export function isWebPushEnabled() {
  return readVapidConfig().enabled;
}

export function normalizeBrowserPushSubscription(
  value: unknown
): BrowserPushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const endpoint = String(raw.endpoint || "").trim();
  const keysRaw =
    raw.keys && typeof raw.keys === "object"
      ? (raw.keys as Record<string, unknown>)
      : {};
  const p256dh = String(keysRaw.p256dh || "").trim();
  const auth = String(keysRaw.auth || "").trim();

  if (!endpoint || !p256dh || !auth) return null;

  const expirationTime =
    typeof raw.expirationTime === "number" || raw.expirationTime === null
      ? (raw.expirationTime as number | null)
      : null;

  return {
    endpoint,
    expirationTime,
    keys: {
      p256dh,
      auth,
    },
  };
}

function parsePushError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: "Erro desconhecido ao enviar push." };
  }

  const candidate = error as {
    statusCode?: number;
    message?: string;
    body?: string;
  };

  const message =
    candidate.message ||
    candidate.body ||
    "Falha ao enviar notificacao push.";

  return {
    statusCode: candidate.statusCode,
    message,
  };
}

export async function sendWebPushNotification({
  subscription,
  payload,
  ttl = 60,
}: SendPushInput): Promise<SendPushResult> {
  const config = ensureVapidConfigured();
  if (!config.enabled) {
    return {
      ok: false,
      error: "WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY nao configuradas.",
    };
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: Math.max(30, Math.round(ttl)),
      urgency: "high",
    });

    return { ok: true };
  } catch (error) {
    const parsed = parsePushError(error);
    return {
      ok: false,
      statusCode: parsed.statusCode,
      error: parsed.message,
    };
  }
}

