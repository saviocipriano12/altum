"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clipboard,
  Loader2,
  Plug,
  RefreshCw,
  RotateCw,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Workflow,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, ClientActionButton, EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

const ECOMMERCE_PLATFORMS = [
  { id: "shopify", label: "Shopify" },
  { id: "nuvemshop", label: "Nuvemshop" },
  { id: "woocommerce", label: "WooCommerce" },
  { id: "vtex", label: "VTEX" },
  { id: "tray", label: "Tray" },
  { id: "loja_integrada", label: "Loja Integrada" },
];

type EcommerceConnection = {
  id: string;
  provider: string;
  providerLabel: string;
  displayName: string;
  storeUrl: string;
  storeId: string;
  status: "draft" | "active" | "paused" | "error";
  connectionStatus: string;
  syncMode: string;
  webhookSecretMasked: string;
  lastEventAt: string | null;
  lastError: string;
  productCount: number;
  orderCount: number;
  cartCount: number;
};

type EcommercePayload = {
  connections?: EcommerceConnection[];
  summary?: {
    totalConnections?: number;
    activeConnections?: number;
    products?: number;
    orders?: number;
    abandonedCarts?: number;
    events?: number;
    pendingActions?: number;
  };
  recent?: {
    orders?: RecentItem[];
    carts?: RecentItem[];
    products?: RecentItem[];
    actions?: RecentItem[];
  };
  error?: string;
};

type RecentItem = {
  id: string;
  providerLabel?: string;
  type?: string;
  name?: string;
  detail?: string;
  status?: string;
  totalPrice?: number | null;
  currency?: string;
  leadId?: string;
};

type FormState = {
  provider: string;
  displayName: string;
  storeUrl: string;
  storeId: string;
  status: "draft" | "active";
};

type AutomationTemplate = {
  enabled: boolean;
  templateName: string;
  languageCode: string;
  params: string[];
};

type EcommerceAutomation = {
  autoSendEnabled: boolean;
  purchaseConfirmation: AutomationTemplate;
  trackingAvailable: AutomationTemplate;
  abandonedCartRecovery: AutomationTemplate;
  postPurchaseUpsell: AutomationTemplate;
};

const EMPTY_FORM: FormState = {
  provider: "shopify",
  displayName: "",
  storeUrl: "",
  storeId: "",
  status: "active",
};

const DEFAULT_AUTOMATION: EcommerceAutomation = {
  autoSendEnabled: false,
  purchaseConfirmation: { enabled: true, templateName: "compra_confirmada_altum", languageCode: "pt_BR", params: ["{{nome}}", "{{pedido}}"] },
  trackingAvailable: { enabled: true, templateName: "rastreio_disponivel_altum", languageCode: "pt_BR", params: ["{{nome}}", "{{pedido}}", "{{rastreio}}"] },
  abandonedCartRecovery: { enabled: true, templateName: "recuperar_carrinho_altum", languageCode: "pt_BR", params: ["{{nome}}", "{{produtos}}", "{{checkout_url}}"] },
  postPurchaseUpsell: { enabled: false, templateName: "pos_compra_altum", languageCode: "pt_BR", params: ["{{nome}}", "{{produtos}}"] },
};

function money(value: number | null | undefined, currency = "BRL") {
  if (typeof value !== "number") return "valor nao informado";
  return value.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "active" || status === "receiving_events") return "success";
  if (status === "error") return "danger";
  if (status === "paused" || status === "draft") return "warning";
  return "info";
}

