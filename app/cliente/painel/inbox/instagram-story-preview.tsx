"use client";

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { fetchInboxJson } from "@/lib/inbox-request";
import { instagramStoryPresentation, type InstagramMessageContext } from "@/lib/instagram-message-context";

export function InstagramStoryPreview({ context, chatId, messageId, repliedText }: {
  context: InstagramMessageContext; chatId: string; messageId: string; repliedText?: string;
}) {
  const { tenant } = useClienteTenant();
  const [resolved, setResolved] = useState(context), [failed, setFailed] = useState(false), [loading, setLoading] = useState(false), [legacyVideo, setLegacyVideo] = useState(false), [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null), automaticRetry = useRef(false);
  const isStory = context.kind !== "message_reply";
  useEffect(() => { setResolved(context); }, [context]);
  useEffect(() => { setFailed(false);setLegacyVideo(false); }, [resolved.previewUrl, resolved.mediaUrl, resolved.mediaType]);

  async function load(refresh = false, signal?: AbortSignal) {
    if (!tenant?.tenantId || context.kind !== "story_reply" || !context.storyId) return;
    setLoading(true);
    try {
      const { response, payload } = await fetchInboxJson<{ context?: InstagramMessageContext | null }>(requestSignal =>
        authedFetch(`/api/tenant/${tenant.tenantId}/chats/${chatId}/messages/${messageId}/story${refresh ? "?refresh=1" : ""}`, { signal: signal ? AbortSignal.any([signal, requestSignal]) : requestSignal }), 15000);
      if (!response.ok || !payload.context) throw new Error("Story indisponível");
      if (!signal?.aborted) { setResolved(payload.context);setFailed(false);setLegacyVideo(false);if (refresh) setAttempt(value => value + 1); }
    } catch { if (!signal?.aborted && !resolved.previewUrl) setFailed(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    if (context.kind !== "story_reply" || !context.storyId || !tenant?.tenantId || !container.current) return;
    const abort = new AbortController();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();void loadRef.current(false, abort.signal);
    }, { rootMargin: "160px" });
    observer.observe(container.current);
    return () => { observer.disconnect();abort.abort(); };
  }, [context.kind, context.storyId, tenant?.tenantId, chatId, messageId]);

  function mediaFailed() {
    if (!automaticRetry.current && context.kind === "story_reply" && context.storyId) {
      automaticRetry.current = true;void load(true);return;
    }
    setFailed(true);
  }
  const presentation = instagramStoryPresentation(resolved, legacyVideo);
  const video = presentation.kind === "video", media = presentation.src;
  return <div ref={container} className="mb-2 rounded-xl border-l-2 border-fuchsia-500 bg-black/5 p-2.5">
    <p className="text-xs font-semibold text-fuchsia-700">{context.kind === "story_reply" ? "Respondeu ao seu story" : context.kind === "story_mention" ? "Mencionou você em um story" : "Respondeu a uma mensagem"}</p>
    {isStory && media && !failed ? video ? (
      <video key={attempt} src={media} poster={presentation.poster} controls playsInline preload="metadata" onError={mediaFailed} className="mt-2 max-h-64 w-40 rounded-lg bg-black object-contain" />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={attempt} src={media} alt="Story relacionado à mensagem" referrerPolicy="no-referrer" loading="lazy" onError={() => { if (!resolved.mediaType) setLegacyVideo(true);else mediaFailed(); }} className="mt-2 max-h-56 w-32 rounded-lg bg-black/10 object-contain" />
    ) : isStory ? <p className="mt-1 text-xs opacity-65">{loading ? "Carregando story…" : "Não foi possível carregar a prévia deste story."}</p> : (
      <p className="mt-1 line-clamp-2 text-xs opacity-65">{repliedText || context.text || "Mensagem original indisponível neste histórico."}</p>
    )}
    {isStory && resolved.permalink ? <a href={resolved.permalink} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs font-medium text-fuchsia-700 underline">Abrir no Instagram</a> : null}
    {isStory && failed && context.storyId ? <button type="button" disabled={loading} onClick={() => { automaticRetry.current = true;void load(true); }} className="mt-2 text-xs underline">{loading ? "Carregando…" : "Tentar novamente"}</button> : null}
  </div>;
}
