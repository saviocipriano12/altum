import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";
import { programSchema } from "@/lib/server/agent-os/control-plane-contracts";

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha ao operar programas:", error);
  return Response.json(
    { error: "Não foi possível operar programas." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const rows = await adminDb.collection("agent_programs").limit(200).get();
    return Response.json({
      items: rows.docs.map((doc) => ({
        id: doc.id,
        tenantId: String(doc.get("tenantId") || ""),
        objectiveId: String(doc.get("objectiveId") || ""),
        title: String(doc.get("title") || "Programa sem título"),
        status: String(doc.get("status") || "draft"),
        missionIds: Array.isArray(doc.get("missionIds"))
          ? (doc.get("missionIds") as unknown[]).filter(
              (id: unknown): id is string => typeof id === "string",
            )
          : [],
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, {
      roles: ["agency_admin"],
    });
    const body = (await request.json()) as Record<string, unknown>;
    const ref = adminDb.collection("agent_programs").doc();
    const parsed = programSchema.safeParse({
      ...body,
      id: ref.id,
      missionIds: [],
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success)
      throw new RouteAuthError(
        400,
        "invalid_program",
        "Revise o programa informado.",
      );
    const objective = await adminDb
      .collection("agent_objectives")
      .doc(parsed.data.objectiveId)
      .get();
    if (!objective.exists || objective.get("tenantId") !== parsed.data.tenantId)
      throw new RouteAuthError(
        409,
        "objective_scope_mismatch",
        "O objetivo não pertence à empresa do programa.",
      );
    await ref.set({
      ...parsed.data,
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return Response.json({ ok: true, id: ref.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRequestUser(request, {
      roles: ["agency_admin"],
    });
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status;
    if (
      !id ||
      !["draft", "active", "paused", "completed", "cancelled"].includes(
        String(status),
      )
    )
      throw new RouteAuthError(
        400,
        "invalid_program_status",
        "Informe um programa e um estado válido.",
      );
    const ref = adminDb.collection("agent_programs").doc(id);
    await adminDb.runTransaction(async (transaction) => {
      const program = await transaction.get(ref);
      if (!program.exists)
        throw new RouteAuthError(
          404,
          "program_missing",
          "Programa não encontrado.",
        );
      const previousStatus = String(program.get("status") || "draft");
      transaction.set(
        ref,
        {
          status,
          updatedBy: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      transaction.set(adminDb.collection("audit_logs").doc(), {
        type: "agent_program_status_changed",
        actorId: actor.uid,
        actorName: actor.name,
        tenantId: String(program.get("tenantId") || ""),
        programId: id,
        objectiveId: String(program.get("objectiveId") || ""),
        from: previousStatus,
        to: status,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
