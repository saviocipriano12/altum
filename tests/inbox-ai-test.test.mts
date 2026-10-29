import test from "node:test";
import assert from "node:assert/strict";
import { startInboxAiTest } from "../lib/inbox-ai-test.ts";

const tenantId = "tenant-alpha";
const chatId = "whatsapp-alpha-123";
const ai = { enabled: true, responsePaused: false, testOnly: true, testChatIds: [chatId], rolloutMode: "automatic", rolloutPercent: 100 };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("persists exclusive tenant scope before resuming just the chosen conversation", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  await startInboxAiTest({ tenantId, chatId, request: async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return calls.length === 1 ? reply({ ai }) : reply({ ok: true });
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `/api/tenant/${tenantId}/settings/ai`);
  assert.deepEqual(calls[0].body.testChatIds, [chatId]);
  assert.equal(calls[0].body.testOnly, true);
  assert.equal(calls[1].url, `/api/tenant/${tenantId}/chats/${chatId}/ai-state`);
  assert.deepEqual(calls[1].body, { action: "resume" });
});

for (const status of [400, 403, 409, 500]) {
  test(`settings rejection ${status} never resumes a conversation or bypasses quality gate`, async () => {
    let calls = 0;
    await assert.rejects(startInboxAiTest({ tenantId, chatId, request: async () => {
      calls++; return reply({ error: "bloqueado" }, status);
    } }), /bloqueado/);
    assert.equal(calls, 1);
  });
}

for (const savedAi of [{ ...ai, testOnly: false }, { ...ai, testChatIds: [chatId, "other"] },
  { ...ai, testChatIds: ["other"] }, { ...ai, rolloutPercent: 0 }, { ...ai, responsePaused: true }]) {
  test(`unconfirmed restriction never resumes: ${JSON.stringify(savedAi)}`, async () => {
    let calls = 0;
    await assert.rejects(startInboxAiTest({ tenantId, chatId, request: async () => {
      calls++; return reply({ ai: savedAi });
    } }), /confirmar/);
    assert.equal(calls, 1);
  });
}

test("resume failure retains restriction and never compensates by releasing all chats", async () => {
  const calls: string[] = [];
  await assert.rejects(startInboxAiTest({ tenantId, chatId, request: async (url) => {
    calls.push(url);
    return calls.length === 1 ? reply({ ai }) : reply({ error: "pausa mantida" }, 403);
  } }), /pausa mantida/);
  assert.equal(calls.length, 2);
});

test("uncertain settings response never resumes or retries writes automatically", async () => {
  let calls = 0;
  await assert.rejects(startInboxAiTest({ tenantId, chatId, request: async () => {
    calls++; throw new Error("network lost");
  } }), /network lost/);
  assert.equal(calls, 1);
});

test("invalid identifiers perform no writes", async () => {
  await assert.rejects(startInboxAiTest({ tenantId, chatId: "../other", request: async () => {
    assert.fail("unexpected request");
  } }), /valida/);
});
