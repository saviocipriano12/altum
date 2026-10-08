"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CircleDollarSign, Loader2, Plus, ShieldCheck, Target } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";

type Mission = {
  id: string;
  tenantId: string;
  title: string;
  objective: string;
  template: "revenue" | "marketing" | "creative" | "product" | "custom";
  budgetBrl: number;
  spentBrl: number;
  deadline: string | null;
  risk: "low" | "medium" | "high";
  status: string;
  progress: number;
  needsReconciliation?: boolean;
  pendingReconciliationDispatches?: number;
  createdAt: string | null;
  taskSummary: { total: number; completed: number; ready: number; waitingApproval: number; queued: number; rejected: number };
  nextTask: { title: string; status: string; sequence: number } | null;
};

type TenantOption = { id: string; name: string };
type Payload = { items: Mission[]; tenants: TenantOption[]; error?: string };

const TEMPLATE_LABELS: Record<Mission["template"], string> = {
  revenue: "Máquina de receita",
  marketing: "Operação de marketing",
  creative: "Produção criativa",
  product: "Criar e validar produto",
  custom: "Missão personalizada",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho", planned: "Planejada", running: "Em execução", waiting_approval: "Aguardando aprovação",
  paused: "Pausada", completed: "Concluída", failed: "Precisa de atenção", cancelled: "Cancelada",
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export default function MissionsPage() {
  const [data, setData] = useState<Payload>({ items: [], tenants: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState("");
  const [reviewMissionId, setReviewMissionId] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tenantId: "", title: "", objective: "", template: "revenue" as Mission["template"], budgetBrl: "0", deadline: "", risk: "medium" as Mission["risk"], constraints: "" });

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const response = await authedFetch("/api/admin/agent-os/missions");
      const payload = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as missões.");
      setData(payload);
      setForm((current) => current.tenantId ? current : { ...current, tenantId: payload.tenants[0]?.id || "" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar as missões.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tenantNames = useMemo(() => new Map(data.tenants.map((tenant) => [tenant.id, tenant.name])), [data.tenants]);

  async function createMission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSaving(true); setError("");
      const response = await authedFetch("/api/admin/agent-os/missions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          budgetBrl: Number(form.budgetBrl || 0),
          constraints: form.constraints.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível criar a missão.");
      setOpen(false);
      setForm((current) => ({ ...current, title: "", objective: "", budgetBrl: "0", deadline: "", constraints: "" }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a missão."); }
    finally { setSaving(false); }
  }

  async function runAction(id: string, action: "start" | "pause" | "advance" | "cancel") {
    try {
      setActingId(id); setError("");
      const response = await authedFetch(`/api/admin/agent-os/missions/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar a missão.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a missão."); }
    finally { setActingId(""); }
  }

  return <div className="mx-auto max-w-[1440px] space-y-6 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Altum Agent OS</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Missões</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Transforme metas em trabalho supervisionado: plano, agentes, limites, aprovações e resultado no mesmo lugar.</p></div>
      <button onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-500"><Plus size={17} />Nova missão</button>
    </header>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

    {open && <form onSubmit={createMission} className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-2"><Target className="text-violet-600" size={18} /><div><h2 className="font-semibold">Definir uma missão</h2><p className="text-sm text-slate-500">A primeira versão cria plano e checkpoints. Nenhuma ação externa é executada automaticamente.</p></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Empresa"><select required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} className="field"><option value="">Selecione</option>{data.tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></Field>
        <Field label="Tipo"><select value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value as Mission["template"] })} className="field">{Object.entries(TEMPLATE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
        <Field label="Orçamento máximo (R$)"><input type="number" min="0" value={form.budgetBrl} onChange={(e) => setForm({ ...form, budgetBrl: e.target.value })} className="field" /></Field>
        <Field label="Nome da missão"><input required minLength={4} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Gerar 10 reuniões qualificadas" className="field" /></Field>
        <Field label="Prazo (opcional)"><input value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} placeholder="Ex.: até 30/11" className="field" /></Field>
        <Field label="Nível de risco"><select value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value as Mission["risk"] })} className="field"><option value="low">Baixo — pesquisa e rascunhos</option><option value="medium">Médio — propostas e plano</option><option value="high">Alto — requer checkpoints extras</option></select></Field>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]"><Field label="Objetivo e resultado esperado"><textarea required minLength={12} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="field min-h-24" placeholder="O que a Altum deve atingir e como saberemos que funcionou?" /></Field><Field label="Limites (um por linha)"><textarea value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} className="field min-h-24" placeholder="Não enviar mensagens sem aprovação\nNão gastar acima do orçamento" /></Field></div>
      <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button><button disabled={saving || !data.tenants.length} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="animate-spin" size={16} />}{saving ? "Criando..." : "Criar plano de missão"}</button></div>
    </form>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary icon={Target} label="Missões ativas" value={String(data.items.filter((item) => ["planned", "running", "waiting_approval"].includes(item.status)).length)} tone="violet" /><Summary icon={Bot} label="Planos criados" value={String(data.items.length)} tone="blue" /><Summary icon={ShieldCheck} label="Aguardando aprovação" value={String(data.items.filter((item) => item.status === "waiting_approval").length)} tone="amber" /><Summary icon={CircleDollarSign} label="Orçamento alocado" value={brl(data.items.reduce((total, item) => total + item.budgetBrl, 0))} tone="emerald" /></section>

    {data.items.some((item) => item.needsReconciliation) && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-900">Despachos que exigem reconciliação</h2><p className="mt-1 text-sm text-amber-800">Revise as evidências antes de permitir uma nova execução.</p><div className="mt-3 flex flex-wrap gap-2">{data.items.filter((item) => item.needsReconciliation).map((item) => <button type="button" key={item.id} onClick={() => setReviewMissionId(item.id)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">{item.title} ({item.pendingReconciliationDispatches || 1})</button>)}</div></section>}
    {reviewMissionId && <ReconciliationPanel missionId={reviewMissionId} onClose={() => setReviewMissionId("")} onResolved={load} />}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Fila de missões</h2><p className="mt-0.5 text-sm text-slate-500">O runtime avança somente etapas internas. Pontos de comunicação, publicação e gasto pedem aprovação humana.</p></div>{loading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-violet-600" /></div> : data.items.length ? <div className="divide-y divide-slate-100">{data.items.map((item) => <article key={item.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[1.35fr_0.6fr_0.52fr_0.5fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3><Status status={item.status} /></div><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.objective}</p><p className="mt-2 text-xs text-slate-400">{tenantNames.get(item.tenantId) || item.tenantId} · {TEMPLATE_LABELS[item.template]} · {item.taskSummary.completed}/{item.taskSummary.total} etapas concluídas</p>{item.nextTask && <p className="mt-2 text-xs text-violet-700">Próxima etapa: {item.nextTask.title}</p>}</div><div className="text-sm"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Limite</p><p className="mt-1 font-semibold">{brl(item.budgetBrl)}</p><p className="text-xs text-slate-500">Gasto: {brl(item.spentBrl)}</p></div><div className="text-sm"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Risco</p><p className={`mt-1 font-medium ${item.risk === "high" ? "text-red-700" : item.risk === "medium" ? "text-amber-700" : "text-emerald-700"}`}>{item.risk === "high" ? "Alto" : item.risk === "medium" ? "Médio" : "Baixo"}</p><p className="text-xs text-slate-500">{item.deadline || "Sem prazo definido"}</p></div><div className="text-sm"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Progresso</p><p className="mt-1 font-semibold">{item.progress}%</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(0, Math.min(item.progress, 100))}%` }} /></div></div><div className="flex flex-wrap content-start gap-2">{(["planned", "paused"].includes(item.status)) && <button disabled={actingId === item.id} onClick={() => void runAction(item.id, "start")} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{actingId === item.id ? "Atualizando..." : item.status === "paused" ? "Retomar" : "Iniciar"}</button>}{item.status === "running" && <><button disabled={actingId === item.id} onClick={() => void runAction(item.id, "advance")} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">Concluir etapa</button><button disabled={actingId === item.id} onClick={() => void runAction(item.id, "pause")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">Pausar</button></>}{item.status === "waiting_approval" && <Link href="/admin/aprovacoes" className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">Revisar aprovação</Link>}{!(["completed", "cancelled"].includes(item.status)) && <button disabled={actingId === item.id} onClick={() => { if (window.confirm("Cancelar esta missão? O plano poderá ser consultado, mas não poderá continuar.")) void runAction(item.id, "cancel"); }} className="rounded-lg px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">Cancelar</button>}</div></article>)}</div> : <div className="p-12 text-center"><Bot className="mx-auto text-violet-400" size={28} /><h3 className="mt-3 font-semibold">Nenhuma missão criada</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Comece por uma meta concreta. A recomendação é a primeira máquina de receita da Altum.</p></div>}</section>
    <style jsx>{`.field { width: 100%; border: 1px solid rgb(226 232 240); border-radius: .75rem; background: rgb(248 250 252); padding: .6rem .75rem; font-size: .875rem; outline: none; } .field:focus { border-color: rgb(139 92 246); box-shadow: 0 0 0 3px rgb(237 233 254); }`}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Status({ status }: { status: string }) { return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status === "waiting_approval" ? "bg-amber-100 text-amber-800" : status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-violet-100 text-violet-800"}`}>{STATUS_LABELS[status] || status}</span>; }
function Summary({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: string; tone: "violet" | "blue" | "amber" | "emerald" }) { const colors = { violet: "bg-violet-50 text-violet-600", blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600", emerald: "bg-emerald-50 text-emerald-600" }; return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`inline-flex rounded-xl p-2 ${colors[tone]}`}><Icon size={18} /></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-0.5 text-sm text-slate-500">{label}</p></div>; }

type ReconciliationItem = {
  dispatchId: string;
  deliveryAttempts: number;
  failureCode: string;
  reconciliationStatus: string;
  events: { eventId: string; type: string; occurredAt: string; progress: number | null; artifactCount: number }[];
};

function ReconciliationPanel({ missionId, onClose, onResolved }: { missionId: string; onClose: () => void; onResolved: () => Promise<void> }) {
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      setError("");
      const response = await authedFetch(`/api/admin/agent-os/missions/${missionId}`);
      const data = await response.json() as { items?: ReconciliationItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar evidências.");
      setItems(data.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na consulta.");
    } finally { setBusy(false); }
  }, [missionId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function resolve(dispatchId: string) {
    const decision = decisions[dispatchId] || "requires_investigation";
    const explanation = (reason[dispatchId] || "").trim();
    if (explanation.length < 20) { setError("Escreva uma justificativa de pelo menos 20 caracteres."); return; }
    if (!window.confirm("Confirmar esta decisão administrativa? Verifique também o recibo persistente do executor.")) return;
    try {
      setBusy(true);
      setError("");
      const response = await authedFetch(`/api/admin/agent-os/missions/${missionId}`, {
        method: "POST",
        body: JSON.stringify({ dispatchId, decision, reason: explanation }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar a decisão.");
      await refresh();
      await onResolved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na decisão."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-2xl border border-amber-300 bg-white p-5 shadow-sm">
    <div className="flex justify-between gap-3"><div><h2 className="font-semibold">Revisão de despachos interrompidos</h2><p className="text-sm text-slate-500">Dados da Altum não substituem a conferência do recibo persistente no OpenClaw.</p></div><button type="button" onClick={onClose} className="text-sm text-slate-600 underline">Fechar</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p className="text-sm text-slate-500">Atualizando evidências...</p>}
    {!busy && items.length === 0 && <p className="text-sm text-slate-500">Nenhum despacho pendente.</p>}
    {items.map((item) => <div key={item.dispatchId} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="break-all text-sm font-semibold">Despacho: {item.dispatchId}</p>
      <p className="text-xs text-slate-600">Tentativas: {item.deliveryAttempts} · Motivo: {item.failureCode || "não informado"} · Estado: {item.reconciliationStatus}</p>
      <div className="space-y-1">{item.events.length === 0 ? <p className="text-xs text-amber-700">Nenhum evento registrado. Conferir o executor antes de decidir.</p> : item.events.map((event) => <p key={event.eventId} className="text-xs text-slate-600">{event.occurredAt} · {event.type} · {event.progress ?? "—"}% · {event.artifactCount} arquivo(s)</p>)}</div>
      <label className="block text-sm">Decisão<select value={decisions[item.dispatchId] || "requires_investigation"} onChange={(event) => setDecisions((current) => ({ ...current, [item.dispatchId]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 p-2"><option value="requires_investigation">Manter em investigação</option><option value="confirmed_completed">Execução confirmada</option><option value="confirmed_not_executed">Confirmado que não executou</option></select></label>
      <label className="block text-sm">Justificativa<textarea value={reason[item.dispatchId] || ""} onChange={(event) => setReason((current) => ({ ...current, [item.dispatchId]: event.target.value }))} minLength={20} maxLength={2000} placeholder="Descreva as evidências verificadas, inclusive o recibo do worker." className="mt-1 block min-h-24 w-full rounded-lg border border-slate-300 p-2" /></label>
      <button type="button" disabled={busy || (reason[item.dispatchId] || "").trim().length < 20} onClick={() => void resolve(item.dispatchId)} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar decisão auditável</button>
    </div>)}
  </section>;
}
