"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Image, Loader2, Plus, Sparkles, Video, WandSparkles } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Tenant = { id: string; name: string };
type Job = { id: string; status: string; providerName: string; assetUrl?: string | null };
type Output = { id: string; title: string; content: string; status: string; jobs: Job[] };
type Connection = { id: string; displayName: string; scope: string; tenantId: string | null; capabilities: string[]; status: string };
type Project = { id: string; tenantId: string; title: string; brief: string; format: string; channel: string; status: string; outputs: Output[] };

const jobStatus: Record<string, string> = {
  pending_approval: "Aguardando aprovação", queued: "Na fila de execução", rejected: "Geração recusada",
  running: "Gerando mídia", submitted: "Vídeo está sendo preparado", completed: "Mídia pronta", failed: "Falhou",
};

export default function CreativeStudioPage() {
  const [items, setItems] = useState<Project[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", brief: "", format: "image", channel: "Instagram" });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authedFetch("/api/admin/agent-os/creative-projects");
      const data = (await response.json().catch(() => ({}))) as { items?: Project[]; connections?: Connection[]; tenants?: Tenant[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar projetos criativos.");
      setItems(data.items || []);
      setConnections(data.connections || []);
      setTenants(data.tenants || []);
      setTenantId((current) => current || data.tenants?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar projetos criativos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const projects = useMemo(() => items.filter((item) => !tenantId || item.tenantId === tenantId), [items, tenantId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true); setError("");
      const response = await authedFetch("/api/admin/agent-os/creative-projects", { method: "POST", body: JSON.stringify({ action: "create", tenantId, ...form }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível criar o briefing.");
      setOpen(false); setForm({ title: "", brief: "", format: "image", channel: "Instagram" }); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o briefing.");
    } finally { setSaving(false); }
  }

  async function generate(projectId: string) {
    try {
      setBusy(projectId); setError("");
      const response = await authedFetch("/api/admin/agent-os/creative-projects", { method: "POST", body: JSON.stringify({ action: "generate", projectId }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível gerar os rascunhos.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar os rascunhos.");
    } finally { setBusy(""); }
  }

  async function queueMedia(projectId: string, outputId: string) {
    try {
      setBusy(outputId); setError("");
      const response = await authedFetch("/api/admin/agent-os/creative-projects", { method: "POST", body: JSON.stringify({ action: "queue_media", projectId, outputId }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível preparar a geração de mídia.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar a geração de mídia.");
    } finally { setBusy(""); }
  }

  async function execute(jobId: string) {
    try {
      setBusy(jobId); setError("");
      const response = await authedFetch(`/api/admin/agent-os/creative-jobs/${jobId}/execute`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível executar a geração de mídia.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível executar a geração de mídia.");
    } finally { setBusy(""); }
  }

  const refresh = useCallback(async (jobId: string) => {
    try {
      setBusy(jobId); setError("");
      const response = await authedFetch(`/api/admin/agent-os/creative-jobs/${jobId}/execute`, { method: "POST", body: JSON.stringify({ action: "refresh" }) });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Ainda não foi possível consultar o resultado.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ainda não foi possível consultar o resultado.");
    } finally { setBusy(""); }
  }, [load]);

  useEffect(() => {
    const submitted = items.flatMap((project) => project.outputs.flatMap((output) => output.jobs)).filter((job) => job.status === "submitted");
    if (!submitted.length) return;
    const timer = window.setTimeout(() => { submitted.forEach((job) => void refresh(job.id)); }, 12_000);
    return () => window.clearTimeout(timer);
  }, [items, refresh]);

  return (
    <div className="mx-auto max-w-[1360px] space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-600">Altum Agent OS</p>
          <h1 className="mt-1 text-2xl font-semibold">Creative Studio</h1>
          <p className="mt-1 text-sm text-slate-500">Do briefing ao job de imagem ou vídeo, com marca, provedor e aprovação no mesmo fluxo.</p>
        </div>
        <div className="flex gap-2">
          <select value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="control">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>
          <button onClick={() => setOpen(!open)} className="primary-button"><Plus size={16} /> Novo briefing</button>
        </div>
      </header>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {open && <form onSubmit={create} className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Nome<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="field" placeholder="Ex.: Lançamento da nova oferta" /></label>
          <label className="text-sm font-medium">Formato<select value={form.format} onChange={(event) => setForm({ ...form, format: event.target.value })} className="field"><option value="image">Imagem</option><option value="carousel">Carrossel</option><option value="video">Vídeo</option><option value="copy">Copy</option></select></label>
          <label className="text-sm font-medium">Canal<input value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} className="field" /></label>
          <label className="text-sm font-medium md:col-span-2">Briefing<textarea required value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })} className="field min-h-28" placeholder="Objetivo, oferta, mensagem principal e contexto necessário." /></label>
        </div>
        <div className="mt-4 flex justify-end"><button disabled={saving || !tenantId} className="primary-button disabled:opacity-60">{saving ? "Criando..." : "Criar briefing"}</button></div>
      </form>}

      <section className="grid gap-4 lg:grid-cols-2">
        {loading && <Loader2 className="mx-auto animate-spin text-violet-600" />}
        {!loading && projects.map((project) => {
          return <article key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><span className="rounded-lg bg-violet-100 p-2 text-violet-700">{project.format === "video" ? <Video size={16} /> : <Image size={16} />}</span><h2 className="font-semibold">{project.title}</h2></div><p className="mt-2 line-clamp-2 text-sm text-slate-500">{project.brief}</p></div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{project.channel}</span>
            </div>
            {project.outputs.length ? <div className="mt-4 space-y-2">{project.outputs.map((output) => <details key={output.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium">{output.title} · rascunho</summary>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{output.content}</p>
              {project.format !== "copy" && <div className="mt-4 border-t border-slate-200 pt-3">
                {output.jobs.length > 0 && <div className="mb-3 space-y-3">{output.jobs.map((job) => <div key={job.id} className="space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800">{jobStatus[job.status] || job.status} · {job.providerName}</span>{job.status === "queued" && <button disabled={busy === job.id} onClick={() => void execute(job.id)} className="secondary-button disabled:opacity-60"><WandSparkles size={14} /> {busy === job.id ? "Executando..." : "Gerar agora"}</button>}{job.status === "submitted" && <button disabled={busy === job.id} onClick={() => void refresh(job.id)} className="secondary-button disabled:opacity-60"><Loader2 size={14} className={busy === job.id ? "animate-spin" : ""} /> {busy === job.id ? "Verificando..." : "Ver resultado"}</button>}{job.assetUrl && <a href={job.assetUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-violet-700 underline">Abrir em tela cheia</a>}</div>{job.assetUrl && (project.format === "video" ? <video controls preload="metadata" className="max-h-72 w-full rounded-xl border border-slate-200 bg-slate-950" src={job.assetUrl}>Seu navegador não conseguiu abrir este vídeo.</video> : <img src={job.assetUrl} alt={`Resultado: ${output.title}`} className="max-h-72 w-full rounded-xl border border-slate-200 object-contain bg-white" />)}</div>)}</div>}
                {connections.some((connection) => connection.capabilities.includes(project.format === "video" ? "GENERATE_VIDEO" : "GENERATE_IMAGE") && (connection.scope === "platform" || connection.tenantId === project.tenantId)) ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-violet-50 p-3"><p className="text-xs leading-5 text-violet-900">A Altum vai escolher automaticamente a melhor rota disponível para este {project.format === "video" ? "vídeo" : "criativo"}.</p><button disabled={busy === output.id} onClick={() => void queueMedia(project.id, output.id)} className="secondary-button disabled:opacity-60"><WandSparkles size={15} /> {busy === output.id ? "Preparando..." : "Preparar geração"}</button></div> : <p className="text-xs leading-5 text-slate-500">Nenhuma IA para {project.format === "video" ? "vídeo" : "imagem"} está conectada. <a href="/admin/conexoes" className="font-semibold text-violet-700 underline">Conectar agora</a></p>}
              </div>}
            </details>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Ainda não há conceitos. O Creative Director usará o Brand Hub para criar rascunhos revisáveis.</div>}
            <div className="mt-4"><button disabled={busy === project.id} onClick={() => void generate(project.id)} className="secondary-button disabled:opacity-60"><Sparkles size={15} />{busy === project.id ? "Gerando..." : project.outputs.length ? "Gerar novas variações" : "Gerar conceitos"}</button></div>
          </article>;
        })}
        {!loading && !projects.length && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">Crie um briefing para iniciar a produção criativa.</div>}
      </section>

      <style jsx>{`
        .field,.control{display:block;border:1px solid rgb(226 232 240);border-radius:.75rem;background:white;padding:.6rem .75rem;font-size:.875rem;outline:none}
        .field{width:100%;margin-top:.4rem;background:rgb(248 250 252)}.field:focus,.control:focus{border-color:rgb(139 92 246)}
        .primary-button,.secondary-button{display:inline-flex;align-items:center;gap:.5rem;border-radius:.75rem;padding:.55rem .9rem;font-size:.875rem;font-weight:600}
        .primary-button{background:rgb(124 58 237);color:white}.secondary-button{border:1px solid rgb(221 214 254);background:rgb(245 243 255);color:rgb(109 40 217)}
      `}</style>
    </div>
  );
}
