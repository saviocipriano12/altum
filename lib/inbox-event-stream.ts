export type InboxLiveEvent = { kind: "ready" | "chats" } | { kind: "messages"; ids: string[] } | { kind: "closed" };

/** Fetch streaming supports the same Bearer authentication as the other Inbox APIs. */
export async function readInboxEventStream(body: ReadableStream<Uint8Array>, receive: (event: InboxLiveEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, "\n");
      if (buffer.length > 128_000) throw new Error("Evento de conversa invalido.");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const raw = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
        if (!raw) continue;
        const event = JSON.parse(raw) as InboxLiveEvent;
        if (event.kind === "messages") {
          if (!Array.isArray(event.ids) || event.ids.length > 100 || event.ids.some(id => typeof id !== "string" || !id || id.length > 300 || id.includes("/"))) throw new Error("Evento de conversa invalido.");
          receive(event);
        } else if (["ready", "chats", "closed"].includes(event.kind)) receive(event);
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
