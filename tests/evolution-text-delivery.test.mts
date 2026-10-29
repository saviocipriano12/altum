import test from "node:test";
import assert from "node:assert/strict";
import type { WhatsAppChannelConfig } from "../app/lib/server/whatsapp-channel.ts";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_PRIVATE_KEY: "", FIREBASE_CLIENT_EMAIL: "" });
const { EvolutionMessagingProvider } = await import("../lib/server/messaging/evolution-provider.ts");
const provider = new EvolutionMessagingProvider({ id: "qa-channel", tenantId: "qa-tenant", source: "tenant_channel",
  provider: "evolution", gatewayEndpoint: "https://evolution-qa.invalid", accessToken: "qa-fake", sessionId: "qa-instance" } as WhatsAppChannelConfig);
const input = { to: "5511000000001", text: "Mensagem ficticia de QA" };

async function exercise(first: () => Promise<Response>, run: (calls: unknown[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://evolution-qa.invalid/message/sendText/qa-instance");
    calls.push(JSON.parse(String(init?.body)));
    return calls.length === 1 ? first() : Response.json({ key: { id: "qa-accepted" } });
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}

for (const status of [400, 422]) test(`legacy payload allowed only after explicit schema rejection ${status}`, async () => {
  await exercise(async () => Response.json({ response: { message: ['instance requires property "textMessage"'] } }, { status }), async (calls) => {
    const result = await provider.sendText(input);
    assert.equal(result.externalMessageId, "qa-accepted");
    assert.deepEqual(calls, [{ number: input.to, text: input.text }, { number: input.to, textMessage: { text: input.text } }]);
  });
});

for (const status of [401, 403, 408, 429, 500, 502, 504]) test(`HTTP ${status} never triggers a second text send`, async () => {
  await exercise(async () => Response.json({ message: 'textMessage required: validation failed' }, { status }), async (calls) => {
    await assert.rejects(provider.sendText(input));
    assert.equal(calls.length, 1);
  });
});

for (const message of ["text validation HTTP 400 timeout", "422 network textMessage required", "fetch failed"]) test(`network failure is not schema rejection: ${message}`, async () => {
  await exercise(async () => { throw new Error(message); }, async (calls) => {
    await assert.rejects(provider.sendText(input)); assert.equal(calls.length, 1);
  });
});

for (const body of [{ message: "invalid number text" }, { message: "textMessage delivery pending" },
  { message: "textMessage required", key: { id: "qa-possibly-accepted" } }, {}]) test(`ambiguous 400 does not resend: ${JSON.stringify(body)}`, async () => {
  await exercise(async () => Response.json(body, { status: 400 }), async (calls) => {
    await assert.rejects(provider.sendText(input)); assert.equal(calls.length, 1);
  });
});

test("successful response without ID is not converted into another send", async () => {
  await exercise(async () => Response.json({ status: "pending" }), async (calls) => {
    assert.equal((await provider.sendText(input)).externalMessageId, null); assert.equal(calls.length, 1);
  });
});

test("a failed legacy attempt is never followed by a third payload", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ message: "textMessage required" }, { status: 422 }); };
  try { await assert.rejects(provider.sendText(input)); assert.equal(calls, 2); }
  finally { globalThis.fetch = original; }
});
