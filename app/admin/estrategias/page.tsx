"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { AdminMarketingOverview } from "@/lib/admin-marketing-overview";
type Strategy = { id: string; tenantId: string; name: string; hypothesis: string; metric: string; status: string; baseline: { value: number | null; from: string; to: string }; observed: { value: number | null } | null; comparison: { outcome: string; percent: number | null; reasons: string[] } | null; notes: string };
type Suggestion = { name: string; hypothesis: string; evidence: string; metric: string };
const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
export default function StrategiesPage() {
  const [overview, setOverview] = useState<AdminMarketingOverview | null>(null);
  const [items, setItems] = useState<Strategy[]>([]), [partial, setPartial] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [campaign, setCampaign] = useState(""), [tenant, setTenant] = useState("");
  const [name, setName] = useState(""), [hypothesis, setHypothesis] = useState(""), [metric, setMetric] = useState("cost_per_conversion");
  const [notes, setNotes] = useState<Record<string, string>>({}), [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const responses = await Promise.allSettled([authedFetch("/api/admin/marketing/overview", { signal }), authedFetch("/api/admin/strategies", { signal })]);
    for (const [index, result] of responses.entries()) {
      if (signal?.aborted) return;
      if (result.status === "rejected") { setError("Alguma fonte de estratégias está indisponível."); continue; }
      const data = await result.value.json();
      if (!result.value.ok) { setError(data.error || "Falha na consulta."); continue; }
      if (index === 0) { setOverview(data); if (data.partial) setError("A cobertura de contas e campanhas está parcial."); } else { setItems(data.items || []); setPartial(data.partial); }
    }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError("Falha na consulta."); }); return () => controller.abort(); }, [load]);
  const selected = overview?.campaigns.find(row => row.id === campaign);
  async function request(action: "start" | "suggest" | "conclude", id?: string) {
    if (action !== "conclude" && (!selected?.tenantId || !selected.channelId)) { setError("Escolha uma campanha ligada à empresa e ao canal."); return; }
    setBusy(true); setError("");
    try {
      const body = action === "conclude" ? { id, notes: notes[id!] || "" } : { tenantId: selected!.tenantId, platform: selected!.platform, channelId: selected!.channelId, campaignId: selected!.campaignId, metric, name: name || "Análise de campanha", hypothesis: hypothesis || "Identificar uma hipótese verificável a partir dos resultados." };
      const response = await authedFetch(action === "suggest" ? "/api/admin/strategies/suggest" : "/api/admin/strategies", { method: action === "conclude" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Falha na estratégia.");
      if (action === "suggest") setSuggestions(data.suggestions || []); else { if (action === "start") { setName(""); setHypothesis(""); } await load(); }
    } catch (err) { setError(err instanceof Error ? err.message : "Falha na estratégia."); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-5 text-slate-900"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Estratégias e aprendizado</h1><p className="mt-1 text-sm text-slate-500">Histórico de hipóteses, resultados e próximos testes por empresa.</p></div><Link href="/admin/midia" className={field}>Central de mídia</Link></header>{error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</p>}{partial && <p role="status" className="text-sm text-amber-700">Exibindo os primeiros 500 registros. A memória de estratégias está parcial.</p>}
    <details className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold text-indigo-700">Registrar novo teste</summary><div className="flex flex-wrap gap-2"><select className={field} value={tenant} aria-label="Empresa" onChange={event => { setTenant(event.target.value); setCampaign(""); setSuggestions([]); }}><option value="">Todas as empresas</option>{overview?.companies.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select className={`${field} flex-1`} aria-label="Campanha" value={campaign} onChange={event => { setCampaign(event.target.value); setSuggestions([]); }}><option value="">Selecionar campanha sincronizada</option>{overview?.campaigns.filter(row => row.linked && !row.stale && (!tenant || row.tenantId === tenant)).map(row => <option key={row.id} value={row.id}>{row.companyName} · {row.name}</option>)}</select><select className={field} aria-label="Indicador" value={metric} onChange={event => setMetric(event.target.value)}><option value="cost_per_conversion">Custo por conversão</option><option value="conversions">Conversões</option><option value="roas">ROAS</option></select><button className={button} disabled={busy || !campaign} onClick={() => void request("suggest")}>Sugerir com IA</button></div><input className={`${field} w-full`} aria-label="Nome da hipótese" placeholder="Nome do teste" value={name} onChange={event => setName(event.target.value)} /><textarea className={`${field} w-full`} aria-label="Hipótese" placeholder="O que será testado e qual resultado esperamos observar?" value={hypothesis} onChange={event => setHypothesis(event.target.value)} /><button className={button} disabled={busy || !campaign || name.trim().length < 3 || hypothesis.trim().length < 15} onClick={() => void request("start")}>Registrar teste e capturar base</button><p className="text-xs text-slate-500">O registro salva a base do último relatório. Alterações de campanha passam pela revisão na central de mídia.</p></details>
    {!!suggestions.length && <section className="divide-y rounded-xl border border-purple-200 bg-white p-5"><h2 className="pb-3 font-semibold">Sugestões da IA para esta empresa</h2>{suggestions.map((row, index) => <article className="py-3" key={index}><h3 className="font-semibold">{row.name}</h3><p className="mt-1 text-sm">{row.hypothesis}</p><p className="mt-1 text-xs text-slate-500">{row.evidence}</p><button className="mt-2 text-sm text-indigo-600" onClick={() => { setName(row.name); setHypothesis(row.hypothesis); setMetric(row.metric); }}>Usar como hipótese</button></article>)}</section>}
    <section className="divide-y rounded-xl border bg-white">{items.filter(row => !tenant || row.tenantId === tenant).map(row => <article className="space-y-2 p-5" key={row.id}><p className="text-xs text-slate-500">{overview?.companies.find(company => company.id === row.tenantId)?.name || row.tenantId} · {row.status === "running" ? "Em acompanhamento" : "Concluída"}</p><h2 className="font-semibold">{row.name}</h2><p className="text-sm">{row.hypothesis}</p><p className="text-xs text-slate-500">Base: {row.baseline.value ?? "sem dado"} · {row.baseline.from} → {row.baseline.to}{row.observed && ` ·  ${row.observed.value ?? "sem dado"}`}</p>{row.comparison && <div className="text-sm"><p>{{ improved: "Melhora observada", worsened: "Piora observada", unchanged: "Sem variação", inconclusive: "Resultado inconclusivo" }[row.comparison.outcome] || row.comparison.outcome}{row.comparison.percent !== null && ` (${row.comparison.percent}%)`}</p>{row.comparison.reasons.map(reason => <p className="text-xs text-slate-500" key={reason}>{reason}</p>)}<p className="mt-2">{row.notes}</p></div>}{row.status === "running" && <div className="flex flex-wrap gap-2"><input className={`${field} flex-1`} aria-label={`Observação sobre ${row.name}`} placeholder="O que mudou durante o teste?" value={notes[row.id] || ""} onChange={event => setNotes({ ...notes, [row.id]: event.target.value })} /><button className={button} disabled={busy || (notes[row.id] || "").trim().length < 8} onClick={() => void request("conclude", row.id)}>Medir e concluir</button></div>}</article>)}{!items.length && <p className="p-8 text-center text-sm text-slate-500">Nenhuma estratégia registrada.</p>}</section>
  </div>;
}
