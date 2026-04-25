import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getAppBaseUrl, getMetaEnv } from "@/app/lib/server/integration-oauth";

type SignedPayload = {
  user_id?: string;
  issued_at?: number;
  algorithm?: string;
  [key: string]: unknown;
};

function clean(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function base64UrlToBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding ? normalized + "=".repeat(4 - padding) : normalized;
  return Buffer.from(padded, "base64");
}

function parseSignedRequest(signedRequest: string, appSecret: string) {
  const [encodedSignature, encodedPayload] = String(signedRequest || "").split(".");
  if (!encodedSignature || !encodedPayload || !appSecret) {
    throw new Error("signed_request_invalid");
  }

  const signature = base64UrlToBuffer(encodedSignature);
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload, "utf8")
    .digest();

  if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
    throw new Error("signed_request_signature_invalid");
  }

  const payload = JSON.parse(base64UrlToBuffer(encodedPayload).toString("utf8")) as SignedPayload;
  return payload;
}

function randomCode(length = 18) {
  return crypto
    .randomBytes(length)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, length);
}

async function readSignedRequest(req: Request) {
  const contentType = clean(req.headers.get("content-type"), 120).toLowerCase();

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { signed_request?: unknown };
    return clean(body.signed_request, 8000);
  }

  const form = await req.formData().catch(() => null);
  if (form) {
    return clean(form.get("signed_request"), 8000);
  }

  const text = await req.text().catch(() => "");
  const params = new URLSearchParams(text);
  return clean(params.get("signed_request"), 8000);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "meta",
    route: "/api/meta/data-deletion",
    status: "ready",
  });
}

export async function POST(req: Request) {
  try {
    const signedRequest = await readSignedRequest(req);
    const env = getMetaEnv();

    if (!signedRequest) {
      return NextResponse.json({ error: "signed_request ausente." }, { status: 400 });
    }
    if (!env.appSecret) {
      return NextResponse.json({ error: "META_APP_SECRET nao configurado." }, { status: 503 });
    }

    const payload = parseSignedRequest(signedRequest, env.appSecret);
    const userId = clean(payload.user_id, 120);
    const confirmationCode = randomCode(20);

    await adminDb.collection("privacy_deletion_requests").doc(confirmationCode).set({
      provider: "meta",
      status: "received",
      confirmationCode,
      userId: userId || null,
      payloadIssuedAt: typeof payload.issued_at === "number" ? payload.issued_at : null,
      payloadAlgorithm: clean(payload.algorithm, 60) || "HMAC-SHA256",
      requestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const baseUrl = getAppBaseUrl(req);
    const statusUrl = `${baseUrl || ""}/exclusao-de-dados?code=${encodeURIComponent(confirmationCode)}`;

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 220) : "falha_na_solicitacao";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
