"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  MessageSquare,
  Save,
  ShieldCheck,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type ChannelResponse = {
  channel?: {
    id?: string;
    displayName?: string;
    phoneNumber?: string;
    phoneNumberId?: string;
    status?: string;
    accessTokenMasked?: string;
    verifyTokenMasked?: string;
    appSecretMasked?: string;
    hasAccessToken?: boolean;
    hasVerifyToken?: boolean;
    hasAppSecret?: boolean;
  } | null;
  error?: string;
};

export default function ClienteCanaisPage() {
  const { tenant } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("WhatsApp");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const [masked, setMasked] = useState<{ access?: string; verify?: string; secret?: string }>({});

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels/whatsapp`);
        const data = (await res.json()) as ChannelResponse;

        if (!mounted) return;

        if (!res.ok) {
          setError(data.error || "Falha ao carregar canal.");
          return;
        }

        if (data.channel) {
          setDisplayName(data.channel.displayName || "WhatsApp");
          setPhoneNumber(data.channel.phoneNumber || "");
          setPhoneNumberId(data.channel.phoneNumberId || "");
          setMasked({
            access: data.channel.accessTokenMasked || "",
            verify: data.channel.verifyTokenMasked || "",
            secret: data.channel.appSecretMasked || "",
          });
        }
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar dados do canal.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          phoneNumber,
          phoneNumberId,
          accessToken,
          verifyToken,
          appSecret,
          status: "active",
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Falha ao salvar canal.");
        return;
      }

      setAccessToken("");
      setVerifyToken("");
      setAppSecret("");
      setNotice("Canal WhatsApp salvo com sucesso.");
    } catch {
      setError("Falha ao salvar configuracao do canal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Canal WhatsApp"
        subtitle="Configure o canal oficial do tenant para roteamento isolado por empresa."
        action={
          <Link
            href="/cliente/painel/configuracoes"
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-white/72 transition hover:bg-white/[0.08]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <PanelCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Dados do Canal" subtitle="Credenciais por tenant sem compartilhar token entre clientes." />
            <StateBadge
              label={loading ? "Sincronizando" : "Canal configuravel"}
              tone={loading ? "info" : "success"}
            />
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            {loading ? (
              <div className="py-10 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <Field label="Nome do canal" value={displayName} onChange={setDisplayName} placeholder="WhatsApp Comercial" />
                <Field label="Numero (opcional)" value={phoneNumber} onChange={setPhoneNumber} placeholder="+55 11 99999-9999" />
                <Field label="phoneNumberId" value={phoneNumberId} onChange={setPhoneNumberId} placeholder="123456789012345" required />
                <SecretField
                  label="Access Token"
                  value={accessToken}
                  onChange={setAccessToken}
                  placeholder={masked.access || "EAAG..."}
                  required
                />
                <SecretField
                  label="Verify Token"
                  value={verifyToken}
                  onChange={setVerifyToken}
                  placeholder={masked.verify || "verify-token"}
                  required
                />
                <SecretField
                  label="App Secret"
                  value={appSecret}
                  onChange={setAppSecret}
                  placeholder={masked.secret || "app-secret"}
                  required
                />

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar canal
                </button>
              </>
            )}
          </form>

          {error ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              {notice}
            </div>
          ) : null}
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-5">
            <CardTitle title="Checklist de Seguranca" subtitle="Boas praticas para estabilidade do canal." />
            <ul className="mt-3 space-y-2 text-sm text-white/62">
              <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                Use token exclusivo por tenant para evitar mistura operacional.
              </li>
              <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                Atualize o verify token ao trocar ambiente de webhook.
              </li>
              <li className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                Valide o app secret para manter assinatura dos eventos.
              </li>
            </ul>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="inline-flex rounded-lg border border-blue-300/30 bg-blue-400/10 p-2 text-blue-100">
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/92">Roteamento multi-tenant ativo</p>
            <p className="mt-1 text-sm text-white/58">
              Mensagens recebidas neste numero serao associadas automaticamente ao tenant{" "}
              <span className="font-medium text-white">{tenant?.tenantId || "-"}</span>.
            </p>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-blue-300/35 focus:bg-black/45"
      />
    </label>
  );
}

function SecretField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</span>
      <input
        type="password"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-blue-300/35 focus:bg-black/45"
      />
    </label>
  );
}

