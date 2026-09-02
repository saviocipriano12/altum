"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Instagram, Loader2, MessageCircle, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

type CommentRule = { id: string; name: string; enabled: boolean; mediaIds: string[]; keywords: string[]; message: string; privateReply: boolean };
type Config = {
  tenantId: string; enabled: boolean; dmAutoReply: boolean; commentAutoReply: boolean;
  newFollowerMessageEnabled: boolean; newFollowerMessageTemplate: string; dmPrompt: string; commentPrompt: string;
  optOutKeywords: string[]; commentIntentPricingKeywords: string[]; commentIntentPurchaseKeywords: string[];
  commentIntentSchedulingKeywords: string[]; commentRules: CommentRule[];
  activeHours: { timezone: string; start: string; end: string; days: number[] };
};
type Log = { id: string; status?: string; actorName?: string; updatedAt?: string };
type Channel = { id: string; type: string; status: string; displayName?: string };
type Payload = { config?: Config; logs?: Log[]; channels?: Channel[]; error?: string };
type Media = { id: string; caption: string; mediaType: string; thumbnailUrl: string; permalink: string; timestamp: string };
type TemplateId = "dm" | "comment" | "pricing" | "scheduling";
type Template = { id: TemplateId; title: string; description: string; trigger: string; message: string; keywords: string };
type WizardState = { template: Template; step: number; keywords: string; message: string; scope: "all" | "selected"; mediaIds: string[]; privateReply: boolean };

const TEMPLATES: Template[] = [
  { id: "dm", title: "Responder novas DMs", description: "Acolha mensagens e respostas aos stories no Direct.", trigger: "Nova mensagem iniciada pela pessoa", message: "Ola! Obrigado por chamar. Como posso ajudar voce hoje?", keywords: "" },
  { id: "comment", title: "Comentario vira conversa", description: "Escolha todos os posts ou uma publicacao e envie uma resposta privada.", trigger: "Novo comentario em post ou reel", message: "Obrigado pelo comentario, {{nome}}! Aqui estao os detalhes que voce pediu.", keywords: "" },
  { id: "pricing", title: "Vender por palavra-chave", description: "Entregue preco, link ou oferta a quem comentar a palavra escolhida.", trigger: "Comentario com palavra-chave", message: "Oi, {{nome}}! Vi seu interesse. Vou te passar os detalhes desta oferta por aqui.", keywords: "quero, preco, valor" },
  { id: "scheduling", title: "Agendar pelo comentario", description: "Converta pedidos de contato em proximo passo comercial.", trigger: "Comentario pedindo contato ou agenda", message: "Oi, {{nome}}! Vamos encontrar o melhor horario. Qual periodo funciona para voce?", keywords: "agendar, reuniao, horario" },
];

