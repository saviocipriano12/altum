import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { transcribeMeetingMedia } from "@/lib/server/ai/meeting-assistant";
import { logAiUsage } from "@/lib/server/ai/usage-ledger";
import {
  downloadMeetingRecording,
  findMeetingRecording,
  getMeetingBot,
  MeetingBotProviderError,
} from "@/lib/server/meetings/bot-provider";
import { assertMeetingRolloutAccess } from "@/lib/server/meetings/rollout-access";

export const runtime = "nodejs";
export const maxDuration = 300;

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function responseForError(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  if (error instanceof MeetingBotProviderError) return NextResponse.json({ error: "Não foi possível obter a gravação da reunião.", detail: error.detail }, { status: 502 });
  const message = error instanceof Error ? error.message : "";
  if (message === "OPENAI_API_KEY_NOT_CONFIGURED") return NextResponse.json({ error: "A transcrição da OpenAI ainda não foi configurada." }, { status: 503 });
  if (message === "MEETING_RECORDING_TOO_LARGE") return NextResponse.json({ error: "A gravação passou de 24 MB. O processamento em partes será liberado na próxima etapa." }, { status: 413 });
  console.error("Erro ao finalizar reunião capturada:", error);
  return NextResponse.json({ error: "Não foi possível finalizar a transcrição da reunião." }, { status: 500 });
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string; sessionId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, sessionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertMeetingRolloutAccess(membership);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(sessionId)) throw new RouteAuthError(400, "invalid_session", "Sessão inválida.");

    const ref = adminDb.collection("meeting_bot_sessions").doc(sessionId);
    const snap = await ref.get();
    const session = snap.data() as Record<string, unknown> | undefined;
    if (!snap.exists || clean(session?.tenantId, 180) !== tenantId) throw new RouteAuthError(404, "meeting_session_not_found", "Sessão não encontrada.");
    if (clean(session?.transcript, 90000)) {
      return NextResponse.json({ ok: true, item: { id: sessionId, status: "processed", transcript: clean(session?.transcript, 90000) } });
    }

    const providerMeetingId = Number(session?.providerMeetingId);
    if (!Number.isFinite(providerMeetingId)) throw new RouteAuthError(409, "provider_meeting_missing", "A reunião ainda não possui identificação no serviço.");
    const providerMeeting = await getMeetingBot(providerMeetingId);
    const providerStatus = clean(providerMeeting.status, 80);
    if (providerStatus !== "completed" && providerStatus !== "failed") {
      return NextResponse.json({ error: "A gravação estará disponível depois que o bot sair da reunião.", code: "meeting_still_running", status: providerStatus }, { status: 409 });
    }

    const recording = await findMeetingRecording(providerMeetingId);
    if (!recording) return NextResponse.json({ error: "A gravação ainda está sendo preparada. Tente novamente em alguns instantes.", code: "recording_not_ready" }, { status: 409 });

    await ref.set({ status: "processing", recordingId: recording.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const media = await downloadMeetingRecording(recording.id);
    const startedAt = Date.now();
    const transcription = await transcribeMeetingMedia({
      ...media,
      language: clean(session?.language, 20) || "pt_BR",
    });
    await ref.set({
      status: "processed",
      transcript: transcription.text,
      transcriptionModel: transcription.model,
      recordingId: recording.id,
      processedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    void logAiUsage({
      tenantId,
      scope: "analysis",
      provider: "openai",
      model: transcription.model,
      agentId: "meeting-bot-transcription",
      decision: "transcribe",
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      status: "success",
      metadata: { surface: "assisted_meetings", bytes: media.bytes.byteLength, recordingId: recording.id },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, item: { id: sessionId, status: "processed", transcript: transcription.text, recordingId: recording.id } });
  } catch (error) {
    return responseForError(error);
  }
}
