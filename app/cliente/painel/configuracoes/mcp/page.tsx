"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clipboard,
  Code2,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Terminal,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type McpStatus = {
  mcp?: {
    enabled?: boolean;
    writeMode?: "disabled" | "draft_only" | "approval_required";
    allowedClients?: string[];
    notes?: string;
  };
  runtime?: {
    localReadEnabled?: boolean;
    routeEnabled?: boolean;
    contextSecretConfigured?: boolean;
    grantsConfigured?: boolean;
    activeTenantGrantCount?: number;
    currentUserGranted?: boolean;
    currentUserScopes?: string[];
    requiredReadScopes?: readonly string[];
    baseUrl?: string;
  };
  capabilities?: {
    totalTools?: number;
    readTools?: number;
    draftTools?: number;
    writeTools?: string;
    remoteMcp?: string;
  };
  commands?: {
    demo?: string;
    codexLocal?: string;
    claudeDesktop?: string;
    remoteServerUrl?: string;
    oauthAuthorizeUrl?: string;
    oauthTokenUrl?: string;
    discoveryAuthorizationServer?: string;
    discoveryProtectedResource?: string;
    chatgptWeb?: string;
  };
  connections?: Array<{
    id: string;
    clientId: string;
    clientName: string;
    scopes: string[];
    status: "active" | "expired" | "revoked";
    createdAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
  }>;
  nextSteps?: string[];
  error?: string;
};

type McpDraft = {
  id: string;
  type: string;
  status: string;
  title: string;
  source: string;
  proposedChange?: {
    action?: string;
    name?: string;
    initialStatus?: string;
    dailyBudget?: number | null;
    countries?: string[];
    optimizationGoal?: string;
    imageUrl?: string;
    link?: string;
    headline?: string;
    callToAction?: string;
    creativeId?: string;
    objective?: string;
    tone?: string;
    instructions?: string;
    guardrails?: string[];
    notes?: string;
    currency?: string;
    from?: number;
    to?: number;
    deltaPercent?: number;
  };
  target?: {
    platform?: string;
    campaignId?: string;
    campaignName?: string;
    adSetId?: string;
    creativeId?: string;
    adAccountId?: string;
    channelId?: string;
    snapshotDate?: string;
  } | null;
  reason?: string;
  evidence?: string[];
  providerValidationRequired?: boolean;
  createdAt: string | null;
  reviewedAt: string | null;
  reviewedByName?: string;
  appliedAt?: string | null;
  appliedByName?: string;
};

const CLIENTS = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "cursor", label: "Cursor" },
  { id: "other", label: "Outro MCP" },
];

const DEFAULT_ALLOWED_CLIENTS = CLIENTS.map((client) => client.id);

const WRITE_MODES = [
  { id: "disabled", label: "Somente leitura", detail: "Consulta dados autorizados e nunca muda a plataforma." },
  { id: "draft_only", label: "Rascunhos", detail: "Prepara alteracoes para revisao, sem aplicar." },
  { id: "approval_required", label: "Aprovacao obrigatoria", detail: "Base para escrita real com previa, aprovacao e auditoria." },
] as const;

