import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";

type RouteContext = { params: Promise<{ missionId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha ao consultar histórico da missão:", error);
  return Response.json(
    { error: "Não foi possível consultar o histórico da missão." },
    { status: 500 },
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const { missionId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(missionId)) {
      throw new RouteAuthError(400, "invalid_mission", "Missão inválida.");
    }
    const mission = await adminDb
      .collection("agent_missions")
      .doc(missionId)
      .get();
    if (!mission.exists)
      throw new RouteAuthError(
        404,
        "mission_missing",
        "Missão não encontrada.",
      );
    const tenantId = String(mission.get("tenantId") || "");
    const events = await adminDb
      .collection("agent_domain_events")
      .where("missionId", "==", missionId)
      .limit(200)
      .get();
    const items = events.docs
      .filter((doc) => doc.get("tenantId") === tenantId)
      .map((doc) => {
        const row = doc.data();
        const payload =
          row.payload && typeof row.payload === "object"
            ? (row.payload as Record<string, unknown>)
            : {};
        const actor =
          row.actor && typeof row.actor === "object"
            ? (row.actor as Record<string, unknown>)
            : {};
        return {
          id: doc.id,
          eventId: String(row.eventId || doc.id),
          type: String(row.type || "unknown"),
          occurredAt:
            typeof row.occurredAt === "string" ? row.occurredAt : null,
          actor: {
            type: String(actor.type || "system"),
            id: String(actor.id || "altum"),
          },
          taskId: typeof row.taskId === "string" ? row.taskId : null,
          dispatchId:
            typeof row.dispatchId === "string" ? row.dispatchId : null,
          from: typeof payload.from === "string" ? payload.from : null,
          to: typeof payload.to === "string" ? payload.to : null,
          reason: typeof payload.reason === "string" ? payload.reason : null,
          attempt: typeof payload.attempt === "number" ? payload.attempt : null,
        };
      })
      .sort((left, right) =>
        String(right.occurredAt || "").localeCompare(
          String(left.occurredAt || ""),
        ),
      );
    return Response.json(
      { missionId, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
