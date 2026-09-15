"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { ClientActionButton, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";

type Campaign = { id: string; name: string };
type AdSet = { id: string; name: string; campaignId?: string };
type ActionKind = "campaign" | "adset" | "creative" | "ad";

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none focus:border-[var(--cliente-primary)]";

export function MetaActionBuilder({ campaigns, adSets, busy, onSubmit }: { campaigns: Campaign[]; adSets: AdSet[]; busy: boolean; onSubmit: (tool: string, args: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<ActionKind>("campaign");
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [adSetId, setAdSetId] = useState("");
  const [dailyBudget, setDailyBudget] = useState(50);
  const [objective, setObjective] = useState("OUTCOME_LEADS");
  const [optimizationGoal, setOptimizationGoal] = useState("LEAD_GENERATION");
  const [countries, setCountries] = useState("BR");
  const [pageId, setPageId] = useState("");
  const [instagramActorId, setInstagramActorId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [callToAction, setCallToAction] = useState("LEARN_MORE");
  const [creativeId, setCreativeId] = useState("");

  function submit() {
    if (kind === "campaign") return onSubmit("draft_meta_campaign_create", { name, objective, dailyBudget });
    if (kind === "adset") return onSubmit("draft_meta_ad_set_create", { campaignId, name, countries: countries.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean), dailyBudget, optimizationGoal });
    if (kind === "creative") return onSubmit("draft_meta_creative_create", { name, pageId, instagramActorId: instagramActorId || undefined, imageUrl, link, message, headline, description, callToAction });
    return onSubmit("draft_meta_ad_create", { adSetId, name, creativeId });
  }

  const valid = Boolean(name.trim()) && (kind === "campaign" || (kind === "adset" && campaignId && countries.trim()) || (kind === "creative" && pageId && imageUrl && link && message.trim() && headline.trim()) || (kind === "ad" && adSetId && creativeId));

  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Plus className="h-5 w-5 text-[#0866FF]" /><h2 className="text-lg font-extrabold">Criar no Meta Ads</h2></div><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Monte cada etapa com clareza. Campanhas, conjuntos e anúncios novos começam pausados.</p></div>
        <StateBadge label="Revisão obrigatória" tone="ai" />
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-[var(--cliente-surface-muted)] p-1.5">
        {([{ id: "campaign", label: "1. Campanha" }, { id: "adset", label: "2. Conjunto" }, { id: "creative", label: "3. Criativo" }, { id: "ad", label: "4. Anúncio" }] as const).map((item) => <button key={item.id} type="button" onClick={() => setKind(item.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${kind === item.id ? "bg-[var(--cliente-card)] text-[var(--cliente-primary)] shadow-sm" : "text-[var(--cliente-card-text-muted)]"}`}>{item.label}</button>)}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Nome interno<input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "creative" ? "Criativo oferta principal" : "Nome fácil de reconhecer"} className={inputClass} /></label>
        {kind === "campaign" ? <><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Objetivo<select value={objective} onChange={(event) => setObjective(event.target.value)} className={inputClass}><option value="OUTCOME_LEADS">Gerar cadastros</option><option value="OUTCOME_SALES">Gerar vendas</option><option value="OUTCOME_TRAFFIC">Levar pessoas ao site</option><option value="OUTCOME_ENGAGEMENT">Gerar engajamento</option><option value="OUTCOME_AWARENESS">Alcançar pessoas</option></select></label><MoneyInput value={dailyBudget} onChange={setDailyBudget} label="Orçamento diário" /></> : null}
        {kind === "adset" ? <><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Campanha<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className={inputClass}><option value="">Selecione</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Países<input value={countries} onChange={(event) => setCountries(event.target.value)} placeholder="BR, US" className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Otimização<select value={optimizationGoal} onChange={(event) => setOptimizationGoal(event.target.value)} className={inputClass}><option value="LEAD_GENERATION">Cadastros</option><option value="LANDING_PAGE_VIEWS">Visualização da página</option><option value="LINK_CLICKS">Cliques no link</option><option value="OFFSITE_CONVERSIONS">Conversões no site</option></select></label><MoneyInput value={dailyBudget} onChange={setDailyBudget} label="Orçamento diário" /></> : null}
        {kind === "creative" ? <><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">ID da página<input value={pageId} onChange={(event) => setPageId(event.target.value)} inputMode="numeric" className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">ID do Instagram, opcional<input value={instagramActorId} onChange={(event) => setInstagramActorId(event.target.value)} inputMode="numeric" className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)] md:col-span-2">URL pública da imagem<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://.../imagem.jpg" className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)] md:col-span-2">Página de destino<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://..." className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)] md:col-span-2">Texto principal<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Título<input value={headline} onChange={(event) => setHeadline(event.target.value)} className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Botão<select value={callToAction} onChange={(event) => setCallToAction(event.target.value)} className={inputClass}><option value="LEARN_MORE">Saiba mais</option><option value="CONTACT_US">Fale conosco</option><option value="SIGN_UP">Cadastre-se</option><option value="SHOP_NOW">Comprar agora</option><option value="GET_QUOTE">Solicitar orçamento</option><option value="WHATSAPP_MESSAGE">Enviar WhatsApp</option></select></label></> : null}
        {kind === "ad" ? <><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Conjunto<select value={adSetId} onChange={(event) => setAdSetId(event.target.value)} className={inputClass}><option value="">Selecione</option>{adSets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">ID do criativo aprovado<input value={creativeId} onChange={(event) => setCreativeId(event.target.value)} inputMode="numeric" className={inputClass} /></label></> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><ClientActionButton tone="ai" onClick={submit} disabled={!valid || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Preparar para revisão</ClientActionButton><p className="text-xs text-[var(--cliente-card-text-soft)]">A Altum valida conta, entidades, orçamento e integridade novamente ao aplicar.</p></div>
    </PanelCard>
  );
}

function MoneyInput({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return <label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">{label}<input type="number" min={1} max={100000} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} /></label>;
}
