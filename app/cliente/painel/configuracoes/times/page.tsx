"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Mail, Plus, Save, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";
import { CLIENT_ACCESS_PROFILES, getClientAccessProfile, inferClientAccessProfile, type ClientAccessProfileId } from "@/lib/client-access-profiles";

type Team = { id: string; name: string; description?: string; channels: string[]; isDefault?: boolean };
type Member = { id?: string; userId?: string; name?: string; email?: string; role?: string; team?: string; availability?: string; status?: string; allowedChannels?: string[]; maxOpenChats?: number | null; accessProfile?: string };
type SettingsPayload = { settings?: { rules?: { inbox?: { defaultTeam?: string; teams?: Team[] } } }; error?: string };
type UsersPayload = { items?: Member[]; error?: string };
type DraftPerson = { name: string; email: string; accessProfile: ClientAccessProfileId; maxOpenChats: string };

const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" }, { id: "instagram", label: "Instagram" },
  { id: "messenger", label: "Messenger" }, { id: "site_chat", label: "Chat do site" },
  { id: "site_form", label: "Formulários" },
] as const;

const slug = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 80) || `time_${Date.now()}`;
const blankPerson = (): DraftPerson => ({ name: "", email: "", accessProfile: "seller", maxOpenChats: "12" });

export default function ClienteTimesPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_settings");
  const canManageUsers = hasCapability("manage_users");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [defaultTeam, setDefaultTeam] = useState("comercial");
  const [members, setMembers] = useState<Member[]>([]);
  const [savedMembers, setSavedMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTeam, setDraftTeam] = useState({ name: "", description: "", channels: ["whatsapp"] });
  const [draftPeople, setDraftPeople] = useState<DraftPerson[]>([blankPerson()]);
  const [composerSaving, setComposerSaving] = useState(false);

  async function loadData() {
    if (!tenant?.tenantId) return;
    try {
      setLoading(true); setError(null);
      const [settingsRes, usersRes] = await Promise.all([authedFetch(`/api/tenant/${tenant.tenantId}/settings`), authedFetch(`/api/tenant/${tenant.tenantId}/users`)]);
      const settings = await settingsRes.json() as SettingsPayload;
      const users = await usersRes.json() as UsersPayload;
      if (!settingsRes.ok || !usersRes.ok) throw new Error(settings.error || users.error || "Não foi possível carregar a operação.");
      const nextTeams = settings.settings?.rules?.inbox?.teams || [];
      const nextMembers = users.items || [];
      setTeams(nextTeams); setMembers(nextMembers); setSavedMembers(nextMembers);
      setDefaultTeam(settings.settings?.rules?.inbox?.defaultTeam || nextTeams.find((item) => item.isDefault)?.id || "comercial");
      setSelectedId((current) => current && nextTeams.some((item) => item.id === current) ? current : nextTeams[0]?.id || null);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar a operação."); }
    finally { setLoading(false); }
  }

  // loadData intentionally follows the tenant session; it is recreated on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadData(); }, [tenant?.tenantId]);

  const selected = teams.find((team) => team.id === selectedId) || null;
  const selectedMembers = useMemo(() => selected ? members.filter((member) => member.team === selected.id) : [], [members, selected]);
  const stats = useMemo(() => ({
    active: members.filter((member) => member.status !== "blocked").length,
    online: members.filter((member) => member.status !== "blocked" && member.availability === "online").length,
    capacity: members.reduce((sum, member) => sum + Number(member.maxOpenChats || 0), 0),
    withoutTeam: members.filter((member) => !member.team && member.role !== "client_owner").length,
  }), [members]);
  const missingTeams = useMemo(() => {
    const configured = new Set(teams.map((team) => team.id));
    return Array.from(new Set(members.map((member) => String(member.team || "").trim()).filter(Boolean))).filter((item) => !configured.has(item));
  }, [members, teams]);

  function toggle(list: string[], value: string) { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]; }
  function changeTeam(patch: Partial<Team>) { if (selected) setTeams((current) => current.map((team) => team.id === selected.id ? { ...team, ...patch } : team)); }
  function changeMember(index: number, patch: Partial<Member>) { setMembers((current) => current.map((member, i) => i === index ? { ...member, ...patch } : member)); }

  async function saveTeams(event?: FormEvent) {
    event?.preventDefault();
    if (!tenant?.tenantId || !canManage) return;
    if (!teams.length || teams.some((team) => !team.name.trim())) { setError("Defina pelo menos um time com nome."); return; }
    try {
      setSaving(true); setError(null); setNotice(null);
      const normalized = teams.map((team) => ({ ...team, id: slug(team.id || team.name), name: team.name.trim(), description: String(team.description || "").trim(), channels: Array.from(new Set(team.channels || [])) }));
      const chosen = normalized.some((team) => team.id === slug(defaultTeam)) ? slug(defaultTeam) : normalized[0].id;
      const payload = normalized.map((team) => ({ ...team, isDefault: team.id === chosen }));
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { inbox: { defaultTeam: chosen, teams: payload } } }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar os times.");
      setTeams(payload); setDefaultTeam(chosen); setNotice("Estrutura dos times atualizada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar os times."); }
    finally { setSaving(false); }
  }

  async function saveMember(member: Member) {
    if (!tenant?.tenantId || !canManageUsers || !member.userId || member.role === "client_owner") return;
    const before = savedMembers.find((item) => item.userId === member.userId);
    const keys = (["team", "availability", "allowedChannels", "maxOpenChats"] as const).filter((key) => JSON.stringify(member[key]) !== JSON.stringify(before?.[key]));
    if (!keys.length) return;
    const response = await authedFetch(`/api/tenant/${tenant.tenantId}/users/${encodeURIComponent(member.userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(keys.map((key) => [key, member[key] ?? (key === "team" ? "" : null)]))) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || "Não foi possível salvar a pessoa.");
    setSavedMembers((current) => current.map((item) => item.userId === member.userId ? member : item));
  }

  async function savePeople() {
    try {
      setSaving(true); setError(null); setNotice(null);
      const changed = members.filter((member) => member.userId && member.role !== "client_owner" && JSON.stringify(member) !== JSON.stringify(savedMembers.find((item) => item.userId === member.userId)));
      const results = await Promise.allSettled(changed.map(saveMember));
      const failed = results.map((item, index) => item.status === "rejected" ? changed[index].name || changed[index].email || "uma pessoa" : null).filter(Boolean);
      if (failed.length) throw new Error(`Não foi possível salvar: ${failed.join(", ")}.`);
      setNotice(changed.length ? "Alterações da equipe salvas." : "Não há alterações pendentes.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar as pessoas."); }
    finally { setSaving(false); }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canManage || !canManageUsers) return;
    const name = draftTeam.name.trim();
    const people = draftPeople.filter((person) => person.name.trim() || person.email.trim());
    if (!name) { setError("Dê um nome ao time antes de continuar."); return; }
    if (people.some((person) => !person.email.trim())) { setError("Informe o e-mail de cada pessoa adicionada."); return; }
    try {
      setComposerSaving(true); setError(null); setNotice(null);
      const id = slug(name);
      const nextTeams = [...teams.filter((team) => team.id !== id), { id, name, description: draftTeam.description.trim(), channels: draftTeam.channels, isDefault: teams.length === 0 }];
      const settingsResponse = await authedFetch(`/api/tenant/${tenant.tenantId}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { inbox: { defaultTeam: teams.length ? defaultTeam : id, teams: nextTeams } } }) });
      const settingsBody = await settingsResponse.json().catch(() => ({})) as { error?: string };
      if (!settingsResponse.ok) throw new Error(settingsBody.error || "Não foi possível criar o time.");
      const invites = await Promise.allSettled(people.map((person) => {
        const profile = getClientAccessProfile(person.accessProfile);
        return authedFetch(`/api/tenant/${tenant.tenantId}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: person.name.trim(), email: person.email.trim(), team: id, role: profile.role, accessProfile: profile.id, availability: "online", allowedChannels: draftTeam.channels, maxOpenChats: Number(person.maxOpenChats || 0), capabilities: profile.capabilities }) });
      }));
      const failed = invites.filter((item) => item.status === "rejected" || !item.value.ok).length;
      setComposerOpen(false); setDraftTeam({ name: "", description: "", channels: ["whatsapp"] }); setDraftPeople([blankPerson()]); setSelectedId(id);
      await loadData();
      setNotice(failed ? `Time criado, mas ${failed} convite(s) precisam ser revisados.` : `Time criado com ${people.length} pessoa(s).`);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível criar a operação."); }
    finally { setComposerSaving(false); }
  }

  function removeSelectedTeam() {
    if (!selected) return;
    if (selectedMembers.length) { setError("Mova as pessoas deste time antes de removê-lo."); return; }
    if (selected.id === defaultTeam) { setError("Escolha outro time padrão antes de removê-lo."); return; }
    const remaining = teams.filter((team) => team.id !== selected.id);
    setTeams(remaining); setSelectedId(remaining[0]?.id || null);
  }

  return <div className="space-y-5">
    <SectionHeader title="Equipe e operação" subtitle="Monte times, convide pessoas e defina como cada conversa deve ser distribuída." action={<Link href="/cliente/painel/configuracoes" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"><ArrowLeft className="h-3.5 w-3.5" />Voltar</Link>} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
    <section className="grid gap-3 sm:grid-cols-3">{[{ label: "Pessoas ativas", value: stats.active, hint: "com acesso à operação" }, { label: "Disponíveis agora", value: stats.online, hint: "aptas para receber conversas" }, { label: "Capacidade declarada", value: stats.capacity, hint: "conversas simultâneas" }].map((item) => <div key={item.label} className="rounded-2xl border border-[var(--cliente-border)] bg-white p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--cliente-card-text-soft)]">{item.label}</p><p className="mt-2 text-3xl font-black text-[var(--cliente-card-text)]">{item.value}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.hint}</p></div>)}</section>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Central de operação</p><h2 className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">Times e pessoas no mesmo lugar</h2></div>{canManage && canManageUsers && <button type="button" onClick={() => setComposerOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"><Plus className="h-4 w-4" />Novo time e pessoas</button>}</div>
    <section className="grid gap-4 xl:grid-cols-[minmax(300px,.75fr)_minmax(0,1.25fr)]">
      <PanelCard className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[var(--cliente-card-text)]">Times</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Escolha um time para administrar.</p></div><UsersRound className="h-5 w-5 text-indigo-600" /></div>{loading ? <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : <div className="mt-4 space-y-2">{teams.map((team) => { const count = members.filter((member) => member.team === team.id).length; return <button type="button" key={team.id} onClick={() => setSelectedId(team.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === team.id ? "border-indigo-300 bg-indigo-50 shadow-sm" : "border-[var(--cliente-border)] bg-white hover:bg-[var(--cliente-surface-muted)]"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-bold text-[var(--cliente-card-text)]">{team.name}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{team.description || "Sem objetivo definido"}</p></div>{team.id === defaultTeam && <StateBadge label="Padrão" tone="info" />}</div><div className="mt-3 flex flex-wrap gap-2"><StateBadge label={`${count} ${count === 1 ? "pessoa" : "pessoas"}`} tone="neutral" />{team.channels.slice(0, 3).map((channel) => <span key={channel} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[var(--cliente-card-text-soft)]">{CHANNELS.find((item) => item.id === channel)?.label || channel}</span>)}</div></button>})}{!teams.length && <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-5 text-sm text-indigo-800">Crie o primeiro time para começar a distribuir conversas.</div>}</div>}</PanelCard>
      <PanelCard className="p-5">{selected ? <form onSubmit={saveTeams} className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-indigo-600">Time selecionado</p><h3 className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">{selected.name}</h3><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Ajuste identidade, canais e pessoas sem sair desta tela.</p></div>{canManage && <button type="button" onClick={removeSelectedTeam} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Remover</button>}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nome do time" value={selected.name} disabled={!canManage} onChange={(value) => changeTeam({ name: value })} /><Field label="Objetivo" value={selected.description || ""} disabled={!canManage} onChange={(value) => changeTeam({ description: value })} /></div><label className="block space-y-1.5"><span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Time padrão para novas conversas</span><select value={defaultTeam} disabled={!canManage} onChange={(event) => setDefaultTeam(event.target.value)} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm"><option value="">Não definir</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><div><p className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Canais atendidos</p><div className="mt-2 flex flex-wrap gap-2">{CHANNELS.map((channel) => { const active = selected.channels.includes(channel.id); return <button type="button" key={channel.id} disabled={!canManage} onClick={() => changeTeam({ channels: toggle(selected.channels, channel.id) })} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-[var(--cliente-border)] bg-white text-[var(--cliente-card-text-soft)]"}`}>{active && <Check className="mr-1 inline h-3 w-3" />}{channel.label}</button>})}</div></div><div className="border-t border-[var(--cliente-border)] pt-5"><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-[var(--cliente-card-text)]">Pessoas deste time</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Disponibilidade e capacidade de atendimento.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{selectedMembers.length}</span></div><div className="mt-3 space-y-3">{selectedMembers.map((member) => { const index = members.findIndex((item) => item.userId === member.userId); const locked = !canManageUsers || member.role === "client_owner"; return <div key={member.userId || member.email} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{member.name || "Sem nome"}</p><p className="truncate text-xs text-[var(--cliente-card-text-soft)]">{member.email}</p></div><StateBadge label={member.role === "client_owner" ? "Dono" : inferClientAccessProfile(member).label} tone="info" /></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><select disabled={locked} value={member.availability || "online"} onChange={(event) => changeMember(index, { availability: event.target.value })} className="rounded-xl border border-[var(--cliente-border)] bg-white px-2.5 py-2 text-xs"><option value="online">Disponível</option><option value="busy">Ocupado</option><option value="offline">Fora da escala</option></select><input disabled={locked} type="number" min={1} max={200} value={member.maxOpenChats ?? ""} placeholder="Capacidade" onChange={(event) => changeMember(index, { maxOpenChats: event.target.value ? Number(event.target.value) : null })} className="rounded-xl border border-[var(--cliente-border)] bg-white px-2.5 py-2 text-xs" /><button type="button" disabled={locked} onClick={() => void saveMember(member).then(() => setNotice("Pessoa atualizada.")).catch((e) => setError(e instanceof Error ? e.message : "Falha ao salvar pessoa."))} className="inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-white px-2.5 py-2 text-xs font-bold text-indigo-700"><Save className="h-3.5 w-3.5" />Salvar</button></div></div>})}{!selectedMembers.length && <p className="rounded-xl border border-dashed border-[var(--cliente-border)] p-4 text-sm text-[var(--cliente-card-text-soft)]">Nenhuma pessoa vinculada a este time ainda.</p>}</div></div>{canManage && <div className="flex justify-end border-t border-[var(--cliente-border)] pt-4"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Salvando" : "Salvar time"}</button></div>}</form> : <EmptyState onCreate={() => setComposerOpen(true)} canCreate={canManage && canManageUsers} />}</PanelCard>
    </section>
    {(missingTeams.length || stats.withoutTeam) ? <PanelCard className="border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-900">Atenção à cobertura da operação</p><p className="mt-1 text-sm text-amber-800">{stats.withoutTeam ? `${stats.withoutTeam} pessoa(s) ainda estão sem time. ` : ""}{missingTeams.length ? `Há referências de ${missingTeams.join(", ")} sem configuração formal.` : ""}</p></PanelCard> : null}
    {canManageUsers && <div className="flex justify-end"><button type="button" onClick={() => void savePeople()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text-muted)] disabled:opacity-60"><Save className="h-4 w-4" />Salvar alterações das pessoas</button></div>}
    {composerOpen && <Composer draftTeam={draftTeam} setDraftTeam={setDraftTeam} people={draftPeople} setPeople={setDraftPeople} saving={composerSaving} onClose={() => setComposerOpen(false)} onSubmit={createWorkspace} />}
  </div>;
}

