/** Fences late microphone permission against cancel, scope changes and unmount. */
export class InboxRecordingGate {
  private sequence = 0;
  private active: number | null = null;
  begin() {
    if (this.active !== null) return null;
    this.active = ++this.sequence;
    return this.active;
  }
  isCurrent(token: number) { return this.active === token; }
  isLatest(token: number) { return this.sequence === token; }
  finish(token: number) { if (this.active === token) this.active = null; }
  invalidate() { this.active = null; this.sequence++; }
}

export async function acquireInboxRecordingStream<T extends { getTracks(): { stop(): void }[] }>(
  gate: InboxRecordingGate, token: number, acquire: () => Promise<T>
) {
  const stream = await acquire();
  if (gate.isCurrent(token)) return stream;
  stream.getTracks().forEach((track) => track.stop());
  return null;
}
