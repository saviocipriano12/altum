"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, RefreshCw, RotateCcw, Trash2, UserRound } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClientActionButton, EmptyState, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type TrashItem = {
  id: string;
  entity: "lead" | "chat";
  entityId: string;
  label: string;
  documentCount: number;
  createdAt: string | null;
  expiresAt: string | null;
};

function date(value: string | null) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ClientTrashPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canRestore = hasCapability("manage_settings");
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/trash`);
      const payload = (await response.json()) as { items?: TrashItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar lixeira.");
      setItems(payload.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar lixeira.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(item: TrashItem) {
    if (!tenant?.tenantId || !canRestore) return;
    setRestoringId(item.id);
    setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashId: item.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao restaurar item.");
      await load();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Falha ao restaurar item.");
    } finally {
      setRestoringId("");
    }
  }

  async function deletePermanently(item: TrashItem) {
    if (!tenant?.tenantId || !canRestore) return;
    if (!window.confirm(`Excluir definitivamente "${item.label}"? Esta acao nao pode ser desfeita.`)) return;
    setDeletingId(item.id);
    setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/trash`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashId: item.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao excluir item.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir item.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Lixeira"
        subtitle="Contatos e conversas apagados ficam protegidos por 30 dias antes da exclusao definitiva."
        action={
          <ClientActionButton tone="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </ClientActionButton>
        }
      />
      {error ? <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {loading ? (
        <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--cliente-primary)]" /></div>
      ) : items.length ? (
        <PanelCard className="overflow-hidden p-0">
          <div className="divide-y divide-[var(--cliente-border)]">
            {items.map((item) => {
              const Icon = item.entity === "lead" ? UserRound : MessageSquare;
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-4 p-4 md:px-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--cliente-surface-muted)] text-[var(--cliente-primary)]"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.label}</p>
                      <StateBadge label={item.entity === "lead" ? "contato" : "conversa"} tone={item.entity === "lead" ? "info" : "success"} />
                    </div>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                      Apagado em {date(item.createdAt)} | expira em {date(item.expiresAt)} | {item.documentCount} registros
                    </p>
                  </div>
                  {canRestore ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <ClientActionButton tone="secondary" onClick={() => void restore(item)} disabled={restoringId === item.id || deletingId === item.id}>
                        {restoringId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restaurar
                      </ClientActionButton>
                      <ClientActionButton tone="danger" onClick={() => void deletePermanently(item)} disabled={restoringId === item.id || deletingId === item.id}>
                        {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Excluir
                      </ClientActionButton>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </PanelCard>
      ) : (
        <EmptyState title="A lixeira esta vazia" description="Itens apagados no CRM e em Conversas aparecerao aqui durante 30 dias." />
      )}
      <div className="flex items-start gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
        A restauracao devolve os registros ao local original. Depois da expiracao, os dados sao removidos definitivamente.
      </div>
    </div>
  );
}
