import { NextResponse } from "next/server";
import { adminStorage, adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { firebaseStorageBucketCandidates } from "@/lib/server/firebase-storage";

function fail(error: unknown) { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error("Falha ao abrir anexo do Comando Altum:", error); return NextResponse.json({ error: "Não foi possível abrir este anexo." }, { status: 500 }); }

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { attachmentId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(attachmentId)) throw new RouteAuthError(400, "attachment_invalid", "Anexo inválido.");
    const snap = await adminDb.collection("agent_command_attachments").doc(attachmentId).get();
    if (!snap.exists || snap.get("ownerId") !== actor.uid) throw new RouteAuthError(404, "attachment_missing", "Anexo não encontrado.");
    const path = String(snap.get("storagePath") || "");
    const tenantId = String(snap.get("tenantId") || "");
    if (!path || !tenantId || path.includes("..") || !path.startsWith(`agent-command/${tenantId}/${actor.uid}/${attachmentId}-`)) throw new RouteAuthError(403, "attachment_path_invalid", "Não foi possível autorizar este anexo.");
    for (const bucketName of firebaseStorageBucketCandidates()) {
      const file = adminStorage.bucket(bucketName).file(path);
      const [exists] = await file.exists();
      if (!exists) continue;
      const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 10 * 60_000, responseDisposition: `inline; filename="${String(snap.get("filename") || "anexo").replace(/[^\w.\- ]+/g, "_")}"` });
      return NextResponse.redirect(url);
    }
    throw new RouteAuthError(404, "attachment_file_missing", "Arquivo privado não encontrado.");
  } catch (error) { return fail(error); }
}
