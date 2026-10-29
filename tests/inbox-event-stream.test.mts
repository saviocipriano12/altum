import test from "node:test";
import assert from "node:assert/strict";
import { readInboxEventStream } from "../lib/inbox-event-stream.ts";
import { audioWaveformPeaks } from "../lib/audio-waveform.ts";

test("stream parses fragmented frames and UTF-8 without waiting for a polling timer", async () => {
  const bytes = new TextEncoder().encode(': heartbeat\r\n\r\ndata: {"kind":"ready"}\r\n\r\ndata: {"kind":"messages","ids":["áudio-1"]}\n\ndata: {"kind":"chats"}\n\n');
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
  const events: unknown[] = []; await readInboxEventStream(body, event => events.push(event));
  assert.deepEqual(events, [{ kind: "ready" }, { kind: "messages", ids: ["áudio-1"] }, { kind: "chats" }]);
});
test("invalid message references close the stream", async () => {
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('data: {"kind":"messages","ids":["other/chat"]}\n\n')); c.close(); } });
  await assert.rejects(readInboxEventStream(body, () => assert.fail("must not deliver")), /invalido/);
});
test("waveform represents silence and the actual amplitude of a recording", () => {
  assert.deepEqual(audioWaveformPeaks(new Float32Array(100), 4), [0,0,0,0]);
  const samples = new Float32Array(100); samples.fill(0.25, 25, 50); samples.fill(1, 50, 75); samples.fill(0.5, 75);
  assert.deepEqual(audioWaveformPeaks(samples, 4), [0,0.25,1,0.5]);
  assert.deepEqual(audioWaveformPeaks(new Float32Array()), []);
});
