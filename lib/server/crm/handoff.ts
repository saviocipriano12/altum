import { adminDb } from "@/app/lib/server/firebase-admin";

type GenericRow = { id: string } & Record<string, unknown>;
type ChatMessageRow = GenericRow & { chatId: string };

export type LeadHandoffContext = {
  status: "monitoring" | "ready";
  reasonCode: string;
  reasonLabel: string;
  summary: string;
  recommendedOwnerId: string | null;
  recommendedOwnerName: string | null;
  chatCount: number;
  transcript: Array<{
    id: string;
    chatId: string;
    author: string;
    direction: string;
    text: string;
    sentAt: unknown;
  }>;
  aiContext: {
    decision: string | null;
    nextAction: string | null;
    confidence: number | null;
  };
  notes: Array<{
    id: string;
    text: string;
    authorName: string;
    createdAt: unknown;
  }>;
  openTasks: Array<{
    id: string;
    title: string;
    type: string;
    priority: string;
    dueAt: unknown;
  }>;
};

function cleanText(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(-14);
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
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

async function listRelatedChats(tenantId: string, leadId: string, phone: string) {
  const normalizedPhone = normalizePhone(phone);
  const [byLeadSnap, byPhoneSnap] = await Promise.all([
    adminDb.collection("chats").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(8).get(),
    normalizedPhone
      ? adminDb.collection("chats").where("tenantId", "==", tenantId).where("contactPhone", "==", normalizedPhone).limit(8).get()
      : Promise.resolve(null),
  ]);

  const unique = new Map<string, Record<string, unknown>>();
  for (const doc of byLeadSnap.docs) {
    unique.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
  }
  for (const doc of byPhoneSnap?.docs || []) {
    unique.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
  }

  return Array.from(unique.values())
    .sort((a, b) => toTime(b.lastMessageTime || b.updatedAt) - toTime(a.lastMessageTime || a.updatedAt))
    .slice(0, 3);
}

export async function buildLeadHandoffContext(input: {
  tenantId: string;
  leadId: string;
  lead: Record<string, unknown>;
  qualification: {
    score: number;
    aiSignal: { decision: string | null; nextAction: string | null; confidence: number | null };
  };
  recommendedOwnerId?: string | null;
  recommendedOwnerName?: string | null;
}) {
  const chats = await listRelatedChats(input.tenantId, input.leadId, cleanText(input.lead.telefone, 40));
  const chatIds = chats.map((item) => cleanText(item.id, 140)).filter(Boolean);

  const [messagesByChat, notesSnap, tasksSnap] = await Promise.all([
    Promise.all(
      chatIds.map(async (chatId) => {
        const snap = await adminDb
          .collection("messages")
          .where("chatId", "==", chatId)
          .limit(12)
          .get();

        return snap.docs
          .map(
            (doc): ChatMessageRow => ({
              id: doc.id,
              chatId,
              ...(doc.data() as Record<string, unknown>),
            })
          )
          .sort((a, b) => toTime(a.createdAt || a.timestamp) - toTime(b.createdAt || b.timestamp))
          .slice(-6);
      })
    ),
    adminDb.collection("lead_notes").where("tenantId", "==", input.tenantId).where("leadId", "==", input.leadId).limit(6).get(),
    adminDb
      .collection("lead_tasks")
      .where("tenantId", "==", input.tenantId)
      .where("leadId", "==", input.leadId)
      .where("status", "==", "pending")
      .limit(6)
      .get(),
  ]);

  const transcript = messagesByChat
    .flat()
    .sort((a, b) => toTime(a.createdAt || a.timestamp) - toTime(b.createdAt || b.timestamp))
    .slice(-10)
    .map((item) => ({
      id: cleanText(item.id, 140),
      chatId: cleanText(item.chatId, 140),
      author: cleanText(item.senderName || item.authorName || item.role, 120) || "Contato",
      direction: cleanText(item.direction || item.role || item.senderType, 40) || "client",
      text: cleanText(item.text || item.body || item.message, 320),
      sentAt: item.createdAt || item.timestamp || null,
    }))
    .filter((item) => item.text);

  const notes = notesSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        text: cleanText(data.text, 240),
        authorName: cleanText(data.authorName, 120) || "Equipe",
        createdAt: data.createdAt || null,
      };
    })
    .filter((item) => item.text);

  const openTasks = tasksSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        title: cleanText(data.title, 180) || "Tarefa",
        type: cleanText(data.type, 40) || "follow_up",
        priority: cleanText(data.priority, 20) || "medium",
        dueAt: data.dueAt || null,
      };
    })
    .sort((a, b) => toTime(a.dueAt) - toTime(b.dueAt));

  const aiSignal = input.qualification.aiSignal;
  const shouldHandoff =
    aiSignal.decision === "handoff" ||
    aiSignal.nextAction === "assumir_handoff_humano" ||
    input.qualification.score >= 80;

  const reasonCode =
    aiSignal.nextAction === "assumir_handoff_humano"
      ? "ai_requested_handoff"
      : input.qualification.score >= 80
        ? "sales_ready_high_score"
        : "monitoring";

  return {
    status: shouldHandoff ? "ready" : "monitoring",
    reasonCode,
    reasonLabel: shouldHandoff ? "Lead pronto para humano assumir" : "Ainda pode seguir em qualificacao assistida",
    summary: transcript.length
      ? `Ultimos ${transcript.length} eventos preservados para continuidade humana sem perda de contexto.`
      : "Sem transcript consolidado; usar notas e tasks como contexto inicial.",
    recommendedOwnerId: input.recommendedOwnerId || null,
    recommendedOwnerName: input.recommendedOwnerName || null,
    chatCount: chats.length,
    transcript,
    aiContext: {
      decision: aiSignal.decision || null,
      nextAction: aiSignal.nextAction || null,
      confidence: cleanNumber(aiSignal.confidence),
    },
    notes,
    openTasks,
  } satisfies LeadHandoffContext;
}
