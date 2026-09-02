import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractExternalMessageId } from "../lib/server/messaging/result.ts";
import { parseEvolutionInbound, parseEvolutionWebhook } from "../lib/server/messaging/evolution-webhook.ts";
import { getManagedEvolutionConfig } from "../lib/server/messaging/evolution-config.ts";
import { buildEvolutionMediaRequest } from "../lib/server/messaging/evolution-media.ts";
import { readEvolutionQr } from "../lib/server/messaging/evolution-qr.ts";

test("loads the managed Evolution connection only when URL and key are present", () => {
  const previousUrl = process.env.EVOLUTION_API_URL;
  const previousKey = process.env.EVOLUTION_API_KEY;
  try {
    process.env.EVOLUTION_API_URL = " https://evolution.altumia.com.br/// ";
    process.env.EVOLUTION_API_KEY = " secret-key ";
    assert.deepEqual(getManagedEvolutionConfig(), {
      baseUrl: "https://evolution.altumia.com.br",
      apiKey: "secret-key",
    });

    delete process.env.EVOLUTION_API_KEY;
    assert.equal(getManagedEvolutionConfig(), null);
  } finally {
    if (previousUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = previousUrl;
    if (previousKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = previousKey;
  }
});

test("normalizes an inbound Evolution text event", () => {
  const inbound = parseEvolutionInbound({
    event: "messages.upsert",
    data: {
      key: { id: "3EB0123", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
      pushName: "Maria",
      message: { extendedTextMessage: { text: "Quero saber o prazo" } },
    },
  });

  assert.deepEqual(inbound && {
    kind: inbound.kind,
    from: inbound.from,
    text: inbound.text,
    contactName: inbound.contactName,
    messageId: inbound.messageId,
    messageType: inbound.messageType,
  }, {
    kind: "message",
    from: "5511999999999",
    text: "Quero saber o prazo",
    contactName: "Maria",
    messageId: "3EB0123",
    messageType: "text",
  });
});

test("normalizes Evolution media and delivery updates", () => {
  const media = parseEvolutionInbound({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "media-1", remoteJid: "5511888888888@s.whatsapp.net", fromMe: false },
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", base64: "YWJj" } },
    },
  });
  assert.equal(media?.messageType, "audio");
  assert.equal(media?.mediaBase64, "YWJj");
  assert.equal(media?.text, "[Audio recebido]");

  const delivery = parseEvolutionWebhook({
    event: "MESSAGES_UPDATE",
    data: { keyId: "out-1", remoteJid: "5511888888888@s.whatsapp.net", status: "READ" },
  });
  assert.deepEqual(delivery, {
    kind: "delivery",
    messageId: "out-1",
    status: "read",
    recipientId: "5511888888888",
    errorCode: "",
    errorMessage: "",
  });
});

test("normalizes wrapped Evolution media and resolves phone numbers behind LIDs", () => {
  const media = parseEvolutionInbound({
    event: "MESSAGES_UPSERT",
    sender: "5511777777777@s.whatsapp.net",
    data: {
      key: {
        id: "wrapped-media-1",
        remoteJid: "123456789012345@lid",
        remoteJidAlt: "5511777777777@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Cliente",
      message: {
        viewOnceMessageV2: {
          message: {
            imageMessage: {
              mimetype: "image/jpeg",
              caption: "Produto",
              base64: "YWJj",
            },
          },
        },
      },
    },
  });

  assert.equal(media?.from, "5511777777777");
  assert.equal(media?.messageType, "image");
  assert.equal(media?.text, "Produto");
  assert.equal(media?.mediaBase64, "YWJj");
});

test("ignores outbound and non-message Evolution events", () => {
  assert.equal(parseEvolutionInbound({ event: "connection.update", data: {} }), null);
  assert.equal(parseEvolutionInbound({
    event: "messages.upsert",
    data: { key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true }, message: { conversation: "Oi" } },
  }), null);
});

test("extracts message ids from Meta and Evolution payloads", () => {
  assert.equal(extractExternalMessageId({ messages: [{ id: "wamid.meta" }] }), "wamid.meta");
  assert.equal(extractExternalMessageId({ key: { id: "evolution-id" } }), "evolution-id");
});

test("keeps a complete Evolution QR image and normalizes raw PNG base64", () => {
  const rawPng = `iVBORw0KGgo${"A".repeat(30_000)}`;
  const normalized = readEvolutionQr({ base64: rawPng });
  assert.equal(normalized, `data:image/png;base64,${rawPng}`);
  assert.ok(normalized.length > 30_000);

  const dataUrl = `data:image/png;base64,${rawPng}`;
  assert.equal(readEvolutionQr({ qrcode: { base64: dataUrl } }), dataUrl);
});

test("Evolution profile photos are cached in Altum storage instead of relying only on expiring URLs", async () => {
  const providerSource = await readFile(
    new URL("../lib/server/messaging/evolution-provider.ts", import.meta.url),
    "utf8",
  );
  const webhookSource = await readFile(
    new URL("../app/api/webhooks/whatsapp/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(providerSource, /cacheEvolutionProfilePicture/);
  assert.match(providerSource, /redirect: "error"/);
  assert.match(providerSource, /MAX_PROFILE_IMAGE_BYTES/);
  assert.match(providerSource, /firebaseStorageDownloadTokens/);
  assert.match(webhookSource, /existingPhotoSource !== "whatsapp_profile_cached"/);
  assert.match(webhookSource, /const cachedPhotoUrl = await cacheEvolutionProfilePicture/);
  assert.match(webhookSource, /contactPhotoSource: cachedPhotoUrl \? "whatsapp_profile_cached" : "whatsapp_profile"/);
});

test("reuses an existing Evolution instance before requesting a new QR", async () => {
  const providerSource = await readFile(
    new URL("../lib/server/messaging/evolution-provider.ts", import.meta.url),
    "utf8",
  );

  assert.match(providerSource, /instance\/connectionState/);
  assert.match(providerSource, /error\.status === 403/);
  assert.match(providerSource, /webhookBase64:\s*false/);
});

test("sends Evolution buffers as raw base64 and preserves already normalized voice", async () => {
  const providerSource = await readFile(
    new URL("../lib/server/messaging/evolution-media.ts", import.meta.url),
    "utf8",
  );

  assert.match(providerSource, /input\.buffer!\.toString\("base64"\)/);
  assert.doesNotMatch(providerSource, /data:\$\{input\.contentType/);
  assert.match(providerSource, /encoding:\s*!String\(input\.contentType/);
});

test("builds Evolution 2.3 media requests accepted by the API validators", async () => {
  const image = buildEvolutionMediaRequest("seller-1", {
      to: "5511999999999",
      mediaType: "image",
      buffer: Buffer.from("abc"),
      filename: "produto.jpg",
      contentType: "image/jpeg",
      caption: "Produto",
  });
  const audio = buildEvolutionMediaRequest("seller-1", {
      to: "5511999999999",
      mediaType: "audio",
      buffer: Buffer.from("voice"),
      filename: "audio.webm",
      contentType: "audio/webm",
      voice: true,
  });

  assert.match(image.path, /\/message\/sendMedia\/seller-1$/);
  assert.equal(image.body.media, "YWJj");
  assert.equal("mediatype" in image.body ? image.body.mediatype : null, "image");
  assert.match(audio.path, /\/message\/sendWhatsAppAudio\/seller-1$/);
  assert.equal(audio.body.audio, "dm9pY2U=");
  assert.equal("encoding" in audio.body ? audio.body.encoding : null, true);

  const normalizedVoice = buildEvolutionMediaRequest("seller-1", {
    to: "5511999999999",
    mediaType: "audio",
    buffer: Buffer.from("voice"),
    filename: "audio.ogg",
    contentType: "audio/ogg; codecs=opus",
    voice: true,
  });
  assert.equal("encoding" in normalizedVoice.body ? normalizedVoice.body.encoding : null, false);
});

test("keeps the QR visible when the channel list refreshes", async () => {
  const channelsPageSource = await readFile(
    new URL("../app/cliente/painel/configuracoes/canais/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(channelsPageSource, /channelId:\s*selectedChannel\.id/);
  assert.match(channelsPageSource, /current\?\.channelId === selectedChannel\.id/);
});

test("removes undefined values before conversion payloads reach Firestore", async () => {
  const conversionsSource = await readFile(
    new URL("../lib/server/pixels/conversions.ts", import.meta.url),
    "utf8",
  );

  assert.match(conversionsSource, /function firestoreSafe/);
  assert.match(conversionsSource, /request:\s*firestoreSafe\(sent\.request\)/);
  assert.match(conversionsSource, /response:\s*firestoreSafe\(sent\.response\)/);
});
