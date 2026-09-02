import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";

type NotificationTone = "danger" | "warning" | "info" | "success";

type NotificationItem = {
  id: string;
  category: "conversation" | "lead" | "channel" | "billing" | "assistant";
  title: string;
  description: string;
  href: string;
  tone: NotificationTone;
  occurredAt: string;
};

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function iso(value: unknown) {
  const time = toMillis(value) || Date.now();
  return new Date(time).toISOString();
}

function latestTime(items: Array<Record<string, unknown>>, fields: string[]) {
  let latest = 0;
  for (const item of items) {
    for (const field of fields) latest = Math.max(latest, toMillis(item[field]));
  }
  return latest || Date.now();
}

function notificationId(prefix: string, count: number, occurredAt: number) {
  return `${prefix}:${count}:${Math.floor(occurredAt / 60_000)}`;
}

function internalAlert(item: Record<string, unknown>): NotificationItem {
  const type = clean(item.type, 100).toLowerCase();
  const occurredAt = iso(item.lastOccurredAt || item.updatedAt || item.createdAt);
  if (type.includes("handoff")) {
    return { id: `assistant:${clean(item.id, 160)}`, category: "assistant", title: "Atendimento aguardando sua equipe", description: "A Altum pediu ajuda humana em uma conversa.", href: "/cliente/painel/inbox?ai=human_owned", tone: "warning", occurredAt };
  }
  if (type.includes("quota") || type.includes("usage")) {
    return { id: `assistant:${clean(item.id, 160)}`, category: "assistant", title: "Uso da IA precisa de atenção", description: "O limite contratado está próximo ou foi atingido.", href: "/cliente/painel/ia", tone: "warning", occurredAt };
  }
  if (type.includes("automation")) {
    return { id: `assistant:${clean(item.id, 160)}`, category: "assistant", title: "Automação precisa de revisão", description: "Uma execução não terminou como esperado.", href: "/cliente/painel/automacoes", tone: "warning", occurredAt };
  }
  return { id: `assistant:${clean(item.id, 160)}`, category: "assistant", title: "Assistente Altum precisa de atenção", description: "Existe uma ocorrência operacional para revisar.", href: "/cliente/painel/ia", tone: "warning", occurredAt };
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    const entitlements = await getTenantEntitlements(tenantId);

    const [chatsSnap, leadsSnap, channelsSnap, financeSnap, alertsSnap, stateSnap] = await Promise.all([
      entitlements.modules.inbox
        ? adminDb.collection("chats").where("tenantId", "==", tenantId).limit(250).get()
        : Promise.resolve(null),
      entitlements.modules.crm
        ? adminDb.collection("leads").where("tenantId", "==", tenantId).limit(250).get()
        : Promise.resolve(null),
      entitlements.modules.whatsapp || entitlements.modules.instagram || entitlements.modules.commerce
        ? adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(60).get()
        : Promise.resolve(null),
      entitlements.modules.crm
        ? adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(120).get()
        : Promise.resolve(null),
      entitlements.modules.ai || entitlements.modules.automation
        ? adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).limit(40).get()
        : Promise.resolve(null),
      adminDb.collection("tenant_notification_state").doc(`${tenantId}_${user.uid}`).get(),
    ]);

    const notifications: NotificationItem[] = [];
    const now = Date.now();
    const chats = (chatsSnap?.docs || []).map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const waitingChats = chats.filter((chat) => {
      const status = clean(chat.status, 40).toLowerCase();
      if (status === "resolved" || status === "archived") return false;
      return toMillis(chat.lastClientMessageAt) > toMillis(chat.lastAgentMessageAt);
    });
    const overdueChats = waitingChats.filter((chat) => {
      const dueAt = toMillis(chat.slaDueAt) || toMillis(chat.lastClientMessageAt) + 15 * 60_000;
      return dueAt > 0 && dueAt <= now;
    });
    if (overdueChats.length) {
      const occurred = latestTime(overdueChats, ["lastClientMessageAt", "updatedAt"]);
      notifications.push({ id: notificationId("overdue_chats", overdueChats.length, occurred), category: "conversation", title: `${overdueChats.length} cliente(s) esperando além do prazo`, description: "Responda primeiro quem já ultrapassou o tempo combinado.", href: "/cliente/painel/inbox?queue=sla_breached", tone: "danger", occurredAt: iso(occurred) });
    } else if (waitingChats.length) {
      const occurred = latestTime(waitingChats, ["lastClientMessageAt", "updatedAt"]);
      notifications.push({ id: notificationId("waiting_chats", waitingChats.length, occurred), category: "conversation", title: `${waitingChats.length} conversa(s) precisam de resposta`, description: "Há clientes aguardando a equipe neste momento.", href: "/cliente/painel/inbox", tone: "warning", occurredAt: iso(occurred) });
    }

    const leads = (leadsSnap?.docs || []).map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const hotLeads = leads.filter((lead) => {
      const value = clean(lead.aiCommercialTemperature || lead.heat || lead.priority, 40).toLowerCase();
      return ["hot", "quente", "high", "alta"].includes(value);
    });
    if (hotLeads.length) {
      const occurred = latestTime(hotLeads, ["updatedAt", "createdAt"]);
      notifications.push({ id: notificationId("hot_leads", hotLeads.length, occurred), category: "lead", title: `${hotLeads.length} oportunidade(s) quentes`, description: "Priorize os contatos com maior intenção de compra.", href: "/cliente/painel/crm?temperature=hot", tone: "info", occurredAt: iso(occurred) });
    }

    const channels = (channelsSnap?.docs || []).map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const unhealthyChannels = channels.filter((channel) => {
      const status = clean(channel.status, 40).toLowerCase();
      const connection = clean(channel.connectionStatus, 40).toLowerCase();
      return status === "active" && !["ready", "connected"].includes(connection);
    });
    if (unhealthyChannels.length) {
      const occurred = latestTime(unhealthyChannels, ["lastHealthCheckAt", "updatedAt"]);
      notifications.push({ id: notificationId("channels", unhealthyChannels.length, occurred), category: "channel", title: `${unhealthyChannels.length} canal(is) precisam reconectar`, description: "Mensagens podem deixar de entrar ou sair até a conexão ser revisada.", href: "/cliente/painel/configuracoes/canais", tone: "danger", occurredAt: iso(occurred) });
    }

    const finance = (financeSnap?.docs || []).map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }));
    const overdueFinance = finance.filter((item) => {
      const status = clean(item.status, 40).toLowerCase();
      const due = toMillis(item.contractDueDate || item.vencimento || item.dueDate);
      return status === "atrasado" || (status === "pendente" && due > 0 && due < now);
    });
    if (overdueFinance.length) {
      const occurred = latestTime(overdueFinance, ["updatedAt", "createdAt"]);
      notifications.push({ id: notificationId("overdue_finance", overdueFinance.length, occurred), category: "billing", title: `${overdueFinance.length} pagamento(s) vencido(s)`, description: "Revise as cobranças pendentes e programe o próximo contato.", href: "/cliente/painel/crm", tone: "danger", occurredAt: iso(occurred) });
    }

    const internalRaw = (alertsSnap?.docs || [])
      .map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }))
      .filter((item) => clean(item.status, 40).toLowerCase() !== "resolved")
      .slice(0, 12)
      .map(internalAlert);
    const internalGroups = new Map<string, NotificationItem & { occurrences: number }>();
    for (const item of internalRaw) {
      const key = `${item.title}:${item.href}`;
      const existing = internalGroups.get(key);
      if (!existing) {
        internalGroups.set(key, { ...item, occurrences: 1 });
        continue;
      }
      existing.occurrences += 1;
      if (new Date(item.occurredAt).getTime() > new Date(existing.occurredAt).getTime()) {
        existing.occurredAt = item.occurredAt;
      }
    }
    notifications.push(...Array.from(internalGroups.values()).map((item) => {
      const { occurrences, ...base } = item;
      return {
        ...base,
        id: notificationId(`assistant_${item.href.replace(/[^a-z0-9]+/gi, "_")}`, occurrences, new Date(item.occurredAt).getTime()),
        description: occurrences > 1 ? `${occurrences} ocorrencias semelhantes aguardam revisao.` : item.description,
      };
    }));

    const items = notifications
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
      .slice(0, 12);
    const state = stateSnap.exists ? stateSnap.data() as Record<string, unknown> : {};
    const readIds = new Set(Array.isArray(state.readIds) ? state.readIds.map((item) => clean(item, 220)).filter(Boolean) : []);
    const withReadState = items.map((item) => ({ ...item, read: readIds.has(item.id) }));

    return NextResponse.json({
      ok: true,
      tenantId,
      items: withReadState,
      unread: withReadState.filter((item) => !item.read).length,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao carregar notificacoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar notificacoes." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");
    const body = await req.json().catch(() => ({})) as { notificationId?: unknown; notificationIds?: unknown };
    const requested = [
      clean(body.notificationId, 220),
      ...(Array.isArray(body.notificationIds) ? body.notificationIds.map((item) => clean(item, 220)) : []),
    ].filter(Boolean).slice(0, 30);
    if (!requested.length) return NextResponse.json({ error: "Nenhuma notificacao informada." }, { status: 400 });

    const ref = adminDb.collection("tenant_notification_state").doc(`${tenantId}_${user.uid}`);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists && Array.isArray(snap.data()?.readIds)
        ? (snap.data()?.readIds as unknown[]).map((item) => clean(item, 220)).filter(Boolean)
        : [];
      tx.set(ref, {
        tenantId,
        userId: user.uid,
        readIds: Array.from(new Set([...current, ...requested])).slice(-300),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return NextResponse.json({ ok: true, tenantId, readIds: requested });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao atualizar notificacoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar notificacoes." }, { status: 500 });
  }
}
