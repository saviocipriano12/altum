import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";

const MAX_BYTES = { visual: 16 * 1024 * 1024, voice: 32 * 1024 * 1024, motion: 96 * 1024 * 1024 };
const ACCEPTED: Record<keyof typeof MAX_BYTES, RegExp> = { visual: /^image\/(jpeg|png|webp)$/i, voice: /^audio\/(mpeg|mp4|wav|webm|ogg)$/i, motion: /^video\/(mp4|webm|quicktime)$/i };
type ReferenceKind = keyof typeof MAX_BYTES;

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function safeName(value: string) { return clean(value, 180).replace(/[^\w.\- ]+/g, "_") || `referencia-${Date.now()}`; }
function extension(name: string, kind: ReferenceKind) { return name.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase() || (kind === "visual" ? "jpg" : kind === "voice" ? "webm" : "mp4"); }
function date(value: unknown) { return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate().toISOString() : null; }
function fail(error: unknown) { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error("Falha nas referências do avatar:", error); return NextResponse.json({ error: "Não foi possível processar a referência privada." }, { status: 500 }); }

async function profileFor(request: Request, avatarId: string) {
  const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
  const ref = adminDb.collection("avatar_profiles").doc(avatarId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new RouteAuthError(404, "avatar_missing", "Avatar não encontrado.");
  const profile = snapshot.data() || {};
  const authorized = profile.identityType === "character" ? profile.rightsConfirmed === true : profile.likenessConsent === true && profile.voiceConsent === true;
  if (!authorized) throw new RouteAuthError(409, "consent_missing", "Este perfil ainda não tem autorização de identidade e voz, ou direitos confirmados do personagem.");
  return { actor, ref, profile };
}

export async function GET(request: Request, context: { params: Promise<{ avatarId: string }> }) {
  try {
    const { avatarId } = await context.params;
    const { ref } = await profileFor(request, avatarId);
    const references = await ref.collection("references").orderBy("createdAt", "desc").limit(30).get();
    return NextResponse.json({ items: references.docs.map((item) => { const row = item.data(); return { id: item.id, kind: String(row.kind || ""), filename: String(row.filename || ""), contentType: String(row.contentType || ""), size: Number(row.size || 0), createdAt: date(row.createdAt) }; }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request, context: { params: Promise<{ avatarId: string }> }) {
  try {
    const { avatarId } = await context.params;
    const { actor, ref, profile } = await profileFor(request, avatarId);
    if (firebaseStorageBucketCandidates().length === 0) return NextResponse.json({ error: "Storage não configurado." }, { status: 503 });
    const form = await request.formData();
    const kind = clean(form.get("kind"), 20) as ReferenceKind;
    const uploaded = form.get("file");
    if (!(kind in MAX_BYTES) || !(uploaded instanceof File)) throw new RouteAuthError(400, "invalid_reference", "Envie uma referência visual, de voz ou de movimento.");
    const contentType = clean(uploaded.type, 140).toLowerCase();
    if (!ACCEPTED[kind].test(contentType)) throw new RouteAuthError(400, "invalid_media", "O tipo de arquivo não corresponde à referência selecionada.");
    if (!uploaded.size || uploaded.size > MAX_BYTES[kind]) throw new RouteAuthError(413, "file_too_large", `Arquivo acima do limite de ${Math.round(MAX_BYTES[kind] / 1024 / 1024)} MB.`);
    const filename = safeName(uploaded.name);
    const path = `avatar-references/${clean(String(profile.tenantId), 180)}/${avatarId}/${randomUUID()}.${extension(filename, kind)}`;
    await saveFirebaseStorageFileWithFallback({ path, data: Buffer.from(await uploaded.arrayBuffer()), options: { resumable: false, metadata: { contentType, cacheControl: "private,max-age=0,no-store", metadata: { tenantId: String(profile.tenantId || ""), avatarId, uploadedBy: actor.uid, purpose: "avatar_reference", referenceKind: kind, originalName: filename } } } });
    const existing = await ref.collection("references").select("kind").get();
    const kinds = new Set(existing.docs.map((item) => String(item.get("kind") || ""))); kinds.add(kind);
    const status = kinds.has("visual") && kinds.has("voice") ? "anchor_required" : "reference_incomplete";
    const referenceRef = ref.collection("references").doc();
    const batch = adminDb.batch();
    batch.set(referenceRef, { tenantId: profile.tenantId, avatarId, kind, filename, contentType, size: uploaded.size, storagePath: path, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
    batch.update(ref, { status, referenceCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "avatar_reference_uploaded", actorId: actor.uid, actorName: actor.name, tenantId: profile.tenantId, avatarId, referenceId: referenceRef.id, kind, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return NextResponse.json({ ok: true, status, reference: { id: referenceRef.id, kind, filename, contentType, size: uploaded.size } }, { status: 201 });
  } catch (error) { return fail(error); }
}
