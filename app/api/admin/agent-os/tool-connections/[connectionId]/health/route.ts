import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { checkToolConnectionHealth } from "@/lib/server/agent-os/tool-connection-health";

function fail(error: unknown) { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); const code = error instanceof Error ? error.message : ""; if (code.startsWith("freellmapi_") || code.startsWith("openjev_") || code.startsWith("creative_executor_") || code) { console.warn("Teste de conexão não passou:", code.slice(0, 240)); return NextResponse.json({ error: "A conexão não respondeu como esperado. Confira a chave, o endereço e o modelo escolhido." }, { status: 422 }); } console.error("Falha no health check da conexão:", error); return NextResponse.json({ error: "Não foi possível testar a conexão." }, { status: 500 }); }

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { connectionId } = await context.params;
    const result = await checkToolConnectionHealth({ connectionId, actorId: actor.uid, actorName: actor.name });
    return NextResponse.json({ ok: true, healthy: true, details: result });
  } catch (error) {
    return fail(error);
  }
}
