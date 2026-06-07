import crypto from "crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";

export const AGENCY_TENANT_ID = "ALTUM_AGENCY";
export const AGENCY_WHATSAPP_ENV_CHANNEL_ID = "agency_env_default";
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

type ChannelDoc = {
  tenantId?: string;
  type?: string;
  provider?: string;
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  status?: string;
  displayName?: string;
  phoneNumber?: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppChannelConfig = {
  id: string;
  tenantId: string;
  source: "tenant_channel" | "agency_env";
  provider: string;
  displayName?: string;
  phoneNumber?: string;
  phoneNumberId: string;
  accessToken: string;
  verifyToken?: string;
  appSecret?: string;
  gatewayEndpoint?: string;
  sessionStatusEndpoint?: string;
  qrCodeEndpoint?: string;
  callEndpoint?: string;
  sessionId?: string;
};

export type WhatsAppTemplateSeed = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  body: string;
};

export type WhatsAppTemplateHeaderMedia = {
  type: "image" | "video" | "document";
  link?: string;
  id?: string;
  filename?: string;
};

export type WhatsAppMessageTemplate = {
  id?: string | null;
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<Record<string, unknown>>;
};

const DEFAULT_WHATSAPP_FOLLOW_UP_TEMPLATES: WhatsAppTemplateSeed[] = [
  {
    name: "follow_up_geral",
    language: "pt_BR",
    category: "UTILITY",
    body:
      "Oi! Passando para retomar seu atendimento. Se ainda fizer sentido, me responda por aqui e seguimos de onde paramos.",
  },
  {
    name: "retomar_contato",
    language: "pt_BR",
    category: "UTILITY",
    body:
      "Oi! Vi que nossa conversa ficou em aberto. Quando voce puder, me responda para continuarmos seu atendimento.",
  },
];

function clean(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeProvider(value: unknown) {
  const normalized = clean(value, 80).toLowerCase();
  if (
    normalized === "meta_whatsapp" ||
    normalized === "whatsapp_cloud_api" ||
    normalized === "whatsapp_business_cloud_api"
  ) {
    return "meta_whatsapp";
  }
  if (
    normalized === "whatsapp_qr" ||
    normalized === "whatsapp_session" ||
    normalized === "whatsapp_gateway" ||
    normalized === "external_whatsapp"
  ) {
    return normalized;
  }
  return normalized || "meta_whatsapp";
}

function getGatewayEndpoint(metadata?: Record<string, unknown>) {
  if (!metadata || typeof metadata !== "object") return "";
  return (
    clean(metadata.gatewayEndpoint, 500) ||
    clean(metadata.endpointUrl, 500) ||
    clean(metadata.apiBaseUrl, 500) ||
    clean(metadata.webhookUrl, 500)
  );
}

function getMetadataEndpoint(metadata: Record<string, unknown> | undefined, keys: string[]) {
  if (!metadata || typeof metadata !== "object") return "";
  for (const key of keys) {
    const value = clean(metadata[key], 500);
    if (value) return value;
  }
  return "";
}

function getSessionId(metadata?: Record<string, unknown>) {
  return getMetadataEndpoint(metadata, ["sessionId", "instanceId", "connectionId", "deviceId"]);
}

export function isOfficialWhatsAppProvider(provider: string) {
  return normalizeProvider(provider) === "meta_whatsapp";
}

function normalizeChannelDoc(id: string, data: ChannelDoc): WhatsAppChannelConfig | null {
  const tenantId = String(data.tenantId || "").trim();
  const type = String(data.type || "").trim().toLowerCase();
  const status = String(data.status || "active").trim().toLowerCase();
  const phoneNumberId = String(data.phoneNumberId || "").trim();
  const accessToken = decryptSecret(data.accessToken);
  const provider = normalizeProvider(data.provider);
  const gatewayEndpoint = getGatewayEndpoint(data.metadata);
  const sessionStatusEndpoint = getMetadataEndpoint(data.metadata, [
    "sessionStatusEndpoint",
    "statusEndpoint",
    "healthEndpoint",
  ]);
  const qrCodeEndpoint = getMetadataEndpoint(data.metadata, [
    "qrCodeEndpoint",
    "qrEndpoint",
    "connectEndpoint",
  ]);
  const callEndpoint = getMetadataEndpoint(data.metadata, [
    "callEndpoint",
    "voiceEndpoint",
    "clickToCallEndpoint",
  ]);
  const sessionId = getSessionId(data.metadata);

  if (!tenantId || type !== "whatsapp" || status !== "active") return null;
  if (isOfficialWhatsAppProvider(provider) && (!phoneNumberId || !accessToken)) return null;
  if (!isOfficialWhatsAppProvider(provider) && (!gatewayEndpoint || !accessToken)) return null;

  return {
    id,
    tenantId,
    source: "tenant_channel",
    provider,
    displayName: String(data.displayName || "WhatsApp"),
    phoneNumber: String(data.phoneNumber || ""),
    phoneNumberId: phoneNumberId || id,
    accessToken,
    verifyToken: String(data.verifyToken || "") || undefined,
    appSecret: decryptSecret(data.appSecret) || undefined,
    gatewayEndpoint: gatewayEndpoint || undefined,
    sessionStatusEndpoint: sessionStatusEndpoint || undefined,
    qrCodeEndpoint: qrCodeEndpoint || undefined,
    callEndpoint: callEndpoint || undefined,
    sessionId: sessionId || undefined,
  };
}

function getAgencyChannelFromEnv(): WhatsAppChannelConfig | null {
  const phoneNumberId = String(process.env.META_PHONE_ID || "").trim();
  const accessToken = String(process.env.META_WA_TOKEN || "").trim();

  if (!phoneNumberId || !accessToken) return null;

  return {
    id: AGENCY_WHATSAPP_ENV_CHANNEL_ID,
    tenantId: AGENCY_TENANT_ID,
    source: "agency_env",
    provider: "meta_whatsapp",
    displayName: "ALTUM Agency WhatsApp",
    phoneNumberId,
    accessToken,
    verifyToken: String(process.env.META_VERIFY_TOKEN || "").trim() || undefined,
    appSecret: String(process.env.META_APP_SECRET || "").trim() || undefined,
  } satisfies WhatsAppChannelConfig;
}

export function getAgencyWhatsAppChannelFromEnv() {
  return getAgencyChannelFromEnv();
}

export async function getWhatsAppChannelByPhoneNumberId(phoneNumberId: string) {
  const normalized = phoneNumberId.trim();
  if (!normalized) return null;

  const snap = await adminDb
    .collection("tenant_channels")
    .where("phoneNumberId", "==", normalized)
    .limit(5)
    .get();

  const firstActive = snap.docs
    .map((doc) => normalizeChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item) => Boolean(item));

  if (firstActive) return firstActive;

  const agency = getAgencyChannelFromEnv();
  if (agency && agency.phoneNumberId === normalized) return agency;

  return null;
}

