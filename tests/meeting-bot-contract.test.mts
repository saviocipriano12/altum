import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { downloadMeetingRecording, findMeetingRecording, startMeetingBot } from "../lib/server/meetings/bot-provider.ts";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.ALTUM_MEETING_BOT_API_URL;
const originalKey = process.env.ALTUM_MEETING_BOT_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.ALTUM_MEETING_BOT_API_URL; else process.env.ALTUM_MEETING_BOT_API_URL = originalUrl;
  if (originalKey === undefined) delete process.env.ALTUM_MEETING_BOT_API_KEY; else process.env.ALTUM_MEETING_BOT_API_KEY = originalKey;
});
function provider() {
  process.env.ALTUM_MEETING_BOT_API_URL = "https://meeting.example.test";
  process.env.ALTUM_MEETING_BOT_API_KEY = "fake-test-key";
}

test("Vexa recording filter uses api.v1 meeting_id rather than ignored meeting_db_id", async () => {
  provider();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("meeting_id"), "42");
    assert.equal(url.searchParams.has("meeting_db_id"), false);
    assert.equal(init?.redirect, "error");
    return Response.json({ recordings: [{ id: 7, meeting_id: 42, status: "completed", duration_seconds: null }] });
  };
  assert.deepEqual(await findMeetingRecording(42), { id: 7, meetingId: 42, status: "completed", durationSeconds: null });
});

test("does not accept a recording belonging to another meeting", async () => {
  provider();
  globalThis.fetch = async () => Response.json({ recordings: [{ id: 7, meeting_id: 99 }] });
  assert.equal(await findMeetingRecording(42), null);
});

test("sends the platform and original Zoom password link without enabling transcription", async () => {
  provider();
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.platform, "zoom");
    assert.equal(body.meeting_url, "https://us02web.zoom.us/j/81234567890?pwd=test");
    assert.equal(body.transcribe_enabled, false);
    assert.equal(body.recording_enabled, true);
    return Response.json({ id: 42, status: "requested" });
  };
  assert.equal((await startMeetingBot({ meetingUrl: "https://us02web.zoom.us/j/81234567890?pwd=test" })).providerMeetingId, 42);
});

test("rejects a successful provider response without a real meeting ID", async () => {
  provider();
  for (const id of [null, "", 0, -1, 1.5]) {
    globalThis.fetch = async () => Response.json({ id });
    await assert.rejects(startMeetingBot({ meetingUrl: "https://meet.google.com/abc-defg-hij" }), /MEETING_PROVIDER_RESPONSE_INVALID/);
  }
});

test("rejects recording paths that could expose gateway credentials or fetch another recording", async () => {
  provider();
  for (const raw_url of ["https://evil.test/raw", "/recordings/7/media/../raw", "/recordings/8/media/1/raw", "/recordings/7/media/1/raw/../../raw", "/recordings/7/media/1/raw?type=video"]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ raw_url }); };
    await assert.rejects(downloadMeetingRecording(7), /MEETING_RECORDING_URL_INVALID/);
    assert.equal(calls, 1);
  }
});

test("downloads the upstream audio route with bounded streaming", async () => {
  provider();
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? Response.json({ raw_url: "/recordings/7/media/1/raw?type=audio" })
    : new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/webm" } });
  const media = await downloadMeetingRecording(7);
  assert.deepEqual([...media.bytes], [1, 2, 3]);
  assert.equal(media.contentType, "audio/webm");
});

test("cancels oversized chunked audio even when Content-Length is absent", async () => {
  provider();
  let calls = 0, cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  });
  globalThis.fetch = async () => ++calls === 1 ? Response.json({ raw_url: "/recordings/7/media/1/raw" }) : new Response(stream);
  await assert.rejects(downloadMeetingRecording(7), /MEETING_RECORDING_TOO_LARGE/);
  assert.equal(cancelled, true);
});
