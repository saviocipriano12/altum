import "server-only";
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { RouteAuthError } from "@/app/lib/server/route-auth";

/** Publish the report and sync timestamp together only for the unchanged connection. */
export async function persistOperatorReport(channel: DocumentSnapshot, collection: string, reportId: string, data: Record<string, unknown>) {
  await adminDb.runTransaction(async transaction => {
    const current = await transaction.get(channel.ref);
    if (!current.exists || !channel.updateTime || !current.updateTime?.isEqual(channel.updateTime)) {
      throw new RouteAuthError(409, "connection_changed", "A conexão mudou durante a consulta. Atualize a conta novamente.");
    }
    transaction.set(adminDb.collection(collection).doc(reportId), data, { merge: true });
    transaction.set(channel.ref, { lastSyncAt: FieldValue.serverTimestamp(), connectionStatus: "ready", lastError: "", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}