export async function getWhatsAppChannelById(channelId: string) {
  const normalized = channelId.trim();
  if (!normalized) return null;

  const snap = await adminDb.collection("tenant_channels").doc(normalized).get();
  if (!snap.exists) return null;

  return normalizeChannelDoc(snap.id, snap.data() as ChannelDoc);
}

export async function getWhatsAppChannelForTenant(
  tenantId: string,
  options?: { allowAgencyFallback?: boolean; channelId?: string | null; phoneNumberId?: string | null }
) {
  const normalizedTenantId = tenantId.trim();
  const allowAgencyFallback = options?.allowAgencyFallback === true;
  const requestedChannelId = clean(options?.channelId, 180);
  const requestedPhoneNumberId = clean(options?.phoneNumberId, 180);

  if (!normalizedTenantId) {
    return allowAgencyFallback ? getAgencyChannelFromEnv() : null;
  }

  if (normalizedTenantId === AGENCY_TENANT_ID) {
    return getAgencyChannelFromEnv();
  }

  if (requestedChannelId === AGENCY_WHATSAPP_ENV_CHANNEL_ID && allowAgencyFallback) {
    return getAgencyChannelFromEnv();
  }

  if (requestedChannelId) {
    const channelSnap = await adminDb.collection("tenant_channels").doc(requestedChannelId).get();
    if (channelSnap.exists) {
      const parsed = normalizeChannelDoc(channelSnap.id, channelSnap.data() as ChannelDoc);
      if (parsed && parsed.tenantId === normalizedTenantId) return parsed;
    }
  }

  if (requestedPhoneNumberId) {
    const channel = await getWhatsAppChannelByPhoneNumberId(requestedPhoneNumberId);
    if (channel && channel.tenantId === normalizedTenantId) return channel;
  }

  const settingsSnap = await adminDb.collection("tenant_settings").doc(normalizedTenantId).get();
  const defaultChannelId = settingsSnap.exists
    ? String((settingsSnap.data() as { defaultWhatsAppChannelId?: string }).defaultWhatsAppChannelId || "").trim()
    : "";

  if (defaultChannelId) {
    const defaultChannelSnap = await adminDb.collection("tenant_channels").doc(defaultChannelId).get();
    if (defaultChannelSnap.exists) {
      const parsed = normalizeChannelDoc(
        defaultChannelSnap.id,
        defaultChannelSnap.data() as ChannelDoc
      );
      if (parsed && parsed.tenantId === normalizedTenantId) {
        return parsed;
      }
    }
  }

  const snap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", normalizedTenantId)
    .limit(20)
    .get();

  const firstActive = snap.docs
    .map((doc) => normalizeChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item) => Boolean(item));

  if (firstActive) return firstActive;
  if (allowAgencyFallback) return getAgencyChannelFromEnv();
  return null;
}

