"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { InboxDraftStore, inboxDraftKey } from "@/lib/inbox-drafts";

export function useInboxDraft(tenantId?: string, userId?: string, conversationId?: string | null) {
  const key = tenantId && userId && conversationId ? inboxDraftKey(tenantId, userId, conversationId) : "";
  const [store] = useState(() => new InboxDraftStore({
    getItem: (name) => window.localStorage.getItem(name),
    setItem: (name, value) => window.localStorage.setItem(name, value),
    removeItem: (name) => window.localStorage.removeItem(name),
  }));
  const [view, setView] = useState({ key: "", text: "", persisted: true });
  const activeKeyRef = useRef("");

  useEffect(() => {
    activeKeyRef.current = key;
    setView({ key, text: key ? store.read(key).text : "", persisted: true });
  }, [key, store]);

  const setText = useCallback((value: SetStateAction<string>) => {
    if (!key) return;
    const current = store.read(key).text;
    const result = store.setText(key, typeof value === "function" ? value(current) : value);
    if (activeKeyRef.current === key) setView({ key, text: result.draft.text, persisted: result.persisted });
  }, [key, store]);

  const beginAttempt = useCallback((text: string, replyToId: string | null, options?: { channelId: string | null }) => {
    if (!key) throw new Error("Conversa indisponivel para envio.");
    const result = store.beginAttempt(key, text, replyToId, () => typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, options);
    setView({ key, text: store.read(key).text, persisted: result.persisted });
    return { ...result.attempt, draftKey: key };
  }, [key, store]);

  const acknowledge = useCallback((draftKey: string, attemptId: string) => {
    const draft = store.acknowledge(draftKey, attemptId);
    if (activeKeyRef.current === draftKey) setView({ key: draftKey, text: draft.text, persisted: true });
  }, [store]);

  const isActive = useCallback((draftKey: string) => activeKeyRef.current === draftKey, []);
  const completeLeadStart = useCallback((draftKey: string, attemptId: string, chatId: string, sent: boolean) => {
    if (!tenantId || !userId) return { applied: false, moved: false, persisted: true };
    const result = store.completeLeadStart(draftKey, inboxDraftKey(tenantId, userId, `chat:${chatId}`), attemptId, sent);
    if (activeKeyRef.current === draftKey) setView({ key: draftKey, text: store.read(draftKey).text, persisted: result.persisted });
    return result;
  }, [store, tenantId, userId]);

  return { text: view.key === key ? view.text : "", setText, beginAttempt, acknowledge, completeLeadStart, isActive,
    persistenceFailed: view.key === key && !view.persisted };
}
