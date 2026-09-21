import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { getMeetingBot, MeetingBotProviderError, stopMeetingBot } from "@/lib/server/meetings/bot-provider";
import { assertMeetingRolloutAccess } from "@/lib/server/meetings/rollout-access";

export const runtime = "nodejs";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getOwnedSession(tenantId: string, sessionId: string) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(sessionId)) throw new RouteAuthError(400, "invalid_session", "Sessão inválida.");
  const ref = adminDb.collection("meeting_bot_sessions").doc(sessionId);
  const snap = await ref.get();
  const data = snap.data() as Record<string, unknown> | undefined;
  if (!snap.exists || clean(data?.tenantId, 180) !== tenantId) throw new RouteAuthError(404, "meeting_session_not_found", "Sessão não encontrada.");
  return { ref, data: data || {} };
}

function respondError(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  if (error instanceof MeetingBotProviderError) return NextResponse.json({ error: "Falha ao consultar o bot da reunião.", detail: error.detail }, { status: 502 });
  console.error("Erro ao controlar bot de reunião:", error);
  return NextResponse.json({ error: "Não foi possível controlar o bot da reunião." }, { status: 500 });
}

async function authorize(req: Request, tenantId: string) {
  const user = await requireRequestUser(req);
  const membership = await assertTenantAccess(user.uid, tenantId);
  await assertTenantModule(tenantId, "assisted_meetings");
  assertMeetingRolloutAccess(membership);
  return user;
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string; sessionId: string }> }) {
  try {
    const { tenantId, sessionId } = await context.params;
    await authorize(req, tenantId);
    const session = await getOwnedSession(tenantId, sessionId);
    const providerMeetingId = Number(session.data.providerMeetingId);
    if (!Number.isFinite(providerMeetingId)) throw new RouteAuthError(409, "provider_meeting_missing", "A reunião ainda não possui identificação no serviço.");
    const provider = await getMeetingBot(providerMeetingId);
    const status = clean(provider.status, 80) || clean(session.data.status, 80) || "requested";
    await session.ref.set({ status, providerSnapshot: provider, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, item: { id: sessionId, ...session.data, status, providerSnapshot: provider } });
  } catch (error) {
    return respondError(error);
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ tenantId: string; sessionId: string }> }) {
  try {
    const { tenantId, sessionId } = await context.params;
    await authorize(req, tenantId);
    const session = await getOwnedSession(tenantId, sessionId);
    const platform = clean(session.data.platform, 40);
    const nativeMeetingId = clean(session.data.nativeMeetingId, 180);
    if (platform !== "google_meet" && platform !== "zoom") throw new RouteAuthError(409, "provider_target_invalid", "Destino da reunião inválido.");
    const provider = await stopMeetingBot({ platform, nativeMeetingId });
    const status = clean(provider.status, 80) || "stopping";
    await session.ref.set({ status, stopRequestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true, item: { id: sessionId, status } });
  } catch (error) {
    return respondError(error);
  }
}
