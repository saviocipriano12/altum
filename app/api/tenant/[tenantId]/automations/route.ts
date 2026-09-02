import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { listTenantAutomations, normalizeAutomationDoc } from "@/lib/server/automations";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = Record<string, unknown>;
type AutomationExecutionItem = {
  id: string;
  updatedAt?: unknown;
  [key: string]: unknown;
};

function toMillis(value: unknown) {
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "automation");
    assertTenantRole(membership, "client_viewer");

    const [items, jobsSnap] = await Promise.all([
      listTenantAutomations(tenantId),
      adminDb
        .collection("jobs")
        .where("tenantId", "==", tenantId)
        .where("type", "==", "automation_execution")
        .limit(120)
        .get(),
    ]);

    const executions: AutomationExecutionItem[] = jobsSnap.docs
      .map(
        (doc): AutomationExecutionItem => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })
      )
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
      .slice(0, 24);

    return NextResponse.json({ ok: true, tenantId, items, executions });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar automacoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar automacoes." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "automation");
    assertTenantCapability(membership, "manage_automations");

    const body = (await req.json()) as Body;
    const docRef = adminDb.collection("automations").doc();
    const normalized = normalizeAutomationDoc(
      docRef.id,
      {
        ...body,
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      tenantId
    );

    if (!normalized.name || normalized.actions.length === 0) {
      return NextResponse.json({ error: "Automacao invalida. Defina nome e pelo menos uma acao." }, { status: 400 });
    }

    await docRef.set({
      tenantId,
      name: normalized.name,
      description: normalized.description,
      trigger: normalized.trigger,
      enabled: normalized.enabled,
      status: normalized.status,
      conditions: normalized.conditions,
      actions: normalized.actions,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    });

    return NextResponse.json({ ok: true, tenantId, automationId: docRef.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar automacao do tenant:", error);
    return NextResponse.json({ error: "Falha ao criar automacao." }, { status: 500 });
  }
}
