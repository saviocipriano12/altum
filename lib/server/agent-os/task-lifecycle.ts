export const TASK_STATUSES = [
  "draft",
  "queued",
  "ready",
  "claimed",
  "running",
  "waiting_approval",
  "retry_scheduled",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "rejected",
  "expired",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const transitions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  draft: ["queued", "ready", "cancelled"],
  queued: ["ready", "paused", "cancelled", "expired"],
  ready: ["claimed", "running", "waiting_approval", "paused", "cancelled"],
  claimed: ["running", "retry_scheduled", "failed", "cancelled", "expired"],
  running: ["waiting_approval", "retry_scheduled", "paused", "completed", "failed", "cancelled"],
  waiting_approval: ["ready", "rejected", "cancelled", "expired"],
  retry_scheduled: ["ready", "paused", "failed", "cancelled", "expired"],
  paused: ["ready", "cancelled", "expired"],
  completed: [],
  failed: ["retry_scheduled", "cancelled"],
  cancelled: [],
  rejected: ["queued", "cancelled"],
  expired: ["queued", "cancelled"],
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export function canTransitionTask(current: TaskStatus, next: TaskStatus) {
  return transitions[current].includes(next);
}

export function assertTaskTransition(current: TaskStatus, next: TaskStatus) {
  if (!canTransitionTask(current, next)) {
    throw new Error(`Transição de tarefa inválida: ${current} → ${next}.`);
  }
}

export function taskStatusLabel(status: TaskStatus) {
  const labels: Record<TaskStatus, string> = {
    draft: "Rascunho",
    queued: "Na fila",
    ready: "Pronta para iniciar",
    claimed: "Reservada pelo executor",
    running: "Em execução",
    waiting_approval: "Aguardando aprovação",
    retry_scheduled: "Nova tentativa agendada",
    paused: "Pausada",
    completed: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
    rejected: "Rejeitada",
    expired: "Expirada",
  };
  return labels[status];
}

