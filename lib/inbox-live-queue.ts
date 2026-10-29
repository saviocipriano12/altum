/** Message delivery never waits for a slower conversation-list refresh. */
export function createInboxLiveQueue(input: {
  messages: (ids: string[]) => Promise<void>; chats: () => Promise<void>; failed: () => void; delayMs?: number;
}) {
  let active = true, messagesRunning = false, chatsRunning = false, chatsPending = false;
  let failures = 0;
  const pending = new Set<string>();
  let messageTimer: ReturnType<typeof setTimeout> | undefined, chatTimer: ReturnType<typeof setTimeout> | undefined;
  const delay = input.delayMs ?? 50;
  const scheduleMessages = (wait = delay) => {
    if (active && !messageTimer) messageTimer = setTimeout(() => { messageTimer = undefined; void flushMessages(); }, wait);
  };
  const scheduleChats = (wait = delay) => {
    if (active && !chatTimer) chatTimer = setTimeout(() => { chatTimer = undefined; void flushChats(); }, wait);
  };
  const flushMessages = async () => {
    if (!active || messagesRunning || !pending.size) return;
    messagesRunning = true;
    const ids = Array.from(pending).slice(0, 100); ids.forEach(id => pending.delete(id));
    try { await input.messages(ids); failures = 0; }
    catch { if (active) { ids.forEach(id => pending.add(id)); failures++; input.failed(); } }
    finally {
      messagesRunning = false;
      if (active && pending.size) scheduleMessages(failures ? Math.min(5000, 500 * 2 ** Math.min(failures, 4)) : delay);
    }
  };
  const flushChats = async () => {
    if (!active || chatsRunning || !chatsPending) return;
    chatsRunning = true; chatsPending = false;
    let failed = false;
    try { await input.chats(); } catch { failed = true; chatsPending = true; }
    finally { chatsRunning = false; if (active && chatsPending) scheduleChats(failed ? 5000 : delay); }
  };
  return {
    messages(ids: string[]) { if (active) { ids.forEach(id => pending.add(id)); scheduleMessages(); } },
    chats() { if (active) { chatsPending = true; scheduleChats(); } },
    stop() { active = false; clearTimeout(messageTimer); clearTimeout(chatTimer); pending.clear(); },
  };
}