export default function ClienteIntegracoesPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_channels") || hasCapability("manage_settings");
  const canHandleActions = canManage || hasCapability("edit_leads");
  const [payload, setPayload] = useState<EcommercePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [automation, setAutomation] = useState<EcommerceAutomation>(DEFAULT_AUTOMATION);
  const [freshSecrets, setFreshSecrets] = useState<Record<string, string>>({});

  const baseUrl = useMemo(() => (typeof window === "undefined" ? "" : window.location.origin), []);

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError("");
    try {
      const [res, automationRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/connections`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/automation`),
      ]);
      const data = (await res.json()) as EcommercePayload;
      const automationData = (await automationRes.json()) as { ecommerceAutomation?: EcommerceAutomation; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao carregar ecommerce.");
      if (!automationRes.ok) throw new Error(automationData.error || "Falha ao carregar automacoes ecommerce.");
      setPayload(data);
      setAutomation(automationData.ecommerceAutomation || DEFAULT_AUTOMATION);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ecommerce.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const connections = payload?.connections || [];
  const summary = payload?.summary || {};

  async function createConnection() {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string; connectionId?: string; webhookSecret?: string; message?: string };
      if (!res.ok || !data.connectionId) throw new Error(data.error || "Falha ao criar conexao.");
      if (data.webhookSecret) setFreshSecrets((current) => ({ ...current, [data.connectionId as string]: data.webhookSecret as string }));
      setNotice(data.message || "Conexao ecommerce criada.");
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar conexao.");
    } finally {
      setSaving(false);
    }
  }

  async function updateConnection(connectionId: string, patch: Record<string, unknown>) {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string; webhookSecret?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar conexao.");
      if (data.webhookSecret) setFreshSecrets((current) => ({ ...current, [connectionId]: data.webhookSecret as string }));
      setNotice(patch.rotateWebhookSecret ? "Novo segredo gerado. Use o valor exibido antes de sair da tela." : "Conexao atualizada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar conexao.");
    } finally {
      setSaving(false);
    }
  }

  async function updateAction(actionId: string, status: "done" | "dismissed" | "pending") {
    if (!tenant?.tenantId || !canHandleActions) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar acao.");
      setNotice(status === "done" ? "Acao concluida." : status === "dismissed" ? "Acao ignorada." : "Acao reaberta.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar acao.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAutomation(nextAutomation = automation) {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/automation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ecommerceAutomation: nextAutomation }),
      });
      const data = (await res.json()) as { ecommerceAutomation?: EcommerceAutomation; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao salvar automacoes.");
      setAutomation(data.ecommerceAutomation || nextAutomation);
      setNotice("Automacoes ecommerce salvas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar automacoes.");
    } finally {
      setSaving(false);
    }
  }

  async function processAutomation(dryRun = false) {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/actions/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10, dryRun }),
      });
      const data = (await res.json()) as { error?: string; processed?: number };
      if (!res.ok) throw new Error(data.error || "Falha ao processar automacoes.");
      setNotice(dryRun ? `${data.processed || 0} acao(oes) prontas para envio.` : `${data.processed || 0} acao(oes) processadas.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar automacoes.");
    } finally {
      setSaving(false);
    }
  }

  async function sendActionTemplate(actionId: string) {
    if (!tenant?.tenantId || !canHandleActions) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/ecommerce/actions/${actionId}/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markDone: true }),
      });
      const data = (await res.json()) as { error?: string; templateName?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao enviar WhatsApp.");
      setNotice(`Template ${data.templateName || ""} enviado.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar WhatsApp.");
    } finally {
      setSaving(false);
    }
  }

  function webhookUrl(connection: EcommerceConnection) {
    if (!tenant?.tenantId || !baseUrl) return "";
    const params = new URLSearchParams({ tenantId: tenant.tenantId, connectionId: connection.id });
    return `${baseUrl}/api/webhooks/ecommerce/${connection.provider}?${params.toString()}`;
  }

  async function copyText(value: string) {
    if (!value || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(value);
    setNotice("Copiado.");
  }

  return (
    <div className="client-daily-page space-y-5">
      <SectionHeader
        title="Integracoes"
        subtitle="Conecte fontes que alimentam atendimento, vendas, campanhas, produtos e inteligencia da Altum."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Configuracoes
          </Link>
        }
      />

      {error ? <div className="rounded-2xl border border-[var(--cliente-danger)]/25 bg-[var(--cliente-danger-soft)] px-4 py-3 text-sm text-[var(--cliente-danger)]">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-[var(--cliente-success)]/25 bg-[var(--cliente-success-soft)] px-4 py-3 text-sm text-[var(--cliente-success)]">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Lojas" value={String(summary.totalConnections || 0)} icon={ShoppingBag} trend={`${summary.activeConnections || 0} ativas`} tone="brand" />
        <MetricCard label="Produtos" value={String(summary.products || 0)} icon={Store} trend="usados pela IA no atendimento" tone="success" />
        <MetricCard label="Pedidos" value={String(summary.orders || 0)} icon={Truck} trend="compra, rastreio e pos-venda" tone="ai" />
        <MetricCard label="Acoes" value={String(summary.pendingActions || 0)} icon={Workflow} trend={`${summary.abandonedCarts || 0} carrinho(s) para recuperar`} tone="warning" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Nova loja" subtitle="Crie a conexao e configure o webhook na plataforma de ecommerce." />
            <StateBadge label="ecommerce" tone="info" />
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--cliente-card-text)]">
              Plataforma
              <select
                value={form.provider}
                onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}
                disabled={!canManage || saving}
                className="client-input rounded-2xl border px-3 py-2.5 text-sm outline-none"
              >
                {ECOMMERCE_PLATFORMS.map((platform) => (
                  <option key={platform.id} value={platform.id}>{platform.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--cliente-card-text)]">
              Nome da loja
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                disabled={!canManage || saving}
                placeholder="Loja principal"
                className="client-input rounded-2xl border px-3 py-2.5 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--cliente-card-text)]">
              URL da loja
              <input
                value={form.storeUrl}
                onChange={(event) => setForm((current) => ({ ...current, storeUrl: event.target.value }))}
                disabled={!canManage || saving}
                placeholder="https://minhaloja.com.br"
                className="client-input rounded-2xl border px-3 py-2.5 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--cliente-card-text)]">
              ID da loja
              <input
                value={form.storeId}
                onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
                disabled={!canManage || saving}
                placeholder="opcional"
                className="client-input rounded-2xl border px-3 py-2.5 text-sm outline-none"
              />
            </label>
          </div>

          <ClientActionButton onClick={createConnection} disabled={!canManage || saving} tone="primary" className="mt-5 w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Criar conexao ecommerce
          </ClientActionButton>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Lojas conectadas" subtitle="Produtos, pedidos e carrinhos recebidos aqui alimentam Produtos & Servicos, Conversas, Campanhas e Relatorios." />
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
              </div>
            ) : connections.length ? (
              connections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  webhookUrl={webhookUrl(connection)}
                  freshSecret={freshSecrets[connection.id] || ""}
                  canManage={canManage}
                  saving={saving}
                  onCopy={copyText}
                  onUpdate={updateConnection}
                />
              ))
            ) : (
              <EmptyState title="Nenhuma loja conectada" description="Crie a primeira conexao para receber produtos, pedidos, rastreio e carrinhos abandonados." />
            )}
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="WhatsApp do ecommerce" subtitle="Templates aprovados para compra, rastreio, carrinho e pos-venda. O envio automatico so roda quando estiver ativado." />
          <div className="flex flex-wrap gap-2">
            <ClientActionButton onClick={() => void processAutomation(true)} disabled={!canManage || saving} tone="secondary">
              Testar fila
            </ClientActionButton>
            <ClientActionButton onClick={() => void processAutomation(false)} disabled={!canManage || saving || !automation.autoSendEnabled} tone="ai">
              Processar envios
            </ClientActionButton>
            <ClientActionButton onClick={() => void saveAutomation()} disabled={!canManage || saving} tone="primary">
              Salvar
            </ClientActionButton>
          </div>
        </div>

        <label className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <span>
            <span className="block text-sm font-semibold text-[var(--cliente-card-text)]">Envio automatico liberado</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--cliente-card-text-soft)]">Quando desligado, as acoes ficam pendentes e podem ser enviadas manualmente.</span>
          </span>
          <input
            type="checkbox"
            checked={automation.autoSendEnabled}
            disabled={!canManage || saving}
            onChange={(event) => setAutomation((current) => ({ ...current, autoSendEnabled: event.target.checked }))}
            className="h-5 w-5 accent-[var(--cliente-primary)]"
          />
        </label>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <TemplateEditor label="Compra realizada" value={automation.purchaseConfirmation} onChange={(value) => setAutomation((current) => ({ ...current, purchaseConfirmation: value }))} disabled={!canManage || saving} />
          <TemplateEditor label="Rastreio disponivel" value={automation.trackingAvailable} onChange={(value) => setAutomation((current) => ({ ...current, trackingAvailable: value }))} disabled={!canManage || saving} />
          <TemplateEditor label="Carrinho abandonado" value={automation.abandonedCartRecovery} onChange={(value) => setAutomation((current) => ({ ...current, abandonedCartRecovery: value }))} disabled={!canManage || saving} />
          <TemplateEditor label="Recompra e upsell" value={automation.postPurchaseUpsell} onChange={(value) => setAutomation((current) => ({ ...current, postPurchaseUpsell: value }))} disabled={!canManage || saving} />
        </div>
      </PanelCard>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Canais de atendimento e captacao" subtitle="Onde entram conversas, leads e sinais de campanha." />
            <StateBadge label="configuravel hoje" tone="success" />
          </div>
          <div className="mt-5 space-y-3">
            <IntegrationRow title="WhatsApp" detail="Atendimento, mensagens, templates e contexto para a IA." status="Ativo em Canais" />
            <IntegrationRow title="Instagram e Messenger" detail="DMs, comentarios, captacao social e automacoes sociais." status="Ativo em Canais" />
            <IntegrationRow title="Meta Ads e Google Ads" detail="Origem, campanhas, atribuicao e leitura de performance." status="Ativo em Canais" />
          </div>
          <Link
            href="/cliente/painel/configuracoes/canais"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
          >
            Gerenciar canais
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Como a Altum usa ecommerce" subtitle="A conexao da loja alimenta atendimento, rastreio, recuperacao e recompra." />
            <StateBadge label="operacao com IA" tone="ai" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <CapabilityCard icon={CheckCircle2} title="Compra realizada" detail="pedido recebido vira contexto para confirmar compra e orientar o cliente." />
            <CapabilityCard icon={Truck} title="Rastreio" detail="quando o codigo chega por webhook, a conversa passa a ter o dado pronto." />
            <CapabilityCard icon={ShoppingCart} title="Carrinho abandonado" detail="evento vira oportunidade para retomada por campanha ou WhatsApp." />
            <CapabilityCard icon={Workflow} title="Upsell e recompra" detail="histórico de compra ajuda a sugerir proximas ofertas." />
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <CardTitle title="Ultimos sinais do ecommerce" subtitle="Uma leitura rapida para saber se a loja esta alimentando a operacao." />
        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <RecentList
            title="Acoes"
            items={payload?.recent?.actions || []}
            empty="Nenhuma acao comercial gerada ainda."
            actionMode
            canHandleActions={canHandleActions}
            onUpdateAction={updateAction}
            onSendTemplate={sendActionTemplate}
          />
          <RecentList title="Pedidos" items={payload?.recent?.orders || []} empty="Nenhum pedido recebido ainda." />
          <RecentList title="Carrinhos" items={payload?.recent?.carts || []} empty="Nenhum carrinho recebido ainda." />
          <RecentList title="Produtos" items={payload?.recent?.products || []} empty="Nenhum produto recebido ainda." />
        </div>
      </PanelCard>
    </div>
  );
}

