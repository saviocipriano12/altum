"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Download, Image as ImageIcon, Library, Loader2, Play, Sparkles, Video, X } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Tenant = { id: string; name: string };
type QualityPreflight = { status: "ready_for_review" | "needs_attention"; summary: string };
type Asset = { id: string; tenantId: string; projectTitle: string; type: "image" | "video"; reviewStatus: string; qualityPreflight: QualityPreflight | null; deliveryUrl: string; createdAt: string | null };

const reviewCopy: Record<string, string> = {
  approved: "Pronto para reutilizar",
  rejected: "Descartado",
  pending: "Precisa da sua revisão",
};

export default function ResultadosPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authedFetch("/api/admin/agent-os/results");
      const data = await response.json().catch(() => ({})) as { items?: Asset[]; tenants?: Tenant[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar sua biblioteca.");
      setAssets(data.items || []);
      setTenants(data.tenants || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar sua biblioteca.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => assets.filter((asset) => !tenantId || asset.tenantId === tenantId), [assets, tenantId]);
  const pendingCount = useMemo(() => visible.filter((asset) => asset.reviewStatus === "pending").length, [visible]);

  async function review(assetId: string, decision: "approved" | "rejected") {
    try {
      setReviewing(`${assetId}:${decision}`);
      setError("");
      const response = await authedFetch(`/api/admin/agent-os/creative-assets/${assetId}/review`, { method: "PATCH", body: JSON.stringify({ decision }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar sua decisão.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar sua decisão.");
    } finally {
      setReviewing("");
    }
  }

  return (
    <main className="min-h-dvh bg-[#212121] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-white/[.08] bg-[#212121]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/admin/comando" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-400 transition hover:bg-white/[.07] hover:text-white"><ArrowLeft size={16} /><span className="hidden sm:inline">Voltar ao Comando</span></Link>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200"><Library size={16} className="text-violet-300" />Biblioteca</div>
          <div className="w-8" aria-hidden="true" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[.18em] text-violet-300">Entregas da Altum</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Sua biblioteca de resultados</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Imagens e vídeos criados nas conversas, prontos para revisar, reutilizar ou baixar.</p></div>
          <label className="text-xs font-medium text-zinc-400">Empresa<select value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="mt-2 block min-w-52 rounded-xl border border-white/10 bg-[#2b2b2b] px-3 py-2.5 text-sm font-normal text-zinc-100 outline-none transition focus:border-violet-300"><option value="">Todas as empresas</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
        </section>

        {!loading && visible.length > 0 && <section className="mt-8 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-zinc-300">{visible.length} {visible.length === 1 ? "entrega" : "entregas"}</span>{pendingCount > 0 && <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">{pendingCount} {pendingCount === 1 ? "aguardando revisão" : "aguardando revisões"}</span>}</section>}
        {error && <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100"><X size={17} className="mt-0.5 shrink-0" />{error}</div>}
        {loading && <div className="flex justify-center py-28"><Loader2 className="animate-spin text-violet-300" /></div>}

        {!loading && !visible.length && <section className="mt-8 rounded-3xl border border-dashed border-white/15 bg-white/[.025] px-6 py-20 text-center"><span className="inline-flex rounded-2xl bg-violet-500/15 p-3 text-violet-200"><Sparkles size={24} /></span><h2 className="mt-5 text-lg font-medium text-white">Sua primeira entrega aparecerá aqui</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Peça um criativo no Comando. Quando estiver pronto, você poderá revisar a entrega e reaproveitá-la em novas campanhas.</p><Link href="/admin/comando" className="mt-6 inline-flex rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-400">Abrir Comando Altum</Link></section>}

        {!loading && visible.length > 0 && <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((asset) => <article key={asset.id} className="group overflow-hidden rounded-2xl border border-white/[.09] bg-[#292929] shadow-sm transition hover:border-white/[.16]"><div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black">{asset.type === "video" ? <video controls preload="metadata" className="h-full w-full object-contain" src={asset.deliveryUrl}>Seu navegador não conseguiu abrir este vídeo.</video> : <img src={asset.deliveryUrl} alt={asset.projectTitle} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.015]" />}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-medium text-violet-200">{asset.type === "video" ? <Video size={14} /> : <ImageIcon size={14} />}{asset.type === "video" ? "Vídeo" : "Imagem"}</p><h2 className="mt-2 truncate text-sm font-medium text-zinc-100">{asset.projectTitle}</h2><p className="mt-1 text-xs text-zinc-500">{asset.createdAt ? new Date(asset.createdAt).toLocaleString("pt-BR") : "Entrega recente"}</p></div><a href={asset.deliveryUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white" aria-label={`Abrir ${asset.projectTitle}`} title="Abrir ou baixar resultado">{asset.type === "video" ? <Play size={16} /> : <Download size={16} />}</a></div>{asset.qualityPreflight && <p className={`mt-3 rounded-lg px-2.5 py-2 text-xs leading-5 ${asset.qualityPreflight.status === "needs_attention" ? "bg-amber-300/10 text-amber-100" : "bg-emerald-300/10 text-emerald-100"}`}>{asset.qualityPreflight.summary}</p>}<div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.08] pt-3"><p className={`text-xs font-medium ${asset.reviewStatus === "approved" ? "text-emerald-300" : asset.reviewStatus === "rejected" ? "text-zinc-500" : "text-amber-200"}`}>{reviewCopy[asset.reviewStatus] || "Em revisão"}</p>{asset.reviewStatus === "pending" && <div className="flex gap-2"><button disabled={Boolean(reviewing)} onClick={() => void review(asset.id, "rejected")} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[.08] hover:text-zinc-100 disabled:opacity-50">Descartar</button><button disabled={Boolean(reviewing)} onClick={() => void review(asset.id, "approved")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-400 disabled:opacity-50"><Check size={13} />{reviewing === `${asset.id}:approved` ? "Salvando…" : "Usar"}</button></div>}</div></div></article>)}
        </section>}
      </div>
    </main>
  );
}
