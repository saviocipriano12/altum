export type RuntimeMissionOperation = "plan" | "execute" | "pause" | "cancel";
import type { MissionStatus } from "@/lib/server/agent-os/missions";

export type RuntimeMissionEventType =
  | "mission.progress"
  | "mission.await_approval"
  | "mission.completed"
  | "mission.failed"
  | "mission.cancelled";

/**
 * Planning is an execution that enriches the mission, not the mission's
 * business work itself. Its terminal event must never close the task plan.
 */
export function isPlanningRuntimeEvent(operation: string): operation is "plan" {
  return operation === "plan";
}

export function isPauseRuntimeEvent(operation: string): operation is "pause" {
  return operation === "pause";
}

export function missionStatusForRuntimeEvent(
  operation: string,
  type: RuntimeMissionEventType,
): MissionStatus | null {
  // Planning enriches the plan and pausing only acknowledges an operator
  // decision. Neither callback is allowed to reopen or close business work.
  if (isPlanningRuntimeEvent(operation) || isPauseRuntimeEvent(operation))
    return null;
  if (type === "mission.progress") return "running";
  if (type === "mission.await_approval") return "waiting_approval";
  if (type === "mission.completed") return "completed";
  if (type === "mission.failed") return "failed";
  return "cancelled";
}