function ConnectionCard({
  connection,
  webhookUrl,
  freshSecret,
  canManage,
  saving,
  onCopy,
  onUpdate,
}: {
  connection: EcommerceConnection;
  webhookUrl: string;
  freshSecret: string;
  canManage: boolean;
  saving: boolean;
  onCopy: (value: string) => Promise<void>;
  onUpdate: (connectionId: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const active = connection.status === "active";
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{connection.displayName || connection.providerLabel}</p>
            <StateBadge label={connection.providerLabel} tone="info" />
            <StateBadge label={connection.status} tone={statusTone(connection.status)} />
          </div>
          <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{connection.storeUrl || "URL da loja nao informada"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canManage || saving}
            onClick={() => onUpdate(connection.id, { status: active ? "paused" : "active" })}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)] disabled:opacity-60"
          >
            {active ? "Pausar" : "Ativar"}
          </button>
          <button
            type="button"
            disabled={!canManage || saving}
            onClick={() => onUpdate(connection.id, { rotateWebhookSecret: true })}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)] disabled:opacity-60"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Novo segredo
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniStat label="Produtos" value={String(connection.productCount || 0)} />
        <MiniStat label="Pedidos" value={String(connection.orderCount || 0)} />
        <MiniStat label="Carrinhos" value={String(connection.cartCount || 0)} />
      </div>

      <div className="mt-4 grid gap-2">
        <CopyLine label="URL do webhook" value={webhookUrl} onCopy={onCopy} />
        <CopyLine label="Segredo" value={freshSecret || connection.webhookSecretMasked || "gerado na criacao"} onCopy={onCopy} muted={!freshSecret} />
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
        Configure a plataforma para enviar eventos de produto, pedido, rastreio e carrinho para esta URL. O segredo deve ser enviado em <span className="font-semibold">x-altum-webhook-token</span>.
      </p>
    </div>
  );
}

