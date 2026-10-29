"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Instagram, Loader2, MessageCircle, QrCode, X } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import styles from "./conversations.module.css";

export type InboxConnectChannel = {
  id: string;
  type?: string;
  provider?: string;
  status?: string;
  connectionStatus?: string;
  displayName?: string;
  phoneNumber?: string;
  channelScope?: string;
  ownerUserId?: string;
  inboundReady?: boolean;
};

export function isInboxChannelConnected(channel: InboxConnectChannel) {
  return ["whatsapp", "instagram", "messenger", "site_chat", "site_form"].includes(channel.type || "") &&
    channel.status === "active" && channel.inboundReady !== false &&
    ["ready", "connected"].includes(channel.connectionStatus || "");
}

type Props = {
  tenantId: string;
  userId: string;
  channels: InboxConnectChannel[];
  managedQrAvailable: boolean;
  canManageChannels: boolean;
  canManagePersonalChannel: boolean;
  onClose: () => void;
  onConnected: () => Promise<void>;
};

/** Uses the existing channel/session endpoints; Meta asset selection stays in its established flow. */
export function InboxConnectDialog({ tenantId, userId, channels, managedQrAvailable, canManageChannels, canManagePersonalChannel, onClose, onConnected }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<"choose" | "whatsapp">("choose");
  const [displayName, setDisplayName] = useState(canManageChannels ? "WhatsApp Comercial" : "Meu WhatsApp");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [channelId, setChannelId] = useState("");
  const [qr, setQr] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const canConnectQr = canManageChannels || canManagePersonalChannel;
  const existingQrChannel = channels.find(channel => channel.type === "whatsapp" && !isInboxChannelConnected(channel) &&
    ["evolution", "evolution_api"].includes(channel.provider || "") &&
    (canManageChannels || (channel.channelScope === "personal" && channel.ownerUserId === userId)));
  const qrAvailable = managedQrAvailable || Boolean(existingQrChannel);

  useEffect(() => {
    const dialog = dialogRef.current;
    requestRef.current = new AbortController();
    dialog?.showModal();
    return () => { requestRef.current?.abort(); dialog?.close(); };
  }, []);

  useEffect(() => {
    if (!waiting || !channelId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const response = await authedFetch(`/api/tenant/${tenantId}/channels/${encodeURIComponent(channelId)}/whatsapp-session?action=status`, { signal: controller.signal });
        const payload = await response.json() as { status?: string; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error || "Não foi possível verificar a conexão.");
        failures = 0;
        if (payload.status === "connected") {
          setWaiting(false); setQr(""); setConnected(true);
          await onConnected();
          return;
        }
        if (["error", "not_configured"].includes(payload.status || "")) {
          setWaiting(false); setError("A conexão não foi concluída. Gere outro QR Code ou revise o canal nas configurações.");
          return;
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        failures += 1;
        if (failures >= 3) {
          setWaiting(false);
          setError(caught instanceof Error ? caught.message : "Não foi possível verificar a conexão. Tente novamente.");
          return;
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [channelId, onConnected, tenantId, waiting]);

  async function generateQr(event: FormEvent) {
    event.preventDefault();
    if (busy || !canConnectQr || !qrAvailable) return;
    setBusy(true); setError(""); setNotice(""); setWaiting(false); setQr("");
    const signal = requestRef.current?.signal;
    try {
      let id = channelId || existingQrChannel?.id;
      if (!id) {
        const response = await authedFetch(`/api/tenant/${tenantId}/channels`, {
          method: "POST", signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "whatsapp", provider: "evolution", displayName: displayName.trim(), phoneNumber: phoneNumber.trim(), status: "active", channelScope: canManageChannels ? "shared" : "personal", ownerUserId: canManageChannels ? undefined : userId, metadata: { sessionId: `altum-${crypto.randomUUID()}` } }),
        });
        const payload = await response.json() as { channelId?: string; error?: string };
        if (!response.ok || !payload.channelId) throw new Error(payload.error || "Não foi possível preparar o WhatsApp.");
        id = payload.channelId;
      }
      if (signal?.aborted) return;
      setChannelId(id);
      const response = await authedFetch(`/api/tenant/${tenantId}/channels/${encodeURIComponent(id)}/whatsapp-session?action=qr`, { signal });
      const payload = await response.json() as { qr?: string; status?: string; error?: string; message?: string };
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(payload.error || "Não foi possível gerar o QR Code.");
      if (payload.status === "connected") { setConnected(true); await onConnected(); return; }
      if (!payload.qr || !/^(data:image\/(png|jpeg|webp|svg\+xml);|https?:\/\/)/i.test(payload.qr)) {
        throw new Error(payload.message || "O QR Code ainda não está disponível. Tente gerar novamente.");
      }
      setQr(payload.qr); setWaiting(true);
      setNotice("No WhatsApp do celular, abra Aparelhos conectados → Conectar aparelho e escaneie o código.");
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Não foi possível conectar. Tente novamente.");
    } finally { if (!signal?.aborted) setBusy(false); }
  }

  async function connectMeta(channelType: "instagram" | "messenger") {
    if (busy || !canManageChannels) return;
    setBusy(true); setError("");
    const signal = requestRef.current?.signal;
    try {
      const response = await authedFetch("/api/integrations/meta/start", {
        method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, channelType, redirectPath: "/cliente/painel/configuracoes/canais" }),
      });
      const payload = await response.json() as { authUrl?: string; error?: string };
      if (signal?.aborted) return;
      if (!response.ok || !payload.authUrl) throw new Error(payload.error || "Não foi possível iniciar a conexão com a Meta.");
      const url = new URL(payload.authUrl);
      if (url.protocol !== "https:") throw new Error("Endereço de autorização inválido.");
      window.location.assign(url.href);
    } catch (caught) {
      if (!signal?.aborted) { setError(caught instanceof Error ? caught.message : "Falha ao conectar à Meta."); setBusy(false); }
    }
  }

  return <dialog ref={dialogRef} className={styles.connectDialog} aria-labelledby="inbox-connect-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className={styles.connectHeader}>
      <div><p className={styles.eyebrow}>Seus canais de atendimento</p><h2 id="inbox-connect-title">{connected ? "WhatsApp conectado" : step === "whatsapp" ? "Conectar WhatsApp" : "Conecte seus canais"}</h2></div>
      <button type="button" onClick={onClose} className={styles.iconButton} aria-label="Fechar conexão de canais"><X size={20} /></button>
    </div>
    {error ? <p role="alert" className={styles.connectionError}>{error}</p> : null}
    {connected ? <div className={styles.connectSuccess}><CheckCircle2 size={40} /><h3>Pronto para conversar</h3><p>A conexão foi confirmada. As conversas recebidas aparecerão na sua fila.</p><button type="button" className={styles.primaryButton} onClick={onClose}>Ir para Conversas</button></div> : step === "choose" ? <>
      {canConnectQr ? <p className={styles.connectIntro}>Escolha por onde quer atender. Você também pode conectar outros canais depois.</p> : null}
      <div className={styles.channelChoices}>
        {canConnectQr ? <button type="button" disabled={busy} onClick={() => { setError(""); setStep("whatsapp"); }}><span className={styles.whatsappMark}><QrCode size={24} /></span><span><strong>WhatsApp por QR Code</strong><small>{canManageChannels ? "Conecte um número para sua equipe atender." : "Conecte seu próprio número de atendimento."}</small></span><span aria-hidden="true">→</span></button> : null}
        {canManageChannels ? <><button type="button" onClick={() => void connectMeta("instagram")} disabled={busy}><span className={styles.instagramMark}><Instagram size={24} /></span><span><strong>Instagram</strong><small>Conecte sua conta pela Meta.</small></span>{busy ? <Loader2 size={18} className="animate-spin" /> : <span aria-hidden="true">→</span>}</button><button type="button" onClick={() => void connectMeta("messenger")} disabled={busy}><span className={styles.metaMark}><MessageCircle size={24} /></span><span><strong>Facebook Messenger</strong><small>Conecte as mensagens da sua página.</small></span><span aria-hidden="true">→</span></button><Link href="/cliente/painel/configuracoes/canais"><span className={styles.metaMark}><MessageCircle size={24} /></span><span><strong>WhatsApp oficial e outros canais</strong><small>Veja as opções de conexão da empresa.</small></span><span aria-hidden="true">→</span></Link></> : null}
      </div>
      {!canManageChannels && !canManagePersonalChannel ? <p className={styles.permissionNotice}>Peça ao administrador da sua empresa para conectar o WhatsApp ou as redes sociais. Seu perfil pode atender nos canais liberados pela empresa.</p> : null}
      <button type="button" className={styles.textButton} onClick={onClose}>Fazer isso depois</button>
    </> : <>
      <button type="button" className={styles.textButton} disabled={busy} onClick={() => { setWaiting(false); setQr(""); setStep("choose"); setError(""); }}><ArrowLeft size={15} /> Outros canais</button>
      {!qrAvailable ? <div className={styles.permissionNotice}><p>A conexão por QR Code precisa ser configurada para esta empresa.</p><Link href={canManageChannels ? "/cliente/painel/configuracoes/canais" : "/cliente/painel/configuracoes/meu-whatsapp"}>Abrir configurações do WhatsApp →</Link></div> : <form onSubmit={generateQr} className={styles.connectForm}>
        {existingQrChannel ? <p>Conectar <strong>{existingQrChannel.displayName || "WhatsApp"}</strong>{existingQrChannel.phoneNumber ? ` · ${existingQrChannel.phoneNumber}` : ""}</p> : <><label>Nome do canal<input value={displayName} onChange={event => setDisplayName(event.target.value)} required maxLength={120} disabled={busy || Boolean(channelId)} /></label><label>Número do WhatsApp<input type="tel" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} placeholder="+55 11 99999-9999" required maxLength={80} disabled={busy || Boolean(channelId)} /></label><p className={styles.hint}>{canManageChannels ? "Este canal será compartilhado com a equipe autorizada." : "Este canal será pessoal e vinculado a você."}</p></>}
        <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}{busy ? "Preparando conexão…" : qr ? "Atualizar QR Code" : "Gerar QR Code"}</button>
      </form>}
      {qr ? <div className={styles.qrPanel}>{/* QR codes are short-lived data URLs returned by the existing provider. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR Code para conectar o WhatsApp" width={256} height={256} /><p role="status">{notice}</p>{waiting ? <span className={styles.hint}><Loader2 size={14} className="animate-spin" /> Aguardando confirmação no celular…</span> : null}
      </div> : null}
    </>}
  </dialog>;
}
