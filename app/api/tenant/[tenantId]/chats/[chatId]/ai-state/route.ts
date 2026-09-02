import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { getChatState, getChatStateDocId } from "@/lib/server/ai/agent";
import { enqueueIncomingMessageJob, kickAiQueueNow, processAiJobNow, triggerAiQueueWorker } from "@/lib/server/ai/queue";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";
import { recordLeadConversionStep } from "@/lib/server/conversion-trail";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";

type Body = {
  action?: "pause" | "resume" | "takeover" | "retry";
  pausedMinutes?: number;
  humanOwnerUserId?: string | null;
};

type TenantChatRecord = {
  tenantId?: string;
  leadId?: unknown;
  status?: unknown;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
};

function cleanString(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function clampMinutes(value: unknown, fallback = 240) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(24 * 60, Math.max(15, Math.round(value)));
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
    lastJobStatus: state.lastJobStatus || null,
    lastJobError: state.lastJobError || null,
    lastJobErrorCode: state.lastJobErrorCode || null,
    lastDecision: state.lastDecision || null,
    lastDecisionReason: state.lastDecisionReason || null,
    lastDecisionReasonCode: state.lastDecisionReasonCode || null,
    lastProcessedAt: state.lastProcessedAt ? state.lastProcessedAt.toISOString() : null,
    lastJobId: state.lastJobId || null,
    lastMessageId: state.lastMessageId || null,
    lastHandoffNotifyAt: state.lastHandoffNotifyAt ? state.lastHandoffNotifyAt.toISOString() : null,
    lastHandoffNotifyMessageId: state.lastHandoffNotifyMessageId || null,
    lastHandoffNotifyStatus: state.lastHandoffNotifyStatus || null,
    lastHandoffNotifyRecipients: state.lastHandoffNotifyRecipients ?? null,
    lastHandoffNotifySuccessCount: state.lastHandoffNotifySuccessCount ?? null,
    lastHandoffNotifyFailureCount: state.lastHandoffNotifyFailureCount ?? null,
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

async function findLatestClientMessage(chatId: string) {
  const messagesSnap = await adminDb
    .collection("messages")
    .where("chatId", "==", chatId)
    .limit(200)
    .get();

  return (
    messagesSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as { sender?: string; createdAt?: unknown }),
      }))
      .filter((message) => String(message.sender || "").toLowerCase() === "client")
      .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))[0] || null
  );
}

async function queueLatestClientMessage(input: {
  tenantId: string;
  chatId: string;
  stateRefPath: string;
  userId: string;
  userName: string;
  source: "manual_retry" | "resume_pending";
}) {
  const latestClientMessage = await findLatestClientMessage(input.chatId);
  if (!latestClientMessage?.id) {
    return { queued: false as const, reason: "no_client_message" };
  }

  const queuedJob = await enqueueIncomingMessageJob({
    tenantId: input.tenantId,
    chatId: input.chatId,
    messageId: latestClientMessage.id,
    source: input.source,
    dedupeKey: `${input.tenantId}_${latestClientMessage.id}_${input.source}_${Date.now()}`,
    priority: input.source === "resume_pending" ? 15 : 5,
  });

  await adminDb.collection("chat_state").doc(input.stateRefPath).set(
    {
      tenantId: input.tenantId,
      chatId: input.chatId,
      lastJobStatus: "pending",
      lastJobError: null,
      lastJobErrorCode: null,
      lastDecision: null,
      lastDecisionReason: input.source === "resume_pending" ? "resume_pending_message" : "manual_retry_requested",
      lastDecisionReasonCode: input.source === "resume_pending" ? "resume_pending_message" : "manual_retry_requested",
      lastJobId: queuedJob.jobId,
      lastMessageId: latestClientMessage.id,
      updatedBy: input.userId,
      updatedByName: input.userName,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const inlineResult = await processAiJobNow(queuedJob.jobId);
  if (!inlineResult) {
    await kickAiQueueNow({
      limit: 2,
      drain: true,
      maxBatches: 2,
      timeoutMs: 10_000,
    });
  }
  triggerAiQueueWorker({ limit: 4, drain: true });

  return {
    queued: true as const,
    jobId: queuedJob.jobId,
    messageId: latestClientMessage.id,
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
    await assertTenantModule(tenantId, "inbox");
    await assertTenantModule(tenantId, "ai");
    assertTenantRole(membership, "client_viewer");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });
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
    await assertTenantModule(tenantId, "inbox");
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "respond_inbox");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });
    const { chatRef, chat } = await assertChatInTenant(chatId, tenantId);

    const body = (await req.json()) as Body;
    const action = body.action || "pause";
    if (action !== "pause" && action !== "resume" && action !== "takeover" && action !== "retry") {
      return NextResponse.json({ error: "Acao invalida. Use pause, resume, takeover ou retry." }, { status: 400 });
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

      if (action === "takeover") {
        const relatedLeadId = cleanString(chat.leadId, 180);
        if (relatedLeadId) {
          await recordLeadConversionStep({
            tenantId,
            leadId: relatedLeadId,
            step: "handoff",
            source: "chat_takeover",
            actorId: user.uid,
            actorName: user.name,
            detail: `Handoff humano assumido por ${targetOwner.name}.`,
            metadata: {
              chatId,
              humanOwnerUserId: targetOwner.userId,
              pausedMinutes,
            },
          }).catch((error) => {
            console.error("Falha ao registrar trilha de conversao (handoff):", error);
          });
        }
      }
    }

    let resumedPendingMessage = false;

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

      const currentState = await getChatState(tenantId, chatId);
      const hasPendingLeadTurn =
        toTime(chat.lastClientMessageAt) > toTime(chat.lastAgentMessageAt) ||
        String(currentState.lastJobStatus || "").toLowerCase() === "retrying" ||
        String(currentState.lastJobStatus || "").toLowerCase() === "dead_letter" ||
        String(currentState.lastDecision || "").toLowerCase() === "skip";

      if (hasPendingLeadTurn) {
        const resumeResult = await queueLatestClientMessage({
          tenantId,
          chatId,
          stateRefPath: getChatStateDocId(tenantId, chatId),
          userId: user.uid,
          userName: user.name,
          source: "resume_pending",
        });
        resumedPendingMessage = resumeResult.queued;
      }
    }

    if (action === "retry") {
      const currentState = await getChatState(tenantId, chatId);
      const stillPaused =
        currentState.aiEnabled === false ||
        Boolean(currentState.pausedUntil && currentState.pausedUntil.getTime() > Date.now());

      if (stillPaused) {
        return NextResponse.json(
          { error: "A IA esta pausada nesta conversa. Retome a IA antes de reprocessar." },
          { status: 409 }
        );
      }

      const retryResult = await queueLatestClientMessage({
        tenantId,
        chatId,
        stateRefPath: getChatStateDocId(tenantId, chatId),
        userId: user.uid,
        userName: user.name,
        source: "manual_retry",
      });

      if (!retryResult.queued) {
        return NextResponse.json(
          { error: "Nao encontrei mensagem recente do lead para reprocessar." },
          { status: 404 }
        );
      }
    }

    const updatedState = await getChatState(tenantId, chatId);

    return NextResponse.json({
      ok: true,
      action,
      resumedPendingMessage,
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
