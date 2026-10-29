"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { inboxDraftKey } from "@/lib/inbox-drafts";

type ReadingPosition = { messageId: string; offset: number; atBottom: boolean; updatedAt: number };
const MAX_AGE = 7 * 86400000;

export function useInboxReadingPosition({ tenantId, userId, chatId, containerRef, loading,
  messageCount, hasOlder, loadingOlder, loadOlder, onUserScroll }: {
  tenantId?: string; userId?: string; chatId: string | null;
  containerRef: RefObject<HTMLDivElement | null>; loading: boolean; messageCount: number;
  hasOlder: boolean; loadingOlder: boolean; loadOlder: () => Promise<void>;
  onUserScroll: (nearBottom: boolean) => void;
}) {
  const key = tenantId && userId && chatId ? inboxDraftKey(tenantId, userId, chatId).replace("inbox-draft", "inbox-reading") : "";
  const memory = useRef(new Map<string, ReadingPosition>());
  const pending = useRef<{ key: string; position: ReadingPosition | null }>({ key: "", position: null });
  const [restoredKey, setRestoredKey] = useState("");
  const restoring = Boolean(key) && restoredKey !== key;

  const save = useCallback(() => {
    const container = containerRef.current;
    if (!key || !container || pending.current.key !== key || pending.current.position) return;
    const top = container.getBoundingClientRect().top;
    const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"));
    const visible = elements.find((element) => element.getBoundingClientRect().bottom > top);
    if (!visible) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    const position = { messageId: visible.dataset.messageId || "", offset: visible.getBoundingClientRect().top - top,
      atBottom, updatedAt: Date.now() };
    memory.current.set(key, position);
    try { window.sessionStorage.setItem(key, JSON.stringify(position)); } catch { /* Keep memory fallback. */ }
    onUserScroll(atBottom);
  }, [containerRef, key, onUserScroll]);

  useLayoutEffect(() => {
    let position = memory.current.get(key) || null;
    if (!position && key) {
      try {
        const data = JSON.parse(window.sessionStorage.getItem(key) || "null") as ReadingPosition | null;
        if (data && typeof data.messageId === "string" && Number.isFinite(data.offset)
          && typeof data.atBottom === "boolean" && Number.isFinite(data.updatedAt)
          && Date.now() - data.updatedAt >= 0 && Date.now() - data.updatedAt < MAX_AGE) position = data;
      } catch { /* Corrupt storage must not block reading. */ }
    }
    if (position) memory.current.set(key, position);
    pending.current = { key, position };
    setRestoredKey(position && !position.atBottom ? "" : key);
  }, [key]);

  useEffect(() => {
    const handleHide = () => save();
    window.addEventListener("pagehide", handleHide);
    return () => window.removeEventListener("pagehide", handleHide);
  }, [save]);

  useLayoutEffect(() => {
    const position = pending.current.key === key ? pending.current.position : null;
    const container = containerRef.current;
    if (!position || loading || !messageCount || !container) return;
    if (position.atBottom) {
      pending.current.position = null;
      return;
    }
    const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"))
      .find((element) => element.dataset.messageId === position.messageId);
    if (!anchor && hasOlder) {
      // Stop on an error rather than continuously hammering the same cursor.
      return;
    }
    if (anchor) {
      container.scrollTop += anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - position.offset;
    }
    pending.current.position = null;
    setRestoredKey(key);
    onUserScroll(false);
  }, [containerRef, hasOlder, key, loading, messageCount, onUserScroll]);

  const requestedPage = useRef("");
  useEffect(() => {
    if (!restoring || loading || loadingOlder || !hasOlder || !messageCount) return;
    const container = containerRef.current;
    const target = pending.current.position?.messageId;
    if (!container || !target || Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"))
      .some((element) => element.dataset.messageId === target)) return;
    const requestKey = `${key}:${messageCount}`;
    if (requestedPage.current === requestKey) return;
    requestedPage.current = requestKey;
    void loadOlder();
  }, [containerRef, hasOlder, key, loadOlder, loading, loadingOlder, messageCount, restoring]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!key || !container || loading || restoring || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pending.current.key !== key || pending.current.position) return;
      const position = memory.current.get(key);
      if (!position) return;
      const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-message-id]"))
        .find((element) => element.dataset.messageId === position.messageId);
      if (!position.atBottom && !anchor) return;
      const nextTop = position.atBottom ? container.scrollHeight - container.clientHeight
        : container.scrollTop + anchor!.getBoundingClientRect().top - container.getBoundingClientRect().top - position.offset;
      // Restoring an anchor must be immediate even in a smooth-scrolling wall.
      const behavior = container.style.scrollBehavior;
      container.style.scrollBehavior = "auto";
      container.scrollTop = nextTop;
      container.style.scrollBehavior = behavior;
    });
    observer.observe(container);
    container.querySelectorAll<HTMLElement>("[data-message-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [containerRef, key, loading, messageCount, restoring]);

  const cancelRestore = useCallback(() => {
    pending.current = { key, position: null };
    setRestoredKey(key);
  }, [key]);

  const followLatest = useCallback(() => {
    const container = containerRef.current;
    if (!key || !container) return;
    pending.current = { key, position: null };
    setRestoredKey(key);
    const elements = container.querySelectorAll<HTMLElement>("[data-message-id]");
    const last = elements.item(elements.length - 1);
    if (last) {
      // Store the explicit decision BEFORE a composer resize can restore the old anchor.
      const position = { messageId: last.dataset.messageId || "", offset: 0, atBottom: true, updatedAt: Date.now() };
      memory.current.set(key, position);
      try { window.sessionStorage.setItem(key, JSON.stringify(position)); } catch { /* Keep memory fallback. */ }
    }
    const behavior = container.style.scrollBehavior;
    container.style.scrollBehavior = "auto";
    container.scrollTop = container.scrollHeight - container.clientHeight;
    container.style.scrollBehavior = behavior;
    onUserScroll(true);
  }, [containerRef, key, onUserScroll]);

  return { restoring, onScroll: save, cancelRestore, followLatest };
}
