"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { inboxDraftKey } from "@/lib/inbox-drafts";
import { prepareInboxMediaAttempt, type InboxMediaAttempt } from "@/lib/inbox-upload";

export type QueuedMedia = { id: string; file: File; previewUrl: string; caption?: string; attempt?: InboxMediaAttempt };

/** File objects stay in memory only; never serialize private file bytes into localStorage. */
export function useInboxMediaDraft(tenantId?: string, userId?: string, chatId?: string | null) {
  const key = tenantId && userId && chatId ? inboxDraftKey(tenantId, userId, chatId) : "";
  const drafts = useRef(new Map<string, QueuedMedia[]>());
  const activeKey = useRef("");
  const [view, setView] = useState<{ key: string; files: QueuedMedia[] }>({ key: "", files: [] });
  useEffect(() => {
    activeKey.current = key;
    setView({ key, files: drafts.current.get(key) || [] });
  }, [key]);
  const beginAttempt = useCallback((id: string, input: Parameters<typeof prepareInboxMediaAttempt>[2]) => {
    if (!key) return null;
    const result = prepareInboxMediaAttempt(drafts.current.get(key) || [], id, input);
    if (!result) return null;
    drafts.current.set(key, result.files);
    if (activeKey.current === key) setView({ key, files: result.files });
    return result.attempt;
  }, [key]);
  const setFiles = useCallback((update: SetStateAction<QueuedMedia[]>) => {
    if (!key) return;
    const previous = drafts.current.get(key) || [];
    const files = typeof update === "function" ? update(previous) : update;
    drafts.current.set(key, files);
    if (activeKey.current === key) setView({ key, files });
  }, [key]);
  useEffect(() => {
    const allDrafts = drafts.current;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (![...allDrafts.values()].some((files) => files.length > 0)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      for (const files of allDrafts.values()) {
        for (const media of files) if (media.previewUrl) URL.revokeObjectURL(media.previewUrl);
      }
    };
  }, []);
  return { files: view.key === key ? view.files : [], setFiles, beginAttempt };
}
