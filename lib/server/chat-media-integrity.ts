import { createHash } from "node:crypto";
import type { File } from "@google-cloud/storage";
import { adminDb } from "@/app/lib/server/firebase-admin";

export function assertOutboundMediaPath(tenantId: string, chatId: string, path: string) {
  if (!path.startsWith(`chat-media/${tenantId}/${chatId}/`) || path.includes("..")) throw new Error("Arquivo de midia fora do tenant ou conversa.");
}

/** Check the accepted content and bind subsequent reads to the verified object generation. */
export async function readVerifiedOutboundMedia(input: {
  tenantId: string; chatId: string; jobId: string; storagePath: string; file: File;
}) {
  assertOutboundMediaPath(input.tenantId, input.chatId, input.storagePath);
  const admission = await adminDb.collection("chat_media_uploads").doc(input.jobId).get();
  const data = admission.data();
  if (admission.exists && (data?.tenantId !== input.tenantId || data?.chatId !== input.chatId || data?.storagePath !== input.storagePath ||
    (data?.bucketName && data.bucketName !== input.file.bucket.name) || !/^[a-f0-9]{64}$/.test(String(data?.contentSha256 || "")))) {
    throw new Error("Falha de integridade: admissao de midia incompativel.");
  }
  const [metadata] = await input.file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > 32 * 1024 * 1024 || (admission.exists && size !== Number(data?.mediaSize))) {
    throw new Error("Falha de integridade: tamanho do arquivo incompativel.");
  }
  const generation = String(metadata.generation || "");
  if (!/^\d+$/.test(generation)) throw new Error("Falha de integridade: arquivo sem versao verificavel.");
  const file = input.file.bucket.file(input.file.name, { generation });
  const [source] = await file.download();
  const sha256 = createHash("sha256").update(source).digest("hex");
  if (admission.exists && sha256 !== data?.contentSha256) throw new Error("Falha de integridade: arquivo de midia alterado apos o aceite.");
  return { file, source, generation, sha256, origin: admission.exists ? "upload_admission" : "legacy_unbound" };
}
