"use client";
import { useEffect, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Pending = { pendingId: string; tenantId: string; channelType: string; options: Array<{ id: string; label: string; description: string }> };
type Props = { companies: Array<{ id: string; name: string }>; onConnected: () => Promise<void>; initialTenantId?: string; initialPlatform?: string };
export default function AdminMediaConnections({ companies, onConnected, initialTenantId = "", initialPlatform = "meta_ads" }: Props) {
  const [tenantId, setTenantId] = useState(initialTenantId), [platform, setPlatform] = useState(initialPlatform);
  const [pending, setPending] = useState<Pending | null>(null), [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(window.location.search);
    if (query.get("result") === "error") setError(query.get("message") || "A conexão não foi concluída.");
    if (query.get("result") === "success") setNotice("Autorização concluída. Confira a conta e sincronize os relatórios.");
    const id = query.get("pendingId");
    if (query.get("result") === "select" && id && /^[A-Za-z0-9_-]{1,180}$/.test(id)) {
      void authedFetch(`/api/integrations/pending/${encodeURIComponent(id)}`, { signal: controller.signal })
        .then(async response => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Seleção de conta indisponível.");
          if (!controller.signal.aborted) {
            if (!["meta_ads", "google_ads"].includes(payload.item?.channelType)) throw new Error("Esta seleção não pertence à operação de anúncios.");
            setPending(payload.item);
          }
        }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha ao carregar contas."); });
    }
    return () => controller.abort();
  }, []);
  async function connect() {
    if (!tenantId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const provider = platform === "meta_ads" ? "meta" : "google";
      const response = await authedFetch(`/api/integrations/${provider}/start`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, channelType: platform, redirectPath: "/admin/midia" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível iniciar a conexão.");
      const target = new URL(payload.authUrl);
      if (target.protocol !== "https:" || target.hostname !== (provider === "meta" ? "www.facebook.com" : "accounts.google.com") || target.username || target.password) throw new Error("Endereço de autorização inválido.");
      window.location.assign(target.toString());
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao conectar."); setBusy(false); }
  }
  async function complete() {
    if (!pending || !selection || busy) return;
    setBusy(true); setError("");
    try {
      const response = await authedFetch(`/api/integrations/pending/${encodeURIComponent(pending.pendingId)}/complete`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectionId: selection }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível conectar esta conta.");
      setPending(null); setSelection("");
      const url = new URL(window.location.href);
      for (const key of ["result", "integration", "channel", "status", "warning", "message", "pendingId", "tenantId"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
      setNotice(`Conta autorizada.${payload.warning ? ` Atenção: ${payload.warning}` : " Sincronize os relatórios para consultar campanhas."}`);
      await onConnected();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha na conexão."); } finally { setBusy(false); }
  }
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  return <section className="space-y-3 border-b p-4" aria-label="Conectar contas de anúncios">
    <h2 className="text-sm font-semibold">Conectar ou reconectar uma conta</h2>
    <div className="flex flex-wrap gap-2">
      <select className={field} aria-label="Empresa da conexão" value={tenantId} disabled={busy || !!pending} onChange={event => setTenantId(event.target.value)}><option value="">Escolher empresa</option>{companies.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <select className={field} aria-label="Plataforma da conexão" value={platform} disabled={busy || !!pending} onChange={event => setPlatform(event.target.value)}><option value="meta_ads">Meta Ads</option><option value="google_ads">Google Ads</option></select>
      <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !tenantId || !!pending} onClick={() => void connect()}>Autorizar no provedor</button>
    </div>
    <p className="text-xs text-slate-500">A autorização retorna para esta central. Se houver várias contas, você escolhe qual vincular à empresa.</p>
    {pending && <div className="space-y-2 rounded-lg bg-indigo-50 p-3"><p className="text-sm font-semibold">Escolher conta de {companies.find(row => row.id === pending.tenantId)?.name || "empresa autorizada"}</p><select className={`${field} max-w-full`} aria-label="Conta autorizada no provedor" value={selection} onChange={event => setSelection(event.target.value)} disabled={busy}><option value="">Escolher conta</option>{pending.options.map(row => <option key={row.id} value={row.id}>{row.label} · {row.description}</option>)}</select><button className="ml-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={busy || !selection} onClick={() => void complete()}>Vincular conta</button></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
  </section>;
}
