import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { getChatState, getChatStateDocId } from "@/lib/server/ai/agent";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";

type Body = {
  action?: "pause" | "resume" | "takeover";
  pausedMinutes?: number;
  humanOwnerUserId?: string | null;
};

type TenantChatRecord = {
  tenantId?: string;
  status?: unknown;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
};

function clampMinutes(value: unknown, fallback = 240) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(24 * 60, Math.max(15, Math.round(value)));
}

function serializeState(state: Awaited<ReturnType<typeof getChatState>>) {
  return {
    tenantId: state.tenantId,
    chatId: state.chatId,
    aiEnabled: state.aiEnabled,
    pausedUntil: state.pausedUntil ? state.pausedUntil.toISOString() : null,
    humanOwnerUserId: state.humanOwnerUserId,
    updatedByName: state.updatedByName || null,
    updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
    pauseReason: state.pauseReason || null,
  };
}

async function assertChatInTenant(chatId: string, tenantId: string) {
  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new RouteAuthError(404, "chat_not_found", "Chat nao encontrado.");
  }

  const chat = chatSnap.data() as TenantChatRecord;
  if ((chat.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Chat fora do tenant informado.");
  }

  return { chatRef, chat };
}

async function resolveTenantOwnerMeta(tenantId: string, requestedUserId: string, fallbackName: string) {
  const userId = requestedUserId.trim();
  if (!userId) {
    throw new RouteAuthError(400, "invalid_owner", "Owner humano invalido.");
  }

  const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`).get();
  if (!membershipSnap.exists) {
    throw new RouteAuthError(400, "owner_not_in_tenant", "Owner humano nao pertence a este tenant.");
  }

  const membership = membershipSnap.data() as { name?: string };
  return {
    userId,
    name: String(membership.name || fallbackName || "Usuario"),
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    await assertChatInTenant(chatId, tenantId);

    const state = await getChatState(tenantId, chatId);
    return NextResponse.json({ ok: true, state: serializeState(state) });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao carregar estado da IA do chat:", error);
    return NextResponse.json({ error: "Falha ao carregar estado da IA." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");
    const { chatRef, chat } = await assertChatInTenant(chatId, tenantId);

    const body = (await req.json()) as Body;
    const action = body.action || "pause";
    if (action !== "pause" && action !== "resume" && action !== "takeover") {
      return NextResponse.json({ error: "Acao invalida. Use pause, resume ou takeover." }, { status: 400 });
    }

    const stateRef = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));

    if (action === "pause" || action === "takeover") {
      const pausedMinutes = clampMinutes(body.pausedMinutes, 240);
      const pausedUntil = new Date(Date.now() + pausedMinutes * 60 * 1000);
      const targetOwner =
        body.humanOwnerUserId && body.humanOwnerUserId.trim()
          ? await resolveTenantOwnerMeta(tenantId, body.humanOwnerUserId, user.name)
          : { userId: user.uid, name: user.name };

      await Promise.all([
        stateRef.set(
          {
            tenantId,
            chatId,
            aiEnabled: false,
            pausedUntil,
            humanOwnerUserId: targetOwner.userId,
            pauseReason: action === "takeover" ? "human_takeover" : "manual_pause",
            updatedBy: user.uid,
            updatedByName: user.name,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        chatRef.set(
          {
            assignedTo: targetOwner.userId,
            assignedUserName: targetOwner.name,
            ownerId: targetOwner.userId,
            ownerName: targetOwner.name,
            updatedAt: FieldValue.serverTimestamp(),
            ...buildManualQueuePatch({
              status: String(chat.status || "open"),
              assignedTo: targetOwner.userId,
              lastClientMessageAt: chat.lastClientMessageAt,
              lastAgentMessageAt: chat.lastAgentMessageAt,
              slaDueAt: chat.slaDueAt,
            }),
          },
          { merge: true }
        ),
        adminDb.collection("messages").add({
          chatId,
          tenantId,
          sender: "system",
          type: "text",
          text:
            action === "takeover"
              ? `Handoff assumido por ${targetOwner.name}. IA pausada temporariamente.`
              : `IA pausada por ${targetOwner.name}.`,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);
    }

    if (action === "resume") {
      await Promise.all([
        stateRef.set(
          {
            tenantId,
            chatId,
            aiEnabled: true,
            pausedUntil: null,
            humanOwnerUserId: null,
            pauseReason: null,
            updatedBy: user.uid,
            updatedByName: user.name,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        adminDb.collection("messages").add({
          chatId,
          tenantId,
          sender: "system",
          type: "text",
          text: `IA retomada por ${user.name}.`,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);
    }

    const updatedState = await getChatState(tenantId, chatId);

    return NextResponse.json({
      ok: true,
      action,
      state: serializeState(updatedState),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao atualizar estado da IA do chat:", error);
    return NextResponse.json({ error: "Falha ao atualizar estado da IA." }, { status: 500 });
  }
}
