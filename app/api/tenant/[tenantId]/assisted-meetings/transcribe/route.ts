import { NextResponse } from "next/server";
import { adminStorage } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { logAiUsage } from "@/lib/server/ai/usage-ledger";
import { transcribeMeetingMedia } from "@/lib/server/ai/meeting-assistant";

const MAX_MEDIA_BYTES = 24 * 1024 * 1024;
const ACCEPTED_MEDIA = /^(audio|video)\//i;

type StoredMediaBody = {
  storagePath?: string;
  fileName?: string;
  contentType?: string;
  language?: string;
};

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "assisted_meetings");
    assertTenantCapability(membership, "edit_leads");

    const isStoredUpload = (req.headers.get("content-type") || "").includes("application/json");
    let bytes: Uint8Array;
    let contentType: string;
    let fileName: string;
    let language: string;
    let mediaSize: number;
    let temporaryStoragePath: string | null = null;

    if (isStoredUpload) {
      const body = (await req.json().catch(() => ({}))) as StoredMediaBody;
      const storagePath = String(body.storagePath || "").trim();
      const allowedPrefix = `meeting-media/${tenantId}/${user.uid}/`;
      if (!storagePath.startsWith(allowedPrefix) || storagePath.includes("..")) {
        return NextResponse.json({ error: "Arquivo de reunião inválido." }, { status: 400 });
      }
      const temporaryFile = adminStorage.bucket().file(storagePath);
      temporaryStoragePath = storagePath;
      const [metadata] = await temporaryFile.getMetadata();
      contentType = String(metadata.contentType || body.contentType || "");
      fileName = String(body.fileName || storagePath.split("/").pop() || "reuniao.webm");
      language = String(body.language || "pt_BR");
      mediaSize = Number(metadata.size || 0);
      if (!ACCEPTED_MEDIA.test(contentType) || !mediaSize || mediaSize > MAX_MEDIA_BYTES) {
        await temporaryFile.delete({ ignoreNotFound: true }).catch(() => undefined);
        return NextResponse.json({ error: "Use um arquivo de áudio ou vídeo de até 24 MB." }, { status: 400 });
      }
      const [buffer] = await temporaryFile.download();
      bytes = new Uint8Array(buffer);
    } else {
      const data = await req.formData();
      const media = data.get("media");
      language = String(data.get("language") || "pt_BR");
      if (!(media instanceof File) || !media.size) {
        return NextResponse.json({ error: "Selecione um áudio ou vídeo da reunião." }, { status: 400 });
      }
      contentType = media.type;
      fileName = media.name;
      mediaSize = media.size;
      if (!ACCEPTED_MEDIA.test(contentType) || mediaSize > 4 * 1024 * 1024) {
        return NextResponse.json({ error: "Arquivos acima de 4 MB devem ser enviados pelo upload direto." }, { status: 400 });
      }
      bytes = new Uint8Array(await media.arrayBuffer());
    }

    const startedAt = Date.now();
    let result;
    try {
      result = await transcribeMeetingMedia({ bytes, contentType, fileName, language });
    } finally {
      if (temporaryStoragePath) {
        await adminStorage.bucket().file(temporaryStoragePath).delete({ ignoreNotFound: true }).catch(() => undefined);
      }
    }
    void logAiUsage({
      tenantId,
      scope: "analysis",
      provider: "openai",
      model: result.model,
      agentId: "meeting-transcription",
      decision: "transcribe",
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      status: "success",
      metadata: { surface: "assisted_meetings", bytes: mediaSize },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, transcript: result.text, model: result.model });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "";
    console.error("Erro ao transcrever reunião assistida:", error);
    return NextResponse.json(
      { error: message === "OPENAI_API_KEY_NOT_CONFIGURED" ? "A transcrição por IA ainda não foi configurada." : "Não foi possível transcrever este arquivo." },
      { status: message === "OPENAI_API_KEY_NOT_CONFIGURED" ? 503 : 500 }
    );
  }
}
