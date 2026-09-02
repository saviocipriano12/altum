import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

export async function assertSafeCommerceUrl(value: string, allowedSuffix?: string) {
  const url = new URL(value.startsWith("http") ? value : `https://${value}`);
  if (url.protocol !== "https:") throw new Error("commerce_store_https_required");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("commerce_store_url_blocked");
  if (allowedSuffix && hostname !== allowedSuffix && !hostname.endsWith(`.${allowedSuffix}`)) throw new Error("commerce_store_domain_invalid");
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("commerce_store_url_blocked");
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("commerce_store_url_blocked");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export async function commerceFetchJson<T>(url: URL | string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000), cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; errors?: unknown };
  if (!response.ok) {
    const detail = typeof data?.message === "string" ? data.message : `status ${response.status}`;
    throw new Error(`commerce_provider_request_failed:${detail}`);
  }
  return { data, headers: response.headers };
}

export function cleanCommerceText(value: unknown, max = 500) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function localizedCommerceText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const data = value as Record<string, unknown>;
  return cleanCommerceText(data.pt || data["pt-BR"] || data.es || data.en || Object.values(data).find((item) => typeof item === "string"), 1200);
}