function dateTime(value?: string) {
  if (!value) return "Sem registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function InstagramAutomationPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_automations") || hasCapability("manage_channels");
  const [config, setConfig] = useState<Config | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [wizard, setWizard] = useState<WizardState | null>(null);

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    const response = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations`);
    const payload = await response.json() as Payload;
    if (!response.ok || !payload.config) throw new Error(payload.error || "Nao foi possivel carregar a automacao.");
    setConfig(payload.config); setLogs(payload.logs || []); setChannels(payload.channels || []);
  }, [tenant?.tenantId]);

  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Falha ao carregar.")).finally(() => setLoading(false)); }, [load]);

  const instagram = useMemo(() => channels.find((channel) => channel.type === "instagram"), [channels]);
  const sent = logs.filter((log) => log.status === "sent").length;
  const failed = logs.filter((log) => log.status === "failed").length;
  const active = Number(Boolean(config?.dmAutoReply)) + (config?.commentRules || []).filter((rule) => rule.enabled).length;

  async function save(next: Config, successMessage: string) {
    if (!tenant?.tenantId || !canManage) return false;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const payload = await response.json() as Payload;
      if (!response.ok || !payload.config) throw new Error(payload.error || "Nao foi possivel publicar.");
      setConfig(payload.config); setNotice(successMessage); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Nao foi possivel publicar."); return false; }
    finally { setSaving(false); }
  }

  async function loadMedia() {
    if (!tenant?.tenantId || mediaLoaded || mediaLoading) return;
    setMediaLoading(true); setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/social-automations/media`);
      const payload = await response.json() as { media?: Media[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Nao foi possivel carregar as publicacoes.");
      setMedia(payload.media || []); setMediaLoaded(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar publicacoes."); }
    finally { setMediaLoading(false); }
  }

  function openTemplate(template: Template) {
    setWizard({ template, step: 1, keywords: template.keywords, message: template.message, scope: "all", mediaIds: [], privateReply: template.id !== "dm" });
    if (template.id !== "dm") void loadMedia();
  }

  async function publish() {
    if (!config || !wizard) return;
    if (wizard.scope === "selected" && wizard.mediaIds.length === 0) { setError("Escolha ao menos uma publicacao."); return; }
    const keywords = wizard.keywords.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
    if (wizard.template.id === "dm") {
      if (await save({ ...config, enabled: true, dmAutoReply: true, dmPrompt: wizard.message }, "Resposta de Direct publicada e ativa.")) setWizard(null);
      return;
    }
    const rule: CommentRule = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rule_${Date.now()}`,
      name: wizard.template.title,
      enabled: true,
      mediaIds: wizard.scope === "selected" ? wizard.mediaIds : [],
      keywords,
      message: wizard.message,
      privateReply: wizard.privateReply,
    };
    if (await save({ ...config, enabled: true, commentAutoReply: false, commentRules: [...(config.commentRules || []), rule] }, `Automacao "${wizard.template.title}" publicada e ativa.`)) setWizard(null);
  }

  async function toggleDm() { if (config) await save({ ...config, enabled: true, dmAutoReply: !config.dmAutoReply }, "Automacao atualizada."); }
  async function toggleRule(id: string) { if (config) await save({ ...config, commentRules: config.commentRules.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule) }, "Automacao atualizada."); }
  async function removeRule(id: string) { if (config) await save({ ...config, commentRules: config.commentRules.filter((rule) => rule.id !== id) }, "Automacao removida."); }

  if (loading) return <div className="grid min-h-[24vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-600" /></div>;
  if (!config) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error || "Automacao indisponivel."}</div>;

  return <div className="space-y-5" data-tour-key="instagram-content">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-fuchsia-600">Instagram</p><h1 className="mt-1 text-2xl font-black">Automacoes</h1><p className="mt-1 text-sm text-[var(--cliente-text-muted)]">Escolha o gatilho, a publicacao e a mensagem. A Altum cuida do restante.</p></div><button onClick={() => openTemplate(TEMPLATES[1])} disabled={!canManage} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Nova automacao</button></header>
    {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
    {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</p> : null}
    <section className="grid gap-3 sm:grid-cols-4"><Stat label="Conta conectada" value={instagram?.status === "active" ? (instagram.displayName || "Ativa") : "Pendente"} good={instagram?.status === "active"} /><Stat label="Automacoes ativas" value={String(active)} good={active > 0} /><Stat label="Respostas enviadas" value={String(sent)} good={sent > 0} /><Stat label="Falhas recentes" value={String(failed)} /></section>
    <section className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="font-black">Comece por um modelo</h2><p className="mt-1 text-sm text-[var(--cliente-text-muted)]">Nada e publicado antes da sua confirmacao.</p></div><span className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-black text-fuchsia-700">Instagram</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{TEMPLATES.map((template) => <button key={template.id} onClick={() => openTemplate(template)} disabled={!canManage} className="group rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-300 disabled:opacity-50"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-pink-100 text-pink-600"><Instagram className="h-4 w-4" /></span><p className="mt-4 text-sm font-black">{template.title}</p><p className="mt-2 text-xs leading-5 text-[var(--cliente-text-muted)]">{template.description}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-fuchsia-700">Usar modelo <ArrowRight className="h-3.5 w-3.5" /></span></button>)}</div></section>
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><article className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5"><h2 className="font-black">Em operacao</h2><div className="mt-4 space-y-3"><AutomationRow title="Responder mensagens no Direct" description="Responde somente depois que a pessoa inicia a conversa." active={config.dmAutoReply} onToggle={() => void toggleDm()} disabled={!canManage || saving} />{config.commentRules.map((rule) => <AutomationRow key={rule.id} title={rule.name} description={`${rule.mediaIds.length ? `${rule.mediaIds.length} publicacao(oes)` : "Todos os posts e reels"}${rule.keywords.length ? ` · palavras: ${rule.keywords.join(", ")}` : ""}`} active={rule.enabled} onToggle={() => void toggleRule(rule.id)} onRemove={() => void removeRule(rule.id)} disabled={!canManage || saving} />)}{!config.commentRules.length ? <p className="rounded-xl bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-text-muted)]">Crie uma automacao de comentario para escolher um post, reel ou todos.</p> : null}</div><div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Novo seguidor:</strong> a Meta nao permite iniciar uma DM apenas porque uma pessoa seguiu o perfil. A alternativa oficial e usar comentario, resposta ao story ou uma mensagem iniciada pela pessoa.</div></article><article className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5"><h2 className="font-black">Atividade recente</h2><div className="mt-4 space-y-2">{logs.slice(0, 6).map((log) => <div key={log.id} className="rounded-xl bg-[var(--cliente-panel-soft)] p-3"><div className="flex justify-between gap-3"><p className="text-sm font-bold">{log.actorName || "Interacao do Instagram"}</p><span className={`text-[10px] font-black uppercase ${log.status === "failed" ? "text-red-600" : "text-emerald-600"}`}>{log.status || "processado"}</span></div><p className="mt-1 text-xs text-[var(--cliente-text-muted)]">{dateTime(log.updatedAt)}</p></div>)}{!logs.length ? <p className="rounded-xl bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-text-muted)]">As primeiras interacoes aparecerao aqui.</p> : null}</div></article></section>
    <details className="rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4"><summary className="cursor-pointer text-sm font-black"><Settings2 className="mr-2 inline h-4 w-4" /> Ajustes locais do Instagram</summary><p className="mt-3 text-xs text-[var(--cliente-text-muted)]">Conhecimento unico da empresa: Instagram, WhatsApp e Assistente usam a mesma base aprovada.</p><div className="mt-4 flex flex-wrap gap-3 text-sm"><Link href="/cliente/painel/configuracoes/canais" prefetch className="rounded-xl border border-[var(--cliente-border)] px-4 py-2 font-bold">Gerenciar conta conectada</Link><Link href="/cliente/painel/conhecimento" prefetch className="rounded-xl border border-[var(--cliente-border)] px-4 py-2 font-bold">Revisar conhecimento da IA</Link></div></details>
    {wizard ? <Wizard value={wizard} media={media} mediaLoading={mediaLoading} saving={saving} onChange={setWizard} onClose={() => setWizard(null)} onPublish={() => void publish()} /> : null}
  </div>;
}

function Stat({ label, value, good = false }: { label: string; value: string; good?: boolean }) { return <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4"><p className="text-xs font-bold text-[var(--cliente-text-muted)]">{label}</p><p className={`mt-2 text-xl font-black ${good ? "text-emerald-600" : ""}`}>{value}</p></div>; }
function AutomationRow({ title, description, active, onToggle, onRemove, disabled }: { title: string; description: string; active: boolean; onToggle: () => void; onRemove?: () => void; disabled: boolean }) { return <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4"><div><p className="text-sm font-black">{title}</p><p className="mt-1 text-xs text-[var(--cliente-text-muted)]">{description}</p></div><div className="flex items-center gap-2">{onRemove ? <button onClick={onRemove} disabled={disabled} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remover ${title}`}><Trash2 className="h-4 w-4" /></button> : null}<button onClick={onToggle} disabled={disabled} className={`relative h-7 w-12 rounded-full transition ${active ? "bg-emerald-500" : "bg-slate-300"}`} aria-label={`${active ? "Desligar" : "Ligar"} ${title}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${active ? "left-6" : "left-1"}`} /></button></div></div>; }