function EmptyState({ onCreate, canCreate }: { onCreate: () => void; canCreate: boolean }) { return <div className="grid min-h-[420px] place-items-center text-center"><div><UsersRound className="mx-auto h-10 w-10 text-indigo-300" /><h3 className="mt-3 text-lg font-bold text-[var(--cliente-card-text)]">Sua operação começa aqui</h3><p className="mx-auto mt-1 max-w-sm text-sm text-[var(--cliente-card-text-muted)]">Crie um time e convide as pessoas que vão atender seus clientes.</p>{canCreate && <button type="button" onClick={onCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Criar primeiro time</button>}</div></div>; }

function Composer({ draftTeam, setDraftTeam, people, setPeople, saving, onClose, onSubmit }: { draftTeam: { name: string; description: string; channels: string[] }; setDraftTeam: React.Dispatch<React.SetStateAction<{ name: string; description: string; channels: string[] }>>; people: DraftPerson[]; setPeople: React.Dispatch<React.SetStateAction<DraftPerson[]>>; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const update = (index: number, patch: Partial<DraftPerson>) => setPeople((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">Nova operação</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Crie o time e convide as pessoas</h2><p className="mt-1 text-sm text-slate-600">Tudo será salvo junto e cada convite já ficará ligado ao time.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><form onSubmit={onSubmit} className="mt-6 space-y-6"><div className="grid gap-3 sm:grid-cols-2"><Field label="Nome do time" value={draftTeam.name} onChange={(value) => setDraftTeam((current) => ({ ...current, name: value }))} /><Field label="Objetivo do time" value={draftTeam.description} onChange={(value) => setDraftTeam((current) => ({ ...current, description: value }))} /></div><div><p className="text-xs font-bold text-slate-600">Canais da fila</p><div className="mt-2 flex flex-wrap gap-2">{CHANNELS.map((channel) => <button type="button" key={channel.id} onClick={() => setDraftTeam((current) => ({ ...current, channels: current.channels.includes(channel.id) ? current.channels.filter((item) => item !== channel.id) : [...current.channels, channel.id] }))} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${draftTeam.channels.includes(channel.id) ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}>{channel.label}</button>)}</div></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-900">Pessoas do time</p><p className="mt-1 text-xs text-slate-500">Adicione vendedores, gestores ou atendimento antes de concluir.</p></div><button type="button" onClick={() => setPeople((current) => [...current, blankPerson()])} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700"><UserPlus className="h-4 w-4" />Adicionar pessoa</button></div><div className="mt-4 space-y-3">{people.map((person, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3"><div className="grid gap-2 sm:grid-cols-2"><Field label="Nome" value={person.name} onChange={(value) => update(index, { name: value })} /><Field label="E-mail de acesso" value={person.email} onChange={(value) => update(index, { email: value })} /></div><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]"><label className="block space-y-1"><span className="text-[11px] font-bold text-slate-500">Perfil</span><select value={person.accessProfile} onChange={(event) => update(index, { accessProfile: event.target.value as ClientAccessProfileId })} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs"><option value="seller">Vendedor</option>{CLIENT_ACCESS_PROFILES.filter((profile) => ["manager", "support", "analyst"].includes(profile.id)).map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label><label className="block space-y-1"><span className="text-[11px] font-bold text-slate-500">Capacidade</span><input type="number" min={1} max={200} value={person.maxOpenChats} onChange={(event) => update(index, { maxOpenChats: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs" /></label>{people.length > 1 && <button type="button" onClick={() => setPeople((current) => current.filter((_, i) => i !== index))} className="self-end rounded-xl p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div></div><div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{saving ? "Criando operação" : "Criar time e enviar convites"}</button></div></form></div></div>;
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <label className="block space-y-1.5"><span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">{label}</span><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[var(--cliente-border)] bg-white px-3 py-2.5 text-sm text-[var(--cliente-card-text)] outline-none placeholder:text-slate-400 focus:border-indigo-300 disabled:bg-[var(--cliente-surface-muted)] disabled:opacity-60" /></label>; }
