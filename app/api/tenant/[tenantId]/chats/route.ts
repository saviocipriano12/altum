import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

type ChatStateItem = {
  aiEnabled: boolean;
  pausedUntil: unknown;
  humanOwnerUserId: string | null;
  updatedAt: unknown;
};

type ChatListItem = Record<string, unknown> & {
  id: string;
  lastMessageTime?: unknown;
  aiState: ChatStateItem | null;
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
            aiEnabled: data.aiEnabled !== false,
            pausedUntil: data.pausedUntil || null,
            humanOwnerUserId:
              typeof data.humanOwnerUserId === "string" ? data.humanOwnerUserId : null,
            updatedAt: data.updatedAt || null,
          },
        ];
      })
    );

    const items: ChatListItem[] = snap.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
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
