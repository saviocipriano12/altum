import assert from "node:assert/strict";
import test from "node:test";
import { createMobileAudioRenditions } from "../lib/server/audio-transcode.ts";

function makeWavSample() {
  const sampleRate = 16_000;
  const samples = Math.floor(sampleRate * 0.2);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 8_000), 44 + index * 2);
  }
  return buffer;
}

test("creates WhatsApp voice and mobile playback renditions", async () => {
  const renditions = await createMobileAudioRenditions({ source: makeWavSample(), extension: "wav" });

  assert.equal(renditions.whatsappVoice.subarray(0, 4).toString("ascii"), "OggS");
  assert.equal(renditions.playback.subarray(0, 3).toString("ascii"), "ID3");
  assert.ok(renditions.whatsappVoice.length > 500);
  assert.ok(renditions.playback.length > 500);
});
