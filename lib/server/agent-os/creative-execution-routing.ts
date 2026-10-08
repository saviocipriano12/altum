import "server-only";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { MediaConnection } from "@/lib/server/agent-os/creative-executor";
import { mediaConnectionAvailability } from "@/lib/server/agent-os/creative-model-router";

type JobRouteData = {
  connectionId?: unknown;
  fallbackConnectionIds?: unknown;
  capability?: unknown;
  tenantId?: unknown;
};

/** Resolves the immutable route order saved with a creative job. Credentials
 * remain in Firestore and are never copied into the job or returned to a UI. */
export async function loadCreativeExecutionCandidates(job: JobRouteData) {
  const ids = [
    typeof job.connectionId === "string" ? job.connectionId : "",
    ...(Array.isArray(job.fallbackConnectionIds) ? job.fallbackConnectionIds.filter((value): value is string => typeof value === "string") : []),
  ].filter((id, index, all) => id && all.indexOf(id) === index).slice(0, 8);
  const snapshots = await Promise.all(ids.map((id) => adminDb.collection("tool_connections").doc(id).get()));
  const capability = typeof job.capability === "string" ? job.capability : "";
  const tenantId = typeof job.tenantId === "string" ? job.tenantId : "";
  return snapshots.flatMap((snapshot) => {
    if (!snapshot.exists) return [];
    const connection = snapshot.data()! as MediaConnection & { status?: unknown; capabilities?: unknown; scope?: unknown; tenantId?: unknown; health?: unknown };
    const capabilities = Array.isArray(connection.capabilities) ? connection.capabilities.map(String) : [];
    const status = String(connection.status || "pending_config");
    const scoped = connection.scope !== "tenant" || String(connection.tenantId || "") === tenantId;
    if (!scoped || !mediaConnectionAvailability({ status, health: connection.health }).available || !capabilities.includes(capability)) return [];
    return [{ id: snapshot.id, connection }];
  });
}
