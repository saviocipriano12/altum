import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { prepareAltumVoiceReplyText, storeAltumSpeech, synthesizeAltumSpeech } from "@/lib/server/ai/voice";

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
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const text = clean(body.text, 2200);
    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    const maxChars = Math.max(260, Math.min(1400, Number(body.maxChars || 760) || 760));
    const transcript = prepareAltumVoiceReplyText(text, maxChars);
    const speech = await synthesizeAltumSpeech(transcript, body.voice);
    const audioBase64 = speech.buffer.toString("base64");
    let audioUrl = "";
    let storagePath: string | null = null;
    let storageWarning: string | null = null;

    try {
      const stored = await storeAltumSpeech({
        tenantId,
        chatId: "preview",
        buffer: speech.buffer,
        contentType: speech.contentType,
        extension: speech.extension,
      });
      audioUrl = stored.signedUrl;
      storagePath = stored.path;

      await adminDb.collection("ai_voice_previews").add({
        tenantId,
        createdBy: user.uid,
        createdByName: user.name,
        voice: clean(body.voice, 40) || "marin",
        maxChars,
        transcript,
        mediaUrl: stored.signedUrl,
        mediaStoragePath: stored.path,
        mediaMimeType: stored.contentType,
        mediaSize: stored.size,
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
      audioMimeType: speech.contentType,
      audioByteLength: speech.buffer.length,
      transcript,
      mediaMimeType: speech.contentType,
      mediaSize: speech.buffer.length,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerar audio de teste." },
      { status: 500 }
    );
  }
}
