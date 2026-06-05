"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  Copy,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type TemplateComponent = {
  type?: string;
  text?: string;
  format?: string;
  buttons?: Array<Record<string, unknown>>;
};

type WhatsAppTemplate = {
  id?: string | null;
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
};

type TemplatesResponse = {
  ok?: boolean;
  tenantId?: string;
  channel?: {
    id: string;
    source: string;
    provider: string;
    displayName: string;
    phoneNumber: string;
    phoneNumberId: string;
  };
  wabaId?: string;
  templates?: WhatsAppTemplate[];
  summary?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    marketing: number;
    utility: number;
  };
  error?: string;
};

type TemplateSyncResponse = {
  ok?: boolean;
  created?: string[];
  alreadyPresent?: string[];
  failed?: Array<{ name: string; error: string }>;
  error?: string;
};

const AGENCY_TENANT_ID = "ALTUM_AGENCY";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function statusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "approved") return "Aprovado";
  if (normalized === "pending") return "Pendente";
  if (normalized === "rejected") return "Rejeitado";
  if (normalized === "paused") return "Pausado";
  return status || "Sem status";
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "approved") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (normalized === "pending") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  if (normalized === "rejected") return "border-red-400/25 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/6 text-white/65";
}

function categoryLabel(category: string) {
  const normalized = category.toUpperCase();
  if (normalized === "MARKETING") return "Marketing";
  if (normalized === "UTILITY") return "Utilitario";
  if (normalized === "AUTHENTICATION") return "Autenticacao";
  return category || "Sem categoria";
}

function getBody(componentList: TemplateComponent[]) {
  return componentList.find((component) => String(component.type || "").toUpperCase() === "BODY")?.text || "";
}

function getHeader(componentList: TemplateComponent[]) {
  return componentList.find((component) => String(component.type || "").toUpperCase() === "HEADER") || null;
}

function getButtons(componentList: TemplateComponent[]) {
  return componentList.find((component) => String(component.type || "").toUpperCase() === "BUTTONS")?.buttons || [];
}

function extractVariables(text: string) {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g) || [];
  return Array.from(new Set(matches.map((item) => item.replace(/\s+/g, ""))));
}

function buildCampaignSnippet(template: WhatsAppTemplate) {
  const body = getBody(template.components);
  const variables = extractVariables(body);
  return [
    `template=${template.name}`,
    `idioma=${template.language || "pt_BR"}`,
    `categoria=${categoryLabel(template.category)}`,
    variables.length ? `variaveis=${variables.join(", ")}` : "variaveis=sem variaveis",
  ].join("\n");
}

function renderHeaderIcon(format?: string) {
  const normalized = String(format || "").toUpperCase();
  if (normalized === "IMAGE") return <ImageIcon className="h-5 w-5 text-blue-200" />;
  if (normalized === "VIDEO") return <Video className="h-5 w-5 text-blue-200" />;
  if (normalized === "DOCUMENT") return <FileText className="h-5 w-5 text-blue-200" />;
  return <MessageSquareText className="h-5 w-5 text-blue-200" />;
}

