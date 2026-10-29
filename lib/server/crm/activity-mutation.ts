import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTransactionalTenantAuthority } from "@/lib/server/tenant-operation-authority";
import { assertAssignedCommercialRecordAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { activityDateIso } from "@/lib/crm-activity";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import { TenantAccessError } from "@/lib/server/tenant";

export class TaskMutationError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Actor = { tenantId: string; leadId: string; userId: string; userName: string };
const own = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);
function string(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new TaskMutationError(400, "invalid_task_field", `${label} invalido.`);
  return value.trim();
}
function validId(value: unknown) { return typeof value === "string" && !!value && value === value.trim() && value.length <= 180 && !value.includes("/"); }
function date(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(value)) throw new TaskMutationError(400, "invalid_task_date", "Informe data e horario validos com fuso horario.");
  const [day] = value.split("T");
  const calendar = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== day || !activityDateIso(value)) throw new TaskMutationError(400, "invalid_task_date", "Data do retorno invalida.");
  return new Date(value);
}
function parse(value: unknown, creating: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TaskMutationError(400, "invalid_task_body", "Dados da tarefa invalidos.");
  const body = value as Record<string, unknown>, patch: Record<string, unknown> = {};
  if (creating || own(body, "title")) patch.title = string(body.title, 180, "Titulo");
  if (own(body, "dueAt")) patch.dueAt = date(body.dueAt);
  else if (creating) patch.dueAt = null;
  for (const [field, fallback, max] of [["type", "follow_up", 40], ["priority", "medium", 20]] as const) {
    if (own(body, field) || creating) patch[field] = own(body, field) ? string(body[field], max, field).toLowerCase() : fallback;
  }
  if (patch.priority && !["low", "medium", "high"].includes(String(patch.priority))) throw new TaskMutationError(400, "invalid_task_priority", "Prioridade invalida.");
  if (own(body, "ownerUserId")) { if (!validId(body.ownerUserId)) throw new TaskMutationError(400, "invalid_task_owner", "Responsavel invalido."); patch.ownerUserId = body.ownerUserId; }
  if (own(body, "status")) {
    if (!["pending", "done", "canceled"].includes(String(body.status)) || creating && body.status !== "pending") throw new TaskMutationError(400, "invalid_task_status", "Estado da tarefa invalido.");
    patch.status = body.status;
  }
  if (!creating && !Object.keys(patch).length) throw new TaskMutationError(400, "empty_task_patch", "Informe o que deseja alterar na tarefa.");
  if (own(body, "expectedVersion") && (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0)) throw new TaskMutationError(400, "invalid_task_version", "Versao da tarefa invalida.");
  if (own(body, "requestId") && !validId(body.requestId)) throw new TaskMutationError(400, "invalid_task_request", "Identificador do pedido invalido.");
  if (own(body, "expectedRevision") && (typeof body.expectedRevision !== "string" || !/^\d+:\d{1,9}$/.test(body.expectedRevision))) throw new TaskMutationError(400, "invalid_task_revision", "Revisao da tarefa invalida.");
  return { patch, requestId: body.requestId as string | undefined, expectedVersion: body.expectedVersion as number | undefined, expectedRevision: body.expectedRevision as string | undefined };
}
async function parent(tx: FirebaseFirestore.Transaction, actor: Actor) {
  if (![actor.tenantId, actor.leadId, actor.userId].every(validId)) throw new TaskMutationError(400, "invalid_task_context", "Contexto da tarefa invalido.");
  const membership = await assertTransactionalTenantAuthority(tx, { tenantId: actor.tenantId, userId: actor.userId, capability: "edit_leads", module: "crm" });
  const ref = adminDb.collection("leads").doc(actor.leadId), snapshot = await tx.get(ref), lead = snapshot.data();
  if (!lead) throw new TaskMutationError(404, "lead_not_found", "Oportunidade nao encontrada.");
  if (lead.tenantId !== actor.tenantId) throw new TenantAccessError("lead_tenant_mismatch", "Oportunidade fora desta empresa.");
  assertAssignedCommercialRecordAccess(membership, actor.userId, lead);
  return { ref, lead, membership };
}
async function owner(tx: FirebaseFirestore.Transaction, actor: Actor, userId: string, lead: Record<string, unknown>, team: boolean) {
  if (!validId(userId)) throw new TaskMutationError(400, "invalid_task_owner", "Responsavel invalido.");
  if (userId !== actor.userId && !team) throw new TenantAccessError("task_assignment_denied", "Somente gestores podem atribuir retornos a outro vendedor.");
  const membership = await assertTransactionalTenantAuthority(tx, { tenantId: actor.tenantId, userId, capability: "edit_leads", module: "crm" });
  // Assignment must not leave an activity inaccessible to its responsible user.
  assertAssignedCommercialRecordAccess(membership, userId, lead);
  const user = await tx.get(adminDb.collection("users").doc(userId));
  return { ownerUserId: userId, ownerName: String(user.data()?.name || (userId === actor.userId ? actor.userName : lead.owner || "Vendedor")) };
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function createCommercialTask(actor: Actor, body: unknown) {
  const { patch, requestId } = parse(body, true), requestHash = hash(JSON.stringify(patch));
  const tasks = adminDb.collection("lead_tasks");
  const ref = requestId ? tasks.doc(`manual_${hash(`${actor.tenantId}\0${actor.leadId}\0${actor.userId}\0${requestId}`)}`) : tasks.doc();
  return adminDb.runTransaction(async tx => {
    const context = await parent(tx, actor), existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.creationRequestHash !== requestHash) throw new TaskMutationError(409, "task_request_conflict", "Este pedido ja foi usado para outra tarefa.");
      return { taskId: ref.id, deduped: true, version: Number(existing.data()?.version || 0) };
    }
    const responsible = await owner(tx, actor, String(patch.ownerUserId || actor.userId), context.lead, hasTeamWideCommercialAccess(context.membership));
    // Legacy callers without a request ID retain pending-task deduplication, now
    // including the date and responsible user so distinct returns are not lost.
    if (!requestId) {
      const pending = await tx.get(adminDb.collection("lead_tasks").where("tenantId", "==", actor.tenantId).where("leadId", "==", actor.leadId).where("status", "==", "pending"));
      const key = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      const duplicate = pending.docs.find(doc => {
        const task = doc.data();
        return key(task.title) === key(patch.title) && key(task.type || "follow_up") === key(patch.type) && activityDateIso(task.dueAt) === activityDateIso(patch.dueAt) &&
          String(task.ownerUserId || context.lead.ownerId || actor.userId) === responsible.ownerUserId;
      });
      if (duplicate) return { taskId: duplicate.id, deduped: true, version: Number(duplicate.data().version || 0) };
    }
    tx.create(ref, withCommercialTaskIndex({ tenantId: actor.tenantId, leadId: actor.leadId, ...patch, ...responsible, status: "pending", source: "manual", version: 1,
      creationRequestHash: requestHash, createdBy: actor.userId, createdByName: actor.userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }));
    tx.create(context.ref.collection("events").doc(`task_created_${ref.id}`), { tenantId: actor.tenantId, taskId: ref.id, type: "task_created", title: "Retorno criado", detail: patch.title,
      actorId: actor.userId, actorName: actor.userName, dueAt: patch.dueAt, ownerUserId: responsible.ownerUserId, createdAt: FieldValue.serverTimestamp() });
    return { taskId: ref.id, deduped: false, version: 1 };
  });
}
export async function updateCommercialTask(actor: Actor & { taskId: string }, body: unknown) {
  const { patch, expectedVersion, expectedRevision } = parse(body, false);
  if (!validId(actor.taskId)) throw new TaskMutationError(400, "invalid_task_id", "Tarefa invalida.");
  const ref = adminDb.collection("lead_tasks").doc(actor.taskId);
  return adminDb.runTransaction(async tx => {
    const context = await parent(tx, actor), snapshot = await tx.get(ref), current = snapshot.data();
    if (!current) throw new TaskMutationError(404, "task_not_found", "Tarefa nao encontrada.");
    if (current.tenantId !== actor.tenantId || current.leadId !== actor.leadId) throw new TenantAccessError("task_tenant_mismatch", "Tarefa fora desta oportunidade.");
    const version = Number(current.version || 0);
    const requestedChange = Object.entries(patch).some(([key, value]) => key === "dueAt" ? activityDateIso(value) !== activityDateIso(current[key]) : value !== current[key]);
    const revision = `${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`;
    if (((expectedVersion !== undefined && expectedVersion !== version) || (expectedRevision !== undefined && expectedRevision !== revision)) && requestedChange) throw new TaskMutationError(409, "task_version_conflict", "Esta tarefa foi alterada. Atualize antes de salvar novamente.");
    if (patch.ownerUserId && patch.ownerUserId !== current.ownerUserId) Object.assign(patch, await owner(tx, actor, String(patch.ownerUserId), context.lead, hasTeamWideCommercialAccess(context.membership)));
    const changed = Object.entries(patch).filter(([key, value]) => key === "dueAt" ? activityDateIso(value) !== activityDateIso(current[key]) : value !== current[key]);
    if (!changed.length) return { taskId: ref.id, status: current.status || "pending", version, unchanged: true };
    const next = Object.fromEntries(changed);
    if (own(next, "status")) {
      next.completedAt = next.status === "done" ? FieldValue.serverTimestamp() : null;
      next.canceledAt = next.status === "canceled" ? FieldValue.serverTimestamp() : null;
    }
    tx.update(ref, withCommercialTaskIndex({ ...next, source: "manual", version: version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.userId, updatedByName: actor.userName }, current));
    tx.create(context.ref.collection("events").doc(`task_updated_${ref.id}_${version + 1}`), { tenantId: actor.tenantId, taskId: ref.id, type: own(next, "status") ? "task_status_update" : "task_updated",
      title: next.status === "done" ? "Retorno concluido" : next.status === "pending" ? "Retorno reaberto" : next.status === "canceled" ? "Retorno cancelado" : "Retorno atualizado",
      detail: patch.title || current.title, changedFields: changed.map(([key]) => key), actorId: actor.userId, actorName: actor.userName, createdAt: FieldValue.serverTimestamp() });
    return { taskId: ref.id, status: patch.status || current.status || "pending", version: version + 1, unchanged: false };
  });
}