function Wizard({ value, media, mediaLoading, saving, onChange, onClose, onPublish }: { value: WizardState; media: Media[]; mediaLoading: boolean; saving: boolean; onChange: (value: WizardState) => void; onClose: () => void; onPublish: () => void }) {
  const needsMedia = value.template.id !== "dm";
  const validStepOne = !needsMedia || value.scope === "all" || value.mediaIds.length > 0;
  return <div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Criar automacao"><section className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[26px] bg-white text-slate-950 shadow-2xl"><header className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-6"><div><p className="text-xs font-black uppercase tracking-wider text-fuchsia-600">Passo {value.step} de 3</p><h2 className="mt-1 text-xl font-black">{value.template.title}</h2></div><button onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button></header><div className="grid lg:grid-cols-[1fr_340px]"><div className="p-5 sm:p-7">{value.step === 1 ? <StepTrigger value={value} media={media} mediaLoading={mediaLoading} onChange={onChange} /> : value.step === 2 ? <><h3 className="font-black">Qual mensagem a pessoa recebera?</h3><textarea value={value.message} onChange={(event) => onChange({ ...value, message: event.target.value })} rows={7} maxLength={900} className="mt-5 w-full rounded-2xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-fuchsia-400" /><p className="mt-2 text-right text-xs text-slate-400">{value.message.length}/900</p></> : <><h3 className="font-black">Tudo pronto para publicar</h3><div className="mt-5 space-y-3"><Review icon={<Sparkles className="h-4 w-4" />} label="Modelo" value={value.template.title} /><Review icon={<Instagram className="h-4 w-4" />} label="Publicacoes" value={!needsMedia || value.scope === "all" ? "Todas" : `${value.mediaIds.length} selecionada(s)`} /><Review icon={<MessageCircle className="h-4 w-4" />} label="Entrega" value={value.privateReply ? "Resposta privada no Direct" : "Resposta publica no comentario"} /><Review icon={<CheckCircle2 className="h-4 w-4" />} label="Mensagem" value={value.message} /></div></>}<div className="mt-8 flex justify-between"><button onClick={() => value.step === 1 ? onClose() : onChange({ ...value, step: value.step - 1 })} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> {value.step === 1 ? "Cancelar" : "Voltar"}</button>{value.step < 3 ? <button onClick={() => onChange({ ...value, step: value.step + 1 })} disabled={(value.step === 1 && !validStepOne) || (value.step === 2 && !value.message.trim())} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50">Proximo <ArrowRight className="h-4 w-4" /></button> : <button onClick={onPublish} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Publicar</button>}</div></div><aside className="border-t border-slate-100 bg-slate-50 p-6 lg:border-l lg:border-t-0"><p className="text-center text-xs font-black uppercase tracking-wider text-slate-500">Previa no Direct</p><div className="mx-auto mt-5 flex min-h-[420px] max-w-[260px] flex-col rounded-[32px] border-[7px] border-slate-900 bg-slate-950 p-4 text-white shadow-xl"><div className="text-center text-xs font-bold">Instagram</div><div className="mt-auto rounded-2xl rounded-bl-sm bg-slate-800 p-3 text-xs leading-5">{value.message || "Sua mensagem aparecera aqui."}</div><div className="mt-3 h-9 rounded-full border border-slate-700 px-3 py-2 text-[10px] text-slate-500">Mensagem...</div></div></aside></div></section></div>;
}

