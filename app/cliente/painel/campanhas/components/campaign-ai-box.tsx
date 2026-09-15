"use client";

import { FormEvent, useState } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { ClientActionButton, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";

type Answer = { title?: string; answer?: string; error?: string };
const suggestions = ["O que devo corrigir primeiro?", "Onde estou desperdiçando verba?", "Qual campanha merece mais investimento?", "Crie um plano de otimização para esta campanha."];

export function CampaignAiBox({ tenantId, platform, campaigns }: { tenantId: string; platform: "Google Ads" | "Meta Ads"; campaigns: Array<{ id: string; name: string; context?: string }> }) {
  const [campaignId, setCampaignId] = useState("all");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = campaigns.find((item) => item.id === campaignId);

  async function ask(text: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const scopedQuestion = `Sobre ${platform}${selected ? `, especificamente a campanha "${selected.name}" (ID ${selected.id})${selected.context ? `. Dados observados: ${selected.context}` : ""}` : " e todas as campanhas"}: ${text.trim()}`;
      const response = await authedFetch(`/api/tenant/${tenantId}/business-insights/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: scopedQuestion, history: [] }) });
      const data = (await response.json()) as Answer;
      if (!response.ok) throw new Error(data.error || "Falha ao consultar a Altum.");
      setAnswer(data);
      setQuestion("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar a Altum.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }

  return (
    <div id="campaign-ai">
    <PanelCard tone="ai" className="overflow-hidden">
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-b border-[var(--cliente-border)] p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2"><span className="rounded-xl bg-[var(--cliente-ai-soft)] p-2 text-[var(--cliente-ai)]"><Bot className="h-5 w-5" /></span><div><StateBadge label="IA aplicada" tone="ai" /><h2 className="mt-1 font-extrabold">Perguntar sobre campanhas</h2></div></div>
          <p className="mt-3 text-sm leading-5 text-[var(--cliente-card-text-muted)]">Escolha uma campanha e peça uma análise, explicação ou plano. Quando houver mudança, a Altum prepara um rascunho para revisão.</p>
          <label className="mt-4 block text-xs font-bold text-[var(--cliente-card-text-soft)]">Escopo da análise<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm"><option value="all">Todas as campanhas</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={loading} className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-1.5 text-xs font-semibold text-[var(--cliente-card-text-muted)] hover:border-[var(--cliente-ai)] hover:text-[var(--cliente-ai)] disabled:opacity-50">{item}</button>)}</div>
          {answer ? <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,var(--cliente-border))] bg-[var(--cliente-card)] p-4"><div className="flex items-center gap-2 text-[var(--cliente-ai)]"><Sparkles className="h-4 w-4" /><p className="text-xs font-bold">{answer.title || "Resposta da Altum"}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--cliente-card-text)]">{answer.answer}</p></div> : <div className="mt-5 rounded-2xl border border-dashed border-[var(--cliente-border)] p-5 text-sm text-[var(--cliente-card-text-muted)]">A resposta aparece aqui usando a conta e a campanha selecionadas como contexto.</div>}
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          <form onSubmit={submit} className="mt-4 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Pergunta sobre campanhas" placeholder="Ex.: por que o custo por conversão aumentou?" className="min-w-0 flex-1 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-3 text-sm outline-none focus:border-[var(--cliente-ai)]" /><ClientActionButton type="submit" tone="ai" disabled={!question.trim() || loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">Perguntar</span></ClientActionButton></form>
        </div>
      </div>
    </PanelCard>
    </div>
  );
}
