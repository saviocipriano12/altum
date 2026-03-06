"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, Loader2, Search } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

type SearchResponse = {
  modules?: Array<{ id: string; label: string; path: string; description?: string }>;
  leads?: Array<{ id: string; name: string; email?: string; phone?: string; stage?: string }>;
  chats?: Array<{ id: string; contactName: string; contactPhone?: string; preview?: string }>;
};

export function ClienteGlobalSearch() {
  const router = useRouter();
  const { tenant } = useClienteTenant();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse>({});

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (!tenant?.tenantId) return;

    const normalized = query.trim();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await authedFetch(
          `/api/tenant/${tenant.tenantId}/search?q=${encodeURIComponent(normalized)}`
        );
        const payload = (await res.json()) as SearchResponse;

        if (res.ok) {
          setData({
            modules: payload.modules || [],
            leads: payload.leads || [],
            chats: payload.chats || [],
          });
          return;
        }

        setData({ modules: [], leads: [], chats: [] });
      } catch {
        setData({ modules: [], leads: [], chats: [] });
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timeout);
  }, [query, tenant?.tenantId]);

  const hasAnyResult = useMemo(() => {
    return Boolean((data.modules || []).length || (data.leads || []).length || (data.chats || []).length);
  }, [data.chats, data.leads, data.modules]);

  function navigate(path: string) {
    router.push(path);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]">
        <Search className="h-4 w-4" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar modulo, lead ou conversa"
          className="w-[300px] bg-transparent text-sm outline-none placeholder:text-white/40"
        />
        <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-white/45">
          <Command className="h-3 w-3" />
          Ctrl+K
        </span>
      </label>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[520px] rounded-2xl border border-white/10 bg-[#111111]/98 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-white/65">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : hasAnyResult ? (
            <div className="space-y-3">
              {(data.modules || []).length ? (
                <section>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-white/45">Modulos</p>
                  <div className="space-y-1">
                    {(data.modules || []).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.path)}
                        className="w-full rounded-xl border border-transparent bg-white/[0.02] px-3 py-2 text-left transition hover:border-white/12 hover:bg-white/[0.05]"
                      >
                        <p className="text-sm font-medium text-white/92">{item.label}</p>
                        <p className="text-xs text-white/52">{item.description || item.path}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {(data.leads || []).length ? (
                <section>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-white/45">Leads</p>
                  <div className="space-y-1">
                    {(data.leads || []).map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => navigate(`/cliente/painel/crm?leadId=${encodeURIComponent(lead.id)}`)}
                        className="w-full rounded-xl border border-transparent bg-white/[0.02] px-3 py-2 text-left transition hover:border-white/12 hover:bg-white/[0.05]"
                      >
                        <p className="text-sm font-medium text-white/92">{lead.name}</p>
                        <p className="text-xs text-white/52">
                          {lead.email || lead.phone || "Sem contato"} | Stage {lead.stage || "captado"}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {(data.chats || []).length ? (
                <section>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-white/45">Conversas</p>
                  <div className="space-y-1">
                    {(data.chats || []).map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => navigate(`/cliente/painel/inbox?chatId=${encodeURIComponent(chat.id)}`)}
                        className="w-full rounded-xl border border-transparent bg-white/[0.02] px-3 py-2 text-left transition hover:border-white/12 hover:bg-white/[0.05]"
                      >
                        <p className="text-sm font-medium text-white/92">{chat.contactName || "Conversa"}</p>
                        <p className="truncate text-xs text-white/52">
                          {chat.contactPhone || "Sem telefone"} | {chat.preview || "Sem mensagens recentes"}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-white/86">Nenhum resultado encontrado</p>
              <p className="mt-1 text-xs text-white/50">Tente outro termo para buscar modulos, leads ou conversas.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
