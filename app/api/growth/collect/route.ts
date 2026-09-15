import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  cleanText,
  eventDocumentId,
  normalizeGrowthEvent,
  originIsAllowed,
  parseTrackingConfig,
} from "@/lib/server/growth/tracking";

export const runtime = "nodejs";

const requestWindows = new Map<string, { count: number; expiresAt: number }>();

function corsHeaders(origin: string | null, allowed: boolean) {
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

function withinRateLimit(key: string) {
  const now = Date.now();
  const window = requestWindows.get(key);
  if (!window || window.expiresAt <= now) {
    requestWindows.set(key, { count: 1, expiresAt: now + 60_000 });
    return true;
  }
  window.count += 1;
  return window.count <= 120;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin, true) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  try {
    const raw = await req.text();
    if (raw.length > 64_000) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: corsHeaders(origin, false) });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    const writeKey = cleanText(body.writeKey, 100);
    if (!writeKey || !withinRateLimit(`${writeKey}:${origin || "server"}`)) {
      return NextResponse.json({ error: "rate_limited_or_invalid_key" }, { status: 429, headers: corsHeaders(origin, false) });
    }

    const configSnap = await adminDb.collection("growth_tracking_configs")
      .where("publicWriteKey", "==", writeKey)
      .limit(1)
      .get();
    if (configSnap.empty) {
      return NextResponse.json({ error: "invalid_write_key" }, { status: 401, headers: corsHeaders(origin, false) });
    }
    const configDoc = configSnap.docs[0];
    const config = parseTrackingConfig(configDoc.data());
    const allowed = config.enabled && originIsAllowed(origin, config.allowedDomains);
    if (!allowed) {
      return NextResponse.json({ error: config.enabled ? "origin_not_allowed" : "tracking_disabled" }, { status: 403, headers: corsHeaders(origin, false) });
    }

    const inputEvents = Array.isArray(body.events) ? body.events.slice(0, 20) : [body.event];
    const events = inputEvents.map((event) => normalizeGrowthEvent(event)).filter((event) => event !== null);
    if (!events.length) {
      return NextResponse.json({ error: "no_valid_events" }, { status: 400, headers: corsHeaders(origin, true) });
    }

    const tenantId = configDoc.id;
    const batch = adminDb.batch();
    for (const event of events) {
      const ref = adminDb.collection("growth_events").doc(eventDocumentId(tenantId, event.eventId));
      batch.set(ref, {
        ...event,
        tenantId,
        occurredAt: Timestamp.fromDate(new Date(event.occurredAt)),
        receivedAt: FieldValue.serverTimestamp(),
        origin: origin || "server",
        schemaVersion: 1,
      }, { merge: false });
    }
    batch.set(configDoc.ref, {
      lastEventAt: FieldValue.serverTimestamp(),
      lastEventName: events.at(-1)?.name || "",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    return NextResponse.json({ ok: true, accepted: events.length }, { status: 202, headers: corsHeaders(origin, true) });
  } catch (error) {
    console.error("Falha ao coletar evento de crescimento:", error);
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders(origin, false) });
  }
}
