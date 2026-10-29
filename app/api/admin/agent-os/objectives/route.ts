import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";
import { objectiveSchema } from "@/lib/server/agent-os/control-plane-contracts";

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha ao operar objetivos:", error);
  return Response.json(
    { error: "Não foi possível operar objetivos." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const rows = await adminDb.collection("agent_objectives").limit(200).get();
    return Response.json({
      items: rows.docs.map((doc) => ({
        id: doc.id,
        tenantId: String(doc.get("tenantId") || ""),
        title: String(doc.get("title") || "Objetivo sem título"),
        statement: String(doc.get("statement") || ""),
        status: String(doc.get("status") || "draft"),
        successMetrics: Array.isArray(doc.get("successMetrics"))
          ? (doc.get("successMetrics") as unknown[])
              .filter(
                (metric: unknown): metric is { name: string; target: string } =>
                  metric !== null &&
                  typeof metric === "object" &&
                  "name" in metric &&
                  "target" in metric &&
                  typeof metric.name === "string" &&
                  typeof metric.target === "string",
              )
              .map((metric: { name: string; target: string }) => ({
                name: metric.name,
                target: metric.target,
              }))
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
    const ref = adminDb.collection("agent_objectives").doc();
    const parsed = objectiveSchema.safeParse({
      ...body,
      id: ref.id,
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success)
      throw new RouteAuthError(
        400,
        "invalid_objective",
        "Revise o objetivo e seus indicadores.",
      );
    const tenant = await adminDb
      .collection("tenants")
      .doc(parsed.data.tenantId)
      .get();
    if (!tenant.exists)
      throw new RouteAuthError(
        404,
        "tenant_missing",
        "Empresa não encontrada.",
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
      !["draft", "active", "achieved", "cancelled"].includes(String(status))
    )
      throw new RouteAuthError(
        400,
        "invalid_objective_status",
        "Informe um objetivo e um estado válido.",
      );
    const ref = adminDb.collection("agent_objectives").doc(id);
    await adminDb.runTransaction(async (transaction) => {
      const objective = await transaction.get(ref);
      if (!objective.exists)
        throw new RouteAuthError(
          404,
          "objective_missing",
          "Objetivo não encontrado.",
        );
      const previousStatus = String(objective.get("status") || "draft");
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
        type: "agent_objective_status_changed",
        actorId: actor.uid,
        actorName: actor.name,
        tenantId: String(objective.get("tenantId") || ""),
        objectiveId: id,
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
