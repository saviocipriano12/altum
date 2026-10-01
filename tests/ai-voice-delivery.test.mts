import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { measureAltumSpeechDuration } from "../lib/server/ai/voice";

test("voz da IA parte de uma fonte sem perdas e gera saidas separadas para WhatsApp e navegador", async () => {
  const voiceSource = await readFile(new URL("../lib/server/ai/voice.ts", import.meta.url), "utf8");
  const previewSource = await readFile(new URL("../app/api/tenant/[tenantId]/ai-voice/preview/route.ts", import.meta.url), "utf8");
  const nextConfigSource = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(voiceSource, /ALTUM_TTS_SOURCE_FORMAT \|\| "wav"/);
  assert.match(voiceSource, /DEFAULT_MAX_VOICE_CHARS = 460/);
  assert.match(voiceSource, /uma única pessoa/);
  assert.match(voiceSource, /createMobileAudioRenditions/);
  assert.match(voiceSource, /contentType: "audio\/ogg; codecs=opus"/);
  assert.match(voiceSource, /playbackContentType: "audio\/mpeg"/);
  assert.match(voiceSource, /voice_synthesis_no_credits/);
  assert.match(previewSource, /speech\.playbackBuffer\.toString\("base64"\)/);
  assert.match(previewSource, /allowSourcePlaybackFallback: true/);
  assert.match(voiceSource, /nativeVoiceReady: false/);
  assert.match(nextConfigSource, /"\/api\/tenant\/\*\/ai-voice\/preview"/);
  assert.match(nextConfigSource, /"\/api\/internal\/jobs\/ai\/process"/);
  assert.match(nextConfigSource, /"\/api\/webhooks\/whatsapp"/);
  assert.match(previewSource, /saldo da API de áudio acabou/);
});

test("WhatsApp recebe nota de voz nativa em OGG Opus com flag de voz", async () => {
  const voiceSource = await readFile(new URL("../lib/server/ai/voice.ts", import.meta.url), "utf8");
  const metaSource = await readFile(new URL("../app/lib/server/whatsapp-channel.ts", import.meta.url), "utf8");
  const evolutionSource = await readFile(new URL("../lib/server/messaging/evolution-media.ts", import.meta.url), "utf8");
  assert.match(voiceSource, /voice: true/);
  assert.match(metaSource, /input\.voice === true \? \{ voice: true \}/);
  assert.match(evolutionSource, /sendWhatsAppAudio/);
  assert.match(evolutionSource, /encoding:\s*!String\(input\.contentType/);
});

test("duracao de WAV e medida pelo cabecalho; outros formatos sao marcados como estimativa", () => {
  const wav = Buffer.alloc(16_044);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(16_036, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt32LE(16_000, 28);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(16_000, 40);
  assert.deepEqual(measureAltumSpeechDuration(wav, "wav", "ola"), {
    durationMs: 1000,
    durationSource: "measured_wav",
  });
  assert.equal(measureAltumSpeechDuration(Buffer.from("not-an-audio"), "mp3", "uma frase curta").durationSource, "estimated_text");
});

test("painel oferece amostra individual e todas as vozes atuais", async () => {
  const pageSource = await readFile(new URL("../app/cliente/painel/ia/page.tsx", import.meta.url), "utf8");
  for (const voice of ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]) {
    assert.match(pageSource, new RegExp(`id: "${voice}"`));
  }
  assert.match(pageSource, /handleRunVoicePreview\(voice\.id\)/);
  assert.match(pageSource, /Ouça e escolha a voz/);
});
