import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertMeetingRolloutAccess } from "@/lib/server/meetings/rollout-access";
import {
  isMeetingBotProviderConfigured,
  MeetingBotProviderError,
  startMeetingBot,
} from "@/lib/server/meetings/bot-provider";

export const runtime = "nodejs";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toIso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

function normalizeSession(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    meetingUrl: clean(data.meetingUrl, 1000),
    platform: clean(data.platform, 40),
    nativeMeetingId: clean(data.nativeMeetingId, 180),
    providerMeetingId: Number.isFinite(Number(data.providerMeetingId)) ? Number(data.providerMeetingId) : null,
    status: clean(data.status, 80) || "requested",
    transcript: clean(data.transcript, 90000),
    recordingId: Number.isFinite(Number(data.recordingId)) ? Number(data.recordingId) : null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  if (error instanceof MeetingBotProviderError) {
    return NextResponse.json({ error: "O serviço de reuniões recusou a solicitação.", code: "meeting_provider_error", detail: error.detail }, { status: 502 });
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "MEETING_BOT_PROVIDER_NOT_CONFIGURED") {
    return NextResponse.json({ error: "A infraestrutura de reuniões ainda não foi configurada.", code: "meeting_provider_not_configured" }, { status: 503 });
  }
  if (message === "MEETING_URL_INVALID" || message === "MEETING_PLATFORM_UNSUPPORTED") {
    return NextResponse.json({ error: "Informe um link válido do Google Meet ou Zoom.", code: "meeting_url_invalid" }, { status: 400 });
  }
  console.error("Erro na infraestrutura de reunião:", error);
  return NextResponse.json({ error: "Não foi possível iniciar a reunião com IA." }, { status: 500 });
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertMeetingRolloutAccess(membership);

    const snap = await adminDb.collection("meeting_bot_sessions").where("tenantId", "==", tenantId).limit(30).get();
    const items = snap.docs.map(normalizeSession).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return NextResponse.json({ ok: true, configured: isMeetingBotProviderConfigured(), items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertMeetingRolloutAccess(membership);

    const body = (await req.json().catch(() => ({}))) as { meetingUrl?: unknown; language?: unknown };
    const run = await startMeetingBot({ meetingUrl: clean(body.meetingUrl, 1000), language: clean(body.language, 20) });
    const ref = adminDb.collection("meeting_bot_sessions").doc();
    const session = {
      tenantId,
      meetingUrl: run.meetingUrl,
      platform: run.platform,
      nativeMeetingId: run.nativeMeetingId,
      providerMeetingId: run.providerMeetingId,
      status: run.status,
      language: clean(body.language, 20) || "pt_BR",
      transcriptionMode: "openai_after_meeting",
      recordingEnabled: true,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(session);
    return NextResponse.json({ ok: true, item: { id: ref.id, ...session, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