export async function getWhatsAppChannelByVerifyToken(verifyToken: string) {
  const normalized = verifyToken.trim();
  if (!normalized) return null;

  const snap = await adminDb
    .collection("tenant_channels")
    .where("verifyToken", "==", normalized)
    .limit(5)
    .get();

  const firstActive = snap.docs
    .map((doc) => normalizeChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item) => Boolean(item));

  if (firstActive) return firstActive;

  const agency = getAgencyChannelFromEnv();
  if (agency?.verifyToken === normalized) return agency;

  return null;
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
) {
  const secret = String(appSecret || "").trim();
  if (!secret) return false;
  if (!signatureHeader) return false;

  const [algorithm, signature] = signatureHeader.split("=", 2);
  if (!signature) return false;
  const normalizedAlgorithm = algorithm.toLowerCase();
  const hmacAlgorithm =
    normalizedAlgorithm === "sha256"
      ? "sha256"
      : normalizedAlgorithm === "sha1"
        ? "sha1"
        : "";
  if (!hmacAlgorithm) return false;
  const expected = crypto
    .createHmac(hmacAlgorithm, secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function sendMetaTextMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  text: string;
}) {
  if (!isOfficialWhatsAppProvider(input.channel.provider)) {
    return sendExternalWhatsAppMessage({
      channel: input.channel,
      to: input.to,
      payload: { type: "text", text: input.text },
    });
  }

  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: { body: input.text },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errMessage = payload?.error?.message || "Erro na API da Meta.";
    throw new Error(errMessage);
  }

  return payload;
}

