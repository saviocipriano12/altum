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
  needsReview: boolean;
  canPurge: boolean;
  canRecover: boolean;
  preparationFailed: boolean;
  recoveryMessage: string;
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
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    if (!canRestore) {
      setItems([]);
      setLoading(false);
      setError("");
      return;
    }
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
  }, [canRestore, tenant?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(item: TrashItem) {
    if (!tenant?.tenantId || !canRestore || !item.canRecover || restoringId || deletingId) return;
    setRestoringId(item.id);
    setError("");
    setSuccess("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashId: item.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao restaurar item.");
      await load();
      setSuccess(`"${item.label}" recuperado. Envios e ações automáticas anteriores continuam sujeitos a revisão.`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Falha ao restaurar item.");
    } finally {
      setRestoringId("");
    }
  }

  async function deletePermanently(item: TrashItem) {
    if (!tenant?.tenantId || !canRestore || !item.canPurge || restoringId || deletingId) return;
    if (!window.confirm(`Excluir definitivamente "${item.label}"? Esta acao nao pode ser desfeita.`)) return;
    setDeletingId(item.id);
    setError("");
    setSuccess("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/trash`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashId: item.id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao excluir item.");
      await load();
      setSuccess(`"${item.label}" excluído definitivamente.`);
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
        subtitle="Recupere contatos e conversas ou acompanhe exclusões que precisam de revisão."
        action={
          <ClientActionButton tone="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </ClientActionButton>
        }
      />
      {error ? <div role="alert" className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {success ? <div role="status" className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}
      {!canRestore ? (
        <PanelCard className="p-6">
          <EmptyState title="Acesso restrito" description="A lixeira guarda dados sensiveis apagados. Apenas admins da conta podem consultar, restaurar ou excluir definitivamente." />
        </PanelCard>
      ) : loading ? (
        <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--cliente-primary)]" /></div>
      ) : items.length ? (
        <PanelCard className="overflow-hidden p-0">
          <div className="divide-y divide-[var(--cliente-border)]">
            {items.map((item) => {
              const Icon = item.entity === "lead" ? UserRound : MessageSquare;
              return (
                <div key={item.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 p-4 md:grid-cols-[2.75rem_minmax(0,1fr)_auto] md:items-center md:px-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--cliente-surface-muted)] text-[var(--cliente-primary)]"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.label}</p>
                      <StateBadge label={item.entity === "lead" ? "contato" : "conversa"} tone={item.entity === "lead" ? "info" : "success"} />
                      {item.needsReview ? <StateBadge label="Exclusão pendente" tone="warning" /> : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                      {item.needsReview ? "Solicitado" : "Apagado"} em {date(item.createdAt)}
                      {item.canPurge ? ` | expira em ${date(item.expiresAt)}` : " | cópia protegida até revisão"}
                      {` | ${item.documentCount} registros`}
                    </p>
                    {item.recoveryMessage ? <p className="mt-2 text-xs text-[var(--cliente-warning)]">{item.recoveryMessage}</p> : null}
                  </div>
                  {canRestore ? (
                    <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                      <ClientActionButton tone="secondary" onClick={() => void restore(item)} disabled={!item.canRecover || Boolean(restoringId || deletingId)}>
                        {restoringId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {item.preparationFailed ? "Verificar recuperação" : "Recuperar"}
                      </ClientActionButton>
                      {item.canPurge ? <ClientActionButton tone="danger" onClick={() => void deletePermanently(item)} disabled={Boolean(restoringId || deletingId)}>
                        {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Excluir definitivamente
                      </ClientActionButton> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </PanelCard>
      ) : (
        <EmptyState title="A lixeira esta vazia" description="Itens apagados no CRM e em Conversas aparecerao aqui durante o prazo de retencao configurado." />
      )}
      <div className="flex items-start gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
        A recuperação preserva alterações recentes e pode exigir revisão. O prazo de retenção da empresa vale para exclusões concluídas; cópias de operações interrompidas ficam protegidas.
      </div>
    </div>
  );
}
