"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Canal WhatsApp do Tenant</h2>
          <p className="text-sm text-white/55">Configure o numero oficial deste cliente sem misturar conversas de outros tenants.</p>
        </div>
        <Link
          href="/cliente/painel/configuracoes"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
        >
          Voltar
        </Link>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-[#101010] p-5 space-y-4 max-w-3xl">
        {loading ? (
          <div className="py-8 text-center text-white/60">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
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
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar canal
            </button>
          </>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}
        {notice && <p className="text-sm text-emerald-300">{notice}</p>}
      </form>
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
      <span className="text-xs text-white/60">{props.label}</span>
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
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
      <span className="text-xs text-white/60">{props.label}</span>
      <input
        type="password"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}