export async function callWhatsAppGateway(input: {
  channel: WhatsAppChannelConfig;
  endpoint: string;
  payload?: Record<string, unknown>;
  method?: "GET" | "POST";
}) {
  const endpoint = clean(input.endpoint, 500);
  if (!endpoint) {
    throw new Error("Endpoint do gateway nao configurado.");
  }

  const method = input.method || "POST";
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${input.channel.accessToken}`,
      "Content-Type": "application/json",
    },
    ...(method === "POST"
      ? {
          body: JSON.stringify({
            tenantId: input.channel.tenantId,
            channelId: input.channel.id,
            provider: input.channel.provider,
            sessionId: input.channel.sessionId || input.channel.id,
            ...(input.payload || {}),
          }),
        }
      : {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (payload as { error?: string; message?: string })?.error ||
      (payload as { error?: string; message?: string })?.message ||
      `Gateway retornou HTTP ${response.status}.`;
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

export async function sendMetaTemplateMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerMedia?: WhatsAppTemplateHeaderMedia | null;
}) {
  if (!isOfficialWhatsAppProvider(input.channel.provider)) {
    return sendExternalWhatsAppMessage({
      channel: input.channel,
      to: input.to,
      payload: {
        type: "template",
        templateName: input.templateName,
        languageCode: input.languageCode || "pt_BR",
        bodyParams: input.bodyParams || [],
        headerMedia: input.headerMedia || null,
      },
    });
  }

  const bodyParams = (input.bodyParams || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  const headerMedia = input.headerMedia;
  const components: Array<Record<string, unknown>> = [];

  if (headerMedia?.type && (headerMedia.link || headerMedia.id)) {
    const mediaPayload =
      headerMedia.type === "document"
        ? {
            ...(headerMedia.id ? { id: headerMedia.id } : { link: headerMedia.link }),
            ...(headerMedia.filename ? { filename: headerMedia.filename } : {}),
          }
        : headerMedia.id
          ? { id: headerMedia.id }
          : { link: headerMedia.link };

    components.push({
      type: "header",
      parameters: [
        {
          type: headerMedia.type,
          [headerMedia.type]: mediaPayload,
        },
      ],
    });
  }

  if (bodyParams.length) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode || "pt_BR" },
          ...(components.length ? { components } : {}),
        },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errMessage = payload?.error?.message || "Erro na API da Meta.";
    throw new Error(errMessage);
  }

  return payload;
}

async function sendExternalWhatsAppMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  payload: Record<string, unknown>;
}) {
  const endpoint = clean(input.channel.gatewayEndpoint, 500);
  if (!endpoint) {
    throw new Error("Canal WhatsApp flexivel sem endpoint de gateway configurado.");
  }

  return callWhatsAppGateway({
    channel: input.channel,
    endpoint,
    payload: {
      to: input.to,
      ...input.payload,
    },
  });
}

async function resolveWhatsAppBusinessAccountId(channel: WhatsAppChannelConfig) {
  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${channel.phoneNumberId}?fields=whatsapp_business_account`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${channel.accessToken}`,
      },
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    whatsapp_business_account?: { id?: string };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Falha ao obter WABA do numero WhatsApp.");
  }

  const wabaId = String(payload.whatsapp_business_account?.id || "").trim();
  if (!wabaId) {
    throw new Error("Nao foi possivel identificar o WhatsApp Business Account do numero.");
  }
  return wabaId;
}

async function listMetaMessageTemplates(channel: WhatsAppChannelConfig, wabaId: string) {
  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${wabaId}/message_templates?fields=id,name,status,language,category,components&limit=200`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${channel.accessToken}`,
      },
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      language?: string;
      category?: string;
      components?: Array<Record<string, unknown>>;
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Falha ao listar templates do WABA.");
  }

  return (payload.data || []).map((item) => ({
    id: String(item.id || "").trim() || null,
    name: String(item.name || "").trim().toLowerCase(),
    language: String(item.language || "").trim(),
    status: String(item.status || "").trim().toLowerCase(),
    category: String(item.category || "").trim().toUpperCase(),
    components: Array.isArray(item.components) ? item.components : [],
  })) satisfies WhatsAppMessageTemplate[];
}

export async function listWhatsAppMessageTemplates(channel: WhatsAppChannelConfig) {
  const wabaId = await resolveWhatsAppBusinessAccountId(channel);
  const templates = await listMetaMessageTemplates(channel, wabaId);
  return { wabaId, templates };
}

async function createMetaMessageTemplate(
  channel: WhatsAppChannelConfig,
  wabaId: string,
  template: WhatsAppTemplateSeed
) {
  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: template.name,
        language: template.language,
        category: template.category,
        components: [{ type: "BODY", text: template.body }],
      }),
    }
  );

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `Falha ao criar template ${template.name}.`);
  }

  return {
    id: String(payload.id || "").trim() || null,
  };
}

export async function ensureDefaultWhatsAppFollowUpTemplates(channel: WhatsAppChannelConfig) {
  const wabaId = await resolveWhatsAppBusinessAccountId(channel);
  const existing = await listMetaMessageTemplates(channel, wabaId);
  const created: string[] = [];
  const alreadyPresent: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const template of DEFAULT_WHATSAPP_FOLLOW_UP_TEMPLATES) {
    const keyName = template.name.trim().toLowerCase();
    const keyLanguage = template.language.trim();
    const match = existing.find((item) => item.name === keyName && item.language === keyLanguage);
    if (match) {
      alreadyPresent.push(template.name);
      continue;
    }

    try {
      await createMetaMessageTemplate(channel, wabaId, template);
      created.push(template.name);
    } catch (error) {
      failed.push({
        name: template.name,
        error: error instanceof Error ? error.message : "template_seed_failed",
      });
    }
  }

  return {
    wabaId,
    created,
    alreadyPresent,
    failed,
  };
}

export async function uploadWhatsAppMedia(input: {
  channel: WhatsAppChannelConfig;
  buffer: Buffer;
  filename: string;
  contentType: string;
}) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", input.contentType);
  form.append(
    "file",
    new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
    input.filename
  );

  const response = await fetch(`https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.channel.accessToken}`,
    },
    body: form,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `whatsapp_media_upload_http_${response.status}`);
  }

  return {
    mediaId: String(payload.id || "").trim(),
  };
}

export async function sendMetaAudioMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  mediaId: string;
  voice?: boolean;
}) {
  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "audio",
        audio: {
          id: input.mediaId,
          ...(input.voice === true ? { voice: true } : {}),
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMessage =
      (payload as { error?: { message?: string } })?.error?.message || "Erro na API da Meta ao enviar audio.";
    throw new Error(errMessage);
  }

  return payload;
}

export async function sendMetaMediaIdMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  mediaId: string;
  mediaType: "image" | "video" | "document";
  caption?: string;
  filename?: string;
}) {
  const payloadKey = input.mediaType;
  const mediaPayload =
    input.mediaType === "document"
      ? {
          id: input.mediaId,
          ...(input.caption ? { caption: input.caption } : {}),
          ...(input.filename ? { filename: input.filename } : {}),
        }
      : {
          id: input.mediaId,
          ...(input.caption ? { caption: input.caption } : {}),
        };

  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: input.mediaType,
        [payloadKey]: mediaPayload,
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMessage =
      (payload as { error?: { message?: string } })?.error?.message || "Erro na API da Meta ao enviar midia.";
    throw new Error(errMessage);
  }

  return payload;
}

export async function sendMetaMediaLinkMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "document";
  caption?: string;
  filename?: string;
}) {
  if (!isOfficialWhatsAppProvider(input.channel.provider)) {
    return sendExternalWhatsAppMessage({
      channel: input.channel,
      to: input.to,
      payload: {
        type: input.mediaType,
        mediaUrl: input.mediaUrl,
        caption: input.caption || "",
        filename: input.filename || "",
      },
    });
  }

  const payloadKey = input.mediaType;
  const mediaPayload =
    input.mediaType === "document"
      ? {
          link: input.mediaUrl,
          caption: input.caption,
          filename: input.filename || "material.pdf",
        }
      : {
          link: input.mediaUrl,
          caption: input.caption,
        };

  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: input.mediaType,
        [payloadKey]: mediaPayload,
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMessage =
      (payload as { error?: { message?: string } })?.error?.message || "Erro na API da Meta ao enviar midia.";
    throw new Error(errMessage);
  }

  return payload;
}

export async function fetchWhatsAppMediaMetadata(input: {
  channel: WhatsAppChannelConfig;
  mediaId: string;
}) {
  const mediaId = input.mediaId.trim();
  if (!mediaId) {
    throw new Error("whatsapp_media_id_missing");
  }

  const response = await fetch(`https://graph.facebook.com/${VERSION}/${mediaId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.channel.accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    url?: string;
    mime_type?: string;
    sha256?: string;
    file_size?: number;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `whatsapp_media_metadata_http_${response.status}`);
  }

  return {
    url: String(payload.url || "").trim(),
    mimeType: String(payload.mime_type || "").trim() || "application/octet-stream",
    sha256: String(payload.sha256 || "").trim() || null,
    fileSize: typeof payload.file_size === "number" ? payload.file_size : null,
  };
}

