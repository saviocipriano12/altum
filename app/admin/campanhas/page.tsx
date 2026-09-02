"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { AdAccountDoc } from "@/app/types/domain";
import {
  AlertTriangle,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  Gauge,
  LineChart,
  Loader2,
  Plus,
  Save,
  Target,
} from "lucide-react";

type ClientOption = {
  id: string;
  name: string;
};

type InsightResponse = {
  ok?: boolean;
  summary?: string;
  recommendations?: string[];
  metrics?: {
    snapshots?: number;
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    ctr?: number;
    cpc?: number;
    cpl?: number;
  } | null;
  error?: string;
};

type SyncResponse = {
  ok?: boolean;
  synced?: number;
  failed?: number;
  dateRef?: string;
  results?: Array<{
    adAccountId: string;
    ok: boolean;
    error?: string;
    metrics?: {
      impressions?: number;
      clicks?: number;
      spend?: number;
      leads?: number;
    };
  }>;
  error?: string;
};

type SnapshotItem = {
  id: string;
  adAccountId?: string;
  clientId?: string;
  dateRef?: string;
  impressions?: number;
  clicks?: number;
  spend?: number;
  leads?: number;
  ctr?: number;
  cpc?: number;
  cpl?: number;
  source?: string;
};

type SnapshotListResponse = {
  ok?: boolean;
  items?: SnapshotItem[];
  error?: string;
};

type SyncLogItem = {
  id: string;
  adAccountId?: string;
  clientId?: string;
  platform?: string;
  dateRef?: string;
  ok?: boolean;
  error?: string;
  metrics?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
  };
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  } | null;
};

type SyncLogsResponse = {
  ok?: boolean;
  items?: SyncLogItem[];
  error?: string;
};

type IntegrationStatus = {
  key: string;
  label: string;
  status: "ok" | "missing";
  details?: string;
  missingEnvs?: string[];
};

type IntegrationStatusResponse = {
  ok?: boolean;
  integrations?: IntegrationStatus[];
};

type AccountsResponse = {
  ok?: boolean;
  items?: AdAccountDoc[];
  error?: string;
};

type CreateAccountForm = {
  clientId: string;
  platform: "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";
  accountLabel: string;
  externalAccountId: string;
  syncMode: "api" | "manual" | "hybrid";
  credentialsRef: string;
};

type SnapshotForm = {
  adAccountId: string;
  dateRef: string;
  impressions: string;
  clicks: string;
  spend: string;
  leads: string;
  roas: string;
};

const accountInitial: CreateAccountForm = {
  clientId: "",
  platform: "meta_ads",
  accountLabel: "",
  externalAccountId: "",
  syncMode: "manual",
  credentialsRef: "",
};

function todayRef() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const snapshotInitial: SnapshotForm = {
  adAccountId: "",
  dateRef: todayRef(),
  impressions: "",
  clicks: "",
  spend: "",
  leads: "",
  roas: "",
};

