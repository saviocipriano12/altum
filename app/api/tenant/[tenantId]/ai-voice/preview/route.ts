import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import {
  defaultAltumVoiceReplyMaxChars,
  prepareAltumVoiceReplyText,
  storeAltumSpeech,
  synthesizeAltumSpeech,
} from "@/lib/server/ai/voice";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

export const maxDuration = 60;

type Body = {
  text?: string;
  voice?: string;
  maxChars?: number;
};

function clean(value: unknown, max = 1800) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const text = clean(body.text, 2200);
    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    const defaultMaxChars = defaultAltumVoiceReplyMaxChars();
    const maxChars = Math.max(260, Math.min(1400, Number(body.maxChars || defaultMaxChars) || defaultMaxChars));
    const transcript = prepareAltumVoiceReplyText(text, maxChars);
    const speech = await synthesizeAltumSpeech(transcript, body.voice, {
      allowSourcePlaybackFallback: true,
    });
    const audioBase64 = speech.playbackBuffer.toString("base64");
    let audioUrl = "";
    let storagePath: string | null = null;
    let storageWarning: string | null = null;

    try {
      const stored = await storeAltumSpeech({
        tenantId,
        chatId: "preview",
        buffer: speech.playbackBuffer,
        contentType: speech.playbackContentType,
        extension: speech.playbackExtension,
      });
      audioUrl = stored.signedUrl;
      storagePath = stored.path;

      await adminDb.collection("ai_voice_previews").add({
        tenantId,
        createdBy: user.uid,
        createdByName: user.name,
        voice: speech.voice,
        model: speech.model,
        maxChars,
        transcript,
        mediaUrl: stored.signedUrl,
        mediaStoragePath: stored.path,
        mediaMimeType: stored.contentType,
        mediaSize: stored.size,
        durationMs: speech.durationMs,
        durationSource: speech.durationSource,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (storageError) {
      storageWarning = storageError instanceof Error ? storageError.message : "storage_preview_unavailable";
      console.warn("Preview de voz gerado sem salvar no Storage:", storageWarning);
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      audioUrl,
      audioBase64,
      audioMimeType: speech.playbackContentType,
      audioByteLength: speech.playbackBuffer.length,
      durationMs: speech.durationMs,
      durationSource: speech.durationSource,
      transcript,
      voice: speech.voice,
      model: speech.model,
      whatsappMimeType: speech.nativeVoiceReady ? speech.contentType : null,
      nativeVoiceReady: speech.nativeVoiceReady,
      mediaMimeType: speech.playbackContentType,
      mediaSize: speech.playbackBuffer.length,
      mediaStoragePath: storagePath,
      warning: storageWarning,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao gerar preview de voz da IA:", error);
    const code = error instanceof Error ? error.message : "voice_preview_failed";
    if (code === "voice_synthesis_no_credits") {
      return NextResponse.json(
        { error: "A voz está temporariamente indisponível porque o saldo da API de áudio acabou. Adicione créditos na conta OpenAI da Altum e tente novamente.", code },
        { status: 503 }
      );
    }
    if (code === "voice_synthesis_invalid_credentials") {
      return NextResponse.json(
        { error: "A credencial do provedor de voz precisa ser atualizada pela equipe Altum.", code },
        { status: 503 }
      );
    }
    if (code === "voice_synthesis_rate_limited") {
      return NextResponse.json(
        { error: "O provedor de voz está ocupado. Aguarde alguns segundos e tente novamente.", code },
        { status: 429 }
      );
    }
    if (code === "voice_synthesis_timeout" || code === "voice_synthesis_network_unavailable") {
      return NextResponse.json(
        { error: "A amostra de voz demorou mais do que o esperado. Tente novamente; nenhuma mensagem foi enviada ao cliente.", code },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Não foi possível gerar a amostra agora. Tente novamente ou peça ajuda à equipe Altum.", code },
      { status: 500 }
    );
  }
}
