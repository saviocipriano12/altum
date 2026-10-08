import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { signedStorageReadUrl } from "@/lib/server/firebase-storage";

type AvatarReference = { storagePath: string; kind: string };

function safeBaseUrl(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "https://api.higgsfield.ai";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "api.higgsfield.ai") throw new Error("higgsfield_base_url_invalid");
  return url.toString().replace(/\/$/, "");
}

function headers(credential: string) {
  if (!credential) throw new Error("higgsfield_credential_missing");
  return { Authorization: `Key ${credential}`, "Content-Type": "application/json" };
}

function providerMessage(payload: Record<string, unknown>, fallback: string) {
  const message = payload.error || payload.detail || payload.message;
  return typeof message === "string" && message.trim() ? message.slice(0, 700) : fallback;
}

export async function createHiggsfieldSoulReference(input: { connection: { baseUrl?: unknown; credential?: unknown }; name: string; references: AvatarReference[] }) {
  const imageReferences = input.references.filter((reference) => reference.kind === "visual" && reference.storagePath.startsWith("avatar-references/"));
  if (!imageReferences.length) throw new Error("avatar_visual_reference_missing");
  const urls = (await Promise.all(imageReferences.slice(0, 12).map((reference) => signedStorageReadUrl(reference.storagePath)))).filter((url): url is string => Boolean(url));
  if (!urls.length) throw new Error("avatar_reference_unavailable");
  const response = await fetch(`${safeBaseUrl(input.connection.baseUrl)}/v1/custom-references`, {
    method: "POST", headers: headers(decryptSecret(input.connection.credential)),
    body: JSON.stringify({ name: input.name.slice(0, 100), model_version: "v2", input_images: urls.map((image_url) => ({ type: "image_url", image_url })) }),
    cache: "no-store", signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.id !== "string") throw new Error(providerMessage(payload, "higgsfield_anchor_creation_failed"));
  return { referenceId: payload.id, status: typeof payload.status === "string" ? payload.status : "queued", thumbnailUrl: typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : null };
}

export async function getHiggsfieldSoulReference(input: { connection: { baseUrl?: unknown; credential?: unknown }; referenceId: string }) {
  const response = await fetch(`${safeBaseUrl(input.connection.baseUrl)}/v1/custom-references/${encodeURIComponent(input.referenceId)}`, { headers: headers(decryptSecret(input.connection.credential)), cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(providerMessage(payload, "higgsfield_anchor_status_failed"));
  const status = typeof payload.status === "string" ? payload.status : "unknown";
  return { status, thumbnailUrl: typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : null, ready: status === "completed", failed: status === "failed" };
}