export default function CampanhasPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [accounts, setAccounts] = useState<AdAccountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [runningInsights, setRunningInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [accountForm, setAccountForm] = useState<CreateAccountForm>(accountInitial);
  const [snapshotForm, setSnapshotForm] = useState<SnapshotForm>(snapshotInitial);
  const [insights, setInsights] = useState<InsightResponse | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  useEffect(() => {
    if (!user) {
      setClients([]);
      return;
    }

    let cancelled = false;
    void authedFetch("/api/clientes")
      .then(async (response) => {
        const payload = (await response.json()) as { clientes?: ClientOption[]; items?: ClientOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Falha ao carregar clientes.");
        if (!cancelled) setClients(payload.clientes || payload.items || []);
      })
      .catch((err) => {
        console.error("Erro ao carregar clientes para campanhas:", err);
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function loadAccounts(clientId = accountForm.clientId) {
    setLoading(true);
    try {
      const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      const res = await authedFetch(`/api/ad-accounts/list${qs}`);
      const data = (await res.json()) as AccountsResponse;
      if (!res.ok) throw new Error(data.error || "Falha ao carregar contas.");
      const next = data.items || [];
      setAccounts(next);
      if (!snapshotForm.adAccountId && next.length > 0) {
        setSnapshotForm((prev) => ({ ...prev, adAccountId: next[0].id }));
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao carregar contas.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSnapshots(clientId = accountForm.clientId, adAccountId = snapshotForm.adAccountId) {
    try {
      const params = new URLSearchParams();
      if (adAccountId) params.set("adAccountId", adAccountId);
      else if (clientId) params.set("clientId", clientId);
      params.set("rangeDays", "30");

      const url = `/api/campaigns/snapshots/list?${params.toString()}`;
      const res = await authedFetch(url);
      const data = (await res.json()) as SnapshotListResponse;
      if (!res.ok) throw new Error(data.error || "Falha ao carregar snapshots.");
      setSnapshots(data.items || []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao carregar snapshots.");
    }
  }

  async function loadSyncLogs(clientId = accountForm.clientId, adAccountId = snapshotForm.adAccountId) {
    try {
      const params = new URLSearchParams();
      if (adAccountId) params.set("adAccountId", adAccountId);
      else if (clientId) params.set("clientId", clientId);
      params.set("limit", "60");

      const res = await authedFetch(`/api/campaigns/sync/logs?${params.toString()}`);
      const data = (await res.json()) as SyncLogsResponse;
      if (!res.ok) throw new Error(data.error || "Falha ao carregar logs de sync.");
      setSyncLogs(data.items || []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao carregar logs de sync.");
    }
  }

  async function loadIntegrations() {
    try {
      const res = await authedFetch("/api/admin/integrations/status");
      const data = (await res.json()) as IntegrationStatusResponse;
      if (!res.ok || !Array.isArray(data.integrations)) return;
      setIntegrations(
        data.integrations.filter((item) =>
          ["meta_ads", "google_ads", "ai_provider"].includes(item.key)
        )
      );
    } catch (err) {
      console.error("Erro ao carregar status de integracoes:", err);
    }
  }

  useEffect(() => {
    void loadAccounts();
    void loadSnapshots();
    void loadSyncLogs();
    void loadIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!accountForm.clientId) return accounts;
    return accounts.filter((item) => item.clientId === accountForm.clientId);
  }, [accounts, accountForm.clientId]);

  useEffect(() => {
    void loadSnapshots(accountForm.clientId, snapshotForm.adAccountId);
    void loadSyncLogs(accountForm.clientId, snapshotForm.adAccountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountForm.clientId, snapshotForm.adAccountId]);

  async function createAdAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accountForm.clientId || !accountForm.accountLabel.trim()) {
      setError("Selecione cliente e nome da conta.");
      return;
    }

    setSavingAccount(true);
    try {
      const res = await authedFetch("/api/ad-accounts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...accountForm,
          accountLabel: accountForm.accountLabel.trim(),
          externalAccountId: accountForm.externalAccountId.trim(),
          credentialsRef: accountForm.credentialsRef.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao criar conta.");

      setSuccess("Conta de anuncio criada com sucesso.");
      setAccountForm((prev) => ({ ...accountInitial, clientId: prev.clientId }));
      await loadAccounts(accountForm.clientId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao criar conta.");
    } finally {
      setSavingAccount(false);
    }
  }

  async function saveSnapshot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!snapshotForm.adAccountId || !snapshotForm.dateRef) {
      setError("Informe conta e data do snapshot.");
      return;
    }

    setSavingSnapshot(true);
    try {
      const res = await authedFetch("/api/campaigns/snapshots/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: snapshotForm.adAccountId,
          dateRef: snapshotForm.dateRef,
          impressions: Number(snapshotForm.impressions || 0),
          clicks: Number(snapshotForm.clicks || 0),
          spend: Number(snapshotForm.spend || 0),
          leads: Number(snapshotForm.leads || 0),
          roas: Number(snapshotForm.roas || 0),
          source: "manual",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao salvar snapshot.");
      setSuccess("Snapshot salvo e pronto para analise de IA.");
      await Promise.all([
        loadSnapshots(accountForm.clientId, snapshotForm.adAccountId),
        loadSyncLogs(accountForm.clientId, snapshotForm.adAccountId),
      ]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao salvar snapshot.");
    } finally {
      setSavingSnapshot(false);
    }
  }

  async function runSync(adAccountId?: string) {
    setError(null);
    setSuccess(null);
    setSyncing(true);
    try {
      const res = await authedFetch("/api/campaigns/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: adAccountId || undefined,
          clientId: adAccountId ? undefined : accountForm.clientId || undefined,
          dateRef: snapshotForm.dateRef || undefined,
          limit: 20,
        }),
      });
      const data = (await res.json()) as SyncResponse;
      if (!res.ok) throw new Error(data.error || "Falha ao sincronizar campanhas.");

      setSuccess(
        `Sync concluido. Sucesso: ${Number(data.synced || 0)} | Falhas: ${Number(data.failed || 0)}`
      );
      await Promise.all([
        loadAccounts(accountForm.clientId),
        loadSnapshots(accountForm.clientId, snapshotForm.adAccountId),
        loadSyncLogs(accountForm.clientId, snapshotForm.adAccountId),
      ]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao sincronizar campanhas.");
    } finally {
      setSyncing(false);
    }
  }
  async function runInsights() {
    setError(null);
    setSuccess(null);
    setRunningInsights(true);
    try {
      const res = await authedFetch("/api/ai/campaign-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: accountForm.clientId || undefined,
          rangeDays: 14,
        }),
      });
      const data = (await res.json()) as InsightResponse;
      if (!res.ok) throw new Error(data.error || "Falha ao gerar insights.");
      setInsights(data);
      setSuccess("Analise de campanhas atualizada.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Falha ao gerar insights.");
    } finally {
      setRunningInsights(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#101010] p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/45">Growth Intelligence</p>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <LineChart className="h-6 w-6 text-blue-400" />
              Campanhas e Contas de Anuncio
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Base robusta para Meta Ads, Google Ads e canais futuros com leitura continua e IA.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void runSync()}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/20 disabled:opacity-60"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync API
            </button>
            <button
              onClick={() => void runInsights()}
              disabled={runningInsights}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
            >
              {runningInsights ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Rodar analise da IA
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">{success}</div>
      )}
      {integrations.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-[#101010] p-4">
          <h2 className="text-xs uppercase tracking-wide text-white/60">Saude das integracoes</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {integrations.map((item) => (
              <div
                key={item.key}
                className={`rounded-xl border p-3 ${
                  item.status === "ok"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.status === "ok" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-300" />
                  )}
                  <p className="text-sm font-medium text-white/90">{item.label}</p>
                </div>
                {item.status === "missing" && (
                  <p className="mt-2 text-[11px] text-amber-100/90">
                    Faltando: {(item.missingEnvs || []).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={createAdAccount} className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-white/50" />
            Conectar nova conta
          </h2>

          <label className="text-xs text-white/55">Cliente</label>
          <select
            value={accountForm.clientId}
            onChange={(e) => {
              const value = e.target.value;
              setAccountForm((prev) => ({ ...prev, clientId: value }));
              void loadAccounts(value);
              void loadSnapshots(value, "");
            }}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
          >
            <option value="">Selecione</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/55">Plataforma</label>
              <select
                value={accountForm.platform}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    platform: e.target.value as CreateAccountForm["platform"],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="meta_ads">Meta Ads</option>
                <option value="google_ads">Google Ads</option>
                <option value="tiktok_ads">TikTok Ads</option>
                <option value="linkedin_ads">LinkedIn Ads</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/55">Modo de sync</label>
              <select
                value={accountForm.syncMode}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    syncMode: e.target.value as CreateAccountForm["syncMode"],
                  }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              >
                <option value="manual">Manual</option>
                <option value="api">API direta</option>
                <option value="hybrid">Hibrido</option>
              </select>
            </div>
          </div>

          <input
            value={accountForm.accountLabel}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, accountLabel: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            placeholder="Nome interno da conta (ex: Cliente X - Meta Principal)"
          />
          <input
            value={accountForm.externalAccountId}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, externalAccountId: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            placeholder="ID externo da conta na plataforma"
          />
          <input
            value={accountForm.credentialsRef}
            onChange={(e) => setAccountForm((prev) => ({ ...prev, credentialsRef: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            placeholder="Ref do segredo/token (Vault/Secret Manager)"
          />

          <button
            type="submit"
            disabled={savingAccount}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
          >
            {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar conta
          </button>
        </form>

        <form onSubmit={saveSnapshot} className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-white/50" />
            Snapshot diario de metricas
          </h2>

          <select
            value={snapshotForm.adAccountId}
            onChange={(e) => setSnapshotForm((prev) => ({ ...prev, adAccountId: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
          >
            <option value="">Selecione a conta</option>
            {filteredAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountLabel} - {account.platform}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={snapshotForm.dateRef}
            onChange={(e) => setSnapshotForm((prev) => ({ ...prev, dateRef: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              value={snapshotForm.impressions}
              onChange={(e) => setSnapshotForm((prev) => ({ ...prev, impressions: e.target.value }))}
              placeholder="Impressoes"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            />
            <input
              value={snapshotForm.clicks}
              onChange={(e) => setSnapshotForm((prev) => ({ ...prev, clicks: e.target.value }))}
              placeholder="Cliques"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            />
            <input
              value={snapshotForm.spend}
              onChange={(e) => setSnapshotForm((prev) => ({ ...prev, spend: e.target.value }))}
              placeholder="Investimento (R$)"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            />
            <input
              value={snapshotForm.leads}
              onChange={(e) => setSnapshotForm((prev) => ({ ...prev, leads: e.target.value }))}
              placeholder="Leads"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            />
          </div>

          <input
            value={snapshotForm.roas}
            onChange={(e) => setSnapshotForm((prev) => ({ ...prev, roas: e.target.value }))}
            placeholder="ROAS (opcional)"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
          />

          <button
            type="submit"
            disabled={savingSnapshot}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            {savingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar snapshot
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
            <Target className="h-4 w-4 text-white/50" />
            Contas de anuncio no escopo
          </h2>
          <button
            onClick={() => void loadAccounts()}
            className="text-xs rounded-lg border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-white/60 inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando contas...
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-white/55">Nenhuma conta de anuncio cadastrada.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="text-sm font-medium text-white/90">{item.accountLabel}</p>
                <p className="text-xs text-white/55 mt-1">
                  {item.platform} - Cliente: {item.clientName}
                </p>
                <p className="text-[11px] text-white/45 mt-1">
                  Sync: {item.syncMode || "manual"} - Status: {item.status}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSnapshotForm((prev) => ({ ...prev, adAccountId: item.id }));
                      void runSync(item.id);
                    }}
                    disabled={syncing}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-600/10 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-600/20 disabled:opacity-50"
                  >
                    {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Sync conta
                  </button>
                  <button
                    onClick={() => setSnapshotForm((prev) => ({ ...prev, adAccountId: item.id }))}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10"
                  >
                    Selecionar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Snapshots recentes (30 dias)
          </h2>
          <button
            onClick={() => void loadSnapshots(accountForm.clientId, snapshotForm.adAccountId)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-sm text-white/55">Sem snapshots no período selecionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-white/45 border-b border-white/10">
                <tr>
                  <th className="py-2 text-left font-medium">Data</th>
                  <th className="py-2 text-left font-medium">Conta</th>
                  <th className="py-2 text-left font-medium">Imp.</th>
                  <th className="py-2 text-left font-medium">Cliques</th>
                  <th className="py-2 text-left font-medium">Leads</th>
                  <th className="py-2 text-left font-medium">Spend</th>
                  <th className="py-2 text-left font-medium">CTR</th>
                  <th className="py-2 text-left font-medium">CPL</th>
                  <th className="py-2 text-left font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.slice(0, 25).map((item) => (
                  <tr key={item.id} className="border-b border-white/5 text-white/80">
                    <td className="py-2">{item.dateRef || "-"}</td>
                    <td className="py-2">{item.adAccountId || "-"}</td>
                    <td className="py-2">{Math.round(Number(item.impressions || 0)).toLocaleString("pt-BR")}</td>
                    <td className="py-2">{Math.round(Number(item.clicks || 0)).toLocaleString("pt-BR")}</td>
                    <td className="py-2">{Math.round(Number(item.leads || 0)).toLocaleString("pt-BR")}</td>
                    <td className="py-2">R$ {Number(item.spend || 0).toFixed(2)}</td>
                    <td className="py-2">{Number(item.ctr || 0).toFixed(2)}%</td>
                    <td className="py-2">R$ {Number(item.cpl || 0).toFixed(2)}</td>
                    <td className="py-2">{item.source || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Logs de sincronizacao
          </h2>
          <button
            onClick={() => void loadSyncLogs(accountForm.clientId, snapshotForm.adAccountId)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>

        {syncLogs.length === 0 ? (
          <p className="text-sm text-white/55">Nenhum log de sincronizacao encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-white/45 border-b border-white/10">
                <tr>
                  <th className="py-2 text-left font-medium">Data</th>
                  <th className="py-2 text-left font-medium">Conta</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Imp.</th>
                  <th className="py-2 text-left font-medium">Cliques</th>
                  <th className="py-2 text-left font-medium">Leads</th>
                  <th className="py-2 text-left font-medium">Spend</th>
                  <th className="py-2 text-left font-medium">Erro</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.slice(0, 30).map((item) => (
                  <tr key={item.id} className="border-b border-white/5 text-white/80">
                    <td className="py-2">{item.dateRef || "-"}</td>
                    <td className="py-2">{item.adAccountId || "-"}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          item.ok
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-red-500/20 text-red-200"
                        }`}
                      >
                        {item.ok ? "OK" : "ERRO"}
                      </span>
                    </td>
                    <td className="py-2">{Math.round(Number(item.metrics?.impressions || 0)).toLocaleString("pt-BR")}</td>
                    <td className="py-2">{Math.round(Number(item.metrics?.clicks || 0)).toLocaleString("pt-BR")}</td>
                    <td className="py-2">{Math.round(Number(item.metrics?.leads || 0)).toLocaleString("pt-BR")}</td>
                    <td className="py-2">R$ {Number(item.metrics?.spend || 0).toFixed(2)}</td>
                    <td className="py-2 text-red-200/90">{item.error || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#111] p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-white/50" />
          IA de performance de campanhas
        </h2>

        {!insights ? (
          <p className="text-sm text-white/55">
            Rode a analise para receber diagnostico de CTR, CPC, CPL e recomendacoes praticas.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-white/85 leading-relaxed">{insights.summary}</p>

            {insights.metrics && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="CTR" value={`${Number(insights.metrics.ctr || 0).toFixed(2)}%`} />
                <Kpi label="CPC" value={`R$ ${Number(insights.metrics.cpc || 0).toFixed(2)}`} />
                <Kpi label="CPL" value={`R$ ${Number(insights.metrics.cpl || 0).toFixed(2)}`} />
                <Kpi label="Leads" value={`${Math.round(Number(insights.metrics.leads || 0))}`} />
              </div>
            )}

            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-blue-100/80 mb-1">Recomendacoes da IA</p>
              <ul className="space-y-1 text-sm text-blue-100/90">
                {(insights.recommendations || []).map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
      <p className="text-xl font-semibold text-white mt-1">{value}</p>
    </div>
  );
}



