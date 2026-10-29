import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { randomUUID } from "node:crypto";
import type { ColdTurnInput } from "./cold-handler-turn.mts";

if (!process.send || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
    process.env.FIREBASE_PROJECT_ID !== "demo-altum-ai-rebuild") throw new Error("Worker somente via IPC no emulador demo.");

let nextRequest = 0;
const bootId = randomUUID();
let finished = false;
process.on("disconnect", () => { if (!finished) process.exit(1); });
const pending = new Map<number, { resolve: (response: Response) => void; reject: (error: Error) => void }>();
globalThis.fetch = async (url, options) => {
  const target = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  const id = ++nextRequest;
  return new Promise<Response>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // No direct HTTP fallback, including after IPC error. The parent validates
    // destinations and uses only local synthetic provider responses.
    process.send!({ type: "fetch", id, url: target, method: options?.method || "GET",
      headers: Object.fromEntries(new Headers(options?.headers).entries()),
      ...(options?.body ? { body: String(options.body) } : {}) });
  });
};
dns.lookup = (async (hostname: string, options: { all?: boolean }) => {
  if (hostname !== "synthetic-rebuild.myshopify.com" || options?.all !== true) throw new Error("DNS fora da fixture.");
  return [{ address: "203.0.113.10", family: 4 }];
}) as unknown as typeof dns.lookup;
syncBuiltinESMExports();

let started = false;
process.on("message", async (message: unknown) => {
  const event = message as { type: string; id?: number; status?: number; body?: string; input?: ColdTurnInput };
  if (event?.type === "fetch_result" || event?.type === "fetch_error") {
    const entry = pending.get(event.id!);
    if (!entry) return;
    pending.delete(event.id!);
    if (event.type === "fetch_result") entry.resolve(new Response(event.body, { status: event.status }));
    else entry.reject(new Error("Transporte de fixture recusou chamada; sem rede alternativa."));
    return;
  }
  if (event?.type !== "start" || started) return;
  started = true;
  let database: typeof import("../../app/lib/server/firebase-admin.ts").adminDb | undefined;
  try {
    const input = event.input!;
    const prefix = input?.tenantId?.match(/^(qa_rebuild_handler_\d+_[a-f0-9]{8})_a$/)?.[1];
    if (!prefix || !input.chatId.startsWith(`${prefix}_catalog_`) || !input.messageId.startsWith(`${prefix}_catalog_`)) throw new Error("Vinculo fora da fixture.");
    const { adminDb } = await import("../../app/lib/server/firebase-admin.ts"); database = adminDb;
    const { handleIncomingMessage } = await import("../../lib/server/ai/agent.ts");
    const result = await handleIncomingMessage(input);
    process.send!({ type: "result", result: { decision: result.decision, reason: result.reason }, workerPid: process.pid, bootId });
  } catch {
    process.exitCode = 1;
    process.send!({ type: "failed" });
  } finally {
    try { await database?.terminate(); } catch { process.exitCode = 1; }
    finished = true;
    if (process.connected) process.disconnect();
  }
});
