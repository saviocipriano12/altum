import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

type ChatStateItem = {
  aiEnabled: boolean;
  pausedUntil: unknown;
  humanOwnerUserId: string | null;
  updatedByName: string | null;
  pauseReason: string | null;
  updatedAt: unknown;
};

type ChatListItem = Record<string, unknown> & {
  id: string;
  lastMessageTime?: unknown;
  aiState: ChatStateItem | null;
};

type ContactProfileItem = {
  phone?: string;
  leadId?: string;
  name?: string;
  company?: string;
  photoUrl?: string;
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

function isFuture(value: unknown) {
  return toTime(value) > Date.now();
}

function cleanString(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function listContactProfiles(tenantId: string) {
  const snap = await adminDb
    .collection("contacts")
    .where("tenantId", "==", tenantId)
    .limit(500)
    .get();

  const byPhone = new Map<string, ContactProfileItem>();
  const byLeadId = new Map<string, ContactProfileItem>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const item: ContactProfileItem = {
      phone: cleanString(data.phone, 60),
      leadId: cleanString(data.leadId, 180),
      name: cleanString(data.name, 180),
      company: cleanString(data.company, 180),
      photoUrl: cleanString(data.photoUrl, 1000),
    };

    if (item.phone) byPhone.set(item.phone, item);
    if (item.leadId) byLeadId.set(item.leadId, item);
  }

  return { byPhone, byLeadId };
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

    const snap = await adminDb
      .collection("chats")
      .where("tenantId", "==", tenantId)
      .limit(200)
      .get();

    const stateSnap = await adminDb
      .collection("chat_state")
      .where("tenantId", "==", tenantId)
      .limit(500)
      .get();

    const stateMap = new Map<string, ChatStateItem>(
      stateSnap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return [
          String(data.chatId || ""),
          {
            aiEnabled: isFuture(data.pausedUntil) ? data.aiEnabled !== false : true,
            pausedUntil: isFuture(data.pausedUntil) ? data.pausedUntil || null : null,
            humanOwnerUserId:
              isFuture(data.pausedUntil) && typeof data.humanOwnerUserId === "string"
                ? data.humanOwnerUserId
                : null,
            updatedByName:
              typeof data.updatedByName === "string" ? data.updatedByName : null,
            pauseReason:
              isFuture(data.pausedUntil) && typeof data.pauseReason === "string" ? data.pauseReason : null,
            updatedAt: data.updatedAt || null,
          },
        ];
      })
    );

    const contacts = await listContactProfiles(tenantId);

    const items: ChatListItem[] = snap.docs
      .map((doc) => ({
        id: doc.id,
        ...(() => {
          const chat = doc.data() as Record<string, unknown>;
          const contactPhone = cleanString(chat.contactPhone, 60);
          const leadId = cleanString(chat.leadId, 180);
          const profile = contacts.byPhone.get(contactPhone) || contacts.byLeadId.get(leadId);
          return {
            ...chat,
            contactName:
              cleanString(chat.contactName, 180) ||
              profile?.name ||
              cleanString(chat.contactPhone, 60) ||
              "",
            contactCompany:
              cleanString(chat.contactCompany, 180) ||
              profile?.company ||
              "",
            contactPhotoUrl:
              cleanString(chat.contactPhotoUrl, 1000) ||
              profile?.photoUrl ||
              "",
          };
        })(),
        aiState: stateMap.get(doc.id) || null,
      }) as ChatListItem)
      .sort((a, b) => toTime(b.lastMessageTime) - toTime(a.lastMessageTime));

    return NextResponse.json({ ok: true, tenantId, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar chats do tenant:", error);
    return NextResponse.json({ error: "Falha ao listar chats." }, { status: 500 });
  }
}
