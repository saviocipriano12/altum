import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

export type ColdTurnInput = { tenantId: string; chatId: string; messageId: string };
export type ColdTurnResult = { result: { decision: string; reason: string }; workerPid: number; bootId: string };
type FetchMessage = { type: "fetch"; id: number; url: string; method: string; headers: Record<string, string>; body?: string };

/** Fresh OS process, not another AI agent. No credentials, paid calls or store
 * network transport in that process: HTTP is relayed to the parent's fenced mock. */
export async function runColdHandlerTurn(input: ColdTurnInput, transport: typeof fetch): Promise<ColdTurnResult> {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_PROJECT_ID !== "demo-altum-ai-rebuild") {
    throw new Error("Cold handler exige projeto demo e emulador local explicitos.");
  }
  const prefix = input.tenantId.match(/^(qa_rebuild_handler_\d+_[a-f0-9]{8})_a$/)?.[1];
  if (!prefix || !input.chatId.startsWith(`${prefix}_catalog_`) || !input.messageId.startsWith(`${prefix}_catalog_`)) {
    throw new Error("IDs fora da fixture de cold handler.");
  }
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL("./cold-handler-worker.mts", import.meta.url)), [], {
      execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { ...process.env, OPENAI_API_KEY: "synthetic-no-billing-key", ANTHROPIC_API_KEY: "",
        GEMINI_API_KEY: "", GOOGLE_API_KEY: "", MISTRAL_API_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
        FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" },
    });
    let result: ColdTurnResult | undefined;
    let failure: Error | undefined;
    let relayed = 0;
    const stop = (error: Error) => { failure ||= error; child.kill(); };
    // Wait for exit after kill before returning: the parent must not clean up
    // fixture records while a timed-out worker could still mutate them.
    const timer = setTimeout(() => stop(new Error("Cold handler excedeu 45s; sem retry automatico.")), 45_000);
    child.on("error", error => {
      failure ||= error;
      if (!child.pid) { clearTimeout(timer); reject(error); }
      else child.kill();
    });
    child.on("message", async (message: unknown) => {
      const event = message as FetchMessage | ({ type: "result" } & ColdTurnResult) | { type: "failed" };
      if (event?.type === "result") {
        if (result || event.workerPid !== child.pid || typeof event.bootId !== "string" ||
            !event.bootId || typeof event.result?.decision !== "string" || typeof event.result?.reason !== "string") {
          stop(new Error("Resultado de cold handler invalido ou duplicado.")); return;
        }
        result = event; return;
      }
      if (event?.type === "failed") { failure ||= new Error("Cold handler falhou; consultar tentativa, sem fallback."); return; }
      if (event?.type !== "fetch" || !Number.isInteger(event.id) || ++relayed > 50) {
        stop(new Error("Protocolo de cold handler invalido.")); return;
      }
      try {
        // global fetch is already the parent's default-deny synthetic transport.
        const response = await transport(event.url, { method: event.method, headers: event.headers, body: event.body });
        const body = await response.text();
        if (body.length > 2_000_000) throw new Error("Resposta de fixture acima do limite.");
        if (child.connected) child.send({ type: "fetch_result", id: event.id, status: response.status, body });
      } catch {
        if (child.connected) child.send({ type: "fetch_error", id: event.id });
      }
    });
    child.on("exit", code => {
      clearTimeout(timer);
      if (failure || code !== 0 || !result || result.workerPid !== child.pid) reject(failure || new Error("Cold handler saiu sem resultado valido."));
      else resolve(result);
    });
    child.send({ type: "start", input });
  });
}
