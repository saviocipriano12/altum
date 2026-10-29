/** Measure the recording, rather than drawing a fabricated waveform. */
export function audioWaveformPeaks(samples: Float32Array, count = 48) {
  if (!samples.length || count < 1) return [];
  const size = Math.min(96, Math.floor(count));
  const peaks = Array.from({ length: size }, (_, index) => {
    const from = Math.floor(index * samples.length / size), end = Math.floor((index + 1) * samples.length / size);
    let sum = 0, measured = 0;
    for (let i = from; i < end; i += Math.max(1, Math.floor((end - from) / 256))) {
      const value = Number.isFinite(samples[i]) ? samples[i] : 0;
      sum += value * value; measured++;
    }
    return measured ? Math.sqrt(sum / measured) : 0;
  });
  const max = Math.max(...peaks);
  return peaks.map(value => max ? value / max : 0);
}
