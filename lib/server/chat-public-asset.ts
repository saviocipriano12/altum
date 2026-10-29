import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const blocked = new BlockList();
for (const [network, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blocked.addSubnet(network, bits);
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");
for (const [network, bits] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blocked.addSubnet(network, bits, "ipv6");
export function isPublicChatAssetAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4") : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}
export function parsePublicChatAssetUrl(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) || url.hash) throw new Error("Link do material nao permitido.");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    (isIP(host) && !isPublicChatAssetAddress(host))) throw new Error("Endereco interno nao permitido para material.");
  return url;
}
/** Public-only, bounded download. Pin the validated DNS result in the socket
 * lookup, disable shared/proxy agents and validate EVERY redirect separately. */
export async function downloadPublicChatAsset(value: string, maxBytes: number) {
  let url = parsePublicChatAssetUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = isIP(host);
    const addresses = literalFamily ? [{ address: host, family: literalFamily }] : await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(row => !isPublicChatAssetAddress(row.address))) throw new Error("Endereco interno nao permitido para material.");
    const selected = addresses[0];
    const lookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: selected.address, family: selected.family }]);
      else callback(null, selected.address, selected.family);
    };
    const result = await new Promise<{ redirect?: string; buffer?: Buffer; contentType?: string }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request(url, {
        method: "GET", agent: false, lookup, family: selected.family,
        headers: { accept: "*/*", "accept-encoding": "identity" }, signal: AbortSignal.timeout(25000),
      }, response => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location; response.destroy();
          if (!location) reject(new Error("Redirecionamento do material invalido.")); else resolve({ redirect: location });
          return;
        }
        if (status < 200 || status >= 300) { response.destroy(); reject(new Error(`Material indisponivel (HTTP ${status}).`)); return; }
        if (Number(response.headers["content-length"] || 0) > maxBytes || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
          response.destroy(); reject(new Error("Material excede o limite ou usa formato de transporte nao permitido.")); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("Download do material interrompido.")));
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) { response.destroy(); reject(new Error("Material excede o limite permitido.")); }
          else chunks.push(chunk);
        });
        response.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: String(response.headers["content-type"] || "application/octet-stream").split(";")[0].trim().toLowerCase() }));
      });
      request.on("error", reject); request.end();
    });
    if (!result.redirect) {
      if (!result.buffer?.length) throw new Error("Material vazio.");
      return { buffer: result.buffer, contentType: result.contentType! };
    }
    const next = parsePublicChatAssetUrl(new URL(result.redirect, url).href);
    if (url.protocol === "https:" && next.protocol !== "https:") throw new Error("Redirecionamento inseguro do material.");
    url = next;
  }
  throw new Error("Material excedeu o limite de redirecionamentos.");
}