function TemplateEditor({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: AutomationTemplate;
  onChange: (value: AutomationTemplate) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--cliente-card-text)]">{label}</span>
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          className="h-4 w-4 accent-[var(--cliente-primary)]"
        />
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_96px]">
        <input
          value={value.templateName}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, templateName: event.target.value })}
          placeholder="nome_do_template"
          className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
        />
        <input
          value={value.languageCode}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, languageCode: event.target.value })}
          placeholder="pt_BR"
          className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
        />
      </div>
      <textarea
        value={(value.params || []).join("\n")}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, params: event.target.value.split(/\n/g).map((item) => item.trim()).filter(Boolean) })}
        rows={3}
        className="client-input mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
        placeholder={`{{nome}}\n{{pedido}}`}
      />
    </div>
  );
}

function CopyLine({ label, value, muted, onCopy }: { label: string; value: string; muted?: boolean; onCopy: (value: string) => Promise<void> }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
        <p className={`mt-1 truncate text-xs ${muted ? "text-[var(--cliente-card-text-soft)]" : "text-[var(--cliente-card-text)]"}`}>{value}</p>
      </div>
      <button type="button" onClick={() => onCopy(value)} className="rounded-lg p-2 text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
        <Clipboard className="h-4 w-4" />
      </button>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, detail }: { icon: typeof CheckCircle2; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <Icon className="h-4 w-4 text-[var(--cliente-primary)]" />
      <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-muted)]">{detail}</p>
    </div>
  );
}

