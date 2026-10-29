import {
  MISSION_STATUSES,
  type MissionStatus,
} from "@/lib/server/agent-os/missions";

const transitions: Readonly<Record<MissionStatus, readonly MissionStatus[]>> = {
  draft: ["planned", "cancelled"],
  planned: ["running", "waiting_approval", "paused", "cancelled"],
  running: ["waiting_approval", "paused", "completed", "failed", "cancelled"],
  waiting_approval: ["running", "paused", "cancelled"],
  paused: ["running", "cancelled"],
  completed: [],
  failed: ["running", "cancelled"],
  cancelled: [],
};

export function isMissionStatus(value: unknown): value is MissionStatus {
  return (
    typeof value === "string" &&
    (MISSION_STATUSES as readonly string[]).includes(value)
  );
}

export function canTransitionMission(
  current: MissionStatus,
  next: MissionStatus,
) {
  return transitions[current].includes(next);
}

export function assertMissionTransition(
  current: MissionStatus,
  next: MissionStatus,
) {
  if (!canTransitionMission(current, next)) {
    throw new Error(`Transição de missão inválida: ${current} → ${next}.`);
  }
}
