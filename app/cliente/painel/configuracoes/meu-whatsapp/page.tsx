"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode, Smartphone } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type PersonalChannel = {
  id: string;
  displayName?: string;
  phoneNumber?: string;
  provider?: string;
  status?: string;
  connectionStatus?: string;
  channelScope?: string;
  ownerUserId?: string;
  ownerUserName?: string;
  inboundReady?: boolean;
  outboundReady?: boolean;
};

export default function MeuWhatsAppPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [channels, setChannels] = useState<PersonalChannel[]>([]);
  const [displayName, setDisplayName] = useState("Meu WhatsApp");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenant?.tenantId) return;
    let active = true;
    void (async () => {
      try {
        const response = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`);
        const payload = (await response.json().catch(() => ({}))) as { items?: PersonalChannel[]; error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seu WhatsApp.");
        const ownChannels = (payload.items || []).filter((item) => item.channelScope === "personal" && item.ownerUserId === tenant.userId);
        setChannels(ownChannels);
        const current = ownChannels[0];
        if (current) {
          setSelectedId(current.id);
          setDisplayName(current.displayName || "Meu WhatsApp");
          setPhoneNumber(current.phoneNumber || "");
        }
      } catch (currentError) {
        if (active) setError(currentError instanceof Error ? currentError.message : "Falha ao carregar seu WhatsApp.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tenant?.tenantId, tenant?.userId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !hasCapability("manage_personal_channel")) return;
    setSaving(true); setError(""); setNotice(""); setQr("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedId || undefined,
          type: "whatsapp",
          provider: "evolution",
          displayName,
          phoneNumber,
          status: "active",
          channelScope: "personal",
          metadata: { sessionId },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { channelId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar seu WhatsApp.");
      const id = payload.channelId || selectedId;
      setSelectedId(id);
      setNotice("Seu WhatsApp foi salvo. Gere o QR para conectar o aparelho.");
      setChannels((current) => [{ id, displayName, phoneNumber, provider: "evolution", channelScope: "personal", ownerUserId: tenant.userId }, ...current.filter((item) => item.id !== id)]);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Falha ao salvar seu WhatsApp.");
    } finally { setSaving(false); }
  }

  async function generateQr() {
    if (!tenant?.tenantId || !selectedId) return;
    setLoadingQr(true); setError(""); setNotice("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/channels/${encodeURIComponent(selectedId)}/whatsapp-session?action=qr`);
      const payload = (await response.json().catch(() => ({}))) as { qr?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível gerar o QR.");
      setQr(payload.qr || "");
      setNotice(payload.qr ? "Escaneie este QR com o WhatsApp do seu aparelho." : (payload.message || "O provedor ainda não retornou um QR."));
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Falha ao gerar o QR.");
    } finally { setLoadingQr(false); }
  }

  if (loading) return <section className="space-y-4"><div className="h-8 w-56 animate-pulse rounded-xl bg-[var(--cliente-surface-muted)]" /><div className="h-64 animate-pulse rounded-2xl bg-[var(--cliente-surface-muted)]" /></section>;

  return (
    <div className="space-y-5">
      <SectionHeader title="Meu WhatsApp" subtitle="Conecte somente o número que você usa no atendimento. O dono e os gestores continuam controlando os canais da empresa." />
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      <PanelCard className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><Smartphone className="h-5 w-5" /></span>
          <div><h2 className="text-lg font-bold text-[var(--cliente-card-text)]">Seu número pessoal</h2><p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-soft)]">Este canal fica visível para você e para os responsáveis autorizados. Ele não vira um canal compartilhado.</p></div>
        </div>
        <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-[var(--cliente-card-text)]">Nome do canal<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required className="min-h-11 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-[var(--cliente-card-text)]">Seu número<input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+55 11 99999-9999" required className="min-h-11 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 font-normal" /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-[var(--cliente-card-text)] sm:col-span-2">Identificação da sessão<input value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="meu-whatsapp" required className="min-h-11 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 font-normal" /><span className="text-xs font-normal text-[var(--cliente-card-text-soft)]">Use um identificador único para este aparelho.</span></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {saving ? "Salvando…" : "Salvar meu WhatsApp"}</button>{selectedId ? <button type="button" onClick={() => void generateQr()} disabled={loadingQr} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 text-sm font-bold text-emerald-800 disabled:opacity-60">{loadingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Gerar QR</button> : null}</div>
        </form>
      </PanelCard>
      {qr ? <PanelCard className="p-5 sm:p-6"><h2 className="text-lg font-bold text-[var(--cliente-card-text)]">Conectar aparelho</h2><div className="mt-4 flex justify-center rounded-2xl bg-white p-4">{qr.startsWith("data:image") || qr.startsWith("http") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code para conectar seu WhatsApp" className="h-64 w-64 object-contain" />
      ) : <pre className="max-w-full overflow-auto text-xs text-slate-800">{qr}</pre>}</div></PanelCard> : null}
      {channels.length ? <PanelCard className="p-5"><h2 className="text-sm font-bold text-[var(--cliente-card-text)]">Canal conectado</h2>{channels.map((channel) => <div key={channel.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--cliente-border)] p-3"><div><p className="font-semibold text-[var(--cliente-card-text)]">{channel.displayName || "Meu WhatsApp"}</p><p className="text-sm text-[var(--cliente-card-text-soft)]">{channel.phoneNumber || "Número não informado"}</p></div><StateBadge label={channel.connectionStatus === "ready" ? "Conectado" : "Aguardando conexão"} tone={channel.connectionStatus === "ready" ? "success" : "warning"} /></div>)}</PanelCard> : null}
    </div>
  );
}
