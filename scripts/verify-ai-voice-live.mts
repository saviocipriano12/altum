import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { synthesizeAltumSpeech } from "../lib/server/ai/voice.ts";

nextEnv.loadEnvConfig(process.cwd());

const speech = await synthesizeAltumSpeech(
  "Oi! Tudo bem? Posso te ajudar a entender qual é o melhor próximo passo.",
  "marin"
);

assert.equal(speech.contentType, "audio/ogg; codecs=opus");
assert.equal(speech.playbackContentType, "audio/mpeg");
assert.ok(speech.buffer.subarray(0, 4).toString("ascii") === "OggS", "A entrega ao WhatsApp precisa ser OGG Opus.");
assert.ok(speech.playbackBuffer.subarray(0, 3).toString("ascii") === "ID3" || (speech.playbackBuffer[0] === 0xff && (speech.playbackBuffer[1] & 0xe0) === 0xe0), "O player precisa receber MP3 válido.");
assert.ok(speech.buffer.length > 1024);
assert.ok(speech.playbackBuffer.length > 1024);

process.stdout.write(
  `AI voice live verification passed: model=${speech.model}; voice=${speech.voice}; whatsapp=${speech.buffer.length}B; playback=${speech.playbackBuffer.length}B\n`
);