function RecentList({
  title,
  items,
  empty,
  actionMode,
  canHandleActions,
  onUpdateAction,
  onSendTemplate,
}: {
  title: string;
  items: RecentItem[];
  empty: string;
  actionMode?: boolean;
  canHandleActions?: boolean;
  onUpdateAction?: (actionId: string, status: "done" | "dismissed" | "pending") => Promise<void>;
  onSendTemplate?: (actionId: string) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.slice(0, 5).map((item) => (
          <div key={item.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-[var(--cliente-card-text)]">{item.name || item.providerLabel || "Registro ecommerce"}</p>
              {item.status ? <StateBadge label={item.status} tone={statusTone(item.status)} /> : null}
            </div>
            {typeof item.totalPrice === "number" ? <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{money(item.totalPrice, item.currency)}</p> : null}
            {item.detail ? <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{item.detail}</p> : null}
            {item.leadId ? (
              <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="mt-2 inline-flex text-xs font-semibold text-[var(--cliente-primary)]">
                Abrir cliente
              </Link>
            ) : null}
            {actionMode && item.status === "pending" && canHandleActions && onUpdateAction ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {onSendTemplate ? (
                  <button
                    type="button"
                    onClick={() => void onSendTemplate(item.id)}
                    className="rounded-lg border border-[var(--cliente-primary)]/25 bg-[var(--cliente-primary-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cliente-primary)]"
                  >
                    Enviar WhatsApp
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onUpdateAction(item.id, "done")}
                  className="rounded-lg border border-[var(--cliente-success)]/25 bg-[var(--cliente-success-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cliente-success)]"
                >
                  Concluir
                </button>
                <button
                  type="button"
                  onClick={() => void onUpdateAction(item.id, "dismissed")}
                  className="rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--cliente-card-text-soft)]"
                >
                  Ignorar
                </button>
              </div>
            ) : null}
          </div>
        )) : <p className="text-sm text-[var(--cliente-card-text-soft)]">{empty}</p>}
      </div>
    </div>
  );
}

function IntegrationRow({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{detail}</p>
        </div>
        <StateBadge label={status} tone="info" />
      </div>
    </div>
  );
}
