"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { audioWaveformPeaks } from "@/lib/audio-waveform";

function time(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One stable audio element; receipt updates must not restart playback. */
export function VoiceMessagePlayer({ src, initialDuration, onError }: {
  src: string; initialDuration?: number | null; onError: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [rate, setRate] = useState(1);
  const [peaks, setPeaks] = useState<number[]>([]);
  const clipId = useId().replace(/:/g, "");
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  useEffect(() => {
    const controller = new AbortController();
    setPeaks([]);
    void (async () => {
      // Protected attachments are already resolved to a local Blob URL.
      if (!src.startsWith("blob:") || typeof OfflineAudioContext === "undefined") return;
      const response = await fetch(src, { signal: controller.signal });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 12 * 1024 * 1024 || controller.signal.aborted) return;
      const context = new OfflineAudioContext(1, 1, 8000);
      const decoded = await context.decodeAudioData(bytes);
      if (!controller.signal.aborted) setPeaks(audioWaveformPeaks(decoded.getChannelData(0)));
    })().catch(() => { /* Playback works even if waveform decoding is unavailable. */ });
    return () => controller.abort();
  }, [src]);
  return <div className="inbox-voice-player flex w-full min-w-0 items-center gap-2 py-1 text-[#54656f]">
    <audio ref={audio} src={src} preload="metadata"
      onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
      onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onError={onError} />
    <button type="button" aria-label={playing ? "Pausar áudio" : "Ouvir áudio"}
      className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-emerald-700"
      onClick={() => {
        if (!audio.current) return;
        if (playing) audio.current.pause(); else void audio.current.play().catch(onError);
      }}>{playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}</button>
    <div className="min-w-0 flex-1">
      <div className="relative h-9 rounded-sm focus-within:ring-2 focus-within:ring-emerald-700/50">
        <svg className="h-9 w-full" viewBox="0 0 192 36" preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id={clipId}><rect width={192 * progress} height="36" /></clipPath></defs>
          {peaks.length ? <>
            <g fill="#9daf9f">{peaks.map((peak, index) => <rect key={index} x={index * 4} y={18 - Math.max(2, peak * 28) / 2} width="2.5" height={Math.max(2, peak * 28)} rx="1.25" />)}</g>
            <g fill="#4aa5bf" clipPath={`url(#${clipId})`}>{peaks.map((peak, index) => <rect key={index} x={index * 4} y={18 - Math.max(2, peak * 28) / 2} width="2.5" height={Math.max(2, peak * 28)} rx="1.25" />)}</g>
          </> : <line x1="0" y1="18" x2="192" y2="18" stroke="#aab8ae" strokeWidth="2" />}
          <circle cx={Math.max(4, Math.min(188, 192 * progress))} cy="18" r="4" fill="#4aa5bf" />
        </svg>
        <input type="range" aria-label="Progresso do áudio" aria-valuetext={`${time(position)} de ${time(duration)}`}
        min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 1)} disabled={!duration}
        className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0 disabled:cursor-default"
        onChange={(event) => { const next = Number(event.target.value); if (audio.current) audio.current.currentTime = next; setPosition(next); }} />
      </div>
      <div className="text-[11px] tabular-nums opacity-80">{time(playing || position ? position : duration)}</div>
    </div>
    <button type="button" aria-label={`Velocidade do áudio: ${rate} vezes`}
      className="h-11 w-11 shrink-0 rounded-full text-xs font-semibold text-[#54656f] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-emerald-700"
      onClick={() => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(next); if (audio.current) audio.current.playbackRate = next; }}>{rate}×</button>
  </div>;
}