function StepTrigger({ value, media, mediaLoading, onChange }: { value: WizardState; media: Media[]; mediaLoading: boolean; onChange: (value: WizardState) => void }) {
  if (value.template.id === "dm") return <><h3 className="font-black">Quando deve acontecer?</h3><div className="mt-5 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4 text-sm font-bold">{value.template.trigger}</div></>;
  return <><h3 className="font-black">Em quais publicacoes?</h3><div className="mt-5 grid gap-3 sm:grid-cols-2"><Choice selected={value.scope === "all"} title="Todos os posts e reels" onClick={() => onChange({ ...value, scope: "all", mediaIds: [] })} /><Choice selected={value.scope === "selected"} title="Somente as escolhidas" onClick={() => onChange({ ...value, scope: "selected" })} /></div>{value.scope === "selected" ? <div className="mt-5"><p className="text-xs font-black">Escolha uma ou mais publicacoes</p>{mediaLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Buscando no Instagram...</div> : <div className="mt-3 grid max-h-64 grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">{media.map((item) => { const selected = value.mediaIds.includes(item.id); return <button key={item.id} onClick={() => onChange({ ...value, mediaIds: selected ? value.mediaIds.filter((id) => id !== item.id) : [...value.mediaIds, item.id] })} className={`overflow-hidden rounded-xl border-2 text-left ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><div className="h-24 bg-slate-100 bg-cover bg-center" style={item.thumbnailUrl ? { backgroundImage: `url("${item.thumbnailUrl.replace(/["\\]/g, "")}")` } : undefined} /><p className="line-clamp-2 p-2 text-[11px] font-bold">{item.caption || item.mediaType || "Publicacao"}</p></button>; })}{!media.length ? <p className="col-span-full rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma publicacao foi retornada. Confira a permissao de conteudo da conta Meta.</p> : null}</div>}</div> : null}<label className="mt-5 block text-xs font-black">Palavras que ativam (opcional)</label><input value={value.keywords} onChange={(event) => onChange({ ...value, keywords: event.target.value })} placeholder="Ex.: quero, catalogo, preco" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-fuchsia-400" /><label className="mt-4 flex items-start gap-3 rounded-xl bg-fuchsia-50 p-4 text-sm"><input type="checkbox" checked={value.privateReply} onChange={(event) => onChange({ ...value, privateReply: event.target.checked })} className="mt-1" /><span><strong>Enviar no Direct</strong><br /><span className="text-xs text-slate-600">A Meta permite uma resposta privada ao comentario dentro da janela oficial.</span></span></label></>;
}

function Choice({ selected, title, onClick }: { selected: boolean; title: string; onClick: () => void }) { return <button onClick={onClick} className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left text-sm font-bold ${selected ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}><span className={`h-4 w-4 rounded-full border-4 ${selected ? "border-emerald-500" : "border-slate-300"}`} />{title}</button>; }
function Review({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3 rounded-2xl bg-slate-50 p-4"><span className="mt-0.5 text-fuchsia-600">{icon}</span><div><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-1 text-sm leading-6">{value}</p></div></div>; }
