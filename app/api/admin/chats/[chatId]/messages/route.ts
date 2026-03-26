import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type AdminChatMessageItem = {
  id: string;
  createdAt?: unknown;
  [key: string]: unknown;
};

function normalizeReactionUsers(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [] as string[];
}

function normalizeMessageItem(input: AdminChatMessageItem): AdminChatMessageItem {
  const rawReactions = input.reactions;
  const normalizedReactions =
    rawReactions && typeof rawReactions === "object" && !Array.isArray(rawReactions)
      ? Object.fromEntries(
          Object.entries(rawReactions as Record<string, unknown>).map(([emoji, users]) => [
            emoji,
            normalizeReactionUsers(users),
          ])
        )
      : {};

  return {
    ...input,
    reactions: normalizedReactions,
  };
}

function toMillis(value: unknown) {
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

export async function GET(req: Request, context: { params: Promise<{ chatId: string }> }) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { chatId } = await context.params;
    const cleanChatId = String(chatId || "").trim();
    if (!cleanChatId) {
      return NextResponse.json({ error: "Chat invalido." }, { status: 400 });
    }

    const snap = await adminDb.collection("messages").where("chatId", "==", cleanChatId).limit(500).get();
    const items: AdminChatMessageItem[] = snap.docs
      .map((doc): AdminChatMessageItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .map((item) => normalizeMessageItem(item))
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));

    return NextResponse.json({
      ok: true,
      chatId: cleanChatId,
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao carregar mensagens do chat admin:", error);
    return NextResponse.json({ error: "Falha ao carregar mensagens do chat." }, { status: 500 });
  }
}
