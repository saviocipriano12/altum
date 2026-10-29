"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebaseConfig";
import { authedFetch } from "@/app/lib/authed-fetch";
import { readInboxEventStream } from "@/lib/inbox-event-stream";
import { createInboxLiveQueue } from "@/lib/inbox-live-queue";

/** Push invalidations through the authenticated server. Direct browser
 * Firestore permissions never determine whether the Inbox receives updates. */
export function useInboxLiveMessages(input: { tenantId?: string; chatId: string | null; oldestMs: number; onChange: (ids: string[]) => Promise<void>; onChatsChange?: () => Promise<void> }) {
  const callback = useRef(input.onChange);
  callback.current = input.onChange;
  const chatsCallback = useRef(input.onChatsChange);
  chatsCallback.current = input.onChatsChange;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setConnected(false);
    if (!input.tenantId) return;
    let active = true;
    let controller: AbortController | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let streamReady = false;
    const queue = createInboxLiveQueue({
      messages: async ids => {
        await callback.current(ids);
        if (active && streamReady) setConnected(true);
      },
      chats: async () => { await chatsCallback.current?.(); },
      failed: () => { if (active) setConnected(false); },
    });
    const connect = async () => {
      if (!active || !auth.currentUser) return;
      const version = ++generation;
      const streamController = new AbortController(); controller = streamController;
      let allowed = true;
      try {
        const params = new URLSearchParams(); if (input.chatId) params.set("chatId", input.chatId);
        if (input.oldestMs) params.set("oldestMs", String(input.oldestMs));
        const response = await authedFetch(`/api/tenant/${input.tenantId}/chats/events?${params}`, { signal: streamController.signal });
        if (!response.ok || !response.body) { allowed = ![401, 403].includes(response.status); throw new Error("Conexao indisponivel."); }
        await readInboxEventStream(response.body, event => {
          if (!active || version !== generation) return;
          if (event.kind === "ready") { streamReady = true; setConnected(true); }
          if (event.kind === "closed") { streamController.abort(); return; }
          if (event.kind === "messages") queue.messages(event.ids);
          if (event.kind === "chats") queue.chats();
        });
      } catch { /* Polling remains available while the stream reconnects. */ }
      finally { if (active && version === generation) { streamReady = false; setConnected(false); if (allowed) reconnect = setTimeout(() => void connect(), 1000); } }
    };
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      controller?.abort(); clearTimeout(reconnect);
      generation += 1;
      if (user && active) void connect();
    });
    return () => { active = false; unsubscribeAuth(); controller?.abort(); clearTimeout(reconnect); queue.stop(); };
  }, [input.tenantId, input.chatId, input.oldestMs]);
  return connected;
}