export default function AdminTemplatesPage() {
  const [tenantId, setTenantId] = useState(AGENCY_TENANT_ID);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [category, setCategory] = useState<"all" | "MARKETING" | "UTILITY" | "AUTHENTICATION">("all");
  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncResult, setSyncResult] = useState<TemplateSyncResponse | null>(null);
  const [copied, setCopied] = useState("");

  async function loadTemplates(nextTenantId = tenantId) {
    setLoading(true);
    setError("");
    try {
      const response = await authedFetch(
        `/api/admin/whatsapp/templates?tenantId=${encodeURIComponent(nextTenantId.trim() || AGENCY_TENANT_ID)}`
      );
      const payload = (await response.json().catch(() => ({}))) as TemplatesResponse;
      if (!response.ok) throw new Error(payload.error || "Falha ao carregar templates.");
      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates(AGENCY_TENANT_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTemplates = useMemo(() => {
    const templates = data?.templates || [];
    const q = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (status !== "all" && template.status !== status) return false;
      if (category !== "all" && template.category !== category) return false;
      if (!q) return true;
      const body = getBody(template.components).toLowerCase();
      return (
        template.name.toLowerCase().includes(q) ||
        template.language.toLowerCase().includes(q) ||
        template.category.toLowerCase().includes(q) ||
        body.includes(q)
      );
    });
  }, [category, data?.templates, query, status]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1400);
    } catch {
      setCopied("");
    }
  }

  async function syncDefaultTemplates() {
    setSyncing(true);
    setError("");
    setSyncResult(null);
    try {
      const response = await authedFetch("/api/admin/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenantId.trim() || AGENCY_TENANT_ID }),
      });
      const payload = (await response.json().catch(() => ({}))) as TemplateSyncResponse;
      if (!response.ok) throw new Error(payload.error || "Falha ao sincronizar templates.");
      setSyncResult(payload);
      await loadTemplates(tenantId.trim() || AGENCY_TENANT_ID);
    } catch (syncError) {
      setSyncResult(null);
      setError(syncError instanceof Error ? syncError.message : "Falha ao sincronizar templates.");
    } finally {
      setSyncing(false);
    }
  }

  const summary = data?.summary || {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    marketing: 0,
    utility: 0,
  };

  return (
    <div className="space-y-7">
      <section className="rounded-xl border border-white/10 bg-[#07111f] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Biblioteca Meta
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">
              Templates oficiais para campanhas WhatsApp.
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/58">
              Consulte os modelos aprovados no WABA antes de disparar campanhas. A prospeccao usa esses nomes,
              idiomas, variaveis e headers de midia para enviar com mais seguranca.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            <Link
              href="/admin/prospeccao"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              <Send className="h-4 w-4" />
              Usar na prospeccao
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => void loadTemplates()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/7 px-4 py-2.5 text-sm font-semibold text-white/78 transition hover:bg-white/12 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void syncDefaultTemplates()}
              disabled={syncing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-400/25 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/15 disabled:opacity-55"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Sincronizar padroes
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total" value={summary.total} />
        <Metric label="Aprovados" value={summary.approved} tone="emerald" />
        <Metric label="Pendentes" value={summary.pending} tone="amber" />
        <Metric label="Rejeitados" value={summary.rejected} tone="red" />
        <Metric label="Marketing" value={summary.marketing} tone="blue" />
        <Metric label="Utilitarios" value={summary.utility} tone="purple" />
      </section>

      <section className="rounded-xl border border-white/10 bg-[#0b101a] p-4">
        <div className="grid gap-3 xl:grid-cols-[220px_1fr_170px_170px_auto]">
          <input
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-blue-300/40"
            placeholder="Tenant. Ex: ALTUM_AGENCY"
          />
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5">
            <Search className="h-4 w-4 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              placeholder="Buscar por nome, corpo, idioma ou categoria"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none"
          >
            <option value="all">Todos status</option>
            <option value="approved">Aprovados</option>
            <option value="pending">Pendentes</option>
            <option value="rejected">Rejeitados</option>
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none"
          >
            <option value="all">Categorias</option>
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utilitario</option>
            <option value="AUTHENTICATION">Autenticacao</option>
          </select>
          <button
            type="button"
            onClick={() => void loadTemplates()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Filter className="h-4 w-4" />
            Carregar
          </button>
        </div>

        {data?.channel ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/50">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Canal: {data.channel.displayName}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Phone ID: {data.channel.phoneNumberId}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              WABA: {data.wabaId || "nao informado"}
            </span>
          </div>
        ) : null}
      </section>

      {copied ? (
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Copiado: {copied}
        </div>
      ) : null}

      {syncResult ? (
        <section className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-50">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">Templates operacionais sincronizados</p>
              <p className="mt-1 text-blue-50/70">
                Criados: {syncResult.created?.length || 0} | Ja existiam: {syncResult.alreadyPresent?.length || 0} |
                Falhas: {syncResult.failed?.length || 0}
              </p>
            </div>
            {(syncResult.created?.length || syncResult.alreadyPresent?.length) ? (
              <div className="flex flex-wrap gap-2">
                {[...(syncResult.created || []), ...(syncResult.alreadyPresent || [])].slice(0, 4).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => void copy(name, name)}
                    className="rounded-full border border-blue-200/20 bg-black/20 px-3 py-1 text-xs text-blue-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {syncResult.failed?.length ? (
            <div className="mt-3 space-y-1 text-xs text-blue-50/70">
              {syncResult.failed.slice(0, 3).map((item) => (
                <p key={item.name}>
                  {item.name}: {item.error}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3 text-amber-100">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <div>
              <p className="font-semibold">Nao foi possivel carregar os templates</p>
              <p className="mt-1 text-sm text-amber-100/72">{error}</p>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b101a] p-5 text-white/60">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando templates Meta...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] p-6 text-sm text-white/48">
          Nenhum template encontrado para os filtros atuais.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredTemplates.map((template) => (
            <TemplateCard key={`${template.name}_${template.language}_${template.id || ""}`} template={template} onCopy={copy} />
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber" | "red" | "blue" | "purple";
}) {
  const toneClass = {
    slate: "text-white",
    emerald: "text-emerald-100",
    amber: "text-amber-100",
    red: "text-red-100",
    blue: "text-blue-100",
    purple: "text-purple-100",
  }[tone];

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b101a] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className={cx("mt-2 text-3xl font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function TemplateCard({
  template,
  onCopy,
}: {
  template: WhatsAppTemplate;
  onCopy: (value: string, label: string) => void;
}) {
  const body = getBody(template.components);
  const variables = extractVariables(body);
  const header = getHeader(template.components);
  const buttons = getButtons(template.components);

  return (
    <article className="rounded-xl border border-white/10 bg-[#0b101a] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full border px-2.5 py-1 text-xs font-medium", statusClass(template.status))}>
              {statusLabel(template.status)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/58">
              {categoryLabel(template.category)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/58">
              {template.language || "idioma"}
            </span>
          </div>
          <h2 className="mt-4 truncate text-lg font-semibold text-white">{template.name}</h2>
          <p className="mt-1 text-xs text-white/40">ID Meta: {template.id || "nao informado"}</p>
        </div>

        <button
          type="button"
          onClick={() => onCopy(template.name, template.name)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/12 hover:text-white"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar nome
        </button>
        <button
          type="button"
          onClick={() => onCopy(buildCampaignSnippet(template), `${template.name} + parametros`)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          <Clipboard className="h-3.5 w-3.5" />
          Copiar pacote
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[120px_1fr]">
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          {renderHeaderIcon(header?.format)}
          <p className="mt-2 text-xs font-semibold text-white">Header</p>
          <p className="mt-1 text-xs text-white/45">{header?.format || "Texto/sem midia"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Corpo</p>
          <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-white/72">
            {body || "Template sem corpo retornado pela Meta."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {variables.length ? (
          variables.map((variable) => (
            <button
              type="button"
              key={variable}
              onClick={() => onCopy(variable, variable)}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-100"
            >
              <Clipboard className="h-3 w-3" />
              {variable}
            </button>
          ))
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/45">
            Sem variaveis
          </span>
        )}
        {buttons.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/20 bg-purple-500/10 px-2.5 py-1 text-xs text-purple-100">
            <MessageSquareText className="h-3 w-3" />
            {buttons.length} botao(s)
          </span>
        ) : null}
        {template.status === "approved" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">
            <CheckCircle2 className="h-3 w-3" />
            pronto para disparo
          </span>
        ) : null}
      </div>
    </article>
  );
}
