import {
  requireRequestUser,
  RouteAuthError,
} from "@/app/lib/server/route-auth";
import { getAgencyCatalog } from "@/lib/server/agent-os/agent-catalog";

function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha ao carregar o catálogo de agentes:", error);
  return Response.json(
    { error: "Não foi possível carregar o catálogo de agentes." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const items = getAgencyCatalog().map(
      ({ manifest, activation, ...agent }) => ({
        ...agent,
        manifest: manifest
          ? {
              version: manifest.version,
              executionMode: manifest.executionMode,
              capabilities: manifest.capabilities,
              allowedConnectionKinds: manifest.allowedConnectionKinds,
              approvalCapabilities: manifest.approvalCapabilities,
              limits: manifest.limits,
              evaluationIds: manifest.evaluationIds,
            }
          : null,
        activation,
      }),
    );
    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
