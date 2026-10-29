import { adminDb } from "@/app/lib/server/firebase-admin";
import { getWhatsAppChannelById } from "@/app/lib/server/whatsapp-channel";
import { fetchEvolutionGroupName } from "./evolution-provider";
import { isEvolutionWhatsAppProvider } from "./registry";
import { isGenericWhatsAppGroupName } from "@/lib/whatsapp-group-name";

const pending = new Map<string, Promise<string | null>>();

export async function resolveWhatsAppGroupName(tenantId: string, chatId: string, data: Record<string, unknown>) {
  if (data.tenantId !== tenantId || data.isGroup !== true) return null;
  const existing = [data.groupName, data.contactName].find((value) => !isGenericWhatsAppGroupName(value));
  if (typeof existing === "string") return existing.trim();
  const checked = data.groupNameCheckedAt instanceof Date ? data.groupNameCheckedAt.getTime() : Number((data.groupNameCheckedAt as { toMillis?: () => number })?.toMillis?.() || 0);
  if (Date.now() - checked < 5 * 60_000) return null;
  const key = `${tenantId}:${chatId}`;
  const running = pending.get(key);
  if (running) return running;
  const task = resolveName(tenantId, chatId, data);
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

async function resolveName(tenantId: string, chatId: string, data: Record<string, unknown>) {
  const jid = String(data.groupJid || data.contactPhone || "").trim();
  if (!/@g\.us$/i.test(jid)) return null;
  const original = await getWhatsAppChannelById(String(data.channelId || ""));
  if (original && original.tenantId !== tenantId) return null;
  const channels = original ? [original] : await adminDb.collection("tenant_channels")
    .where("tenantId", "==", tenantId).get().then(async (snap) => Promise.all(snap.docs
      .filter((doc) => doc.data().type === "whatsapp" && isEvolutionWhatsAppProvider(String(doc.data().provider || "")))
      .slice(0, 8).map((doc) => getWhatsAppChannelById(doc.id))));
  let name: string | null = null;
  const signal = AbortSignal.timeout(3_000);
  for (const channel of channels) {
    if (signal.aborted) break;
    if (!channel || channel.tenantId !== tenantId || !isEvolutionWhatsAppProvider(channel.provider)) continue;
    const found = await fetchEvolutionGroupName(channel, jid, signal).catch(() => null);
    if (!isGenericWhatsAppGroupName(found)) { name = found; break; }
  }
  // Recover only the label. Never redirect sending or migrate the original account.
  return adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("chats").doc(chatId);
    const latest = (await tx.get(ref)).data();
    if (!latest || latest.tenantId !== tenantId || latest.isGroup !== true
      || String(latest.groupJid || latest.contactPhone || "") !== jid) return null;
    const current = [latest.groupName, latest.contactName].find((value) => !isGenericWhatsAppGroupName(value));
    if (typeof current === "string") return current;
    tx.update(ref, { groupNameCheckedAt: new Date(),
      ...(name ? { groupName: name, contactName: name } : {}) });
    return name;
  });
}

/** Bound provider work per page; subsequent polls cover the remaining groups. */
export async function hydrateWhatsAppGroupNames<T extends Record<string, unknown> & { id: string }>(tenantId: string, items: T[]) {
  const candidates = items.filter((item) => item.isGroup === true &&
    isGenericWhatsAppGroupName(item.groupName) && isGenericWhatsAppGroupName(item.contactName))
    .filter((item) => {
      const checked = (item.groupNameCheckedAt as { toMillis?: () => number })?.toMillis?.() || 0;
      return Date.now() - checked >= 5 * 60_000;
    }).slice(0, 4);
  await Promise.all(candidates.map(async (item) => {
    const name = await resolveWhatsAppGroupName(tenantId, item.id, item).catch(() => null);
    if (name) Object.assign(item, { groupName: name, contactName: name });
  }));
}
