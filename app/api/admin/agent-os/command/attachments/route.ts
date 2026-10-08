import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.openxmlformats-officedocument\.presentationml\.presentation|json|csv|plain)|text\/(plain|csv|markdown)|image\/(jpeg|png|webp)|audio\/(mpeg|mp4|wav|webm|ogg))$/i;

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function safeName(value: string) { return clean(value).replace(/[^\w.\- ]+/g, "_") || "anexo"; }
function extension(name: string) { return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "bin"; }
function fail(error: unknown) { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error("Falha ao guardar anexo do Comando Altum:", error); return NextResponse.json({ error: "Não foi possível guardar este anexo privado." }, { status: 500 }); }

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    if (firebaseStorageBucketCandidates().length === 0) return NextResponse.json({ error: "Storage não configurado." }, { status: 503 });
    const form = await request.formData();
    const tenantId = clean(form.get("tenantId"));
    const uploaded = form.get("file");
    if (!tenantId || !(uploaded instanceof File)) throw new RouteAuthError(400, "attachment_invalid", "Escolha uma empresa e um arquivo válido.");
    if (!(await adminDb.collection("tenants").doc(tenantId).get()).exists) throw new RouteAuthError(404, "tenant_missing", "Empresa não encontrada.");
    const contentType = clean(uploaded.type, 180).toLowerCase();
    if (!ACCEPTED.test(contentType)) throw new RouteAuthError(400, "attachment_type", "Envie PDF, documento, planilha, texto, apresentação, imagem ou áudio comum.");
    if (!uploaded.size || uploaded.size > MAX_BYTES) throw new RouteAuthError(413, "attachment_size", "O anexo deve ter até 20 MB.");
    const filename = safeName(uploaded.name);
    const ref = adminDb.collection("agent_command_attachments").doc();
    const path = `agent-command/${tenantId}/${actor.uid}/${ref.id}-${randomUUID()}.${extension(filename)}`;
    await saveFirebaseStorageFileWithFallback({ path, data: Buffer.from(await uploaded.arrayBuffer()), options: { resumable: false, metadata: { contentType, cacheControl: "private,max-age=0,no-store", metadata: { tenantId, ownerId: actor.uid, attachmentId: ref.id, purpose: "agent_command_attachment", originalName: filename } } } });
    await ref.set({ ownerId: actor.uid, tenantId, filename, contentType, size: uploaded.size, storagePath: path, status: "stored", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await adminDb.collection("audit_logs").add({ type: "agent_command_attachment_uploaded", actorId: actor.uid, actorName: actor.name, tenantId, attachmentId: ref.id, contentType, size: uploaded.size, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, attachment: { id: ref.id, filename, contentType, size: uploaded.size } }, { status: 201 });
  } catch (error) { return fail(error); }
}
