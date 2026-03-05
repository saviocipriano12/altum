import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

const LEADS_LIMIT = 120;
const TIMELINE_LIMIT = 12;

type LeadItem = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  status?: string;
  stage?: string;
  pipelineStage?: string;
  owner?: string;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  timeline: Array<Record<string, unknown>>;
};

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
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
    await assertTenantAccess(user.uid, tenantId);

    const leadsSnap = await adminDb
      .collection("leads")
      .where("tenantId", "==", tenantId)
      .limit(LEADS_LIMIT)
      .get();

    const leads: LeadItem[] = leadsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          nome: typeof data.nome === "string" ? data.nome : "Lead",
          email: typeof data.email === "string" ? data.email : "",
          telefone: typeof data.telefone === "string" ? data.telefone : "",
          status: typeof data.status === "string" ? data.status : "novo",
          stage: typeof data.stage === "string" ? data.stage : "",
          pipelineStage: typeof data.pipelineStage === "string" ? data.pipelineStage : "captado",
          owner: typeof data.owner === "string" ? data.owner : "",
          ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          timeline: [],
        };
      })
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));

    const timelineByLead = await Promise.all(
      leads.map(async (lead) => {
        const eventsSnap = await adminDb
          .collection("leads")
          .doc(lead.id)
          .collection("events")
          .orderBy("createdAt", "desc")
          .limit(TIMELINE_LIMIT)
          .get();

        return {
          leadId: lead.id,
          timeline: eventsSnap.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Record<string, unknown>),
          })),
        };
      })
    );

    const timelineMap = new Map(timelineByLead.map((item) => [item.leadId, item.timeline]));
    const items = leads.map((lead) => ({
      ...lead,
      timeline: timelineMap.get(lead.id) || [],
    }));

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar leads do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar leads." }, { status: 500 });
  }
}
