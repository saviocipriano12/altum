import http from "node:http";
import net from "node:net";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

// Fixed loopback target. No credentials, production host or public listener.
export function createInboxQaProxy(upstreamPort = 3199) {
if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) throw new Error("Invalid local port");
let unavailable = false;
let interrupted = 0;
const interruptedRequests = new Map();
const upstreamHost = `127.0.0.1:${upstreamPort}`;
const headersForUpstream = (headers) => ({ ...headers, host: upstreamHost });
const server = http.createServer((req, res) => {
  if (unavailable && /^\/api\/tenant\/qa-altum-(alpha|beta)\//.test(req.url || "")) {
    interrupted++;
    const key = `${req.method} ${(req.url || "").split("?")[0]}`;
    if (interruptedRequests.has(key) || interruptedRequests.size < 100) interruptedRequests.set(key, (interruptedRequests.get(key) || 0) + 1);
    res.destroy();
    return;
  }
  const upstream = http.request({ hostname: "127.0.0.1", port: upstreamPort, method: req.method,
    path: req.url, headers: headersForUpstream(req.headers) }, (response) => {
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Local QA upstream unavailable"); });
  req.on("error", () => upstream.destroy());
  req.pipe(upstream);
});
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(upstreamPort, "127.0.0.1", () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (const [key, value] of Object.entries(headersForUpstream(req.headers))) {
      if (Array.isArray(value)) for (const entry of value) upstream.write(`${key}: ${entry}\r\n`);
      else if (value !== undefined) upstream.write(`${key}: ${value}\r\n`);
    }
    upstream.write("\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
});
const status = () => ({ localQaProxy: true, unavailable, interrupted, interruptedRequests: Object.fromEntries(interruptedRequests) });
const command = (line) => {
  if (line.trim() === "outage") unavailable = true;
  else if (line.trim() === "restore") unavailable = false;
  else if (line.trim() !== "status") return null;
  return status();
};
return { server, command, status };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
const { server, command } = createInboxQaProxy();
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const result = command(line);
  if (result) console.log(JSON.stringify(result));
});
server.listen(3198, "127.0.0.1", () => console.log("QA proxy: http://127.0.0.1:3198; stdin: outage | restore | status"));
}
