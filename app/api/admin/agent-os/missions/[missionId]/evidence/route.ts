import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";

type RouteContext = { params: Promise<{ missionId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha ao consultar evidências da missão:", error);
  return Response.json(
    { error: "Não foi possível consultar as evidências da missão." },
    { status: 500 },
  );
}

/** Returns only operator-safe evidence metadata, never runtime envelopes. */
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
    if (!mission.exists) {
      throw new RouteAuthError(
        404,
        "mission_missing",
        "Missão não encontrada.",
      );
    }
    const tenantId = String(mission.get("tenantId") || "");
    const evidence = await adminDb
      .collection("agent_mission_evidence")
      .where("missionId", "==", missionId)
      .limit(200)
      .get();
    const items = evidence.docs
      .filter((doc) => doc.get("tenantId") === tenantId)
      .map((doc) => ({
        id: doc.id,
        kind: String(doc.get("kind") || "artifact"),
        label: String(doc.get("label") || "Evidência sem título"),
        uri: typeof doc.get("uri") === "string" ? doc.get("uri") : null,
        taskId:
          typeof doc.get("taskId") === "string" ? doc.get("taskId") : null,
        executionId:
          typeof doc.get("executionId") === "string"
            ? doc.get("executionId")
            : null,
        capturedAt:
          typeof doc.get("capturedAt") === "string"
            ? doc.get("capturedAt")
            : null,
        source:
          typeof doc.get("source") === "string" ? doc.get("source") : null,
      }))
      .sort((left, right) =>
        String(right.capturedAt || "").localeCompare(
          String(left.capturedAt || ""),
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
