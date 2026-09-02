import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function toMillis(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value && typeof value === "object" && "_seconds" in value && typeof (value as { _seconds?: unknown })._seconds === "number") {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function serializeChat(value: Record<string, unknown>) {
  const output: Record<string, unknown> = { ...value };
  for (const key of ["lastMessageTime", "createdAt", "updatedAt", "assignedAt", "resolvedAt"]) {
    if (key in output) output[key] = toMillis(output[key]);
  }
  return output;
}

type ChatListItem = Record<string, unknown> & {
  id: string;
  lastMessageTime?: unknown;
};

export async function GET(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });
    const admin = isAdmin(actor);
    const snapshot = await (admin
      ? adminDb.collection("chats").limit(300)
      : adminDb.collection("chats").where("ownerId", "==", actor.uid).limit(200)
    ).get();

    const items: ChatListItem[] = snapshot.docs
      .map((doc): ChatListItem => ({ id: doc.id, ...serializeChat(doc.data() as Record<string, unknown>) }))
      .sort((left, right) => toMillis(right.lastMessageTime) - toMillis(left.lastMessageTime));

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao listar chats administrativos:", error);
    return NextResponse.json({ error: "Falha ao carregar conversas." }, { status: 500 });
  }
}