export async function downloadWhatsAppMedia(input: {
  channel: WhatsAppChannelConfig;
  mediaId: string;
}) {
  const meta = await fetchWhatsAppMediaMetadata(input);
  if (!meta.url) {
    throw new Error("whatsapp_media_url_missing");
  }

  const response = await fetch(meta.url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.channel.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`whatsapp_media_download_http_${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || meta.mimeType || "application/octet-stream",
    url: meta.url,
    mimeType: meta.mimeType,
    fileSize: meta.fileSize,
    sha256: meta.sha256,
  };
}

export function extractWebhookPhoneNumberId(body: Record<string, unknown>) {
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown[] }).changes : null;
  const firstChange = Array.isArray(changes) ? changes[0] : null;
  const value = firstChange && typeof firstChange === "object" ? (firstChange as { value?: Record<string, unknown> }).value : null;

  const metaId = value && value.metadata && typeof value.metadata === "object"
    ? String((value.metadata as { phone_number_id?: unknown }).phone_number_id || "").trim()
    : "";

  if (metaId) return metaId;

  const statuses = value && Array.isArray(value.statuses) ? value.statuses : [];
  const firstStatus = statuses[0] && typeof statuses[0] === "object" ? (statuses[0] as Record<string, unknown>) : null;
  return String(firstStatus?.phone_number_id || "").trim() || null;
}
