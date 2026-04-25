"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, Loader2, Search } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { getPipelineStageLabel } from "@/lib/pipeline";

type SearchResponse = {
  modules?: Array<{ id: string; label: string; path: string; description?: string }>;
  leads?: Array<{ id: string; name: string; email?: string; phone?: string; stage?: string }>;
  chats?: Array<{ id: string; contactName: string; contactPhone?: string; preview?: string }>;
  budgets?: Array<{ id: string; title: string; leadId?: string; leadName?: string; status?: string }>;
  finance?: Array<{ id: string; description: string; leadId?: string; leadName?: string; status?: string; type?: string }>;
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
      const target = event.target as HTMLElement | null;
      const isTypingContext =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (event.key === "/" && !isTypingContext) {
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
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/search?q=${encodeURIComponent(normalized)}`);
        const payload = (await res.json()) as SearchResponse;

        if (res.ok) {
          setData({
            modules: payload.modules || [],
            leads: payload.leads || [],
            chats: payload.chats || [],
            budgets: payload.budgets || [],
            finance: payload.finance || [],
          });
          return;
        }

        setData({ modules: [], leads: [], chats: [], budgets: [], finance: [] });
      } catch {
        setData({ modules: [], leads: [], chats: [], budgets: [], finance: [] });
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timeout);
  }, [query, tenant?.tenantId]);

  const hasAnyResult = useMemo(() => {
    return Boolean(
      (data.modules || []).length ||
        (data.leads || []).length ||
        (data.chats || []).length ||
        (data.budgets || []).length ||
        (data.finance || []).length
    );
  }, [data]);

  function navigate(path: string) {
    router.push(path);
    setOpen(false);
    setQuery("");
  }

  function SearchSection({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <section>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cliente-text-soft)]">{title}</p>
        <div className="space-y-1">{children}</div>
      </section>
    );
  }

  function SearchButton({
    title,
    subtitle,
    onClick,
  }: {
    title: string;
    subtitle: string;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg border border-transparent bg-[var(--cliente-surface-muted)] px-3 py-2 text-left transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
      >
        <p className="text-sm font-medium text-[var(--cliente-text)]">{title}</p>
        <p className="text-xs text-[var(--cliente-text-soft)]">{subtitle}</p>
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative w-full xl:w-auto">
      <label className="client-glass flex w-full items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2.5 text-sm text-[var(--cliente-text-muted)] shadow-[var(--cliente-shadow-soft)] transition hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-text)]">
        <Search className="h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar modulo, contato, proposta ou conversa"
          className="w-full bg-transparent text-sm text-[var(--cliente-text)] outline-none placeholder:text-[var(--cliente-text-soft)] xl:w-[320px]"
        />
        <span className="hidden items-center gap-1 rounded-md border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2 py-1 text-[10px] text-[var(--cliente-text-soft)] lg:inline-flex">
          <Command className="h-3 w-3" />
          /
        </span>
      </label>

      {open ? (
        <div className="client-glass absolute right-0 top-[calc(100%+10px)] z-40 w-full max-w-[560px] rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-solid)]/96 p-3 shadow-[var(--cliente-shadow-hard)] xl:w-[560px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[var(--cliente-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : hasAnyResult ? (
            <div className="space-y-3">
              {(data.modules || []).length ? (
                <SearchSection title="Modulos">
                  {(data.modules || []).map((item) => (
                    <SearchButton
                      key={item.id}
                      title={item.label}
                      subtitle={item.description || item.path}
                      onClick={() => navigate(item.path)}
                    />
                  ))}
                </SearchSection>
              ) : null}

              {(data.leads || []).length ? (
                <SearchSection title="Contatos">
                  {(data.leads || []).map((lead) => (
                    <SearchButton
                      key={lead.id}
                      title={lead.name}
                      subtitle={`${lead.email || lead.phone || "Sem contato"} | Etapa ${getPipelineStageLabel(lead.stage || "captado")}`}
                      onClick={() => navigate(`/cliente/painel/crm?leadId=${encodeURIComponent(lead.id)}`)}
                    />
                  ))}
                </SearchSection>
              ) : null}

              {(data.chats || []).length ? (
                <SearchSection title="Conversas">
                  {(data.chats || []).map((chat) => (
                    <SearchButton
                      key={chat.id}
                      title={chat.contactName || "Conversa"}
                      subtitle={`${chat.contactPhone || "Sem telefone"} | ${chat.preview || "Sem mensagens recentes"}`}
                      onClick={() => navigate(`/cliente/painel/inbox?chatId=${encodeURIComponent(chat.id)}`)}
                    />
                  ))}
                </SearchSection>
              ) : null}

              {(data.budgets || []).length ? (
                <SearchSection title="Propostas">
                  {(data.budgets || []).map((budget) => (
                    <SearchButton
                      key={budget.id}
                      title={budget.title}
                      subtitle={`${budget.leadName || "Sem contato"} | ${budget.status || "Rascunho"}`}
                      onClick={() =>
                        navigate(
                          budget.leadId
                            ? `/cliente/painel/comercial?leadId=${encodeURIComponent(budget.leadId)}&budgetStatus=${encodeURIComponent(budget.status || "")}`
                            : "/cliente/painel/comercial"
                        )
                      }
                    />
                  ))}
                </SearchSection>
              ) : null}

              {(data.finance || []).length ? (
                <SearchSection title="Financeiro comercial">
                  {(data.finance || []).map((item) => (
                    <SearchButton
                      key={item.id}
                      title={item.description}
                      subtitle={`${item.leadName || "Sem contato"} | ${item.type || "Receita"} | ${item.status || "pendente"}`}
                      onClick={() =>
                        navigate(
                          item.leadId
                            ? `/cliente/painel/comercial?leadId=${encodeURIComponent(item.leadId)}&financeStatus=${encodeURIComponent(item.status || "")}&financeType=${encodeURIComponent(item.type || "")}`
                            : "/cliente/painel/comercial"
                        )
                      }
                    />
                  ))}
                </SearchSection>
              ) : null}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-[var(--cliente-text)]">Nenhum resultado encontrado</p>
              <p className="mt-1 text-xs text-[var(--cliente-text-soft)]">Tente outro termo para buscar modulos, contatos, propostas ou conversas.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
