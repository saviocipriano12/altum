"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

function param(searchParams: URLSearchParams, key: string) {
  return String(searchParams.get(key) || "").trim();
}

function scopeLabel(scope: string) {
  const labels: Record<string, string> = {
    "context:read": "Contexto da empresa",
    "crm:read": "Clientes e oportunidades",
    "inbox:read": "Conversas e mensagens recentes",
    "reports:read": "Resumo e relatórios",
    "integrations:read": "Saúde das integrações",
    "events:read": "Eventos e auditoria operacional",
    offline_access: "Manter a conexão ativa",
  };
  return labels[scope] || scope;
}

export default function ClienteMcpAuthorizePage() {
  const searchParams = useSearchParams();
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const clientName = param(searchParams, "client_name") || param(searchParams, "client_id") || "Cliente MCP";
  const redirectUri = param(searchParams, "redirect_uri");
  const requestedScopes = useMemo(() => {
    const raw = param(searchParams, "scope");
    return raw ? raw.split(/\s+/).filter(Boolean) : ["context:read", "crm:read", "inbox:read", "reports:read", "integrations:read", "events:read"];
  }, [searchParams]);
  const canAuthorize = Boolean(tenant?.tenantId && hasCapability("manage_settings"));

  async function authorize() {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await authedFetch("/api/mcp/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.tenantId,
          client_id: param(searchParams, "client_id") || "mcp-client",
          client_name: clientName,
          redirect_uri: redirectUri,
          state: param(searchParams, "state"),
          scope: requestedScopes.join(" "),
          code_challenge: param(searchParams, "code_challenge"),
          code_challenge_method: param(searchParams, "code_challenge_method") || "S256",
          response_type: param(searchParams, "response_type") || "code",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { redirectTo?: string; error?: string; code?: string };
      if (!response.ok || !payload.redirectTo) {
        throw new Error(payload.code || payload.error || "Falha ao autorizar MCP.");
      }
      window.location.assign(payload.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autorizar MCP.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F8FB] px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_28px_90px_-48px_rgba(15,23,42,0.45)]">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#EEF2FF,#F5F3FF)] p-7">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-[0_18px_40px_-22px_rgba(124,58,237,0.9)]">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Autorizar MCP da Altum</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {clientName} quer conectar ao tenant {tenant?.tenantName || "Altum"} para consultar dados autorizados e operar conforme a política definida em Configurações &gt; MCP.
          </p>
        </div>

        <div className="space-y-5 p-7">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-violet-600" />
              <div>
                <h2 className="font-semibold text-slate-950">Permissões solicitadas</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  O token fica limitado ao seu usuário, a este tenant e aos escopos abaixo. Senhas e segredos internos não são enviados ao chat.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {requestedScopes.map((scope) => (
                <div key={scope} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {scopeLabel(scope)}
                </div>
              ))}
            </div>
          </div>

          {!canAuthorize && (
            <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              Apenas usuários com permissão de configurações podem autorizar um cliente MCP remoto.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-900">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {error === "MCP_DISABLED" ? "Ative o MCP em Configurações > MCP antes de autorizar." : error}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!canAuthorize || loading || !redirectUri}
              onClick={authorize}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(124,58,237,0.9)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Autorizar e voltar ao app
            </button>
            <Link href="/cliente/painel/configuracoes/mcp" className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              Ver política MCP
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
