import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

const LEADS_LIMIT = 120;
const TIMELINE_LIMIT = 12;

type LeadItem = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  status?: string;
  stage?: string;
  pipelineStage?: string;
  owner?: string;
  ownerId?: string;
  score?: number | null;
  heat?: string;
  priority?: string;
  potentialValue?: number | null;
  tags?: string[];
  notes?: string;
  customFields?: Record<string, string | number | boolean | null>;
  createdAt?: unknown;
  updatedAt?: unknown;
  chatSummary?: {
    total: number;
    open: number;
    pending: number;
    unresolved: number;
    highPriority: number;
    lastInteractionAt: unknown;
  };
  timeline: Array<Record<string, unknown>>;
};

type ChatRow = {
  id: string;
} & Record<string, unknown>;

function parseTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase().slice(0, 32) : ""))
        .filter(Boolean)
    )
  ).slice(0, 10);
}

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

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(-14);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const [leadsSnap, chatsSnap] = await Promise.all([
      adminDb.collection("leads").where("tenantId", "==", tenantId).limit(LEADS_LIMIT).get(),
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(300).get(),
    ]);

    const leads: LeadItem[] = leadsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          nome: typeof data.nome === "string" ? data.nome : "Lead",
          email: typeof data.email === "string" ? data.email : "",
          telefone: typeof data.telefone === "string" ? data.telefone : "",
          empresa: typeof data.empresa === "string" ? data.empresa : "",
          origem: typeof data.origem === "string" ? data.origem : "",
          channel: typeof data.channel === "string" ? data.channel : "",
          status: typeof data.status === "string" ? data.status : "novo",
          stage: typeof data.stage === "string" ? data.stage : "",
          pipelineStage: typeof data.pipelineStage === "string" ? data.pipelineStage : "captado",
          owner: typeof data.owner === "string" ? data.owner : "",
          ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
          score: typeof data.score === "number" ? data.score : null,
          heat: typeof data.heat === "string" ? data.heat : "",
          priority: typeof data.priority === "string" ? data.priority : "",
          potentialValue:
            typeof data.potentialValue === "number"
              ? data.potentialValue
              : typeof data.valorPotencial === "number"
                ? data.valorPotencial
                : null,
          tags: parseTags(data.tags),
          notes: typeof data.notes === "string" ? data.notes : "",
          customFields:
            data.customFields && typeof data.customFields === "object"
              ? (data.customFields as Record<string, string | number | boolean | null>)
              : {},
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          chatSummary: {
            total: 0,
            open: 0,
            pending: 0,
            unresolved: 0,
            highPriority: 0,
            lastInteractionAt: null,
          },
          timeline: [],
        };
      })
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));

    const chatRows: ChatRow[] = chatsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
    const chatSummaryByLead = new Map<string, LeadItem["chatSummary"]>();

    for (const lead of leads) {
      const phone = normalizePhone(lead.telefone);
      const relatedChats = chatRows.filter((chat) => {
        const chatLeadId = typeof chat.leadId === "string" ? chat.leadId : "";
        if (chatLeadId && chatLeadId === lead.id) return true;
        if (!phone) return false;
        return normalizePhone(chat.contactPhone) === phone;
      });

      const open = relatedChats.filter((chat) => String(chat.status || "open").toLowerCase() === "open").length;
      const pending = relatedChats.filter((chat) => String(chat.status || "").toLowerCase() === "pending").length;
      const unresolved = relatedChats.filter((chat) => {
        const status = String(chat.status || "open").toLowerCase();
        return status !== "resolved" && status !== "archived";
      }).length;
      const highPriority = relatedChats.filter((chat) => String(chat.priority || "").toLowerCase() === "high").length;
      const lastInteractionAt = relatedChats
        .map((chat) => chat.lastMessageTime || chat.updatedAt || null)
        .sort((a, b) => toTime(b) - toTime(a))[0] || null;

      chatSummaryByLead.set(lead.id, {
        total: relatedChats.length,
        open,
        pending,
        unresolved,
        highPriority,
        lastInteractionAt,
      });
    }

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
      chatSummary: chatSummaryByLead.get(lead.id) || lead.chatSummary,
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
