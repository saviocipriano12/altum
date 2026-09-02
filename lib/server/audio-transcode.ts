import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

type AudioRenditions = {
  whatsappVoice: Buffer;
  playback: Buffer;
};

function runFfmpeg(args: string[]) {
  const executable = ffmpegPath;
  if (typeof executable !== "string" || !executable) {
    throw new Error("Transcodificador de audio indisponivel.");
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("A conversao do audio excedeu o tempo limite."));
    }, 45_000);

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 1200) stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Falha ao converter audio (${code ?? "sem codigo"}): ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Preserva uma voz compreensivel em todos os destinos: OGG/Opus para o
 * WhatsApp e MP3 para o player do navegador (incluindo Safari/iPhone).
 */
export async function createMobileAudioRenditions(input: {
  source: Buffer;
  extension?: string;
}): Promise<AudioRenditions> {
  if (!input.source.length) throw new Error("Audio vazio.");
  const workdir = await mkdtemp(join(tmpdir(), "altum-audio-"));
  const extension = String(input.extension || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const sourcePath = join(workdir, `source.${extension}`);
  const voicePath = join(workdir, "voice.ogg");
  const playbackPath = join(workdir, "playback.mp3");

  try {
    await writeFile(sourcePath, input.source);
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath,
      "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "48k", voicePath,
    ]);
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y", "-i", sourcePath,
      "-vn", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", playbackPath,
    ]);
    const [whatsappVoice, playback] = await Promise.all([readFile(voicePath), readFile(playbackPath)]);
    if (!whatsappVoice.length || !playback.length) throw new Error("A conversao gerou um audio vazio.");
    return { whatsappVoice, playback };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
