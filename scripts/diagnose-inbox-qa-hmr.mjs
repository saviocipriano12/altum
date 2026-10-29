import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

// Technical loopback diagnostic only: no browser sessions, auth or application data.
const require = createRequire(import.meta.url);
const WebSocket = require("next/dist/compiled/ws");
await Promise.all([3199, 3198].map((port) => new Promise((resolve) => {
  const events = [];
  const started = Date.now();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/_next/hmr?id=${randomUUID()}`, {
    origin: `http://127.0.0.1:${port}`,
  });
  const record = (event, value) => events.push({ ms: Date.now() - started, event, value });
  socket.on("open", () => record("open"));
  socket.on("message", (bytes) => {
    try { const data = JSON.parse(String(bytes)); record("message", data.type || data.action || "unknown"); }
    catch { record("binary-or-non-json"); }
  });
  socket.on("error", (error) => record("error", error.code || error.name));
  socket.on("close", (code) => record("close", code));
  setTimeout(() => {
    socket.terminate();
    console.log(JSON.stringify({ localQaHmrDiagnostic: true, port, events }));
    resolve();
  }, 20000);
})));