export default function ClienteMcpSettingsPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<McpDraft[]>([]);
  const [reviewingDraft, setReviewingDraft] = useState<string | null>(null);
  const [applyingDraft, setApplyingDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [writeMode, setWriteMode] = useState<(typeof WRITE_MODES)[number]["id"]>("disabled");
  const [allowedClients, setAllowedClients] = useState<string[]>(DEFAULT_ALLOWED_CLIENTS);
  const [notes, setNotes] = useState("");

  const loadStatus = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/status`);
      const payload = (await res.json().catch(() => ({}))) as McpStatus;
      if (!res.ok) {
        setError(payload.error || "Falha ao carregar MCP.");
        return;
      }
      setStatus(payload);
      setEnabled(payload.mcp?.enabled === true);
      setWriteMode(payload.mcp?.writeMode || "disabled");
      setAllowedClients(payload.mcp?.allowedClients?.length ? payload.mcp.allowedClients : DEFAULT_ALLOWED_CLIENTS);
      setNotes(payload.mcp?.notes || "");
    } catch {
      setError("Falha ao carregar MCP.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  const loadDrafts = useCallback(async () => {
    if (!tenant?.tenantId) return;
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/drafts`);
      const payload = (await res.json().catch(() => ({}))) as { drafts?: McpDraft[] };
      if (res.ok) setDrafts(payload.drafts || []);
    } catch {
      // Drafts are secondary to the MCP status card.
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadStatus();
    void loadDrafts();
  }, [loadStatus, loadDrafts]);

  const readyChecks = useMemo(
    () => [
      { label: "Rota interna", ok: status?.runtime?.routeEnabled === true },
      { label: "Segredo MCP", ok: status?.runtime?.contextSecretConfigured === true },
      { label: "Configuracao local", ok: status?.runtime?.grantsConfigured === true },
      { label: "Acesso local do usuario", ok: status?.runtime?.currentUserGranted === true },
      { label: "MCP remoto", ok: status?.capabilities?.remoteMcp === "ready_for_oauth_clients" },
    ],
    [status]
  );

  async function copy(value?: string) {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setNotice("Comando copiado.");
  }

  async function savePolicy() {
    if (!tenant?.tenantId) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, writeMode, allowedClients, notes }),
      });
      const payload = (await res.json().catch(() => ({}))) as McpStatus;
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar MCP.");
        return;
      }
      setNotice("Politica MCP salva.");
      await loadStatus();
    } catch {
      setError("Falha ao salvar MCP.");
    } finally {
      setSaving(false);
    }
  }

  function toggleClient(id: string) {
    setAllowedClients((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function revokeConnection(connectionId: string) {
    if (!tenant?.tenantId || !connectionId) return;
    setRevoking(connectionId);
    setNotice(null);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao revogar conexao MCP.");
        return;
      }
      setNotice("Conexao MCP revogada.");
      await loadStatus();
    } catch {
      setError("Falha ao revogar conexao MCP.");
    } finally {
      setRevoking(null);
    }
  }

  async function reviewDraft(draftId: string, action: "approve" | "reject") {
    if (!tenant?.tenantId) return;
    setReviewingDraft(draftId);
    setNotice(null);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/drafts/${encodeURIComponent(draftId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao revisar rascunho MCP.");
        return;
      }
      setNotice(action === "approve" ? "Rascunho aprovado para aplicacao posterior." : "Rascunho recusado.");
      await loadDrafts();
    } catch {
      setError("Falha ao revisar rascunho MCP.");
    } finally {
      setReviewingDraft(null);
    }
  }

  async function applyDraft(draftId: string) {
    if (!tenant?.tenantId) return;
    setApplyingDraft(draftId);
    setNotice(null);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/drafts/${encodeURIComponent(draftId)}/apply`, {
        method: "POST",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao aplicar rascunho MCP.");
        return;
      }
      setNotice("Rascunho aplicado na configuracao da IA.");
      await loadDrafts();
    } catch {
      setError("Falha ao aplicar rascunho MCP.");
    } finally {
      setApplyingDraft(null);
    }
  }

  if (!hasCapability("manage_settings")) {
    return (
      <div className="client-daily-page space-y-4">
        <SectionHeader title="MCP" subtitle="Esta configuracao exige permissao de administrador da conta." />
        <PanelCard className="p-5">
          <p className="text-sm text-[var(--cliente-card-text-muted)]">Fale com um administrador para liberar esta area.</p>
        </PanelCard>
      </div>
    );
  }

  return (
    <div className="client-daily-page space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/cliente/painel/configuracoes"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Configuracoes
        </Link>
        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <SectionHeader
        title="MCP"
        subtitle="Conecte ChatGPT web, Claude, Codex e outros clientes MCP para consultar a operacao da Altum e preparar acoes supervisionadas."
        action={<StateBadge label={status?.capabilities?.remoteMcp === "ready_for_oauth_clients" ? "remoto pronto" : "configurar"} tone={status?.capabilities?.remoteMcp === "ready_for_oauth_clients" ? "success" : "warning"} />}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/8 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[32vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
        </div>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <PanelCard className="p-5 md:p-6">
              <CardTitle title="Estado da conexao" subtitle="O ChatGPT remoto usa OAuth. Codex e Claude locais tambem podem usar grants configurados no servidor." />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {readyChecks.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.label}</p>
                      {item.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    </div>
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-muted)]">{item.ok ? "OK" : "Pendente"}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Escopo atual</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                  {status?.capabilities?.totalTools || 35} ferramentas no total: {status?.capabilities?.readTools || 20} de leitura e {status?.capabilities?.draftTools || 15} de rascunho supervisionado. Acoes reais exigem previa, aprovacao independente e auditoria.
                </p>
              </div>
            </PanelCard>

            <PanelCard className="p-5 md:p-6">
              <CardTitle title="Politica do tenant" subtitle="Define como esta empresa deve aparecer para assistentes conectados." />
              <div className="mt-4 space-y-4">
                <label className="flex items-start gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--cliente-card-text)]">Habilitar MCP para esta empresa</span>
                    <span className="mt-1 block text-sm text-[var(--cliente-card-text-muted)]">Necessario para autorizar ChatGPT web e qualquer cliente MCP remoto com dados reais.</span>
                  </span>
                </label>

                <div className="space-y-2">
                  {WRITE_MODES.map((mode) => (
                    <label key={mode.id} className="flex items-start gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                      <input
                        type="radio"
                        name="writeMode"
                        checked={writeMode === mode.id}
                        onChange={() => setWriteMode(mode.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-[var(--cliente-card-text)]">{mode.label}</span>
                        <span className="mt-1 block text-sm text-[var(--cliente-card-text-muted)]">{mode.detail}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Clientes permitidos</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CLIENTS.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => toggleClient(client.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          allowedClients.includes(client.id)
                            ? "border-[var(--cliente-accent)] bg-[var(--cliente-accent)] text-white"
                            : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)]"
                        }`}
                      >
                        {client.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-[var(--cliente-card-text)]">Observacoes internas</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className="client-input w-full rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm outline-none"
                    placeholder="Ex.: liberar primeiro para gestor comercial; escrita apenas depois do piloto."
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void savePolicy()}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar politica
                </button>
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <ConnectCard
              icon={Terminal}
              title="Codex local"
              badge="pronto"
              tone="success"
              description="Use STDIO local para testar e operar pelo Codex com os grants do servidor."
              command={status?.commands?.codexLocal}
              onCopy={copy}
            />
            <ConnectCard
              icon={Code2}
              title="Claude Desktop"
              badge="local"
              tone="info"
              description="Use a configuracao JSON no arquivo do Claude Desktop apontando para o servidor local da Altum."
              command={status?.commands?.claudeDesktop}
              onCopy={copy}
            />
            <ConnectCard
              icon={Bot}
              title="ChatGPT web"
              badge="remoto"
              tone="success"
              description="Use esta URL no conector MCP/custom app do ChatGPT web. A autorizacao acontece por OAuth/PKCE dentro da Altum."
              command={status?.commands?.chatgptWeb || status?.commands?.remoteServerUrl}
              onCopy={copy}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <PanelCard className="p-5 md:p-6">
              <CardTitle title="Servidor remoto universal" subtitle="Endpoints usados por ChatGPT web e clientes MCP remotos." />
              <div className="mt-4 space-y-3">
                <Snippet value={status?.commands?.remoteServerUrl || ""} onCopy={copy} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Snippet value={status?.commands?.oauthAuthorizeUrl || ""} onCopy={copy} />
                  <Snippet value={status?.commands?.oauthTokenUrl || ""} onCopy={copy} />
                </div>
              </div>
            </PanelCard>
            <PanelCard className="p-5 md:p-6">
              <CardTitle title="Conexoes autorizadas" subtitle="Tokens remotos emitidos para este tenant. Revogue qualquer acesso que nao deva continuar." />
              <div className="mt-4 space-y-3">
                {(status?.connections || []).length === 0 ? (
                  <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-muted)]">
                    Nenhum cliente MCP remoto autorizado ainda.
                  </div>
                ) : (
                  status?.connections?.map((connection) => (
                    <div key={connection.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{connection.clientName}</p>
                            <StateBadge
                              label={connection.status === "active" ? "ativa" : connection.status === "revoked" ? "revogada" : "expirada"}
                              tone={connection.status === "active" ? "success" : connection.status === "revoked" ? "danger" : "warning"}
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                            Expira em {formatDate(connection.expiresAt)} · {connection.scopes.length} escopos
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={connection.status !== "active" || revoking === connection.id}
                          onClick={() => void revokeConnection(connection.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {revoking === connection.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Revogar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <PanelCard className="p-5 md:p-6">
              <CardTitle title="Teste sem risco" subtitle="A demo usa dados ficticios e nao acessa cliente real." />
              <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                <div className="flex items-start gap-3">
                  <PlugZap className="mt-0.5 h-5 w-5 text-[var(--cliente-accent)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Demo MCP</p>
                    <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Registre e pergunte ao chat: use o altum_demo e mostre resumo diario, leads sem resposta e oportunidades paradas.</p>
                  </div>
                </div>
                <Snippet value={status?.commands?.demo || ""} onCopy={copy} />
              </div>
            </PanelCard>

            <PanelCard className="p-5 md:p-6">
              <CardTitle title="Checklist para dados reais" subtitle="O acesso real depende de ambiente, usuario e tenant autorizados." />
              <div className="mt-4 space-y-3">
                {(status?.nextSteps || []).map((step) => (
                  <div key={step} className="flex items-start gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <KeyRound className="mt-0.5 h-4 w-4 text-[var(--cliente-card-text-muted)]" />
                    <p className="text-sm text-[var(--cliente-card-text-muted)]">{step}</p>
                  </div>
                ))}
              </div>
            </PanelCard>
          </section>

          <PanelCard className="p-5 md:p-6">
            <CardTitle title="Rascunhos para aprovacao" subtitle="Mudancas preparadas pelo chat para IA e campanhas. Todo rascunho exige revisao humana e mantem a evidencia usada na decisao." />
            <div className="mt-4 space-y-3">
              {drafts.length === 0 ? (
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-muted)]">
                  Nenhum rascunho MCP ainda. Quando o ChatGPT preparar uma mudanca na IA ou em campanhas, ela aparece aqui.
                </div>
              ) : (
                drafts.map((draft) => {
                  const pending = draft.status === "pending_review";
                  const approved = draft.status === "approved_pending_apply";
                  const campaignDraft = draft.providerValidationRequired === true;
                  const canApply = approved;
                  return (
                    <div key={draft.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{draft.title}</p>
                            <StateBadge
                              label={draft.status === "applied" ? "aplicado" : draft.status === "approved_pending_apply" ? "aprovado" : draft.status === "rejected" ? "recusado" : "pendente"}
                              tone={draft.status === "applied" || draft.status === "approved_pending_apply" ? "success" : draft.status === "rejected" ? "danger" : "warning"}
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                            {draft.type || "ai_behavior_update"} · criado em {formatDate(draft.createdAt)}
                            {draft.appliedAt ? ` · aplicado em ${formatDate(draft.appliedAt)}` : ""}
                          </p>
                          {draft.proposedChange?.instructions ? (
                            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{draft.proposedChange.instructions}</p>
                          ) : null}
                          {draft.target ? (
                            <div className="mt-3 rounded-xl border border-[var(--cliente-border)] bg-white/70 p-3 text-xs leading-5 text-[var(--cliente-card-text-muted)]">
                              <p className="font-semibold text-[var(--cliente-card-text)]">{draft.target.campaignName || draft.proposedChange?.name || draft.title}</p>
                              <p>{draft.target.platform} · conta {draft.target.adAccountId || "não informada"}{draft.target.campaignId ? ` · campanha ${draft.target.campaignId}` : ""}{draft.target.adSetId ? ` · conjunto ${draft.target.adSetId}` : ""}{draft.target.creativeId ? ` · criativo ${draft.target.creativeId}` : ""}</p>
                              {draft.proposedChange?.action === "change_daily_budget" ? (
                                <p className="mt-1 font-medium text-[var(--cliente-card-text)]">
                                  Verba diaria: {draft.proposedChange.currency} {draft.proposedChange.from} para {draft.proposedChange.currency} {draft.proposedChange.to} ({draft.proposedChange.deltaPercent}%)
                                </p>
                              ) : draft.proposedChange?.action === "pause_campaign" ? (
                                <p className="mt-1 font-medium text-[var(--cliente-card-text)]">Acao proposta: pausar campanha</p>
                              ) : draft.proposedChange?.action ? (
                                <p className="mt-1 font-medium text-[var(--cliente-card-text)]">Ação proposta: {draft.proposedChange.action.replaceAll("_", " ")}{draft.proposedChange.initialStatus ? ` · estado inicial ${draft.proposedChange.initialStatus}` : ""}</p>
                              ) : null}
                            </div>
                          ) : null}
                          {draft.reason ? <p className="mt-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]"><span className="font-semibold text-[var(--cliente-card-text)]">Motivo:</span> {draft.reason}</p> : null}
                          {draft.evidence?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {draft.evidence.slice(0, 4).map((item) => (
                                <span key={item} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{item}</span>
                              ))}
                            </div>
                          ) : null}
                          {draft.proposedChange?.guardrails?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {draft.proposedChange.guardrails.slice(0, 4).map((guardrail) => (
                                <span key={guardrail} className="rounded-full border border-[var(--cliente-border)] bg-white/70 px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                                  {guardrail}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canApply || applyingDraft === draft.id}
                            onClick={() => void applyDraft(draft.id)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {applyingDraft === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            {campaignDraft ? "Validar e aplicar" : "Aplicar"}
                          </button>
                          <button
                            type="button"
                            disabled={!pending || reviewingDraft === draft.id}
                            onClick={() => void reviewDraft(draft.id, "approve")}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {reviewingDraft === draft.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Aprovar
                          </button>
                          <button
                            type="button"
                            disabled={!pending || reviewingDraft === draft.id}
                            onClick={() => void reviewDraft(draft.id, "reject")}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Recusar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Como a escrita real deve funcionar</p>
                <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">
                  A IA pode preparar mudancas, e ajustes de comportamento da IA ja podem ser aplicados depois de aprovacao humana. Enviar mensagem, cobrar, excluir, disparar campanha ou fazer alteracao sensivel ainda deve passar por previa, chave idempotente, escopo por tenant e auditoria antes de virar ferramenta WRITE.
                </p>
              </div>
            </div>
          </PanelCard>
        </>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function ConnectCard({
  icon: Icon,
  title,
  badge,
  tone,
  description,
  command,
  onCopy,
}: {
  icon: typeof Terminal;
  title: string;
  badge: string;
  tone: "success" | "warning" | "info";
  description: string;
  command?: string;
  onCopy: (value?: string) => Promise<void>;
}) {
  return (
    <PanelCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-accent)]">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <StateBadge label={badge} tone={tone} />
      </div>
      <p className="mt-4 text-base font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{description}</p>
      <Snippet value={command || ""} onCopy={onCopy} />
    </PanelCard>
  );
}

function Snippet({ value, onCopy }: { value: string; onCopy: (value?: string) => Promise<void> }) {
  return (
    <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-slate-950 p-3 text-slate-100">
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{value}</pre>
      <button
        type="button"
        onClick={() => void onCopy(value)}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
      >
        <Clipboard className="h-3.5 w-3.5" />
        Copiar
      </button>
    </div>
  );
}
